const mongoose = require('mongoose');
const Company = require('../models/Company');
const User = require('../models/User');
const Attendance = require('../models/Attendance');

async function getCompanyIdForAdmin(adminId) {
  const company = await Company.findOne({ adminId }).select('_id');
  return company?._id || null;
}

async function listAttendance(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const q = { companyId };
    if (req.query.userId && mongoose.Types.ObjectId.isValid(String(req.query.userId))) {
      q.userId = req.query.userId;
    }
    const items = await Attendance.find(q).sort({ checkInAt: -1 }).limit(200).lean();
    return res.json({ items });
  } catch (e) {
    return next(e);
  }
}

function normalizeDateOnly(input) {
  const d = input ? new Date(input) : new Date();
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(start) {
  const e = new Date(start);
  e.setHours(23, 59, 59, 999);
  return e;
}

function parseTimeForDate(baseDate, hh = '', mm = '', meridiem = 'AM') {
  if (hh === '' || mm === '') return null;
  const hNum = Number(hh);
  const mNum = Number(mm);
  if (!Number.isFinite(hNum) || !Number.isFinite(mNum)) return null;
  let h24 = hNum % 12;
  if (String(meridiem || 'AM').toUpperCase() === 'PM') h24 += 12;
  const d = new Date(baseDate);
  d.setHours(h24, mNum, 0, 0);
  return d;
}

async function getDailyAttendance(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });

    const day = normalizeDateOnly(req.query.date);
    if (!day) return res.status(400).json({ message: 'Invalid date.' });
    const dayEnd = endOfDay(day);
    const q = {
      companyId,
      attendanceDate: { $gte: day, $lte: dayEnd },
    };
    if (req.query.userId && mongoose.Types.ObjectId.isValid(String(req.query.userId))) {
      q.userId = req.query.userId;
    }
    const items = await Attendance.find(q).sort({ checkInAt: -1 }).lean();
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
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
      return res.status(400).json({ message: 'userId is required.' });
    }
    const user = await User.findOne({ _id: userId, companyId }).select('_id').lean();
    if (!user) return res.status(400).json({ message: 'User not in company.' });
    const open = await Attendance.findOne({ userId, companyId, checkOutAt: null }).sort({ checkInAt: -1 });
    if (open) {
      return res.status(409).json({ message: 'User already checked in. Check out first.', item: open });
    }
    const item = await Attendance.create({
      companyId,
      userId,
      checkInAt: new Date(),
      attendanceDate: normalizeDateOnly(new Date()),
      dayStatus: 'PRESENT',
      checkInLat: lat != null ? Number(lat) : undefined,
      checkInLng: lng != null ? Number(lng) : undefined,
      method: method === 'geo' ? 'geo' : 'manual',
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
    return res.json({ item: open });
  } catch (e) {
    return next(e);
  }
}

async function markStatus(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const { userId, status, date, note, loginTime, logoutTime, leaveKind } = req.body;
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
      return res.status(400).json({ message: 'userId is required.' });
    }
    const day = normalizeDateOnly(date);
    if (!day) return res.status(400).json({ message: 'Invalid date.' });
    const dayEnd = endOfDay(day);

    const statusNorm = String(status || '').toUpperCase().trim();
    if (!['PRESENT', 'ABSENT', 'LEAVE', 'HOLIDAY'].includes(statusNorm)) {
      return res.status(400).json({ message: 'Invalid status.' });
    }

    let item = await Attendance.findOne({
      companyId,
      userId,
      attendanceDate: { $gte: day, $lte: dayEnd },
    }).sort({ createdAt: -1 });

    if (!item) {
      item = new Attendance({
        companyId,
        userId,
        attendanceDate: day,
        checkInAt: day,
        dayStatus: statusNorm,
        method: 'manual',
      });
    }

    const inTime = parseTimeForDate(
      day,
      loginTime?.hh ?? '',
      loginTime?.mm ?? '',
      loginTime?.meridiem ?? 'AM',
    );
    const outTime = parseTimeForDate(
      day,
      logoutTime?.hh ?? '',
      logoutTime?.mm ?? '',
      logoutTime?.meridiem ?? 'PM',
    );

    item.dayStatus = statusNorm;
    item.note = note || '';
    if (statusNorm === 'LEAVE') {
      const lk = String(leaveKind || '').toLowerCase();
      if (lk !== 'paid' && lk !== 'unpaid') {
        return res.status(400).json({ message: 'Leave requires leaveKind: paid or unpaid.' });
      }
      item.leaveKind = lk;
    } else {
      item.leaveKind = null;
    }
    if (inTime) item.checkInAt = inTime;
    if (outTime) item.checkOutAt = outTime;
    if (item.checkInAt && item.checkOutAt) {
      item.minutesWorked = Math.max(
        0,
        Math.round((item.checkOutAt.getTime() - item.checkInAt.getTime()) / 60000),
      );
    }
    await item.save();
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
    const day = normalizeDateOnly(date);
    if (!day) return res.status(400).json({ message: 'Invalid date.' });
    const dayEnd = endOfDay(day);

    const existing = await Attendance.find({
      companyId,
      userId: { $in: validIds },
      attendanceDate: { $gte: day, $lte: dayEnd },
    });
    const map = new Map(existing.map((x) => [String(x.userId), x]));

    let leaveKindNorm;
    if (statusNorm === 'LEAVE') {
      leaveKindNorm = String(leaveKind || '').toLowerCase();
      if (leaveKindNorm !== 'paid' && leaveKindNorm !== 'unpaid') {
        return res.status(400).json({ message: 'Leave requires leaveKind: paid or unpaid.' });
      }
    }

    const toSave = [];
    for (const uid of validIds) {
      const item = map.get(uid) || new Attendance({
        companyId,
        userId: uid,
        attendanceDate: day,
        checkInAt: day,
        method: 'manual',
      });
      item.dayStatus = statusNorm;
      if (statusNorm === 'LEAVE') {
        item.leaveKind = leaveKindNorm;
      } else {
        item.leaveKind = null;
      }
      toSave.push(item.save());
    }
    await Promise.all(toSave);
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
