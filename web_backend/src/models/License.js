const mongoose = require('mongoose');

const LICENSE_STATUSES = ['active', 'expired', 'suspended', 'unassigned', 'revoked'];

const licenseSchema = new mongoose.Schema(
  {
    licenseKey: { type: String, required: true, unique: true, trim: true, uppercase: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    planCode: { type: String, trim: true, default: '' },
    planName: { type: String, trim: true, default: '' },
    maxUsers: { type: Number, required: true, min: 1 },
    maxBranches: { type: Number, required: true, min: 1 },
    validUntil: { type: Date, required: true },
    status: { type: String, enum: LICENSE_STATUSES, default: 'unassigned' },
    isTrial: { type: Boolean, default: false },
    notes: { type: String, trim: true, default: '' },
    createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true },
);

licenseSchema.index({ status: 1, validUntil: 1 });

module.exports = mongoose.model('License', licenseSchema);
module.exports.LICENSE_STATUSES = LICENSE_STATUSES;
