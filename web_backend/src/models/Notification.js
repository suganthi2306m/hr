const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    type: { type: String, trim: true, default: 'info' },
    title: { type: String, required: true, trim: true },
    body: { type: String, trim: true, default: '' },
    readAt: { type: Date, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Notification', notificationSchema);
