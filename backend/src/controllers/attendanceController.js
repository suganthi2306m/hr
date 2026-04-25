const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const Company = require('../models/Company');
const User = require('../models/User');
const mongoose = require('mongoose');
const cloudinaryAtt = require('../services/cloudinaryAttendanceUpload');

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function normalizeStoredAddress(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  return s.length > 500 ? s.slice(0, 500) : s;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** After checkout: full / half day thresholds; shorter app punches stay PENDING (not ABSENT). */
function statusFromDuration(minutes) {
  if (minutes >= 8 * 60) return 'PRESENT';
  if (minutes >= 4 * 60) return 'HALF_DAY';
  return 'PENDING';
}

function toTrimmedString(v) {
  if (v == null) return '';
  const s = String(v).trim();
  return s;
}

function toFiniteNumber(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeObjectIdString(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object') {
    if (v._id) return String(v._id).trim();
    if (v.id) return String(v.id).trim();
    if (v.$oid) return String(v.$oid).trim();
  }
  return String(v).trim();
}

/**
 * Full company document from Mongo (no Mongoose strict strip).
 * HRMS stores org setup under `orgSetup` (shifts, branches) which is not on the Company schema,
 * so Company.findById() drops those fields and shift meta becomes empty.
 * Tries model collection name first, then `companies`, then `businesses`.
 */
async function loadCompanyRawById(companyId) {
  const idStr = normalizeObjectIdString(companyId);
  if (!idStr) return null;
  let oid;
  try {
    oid = new mongoose.Types.ObjectId(idStr);
  } catch (_) {
    return null;
  }
  const db = Company.db;
  const modelColl = Company.collection.collectionName;
  const candidates = [modelColl, 'companies', 'businesses'];
  const seen = new Set();
  for (const collName of candidates) {
    if (!collName || seen.has(collName)) continue;
    seen.add(collName);
    try {
      const doc = await db.collection(collName).findOne({ _id: oid });
      if (doc) return doc;
    } catch (_) {}
  }
  return null;
}

function isBranchGeofenceDisabled(g) {
  return g && Object.prototype.hasOwnProperty.call(g, 'enabled') && g.enabled === false;
}

async function resolveUserBranchGeofence(user) {
  const branchId = normalizeObjectIdString(user?.branchId);
  if (!branchId) return null;

  // Prefer dedicated branches collection when present.
  try {
    const branchDoc = await Company.db.collection('branches').findOne({ _id: new mongoose.Types.ObjectId(branchId) });
    if (branchDoc) {
      const g = branchDoc.geofence || {};
      if (isBranchGeofenceDisabled(g)) return null;
      const lat = toFiniteNumber(g.latitude ?? g.lat ?? branchDoc.latitude);
      const lng = toFiniteNumber(g.longitude ?? g.lng ?? branchDoc.longitude);
      const radius = toFiniteNumber(g.radius ?? g.radiusM ?? branchDoc.radius) ?? 100;
      if (lat != null && lng != null) {
        return {
          latitude: lat,
          longitude: lng,
          radius,
          branchName: toTrimmedString(branchDoc.name || branchDoc.branchName),
        };
      }
    }
  } catch (_) {
    // ignore and fallback
  }

  // Fallback: embedded company branches array (supports both `branches` and `orgSetup.branches`).
  try {
    const company = await loadCompanyRawById(user.companyId);
    const branches = Array.isArray(company?.branches)
      ? company.branches
      : Array.isArray(company?.orgSetup?.branches)
        ? company.orgSetup.branches
        : [];
    const branch = branches.find((b) => normalizeObjectIdString(b?._id) === branchId);
    if (!branch) return null;
    const g = branch.geofence || {};
    if (isBranchGeofenceDisabled(g)) return null;
    const lat = toFiniteNumber(g.latitude ?? g.lat ?? branch.latitude);
    const lng = toFiniteNumber(g.longitude ?? g.lng ?? branch.longitude);
    const radius = toFiniteNumber(g.radius ?? g.radiusM ?? branch.radius) ?? 100;
    if (lat != null && lng != null) {
      return {
        latitude: lat,
        longitude: lng,
        radius,
        branchName: toTrimmedString(branch.name || branch.branchName),
      };
    }
  } catch (_) {
    // ignore
  }
  return null;
}

/**
 * When user.attendanceGeofenceEnabled: enforce location within branch geofence (or legacy officeLocation).
 * When false: no server-side distance check (anywhere).
 * @param {{ punchLabel?: string }} opts punchLabel e.g. "Check-in" / "Check-out" for error messages
 * @returns {{ ok: true, skipped?: boolean, ctx: { geofenceDistanceM, geofenceSource, geofenceCenterLat, geofenceCenterLng, geofenceRadius } } | { ok: false, status: number, message: string, code: string }}
 */
async function assertWithinAttendanceGeofence(user, lat, lng, opts = {}) {
  const punchLabel = toTrimmedString(opts.punchLabel) || 'Attendance';
  if (user?.attendanceGeofenceEnabled !== true) {
    return {
      ok: true,
      skipped: true,
      ctx: {
        geofenceDistanceM: null,
        geofenceSource: null,
        geofenceCenterLat: null,
        geofenceCenterLng: null,
        geofenceRadius: null,
      },
    };
  }

  const branchGeo = await resolveUserBranchGeofence(user);
  const office = user.officeLocation || {};
  const officeLat = toFiniteNumber(office.latitude);
  const officeLng = toFiniteNumber(office.longitude);
  const finalGeo =
    branchGeo ??
    (officeLat != null && officeLng != null
      ? {
          latitude: officeLat,
          longitude: officeLng,
          radius: toFiniteNumber(office.radius) ?? 100,
        }
      : null);

  if (finalGeo == null) {
    return {
      ok: false,
      status: 400,
      message:
        'Office geofence is turned on for your account, but your branch office location is not set up. Please contact your administrator.',
      code: 'GEOFENCE_NOT_CONFIGURED',
    };
  }

  const dist = haversineMeters(lat, lng, finalGeo.latitude, finalGeo.longitude);
  const allowed = finalGeo.radius;
  const geofenceSource = branchGeo ? 'branch' : 'office';

  if (dist > allowed) {
    const outsideM = Math.max(0, Math.round(dist - allowed));
    return {
      ok: false,
      status: 400,
      message: `You are out of office by about ${outsideM} m (allowed radius from ${geofenceSource === 'branch' ? 'your branch' : 'office'} is ${allowed} m). ${punchLabel} is not allowed.`,
      code: 'OUT_OF_RADIUS',
    };
  }

  return {
    ok: true,
    ctx: {
      geofenceDistanceM: dist,
      geofenceSource,
      geofenceCenterLat: finalGeo.latitude,
      geofenceCenterLng: finalGeo.longitude,
      geofenceRadius: allowed,
    },
  };
}

async function resolveEffectiveUser(reqUser) {
  const userId = normalizeObjectIdString(reqUser?._id);
  if (!userId) return reqUser;
  try {
    const fresh = await User.findById(userId).select('-password').lean();
    if (fresh && typeof fresh === 'object') {
      return fresh;
    }
  } catch (_) {}
  return reqUser;
}

function companyShiftList(company) {
  const fromSettings = company?.settings?.attendance?.shifts;
  if (Array.isArray(fromSettings) && fromSettings.length > 0) return fromSettings;
  const fromOrgSetup = company?.orgSetup?.shifts;
  if (Array.isArray(fromOrgSetup) && fromOrgSetup.length > 0) return fromOrgSetup;
  return [];
}

function findShiftById(shifts, userShiftId) {
  if (!userShiftId || !Array.isArray(shifts) || shifts.length === 0) return null;
  const hit = shifts.find((s) => normalizeShiftId(s?._id) === userShiftId);
  if (hit) return hit;
  return (
    shifts.find((s) => normalizeShiftId(s?.id) === userShiftId) ||
    shifts.find((s) => normalizeShiftId(s?.shiftId) === userShiftId) ||
    null
  );
}

async function resolveCurrentAttendanceContext(user) {
  const company = await loadCompanyRawById(user.companyId);
  const userShiftId = normalizeShiftId(user.shiftId);
  const shifts = companyShiftList(company);
  const shift = findShiftById(shifts, userShiftId);
  const branchGeo = await resolveUserBranchGeofence(user);
  const officeRadius = toFiniteNumber(user?.officeLocation?.radius) ?? 100;
  const branchRadius = toFiniteNumber(branchGeo?.radius) ?? officeRadius;
  const branchName = toTrimmedString(
    branchGeo?.branchName || user?.employeeProfile?.branchName || 'Office',
  );
  return {
    shiftId: userShiftId || null,
    shiftName: toTrimmedString(shift?.name) || null,
    shiftStart: toTrimmedString(shift?.startTime) || null,
    shiftEnd: toTrimmedString(shift?.endTime) || null,
    branchName: branchName || null,
    branchRadiusM: branchRadius,
    attendanceGeofenceEnabled: user?.attendanceGeofenceEnabled === true,
    branchId: normalizeObjectIdString(user?.branchId) || null,
    geofenceSource: branchGeo ? 'branch' : 'office',
  };
}

function logAttendancePunchContext({
  action,
  user,
  lat,
  lng,
  branchName,
  branchRadius,
  shiftId,
  shiftName,
  shiftStartTime,
  shiftEndTime,
}) {
  console.log(
    `[AttendancePunchDebug][backend] action=${action} ` +
      `userId=${String(user?._id || '')} ` +
      `companyId=${String(user?.companyId || '')} ` +
      `branchId=${String(user?.branchId || '')} ` +
      `branchName="${branchName || '-'}" ` +
      `branchRadiusM=${Number.isFinite(Number(branchRadius)) ? Number(branchRadius) : '-'} ` +
      `attendanceGeofenceEnabled=${user?.attendanceGeofenceEnabled === true} ` +
      `shiftId="${shiftId || '-'}" ` +
      `shiftName="${shiftName || '-'}" ` +
      `shiftStart="${shiftStartTime || '-'}" ` +
      `shiftEnd="${shiftEndTime || '-'}" ` +
      `lat=${lat} lng=${lng}`,
  );
}

function buildPunchDebugContext({
  action,
  user,
  lat,
  lng,
  shiftId,
  shiftName,
  shiftStartTime,
  shiftEndTime,
  branchName,
  branchRadius,
  geofenceEnabled,
  geofenceCenterLat,
  geofenceCenterLng,
  geofenceDistanceM,
  geofenceSource,
}) {
  return {
    action,
    userId: String(user?._id || ''),
    companyId: String(user?.companyId || ''),
    branchId: String(user?.branchId || ''),
    attendanceGeofenceEnabled: geofenceEnabled === true,
    shiftId: shiftId || null,
    shiftName: shiftName || null,
    shiftStart: shiftStartTime || null,
    shiftEnd: shiftEndTime || null,
    branchName: branchName || null,
    branchRadiusM: Number.isFinite(Number(branchRadius)) ? Number(branchRadius) : null,
    geofenceSource: geofenceSource || null,
    geofenceCenterLat:
      Number.isFinite(Number(geofenceCenterLat)) ? Number(geofenceCenterLat) : null,
    geofenceCenterLng:
      Number.isFinite(Number(geofenceCenterLng)) ? Number(geofenceCenterLng) : null,
    geofenceDistanceM:
      Number.isFinite(Number(geofenceDistanceM)) ? Math.round(Number(geofenceDistanceM)) : null,
    requestLat: Number.isFinite(Number(lat)) ? Number(lat) : null,
    requestLng: Number.isFinite(Number(lng)) ? Number(lng) : null,
    serverTime: new Date().toISOString(),
  };
}

function parseHolidayDateRaw(raw) {
  if (raw == null) return null;
  if (raw instanceof Date && Number.isFinite(raw.getTime())) return raw;
  const s = String(raw).trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const da = Number(m[3]);
    const d = new Date(y, mo, da, 0, 0, 0, 0);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function ymdFromDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthBoundsFromYmd(ymd) {
  const raw = String(ymd || '').trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const [y, m] = raw.split('-').map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return {
    start: new Date(y, m - 1, 1, 0, 0, 0, 0),
    end: new Date(y, m, 0, 23, 59, 59, 999),
  };
}

function extractCompanyHolidaysForMonth(company, user, monthYmd) {
  const bounds = monthBoundsFromYmd(monthYmd);
  if (!bounds) return [];
  const userBranchId = toTrimmedString(user?.branchId);
  const sources = [];
  if (Array.isArray(company?.orgSetup?.holidays)) sources.push(...company.orgSetup.holidays);
  if (Array.isArray(company?.settings?.business?.holidays)) sources.push(...company.settings.business.holidays);
  if (Array.isArray(company?.settings?.attendance?.holidays)) sources.push(...company.settings.attendance.holidays);
  if (sources.length === 0) return [];

  const out = [];
  const seenYmd = new Set();

  for (const item of sources) {
    if (!item || typeof item !== 'object') continue;

    const branches = Array.isArray(item.branchIds)
      ? item.branchIds
      : Array.isArray(item.branches)
        ? item.branches
        : null;
    if (branches && branches.length > 0 && userBranchId) {
      const allowed = branches.some((b) => toTrimmedString(b?._id ?? b?.id ?? b) === userBranchId);
      if (!allowed) continue;
    }

    const name = toTrimmedString(item.name || item.title || 'Holiday');
    const startD = parseHolidayDateRaw(item.startDate ?? item.date ?? item.holidayDate ?? item.fromDate);
    if (!startD) continue;
    const endD = parseHolidayDateRaw(item.endDate ?? item.startDate ?? item.date) || startD;
    const startClip = startD < bounds.start ? bounds.start : startD;
    const endClip = endD > bounds.end ? bounds.end : endD < startD ? startD : endD;
    if (startClip > bounds.end || endClip < bounds.start) continue;

    const cur = new Date(startClip.getFullYear(), startClip.getMonth(), startClip.getDate(), 0, 0, 0, 0);
    const endT = new Date(endClip.getFullYear(), endClip.getMonth(), endClip.getDate(), 0, 0, 0, 0).getTime();
    while (cur.getTime() <= endT) {
      if (cur >= bounds.start && cur <= bounds.end) {
        const ymd = ymdFromDate(cur);
        if (!seenYmd.has(ymd)) {
          seenYmd.add(ymd);
          out.push({ ymd, name });
        }
      }
      cur.setDate(cur.getDate() + 1);
    }
  }
  return out;
}

/** Open session: no mobile checkout and no web checkout. */
function noOpenCheckoutClause() {
  return {
    $and: [
      {
        $or: [
          { checkOutTime: null },
          { checkOutTime: { $exists: false } },
          { checkOutTime: '' },
        ],
      },
      {
        $or: [
          { checkOutAt: null },
          { checkOutAt: { $exists: false } },
          { checkOutAt: '' },
        ],
      },
    ],
  };
}

/** Resolve punch-in instant for duration (mobile checkInTime, web checkInAt, legacy punchIn). */
function resolveCheckInDate(att) {
  if (!att || typeof att !== 'object') return null;
  const raw = att.checkInTime ?? att.checkInAt ?? att.punchIn;
  if (raw == null || raw === '') return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  const t = d.getTime();
  return Number.isFinite(t) && t > 0 ? d : null;
}

/** Cloudinary `https://...` only — attendance selfies are not stored on disk long-term. */
function attendanceStorageError(message, code, httpStatus = 503) {
  const e = new Error(message);
  e.attendanceCode = code;
  e.attendanceHttpStatus = httpStatus;
  return e;
}

async function resolveAttendanceSelfieUrl(file, user, label) {
  if (!cloudinaryAtt.isConfigured()) {
    throw attendanceStorageError(
      'Attendance image storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET on the server.',
      'CLOUDINARY_NOT_CONFIGURED',
      503,
    );
  }
  // Use company id for folder naming — avoids an extra Mongo round-trip before upload.
  const companyName = user.companyId ? String(user.companyId) : 'unknown_company';
  const userName = user.name || user.email || 'user';
  try {
    const url = await cloudinaryAtt.uploadAttendanceSelfie(file.path, {
      companyName,
      userName,
      label,
    });
    cloudinaryAtt.safeUnlink(file.path);
    return url;
  } catch (e) {
    console.error('[attendance] Cloudinary upload failed:', e.message);
    throw attendanceStorageError(
      e.message || 'Could not upload attendance image to Cloudinary. Try again.',
      'CLOUDINARY_UPLOAD_FAILED',
      503,
    );
  }
}

exports.checkIn = async (req, res) => {
  try {
    console.log(
      `[AttendancePunchDebug][backend] endpoint_hit action=checkin hasSelfie=${Boolean(req.file)} ` +
        `source=${String(req.body?.source || req.body?.checkInSource || req.body?.metaSource || '') || '-'} ` +
        `lat=${String(req.body?.lat ?? req.body?.latitude ?? '-')} ` +
        `lng=${String(req.body?.lng ?? req.body?.longitude ?? '-')} ` +
        `ip=${req.ip || '-'}`,
    );
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Selfie image is required' });
    }
    const user = await resolveEffectiveUser(req.user);
    if (!user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const now = new Date();
    const dayStart = startOfDay(now);
    const dayEnd = endOfDay(now);

    const [approvedLeave, existingOpen, todayRecord] = await Promise.all([
      LeaveRequest.findOne({
        userId: user._id,
        status: 'APPROVED',
        fromDate: { $lte: endOfDay(now) },
        toDate: { $gte: startOfDay(now) },
      })
        .select('_id')
        .lean(),
      Attendance.findOne({
        userId: user._id,
        companyId: user.companyId,
        ...noOpenCheckoutClause(),
      })
        .sort({ checkInTime: -1, checkInAt: -1, punchIn: -1 })
        .lean(),
      Attendance.findOne({
        userId: user._id,
        companyId: user.companyId,
        attendanceDate: { $gte: dayStart, $lte: dayEnd },
      })
        .sort({ checkInTime: -1, checkInAt: -1, punchIn: -1 })
        .lean(),
    ]);

    if (approvedLeave) {
      return res.status(400).json({
        success: false,
        message: 'Cannot check in: approved leave exists for today',
        code: 'APPROVED_LEAVE',
      });
    }
    if (existingOpen) {
      return res.status(400).json({
        success: false,
        message: 'Already checked in. Please check out first.',
      });
    }
    if (todayRecord && (todayRecord.checkInTime || todayRecord.checkInAt)) {
      return res.status(400).json({
        success: false,
        message: 'Attendance is already marked for today.',
        code: 'ALREADY_MARKED_TODAY',
      });
    }

    const lat = Number(req.body.lat ?? req.body.latitude);
    const lng = Number(req.body.lng ?? req.body.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ success: false, message: 'Valid location (lat,lng) required' });
    }

    const accuracy = Number(req.body.accuracy);
    const isMocked = String(req.body.isMocked || '').toLowerCase() === 'true';
    if (isMocked) {
      return res.status(400).json({
        success: false,
        message: 'Mock location detected. Check-in blocked.',
        code: 'MOCK_LOCATION',
      });
    }

    const geofenceAssert = await assertWithinAttendanceGeofence(user, lat, lng, { punchLabel: 'Check-in' });
    if (!geofenceAssert.ok) {
      return res.status(geofenceAssert.status).json({
        success: false,
        message: geofenceAssert.message,
        code: geofenceAssert.code,
      });
    }
    const {
      geofenceDistanceM,
      geofenceSource,
      geofenceCenterLat,
      geofenceCenterLng,
      geofenceRadius,
    } = geofenceAssert.ctx;

    const checkInTime = now;
    const checkInSource =
      String(req.body?.source || req.body?.checkInSource || req.body?.metaSource || '')
        .trim()
        .toLowerCase() || 'manual';
    const company = await loadCompanyRawById(user.companyId);
    const userShiftId = normalizeShiftId(user.shiftId);
    const shifts = companyShiftList(company);
    const shift = findShiftById(shifts, userShiftId);
    const branchGeoForLog = await resolveUserBranchGeofence(user);
    const officeRadiusForLog = toFiniteNumber(user?.officeLocation?.radius) ?? 100;
    const branchRadiusForLog = toFiniteNumber(branchGeoForLog?.radius) ?? officeRadiusForLog;
    const branchNameForLog = toTrimmedString(
      branchGeoForLog?.branchName || user?.employeeProfile?.branchName || '',
    );
    logAttendancePunchContext({
      action: 'checkin',
      user,
      lat,
      lng,
      branchName: branchNameForLog,
      branchRadius: branchRadiusForLog,
      shiftId: userShiftId,
      shiftName: toTrimmedString(shift?.name),
      shiftStartTime: toTrimmedString(shift?.startTime),
      shiftEndTime: toTrimmedString(shift?.endTime),
    });
    const debugContext = buildPunchDebugContext({
      action: 'checkin',
      user,
      lat,
      lng,
      shiftId: userShiftId,
      shiftName: toTrimmedString(shift?.name),
      shiftStartTime: toTrimmedString(shift?.startTime),
      shiftEndTime: toTrimmedString(shift?.endTime),
      branchName: branchNameForLog,
      branchRadius: branchRadiusForLog,
      geofenceEnabled: user.attendanceGeofenceEnabled === true,
      geofenceCenterLat,
      geofenceCenterLng,
      geofenceDistanceM,
      geofenceSource,
    });
    const checkInImageUrl = await resolveAttendanceSelfieUrl(req.file, user, 'checkin');
    const addressIn = normalizeStoredAddress(req.body.address);
    const attendance = await Attendance.create({
      userId: user._id,
      companyId: user.companyId,
      attendanceDate: startOfDay(checkInTime),
      checkInTime,
      checkInImageUrl,
      checkInLocation: {
        lat,
        lng,
        address: addressIn,
        accuracy: Number.isFinite(accuracy) ? accuracy : undefined,
        isMocked,
      },
      shiftId: userShiftId || null,
      shiftName: toTrimmedString(shift?.name),
      shiftStartTime: toTrimmedString(shift?.startTime),
      shiftEndTime: toTrimmedString(shift?.endTime),
      source: checkInSource,
      checkInSource,
      status: 'PENDING',
    });

    const companyLabel = user.companyName || user.company?.name || String(user.companyId || 'unknown_company');
    const webNotificationPayload = {
      type: 'attendance_checked_in',
      title: 'User checked in',
      message: `${user.name || 'User'} checked in at ${companyLabel}`,
      companyName: companyLabel,
      companyId: user.companyId ? String(user.companyId) : null,
      userId: String(user._id),
      userName: user.name || user.email || String(user._id),
      source: checkInSource,
      checkedInAt: checkInTime.toISOString(),
      attendanceId: String(attendance._id),
    };
    console.log('[Attendance] check-in event:', JSON.stringify(webNotificationPayload));
    const io = req.app.get('io');
    if (io) {
      io.to('admin:attendance').emit('attendance:checked-in', webNotificationPayload);
      io.to('admin:notifications').emit('notification:new', webNotificationPayload);
      if (user.companyId) {
        io.to(`admin:company:${String(user.companyId)}`).emit('attendance:checked-in', webNotificationPayload);
      }
    } else {
      console.log('[Attendance] socket io not attached; check-in event emitted to logs only');
    }

    return res.status(201).json({
      success: true,
      message: 'Checked in successfully',
      attendance,
      info: {
        checkedInAt: checkInTime,
        locationVerified: true,
        debugContext,
      },
    });
  } catch (error) {
    if (error.attendanceHttpStatus) {
      return res.status(error.attendanceHttpStatus).json({
        success: false,
        message: error.message,
        code: error.attendanceCode,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Check-in failed',
      error: error.message,
    });
  }
};

exports.checkOut = async (req, res) => {
  try {
    console.log(
      `[AttendancePunchDebug][backend] endpoint_hit action=checkout hasSelfie=${Boolean(req.file)} ` +
        `source=${String(req.body?.source || req.body?.checkOutSource || req.body?.metaSource || '') || '-'} ` +
        `lat=${String(req.body?.lat ?? req.body?.latitude ?? '-')} ` +
        `lng=${String(req.body?.lng ?? req.body?.longitude ?? '-')} ` +
        `ip=${req.ip || '-'}`,
    );
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Selfie image is required' });
    }
    const user = await resolveEffectiveUser(req.user);
    if (!user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const lat = Number(req.body.lat ?? req.body.latitude);
    const lng = Number(req.body.lng ?? req.body.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ success: false, message: 'Valid location (lat,lng) required' });
    }

    const isMocked = String(req.body.isMocked || '').toLowerCase() === 'true';
    if (isMocked) {
      return res.status(400).json({
        success: false,
        message: 'Mock location detected. Checkout blocked.',
        code: 'MOCK_LOCATION',
      });
    }

    const checkoutGeofenceAssert = await assertWithinAttendanceGeofence(user, lat, lng, {
      punchLabel: 'Check-out',
    });
    if (!checkoutGeofenceAssert.ok) {
      return res.status(checkoutGeofenceAssert.status).json({
        success: false,
        message: checkoutGeofenceAssert.message,
        code: checkoutGeofenceAssert.code,
      });
    }
    const checkoutGeofenceCtx = checkoutGeofenceAssert.ctx;

    const attendance = await Attendance.findOne({
      userId: user._id,
      companyId: user.companyId,
      ...noOpenCheckoutClause(),
    })
      .sort({ checkInTime: -1, checkInAt: -1, punchIn: -1 })
      .lean();
    if (!attendance) {
      return res.status(400).json({
        success: false,
        message: 'No active check-in found for checkout',
      });
    }

    const checkInDate = resolveCheckInDate(attendance);
    if (!checkInDate) {
      return res.status(400).json({
        success: false,
        message: 'Attendance record has no check-in time; cannot check out.',
      });
    }

    const checkOutTime = new Date();
    const checkOutSource =
      String(req.body?.source || req.body?.checkOutSource || req.body?.metaSource || '')
        .trim()
        .toLowerCase() || 'manual';
    const durationMinutes = Math.max(
      0,
      Math.round((checkOutTime.getTime() - checkInDate.getTime()) / 60000),
    );

    const checkOutImageUrl = await resolveAttendanceSelfieUrl(req.file, user, 'checkout');
    const addressOut = normalizeStoredAddress(req.body.address);
    const attendanceDate =
      attendance.attendanceDate != null
        ? attendance.attendanceDate
        : startOfDay(checkInDate);
    const status = statusFromDuration(durationMinutes);
    const branchGeoForLog = await resolveUserBranchGeofence(user);
    const officeRadiusForLog = toFiniteNumber(user?.officeLocation?.radius) ?? 100;
    const branchRadiusForLog = toFiniteNumber(branchGeoForLog?.radius) ?? officeRadiusForLog;
    const branchNameForLog = toTrimmedString(
      branchGeoForLog?.branchName || user?.employeeProfile?.branchName || '',
    );
    logAttendancePunchContext({
      action: 'checkout',
      user,
      lat,
      lng,
      branchName: branchNameForLog,
      branchRadius: branchRadiusForLog,
      shiftId: toTrimmedString(attendance.shiftId),
      shiftName: toTrimmedString(attendance.shiftName),
      shiftStartTime: toTrimmedString(attendance.shiftStartTime),
      shiftEndTime: toTrimmedString(attendance.shiftEndTime),
    });
    const debugContext = buildPunchDebugContext({
      action: 'checkout',
      user,
      lat,
      lng,
      shiftId: toTrimmedString(attendance.shiftId),
      shiftName: toTrimmedString(attendance.shiftName),
      shiftStartTime: toTrimmedString(attendance.shiftStartTime),
      shiftEndTime: toTrimmedString(attendance.shiftEndTime),
      branchName: branchNameForLog,
      branchRadius: branchRadiusForLog,
      geofenceEnabled: user.attendanceGeofenceEnabled === true,
      geofenceCenterLat: checkoutGeofenceCtx.geofenceCenterLat ?? branchGeoForLog?.latitude ?? null,
      geofenceCenterLng: checkoutGeofenceCtx.geofenceCenterLng ?? branchGeoForLog?.longitude ?? null,
      geofenceDistanceM:
        checkoutGeofenceCtx.geofenceDistanceM ??
        (branchGeoForLog?.latitude != null && branchGeoForLog?.longitude != null
          ? haversineMeters(lat, lng, branchGeoForLog.latitude, branchGeoForLog.longitude)
          : null),
      geofenceSource: checkoutGeofenceCtx.geofenceSource || (branchGeoForLog ? 'branch' : 'office'),
    });

    const update = {
      checkOutTime,
      checkOutAt: checkOutTime,
      checkOutImageUrl,
      checkOutLocation: {
        lat,
        lng,
        address: addressOut,
        accuracy: Number.isFinite(Number(req.body.accuracy))
          ? Number(req.body.accuracy)
          : undefined,
        isMocked: false,
      },
      attendanceDate,
      duration: durationMinutes,
      status,
      checkOutSource,
      source: attendance.source || attendance.checkInSource || checkOutSource,
    };

    const saved = await Attendance.findByIdAndUpdate(
      attendance._id,
      { $set: update },
      { new: true, runValidators: false },
    ).lean();

    return res.json({
      success: true,
      message: 'Checked out successfully',
      attendance: saved,
      info: {
        checkedOutAt: checkOutTime,
        locationVerified: true,
        debugContext,
      },
    });
  } catch (error) {
    if (error.attendanceHttpStatus) {
      return res.status(error.attendanceHttpStatus).json({
        success: false,
        message: error.message,
        code: error.attendanceCode,
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Check-out failed',
      error: error.message,
    });
  }
};

exports.logPunchButtonClick = async (req, res) => {
  try {
    const user = await resolveEffectiveUser(req.user);
    if (!user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const action = toTrimmedString(req.body?.action || '').toLowerCase();
    const source = toTrimmedString(req.body?.source || '');
    const stage = toTrimmedString(req.body?.stage || '');
    const detail = toTrimmedString(req.body?.detail || '');
    const context = await resolveCurrentAttendanceContext(user);
    const shiftNameLog = toTrimmedString(context.shiftName) || '-';
    const shiftStartLog = toTrimmedString(context.shiftStart) || '-';
    const shiftEndLog = toTrimmedString(context.shiftEnd) || '-';
    const branchNameLog = toTrimmedString(context.branchName) || '-';
    const branchRadiusLog = Number.isFinite(Number(context.branchRadiusM))
      ? String(Math.round(Number(context.branchRadiusM)))
      : '-';
    const shiftIdLog = toTrimmedString(context.shiftId) || '-';
    const geofenceSrcLog = toTrimmedString(context.geofenceSource) || '-';
    console.log(
      `[AttendancePunchDebug][backend] button_click action=${action || '-'} ` +
        `userId=${String(user._id)} companyId=${String(user.companyId || '')} ` +
        `branchId=${String(user.branchId || '')} branchName="${branchNameLog}" branchRadiusM=${branchRadiusLog} ` +
        `geofenceEnabled=${user.attendanceGeofenceEnabled === true} geofenceSource=${geofenceSrcLog} ` +
        `shiftId="${shiftIdLog}" shiftName="${shiftNameLog}" shiftStart="${shiftStartLog}" shiftEnd="${shiftEndLog}" ` +
        `source="${source || '-'}" stage="${stage || '-'}" detail="${detail || '-'}" ip=${req.ip || '-'}`,
    );
    return res.json({ success: true, data: context });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to log button click',
      error: error.message,
    });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const user = await resolveEffectiveUser(req.user);
    if (!user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
    const page = Math.max(1, Number(req.query.page) || 1);
    const skip = (page - 1) * limit;
    const isAdmin =
      String(user?.role || '').toLowerCase() === 'admin' ||
      String(user?.role || '').toLowerCase() === 'superadmin';
    const query = isAdmin && String(req.query.all || '').toLowerCase() === 'true'
      ? {}
      : { userId: user._id };
    if (isAdmin && req.query.userId) {
      query.userId = req.query.userId;
    }

    if (req.query.from || req.query.to) {
      const timeCond = {};
      if (req.query.from) timeCond.$gte = new Date(req.query.from);
      if (req.query.to) timeCond.$lte = new Date(req.query.to);
      query.$and = [...(query.$and || []), { $or: [{ checkInTime: timeCond }, { checkInAt: timeCond }] }];
    }

    const [items, total] = await Promise.all([
      Attendance.find(query)
        .sort({ attendanceDate: -1, checkInTime: -1, checkInAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Attendance.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance history',
      error: error.message,
    });
  }
};

function normalizeShiftId(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    if (value._id) return String(value._id).trim();
    if (value.id) return String(value.id).trim();
    if (value.$oid) return String(value.$oid).trim();
  }
  return String(value).trim();
}

function mapWeeklyDayToDartWeekday(day) {
  const n = Number(day);
  if (!Number.isFinite(n)) return null;
  // Backend weekly-off day usually 0..6 (Sun..Sat), Dart DateTime uses 1..7 (Mon..Sun).
  return n === 0 ? 7 : n;
}

const WEEKLY_OFF_DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function emptyWeeklyOffRule() {
  return { all: false, first: false, second: false, third: false, fourth: false, fifth: false };
}

function normalizeWeeklyOffPolicyForMobile(raw) {
  const out = {
    name: '',
    days: {
      sunday: emptyWeeklyOffRule(),
      monday: emptyWeeklyOffRule(),
      tuesday: emptyWeeklyOffRule(),
      wednesday: emptyWeeklyOffRule(),
      thursday: emptyWeeklyOffRule(),
      friday: emptyWeeklyOffRule(),
      saturday: emptyWeeklyOffRule(),
    },
  };
  if (!raw) return out;
  if (typeof raw === 'string') {
    const key = raw.trim().toLowerCase();
    if (WEEKLY_OFF_DAY_KEYS.includes(key)) {
      out.name = 'Weekly Off';
      out.days[key] = { all: true, first: false, second: false, third: false, fourth: false, fifth: false };
    }
    return out;
  }
  if (typeof raw !== 'object') return out;
  out.name = String(raw.name || '').trim();
  const srcDays = raw.days && typeof raw.days === 'object' ? raw.days : {};
  WEEKLY_OFF_DAY_KEYS.forEach((k) => {
    const d = srcDays[k] && typeof srcDays[k] === 'object' ? srcDays[k] : {};
    out.days[k] = {
      all: Boolean(d.all),
      first: Boolean(d.first),
      second: Boolean(d.second),
      third: Boolean(d.third),
      fourth: Boolean(d.fourth),
      fifth: Boolean(d.fifth),
    };
  });
  return out;
}

function hasWeeklyOffRules(policy) {
  const p = normalizeWeeklyOffPolicyForMobile(policy);
  return WEEKLY_OFF_DAY_KEYS.some((k) => {
    const d = p.days[k];
    return d.all || d.first || d.second || d.third || d.fourth || d.fifth;
  });
}

function dartWeekdaysWithAllDayRules(policy) {
  const p = normalizeWeeklyOffPolicyForMobile(policy);
  const out = [];
  WEEKLY_OFF_DAY_KEYS.forEach((k, jsDow) => {
    const rule = p.days[k];
    if (rule && rule.all) {
      const dartWd = jsDow === 0 ? 7 : jsDow;
      out.push(dartWd);
    }
  });
  return out;
}

exports.getShiftMeta = async (req, res) => {
  try {
    const user = req.user;
    if (!user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userShiftId = normalizeShiftId(user.shiftId);
    const company = await loadCompanyRawById(user.companyId);

    const shifts = companyShiftList(company);
    const shift = findShiftById(shifts, userShiftId);

    const weeklyOffRaw = company?.orgSetup?.weeklyOff ?? null;
    const weeklyOff = normalizeWeeklyOffPolicyForMobile(weeklyOffRaw);
    let weekOffWeekdays;
    if (hasWeeklyOffRules(weeklyOff)) {
      weekOffWeekdays = dartWeekdaysWithAllDayRules(weeklyOff);
      const fromLegacy = (company?.settings?.business?.weeklyHolidays || [])
        .map((h) => mapWeeklyDayToDartWeekday(h?.day))
        .filter((d) => d != null);
      if (!weekOffWeekdays.length && fromLegacy.length) {
        weekOffWeekdays = fromLegacy;
      }
    } else {
      const weeklyHolidays = company?.settings?.business?.weeklyHolidays || [];
      weekOffWeekdays = weeklyHolidays
        .map((h) => mapWeeklyDayToDartWeekday(h?.day))
        .filter((d) => d != null);
    }

    const month = req.query?.month;
    const holidays = extractCompanyHolidaysForMonth(company, user, month);

    return res.json({
      success: true,
      data: {
        shiftId: userShiftId || null,
        shiftName: shift?.name || null,
        startTime: shift?.startTime || null,
        endTime: shift?.endTime || null,
        weekOffWeekdays,
        weeklyOff,
        holidays,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch shift details',
      error: error.message,
    });
  }
};
