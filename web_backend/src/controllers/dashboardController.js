const Company = require('../models/Company');
const Task = require('../models/Task');
const User = require('../models/User');
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

    const companyUsers = await User.find({ companyId }).select('_id name').lean();
    const companyUserIds = companyUsers.map((u) => u._id);
    const filter = {
      $or: [
        { companyId },
        ...(companyUserIds.length ? [{ assignedTo: { $in: companyUserIds } }] : []),
      ],
    };

    const tasks = await Task.find(filter).lean();
    const tracking = await getLatestLocations({ limit: 500 });

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

    return res.json({
      summary: {
        totalTasks: tasks.length,
        activeAgents,
        delayedTasks: delayed,
        completedTasks: completed,
        completionRate,
        byStatus,
      },
      perAgent: Object.values(perAgent),
      trackingSample: tracking.slice(0, 50),
    });
  } catch (e) {
    return next(e);
  }
}

module.exports = { dashboardSummary };
