const mongoose = require('mongoose');

const geoFenceSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true, trim: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    radiusM: { type: Number, required: true, min: 10 },
    alertOnEntry: { type: Boolean, default: true },
    alertOnExit: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('GeoFence', geoFenceSchema);
