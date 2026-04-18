const mongoose = require('mongoose');
const Company = require('../models/Company');
const User = require('../models/User');
const LeaveRequest = require('../models/LeaveRequest');

async function getCompanyIdForAdmin(adminId) {
  const company = await Company.findOne({ adminId }).select('_id');
  return company?._id || null;
}

async function listLeaves(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });

    const q = { companyId };
    if (req.query.userId && mongoose.Types.ObjectId.isValid(String(req.query.userId))) {
      q.userId = new mongoose.Types.ObjectId(String(req.query.userId));
    }
    if (req.query.status && ['pending', 'approved', 'rejected'].includes(String(req.query.status))) {
      q.status = String(req.query.status);
    }

    const items = await LeaveRequest.find(q).sort({ startDate: -1, createdAt: -1 }).limit(500).lean();
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
}

async function createLeave(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });

    const userId = String(req.body.userId || '');
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Valid userId is required.' });
    }
    const user = await User.findOne({ _id: userId, companyId }).select('_id').lean();
    if (!user) {
      return res.status(400).json({ message: 'User not in company.' });
    }

    const startDate = new Date(req.body.startDate);
    const endDate = new Date(req.body.endDate || req.body.startDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ message: 'Valid startDate and endDate are required.' });
    }
    if (endDate.getTime() < startDate.getTime()) {
      return res.status(400).json({ message: 'endDate must be same as or after startDate.' });
    }

    const item = await LeaveRequest.create({
      companyId,
      userId,
      startDate,
      endDate,
      reason: String(req.body.reason || '').trim(),
      status: 'pending',
    });

    return res.status(201).json({ item });
  } catch (error) {
    return next(error);
  }
}

async function updateLeaveStatus(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });

    const status = String(req.body.status || '').toLowerCase();
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'status must be pending, approved, or rejected.' });
    }

    const item = await LeaveRequest.findOne({ _id: req.params.id, companyId });
    if (!item) return res.status(404).json({ message: 'Leave request not found.' });

    item.status = status;
    item.reviewedBy = req.admin._id;
    item.reviewedAt = new Date();
    await item.save();

    return res.json({ item });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listLeaves,
  createLeave,
  updateLeaveStatus,
};
