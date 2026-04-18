const LeaveRequest = require('../models/LeaveRequest');

exports.applyLeave = async (req, res) => {
  try {
    const user = req.user;
    if (!user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const leaveType = String(req.body.leaveType || '').toUpperCase().trim();
    const fromDate = new Date(req.body.fromDate);
    const toDate = new Date(req.body.toDate);
    const reason = String(req.body.reason || '').trim();

    if (!['SICK', 'CASUAL', 'PAID'].includes(leaveType)) {
      return res.status(400).json({ success: false, message: 'Invalid leave type' });
    }
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Valid fromDate and toDate are required' });
    }
    if (toDate < fromDate) {
      return res.status(400).json({ success: false, message: 'toDate must be >= fromDate' });
    }

    const overlap = await LeaveRequest.findOne({
      userId: user._id,
      status: { $in: ['PENDING', 'APPROVED'] },
      fromDate: { $lte: toDate },
      toDate: { $gte: fromDate },
    }).lean();
    if (overlap) {
      return res.status(400).json({
        success: false,
        message: 'A pending/approved leave already exists in this date range',
      });
    }

    const leave = await LeaveRequest.create({
      userId: user._id,
      companyId: user.companyId,
      leaveType,
      fromDate,
      toDate,
      reason,
      status: 'PENDING',
    });

    return res.status(201).json({
      success: true,
      message: 'Leave applied successfully',
      leave,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to apply leave',
      error: error.message,
    });
  }
};

exports.getLeaveStatus = async (req, res) => {
  try {
    const user = req.user;
    if (!user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const isAdmin =
      String(user?.role || '').toLowerCase() === 'admin' ||
      String(user?.role || '').toLowerCase() === 'superadmin';
    const query = isAdmin && String(req.query.all || '').toLowerCase() === 'true'
      ? {}
      : { userId: user._id };
    if (isAdmin && req.query.userId) {
      query.userId = req.query.userId;
    }
    if (req.query.status) {
      query.status = String(req.query.status).toUpperCase();
    }
    const leaves = await LeaveRequest.find(query).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: leaves });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch leave status',
      error: error.message,
    });
  }
};

exports.updateLeaveStatus = async (req, res) => {
  try {
    const user = req.user;
    const isAdmin =
      String(user?.role || '').toLowerCase() === 'admin' ||
      String(user?.role || '').toLowerCase() === 'superadmin';
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Only admin can review leave requests' });
    }

    const status = String(req.body.status || '').toUpperCase().trim();
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be APPROVED or REJECTED' });
    }

    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    leave.status = status;
    leave.reviewedBy = user._id;
    leave.reviewedAt = new Date();
    leave.reviewRemark = req.body.reviewRemark || '';
    await leave.save();

    return res.json({
      success: true,
      message: `Leave ${status.toLowerCase()}`,
      leave,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update leave status',
      error: error.message,
    });
  }
};
