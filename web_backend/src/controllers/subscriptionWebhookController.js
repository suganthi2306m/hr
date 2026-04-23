const PaymentTransaction = require('../models/PaymentTransaction');
const { verifyRazorpayWebhookSignature } = require('../services/razorpayService');
const { getRazorpayConfig } = require('../services/platformGatewayConfig');
const { applyCapturedSubscriptionPayment } = require('../services/subscriptionEntitlementService');

/**
 * Razorpay sends JSON body; verify X-Razorpay-Signature over raw bytes.
 */
async function razorpayWebhook(req, res, next) {
  try {
    const raw = req.body;
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(typeof raw === 'string' ? raw : JSON.stringify(raw || {}));
    const sig = req.get('X-Razorpay-Signature') || req.get('x-razorpay-signature');
    const rz = await getRazorpayConfig();
    if (process.env.NODE_ENV === 'production' && !rz.webhookSecret) {
      return res.status(503).json({ message: 'Razorpay webhook secret is not configured.' });
    }
    if (rz.webhookSecret) {
      if (!verifyRazorpayWebhookSignature(buf, sig, rz.webhookSecret)) {
        return res.status(400).json({ message: 'Invalid signature' });
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn('[subscription] Razorpay webhook: no RAZORPAY_WEBHOOK_SECRET / DB secret — skipping signature check (dev only).');
    }

    let payload;
    try {
      payload = JSON.parse(buf.toString('utf8') || '{}');
    } catch {
      return res.status(400).json({ message: 'Invalid JSON' });
    }

    const event = payload.event;
    if (event !== 'payment_link.paid') {
      return res.json({ ok: true, ignored: event });
    }

    const entity = payload.payload?.payment_link?.entity || {};
    const referenceId = String(entity.reference_id || '').trim();
    const paymentId = String(entity.id || '').trim();

    if (!referenceId) return res.json({ ok: true, note: 'no reference' });

    const pay = await PaymentTransaction.findOne({
      gateway: 'razorpay',
      gatewayOrderId: referenceId,
      status: 'created',
    });
    if (!pay) {
      return res.json({ ok: true, note: 'payment not found or already processed' });
    }

    pay.status = 'captured';
    pay.gatewayPaymentId = paymentId || pay.gatewayPaymentId;
    pay.externalPaymentId = paymentId || pay.externalPaymentId;
    pay.paidAt = new Date();
    pay.gatewayPayload = { ...((pay.gatewayPayload && typeof pay.gatewayPayload === 'object' && pay.gatewayPayload) || {}), webhook: payload };
    await pay.save();

    await applyCapturedSubscriptionPayment(pay);
    return res.json({ ok: true });
  } catch (e) {
    return next(e);
  }
}

/**
 * Paysharp success webhook — extend when your gateway sends a verifiable payload.
 * Expect JSON: { order_id, status: 'success'|'failed', payment_id?, reason? }
 */
async function paysharpWebhook(req, res, next) {
  try {
    const raw = req.body;
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(typeof raw === 'string' ? raw : JSON.stringify(raw || {}));
    let body;
    try {
      body = JSON.parse(buf.toString('utf8') || '{}');
    } catch {
      return res.status(400).json({ message: 'Invalid JSON' });
    }

    const payloadData = body && typeof body.data === 'object' && body.data ? body.data : {};
    const orderId = String(
      body.orderId ||
        body.order_id ||
        body.reference_id ||
        payloadData.orderId ||
        payloadData.order_id ||
        '',
    ).trim();
    const rawStatus = String(body.status || payloadData.status || '').trim().toUpperCase();
    if (!orderId) return res.status(400).json({ message: 'Missing orderId/order_id' });

    const pay = await PaymentTransaction.findOne({
      gateway: 'paysharp',
      gatewayOrderId: orderId,
    });
    if (!pay) return res.json({ ok: true, note: 'unknown order' });

    if (rawStatus === 'SUCCESS' || rawStatus === 'CAPTURED' || rawStatus === 'PAID') {
      if (pay.status === 'captured') return res.json({ ok: true, idempotent: true });
      pay.status = 'captured';
      const paymentId = String(
        body.payment_id ||
          body.paymentId ||
          body.id ||
          payloadData.payment_id ||
          payloadData.paymentId ||
          payloadData.linkPaymentId ||
          payloadData.paysharpReferenceNo ||
          '',
      ).trim();
      pay.gatewayPaymentId = paymentId || pay.gatewayPaymentId;
      pay.externalPaymentId = pay.gatewayPaymentId || pay.externalPaymentId;
      pay.paidAt = new Date(payloadData.transactionDate || body.transactionDate || Date.now());
      pay.gatewayPayload = {
        ...((pay.gatewayPayload && typeof pay.gatewayPayload === 'object' && pay.gatewayPayload) || {}),
        webhook: body,
      };
      await pay.save();
      await applyCapturedSubscriptionPayment(pay);
      return res.json({ ok: true });
    }

    if (rawStatus === 'FAILED' || rawStatus === 'CANCELLED' || rawStatus === 'EXPIRED') {
      pay.status = 'failed';
      pay.failureReason = String(
        payloadData.failureReason ||
          payloadData.failureCode ||
          body.failureReason ||
          body.failureCode ||
          body.reason ||
          body.message ||
          rawStatus,
      ).slice(0, 500);
      pay.gatewayPayload = {
        ...((pay.gatewayPayload && typeof pay.gatewayPayload === 'object' && pay.gatewayPayload) || {}),
        webhook: body,
      };
      await pay.save();
      return res.json({ ok: true });
    }

    return res.json({ ok: true, note: 'no-op status' });
  } catch (e) {
    return next(e);
  }
}

module.exports = { razorpayWebhook, paysharpWebhook };
