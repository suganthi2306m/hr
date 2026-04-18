const crypto = require('crypto');
const Admin = require('../models/Admin');
const PasswordResetOtp = require('../models/PasswordResetOtp');
const { signToken } = require('../services/jwtService');
const { sendPasswordResetOtp: sendOtpEmail } = require('../services/emailService');

const OTP_EXPIRES_MS = 15 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 6;

function hashOtp(email, otp) {
  const secret = process.env.JWT_SECRET || 'livetrack-secret';
  return crypto.createHmac('sha256', secret).update(`${email}:${otp}`).digest('hex');
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const admin = await Admin.findOne({ email: normalizedEmail });
    if (!admin || !(await admin.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if (admin.isActive === false) {
      return res.status(403).json({ message: 'Account is inactive. Please contact support.' });
    }

    const token = signToken(admin);
    return res.json({
      token,
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        isActive: admin.isActive,
        companySetupCompleted: admin.companySetupCompleted,
      },
    });
  } catch (error) {
    return next(error);
  }
}

function me(req, res) {
  res.json({ admin: req.admin });
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = await Admin.findById(req.admin._id);
    if (!(await admin.comparePassword(currentPassword))) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    admin.password = newPassword;
    await admin.save();
    return res.json({ message: 'Password changed successfully' });
  } catch (error) {
    return next(error);
  }
}

const forgotResponse = {
  message: 'If an account exists for this email, a reset code was sent.',
};

async function requestPasswordOtp(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.json(forgotResponse);
    }

    await PasswordResetOtp.deleteMany({ email });
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + OTP_EXPIRES_MS);
    await PasswordResetOtp.create({
      email,
      codeHash: hashOtp(email, otp),
      expiresAt,
    });
    await sendOtpEmail({ to: email, otp });
    return res.json(forgotResponse);
  } catch (error) {
    return next(error);
  }
}

async function resetPasswordWithOtp(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const otp = String(req.body.otp || '').replace(/\s/g, '');
    const { newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Email, code and new password are required' });
    }
    if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const record = await PasswordResetOtp.findOne({
      email,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!record || record.codeHash !== hashOtp(email, otp)) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      await PasswordResetOtp.deleteMany({ email });
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    admin.password = newPassword;
    await admin.save();
    await PasswordResetOtp.deleteMany({ email });
    return res.json({ message: 'Password reset successfully. You can sign in now.' });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  login,
  me,
  changePassword,
  requestPasswordOtp,
  resetPasswordWithOtp,
};
