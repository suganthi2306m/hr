const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    action: { type: String, required: true, trim: true },
    entity: { type: String, trim: true, default: '' },
    entityId: { type: String, trim: true, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

module.exports = mongoose.model('ActivityLog', activityLogSchema);
