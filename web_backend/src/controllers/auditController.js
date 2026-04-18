const Company = require('../models/Company');
const ActivityLog = require('../models/ActivityLog');

async function getCompanyIdForAdmin(adminId) {
  const company = await Company.findOne({ adminId }).select('_id');
  return company?._id || null;
}

async function listAuditLogs(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const items = await ActivityLog.find({ companyId }).sort({ createdAt: -1 }).limit(200).lean();
    return res.json({ items });
  } catch (e) {
    return next(e);
  }
}

module.exports = { listAuditLogs };
