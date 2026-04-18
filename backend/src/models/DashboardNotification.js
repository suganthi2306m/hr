const mongoose = require('mongoose');

/**
 * In-app notifications for the web dashboard (per company).
 * Persisted for history; Socket.IO pushes the same payload in real time.
 */
const dashboardNotificationSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '', trim: true },
    type: { type: String, default: 'general', trim: true, index: true },
    readAt: { type: Date, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'dashboardNotifications' },
);

dashboardNotificationSchema.index({ companyId: 1, createdAt: -1 });

module.exports = mongoose.model('DashboardNotification', dashboardNotificationSchema);
