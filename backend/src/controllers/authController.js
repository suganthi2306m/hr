const User = require('../models/User');
const Company = require('../models/Company');
const TaskSettings = require('../models/TaskSettings');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const { sendOTPEmail } = require('../services/emailService');
const cloudinary = require('cloudinary').v2;
const digitalOceanService = require('../services/digitalOceanService');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'secret', {
        expiresIn: '30d',
    });
};

// Helper to safely build case-insensitive regex
const buildEmailRegex = (email) => {
    const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}$`, 'i');
};

const getRoleIdValue = (user) => {
    const roleId = user?.roleId;
    if (!roleId) return null;
    if (typeof roleId === 'object' && roleId._id) return roleId._id;
    return roleId;
};

const populateRoleIfPresent = async (user) => {
    if (!user) return user;

    const roleId = getRoleIdValue(user);
    if (!roleId || !mongoose.isValidObjectId(roleId)) {
        return user;
    }

    try {
        return await user.populate('roleId');
    } catch (err) {
        console.warn('[Auth] roleId populate skipped:', err?.message);
        return user;
    }
};

// Helper to find user by email in current User model only
const findOrCreateUserByEmail = async (rawEmail) => {
    if (!rawEmail) return null;

    const email = rawEmail.trim();
    const normalizedEmail = email.toLowerCase();

    // 1. Exact / normalized match
    let user = await User.findOne({ email: normalizedEmail });

    // 2. Case-insensitive regex fallback
    if (!user) {
        user = await User.findOne({ email: buildEmailRegex(email) });
    }

    if (user) {
        return user;
    }

    return null;
};

const login = async (req, res) => {
    try {
        const { email, password, otp } = req.body;

        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: { message: 'Email and password are required' } 
            });
        }

        // Normalize email for lookup; use case-insensitive match so DB "Boominathanaskeva@..." matches "boominathanaskeva@..."
        const emailNorm = (email || '').trim().toLowerCase();
        const emailRegex = buildEmailRegex(emailNorm);

        let user = await User.findOne({ email: emailRegex }).select('+password');
        user = await populateRoleIfPresent(user);
        const staff = null;

        if (!user) {
            return res.status(401).json({ success: false, error: { message: 'User record not found' } });
        }

        if (!user) {
            return res.status(401).json({ success: false, error: { message: 'Invalid credentials' } });
        }
        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                error: { message: 'Account is inactive' }
            });
        }
        if (!user.password) {
            return res.status(401).json({ success: false, error: { message: 'Password not set for this account' } });
        }
        const passwordMatch = await user.matchPassword(password);
        if (!passwordMatch) {
            return res.status(401).json({ success: false, error: { message: 'Invalid credentials' } });
        }

        // Prevent candidates from logging in
        if (user.role && user.role.toLowerCase() === 'candidate') {
            return res.status(401).json({ success: false, error: { message: 'login credentials not matching' } });
        }

        // ── Two-Factor Authentication ──────────────────────────────────────────
        if (user.twoFactorEnabled === true) {
            if (!otp) {
                // No OTP yet — generate one, save it, send email, ask the client to prompt for OTP
                const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
                const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

                // Load user with select to allow setting extra fields
                const userForOtp = await User.findById(user._id);
                userForOtp.loginOTP = generatedOtp;
                userForOtp.loginOTPExpiry = otpExpiry;
                await userForOtp.save();

                console.log(`[2FA] OTP generated for ${emailNorm}: ${generatedOtp}`);

                // Send 2FA OTP email
                try {
                    await sendOTPEmail(user.email, generatedOtp, 'two-factor-login');
                } catch (emailErr) {
                    console.error('[2FA] Failed to send OTP email:', emailErr.message);
                    // Continue — return requiresOTP even if email fails (logged above)
                }

                return res.json({
                    success: true,
                    requiresOTP: true,
                    message: 'OTP has been sent to your registered email. Please enter the OTP to complete login.'
                });
            }

            // OTP was provided — verify it
            const userForVerify = await User.findById(user._id);
            if (!userForVerify.loginOTP || !userForVerify.loginOTPExpiry) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'No OTP found. Please try logging in again.' }
                });
            }
            if (userForVerify.loginOTP !== otp.toString()) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Invalid OTP. Please check the code sent to your email.' }
                });
            }
            if (new Date() > userForVerify.loginOTPExpiry) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'OTP has expired. Please try logging in again.' }
                });
            }

            // OTP is valid — clear it so it cannot be reused
            userForVerify.loginOTP = undefined;
            userForVerify.loginOTPExpiry = undefined;
            await userForVerify.save();

            console.log(`[2FA] OTP verified successfully for ${emailNorm}`);
        }
        // ──────────────────────────────────────────────────────────────────────

        // Generate Token
        // Use consistent secret with middleware
        const secret = process.env.JWT_SECRET || 'secret';
        const accessToken = jwt.sign({ id: user._id }, secret, { expiresIn: '30d' });

        // Prepare Response
        let company = user.companyId;
        const formattedPermissions = user.roleId?.permissions || [];
        const businessId = company?._id || company;

        // businessId comes from staffs collection (staff.businessId)
        // Fetch task settings for staff's businessId (enableOtpVerification, autoApprove, etc.)
        let taskSettings = null;
        try {
            if (businessId) {
                const bid = businessId._id ?? businessId;
                taskSettings = await TaskSettings.findOne({
                    $or: [{ companyId: bid }, { businessId: bid }],
                }).lean();
            }
            if (!taskSettings && !businessId) {
                taskSettings = await TaskSettings.findOne().lean();
            }
        } catch (e) {
            console.warn('[Auth] TaskSettings fetch failed:', e?.message);
        }

        const userResponse = {
            id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            phone: user.phone,
            companyId: company?._id || company,
            companyName: company && company.name ? company.name : undefined,
            businessId: businessId || company?._id || company,
            permissions: formattedPermissions,
            staffId: null,
            avatar: user.avatar,
            locationAccess: false,
            taskSettings: taskSettings?.settings || null,
            branchName: undefined,
        };

        // Create a refresh token (if needed by frontend, though Flutter usually uses access token for now)
        // For parity with Web Backend, we can generate one
        const refreshToken = jwt.sign({ id: user._id }, secret, { expiresIn: '7d' });

        // Set refresh token as httpOnly cookie (standard practice from Web Backend)
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/'
        });

        res.json({
            success: true,
            data: {
                user: userResponse,
                accessToken,
                refreshToken // Send it in body too for Mobile App storage if needed
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: { message: error.message } });
    }
};

const googleLogin = async (req, res) => {
    try {
        const { email } = req.body;

        let user = await User.findOne({ email: buildEmailRegex((email || '').trim()) });
        user = await populateRoleIfPresent(user);

        if (!user) {
            return res.status(401).json({ success: false, error: { message: 'User not registered. Please sign up first.' } });
        }

        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                error: { message: 'Account is inactive' }
            });
        }

        // Prevent candidates from logging in
        if (user.role && user.role.toLowerCase() === 'candidate') {
            return res.status(401).json({ success: false, error: { message: 'login credentials not matching' } });
        }

        const accessToken = generateToken(user._id);

        let company = user.companyId;
        const formattedPermissions = user.roleId?.permissions || [];
        const businessId = company?._id || company;

        let taskSettings = null;
        try {
            if (businessId) {
                const bid = businessId._id ?? businessId;
                taskSettings = await TaskSettings.findOne({
                    $or: [{ companyId: bid }, { businessId: bid }],
                }).lean();
            }
            if (!taskSettings && !businessId) {
                taskSettings = await TaskSettings.findOne().lean();
            }
        } catch (e) {
            console.warn('[Auth] TaskSettings fetch failed (google):', e?.message);
        }

        const userResponse = {
            id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            phone: user.phone,
            companyId: company?._id || company,
            companyName: company && company.name ? company.name : undefined,
            businessId: businessId || company?._id || company,
            permissions: formattedPermissions,
            staffId: null,
            avatar: user.avatar,
            locationAccess: false,
            taskSettings: taskSettings?.settings || null,
            branchName: undefined,
        };

        res.json({
            success: true,
            data: {
                user: userResponse,
                accessToken
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: { message: error.message } });
    }
};

const register = async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ success: false, error: { message: 'User already exists' } });

        const user = await User.create({ name, email, password });
        if (user) {
            const accessToken = generateToken(user._id);
            res.status(201).json({
                success: true,
                data: {
                    user: {
                        id: user._id,
                        name: user.name,
                        email: user.email
                    },
                    accessToken
                }
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: { message: error.message } });
    }
};

const getProfile = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(404).json({ success: false, error: { message: 'User not found' } });
        }

        let fullUser = await User.findById(user._id);
        fullUser = await populateRoleIfPresent(fullUser);

        res.status(200).json({
            success: true,
            data: {
                profile: {
                    name: fullUser.name,
                    email: fullUser.email,
                    phone: fullUser.phone,
                    avatar: fullUser.avatar,
                    role: fullUser.role
                },
                branchName: null,
                staffData: null
            }
        });

    } catch (error) {
        console.error('getProfile Error:', error);
        res.status(500).json({ success: false, error: { message: error.message } });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { name, phone } = req.body;
        const userId = req.user._id;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, error: { message: 'User not found' } });

        if (name) user.name = name;
        if (phone) user.phone = phone;
        // Support avatar delete: when avatar/photoUrl key is present, update (including clearing to empty)
        if ('avatar' in req.body || 'photoUrl' in req.body) {
            const avatarVal = req.body.avatar ?? req.body.photoUrl ?? null;
            user.avatar = (avatarVal && String(avatarVal).trim()) ? avatarVal : null;
        }

        await user.save();

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    phone: user.phone,
                    avatar: user.avatar
                }
            }
        });

    } catch (error) {
        console.error('updateProfile Error:', error);
        res.status(500).json({ success: false, error: { message: error.message } });
    }
};

// -------------------------------
// Password reset with OTP flow
// -------------------------------

// Phase 1: Request OTP
const forgotPassword = async (req, res) => {
    console.log(`[ForgotPassword] Route handler called - Method: ${req.method}, Path: ${req.path}, OriginalUrl: ${req.originalUrl}`);
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: { message: 'Email is required' }
            });
        }

        const emailRegex = buildEmailRegex(email.trim());
        const user = await User.findOne({ email: emailRegex });
        if (!user) {
            console.log(`[ForgotPassword] ❌ Email not found in User collection: ${email}`);
            return res.status(404).json({
                success: false,
                error: { message: 'No registered account with this email' }
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        console.log(`[ForgotPassword] Generating OTP for email: ${email}`);
        console.log(`[ForgotPassword] OTP: ${otp} (expires at: ${expiry.toISOString()})`);

        user.resetPasswordOTP = otp;
        user.resetPasswordOTPExpiry = expiry;
        await user.save();

        console.log(`[ForgotPassword] OTP saved to database for user: ${user._id}`);

        // Send OTP to normalized email (trim + lowercase) to avoid provider issues with casing/spaces for "some" recipients
        const emailToSend = (user.email || email).trim().toLowerCase();
        if (!emailToSend || !emailToSend.includes('@')) {
            console.error(`[ForgotPassword] ❌ Invalid email to send: ${emailToSend ? '(invalid format)' : '(empty)'}`);
            return res.status(200).json({
                success: false,
                message: 'We couldn\'t deliver the OTP to your email. Please try again later or contact your administrator.'
            });
        }
        console.log(`[ForgotPassword] Sending OTP email to: ${emailToSend}`);
        const emailResult = await sendOTPEmail(emailToSend, otp);

        if (!emailResult.success) {
            console.error(`[ForgotPassword] ❌ Failed to send OTP email: ${emailResult.error}`);
            return res.status(200).json({
                success: false,
                message: 'We couldn\'t deliver the OTP to your email. Please try again later or contact your administrator to check email configuration.'
            });
        }

        console.log(`[ForgotPassword] ✅ OTP email sent successfully to ${emailToSend}`);
        console.log(`[ForgotPassword] Email Message ID: ${emailResult.messageId}`);

        return res.status(200).json({
            success: true,
            message: 'OTP has been sent to your registered email address'
        });
    } catch (error) {
        console.error('forgotPassword Error:', error);
        return res.status(500).json({
            success: false,
            error: { message: error.message }
        });
    }
};

// Phase 2: Verify OTP
const verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        console.log(`[VerifyOTP] Verifying OTP for email: ${email}`);

        if (!email || !otp) {
            console.log(`[VerifyOTP] ❌ Missing email or OTP`);
            return res.status(400).json({
                success: false,
                error: { message: 'Email and OTP are required' }
            });
        }

        const emailRegex = buildEmailRegex(email.trim());
        const user = await User.findOne({ email: emailRegex });
        if (!user) {
            console.log(`[VerifyOTP] ❌ Email not found in User collection: ${email}`);
            return res.status(404).json({
                success: false,
                error: { message: 'No registered account with this email' }
            });
        }

        if (!user || !user.resetPasswordOTP || !user.resetPasswordOTPExpiry) {
            console.log(`[VerifyOTP] ❌ No OTP found for email: ${email}`);
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid or expired OTP' }
            });
        }

        console.log(`[VerifyOTP] Stored OTP: ${user.resetPasswordOTP}, Provided OTP: ${otp}`);
        console.log(`[VerifyOTP] OTP expires at: ${user.resetPasswordOTPExpiry.toISOString()}`);

        if (user.resetPasswordOTP !== otp) {
            console.log(`[VerifyOTP] ❌ OTP mismatch`);
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid OTP' }
            });
        }

        if (new Date() > user.resetPasswordOTPExpiry) {
            console.log(`[VerifyOTP] ❌ OTP expired`);
            return res.status(400).json({
                success: false,
                error: { message: 'OTP has expired' }
            });
        }

        console.log(`[VerifyOTP] ✅ OTP verified successfully for ${email}`);

        return res.status(200).json({
            success: true,
            message: 'OTP verified successfully'
        });
    } catch (error) {
        console.error('verifyOTP Error:', error);
        return res.status(500).json({
            success: false,
            error: { message: error.message }
        });
    }
};

// Phase 3: Reset password
const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(400).json({
                success: false,
                error: { message: 'Email, OTP and new password are required' }
            });
        }

        const emailRegex = buildEmailRegex(email.trim());
        const user = await User.findOne({ email: emailRegex });
        if (!user) {
            console.log(`[ResetPassword] ❌ Email not found in User collection: ${email}`);
            return res.status(404).json({
                success: false,
                error: { message: 'No registered account with this email' }
            });
        }

        if (!user || !user.resetPasswordOTP || !user.resetPasswordOTPExpiry) {
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid or expired OTP' }
            });
        }

        if (user.resetPasswordOTP !== otp) {
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid OTP' }
            });
        }

        if (new Date() > user.resetPasswordOTPExpiry) {
            return res.status(400).json({
                success: false,
                error: { message: 'OTP has expired' }
            });
        }

        user.password = newPassword; // Will be hashed by pre-save hook
        user.resetPasswordOTP = undefined;
        user.resetPasswordOTPExpiry = undefined;
        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Password has been reset successfully'
        });
    } catch (error) {
        console.error('resetPassword Error:', error);
        return res.status(500).json({
            success: false,
            error: { message: error.message }
        });
    }
};

// -------------------------------
// Change password (old + new)
// -------------------------------

const changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: { message: 'Old password and new password are required' }
            });
        }

        if (oldPassword === newPassword) {
            return res.status(400).json({
                success: false,
                error: { message: 'New password must be different from old password' }
            });
        }

        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: { message: 'Not authenticated' }
            });
        }

        // Load user with password field
        const user = await User.findById(userId).select('+password');
        if (!user || !user.password) {
            return res.status(404).json({
                success: false,
                error: { message: 'User not found or password not set' }
            });
        }

        const isMatch = await user.matchPassword(oldPassword);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: { message: 'Old password is incorrect' }
            });
        }

        user.password = newPassword; // pre-save hook will hash
        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Password updated successfully'
        });
    } catch (error) {
        console.error('changePassword Error:', error);
        return res.status(500).json({
            success: false,
            error: { message: error.message }
        });
    }
};

// -------------------------------
// Update profile photo (Digital Ocean S3)
// -------------------------------

const updateProfilePhoto = async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({
                success: false,
                error: { message: 'No file uploaded' }
            });
        }

        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: { message: 'Not authenticated' }
            });
        }

        const employeeName = req.user?.name;

        const uploadResult = await digitalOceanService.uploadImage(req.file.buffer, undefined, {
            req,
            employeeName,
            category: 'employees',
            subfolder: 'avatar',
            format: req.file.mimetype?.includes('png') ? 'png' : 'jpg',
        });

        if (!uploadResult.success) {
            return res.status(500).json({
                success: false,
                error: { message: uploadResult.error || 'Failed to upload profile photo' }
            });
        }

        const photoUrl = uploadResult.url;

        // Update User avatar
        const user = await User.findById(userId);
        if (user) {
            user.avatar = photoUrl;
            await user.save();
        }

        return res.status(200).json({
            success: true,
            message: 'Profile photo updated successfully',
            data: { photoUrl }
        });
    } catch (error) {
        console.error('updateProfilePhoto Error:', error);
        return res.status(500).json({
            success: false,
            error: { message: error.message }
        });
    }
};

// -------------------------------
// Verify face (selfie vs profile photo)
// -------------------------------
const verifyFace = async (req, res) => {
    try {
        const { selfie } = req.body || {};
        if (!selfie || typeof selfie !== 'string') {
            return res.status(400).json({
                success: false,
                match: false,
                error: { message: 'Selfie image (base64 data URL) is required.' }
            });
        }

        const user = req.user;
        // Always fetch latest avatar from DB so face matching uses only the current profile photo
        // (after user updates photo in profile, this returns the new URL; no cache)
        const fullUser = await User.findById(user._id).select('avatar').lean();
        const profilePhotoUrl = fullUser?.avatar;

        if (!profilePhotoUrl || !profilePhotoUrl.startsWith('http')) {
            return res.status(200).json({
                success: true,
                match: false,
                message: 'No profile photo uploaded. Please upload a profile photo first.'
            });
        }

        let selfiePath = null;
        let profilePath = null;
        const tmpDir = os.tmpdir();

        try {
            const base64Match = selfie.match(/^data:image\/\w+;base64,(.+)$/);
            const base64Data = base64Match ? base64Match[1] : selfie;
            const buf = Buffer.from(base64Data, 'base64');
            selfiePath = path.join(tmpDir, `selfie_${Date.now()}.jpg`);
            await fs.writeFile(selfiePath, buf);

            profilePath = path.join(tmpDir, `profile_${Date.now()}.jpg`);
            await new Promise((resolve, reject) => {
                const url = new URL(profilePhotoUrl);
                const client = url.protocol === 'https:' ? https : http;
                const req = client.get(profilePhotoUrl, (resp) => {
                    if (resp.statusCode !== 200) {
                        reject(new Error(`Profile photo fetch failed: ${resp.statusCode}`));
                        return;
                    }
                    const chunks = [];
                    resp.on('data', (c) => chunks.push(c));
                    resp.on('end', () => {
                        fs.writeFile(profilePath, Buffer.concat(chunks))
                            .then(resolve)
                            .catch(reject);
                    });
                });
                req.on('error', reject);
                req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
            });
        } catch (e) {
            try {
                if (selfiePath) await fs.unlink(selfiePath).catch(() => {});
                if (profilePath) await fs.unlink(profilePath).catch(() => {});
            } catch (_) {}
            return res.status(200).json({
                success: true,
                match: false,
                message: 'Could not prepare images for verification.'
            });
        }

        const scriptDir = path.join(__dirname, '../../face_verify');
        const scriptPath = path.join(scriptDir, 'face_verify.py');
        const venvPythonWin = path.join(scriptDir, 'venv', 'Scripts', 'python.exe');
        const venvPythonUnix = path.join(scriptDir, 'venv', 'bin', 'python');
        const venvPython = process.platform === 'win32' ? venvPythonWin : venvPythonUnix;
        const py = require('fs').existsSync(venvPython) ? venvPython : (process.platform === 'win32' ? 'python' : 'python3');

        const result = await new Promise((resolve) => {
            const child = spawn(py, [scriptPath, selfiePath, profilePath], {
                cwd: scriptDir,
                timeout: 90000
            });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (d) => { stdout += d.toString(); });
            child.stderr.on('data', (d) => { stderr += d.toString(); });
            child.on('error', () => resolve({ match: false, error: 'Face verification not available' }));
            child.on('close', (code) => {
                try {
                    const out = JSON.parse(stdout.trim() || '{}');
                    resolve({ match: !!out.match, error: out.error || null });
                } catch {
                    resolve({ match: false, error: stderr || 'Verification failed' });
                }
            });
        });

        try {
            if (selfiePath) await fs.unlink(selfiePath).catch(() => {});
            if (profilePath) await fs.unlink(profilePath).catch(() => {});
        } catch (_) {}

        // Map backend/script errors to clear user-facing message (no raw exceptions in app)
        const userMessage = result.match ? 'Photo matched' : toUserFriendlyVerifyMessage(result.error);

        return res.status(200).json({
            success: true,
            match: !!result.match,
            message: userMessage
        });
    } catch (error) {
        console.error('verifyFace Error:', error);
        return res.status(500).json({
            success: false,
            match: false,
            error: { message: 'Face verification failed. Please try again.' }
        });
    }
};

function toUserFriendlyVerifyMessage(raw) {
    if (!raw || typeof raw !== 'string') return 'Face not matching. Please try again.';
    const s = raw.toLowerCase();
    if (s.includes('no face') || s.includes('face could not be detected')) return 'No face detected. Please ensure your face is clearly visible.';
    if (s.includes('no profile') || s.includes('upload a profile')) return 'Please upload a profile photo first.';
    if (s.includes('not available') || s.includes('verification failed') || s.includes('exception') || s.includes('error')) return 'Face verification failed. Please try again.';
    if (s.includes('prepare images') || s.includes('could not')) return 'Could not verify. Please try again.';
    return 'Face not matching. Please try again.';
}

/**
 * GET /auth/check-active (protected)
 * Returns { active: boolean } for current staff. Used by app to poll every 5s; if active is false (deactivated), app logs out silently.
 */
const checkActive = async (req, res) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({ success: false, active: false });
        }
        const user = await User.findById(userId).select('isActive').lean();
        const active = !!user && user.isActive !== false;
        return res.json({ success: true, active: !!active });
    } catch (err) {
        console.error('[authController] checkActive:', err.message);
        return res.status(500).json({ success: false, active: false });
    }
};

module.exports = {
    login,
    googleLogin,
    register,
    getProfile,
    updateProfile,
    forgotPassword,
    verifyOTP,
    resetPassword,
    changePassword,
    updateProfilePhoto,
    verifyFace,
    checkActive
};
