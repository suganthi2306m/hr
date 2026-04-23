const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Company = require('../models/Company');
const User = require('../models/User');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const PaymentTransaction = require('../models/PaymentTransaction');
const { createRazorpayPaymentLink } = require('../services/razorpayService');
const {
  createPaysharpCheckout,
  fetchPaysharpUpiOrderStatus,
  paysharpDebugLogEnabled,
} = require('../services/paysharpService');
const { getRazorpayConfig, getPaysharpConfig } = require('../services/platformGatewayConfig');
const { applyCapturedSubscriptionPayment } = require('../services/subscriptionEntitlementService');

async function getCompanyIdForAdmin(adminId) {
  const company = await Company.findOne({ adminId }).select('_id');
  return company?._id || null;
}

/** Which super-admin catalog applies to billing (partner, or main for self-serve companies). */
async function resolveSubscriptionCatalogOwnerId(company) {
  if (!company) return null;
  if (company.createdBySuperAdminId) return company.createdBySuperAdminId;
  const main = await Admin.findOne({ role: 'mainsuperadmin' }).sort({ createdAt: 1 }).select('_id').lean();
  return main?._id || null;
}

async function assertPlanInCompanyCatalog(plan, company) {
  const ownerId = await resolveSubscriptionCatalogOwnerId(company);
  if (!ownerId || !plan || String(plan.createdByAdminId) !== String(ownerId)) {
    const err = new Error('Plan is not available for your organization.');
    err.status = 400;
    throw err;
  }
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

/** Persist gateway detail: Paysharp often returns message "Internal Server Error" while the real hint is in err.raw. */
function failureReasonFromError(err, fallback = 'Gateway error') {
  const base = String(err?.message || fallback).trim();
  if (err?.raw && typeof err.raw === 'object') {
    try {
      const rawStr = JSON.stringify(err.raw);
      const cap = 3500;
      const trimmed = rawStr.length > cap ? `${rawStr.slice(0, cap)}…` : rawStr;
      return `${base} | gatewayBody=${trimmed}`.slice(0, 8000);
    } catch {
      /* ignore JSON stringify edge cases */
    }
  }
  return base.slice(0, 8000);
}

/** BizzPass-compatible initiate payload + legacy fields for older web builds. */
function buildCheckoutInitiateJson({
  pay,
  plan,
  dm,
  amountPaise,
  gatewayAmountPaise,
  gateway,
  checkoutUrl,
  paymentIntentId,
  razorpayAvailable,
  paysharpAvailable,
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
    razorpayAvailable: Boolean(razorpayAvailable),
    paysharpAvailable: Boolean(paysharpAvailable),
    gatewayOrderId: paymentIntentId,
    amountPaise: gatewayAmountPaise,
  };
}

async function getPlans(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const company = await Company.findById(companyId).select('createdBySuperAdminId').lean();
    if (!company) return res.status(404).json({ message: 'Company not found.' });
    const catalogOwnerId = await resolveSubscriptionCatalogOwnerId(company);
    if (!catalogOwnerId) return res.json({ items: [] });
    const items = await SubscriptionPlan.find({ isActive: true, createdByAdminId: catalogOwnerId })
      .sort({ priceInr: 1, name: 1 })
      .lean();
    return res.json({ items });
  } catch (e) {
    return next(e);
  }
}

async function getCurrent(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const company = await Company.findById(companyId).populate('subscription.planId').lean();
    if (!company) return res.status(404).json({ message: 'Company not found.' });
    const [staffCount, branchCount] = await Promise.all([
      User.countDocuments({ companyId }),
      Promise.resolve(Array.isArray(company.branches) ? company.branches.length : 0),
    ]);
    const sub = company.subscription || {};
    const expiresAt = sub.expiresAt ? new Date(sub.expiresAt).toISOString() : null;
    let daysLeft = null;
    if (expiresAt) {
      const diff = new Date(expiresAt).getTime() - Date.now();
      daysLeft = Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
    }
    return res.json({
      subscription: {
        planId: sub.planId || null,
        planName: sub.planName || '',
        planCode: sub.planCode || '',
        maxUsers: sub.maxUsers,
        maxBranches: sub.maxBranches,
        expiresAt,
        daysLeft,
        isActive: sub.isActive !== false,
        licenseKey: sub.licenseKey || '',
      },
      usage: { staffCount, branchCount },
    });
  } catch (e) {
    return next(e);
  }
}

async function listMyPayments(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const items = await PaymentTransaction.find({ companyId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select(
        'amountPaise currency planName gateway status gatewayOrderId gatewayPaymentId externalPaymentId failureReason createdAt paidAt durationMonths',
      )
      .lean();
    return res.json({ items });
  } catch (e) {
    return next(e);
  }
}

async function getMyPayment(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id.' });
    const row = await PaymentTransaction.findOne({ _id: id, companyId }).lean();
    if (!row) return res.status(404).json({ message: 'Payment not found.' });
    return res.json({ item: row });
  } catch (e) {
    return next(e);
  }
}

async function refreshMyPaymentStatus(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id.' });
    const pay = await PaymentTransaction.findOne({ _id: id, companyId });
    if (!pay) return res.status(404).json({ message: 'Payment not found.' });

    // Already final: return as-is.
    if (pay.status === 'captured' || pay.status === 'failed') return res.json({ item: pay });

    if (pay.gateway === 'paysharp') {
      const paysharp = await getPaysharpConfig();
      if (!paysharp.enabled || !paysharp.apiKey) {
        return res.status(400).json({ message: 'Paysharp is not configured for status checks.' });
      }
      const refFromPayload = String(pay.gatewayPayload?.data?.paysharpReferenceNo || '').trim();
      let status;
      try {
        status = await fetchPaysharpUpiOrderStatus({
          apiKey: paysharp.apiKey,
          useSandbox: paysharp.useSandbox,
          orderId: pay.gatewayOrderId,
          paysharpReferenceNo: refFromPayload,
        });
      } catch (err) {
        const code = Number(err?.status);
        let msg = String(err?.message || 'Status check failed');
        if (code === 403 || code === 401) {
          msg =
            'Paysharp blocked the order status API for this token or host (HTTP ' +
            code +
            '). Payment may still succeed via webhook; retry later or confirm UPI order status is enabled for your account.';
        }
        pay.gatewayPayload = {
          ...((pay.gatewayPayload && typeof pay.gatewayPayload === 'object' && pay.gatewayPayload) || {}),
          statusCheckError: {
            message: msg,
            httpStatus: Number.isFinite(code) ? code : null,
            at: new Date().toISOString(),
            raw: err?.raw || null,
          },
        };
        await pay.save();
        return res.json({
          item: pay,
          verification: {
            ok: false,
            message: msg,
          },
        });
      }

      pay.gatewayPayload = {
        ...((pay.gatewayPayload && typeof pay.gatewayPayload === 'object' && pay.gatewayPayload) || {}),
        statusCheck: status.raw,
      };
      if (status.paymentId) {
        pay.gatewayPaymentId = status.paymentId;
        pay.externalPaymentId = status.paymentId;
      }
      if (status.isSuccess) {
        if (pay.status !== 'captured') {
          pay.status = 'captured';
          pay.paidAt = pay.paidAt || new Date();
          pay.failureReason = '';
          await pay.save();
          try {
            await applyCapturedSubscriptionPayment(pay);
          } catch (entErr) {
            pay.gatewayPayload = {
              ...((pay.gatewayPayload && typeof pay.gatewayPayload === 'object' && pay.gatewayPayload) || {}),
              entitlementError: {
                message: String(entErr?.message || 'Entitlement update failed'),
                at: new Date().toISOString(),
              },
            };
            await pay.save();
            return res.json({
              item: pay,
              verification: {
                ok: false,
                message:
                  'Payment marked captured, but updating your subscription failed. Contact support with this payment id.',
              },
            });
          }
        }
      } else if (status.isFailed) {
        pay.status = 'failed';
        if (status.failureReason) pay.failureReason = status.failureReason.slice(0, 500);
        await pay.save();
      } else {
        pay.status = 'pending';
        await pay.save();
      }
      const st = String(pay.status || '').toLowerCase();
      if (st === 'captured') {
        return res.json({ item: pay, verification: { ok: true } });
      }
      if (st === 'failed') {
        return res.json({
          item: pay,
          verification: { ok: false, message: pay.failureReason || 'Payment failed at gateway.' },
        });
      }
      return res.json({
        item: pay,
        verification: { ok: false, message: 'Payment is still pending confirmation.' },
      });
    }

    // For gateways without polling implementation, return latest persisted row.
    return res.json({ item: pay });
  } catch (e) {
    return next(e);
  }
}

async function initiatePaysharp(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const planId = String(req.body.planId || '').trim();
    const durationMonths = Number(req.body.durationMonths);
    if (!mongoose.Types.ObjectId.isValid(planId)) return res.status(400).json({ message: 'Invalid plan id.' });
    const plan = await SubscriptionPlan.findOne({ _id: planId, isActive: true });
    if (!plan) return res.status(400).json({ message: 'Plan not found.' });

    const company = await Company.findById(companyId).lean();
    if (!company) return res.status(404).json({ message: 'Company not found.' });
    try {
      await assertPlanInCompanyCatalog(plan, company);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ message: err.message });
      throw err;
    }

    const { amountPaise, dm } = computeAmountPaise(plan, durationMonths);
    let gatewayAmount = amountPaise;
    if (gatewayAmount > 0 && gatewayAmount < 1000) gatewayAmount = 1000;

    const paysharp = await getPaysharpConfig();
    const mockCheckout = String(process.env.PAYMENT_DEV_MOCK_CHECKOUT || '') === '1';
    if (!mockCheckout) {
      if (!paysharp.enabled) return res.status(400).json({ message: 'Paysharp is not enabled in platform settings.' });
      if (!paysharp.apiKey) return res.status(400).json({ message: 'Paysharp API token is not configured.' });
      if (!String(paysharp.apiBaseUrl || '').trim()) {
        return res.status(400).json({
          message:
            'Paysharp API base URL is missing for live mode. Enable “Use sandbox” in Super Admin → Paysharp, or set PAYSHARP_API_BASE_URL / PAYSHARP_LIVE_API_BASE_URL to the host shown in your Paysharp dashboard.',
        });
      }
      if (paysharp.bearerMatchesWebhookSecret) {
        return res.status(400).json({
          message:
            'Paysharp is misconfigured: the payment API token and the webhook secret are the same value. In the Paysharp merchant dashboard, copy the sandbox (or live) API token into Super Admin - Integrations - Paysharp API key, or set PAYSHARP_API_TOKEN on the server. Keep the webhook signing secret only in the webhook field; it is not used as Bearer when creating payments.',
        });
      }
    }

    if (paysharpDebugLogEnabled()) {
      // eslint-disable-next-line no-console
      console.warn('[PAYSHARP_DEBUG] ----- POST /api/company/subscription/initiate (secrets in log — local only) -----');
      // eslint-disable-next-line no-console
      console.warn('[PAYSHARP_DEBUG] incoming body:', JSON.stringify(req.body || {}));
      // eslint-disable-next-line no-console
      console.warn('[PAYSHARP_DEBUG] payerEmail → Paysharp customerEmail:', req.admin?.email || company.email || '(empty)');
      // eslint-disable-next-line no-console
      console.warn('[PAYSHARP_DEBUG] paysharp config (decrypted):', {
        apiTokenSource: paysharp.apiTokenSource,
        enabled: paysharp.enabled,
        useSandbox: paysharp.useSandbox,
        merchantId: paysharp.merchantId,
        apiBaseUrl: paysharp.apiBaseUrl,
        apiKey: paysharp.apiKey,
        webhookSecret: paysharp.webhookSecret,
      });
    }

    const pay = await PaymentTransaction.create({
      companyId,
      companyName: company.name || '',
      payerEmail: req.admin.email || company.email || '',
      amountPaise: gatewayAmount,
      currency: 'INR',
      planId: plan._id,
      planName: plan.name,
      durationMonths: dm,
      licenseId: company.subscription?.licenseId || null,
      initiatedBy: req.admin._id,
      gateway: 'paysharp',
      method: 'checkout',
      status: 'created',
      gatewayOrderId: '',
    });
    const gatewayOrderId = `lt_${pay._id}`.slice(0, 40);
    pay.gatewayOrderId = gatewayOrderId;
    await pay.save();

    try {
      const { checkoutUrl, raw } = await createPaysharpCheckout({
        apiKey: paysharp.apiKey,
        merchantId: paysharp.merchantId,
        apiBaseUrl: paysharp.apiBaseUrl,
        useSandbox: paysharp.useSandbox,
        amountPaise: gatewayAmount,
        orderId: gatewayOrderId,
        customerEmail: pay.payerEmail,
        customerName: company.name || req.admin?.name || '',
        customerMobile: company.phone || '',
        customerId: String(companyId),
      });
      pay.gatewayPayload = raw;
      const data = raw?.data && typeof raw.data === 'object' ? raw.data : {};
      const ext = String(
        data.linkPaymentId || raw?.payment_id || raw?.id || raw?.transaction_id || '',
      ).trim();
      if (ext) {
        pay.gatewayPaymentId = ext;
        pay.externalPaymentId = ext;
      }
      await pay.save();
      const rz = await getRazorpayConfig();
      const razorpayAvailable = Boolean(rz.keyId && rz.keySecret);
      const paysharpAvailable = true;
      const payload = buildCheckoutInitiateJson({
        pay,
        plan,
        dm,
        amountPaise,
        gatewayAmountPaise: gatewayAmount,
        gateway: 'paysharp',
        checkoutUrl,
        paymentIntentId: gatewayOrderId,
        razorpayAvailable,
        paysharpAvailable,
      });
      if (paysharpDebugLogEnabled()) {
        // eslint-disable-next-line no-console
        console.warn('[PAYSHARP_DEBUG] JSON response to client:', JSON.stringify(payload).slice(0, 12000));
      }
      return res.status(201).json(payload);
    } catch (err) {
      if (paysharpDebugLogEnabled()) {
        // eslint-disable-next-line no-console
        console.warn('[PAYSHARP_DEBUG] initiate threw:', err?.message, 'status=', err?.status, 'raw=', err?.raw);
      }
      // failureReason = user-visible diagnosis; err.status 400 vs 502 — see paysharpService.js module header
      pay.status = 'failed';
      pay.failureReason = failureReasonFromError(err, 'Gateway error');
      await pay.save();
      return next(err);
    }
  } catch (e) {
    return next(e);
  }
}

async function initiateRazorpay(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const planId = String(req.body.planId || '').trim();
    const durationMonths = Number(req.body.durationMonths);
    if (!mongoose.Types.ObjectId.isValid(planId)) return res.status(400).json({ message: 'Invalid plan id.' });
    const plan = await SubscriptionPlan.findOne({ _id: planId, isActive: true });
    if (!plan) return res.status(400).json({ message: 'Plan not found.' });

    const company = await Company.findById(companyId).lean();
    if (!company) return res.status(404).json({ message: 'Company not found.' });
    try {
      await assertPlanInCompanyCatalog(plan, company);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ message: err.message });
      throw err;
    }

    const rz = await getRazorpayConfig();
    if (!rz.keyId || !rz.keySecret) {
      return res.status(400).json({ message: 'Razorpay is not configured (env or Super Admin → Integrations).' });
    }

    const { amountPaise, dm } = computeAmountPaise(plan, durationMonths);
    const gatewayAmount = Math.max(100, amountPaise);

    const pay = await PaymentTransaction.create({
      companyId,
      companyName: company.name || '',
      payerEmail: req.admin.email || company.email || '',
      amountPaise: gatewayAmount,
      currency: 'INR',
      planId: plan._id,
      planName: plan.name,
      durationMonths: dm,
      licenseId: company.subscription?.licenseId || null,
      initiatedBy: req.admin._id,
      gateway: 'razorpay',
      method: 'payment_link',
      status: 'created',
      gatewayOrderId: '',
    });
    const gatewayOrderId = `lt_${pay._id}`.slice(0, 40);
    pay.gatewayOrderId = gatewayOrderId;
    await pay.save();

    const fe = String(process.env.FRONTEND_URL || process.env.WEB_APP_URL || '').trim() || 'http://localhost:5174';
    const callbackUrl = `${fe.replace(/\/$/, '')}/dashboard/billing`;

    try {
      const result = await createRazorpayPaymentLink({
        keyId: rz.keyId,
        keySecret: rz.keySecret,
        amountPaise: gatewayAmount,
        currency: 'INR',
        description: `${plan.name} — ${dm} mo`,
        referenceId: gatewayOrderId,
        customerEmail: pay.payerEmail,
        callbackUrl,
      });
      pay.gatewayPaymentId = result.id;
      pay.externalPaymentId = result.id;
      pay.gatewayPayload = { short_url: result.short_url };
      await pay.save();
      const paysharp = await getPaysharpConfig();
      const paysharpAvailable = Boolean(
        paysharp.enabled && paysharp.apiKey && String(paysharp.apiBaseUrl || '').trim(),
      );
      return res.status(201).json(
        buildCheckoutInitiateJson({
          pay,
          plan,
          dm,
          amountPaise,
          gatewayAmountPaise: gatewayAmount,
          gateway: 'razorpay',
          checkoutUrl: result.short_url,
          paymentIntentId: gatewayOrderId,
          razorpayAvailable: true,
          paysharpAvailable,
        }),
      );
    } catch (err) {
      pay.status = 'failed';
      pay.failureReason = failureReasonFromError(err, 'Razorpay error');
      await pay.save();
      return next(err);
    }
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  getPlans,
  getCurrent,
  listMyPayments,
  getMyPayment,
  refreshMyPaymentStatus,
  initiatePaysharp,
  initiateRazorpay,
};
