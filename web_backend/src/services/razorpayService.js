const crypto = require('crypto');

const RAZORPAY_API = 'https://api.razorpay.com/v1';

function basicAuthHeader(keyId, keySecret) {
  const token = Buffer.from(`${keyId}:${keySecret}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

/**
 * Create a Razorpay Payment Link (hosted checkout).
 * @returns {{ id: string, short_url: string, raw: object }}
 */
async function createRazorpayPaymentLink({
  keyId,
  keySecret,
  amountPaise,
  currency,
  description,
  referenceId,
  customerEmail,
  callbackUrl,
}) {
  const body = {
    amount: Math.max(100, Math.round(Number(amountPaise) || 0)),
    currency: currency || 'INR',
    description: description || 'Subscription',
    reference_id: String(referenceId || '').slice(0, 40),
    callback_method: 'get',
  };
  if (customerEmail) {
    body.customer = { email: customerEmail };
    body.notify = { sms: false, email: true };
  }
  if (callbackUrl) body.callback_url = callbackUrl;
  const res = await fetch(`${RAZORPAY_API}/payment_links`, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(keyId, keySecret),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = raw?.error?.description || raw?.message || `Razorpay HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = 502;
    err.raw = raw;
    throw err;
  }
  return { id: raw.id, short_url: raw.short_url, raw };
}

function verifyRazorpayWebhookSignature(rawBodyBuffer, signatureHeader, webhookSecret) {
  if (!webhookSecret || !signatureHeader || !rawBodyBuffer) return false;
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBodyBuffer).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(String(signatureHeader), 'utf8'));
  } catch {
    return expected === String(signatureHeader);
  }
}

module.exports = {
  createRazorpayPaymentLink,
  verifyRazorpayWebhookSignature,
};
