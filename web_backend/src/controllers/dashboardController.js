const Company = require('../models/Company');
const Task = require('../models/Task');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const CompanyVisit = require('../models/CompanyVisit');
const { getLatestLocations } = require('../services/locationService');
const { normalizeStatus } = require('../constants/taskLifecycle');

async function getCompanyIdForAdmin(adminId) {
  const company = await Company.findOne({ adminId }).select('_id');
  return company?._id || null;
}

function isDelayedTask(task) {
  const st = normalizeStatus(task.status);
  if (['completed', 'verified'].includes(st)) return false;
  if (!task.completionDate) return false;
  return new Date(task.completionDate).getTime() < Date.now();
}

async function dashboardSummary(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) {
      return res.status(400).json({ message: 'Complete company setup first.' });
    }

    const companyUsers = await User.find({ companyId }).select('_id name shiftId branchId').lean();
    const companyUserIds = companyUsers.map((u) => u._id);
    const filter = {
      $or: [
        { companyId },
        ...(companyUserIds.length ? [{ assignedTo: { $in: companyUserIds } }] : []),
      ],
    };

    const tasksPromise = Task.find(filter).lean();
    const trackingPromise = getLatestLocations({ limit: 500 });
    const leavePendingPromise = LeaveRequest.countDocuments({ companyId, status: 'pending' });
    const visitsTodayPromise = (async () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return CompanyVisit.countDocuments({
        businessId: companyId,
        checkInTime: { $gte: from, $lte: to },
      });
    })();
    const attendanceTodayPromise = (async () => {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const dayKey = `${y}-${m}-${d}`;
      return Attendance.countDocuments({
        companyId,
        attendanceDayKey: dayKey,
      });
    })();
    const [tasks, tracking, leavePending, visitsToday, punchedInToday] = await Promise.all([
      tasksPromise,
      trackingPromise,
      leavePendingPromise,
      visitsTodayPromise,
      attendanceTodayPromise,
    ]);

    const activeAgents = tracking.filter((t) => t.isActive).length;
    const delayed = tasks.filter(isDelayedTask).length;
    const byStatus = {};
    tasks.forEach((t) => {
      const k = normalizeStatus(t.status);
      byStatus[k] = (byStatus[k] || 0) + 1;
    });

    const perAgent = {};
    companyUsers.forEach((u) => {
      perAgent[String(u._id)] = { name: u.name, completed: 0, total: 0, avgHours: null };
    });
    tasks.forEach((t) => {
      const aid = t.assignedTo && String(t.assignedTo);
      if (!aid || !perAgent[aid]) return;
      perAgent[aid].total += 1;
      if (['completed', 'verified'].includes(normalizeStatus(t.status))) {
        perAgent[aid].completed += 1;
      }
    });

    const completed = tasks.filter((t) => ['completed', 'verified'].includes(normalizeStatus(t.status))).length;
    const completionRate = tasks.length ? Math.round((completed / tasks.length) * 1000) / 10 : 0;
    const totalUsers = companyUsers.length;
    const shiftAssigned = companyUsers.filter((u) => String(u.shiftId || '').trim()).length;
    const branchAssigned = companyUsers.filter((u) => String(u.branchId || '').trim()).length;

    return res.json({
      summary: {
        totalTasks: tasks.length,
        activeAgents,
        delayedTasks: delayed,
        completedTasks: completed,
        completionRate,
        byStatus,
        totalUsers,
        punchedInToday,
        leavePending,
        shiftAssigned,
        shiftNotAssigned: Math.max(0, totalUsers - shiftAssigned),
        branchAssigned,
        branchNotAssigned: Math.max(0, totalUsers - branchAssigned),
        visitsToday,
      },
      perAgent: Object.values(perAgent),
      trackingSample: tracking.slice(0, 50),
    });
  } catch (e) {
    return next(e);
  }
}

module.exports = { dashboardSummary };
