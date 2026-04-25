const mongoose = require('mongoose');

const paymentTransactionSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    companyName: { type: String, default: '', trim: true },
    payerEmail: { type: String, default: '', trim: true },
    amountPaise: { type: Number, default: 0 },
    currency: { type: String, default: 'INR', trim: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', default: null },
    planName: { type: String, default: '', trim: true },
    durationMonths: { type: Number, default: 12, min: 1, max: 120 },
    licenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'License', default: null },
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    /** Super admin whose gateway credentials were used (see Company.createdBySuperAdminId). */
    billingAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null, index: true },
    gateway: { type: String, default: 'razorpay', trim: true },
    method: { type: String, default: 'link', trim: true },
    status: { type: String, default: 'created', trim: true },
    /** Our stable id sent to gateway as reference_id (Razorpay) or client order id. */
    gatewayOrderId: { type: String, default: '', trim: true, index: true },
    /** Gateway payment / link id (e.g. plink_xxx, paysharp payment id). */
    gatewayPaymentId: { type: String, default: '', trim: true },
    /** Legacy / display: prefer gatewayPaymentId when set. */
    externalPaymentId: { type: String, default: '', trim: true },
    failureReason: { type: String, default: '', trim: true },
    paidAt: { type: Date, default: null },
    gatewayPayload: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

paymentTransactionSchema.index({ createdAt: -1 });
paymentTransactionSchema.index({ payerEmail: 1 });
paymentTransactionSchema.index({ externalPaymentId: 1 });
paymentTransactionSchema.index({ companyId: 1, createdAt: -1 });

module.exports = mongoose.model('PaymentTransaction', paymentTransactionSchema);
