const mongoose = require('mongoose');
const Company = require('../models/Company');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const {
  normalizeDateOnly,
  endOfDay,
  parseTimeForDate,
  parseTimeFromDayStartUtc,
  instantFromEpochMsOrIso,
  isReasonableTzOffset,
  dayRangeFromDayKeyAndTzOffset,
  resolveDayRangeFromRequest,
  normalizeDayKey,
  formatLocalYmdFromDate,
} = require('../utils/attendanceTime');

async function getCompanyIdForAdmin(adminId) {
  const company = await Company.findOne({ adminId }).select('_id');
  return company?._id || null;
}

function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Apply resolved in/out times; when dashboard sends loginTime + valid check-in but no check-out, clear checkout. */
function applyMarkPunchFields(item, inTime, outTime, loginTime, dayStartForPunch) {
  const hadLoginTimePayload = loginTime != null && typeof loginTime === 'object';
  if (dayStartForPunch) item.attendanceDate = dayStartForPunch;
  if (inTime) item.checkInAt = inTime;
  if (outTime) {
    item.checkOutAt = outTime;
  } else if (hadLoginTimePayload && inTime) {
    item.checkOutAt = undefined;
    item.checkOutLat = undefined;
    item.checkOutLng = undefined;
  }
  if (item.checkInAt && item.checkOutAt) {
    item.minutesWorked = Math.max(
      0,
      Math.round((item.checkOutAt.getTime() - item.checkInAt.getTime()) / 60000),
    );
  } else {
    item.minutesWorked = null;
  }
}

/**
 * `checkInAt` is required on the schema. Decision-only `/mark` calls often omit `loginTime`, so `inTime`
 * is null and we must not leave `checkInAt` missing (e.g. lean/mobile docs with only `checkInTime`).
 */
async function ensureCheckInAtPersistable(item, { prevCheckInAt, dayStartForPunch, day }) {
  const cur = item.checkInAt;
  if (cur && !Number.isNaN(new Date(cur).getTime())) return;
  if (prevCheckInAt && !Number.isNaN(new Date(prevCheckInAt).getTime())) {
    item.checkInAt = new Date(prevCheckInAt.getTime());
    return;
  }
  if (item._id) {
    try {
      const raw = await Attendance.collection.findOne(
        { _id: item._id },
        { projection: { checkInAt: 1, checkInTime: 1 } },
      );
      const fromRaw = raw && (raw.checkInAt || raw.checkInTime);
      if (fromRaw) {
        item.checkInAt = new Date(fromRaw);
        return;
      }
    } catch (_) {
      /* ignore */
    }
  }
  const anchor = dayStartForPunch || day;
  if (anchor && !Number.isNaN(anchor.getTime())) {
    item.checkInAt = new Date(anchor.getTime());
    return;
  }
  item.checkInAt = new Date();
}

async function listAttendance(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const q = { companyId };
    if (req.query.userId && mongoose.Types.ObjectId.isValid(String(req.query.userId))) {
      q.userId = req.query.userId;
    }
    const fromKey = normalizeDayKey(req.query.from);
    const toKey = normalizeDayKey(req.query.to);
    if (fromKey && toKey) {
      const rangeStart = normalizeDateOnly(req.query.from);
      const rangeEnd = endOfDay(normalizeDateOnly(req.query.to));
      if (rangeStart && rangeEnd && !Number.isNaN(rangeStart.getTime()) && !Number.isNaN(rangeEnd.getTime())) {
        q.$or = [
          { attendanceDayKey: { $gte: fromKey, $lte: toKey } },
          { attendanceDate: { $gte: rangeStart, $lte: rangeEnd } },
        ];
      } else {
        q.attendanceDayKey = { $gte: fromKey, $lte: toKey };
      }
    }
    const limit = fromKey && toKey ? 500 : 200;
    const items = await Attendance.find(q)
      .sort({ attendanceDayKey: 1, checkInAt: -1 })
      .limit(limit)
      .lean();
    return res.json({ items });
  } catch (e) {
    return next(e);
  }
}

/**
 * One attendance document per (companyId, userId, calendar day).
 * Merges legacy duplicates (same dayKey or overlapping attendanceDate) and deletes extras.
 */
async function resolveSingleDayAttendanceDoc(companyId, userId, dayKey, rangeStart, rangeEnd) {
  const orClause = [];
  if (dayKey) orClause.push({ attendanceDayKey: dayKey });
  if (rangeStart && rangeEnd && !Number.isNaN(rangeStart.getTime()) && !Number.isNaN(rangeEnd.getTime())) {
    orClause.push({ attendanceDate: { $gte: rangeStart, $lte: rangeEnd } });
  }
  if (!orClause.length) return null;

  const candidates = await Attendance.find({ companyId, userId, $or: orClause }).sort({ createdAt: 1 });
  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const ap = dayKey && String(a.attendanceDayKey) === dayKey;
    const bp = dayKey && String(b.attendanceDayKey) === dayKey;
    if (ap !== bp) return ap ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  const keeper = candidates[0];
  const dupIds = candidates.slice(1).map((c) => c._id);
  if (dupIds.length) await Attendance.deleteMany({ _id: { $in: dupIds } });
  return Attendance.findById(keeper._id);
}

async function getDailyAttendance(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });

    const fromClient = resolveDayRangeFromRequest({ query: req.query });
    let day;
    let dayEnd;
    if (fromClient) {
      day = fromClient.start;
      dayEnd = fromClient.end;
    } else {
      day = normalizeDateOnly(req.query.date);
      if (!day) return res.status(400).json({ message: 'Invalid date.' });
      dayEnd = endOfDay(day);
    }
    const dayKey = normalizeDayKey(req.query.date);
    const q = { companyId };
    if (dayKey) {
      q.$or = [
        { attendanceDayKey: dayKey },
        { attendanceDate: { $gte: day, $lte: dayEnd } },
      ];
    } else {
      q.attendanceDate = { $gte: day, $lte: dayEnd };
    }
    if (req.query.userId && mongoose.Types.ObjectId.isValid(String(req.query.userId))) {
      q.userId = req.query.userId;
    }
    const raw = await Attendance.find(q).sort({ updatedAt: -1 }).lean();
    const groups = new Map();
    for (const row of raw) {
      const uid = String(row.userId);
      if (!groups.has(uid)) groups.set(uid, []);
      groups.get(uid).push(row);
    }
    const dupIds = [];
    const items = [];
    for (const rows of groups.values()) {
      rows.sort((a, b) => {
        const ap = dayKey && String(a.attendanceDayKey) === dayKey;
        const bp = dayKey && String(b.attendanceDayKey) === dayKey;
        if (ap !== bp) return ap ? -1 : 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
      const keeper = rows[0];
      items.push(keeper);
      for (let i = 1; i < rows.length; i += 1) dupIds.push(rows[i]._id);
    }
    if (dupIds.length) await Attendance.deleteMany({ _id: { $in: dupIds } });

    return res.json({ items, date: day.toISOString() });
  } catch (e) {
    return next(e);
  }
}

async function checkIn(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const { userId, lat, lng, method } = req.body;
    // eslint-disable-next-line no-console
    console.log('[Attendance][api] POST /attendance/check-in', {
      adminId: String(req.admin?._id || ''),
      userId: String(userId || ''),
      method: method || 'manual',
      hasLatLng: lat != null && lng != null,
    });
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
      return res.status(400).json({ message: 'userId is required.' });
    }
    const user = await User.findOne({ _id: userId, companyId })
      .select('_id branchId attendanceGeofenceEnabled')
      .lean();
    if (!user) return res.status(400).json({ message: 'User not in company.' });
    const geofenceEnabledForEmployee = user.attendanceGeofenceEnabled !== false;
    if (geofenceEnabledForEmployee) {
      if (!String(user.branchId || '').trim()) {
        return res.status(400).json({ message: 'User has no branch assigned. Assign a branch for geofence punch-in.' });
      }
      const company = await Company.findById(companyId).select('branches').lean();
      const branch = (company?.branches || []).find((b) => String(b?._id || '') === String(user.branchId || ''));
      if (!branch) {
        return res.status(400).json({ message: 'Assigned branch not found for this user.' });
      }
      const geofence = branch.geofence && typeof branch.geofence === 'object' ? branch.geofence : {};
      const branchGeofenceEnabled = geofence.enabled !== false;
      if (branchGeofenceEnabled) {
        const glat = Number(geofence.lat);
        const glng = Number(geofence.lng);
        const radiusM = Math.max(10, Number(geofence.radiusM) || 150);
        const ulat = Number(lat);
        const ulng = Number(lng);
        if (!Number.isFinite(glat) || !Number.isFinite(glng)) {
          return res.status(400).json({ message: 'Branch geofence is not configured (missing latitude/longitude).' });
        }
        if (!Number.isFinite(ulat) || !Number.isFinite(ulng)) {
          return res.status(400).json({ message: 'Location is required for geofence-enabled punch-in.' });
        }
        const distM = haversineDistanceMeters(ulat, ulng, glat, glng);
        if (distM > radiusM) {
          return res.status(403).json({
            message: `Outside branch geofence radius (${Math.round(distM)}m > ${Math.round(radiusM)}m). Punch in within your branch radius.`,
          });
        }
      }
    }
    const open = await Attendance.findOne({ userId, companyId, checkOutAt: null }).sort({ checkInAt: -1 });
    if (open) {
      return res.status(409).json({ message: 'User already checked in. Check out first.', item: open });
    }
    const ad = normalizeDateOnly(new Date());
    const dayKey = formatLocalYmdFromDate(ad);
    const sameDay = dayKey
      ? await Attendance.findOne({ companyId, userId, attendanceDayKey: dayKey })
      : null;
    if (sameDay) {
      sameDay.checkInAt = new Date();
      sameDay.attendanceDate = ad;
      sameDay.dayStatus = 'PRESENT';
      sameDay.checkOutAt = undefined;
      sameDay.checkOutLat = undefined;
      sameDay.checkOutLng = undefined;
      sameDay.minutesWorked = null;
      sameDay.checkInLat = lat != null ? Number(lat) : undefined;
      sameDay.checkInLng = lng != null ? Number(lng) : undefined;
      sameDay.method = method === 'geo' ? 'geo' : 'manual';
      await sameDay.save();
      // eslint-disable-next-line no-console
      console.log('[Attendance][api] check-in updated same-day row', {
        id: String(sameDay._id),
        checkInAt: sameDay.checkInAt?.toISOString?.(),
        attendanceDayKey: sameDay.attendanceDayKey,
      });
      return res.status(201).json({ item: sameDay });
    }
    const item = await Attendance.create({
      companyId,
      userId,
      checkInAt: new Date(),
      attendanceDate: ad,
      attendanceDayKey: dayKey,
      dayStatus: 'PRESENT',
      checkInLat: lat != null ? Number(lat) : undefined,
      checkInLng: lng != null ? Number(lng) : undefined,
      method: method === 'geo' ? 'geo' : 'manual',
    });
    // eslint-disable-next-line no-console
    console.log('[Attendance][api] check-in created', {
      id: String(item._id),
      checkInAt: item.checkInAt?.toISOString?.(),
      attendanceDayKey: item.attendanceDayKey,
    });
    return res.status(201).json({ item });
  } catch (e) {
    return next(e);
  }
}

async function checkOut(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const { userId, lat, lng } = req.body;
    // eslint-disable-next-line no-console
    console.log('[Attendance][api] POST /attendance/check-out', {
      adminId: String(req.admin?._id || ''),
      userId: String(userId || ''),
    });
    if (!userId) return res.status(400).json({ message: 'userId is required.' });
    const open = await Attendance.findOne({ userId, companyId, checkOutAt: null }).sort({ checkInAt: -1 });
    if (!open) return res.status(404).json({ message: 'No open check-in.' });
    const out = new Date();
    const minutesWorked = Math.max(0, Math.round((out.getTime() - open.checkInAt.getTime()) / 60000));
    open.checkOutAt = out;
    open.checkOutLat = lat != null ? Number(lat) : undefined;
    open.checkOutLng = lng != null ? Number(lng) : undefined;
    open.minutesWorked = minutesWorked;
    await open.save();
    // eslint-disable-next-line no-console
    console.log('[Attendance][api] check-out saved', {
      id: String(open._id),
      checkOutAt: open.checkOutAt?.toISOString?.(),
      minutesWorked: open.minutesWorked,
    });
    return res.json({ item: open });
  } catch (e) {
    return next(e);
  }
}

async function markStatus(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const {
      userId,
      status,
      date,
      note,
      loginTime,
      logoutTime,
      leaveKind,
      approvalAction,
    } = req.body;
    const timesOnly = Boolean(req.body.timesOnly);
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
      return res.status(400).json({ message: 'userId is required.' });
    }
    const clientRange = resolveDayRangeFromRequest({ body: req.body });
    let day;
    let dayEnd;
    if (clientRange) {
      day = clientRange.start;
      dayEnd = clientRange.end;
    } else {
      day = normalizeDateOnly(date);
      if (!day) return res.status(400).json({ message: 'Invalid date.' });
      dayEnd = endOfDay(day);
    }

    const statusNorm = String(status || '').toUpperCase().trim();
    if (!timesOnly) {
      if (!['PRESENT', 'ABSENT', 'LEAVE', 'HOLIDAY'].includes(statusNorm)) {
        return res.status(400).json({ message: 'Invalid status.' });
      }
    }

    const approvalActionNorm = String(approvalAction || '').toLowerCase().trim();
    const hasDecisionAction = approvalActionNorm === 'approved' || approvalActionNorm === 'rejected';

    const dayKey = normalizeDayKey(date);
    if (!dayKey) {
      return res.status(400).json({ message: 'Invalid or missing date (expected YYYY-MM-DD).' });
    }

    // eslint-disable-next-line no-console
    console.log('[Attendance][api] POST /attendance/mark', {
      adminId: String(req.admin?._id || ''),
      userId: String(userId),
      timesOnly,
      status: timesOnly ? '(unchanged)' : statusNorm,
      date,
      checkInAt: req.body.checkInAt,
      checkInAtMs: req.body.checkInAtMs,
      checkOutAt: req.body.checkOutAt,
      checkOutAtMs: req.body.checkOutAtMs,
      timeZoneOffsetMinutes: req.body.timeZoneOffsetMinutes,
      hasDayStartISO: Boolean(req.body.dayStartISO),
      loginTime: req.body.loginTime,
    });

    let item = await resolveSingleDayAttendanceDoc(companyId, userId, dayKey, day, dayEnd);

    if (!item) {
      if (timesOnly) {
        return res.status(400).json({ message: 'No attendance row for this day to update.' });
      }
      item = new Attendance({
        companyId,
        userId,
        attendanceDayKey: dayKey,
        attendanceDate: day,
        checkInAt: day,
        dayStatus: statusNorm,
        status: statusNorm,
        method: 'manual',
        approval: {
          status: 'pending',
          requestedBy: req.admin?._id || undefined,
        },
      });
    }

    const checkInFromBody = instantFromEpochMsOrIso(req.body, 'checkInAtMs', 'checkInAt');
    const checkOutFromBody = instantFromEpochMsOrIso(req.body, 'checkOutAtMs', 'checkOutAt');

    const tzoRm = req.body.timeZoneOffsetMinutes ?? req.query.timeZoneOffsetMinutes;
    const dayStartForPunch =
      clientRange?.start
      ?? (dayKey && isReasonableTzOffset(tzoRm)
        ? dayRangeFromDayKeyAndTzOffset(dayKey, Number(tzoRm))?.start
        : null);

    const inTime =
      checkInFromBody
      || (dayStartForPunch
        ? parseTimeFromDayStartUtc(
          dayStartForPunch,
          loginTime?.hh ?? '',
          loginTime?.mm ?? '',
          loginTime?.meridiem ?? 'AM',
        )
        : parseTimeForDate(
          day,
          loginTime?.hh ?? '',
          loginTime?.mm ?? '',
          loginTime?.meridiem ?? 'AM',
        ));
    const outTime =
      checkOutFromBody
      || (dayStartForPunch
        ? parseTimeFromDayStartUtc(
          dayStartForPunch,
          logoutTime?.hh ?? '',
          logoutTime?.mm ?? '',
          logoutTime?.meridiem ?? 'PM',
        )
        : parseTimeForDate(
          day,
          logoutTime?.hh ?? '',
          logoutTime?.mm ?? '',
          logoutTime?.meridiem ?? 'PM',
        ));

    // eslint-disable-next-line no-console
    console.log('[Attendance][api] mark resolved times', {
      dayKey,
      dayStartForPunch: dayStartForPunch?.toISOString?.(),
      checkInFromBody: checkInFromBody?.toISOString?.(),
      checkOutFromBody: checkOutFromBody?.toISOString?.(),
      inTime: inTime?.toISOString?.(),
      outTime: outTime?.toISOString?.(),
    });

    item.attendanceDayKey = dayKey;
    if (!timesOnly) {
      item.dayStatus = statusNorm;
      item.status = statusNorm;
    }
    item.note = note || '';
    if (!item.approval || typeof item.approval !== 'object') item.approval = {};
    if (hasDecisionAction) {
      item.approval.status = approvalActionNorm;
      item.approval.decidedBy = req.admin?._id || undefined;
      item.approval.decidedByName = String(req.admin?.name || '').trim();
      item.approval.decidedAt = new Date();
    } else if (!item.approval.status || item.approval.status === 'none') {
      item.approval.status = 'pending';
      item.approval.requestedBy = req.admin?._id || undefined;
    }
    if (!timesOnly && statusNorm === 'LEAVE') {
      const lk = String(leaveKind || '').toLowerCase();
      if (lk !== 'paid' && lk !== 'unpaid') {
        return res.status(400).json({ message: 'Leave requires leaveKind: paid or unpaid.' });
      }
      item.leaveKind = lk;
    } else if (!timesOnly) {
      item.leaveKind = null;
    }
    const prevCheckInAt = item.checkInAt ? new Date(item.checkInAt.getTime()) : null;
    applyMarkPunchFields(item, inTime, outTime, loginTime, dayStartForPunch);
    await ensureCheckInAtPersistable(item, { prevCheckInAt, dayStartForPunch, day });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await item.save();
        break;
      } catch (err) {
        if (!err || err.code !== 11000 || attempt === 1) throw err;
        item = await resolveSingleDayAttendanceDoc(companyId, userId, dayKey, day, dayEnd);
        if (!item) throw err;
        item.attendanceDayKey = dayKey;
        if (!timesOnly) {
          item.dayStatus = statusNorm;
          item.status = statusNorm;
        }
        item.note = note || '';
        if (!item.approval || typeof item.approval !== 'object') item.approval = {};
        if (hasDecisionAction) {
          item.approval.status = approvalActionNorm;
          item.approval.decidedBy = req.admin?._id || undefined;
          item.approval.decidedByName = String(req.admin?.name || '').trim();
          item.approval.decidedAt = new Date();
        } else if (!item.approval.status || item.approval.status === 'none') {
          item.approval.status = 'pending';
          item.approval.requestedBy = req.admin?._id || undefined;
        }
        if (!timesOnly && statusNorm === 'LEAVE') {
          const lk = String(leaveKind || '').toLowerCase();
          if (lk !== 'paid' && lk !== 'unpaid') {
            return res.status(400).json({ message: 'Leave requires leaveKind: paid or unpaid.' });
          }
          item.leaveKind = lk;
        } else if (!timesOnly) {
          item.leaveKind = null;
        }
        const prevRetry = item.checkInAt ? new Date(item.checkInAt.getTime()) : null;
        applyMarkPunchFields(item, inTime, outTime, loginTime, dayStartForPunch);
        await ensureCheckInAtPersistable(item, { prevCheckInAt: prevRetry, dayStartForPunch, day });
      }
    }
    // eslint-disable-next-line no-console
    console.log('[Attendance][api] mark saved', {
      id: String(item._id),
      checkInAt: item.checkInAt?.toISOString?.(),
      checkOutAt: item.checkOutAt?.toISOString?.(),
      attendanceDate: item.attendanceDate?.toISOString?.(),
      attendanceDayKey: item.attendanceDayKey,
      dayStatus: item.dayStatus,
    });
    return res.json({ item });
  } catch (e) {
    return next(e);
  }
}

async function bulkMarkStatus(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const { userIds = [], status, date, leaveKind } = req.body;
    const statusNorm = String(status || '').toUpperCase().trim();
    const approvalActionNorm = String(req.body.approvalAction || '').toLowerCase().trim();
    const hasDecisionAction = approvalActionNorm === 'approved' || approvalActionNorm === 'rejected';
    if (!['PRESENT', 'ABSENT', 'LEAVE', 'HOLIDAY'].includes(statusNorm)) {
      return res.status(400).json({ message: 'Invalid status.' });
    }
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'userIds required' });
    }
    const validIds = userIds
      .map((x) => String(x))
      .filter((x) => mongoose.Types.ObjectId.isValid(x));
    if (!validIds.length) return res.status(400).json({ message: 'No valid userIds.' });
    const clientRange = resolveDayRangeFromRequest({ body: req.body });
    let day;
    let dayEnd;
    if (clientRange) {
      day = clientRange.start;
      dayEnd = clientRange.end;
    } else {
      day = normalizeDateOnly(date);
      if (!day) return res.status(400).json({ message: 'Invalid date.' });
      dayEnd = endOfDay(day);
    }

    const dayKey = normalizeDayKey(date);
    if (!dayKey) {
      return res.status(400).json({ message: 'Invalid or missing date (expected YYYY-MM-DD).' });
    }

    // eslint-disable-next-line no-console
    console.log('[Attendance][api] POST /attendance/mark-bulk', {
      adminId: String(req.admin?._id || ''),
      userCount: validIds.length,
      status: statusNorm,
      date,
      timeZoneOffsetMinutes: req.body.timeZoneOffsetMinutes,
      hasDayStartISO: Boolean(req.body.dayStartISO),
    });

    let leaveKindNorm;
    if (statusNorm === 'LEAVE') {
      leaveKindNorm = String(leaveKind || '').toLowerCase();
      if (leaveKindNorm !== 'paid' && leaveKindNorm !== 'unpaid') {
        return res.status(400).json({ message: 'Leave requires leaveKind: paid or unpaid.' });
      }
    }

    const toSave = [];
    for (const uid of validIds) {
      let item = await resolveSingleDayAttendanceDoc(companyId, uid, dayKey, day, dayEnd);
      if (!item) {
        item = new Attendance({
          companyId,
          userId: uid,
          attendanceDayKey: dayKey,
          attendanceDate: day,
          checkInAt: day,
          method: 'manual',
          approval: {
            status: 'pending',
            requestedBy: req.admin?._id || undefined,
          },
        });
      }
      item.attendanceDayKey = dayKey;
      item.dayStatus = statusNorm;
      item.status = statusNorm;
      if (!item.approval || typeof item.approval !== 'object') item.approval = {};
      if (hasDecisionAction) {
        item.approval.status = approvalActionNorm;
        item.approval.decidedBy = req.admin?._id || undefined;
        item.approval.decidedByName = String(req.admin?.name || '').trim();
        item.approval.decidedAt = new Date();
      } else if (!item.approval.status || item.approval.status === 'none') {
        item.approval.status = 'pending';
        item.approval.requestedBy = req.admin?._id || undefined;
      }
      if (statusNorm === 'LEAVE') {
        item.leaveKind = leaveKindNorm;
      } else {
        item.leaveKind = null;
      }
      toSave.push(item.save());
    }
    await Promise.all(toSave);
    // eslint-disable-next-line no-console
    console.log('[Attendance][api] mark-bulk saved', { count: validIds.length, dayKey, status: statusNorm });
    return res.json({ success: true, count: validIds.length });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  listAttendance,
  getDailyAttendance,
  checkIn,
  checkOut,
  markStatus,
  bulkMarkStatus,
};
