const mongoose = require('mongoose');
const Company = require('../models/Company');
const User = require('../models/User');
const LeaveRequest = require('../models/LeaveRequest');

async function getCompanyIdForAdmin(adminId) {
  const company = await Company.findOne({ adminId }).select('_id');
  return company?._id || null;
}

/** Some clients stored fromDate/toDate; schema uses startDate/endDate. */
function normalizeLeaveLean(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  if (out.startDate == null && row.fromDate != null) out.startDate = row.fromDate;
  if (out.endDate == null && row.toDate != null) out.endDate = row.toDate;
  return out;
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

    const fromRaw = String(req.query.from || '').trim();
    const toRaw = String(req.query.to || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromRaw) && /^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
      const rangeStart = new Date(`${fromRaw}T00:00:00.000Z`);
      const rangeEnd = new Date(`${toRaw}T23:59:59.999Z`);
      if (!Number.isNaN(rangeStart.getTime()) && !Number.isNaN(rangeEnd.getTime()) && rangeStart <= rangeEnd) {
        q.startDate = { $lte: rangeEnd };
        q.endDate = { $gte: rangeStart };
      }
    }

    const raw = await LeaveRequest.find(q).sort({ startDate: -1, createdAt: -1 }).limit(500).lean();
    const items = raw.map(normalizeLeaveLean);
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

    const rawStart = req.body.startDate ?? req.body.fromDate;
    const rawEnd = req.body.endDate ?? req.body.toDate ?? rawStart;
    const startDate = new Date(rawStart);
    const endDate = new Date(rawEnd);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ message: 'Valid startDate and endDate are required (or fromDate / toDate).' });
    }
    if (endDate.getTime() < startDate.getTime()) {
      return res.status(400).json({ message: 'endDate must be same as or after startDate.' });
    }

    const leaveType = String(req.body.leaveType || '').trim();
    const item = await LeaveRequest.create({
      companyId,
      userId,
      leaveType,
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

    const id = String(req.params.id || '');
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid leave id.' });
    }

    /** Atomic update avoids full-document validation on legacy rows missing startDate/endDate. */
    const item = await LeaveRequest.findOneAndUpdate(
      { _id: id, companyId },
      {
        $set: {
          status,
          reviewedBy: req.admin._id,
          reviewedAt: new Date(),
        },
      },
      { new: true, lean: true },
    );

    if (!item) return res.status(404).json({ message: 'Leave request not found.' });

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
