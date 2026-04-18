const mongoose = require('mongoose');
const DashboardNotification = require('../models/DashboardNotification');

function resolveCompanyId(user) {
  const c = user?.companyId;
  if (c && typeof c === 'object' && c._id) return c._id;
  return c;
}

exports.listOpsNotifications = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req.user);
    if (!companyId) {
      return res.status(200).json({ items: [] });
    }
    const items = await DashboardNotification.find({ companyId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return res.status(200).json({ items });
  } catch (e) {
    console.error('[ops] list notifications:', e);
    return res.status(500).json({ success: false, message: 'Could not load notifications.' });
  }
};

exports.markOpsNotificationRead = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req.user);
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'Company not set.' });
    }
    const id = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id) || id.length !== 24) {
      return res.status(400).json({ success: false, message: 'Invalid id.' });
    }
    const item = await DashboardNotification.findOneAndUpdate(
      { _id: id, companyId },
      { $set: { readAt: new Date() } },
      { new: true },
    ).lean();
    if (!item) {
      return res.status(404).json({ success: false, message: 'Not found.' });
    }
    return res.status(200).json({ success: true, item });
  } catch (e) {
    console.error('[ops] mark read:', e);
    return res.status(500).json({ success: false, message: 'Could not update notification.' });
  }
};
