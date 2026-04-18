const Company = require('../models/Company');
const Notification = require('../models/Notification');

async function getCompanyIdForAdmin(adminId) {
  const company = await Company.findOne({ adminId }).select('_id');
  return company?._id || null;
}

async function listNotifications(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const items = await Notification.find({ companyId }).sort({ createdAt: -1 }).limit(100).lean();
    return res.json({ items });
  } catch (e) {
    return next(e);
  }
}

async function markNotificationRead(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const item = await Notification.findOneAndUpdate(
      { _id: req.params.id, companyId },
      { $set: { readAt: new Date() } },
      { new: true },
    );
    if (!item) return res.status(404).json({ message: 'Not found.' });
    return res.json({ item });
  } catch (e) {
    return next(e);
  }
}

async function createInternalNotification({ companyId, adminId, type, title, body, meta }) {
  return Notification.create({
    companyId,
    adminId,
    type: type || 'info',
    title,
    body: body || '',
    meta: meta || {},
  });
}

module.exports = { listNotifications, markNotificationRead, createInternalNotification };
