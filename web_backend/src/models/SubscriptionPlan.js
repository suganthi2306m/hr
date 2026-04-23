const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema(
  {
    /** Super admin (main or partner) who owns this catalog row. */
    createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    /** URL-safe identifier, e.g. "basic", "premium" — unique per owner (see compound index). */
    planCode: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    priceInr: { type: Number, default: 0 },
    /** Billing period length used when issuing licenses / companies */
    durationMonths: { type: Number, default: 12, min: 1, max: 120 },
    maxUsers: { type: Number, required: true, min: 1, max: 100000 },
    maxBranches: { type: Number, required: true, min: 1, max: 500 },
    trialDays: { type: Number, default: 0, min: 0, max: 365 },
    /** Short token embedded in license keys, e.g. BAS, PRE (3–4 chars) */
    licensePrefix: { type: String, required: true, trim: true, uppercase: true, maxlength: 4 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

subscriptionPlanSchema.index({ createdByAdminId: 1, planCode: 1 }, { unique: true });

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
