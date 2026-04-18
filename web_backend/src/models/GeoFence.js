const mongoose = require('mongoose');

const geoFenceSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    /** Office / branch subdocument id from `Company.branches` — limits fence to that branch’s staff. */
    branchId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    name: { type: String, required: true, trim: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    radiusM: { type: Number, required: true, min: 10 },
    alertOnEntry: { type: Boolean, default: true },
    alertOnExit: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

geoFenceSchema.index({ companyId: 1, branchId: 1 });

module.exports = mongoose.model('GeoFence', geoFenceSchema);
