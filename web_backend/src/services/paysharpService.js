/**
 * Paysharp — Create Payment Link (Link Payment API v1).
 * Docs: POST …/linkpayment (Bearer), amount in INR (whole rupees).
 * Resolved URL: sandbox origin → /api/v1/upi/linkpayment; other API hosts → /v1/upi/linkpayment.
 *
 * --- HTTP status vs Paysharp failures (for DevTools / support) ---
 * Not every Paysharp-related error is 502.
 * - 400: Invalid API base URL — validatePaysharpApiBaseUrlInput (e.g. email pasted as URL),
 *   resolveLinkPaymentUrl, or fetch "Failed to parse URL" / invalid URL (see ~L8–34, L50–64, L175–180).
 * - 502: URL validation passed, but the gateway call failed — HTTP !res.ok, JSON body code !== 200,
 *   or response missing linkPaymentUrl (~L188–224). err.raw holds the Paysharp body when set.
 *
 * --- Debugging ---
 * - Node stack: a frame in createPaysharpCheckout here pinpoints the throw.
 * - Mongo: PaymentTransaction.failureReason stores err.message plus gatewayBody=… (JSON of err.raw) when set.
 * - Dev: server.js error middleware logs error.raw (truncated) when present — use alongside failureReason
 *   instead of guessing from the small JSON body the client receives (~35 bytes is often just { message }).
 *
 * --- Link Payment vs UPI Intent (BizzPass-style) ---
 * - Default: Link Payment on sandbox host → …/api/v1/upi/linkpayment (hosted https link).
 * - PAYSHARP_CHECKOUT_MODE=intent: POST …/order/intent (upi://… in response). If PAYSHARP_UPI_API_BASE_URL unset:
 *   live → api.paysharp.in/v1/upi; Use sandbox on → sandbox.paysharp.co.in/api/v1/upi.
 * - Bearer: PAYSHARP_API_TOKEN / PAYSHARP_BEARER_TOKEN first, then PAYSHARP_SECRET_KEY, then DB (long token for UPI Intent).
 */

/** Local testing only: logs plaintext API token, bodies. Set PAYSHARP_DEBUG_LOG=1 — NEVER in production. */
function paysharpDebugLogEnabled() {
  return String(process.env.PAYSHARP_DEBUG_LOG || '').trim() === '1';
}

/** Reject values that are clearly not an HTTP origin (e.g. owner email pasted into "API base URL"). */
function validatePaysharpApiBaseUrlInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return { ok: true, value: '' };
  const bareEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && !s.includes('://');
  if (bareEmail) {
    return {
      ok: false,
      message:
        'Paysharp API base URL must be a full URL (e.g. https://sandbox.paysharp.co.in), not an email address. Fix it in Super Admin → Integrations → Paysharp or PAYSHARP_API_BASE_URL.',
    };
  }
  if (!/^https?:\/\//i.test(s)) {
    return {
      ok: false,
      message: 'Paysharp API base URL must start with https:// or http:// (copy the API host from your Paysharp dashboard).',
    };
  }
  try {
    const u = new URL(s);
    if (!['http:', 'https:'].includes(u.protocol)) {
      return { ok: false, message: 'Paysharp API base URL must use http or https.' };
    }
    return { ok: true, value: s.replace(/\/+$/, '') };
  } catch {
    return { ok: false, message: 'Paysharp API base URL is not a valid URL.' };
  }
}

/** Paysharp hosts differ: sandbox dashboard origin serves APIs under /api/v1/upi/…; live API host uses /v1/upi/…. */
function linkPaymentPathForHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (h === 'sandbox.paysharp.co.in' || h.endsWith('.sandbox.paysharp.co.in')) {
    return '/api/v1/upi/linkpayment';
  }
  return '/v1/upi/linkpayment';
}

/**
 * Build POST URL for create link payment from configured API base (origin or partial path).
 * @param {string} baseRaw - e.g. https://sandbox.paysharp.co.in or https://api.paysharp.in/v1/upi
 */
function resolveLinkPaymentUrl(baseRaw) {
  const v = validatePaysharpApiBaseUrlInput(baseRaw);
  if (!v.ok) {
    const err = new Error(v.message);
    err.status = 400;
    throw err;
  }
  const b = v.value;
  if (!b) return '';
  let u;
  try {
    u = new URL(b.replace(/\/+$/, ''));
  } catch {
    const err = new Error('Invalid Paysharp API base URL.');
    err.status = 400;
    throw err;
  }
  const pathLower = (u.pathname || '').replace(/\/+$/, '').toLowerCase();
  if (/\/linkpayment\/?$/i.test(pathLower) || /\/linkpayment\//i.test(u.pathname || '')) {
    return u.toString();
  }
  const defaultSeg = linkPaymentPathForHost(u.hostname);
  if (!pathLower || pathLower === '/') {
    u.pathname = defaultSeg;
    return u.toString();
  }
  if (/\/api\/v1\/upi$/i.test(pathLower) || /\/v1\/upi$/i.test(pathLower)) {
    u.pathname = `${pathLower}/linkpayment`;
    return u.toString();
  }
  try {
    u.pathname = defaultSeg;
    return u.toString();
  } catch {
    const err = new Error('Invalid Paysharp API base URL after resolving link payment path.');
    err.status = 400;
    throw err;
  }
}

function tenDigitCustomerMobile(raw) {
  const fromEnv = String(process.env.PAYSHARP_DEFAULT_CUSTOMER_MOBILE || '').replace(/\D/g, '');
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length >= 10) return d.slice(-10);
  if (fromEnv.length >= 10) return fromEnv.slice(-10);
  return '9000000000';
}

function customerDisplayName(name, email) {
  const n = String(name || '').trim();
  if (n) return n.slice(0, 100);
  const e = String(email || '').trim();
  if (e) return (e.split('@')[0] || 'Customer').slice(0, 100);
  return 'Customer';
}

/**
 * Paysharp remarks allow only [a-zA-Z0-9- ].
 * Normalize whitespace and strip disallowed characters.
 */
function sanitizePaysharpRemarks(value, maxLen) {
  const s = String(value || '')
    .replace(/[^a-zA-Z0-9\- ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
  return s || 'LT';
}

function paysharpCheckoutMode() {
  return String(process.env.PAYSHARP_CHECKOUT_MODE || 'linkpayment')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

/**
 * UPI Intent POST URL. If PAYSHARP_UPI_API_BASE_URL is unset: live → api.paysharp.in/v1/upi;
 * sandbox (useSandbox) → sandbox.paysharp.co.in/api/v1/upi (same prefix family as Link Payment on sandbox).
 */
function resolveUpiIntentPostUrl(useSandbox) {
  const fromEnv = String(process.env.PAYSHARP_UPI_API_BASE_URL || '').trim();
  const raw =
    fromEnv ||
    (useSandbox ? 'https://sandbox.paysharp.co.in/api/v1/upi' : 'https://api.paysharp.in/v1/upi');
  const v = validatePaysharpApiBaseUrlInput(raw);
  if (!v.ok) {
    const err = new Error(v.message);
    err.status = 400;
    throw err;
  }
  const base = v.value.replace(/\/+$/, '');
  if (/\/order\/intent$/i.test(base)) return base;
  return `${base}/order/intent`;
}

/** UPI order status URL (same base as intent). */
function resolveUpiOrderStatusUrl(useSandbox) {
  const intentUrl = resolveUpiIntentPostUrl(useSandbox);
  return intentUrl.replace(/\/order\/intent$/i, '/order/status');
}

function upiCustomerId(orderId, customerId) {
  const from = String(customerId || '').replace(/[^a-zA-Z0-9_]/g, '');
  if (from.length >= 1) return from.slice(0, 36);
  const o = String(orderId || '').replace(/[^a-zA-Z0-9_]/g, '');
  return `LT_${(o || 'order').slice(0, 32)}`.slice(0, 36);
}

/**
 * UPI Intent URL API — same surface as typical BizzPass flow (api.paysharp.in/v1/upi/order/intent).
 * @see https://www.paysharp.in/developer/api/v1/upi/reference
 */
async function createPaysharpUpiIntent({
  apiKey,
  merchantId: _merchantId,
  useSandbox,
  amountPaise,
  orderId,
  customerEmail,
  customerName,
  customerMobile,
  customerId,
}) {
  const url = resolveUpiIntentPostUrl(Boolean(useSandbox));
  const amountRupees = Math.max(1, Math.round((Number(amountPaise) || 0) / 100));
  const remarks = sanitizePaysharpRemarks(orderId || 'order', 35);
  const body = {
    orderId: String(orderId || '').replace(/\s+/g, '').slice(0, 36),
    amount: amountRupees,
    customerId: upiCustomerId(orderId, customerId),
    customerName: customerDisplayName(customerName, customerEmail).slice(0, 100),
    customerMobileNo: tenDigitCustomerMobile(customerMobile),
    customerEmail: String(customerEmail || '').trim().slice(0, 100),
    remarks,
  };

  if (paysharpDebugLogEnabled()) {
    // eslint-disable-next-line no-console
    console.warn('[PAYSHARP_DEBUG] ----- outbound UPI Intent (BizzPass-style surface) -----');
    // eslint-disable-next-line no-console
    console.warn('[PAYSHARP_DEBUG] POST', url);
    // eslint-disable-next-line no-console
    console.warn('[PAYSHARP_DEBUG] request body JSON:', JSON.stringify(body));
    // eslint-disable-next-line no-console
    console.warn('[PAYSHARP_DEBUG] Bearer (full):', String(apiKey || '').trim());
  }

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${String(apiKey).trim()}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (paysharpDebugLogEnabled()) {
      // eslint-disable-next-line no-console
      console.warn('[PAYSHARP_DEBUG] fetch threw:', e);
    }
    throw e;
  }

  const ct = String(res.headers.get('content-type') || '').toLowerCase();
  const raw = await res.json().catch(() => ({}));

  if (paysharpDebugLogEnabled()) {
    // eslint-disable-next-line no-console
    console.warn('[PAYSHARP_DEBUG] Paysharp HTTP status:', res.status, 'content-type:', ct || '(none)');
    // eslint-disable-next-line no-console
    console.warn('[PAYSHARP_DEBUG] Paysharp response JSON:', JSON.stringify(raw).slice(0, 8000));
  }

  if (!res.ok) {
    let msg = raw.message || raw.error || `Paysharp HTTP ${res.status}`;
    const ec = raw.errorCode != null ? Number(raw.errorCode) : NaN;
    const c = raw.code != null ? Number(raw.code) : NaN;
    if (ec === 5001 || (Number.isFinite(c) && c >= 500)) {
      const base = String(msg || 'Internal Server Error');
      msg = `Paysharp UPI Intent: ${base}${Number.isFinite(ec) ? ` (errorCode ${ec})` : ''}. Use the dashboard API token as Bearer—not the webhook signing secret—and confirm UPI / Intent is enabled for this merchant in the Paysharp sandbox.`;
    }
    if (!raw.message && !raw.error && !raw.code && ct.includes('text/html')) {
      msg =
        'Paysharp returned HTML for UPI Intent — set PAYSHARP_UPI_API_BASE_URL or use sandbox default; check Bearer token matches that host.';
    }
    if (/whitelist|ip address/i.test(String(msg))) {
      msg = `${msg} Add your server’s outbound IP (or full CIDR ranges from your host, e.g. Render) in Paysharp → API IP Whitelisting.`;
    }
    const err = new Error(msg);
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
    err.raw = raw;
    throw err;
  }

  if (raw.code != null && Number(raw.code) !== 200) {
    let msg = raw.message || `Paysharp error (code ${raw.code})`;
    const c = Number(raw.code);
    const ec = raw.errorCode != null ? ` (errorCode ${raw.errorCode})` : '';
    if (c === 401 || /access denied/i.test(String(msg))) {
      msg = `Paysharp access denied${ec}. Use PAYSHARP_API_TOKEN or the dashboard API token (Bearer)—not the webhook secret; see PAYSHARP_CHECKOUT_MODE=intent.`;
    } else if (c >= 500 || Number(raw.errorCode) === 5001 || /internal server error/i.test(String(msg))) {
      msg = `Paysharp UPI Intent: ${msg}${ec}. Confirm the Bearer is the dashboard API token (not webhook secret) and UPI Intent is enabled for this sandbox merchant.`;
    }
    if (/whitelist|ip address/i.test(String(msg))) {
      msg = `${msg} Add your server’s outbound IP (or full CIDR ranges from your host, e.g. Render) in Paysharp → API IP Whitelisting.`;
    }
    let status = 502;
    if (Number.isFinite(c) && c >= 400 && c < 600) status = c;
    const err = new Error(msg);
    err.status = status;
    err.raw = raw;
    throw err;
  }

  const data = raw.data && typeof raw.data === 'object' ? raw.data : {};
  const checkoutUrl =
    data.intentUrl || data.phonepeUrl || data.gpayUrl || data.intent_url || raw.intentUrl;
  if (!checkoutUrl) {
    const err = new Error('Paysharp UPI Intent response missing intentUrl.');
    err.status = 502;
    err.raw = raw;
    throw err;
  }

  const rawOut = { ...raw, paysharpCheckoutMode: 'upi_intent' };
  if (paysharpDebugLogEnabled()) {
    // eslint-disable-next-line no-console
    console.warn('[PAYSHARP_DEBUG] intentUrl (truncated):', String(checkoutUrl).slice(0, 500));
  }
  return { checkoutUrl: String(checkoutUrl), raw: rawOut };
}

/**
 * @param {object} params
 * @param {string} params.apiKey - Bearer: secret key or API token (see platformGatewayConfig).
 * @param {string} [params.merchantId] - Optional; logged in debug only for Link Payment.
 * @param {string} params.apiBaseUrl - Link Payment host only (sandbox.paysharp.co.in or live); ignored when mode=intent.
 * @param {number} params.amountPaise
 * @param {string} params.orderId
 * @param {string} params.customerEmail
 * @param {string} [params.customerName]
 * @param {string} [params.customerMobile] - digits; 10-digit Indian mobile recommended
 * @param {string} [params.customerId] - company/user id for UPI Intent customerId (max 36); optional for Link Payment
 * @param {boolean} [params.useSandbox] - when intent mode and PAYSHARP_UPI_API_BASE_URL unset, picks sandbox vs live UPI host
 */
async function createPaysharpCheckout({
  apiKey,
  merchantId,
  apiBaseUrl,
  useSandbox,
  amountPaise,
  orderId,
  customerEmail,
  customerName,
  customerMobile,
  customerId,
}) {
  if (String(process.env.PAYMENT_DEV_MOCK_CHECKOUT || '') === '1') {
    const fe = String(process.env.FRONTEND_URL || process.env.CORS_ORIGIN?.split(',')[0] || 'http://localhost:5174').trim();
    return {
      checkoutUrl: `${fe.replace(/\/$/, '')}/dashboard/billing?mock=1&order=${encodeURIComponent(orderId)}&amount=${amountPaise}`,
      raw: { mock: true },
    };
  }

  const mode = paysharpCheckoutMode();
  if (mode === 'intent' || mode === 'upi_intent') {
    return createPaysharpUpiIntent({
      apiKey,
      merchantId,
      useSandbox,
      amountPaise,
      orderId,
      customerEmail,
      customerName,
      customerMobile,
      customerId,
    });
  }

  const url = resolveLinkPaymentUrl(apiBaseUrl);
  if (!url) {
    const err = new Error(
      'Paysharp API base URL is not set. Use Super Admin → Paysharp, or set PAYSHARP_API_BASE_URL / PAYSHARP_SANDBOX_API_BASE_URL to the host from your Paysharp dashboard (e.g. https://sandbox.paysharp.co.in).',
    );
    err.status = 400;
    throw err;
  }

  const amountRupees = Math.max(1, Math.round((Number(amountPaise) || 0) / 100));
  const validityHours = Math.min(
    1440,
    Math.max(1, Number(process.env.PAYSHARP_LINK_VALIDITY_HOURS || 168) || 168),
  );
  const remarks = sanitizePaysharpRemarks(orderId || 'order', 20);

  const body = {
    amount: amountRupees,
    remarks,
    validity: validityHours,
    customerName: customerDisplayName(customerName, customerEmail),
    customerMobileNo: tenDigitCustomerMobile(customerMobile),
    customerEmail: String(customerEmail || '').trim().slice(0, 250),
    sendEmail: false,
    sendSms: false,
    sendWhatsApp: false,
  };

  if (paysharpDebugLogEnabled()) {
    // eslint-disable-next-line no-console
    console.warn('[PAYSHARP_DEBUG] ----- outbound Link Payment (local testing; rotate secrets after) -----');
    // eslint-disable-next-line no-console
    console.warn('[PAYSHARP_DEBUG] POST', url);
    // eslint-disable-next-line no-console
    console.warn('[PAYSHARP_DEBUG] merchantId:', String(merchantId || '').trim() || '(empty)');
    // eslint-disable-next-line no-console
    console.warn('[PAYSHARP_DEBUG] Bearer token (full, decrypted):', String(apiKey || '').trim());
    // eslint-disable-next-line no-console
    console.warn('[PAYSHARP_DEBUG] request body JSON:', JSON.stringify(body));
  }

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${String(apiKey).trim()}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (paysharpDebugLogEnabled()) {
      // eslint-disable-next-line no-console
      console.warn('[PAYSHARP_DEBUG] fetch threw:', e);
    }
    const msg = String(e && e.message ? e.message : e);
    if (/Failed to parse URL|Invalid URL|ERR_INVALID_URL/i.test(msg)) {
      const err = new Error(
        'Invalid Paysharp API base URL (must be like https://sandbox.paysharp.co.in). An email or other non-URL was probably saved in Super Admin → Paysharp → API base URL.',
      );
      err.status = 400;
      throw err;
    }
    throw e;
  }

  const ct = String(res.headers.get('content-type') || '').toLowerCase();
  const raw = await res.json().catch(() => ({}));

  if (paysharpDebugLogEnabled()) {
    // eslint-disable-next-line no-console
    console.warn('[PAYSHARP_DEBUG] Paysharp HTTP status:', res.status, 'content-type:', ct || '(none)');
    // eslint-disable-next-line no-console
    console.warn('[PAYSHARP_DEBUG] Paysharp response JSON:', JSON.stringify(raw).slice(0, 8000));
  }

  if (!res.ok) {
    let msg = raw.message || raw.error || `Paysharp HTTP ${res.status}`;
    if (!raw.message && !raw.error && !raw.code && ct.includes('text/html')) {
      msg =
        'Paysharp returned an HTML error page (wrong API path). For sandbox use base https://sandbox.paysharp.co.in (we call /api/v1/upi/linkpayment). For live use the API host from your dashboard (we call /v1/upi/linkpayment).';
    }
    if (/whitelist|ip address/i.test(String(msg))) {
      msg = `${msg} Add your server’s outbound IP (or full CIDR ranges from your host, e.g. Render) in Paysharp → API IP Whitelisting.`;
    }
    const err = new Error(msg);
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
    err.raw = raw;
    throw err;
  }

  if (raw.code != null && Number(raw.code) !== 200) {
    let msg = raw.message || `Paysharp error (code ${raw.code})`;
    const c = Number(raw.code);
    const ec = raw.errorCode != null ? ` (errorCode ${raw.errorCode})` : '';
    if (c === 401 || /access denied/i.test(String(msg))) {
      msg = `Paysharp access denied${ec}. Use the dashboard API token in Super Admin → API token (Bearer), or PAYSHARP_API_TOKEN on the server — not the webhook secret.`;
    } else if (c === 404 || /not found/i.test(String(msg))) {
      msg = `Paysharp: ${msg}${ec}. Check API base URL and path (sandbox: https://sandbox.paysharp.co.in → /api/v1/upi/linkpayment).`;
    } else if (c >= 500 || /internal server error/i.test(String(msg))) {
      msg = `Paysharp: ${msg}${ec}. Usually wrong or expired API token, or Link Payment not enabled for this sandbox account — confirm token in Paysharp Settings → Configuration.`;
    }
    if (/whitelist|ip address/i.test(String(msg))) {
      msg = `${msg} Add your server’s outbound IP (or full CIDR ranges from your host, e.g. Render) in Paysharp → API IP Whitelisting.`;
    }
    let status = 502;
    if (Number.isFinite(c) && c >= 400 && c < 600) status = c;
    const err = new Error(msg);
    err.status = status;
    err.raw = raw;
    throw err;
  }

  const data = raw.data && typeof raw.data === 'object' ? raw.data : {};
  const checkoutUrl =
    data.linkPaymentUrl || raw.checkout_url || raw.checkoutUrl || raw.url || raw.payment_url;
  if (!checkoutUrl) {
    const err = new Error('Paysharp response missing link payment URL.');
    err.status = 502;
    err.raw = raw;
    throw err;
  }

  if (paysharpDebugLogEnabled()) {
    // eslint-disable-next-line no-console
    console.warn('[PAYSHARP_DEBUG] checkoutUrl (truncated):', String(checkoutUrl).slice(0, 500));
  }

  return { checkoutUrl: String(checkoutUrl), raw };
}

/**
 * Query Paysharp UPI order status for intent/check-status actions.
 * Returns normalized status shape used by subscription controller.
 */
async function fetchPaysharpUpiOrderStatus({
  apiKey,
  useSandbox,
  orderId,
  paysharpReferenceNo,
}) {
  const url = resolveUpiOrderStatusUrl(Boolean(useSandbox));
  const body = {
    ...(orderId ? { orderId: String(orderId).trim().slice(0, 36) } : {}),
    ...(paysharpReferenceNo ? { paysharpReferenceNo: String(paysharpReferenceNo).trim().slice(0, 80) } : {}),
  };
  if (!body.orderId && !body.paysharpReferenceNo) {
    const err = new Error('Missing order identifier for Paysharp status check.');
    err.status = 400;
    throw err;
  }

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${String(apiKey).trim()}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const err = new Error(`Paysharp status fetch failed: ${String(e?.message || e)}`);
    err.status = 502;
    throw err;
  }

  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(raw.message || raw.error || `Paysharp status HTTP ${res.status}`);
    /** Preserve upstream HTTP class (401/403/404) so callers can return 200 + friendly message instead of blanket 502. */
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
    err.raw = raw;
    throw err;
  }
  if (raw.code != null && Number(raw.code) !== 200) {
    const err = new Error(raw.message || `Paysharp status error (code ${raw.code})`);
    const c = Number(raw.code);
    err.status = c === 401 || c === 403 ? c : c === 404 ? 404 : 502;
    err.raw = raw;
    throw err;
  }

  const data = raw.data && typeof raw.data === 'object' ? raw.data : {};
  const s = String(data.status || raw.status || '').toUpperCase();
  const isSuccess = s === 'SUCCESS' || s === 'PAID' || s === 'CAPTURED';
  const isFailed = s === 'FAILED' || s === 'CANCELLED' || s === 'EXPIRED';
  return {
    gatewayStatus: s || 'PENDING',
    isFinal: isSuccess || isFailed,
    isSuccess,
    isFailed,
    paymentId: String(data.linkPaymentId || data.paysharpReferenceNo || raw.id || '').trim(),
    paysharpReferenceNo: String(data.paysharpReferenceNo || '').trim(),
    failureReason: String(data.failureReason || data.message || raw.message || '').trim(),
    raw,
  };
}

module.exports = {
  createPaysharpCheckout,
  fetchPaysharpUpiOrderStatus,
  validatePaysharpApiBaseUrlInput,
  paysharpDebugLogEnabled,
};
