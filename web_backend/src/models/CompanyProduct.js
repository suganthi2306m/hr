const mongoose = require('mongoose');

const companyProductSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true, trim: true },
    shortDescription: { type: String, trim: true, default: '' },
    fullDescription: { type: String, trim: true, default: '' },
    bannerImage: { type: String, trim: true, default: '' },
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

module.exports = mongoose.model('CompanyProduct', companyProductSchema);
