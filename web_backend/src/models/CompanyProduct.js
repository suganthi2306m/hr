const mongoose = require('mongoose');

const companyProductSchema = new mongoose.Schema(
  {
    /** Set for one company only. Omit when [portfolioSuperAdminId] is set (all companies that super admin created). */
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    /** Partner/main super admin id — product visible to every company where Company.createdBySuperAdminId matches. */
    portfolioSuperAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null, index: true },
    name: { type: String, required: true, trim: true },
    shortDescription: { type: String, trim: true, default: '' },
    fullDescription: { type: String, trim: true, default: '' },
    bannerImage: { type: String, trim: true, default: '' },
    /** Optional product video (https URL, e.g. mp4 or YouTube watch link). */
    videoUrl: { type: String, trim: true, default: '' },
    images: [{ type: String, trim: true }],
    price: { type: Number, default: null },
    offerTag: { type: String, trim: true, default: '' },
    showInApp: { type: Boolean, default: true },
    highlightProduct: { type: Boolean, default: false },
    showOnHomeBanner: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    ctaLabel: { type: String, trim: true, default: 'Contact Us' },
    ctaType: { type: String, enum: ['none', 'phone', 'url', 'email'], default: 'none' },
    ctaValue: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

companyProductSchema.index({ companyId: 1, status: 1, showInApp: 1 });
companyProductSchema.index({ portfolioSuperAdminId: 1, status: 1, showInApp: 1 });

companyProductSchema.pre('validate', function companyProductScopeXor() {
  const hasCo = this.companyId != null;
  const hasP = this.portfolioSuperAdminId != null;
  if (!hasCo && !hasP) {
    this.invalidate('companyId', 'Set companyId or portfolioSuperAdminId.');
  }
  if (hasCo && hasP) {
    this.invalidate('companyId', 'Use only one of companyId or portfolioSuperAdminId.');
  }
});

module.exports = mongoose.model('CompanyProduct', companyProductSchema);
