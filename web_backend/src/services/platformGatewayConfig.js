const mongoose = require('mongoose');
const PlatformSettings = require('../models/PlatformSettings');
const Admin = require('../models/Admin');
const Company = require('../models/Company');
const { decryptSecret } = require('./fieldCrypto');
const { validatePaysharpApiBaseUrlInput } = require('./paysharpService');

async function getOrCreatePlatformSettings() {
  let doc = await PlatformSettings.findOne({ key: 'default' }).lean();
  if (!doc) {
    await PlatformSettings.create({ key: 'default' });
    doc = await PlatformSettings.findOne({ key: 'default' }).lean();
  }
  return doc;
}

function readPlainFromDoc(doc, dotPath) {
  const keys = dotPath.split('.');
  let cur = doc;
  for (const k of keys) {
    cur = cur && cur[k];
  }
  const v = cur == null ? '' : cur;
  const dec = decryptSecret(String(v));
  if (dec) return dec;
  return String(v || '');
}

/**
 * Which super-admin owns billing for this company (same as subscription plan catalog owner).
 */
async function resolveSubscriptionCatalogOwnerId(company) {
  if (!company) return null;
  if (company.createdBySuperAdminId) return company.createdBySuperAdminId;
  const main = await Admin.findOne({ role: 'mainsuperadmin' }).sort({ createdAt: 1 }).select('_id').lean();
  return main?._id || null;
}

async function resolveSubscriptionCatalogOwnerIdFromCompanyId(companyId) {
  if (!companyId || !mongoose.Types.ObjectId.isValid(String(companyId))) return null;
  const company = await Company.findById(companyId).select('createdBySuperAdminId').lean();
  return resolveSubscriptionCatalogOwnerId(company);
}

/**
 * Razorpay: with `billingAdminId`, use that admin's keys (partner has no fallback to platform/env).
 * Without billingAdminId, legacy: env wins, then PlatformSettings.
 */
async function getRazorpayConfig(opts = {}) {
  const billingAdminId = opts.billingAdminId;
  const scoped = Boolean(billingAdminId) && mongoose.Types.ObjectId.isValid(String(billingAdminId));

  let partnerOnly = false;

  if (scoped) {
    const adm = await Admin.findById(billingAdminId).select('paymentIntegrations role').lean();
    if (adm) {
      const rz = adm.paymentIntegrations?.razorpay || {};
      const kidA = String(rz.keyId || '').trim();
      const ksA = readPlainFromDoc({ razorpay: rz }, 'razorpay.keySecret');
      const whA = readPlainFromDoc({ razorpay: rz }, 'razorpay.webhookSecret');
      if (kidA && ksA) {
        return { keyId: kidA, keySecret: ksA, webhookSecret: whA, source: 'db_admin' };
      }
      partnerOnly = adm.role === 'superadmin';
    }
  }

  const keyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (!partnerOnly && keyId && keySecret) {
    return {
      keyId,
      keySecret,
      webhookSecret: String(process.env.RAZORPAY_WEBHOOK_SECRET || '').trim(),
      source: 'env',
    };
  }
  const doc = await getOrCreatePlatformSettings();
  const rz = doc.razorpay || {};
  const kid = String(rz.keyId || '').trim();
  const ks = readPlainFromDoc(doc, 'razorpay.keySecret');
  const wh = readPlainFromDoc(doc, 'razorpay.webhookSecret');
  if (!partnerOnly && kid && ks) {
    return { keyId: kid, keySecret: ks, webhookSecret: wh, source: 'db' };
  }
  return { keyId: '', keySecret: '', webhookSecret: wh, source: 'none' };
}

/** Sandbox UPI / link-payment host (see Paysharp dashboard → Settings). */
const DEFAULT_PAYSHARP_SANDBOX_BASE = 'https://sandbox.paysharp.co.in';
const DEFAULT_PAYSHARP_LIVE_BASE = String(process.env.PAYSHARP_LIVE_API_BASE_URL || '').trim();

function paysharpBaseOrEmpty(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const chk = validatePaysharpApiBaseUrlInput(s);
  if (!chk.ok) {
    // eslint-disable-next-line no-console
    console.warn('[paysharp] Ignoring invalid API base URL (use https://… from dashboard, not an email):', s.slice(0, 80));
    return '';
  }
  return chk.value;
}

function assemblePaysharpConfig(p, { useEnvToken, partnerOnly }) {
  const pay = p || {};
  const secretKey = String(process.env.PAYSHARP_SECRET_KEY || '').trim();
  const envToken = useEnvToken
    ? String(process.env.PAYSHARP_API_TOKEN || process.env.PAYSHARP_BEARER_TOKEN || '').trim()
    : '';
  const apiKeyFromDb = readPlainFromDoc({ paysharp: pay }, 'paysharp.apiKey');
  const apiKey = envToken || secretKey || apiKeyFromDb;
  const webhookSecret = readPlainFromDoc({ paysharp: pay }, 'paysharp.webhookSecret');
  const akTrim = String(apiKey || '').trim();
  const whTrim = String(webhookSecret || '').trim();
  const bearerMatchesWebhookSecret = Boolean(akTrim && whTrim && akTrim === whTrim);
  const envBase = String(process.env.PAYSHARP_API_BASE_URL || '').trim();
  const dbBase = String(pay.apiBaseUrl || '').trim();
  const sandboxEnv = String(process.env.PAYSHARP_SANDBOX_API_BASE_URL || '').trim();
  let apiBaseUrl = paysharpBaseOrEmpty(envBase) || paysharpBaseOrEmpty(dbBase);
  if (!apiBaseUrl) {
    if (pay.useSandbox) {
      apiBaseUrl = paysharpBaseOrEmpty(sandboxEnv) || DEFAULT_PAYSHARP_SANDBOX_BASE;
    } else {
      apiBaseUrl = paysharpBaseOrEmpty(DEFAULT_PAYSHARP_LIVE_BASE) || DEFAULT_PAYSHARP_LIVE_BASE;
    }
  }
  return {
    enabled: Boolean(pay.enabled),
    merchantId: String(pay.merchantId || '').trim(),
    apiKey,
    webhookSecret,
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ''),
    useSandbox: Boolean(pay.useSandbox),
    apiTokenSource: envToken ? 'env' : secretKey ? 'env_secret' : apiKeyFromDb ? 'db' : 'none',
    bearerMatchesWebhookSecret,
    partnerOnly: Boolean(partnerOnly),
  };
}

/**
 * Paysharp: with `billingAdminId`, use that admin's integration (partner super admin has no platform/env Bearer fallback).
 * Main super admin with empty admin doc still falls back to env + PlatformSettings.
 */
async function getPaysharpConfig(opts = {}) {
  const billingAdminId = opts.billingAdminId;
  const scoped = Boolean(billingAdminId) && mongoose.Types.ObjectId.isValid(String(billingAdminId));

  if (scoped) {
    const adm = await Admin.findById(billingAdminId).select('paymentIntegrations role').lean();
    if (adm) {
      const p = adm.paymentIntegrations?.paysharp || {};
      if (adm.role === 'superadmin') {
        return assemblePaysharpConfig(p, { useEnvToken: false, partnerOnly: true });
      }
      const hasScopedConfig =
        Boolean(p && typeof p === 'object') &&
        (p.enabled !== undefined ||
          p.useSandbox !== undefined ||
          String(p.merchantId || '').trim() ||
          String(p.apiBaseUrl || '').trim() ||
          String(readPlainFromDoc({ paysharp: p }, 'paysharp.webhookSecret') || '').trim() ||
          String(readPlainFromDoc({ paysharp: p }, 'paysharp.apiKey') || '').trim());
      if (adm.role === 'mainsuperadmin' && hasScopedConfig) {
        return assemblePaysharpConfig(p, { useEnvToken: true, partnerOnly: false });
      }
    }
  }

  const doc = await getOrCreatePlatformSettings();
  const p = doc.paysharp || {};
  return assemblePaysharpConfig(p, { useEnvToken: true, partnerOnly: false });
}

module.exports = {
  getOrCreatePlatformSettings,
  resolveSubscriptionCatalogOwnerId,
  resolveSubscriptionCatalogOwnerIdFromCompanyId,
  getRazorpayConfig,
  getPaysharpConfig,
};
