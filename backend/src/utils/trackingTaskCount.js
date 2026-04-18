const mongoose = require('mongoose');
const Tracking = require('../models/locations');
const User = require('../models/User');
const Company = require('../models/Company');
const { formatCalendarDayInTimezone } = require('./dateUtils');

function getBusinessTimezone(company) {
  const tz = company?.settings?.business?.timezone || company?.timezone;
  return typeof tz === 'string' && tz.trim() ? tz.trim() : 'Asia/Kolkata';
}

/**
 * Resolve company business IANA timezone for a user doc or id.
 * @param {import('mongoose').Types.ObjectId|string|{ companyId?: import('mongoose').Types.ObjectId, businessId?: import('mongoose').Types.ObjectId }} userOrId
 */
async function resolveBusinessTimezone(userOrId) {
  let businessId = null;
  if (userOrId != null && typeof userOrId === 'object' && (userOrId.companyId || userOrId.businessId)) {
    businessId = userOrId.companyId || userOrId.businessId;
  } else {
    const sid =
      userOrId != null && typeof userOrId === 'object' && userOrId._id ? userOrId._id : userOrId;
    if (sid) {
      const u = await User.findById(sid).select('companyId businessId').lean();
      businessId = u?.companyId || u?.businessId;
    }
  }
  if (!businessId) return getBusinessTimezone(null);
  const c = await Company.findById(businessId).select('settings.business.timezone timezone').lean();
  return getBusinessTimezone(c);
}

/**
 * Number of distinct tasks the user has tracking for on the same business-calendar day as `atTime`
 * (timestamp <= atTime), plus `taskId` if provided so the first point of a new task counts immediately.
 */
async function computeDailyTaskCountForStaff({ staffId, taskId, atTime, timeZone }) {
  const useTz = (timeZone && String(timeZone).trim()) || getBusinessTimezone(null);
  const staffObjectId = mongoose.Types.ObjectId.isValid(String(staffId))
    ? new mongoose.Types.ObjectId(String(staffId))
    : staffId;
  const calendarDayKey = formatCalendarDayInTimezone(atTime, useTz);

  const rows = await Tracking.aggregate([
    {
      $match: {
        $or: [{ usersId: staffObjectId }, { userId: staffObjectId }, { staffId: staffObjectId }],
        taskId: { $exists: true, $ne: null },
        timestamp: { $lte: atTime },
      },
    },
    {
      $addFields: {
        _dayKey: {
          $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: useTz },
        },
      },
    },
    { $match: { _dayKey: calendarDayKey } },
    { $group: { _id: '$taskId' } },
  ]);

  const ids = new Set(rows.map((r) => String(r._id)));
  if (taskId != null && taskId !== '') {
    const tid = taskId._id || taskId;
    ids.add(String(tid));
  }
  return ids.size;
}

module.exports = { resolveBusinessTimezone, computeDailyTaskCountForStaff };
