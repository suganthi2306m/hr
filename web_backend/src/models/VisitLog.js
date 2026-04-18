const mongoose = require('mongoose');

const visitLogSchema = new mongoose.Schema(
  {
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    checkInTime: { type: Date, required: true, index: true },
    checkOutTime: { type: Date },
    durationSeconds: { type: Number, default: 0 },
    status: { type: String, enum: ['IN', 'OUT'], default: 'IN', index: true },
    // GeoJSON check-in point (required) and optional check-out point.
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    checkOutLocation: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: { type: [Number] },
    },
    source: { type: String, default: 'mobile' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'visit_logs', strict: false },
);

visitLogSchema.index({ location: '2dsphere' });
visitLogSchema.index({ agentId: 1, checkInTime: -1 });
visitLogSchema.index({ customerId: 1, checkInTime: -1 });

module.exports = mongoose.model('VisitLog', visitLogSchema);
