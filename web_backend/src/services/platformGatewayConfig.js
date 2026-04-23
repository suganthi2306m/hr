const PlatformSettings = require('../models/PlatformSettings');
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
 * Razorpay: env wins; else decrypted credentials from PlatformSettings.razorpay
 */
async function getRazorpayConfig() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (keyId && keySecret) {
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
  const ks = readPlainFromDoc(doc, 'razorpay.keySecret', '');
  const wh = readPlainFromDoc(doc, 'razorpay.webhookSecret', '');
  if (kid && ks) {
    return { keyId: kid, keySecret: ks, webhookSecret: wh, source: 'db' };
  }
  return { keyId: '', keySecret: '', webhookSecret: wh, source: 'none' };
}

/** Sandbox UPI / link-payment host (see Paysharp dashboard → Settings). */
const DEFAULT_PAYSHARP_SANDBOX_BASE = 'https://sandbox.paysharp.co.in';
/** Live host varies by account; set PAYSHARP_API_BASE_URL or Integrations when not using sandbox. */
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

/**
 * Paysharp: Bearer token for Link Payment API + merchant from DB.
 * API token: PAYSHARP_API_TOKEN or PAYSHARP_BEARER_TOKEN (env) overrides DB — same value as dashboard “API token”, not webhook secret.
 * Base URL: env → DB override (invalid values ignored) → sandbox default if useSandbox, else PAYSHARP_LIVE_API_BASE_URL.
 */
async function getPaysharpConfig() {
  const doc = await getOrCreatePlatformSettings();
  const p = doc.paysharp || {};
  /** Dashboard secret key (often long hex) — optional Bearer; see PAYSHARP_SECRET_KEY. */
  const secretKey = String(process.env.PAYSHARP_SECRET_KEY || '').trim();
  const envToken = String(
    process.env.PAYSHARP_API_TOKEN || process.env.PAYSHARP_BEARER_TOKEN || '',
  ).trim();
  const apiKeyFromDb = readPlainFromDoc(doc, 'paysharp.apiKey', '');
  /**
   * Bearer: explicit PAYSHARP_API_TOKEN / BEARER_TOKEN first (avoids short key in PAYSHARP_SECRET_KEY winning),
   * then PAYSHARP_SECRET_KEY, then DB. For BizzPass-style long secret only in env, set PAYSHARP_SECRET_KEY and leave API_TOKEN empty.
   */
  const apiKey = envToken || secretKey || apiKeyFromDb;
  const webhookSecret = readPlainFromDoc(doc, 'paysharp.webhookSecret', '');
  const akTrim = String(apiKey || '').trim();
  const whTrim = String(webhookSecret || '').trim();
  /** True when the same string is used as Bearer and webhook secret (common mis-paste). */
  const bearerMatchesWebhookSecret = Boolean(akTrim && whTrim && akTrim === whTrim);
  const envBase = String(process.env.PAYSHARP_API_BASE_URL || '').trim();
  const dbBase = String(p.apiBaseUrl || '').trim();
  const sandboxEnv = String(process.env.PAYSHARP_SANDBOX_API_BASE_URL || '').trim();
  let apiBaseUrl = paysharpBaseOrEmpty(envBase) || paysharpBaseOrEmpty(dbBase);
  if (!apiBaseUrl) {
    if (p.useSandbox) {
      apiBaseUrl = paysharpBaseOrEmpty(sandboxEnv) || DEFAULT_PAYSHARP_SANDBOX_BASE;
    } else {
      apiBaseUrl = paysharpBaseOrEmpty(DEFAULT_PAYSHARP_LIVE_BASE) || DEFAULT_PAYSHARP_LIVE_BASE;
    }
  }
  return {
    enabled: Boolean(p.enabled),
    merchantId: String(p.merchantId || '').trim(),
    apiKey,
    webhookSecret,
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ''),
    useSandbox: Boolean(p.useSandbox),
    /** 'env' | 'env_secret' | 'db' | 'none' — which credential supplies Bearer */
    apiTokenSource: envToken ? 'env' : secretKey ? 'env_secret' : apiKeyFromDb ? 'db' : 'none',
    bearerMatchesWebhookSecret,
  };
}

module.exports = {
  getOrCreatePlatformSettings,
  getRazorpayConfig,
  getPaysharpConfig,
};
