const crypto = require('crypto');
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Company = require('../models/Company');
const License = require('../models/License');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const PaymentTransaction = require('../models/PaymentTransaction');
const PasswordResetOtp = require('../models/PasswordResetOtp');
const { signToken } = require('../services/jwtService');
const { sendPasswordResetOtp: sendOtpEmail } = require('../services/emailService');
const { createRazorpayPaymentLink } = require('../services/razorpayService');
const { createPaysharpCheckout, fetchPaysharpUpiOrderStatus } = require('../services/paysharpService');
const { getRazorpayConfig, getPaysharpConfig } = require('../services/platformGatewayConfig');
const { resolveDefaultCatalogOwnerAdmin, getPreferredSuperAdminEmail } = require('../services/superAdminOwnerResolver');
const { generateUniqueLicenseKey } = require('../services/licenseKeyService');
const { applyCapturedSubscriptionPayment } = require('../services/subscriptionEntitlementService');
const { normalizeEmail, assertCompanyEmailPhoneUnique, assertAdminEmailAvailable } = require('../utils/contactUniqueness');

const OTP_EXPIRES_MS = 15 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 6;

function hashOtp(email, otp) {
  const secret = process.env.JWT_SECRET || 'livetrack-secret';
  return crypto.createHmac('sha256', secret).update(`${email}:${otp}`).digest('hex');
}

function randomTemporaryPassword() {
  return `tmp_${crypto.randomBytes(18).toString('hex')}`;
}

function responseAdmin(admin) {
  return {
    _id: admin._id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    isActive: admin.isActive,
    companySetupCompleted: admin.companySetupCompleted,
  };
}

function buildCheckoutInitiateJson({
  pay,
  plan,
  dm,
  amountPaise,
  gatewayAmountPaise,
  gateway,
  checkoutUrl,
  paymentIntentId,
}) {
  const amountRupees = Math.max(0, Math.round(Number(amountPaise) / 100));
  const gatewayRupees = Math.max(0, Math.round(Number(gatewayAmountPaise) / 100));
  return {
    paymentId: pay._id,
    gateway,
    planId: plan._id,
    planName: plan.name,
    durationMonths: dm,
    amount: amountRupees,
    gatewayAmount: gatewayRupees,
    currency: 'INR',
    checkoutUrl,
    qrImageUrl: null,
    paymentIntentId,
    status: 'pending',
    message: null,
    gatewayOrderId: paymentIntentId,
    amountPaise: gatewayAmountPaise,
  };
}

function computeAmountPaise(plan, durationMonths) {
  const planMonths = Math.max(1, Number(plan.durationMonths) || 12);
  const dm = Math.max(1, Math.min(120, Number(durationMonths) || planMonths));
  const periods = dm / planMonths;
  const amountRupees = (Number(plan.priceInr) || 0) * periods;
  let amountPaise = Math.round(amountRupees * 100);
  const testPaise = Number(process.env.PAYMENT_TEST_AMOUNT_PAISE || 0);
  if (testPaise > 0) amountPaise = Math.round(testPaise);
  return { amountPaise, dm };
}

async function getPrimaryCatalogOwnerAdmin() {
  const owner = await resolveDefaultCatalogOwnerAdmin();
  if (!owner) {
    const err = new Error(
      `No active billing super admin found. Ensure an Admin exists with email ${getPreferredSuperAdminEmail()}, role superadmin or mainsuperadmin, and isActive true.`,
    );
    err.status = 503;
    throw err;
  }
  return owner;
}

async function ensureSelfSignupAdminAndCompany({ companyName, email, phone, catalogOwnerAdminId }) {
  let admin = await Admin.findOne({ email });
  if (admin && admin.role !== 'admin') {
    const err = new Error('This email is already used by a platform admin account.');
    err.status = 409;
    throw err;
  }

  if (!admin) {
    await assertAdminEmailAvailable(email);
    admin = await Admin.create({
      name: companyName,
      email,
      password: randomTemporaryPassword(),
      role: 'admin',
      companySetupCompleted: true,
      isActive: false,
    });
  } else if (admin.isActive) {
    const err = new Error('An account already exists for this email. Please sign in instead.');
    err.status = 409;
    throw err;
  }

  let company = await Company.findOne({ adminId: admin._id });
  if (!company) {
    await assertCompanyEmailPhoneUnique(null, email, phone);
    company = await Company.create({
      adminId: admin._id,
      createdBySuperAdminId: catalogOwnerAdminId,
      name: companyName,
      address: 'Pending profile completion',
      phone,
      email,
      city: '',
      state: '',
      branches: [],
      subscription: {
        isActive: false,
      },
    });
  } else {
    company.name = companyName;
    company.phone = phone;
    company.email = email;
    company.createdBySuperAdminId = catalogOwnerAdminId;
    await company.save();
  }

  return { admin, company };
}

async function ensureLicenseForCompany(company, plan, catalogOwnerAdminId) {
  let lic = await License.findOne({ companyId: company._id }).sort({ updatedAt: -1 });
  const now = new Date();
  if (!lic) {
    const licenseKey = await generateUniqueLicenseKey(plan);
    lic = await License.create({
      licenseKey,
      companyId: company._id,
      planId: plan._id,
      planCode: plan.planCode,
      planName: plan.name,
      maxUsers: plan.maxUsers,
      maxBranches: plan.maxBranches,
      validFrom: now,
      validUntil: now,
      status: 'suspended',
      isTrial: false,
      notes: 'Self-signup: activates after payment capture',
      createdByAdminId: catalogOwnerAdminId,
    });
  } else {
    lic.planId = plan._id;
    lic.planCode = plan.planCode;
    lic.planName = plan.name;
    lic.maxUsers = plan.maxUsers;
    lic.maxBranches = plan.maxBranches;
    lic.createdByAdminId = catalogOwnerAdminId;
    if (!lic.validUntil) lic.validUntil = now;
    await lic.save();
  }

  await Company.findByIdAndUpdate(company._id, {
    $set: {
      'subscription.planId': plan._id,
      'subscription.planCode': plan.planCode,
      'subscription.planName': plan.name,
      'subscription.maxUsers': plan.maxUsers,
      'subscription.maxBranches': plan.maxBranches,
      'subscription.licenseId': lic._id,
      'subscription.licenseKey': lic.licenseKey,
      'subscription.isActive': false,
    },
  });

  return lic;
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
    return res.json({ token, admin: responseAdmin(admin) });
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

async function listSignupPlans(_req, res, next) {
  try {
    const owner = await getPrimaryCatalogOwnerAdmin();
    const items = await SubscriptionPlan.find({ isActive: true, createdByAdminId: owner._id })
      .sort({ priceInr: 1, name: 1 })
      .lean();
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
}

async function initiateSelfSignupPayment(req, res, next) {
  try {
    const companyName = String(req.body.companyName || '').trim();
    const email = normalizeEmail(req.body.email);
    const phone = String(req.body.phone || '').trim();
    const planId = String(req.body.planId || '').trim();
    const gateway = String(req.body.gateway || '').trim().toLowerCase() === 'razorpay' ? 'razorpay' : 'paysharp';
    const durationMonths = Number(req.body.durationMonths);

    if (!companyName || !email || !phone) {
      return res.status(400).json({ message: 'Company name, email, and phone are required.' });
    }
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      return res.status(400).json({ message: 'Valid plan is required.' });
    }

    const owner = await getPrimaryCatalogOwnerAdmin();
    const plan = await SubscriptionPlan.findOne({
      _id: planId,
      isActive: true,
      createdByAdminId: owner._id,
    }).lean();
    if (!plan) return res.status(400).json({ message: 'Plan not found for default billing super admin catalog.' });

    const { admin, company } = await ensureSelfSignupAdminAndCompany({
      companyName,
      email,
      phone,
      catalogOwnerAdminId: owner._id,
    });
    const lic = await ensureLicenseForCompany(company, plan, owner._id);

    const { amountPaise, dm } = computeAmountPaise(plan, durationMonths);
    const gatewayAmount =
      gateway === 'paysharp' ? (amountPaise > 0 && amountPaise < 1000 ? 1000 : amountPaise) : Math.max(100, amountPaise);

    const pay = await PaymentTransaction.create({
      companyId: company._id,
      companyName: company.name || '',
      payerEmail: email,
      amountPaise: gatewayAmount,
      currency: 'INR',
      planId: plan._id,
      planName: plan.name,
      durationMonths: dm,
      licenseId: lic._id,
      initiatedBy: admin._id,
      billingAdminId: owner._id,
      gateway,
      method: gateway === 'razorpay' ? 'payment_link' : 'checkout',
      status: 'created',
      gatewayOrderId: '',
    });

    const gatewayOrderId = `lt_${pay._id}`.slice(0, 40);
    pay.gatewayOrderId = gatewayOrderId;
    await pay.save();

    if (gateway === 'razorpay') {
      const rz = await getRazorpayConfig({ billingAdminId: owner._id });
      if (!rz.keyId || !rz.keySecret) {
        return res.status(400).json({ message: 'Razorpay is not configured for the default billing super admin.' });
      }
      const fe = String(process.env.FRONTEND_URL || process.env.WEB_APP_URL || '').trim() || 'http://localhost:5174';
      const callbackUrl = `${fe.replace(/\/$/, '')}/login`;
      const result = await createRazorpayPaymentLink({
        keyId: rz.keyId,
        keySecret: rz.keySecret,
        amountPaise: gatewayAmount,
        currency: 'INR',
        description: `${plan.name} - ${dm} mo`,
        referenceId: gatewayOrderId,
        customerEmail: email,
        callbackUrl,
      });
      pay.gatewayPaymentId = result.id;
      pay.externalPaymentId = result.id;
      pay.gatewayPayload = { short_url: result.short_url };
      await pay.save();
      return res.status(201).json(
        buildCheckoutInitiateJson({
          pay,
          plan,
          dm,
          amountPaise,
          gatewayAmountPaise: gatewayAmount,
          gateway,
          checkoutUrl: result.short_url,
          paymentIntentId: gatewayOrderId,
        }),
      );
    }

    const paysharp = await getPaysharpConfig({ billingAdminId: owner._id });
    if (!paysharp.enabled || !paysharp.apiKey || !String(paysharp.apiBaseUrl || '').trim()) {
      return res.status(400).json({ message: 'Paysharp is not configured for the default billing super admin.' });
    }
    const result = await createPaysharpCheckout({
      apiKey: paysharp.apiKey,
      merchantId: paysharp.merchantId,
      apiBaseUrl: paysharp.apiBaseUrl,
      useSandbox: paysharp.useSandbox,
      amountPaise: gatewayAmount,
      orderId: gatewayOrderId,
      customerEmail: email,
      customerName: company.name,
      customerMobile: phone,
      customerId: String(company._id),
    });
    pay.gatewayPayload = result.raw;
    const data = result.raw?.data && typeof result.raw.data === 'object' ? result.raw.data : {};
    const ext = String(data.linkPaymentId || result.raw?.payment_id || result.raw?.id || result.raw?.transaction_id || '').trim();
    if (ext) {
      pay.gatewayPaymentId = ext;
      pay.externalPaymentId = ext;
    }
    await pay.save();
    return res.status(201).json(
      buildCheckoutInitiateJson({
        pay,
        plan,
        dm,
        amountPaise,
        gatewayAmountPaise: gatewayAmount,
        gateway,
        checkoutUrl: result.checkoutUrl,
        paymentIntentId: gatewayOrderId,
      }),
    );
  } catch (error) {
    return next(error);
  }
}

async function refreshSelfSignupPayment(req, res, next) {
  try {
    const id = String(req.params.id || '').trim();
    const email = normalizeEmail(req.body.email);
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid payment id.' });
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const admin = await Admin.findOne({ email, role: 'admin' }).select('_id isActive').lean();
    if (!admin) return res.status(404).json({ message: 'Signup account not found.' });

    const pay = await PaymentTransaction.findOne({ _id: id, initiatedBy: admin._id });
    if (!pay) return res.status(404).json({ message: 'Payment not found.' });

    if (pay.status !== 'captured' && pay.gateway === 'paysharp') {
      const paysharp = await getPaysharpConfig({ billingAdminId: pay.billingAdminId || null });
      if (paysharp.enabled && paysharp.apiKey) {
        const refNo = String(pay.gatewayPayload?.data?.paysharpReferenceNo || '').trim();
        const status = await fetchPaysharpUpiOrderStatus({
          apiKey: paysharp.apiKey,
          useSandbox: paysharp.useSandbox,
          orderId: pay.gatewayOrderId,
          paysharpReferenceNo: refNo,
        });
        pay.gatewayPayload = {
          ...((pay.gatewayPayload && typeof pay.gatewayPayload === 'object' && pay.gatewayPayload) || {}),
          statusCheck: status.raw,
        };
        if (status.paymentId) {
          pay.gatewayPaymentId = status.paymentId;
          pay.externalPaymentId = status.paymentId;
        }
        if (status.isSuccess) {
          pay.status = 'captured';
          pay.paidAt = pay.paidAt || new Date();
          pay.failureReason = '';
          await pay.save();
          await applyCapturedSubscriptionPayment(pay);
        } else if (status.isFailed) {
          pay.status = 'failed';
          pay.failureReason = String(status.failureReason || 'Payment failed').slice(0, 500);
          await pay.save();
        } else {
          pay.status = 'pending';
          await pay.save();
        }
      }
    }

    return res.json({
      item: {
        _id: pay._id,
        status: pay.status,
        planName: pay.planName,
        amountPaise: pay.amountPaise,
        canComplete: pay.status === 'captured' && admin.isActive === false,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function completeSelfSignup(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');
    const paymentId = String(req.body.paymentId || '').trim();

    if (!email || !password || !confirmPassword || !paymentId) {
      return res.status(400).json({ message: 'Email, payment id, password and confirmation are required.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Password and re-enter password do not match.' });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }
    if (!mongoose.Types.ObjectId.isValid(paymentId)) {
      return res.status(400).json({ message: 'Invalid payment id.' });
    }

    const admin = await Admin.findOne({ email, role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Signup account not found.' });

    const pay = await PaymentTransaction.findOne({ _id: paymentId, initiatedBy: admin._id }).lean();
    if (!pay || pay.status !== 'captured') {
      return res.status(400).json({ message: 'Payment is not captured yet. Complete payment before setting password.' });
    }

    admin.password = password;
    admin.isActive = true;
    admin.companySetupCompleted = true;
    await admin.save();

    const token = signToken(admin);
    return res.json({
      message: 'Account created successfully.',
      token,
      admin: responseAdmin(admin),
    });
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
  listSignupPlans,
  initiateSelfSignupPayment,
  refreshSelfSignupPayment,
  completeSelfSignup,
};
