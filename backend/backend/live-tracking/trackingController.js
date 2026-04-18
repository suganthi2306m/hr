const mongoose = require('mongoose');
const User = require('../../src/models/User');
const Tracking = require('../../src/models/locations');
const Task = require('../../src/models/Task');
const TaskDetails = require('../../src/models/TaskDetails');
const Customer = require('../../src/models/Customer');
let Branch = null;
let Attendance = null;
try {
  Branch = require('../../src/models/Branch');
} catch (_) {}
try {
  Attendance = require('../../src/models/Attendance');
} catch (_) {}
const {
  upsertTaskDetails,
  buildUnsetExtended,
  normalizeTravelActivityDuration,
  computePersistedTravelMetrics,
} = require('../../src/controllers/taskController');
const { reverseGeocode } = require('../../src/services/geocodingService');
const { parseTimestamp } = require('../../src/utils/dateUtils');
const { resolveBusinessTimezone, computeDailyTaskCountForStaff } = require('../../src/utils/trackingTaskCount');
const { isLatLngInsideBranchGeofence, getBranchGeofenceTargets } = require('../../src/utils/branchGeofence');
const { logTrackingWrite, shouldLogTrackings } = require('../../src/utils/trackingLogger');

const LegacyTask =
  Task.db.models.TaskLegacy || Task.db.model('TaskLegacy', Task.schema, 'tasks');

/** ObjectId refs are sometimes populated objects on other code paths — normalize for queries. */
function coerceRefId(value) {
  if (value == null) return null;
  if (typeof value === 'object') {
    if (value._id != null) return value._id;
    if (value.id != null) return value.id;
  }
  return value;
}

function resolveActor(req) {
  const actor = req.user || req.staff || null;
  return {
    id:
      req.user?._id ||
      req.user?.id ||
      req.user?.userId ||
      req.staff?._id ||
      req.staff?.id ||
      req.staff?.userId ||
      actor?._id ||
      actor?.id ||
      actor?.userId ||
      null,
    name: actor?.name || undefined,
    branchId: coerceRefId(actor?.branchId),
    companyId: coerceRefId(actor?.companyId),
  };
}

/** Match attendances.userId whether stored as ObjectId or string (same logical user as JWT). */
function attendanceUserIdClause(staffId) {
  if (staffId == null) return null;
  const s = String(staffId).trim();
  if (mongoose.Types.ObjectId.isValid(s) && s.length === 24) {
    try {
      const oid = new mongoose.Types.ObjectId(s);
      return { $in: [staffId, oid, s] };
    } catch (_) {
      return staffId;
    }
  }
  return staffId;
}

function startOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Attendance row has a real punch-in (mobile `checkInTime`, web `checkInAt`, or legacy `punchIn`). */
function hasRealCheckInClause() {
  return {
    $or: [
      { checkInTime: { $exists: true, $ne: null } },
      { checkInAt: { $exists: true, $ne: null } },
      { punchIn: { $exists: true, $ne: null } },
    ],
  };
}

/** Open session: no mobile checkout and no web checkout (same collection may hold either schema). */
function noCheckoutClause() {
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

function staffOwnsAttendanceRow(uidClause) {
  return {
    $or: [{ userId: uidClause }, { user: uidClause }],
  };
}

function openSessionAndCheckInQuery(uidClause) {
  return {
    $and: [staffOwnsAttendanceRow(uidClause), noCheckoutClause(), hasRealCheckInClause()],
  };
}

/** Normalize punch-in for validation (handles Date, ISO string, legacy). */
function resolvePunchInMs(att) {
  if (!att || typeof att !== 'object') return null;
  const raw = att.checkInTime ?? att.checkInAt ?? att.punchIn;
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isNaN(t) || t <= 0 ? null : t;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const t = raw > 1e12 ? raw : raw * 1000;
    return t > 0 ? t : null;
  }
  if (typeof raw === 'object' && raw != null && raw.$date != null) {
    const d = new Date(raw.$date);
    const t = d.getTime();
    return Number.isNaN(t) || t <= 0 ? null : t;
  }
  const d = new Date(raw);
  const t = d.getTime();
  return Number.isNaN(t) || t <= 0 ? null : t;
}

/** Build location object per spec: { lat, lng, address?, pincode?, recordedAt } */
function buildLocationObject(lat, lng, address, pincode) {
  const now = new Date();
  return {
    lat: Number(lat),
    lng: Number(lng),
    ...(address != null && address !== '' && { address: String(address) }),
    ...(pincode != null && pincode !== '' && { pincode: String(pincode) }),
    recordedAt: parseTimestamp(now),
  };
}

/** Haversine distance in meters between two lat/lng points. */
function haversineDistanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function extractCustomerLatLng(customer) {
  if (!customer || typeof customer !== 'object') return null;

  // Customer GPS can be stored in different shapes depending on how it's inserted.
  // Try common candidates: root props, nested `location`, nested `customFields`.
  const candidates = [
    { lat: customer.latitude, lng: customer.longitude },
    { lat: customer.lat, lng: customer.lng },
    { lat: customer.location?.latitude, lng: customer.location?.longitude },
    { lat: customer.location?.lat, lng: customer.location?.lng },
    { lat: customer.geofence?.latitude, lng: customer.geofence?.longitude },
    { lat: customer.geofence?.lat, lng: customer.geofence?.lng },
    { lat: customer.customFields?.latitude, lng: customer.customFields?.longitude },
    { lat: customer.customFields?.lat, lng: customer.customFields?.lng },
    { lat: customer.customFields?.location?.latitude, lng: customer.customFields?.location?.longitude },
    { lat: customer.customFields?.location?.lat, lng: customer.customFields?.location?.lng },
    { lat: customer.customFields?.geofence?.latitude, lng: customer.customFields?.geofence?.longitude },
    { lat: customer.customFields?.geofence?.lat, lng: customer.customFields?.geofence?.lng },
  ];

  for (const c of candidates) {
    if (c.lat == null || c.lng == null) continue;
    const lat = Number(c.lat);
    const lng = Number(c.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

function cleanAddressValue(value) {
  if (value == null) return '';
  const out = String(value).trim();
  return out;
}

function normalizeTaskStatus(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s_]+/g, '');
}

function buildAddressSnapshot(source) {
  if (!source || typeof source !== 'object') return null;
  const address = cleanAddressValue(source.address);
  const fullAddress = cleanAddressValue(source.fullAddress);
  const city = cleanAddressValue(source.city);
  const area = cleanAddressValue(source.area);
  const pincode = cleanAddressValue(source.pincode);
  if (!address && !fullAddress && !city && !area && !pincode) return null;
  return {
    address,
    fullAddress,
    city,
    area,
    pincode,
  };
}

function scoreAddressSnapshot(snapshot) {
  if (!snapshot) return -1;
  const text = snapshot.fullAddress || snapshot.address || '';
  let score = 0;
  if (snapshot.address) score += 2;
  if (snapshot.fullAddress) score += 2;
  if (snapshot.area) score += 1;
  if (snapshot.city) score += 1;
  if (snapshot.pincode) score += 1;
  if (/\d/.test(text)) score += 2;
  const commaCount = (text.match(/,/g) || []).length;
  score += Math.min(commaCount, 3);
  return score;
}

function selectBestAddressSnapshot(...snapshots) {
  let best = null;
  let bestScore = -1;
  for (const snapshot of snapshots) {
    const normalized = buildAddressSnapshot(snapshot);
    const score = scoreAddressSnapshot(normalized);
    if (score > bestScore) {
      best = normalized;
      bestScore = score;
    }
  }
  return best;
}

function hasUsableAddressSnapshot(snapshot) {
  if (!snapshot) return false;
  return Boolean(
    snapshot.address ||
    snapshot.fullAddress ||
    snapshot.city ||
    snapshot.area ||
    snapshot.pincode
  );
}

async function findNearbyRecentAddress({ staffId, lat, lng, taskId = null, maxDistanceM = 30, maxAgeMinutes = 15 }) {
  if (!staffId || lat == null || lng == null) return null;
  const since = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  const query = {
    staffId,
    timestamp: { $gte: since },
    $or: [
      { address: { $exists: true, $ne: '' } },
      { fullAddress: { $exists: true, $ne: '' } },
    ],
  };

  if (taskId == null) {
    query.$and = [{ $or: [{ taskId: null }, { taskId: { $exists: false } }] }];
  } else {
    query.taskId = taskId;
  }

  const recentRecords = await Tracking.find(query)
    .select('latitude longitude address fullAddress city area pincode timestamp')
    .sort({ timestamp: -1 })
    .limit(10)
    .lean();

  for (const record of recentRecords) {
    if (record?.latitude == null || record?.longitude == null) continue;
    const distanceM = haversineDistanceM(
      Number(lat),
      Number(lng),
      Number(record.latitude),
      Number(record.longitude)
    );
    if (distanceM <= maxDistanceM) {
      return buildAddressSnapshot(record);
    }
  }

  return null;
}

async function normalizePresenceMovementType({
  staffId,
  lat,
  lng,
  timestamp,
  movementType,
  accuracy,
}) {
  const requested = String(movementType || '').trim().toLowerCase();
  if (!['stop', 'walking', 'driving'].includes(requested)) return movementType || undefined;

  const now = timestamp ? new Date(timestamp) : new Date();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    return requested;
  }
  const since = new Date(now.getTime() - 10 * 60 * 1000);
  const latestPresence = await Tracking.findOne({
    staffId,
    timestamp: { $gte: since, $lt: now },
    $or: [{ taskId: null }, { taskId: { $exists: false } }],
  })
    .select('latitude longitude timestamp movementType accuracy')
    .sort({ timestamp: -1 })
    .lean();

  if (!latestPresence?.latitude || !latestPresence?.longitude || !latestPresence?.timestamp) {
    if (requested === 'driving' || requested === 'walking') {
      const acc = accuracy != null ? Number(accuracy) : null;
      if (acc != null && acc > 25) return 'stop';
    }
    return requested;
  }

  const distanceM = haversineDistanceM(
    Number(lat),
    Number(lng),
    Number(latestPresence.latitude),
    Number(latestPresence.longitude)
  );
  const elapsedSeconds = Math.max(
    1,
    Math.round((now.getTime() - new Date(latestPresence.timestamp).getTime()) / 1000)
  );
  const speedKmh = (distanceM / elapsedSeconds) * 3.6;
  const currentAccuracy = accuracy != null ? Number(accuracy) : null;

  if (requested === 'driving') {
    if (distanceM < 25 || speedKmh < 10 || (currentAccuracy != null && currentAccuracy > 25)) {
      return distanceM >= 8 && speedKmh >= 2 ? 'walking' : 'stop';
    }
    return 'driving';
  }

  if (requested === 'walking') {
    if (distanceM < 6 || speedKmh < 1.5 || (currentAccuracy != null && currentAccuracy > 30)) {
      return 'stop';
    }
    if (speedKmh >= 12 && distanceM >= 25) return 'driving';
    return 'walking';
  }

  return 'stop';
}

/**
 * Get last start point (time + lat/lng) for segment calculation.
 * If restarted[] has entries: use last restart (segment: travel_resumed). Else: use initial start (segment: travel_started).
 */
function getLastStartPoint(details) {
  const restarted = details?.restarted || [];
  if (restarted.length > 0) {
    const last = restarted[restarted.length - 1];
    const loc = last.restartLocation || last;
    const lat = loc.lat ?? loc.latitude;
    const lng = loc.lng ?? loc.longitude;
    const t = last.restartedAt || last.resumedAt || last.time;
    return { startTime: t ? new Date(t) : null, startLat: lat, startLng: lng, segment: 'travel_resumed' };
  }
  const startTime = details?.startTime || details?.rideStartedAt || details?.started;
  const loc = details?.startLocation || details?.rideStartLocation || {};
  const lat = loc.lat ?? loc.latitude;
  const lng = loc.lng ?? loc.longitude;
  return { startTime: startTime ? new Date(startTime) : null, startLat: lat, startLng: lng, segment: 'travel_started' };
}

/**
 * Compute duration (seconds) and distance (km) from start point to end point.
 * segment: travel_started | travel_resumed (where segment began)
 * endType: travel_exited | arrived (how segment ended)
 */
function computeTravelSegment(startPoint, endLat, endLng, endTime, isArrived) {
  const segment = startPoint.segment; // travel_started or travel_resumed
  const endType = isArrived ? 'arrived' : 'travel_exited';
  const end = endTime ? new Date(endTime) : new Date();
  let durationSeconds = 0;
  if (startPoint.startTime) {
    durationSeconds = Math.round((end - startPoint.startTime) / 1000);
  }
  let distanceKm = 0;
  if (startPoint.startLat != null && startPoint.startLng != null && endLat != null && endLng != null) {
    const distM = haversineDistanceM(
      Number(startPoint.startLat),
      Number(startPoint.startLng),
      Number(endLat),
      Number(endLng)
    );
    distanceKm = distM / 1000;
  }
  return { segment, endType, durationSeconds, distanceKm, endTime: end };
}

/** Compute presenceStatus: 'task' if task in_progress, else 'in_office' if within staff's branch geofence, else 'out_of_office'.
 * Uses the same multi-circle rules as attendance (geofence.locations[] + legacy fallbacks). */
async function computePresenceStatus(taskStatus, lat, lng, branchId) {
  const statusLower = normalizeTaskStatus(taskStatus);
  if (statusLower === 'inprogress' || statusLower === 'progress') return 'task';

  if (!branchId || !Branch) return 'out_of_office';
  const branch = await Branch.findById(branchId)
    .select('geofence branchName latitude longitude radius')
    .lean();
  if (!branch) return 'out_of_office';

  return isLatLngInsideBranchGeofence(branch, lat, lng, 0) ? 'in_office' : 'out_of_office';
}

/** Compute presenceStatus for staff presence (no task): same geofence rules as check-in. Optional accuracy (m) widens circles slightly. */
async function computePresenceStatusForOffice(lat, lng, branchId, accuracyM = 0) {
  if (!branchId || !Branch) return 'out_of_office';
  const branch = await Branch.findById(branchId)
    .select('geofence branchName latitude longitude radius')
    .lean();
  if (!branch) return 'out_of_office';

  return isLatLngInsideBranchGeofence(branch, lat, lng, accuracyM) ? 'in_office' : 'out_of_office';
}

/**
 * Validate today's attendance for presence tracking.
 * Track ONLY IF: check-in exists AND check-out does NOT exist AND not on leave.
 * Supports mobile attendance (checkInTime/checkOutTime), web attendance (checkInAt/checkOutAt, dayStatus),
 * and legacy punch schemas.
 */
async function validateAttendanceForPresence(staffId) {
  if (!Attendance) {
    return { canTrack: true };
  }
  if (!staffId) {
    return { canTrack: false, reason: 'no_staff_id' };
  }

  const uidClause = attendanceUserIdClause(staffId);

  // Mobile app attendances (attendanceController): userId or legacy `user`, open session, must have check-in time.
  let attendance = await Attendance.findOne(openSessionAndCheckInQuery(uidClause))
    .sort({ checkInTime: -1, checkInAt: -1, punchIn: -1 })
    .lean();

  // Same calendar day (server local).
  if (!attendance) {
    const dayStart = startOfLocalDay(new Date());
    const dayEnd = endOfLocalDay(new Date());
    attendance = await Attendance.findOne({
      $and: [
        staffOwnsAttendanceRow(uidClause),
        { checkInTime: { $gte: dayStart, $lte: dayEnd } },
        noCheckoutClause(),
        hasRealCheckInClause(),
      ],
    })
      .sort({ checkInTime: -1, checkInAt: -1, punchIn: -1 })
      .lean();
  }

  // Web/admin rows often have checkInAt only (no checkInTime).
  if (!attendance) {
    const dayStart = startOfLocalDay(new Date());
    const dayEnd = endOfLocalDay(new Date());
    attendance = await Attendance.findOne({
      $and: [
        staffOwnsAttendanceRow(uidClause),
        { checkInAt: { $gte: dayStart, $lte: dayEnd } },
        noCheckoutClause(),
        hasRealCheckInClause(),
      ],
    })
      .sort({ checkInAt: -1, checkInTime: -1, punchIn: -1 })
      .lean();
  }

  if (!attendance) {
    const dayStart = startOfLocalDay(new Date());
    const dayEnd = endOfLocalDay(new Date());
    attendance = await Attendance.findOne({
      $and: [
        staffOwnsAttendanceRow(uidClause),
        { attendanceDate: { $gte: dayStart, $lte: dayEnd } },
        noCheckoutClause(),
        hasRealCheckInClause(),
      ],
    })
      .sort({ checkInTime: -1, checkInAt: -1, punchIn: -1 })
      .lean();
  }

  if (!attendance) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();
    const startOfDay = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

    attendance = await Attendance.findOne({
      employeeId: staffId,
      date: { $gte: startOfDay, $lte: endOfDay },
      ...hasRealCheckInClause(),
    }).lean();

    if (!attendance) {
      attendance = await Attendance.findOne({
        user: staffId,
        date: { $gte: startOfDay, $lte: endOfDay },
        ...hasRealCheckInClause(),
      }).lean();
    }

    // Fallback: open punch (no punchOut) within 48h — fixes UTC vs local date mismatch on attendance.date
    if (!attendance) {
      const since = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      attendance = await Attendance.findOne({
        employeeId: staffId,
        punchIn: { $ne: null, $gte: since },
        punchOut: null,
      })
        .sort({ punchIn: -1 })
        .lean();
    }
    if (!attendance) {
      const since = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      attendance = await Attendance.findOne({
        user: staffId,
        punchIn: { $ne: null, $gte: since },
        punchOut: null,
      })
        .sort({ punchIn: -1 })
        .lean();
    }
  }

  if (!attendance) return { canTrack: false, reason: 'no_attendance' };

  const punchInMs = resolvePunchInMs(attendance);
  const punchOut = attendance.checkOutTime ?? attendance.punchOut ?? attendance.checkOutAt;
  const leaveType = attendance.leaveType;
  const leaveKind = attendance.leaveKind;
  const dayStatus = attendance.dayStatus;

  if (punchInMs == null) return { canTrack: false, reason: 'no_attendance' };
  if (punchOut != null && punchOut !== '') {
    const outMs = punchOut instanceof Date ? punchOut.getTime() : new Date(punchOut).getTime();
    if (Number.isFinite(outMs) && outMs > 0) {
      return { canTrack: false, reason: 'checked_out' };
    }
  }
  if (leaveType != null && String(leaveType).trim() !== '') return { canTrack: false, reason: 'on_leave' };
  if (leaveKind != null && String(leaveKind).trim() !== '') return { canTrack: false, reason: 'on_leave' };
  if (String(dayStatus || '').toUpperCase() === 'LEAVE') return { canTrack: false, reason: 'on_leave' };

  return { canTrack: true };
}

/**
 * POST /api/tracking/presence/store
 * Body: { lat, lng, timestamp?, batteryPercent?, movementType?, accuracy?, presenceStatus?, status?, appStatus?, address?, fullAddress?, city?, area?, pincode? }
 * Stores presence tracking point. Attendance-validated: only when checked in, not checked out, not on leave.
 * presenceStatus: always computed server-side from branch geofence (same rules as check-in).
 * status: backend-managed active/inactive for fresh/stale presence tracking
 * appStatus: app lifecycle state from client (active | inactive | offline | app_background | app_closed)
 */
exports.storePresenceTracking = async (req, res) => {
  try {
    const {
      lat,
      lng,
      timestamp,
      batteryPercent,
      movementType,
      accuracy,
      status: clientStatus,
      appStatus: clientAppStatus,
      address,
      fullAddress,
      city,
      area,
      pincode,
    } = req.body;
    const actor = resolveActor(req);
    const staffId = actor.id;
    const staffName = actor.name;
    console.log(
      '[PresenceTracking] store request:',
      JSON.stringify({
        staffId: staffId ? String(staffId) : null,
        branchId: actor.branchId ? String(actor.branchId) : null,
        lat,
        lng,
        timestamp,
        clientStatus,
        clientAppStatus,
      }),
    );

    if (!staffId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (lat == null || lng == null) {
      return res.status(400).json({ success: false, message: 'lat, lng required' });
    }

    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return res.status(400).json({ success: false, message: 'lat, lng must be valid numbers' });
    }

    const validation = await validateAttendanceForPresence(staffId);
    if (!validation.canTrack) {
      console.log(
        '[PresenceTracking] blocked by attendance validation:',
        JSON.stringify({
          staffId: String(staffId),
          reason: validation.reason || 'attendance state invalid',
        }),
      );
      return res.status(403).json({
        success: false,
        message: `Presence tracking not allowed: ${validation.reason || 'attendance state invalid'}`,
        reason: validation.reason,
      });
    }

    const branchId = actor.branchId;
    const accuracyM = accuracy != null ? Number(accuracy) : 0;
    // Always derive from branch geofence (matches check-in); avoids client/server mismatches on multi-location branches.
    const resolvedPresenceStatus = await computePresenceStatusForOffice(
      latNum,
      lngNum,
      branchId,
      accuracyM,
    );

    const hasClientAddress =
      [address, fullAddress, city, area, pincode].some(
        (value) => value != null && String(value).trim() !== '',
      );
    let geo = null;
    if (!hasClientAddress) {
      try {
        geo = await reverseGeocode(latNum, lngNum);
      } catch (e) {
        console.log('[PresenceTracking] Geocode failed:', e.message);
      }
    }

    const clientAddress = buildAddressSnapshot({ address, fullAddress, city, area, pincode });
    let resolvedAddress = clientAddress;

    if (!hasUsableAddressSnapshot(resolvedAddress)) {
      const nearbyAddress = await findNearbyRecentAddress({
        staffId,
        lat: latNum,
        lng: lngNum,
        taskId: null,
      });
      resolvedAddress = selectBestAddressSnapshot(nearbyAddress, geo);
    }

    let now = parseTimestamp(timestamp);
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      now = new Date();
    }
    const normalizedClientStatus = String(clientStatus || '').trim();
    const normalizedClientAppStatus = String(clientAppStatus || '').trim();
    const validAppStatuses = ['app_closed', 'app_background', 'active', 'inactive', 'offline'];
    const appStatusValue = validAppStatuses.includes(normalizedClientAppStatus)
      ? normalizedClientAppStatus
      : validAppStatuses.includes(normalizedClientStatus)
        ? normalizedClientStatus
        : 'active';
    const normalizedMovementType = await normalizePresenceMovementType({
      staffId,
      lat: latNum,
      lng: lngNum,
      timestamp: now,
      movementType,
      accuracy,
    });
    const staffIdStr = String(staffId);
    let usersIdForDoc = staffId;
    if (mongoose.Types.ObjectId.isValid(staffIdStr) && staffIdStr.length === 24) {
      try {
        usersIdForDoc = new mongoose.Types.ObjectId(staffIdStr);
      } catch (_) {
        usersIdForDoc = staffId;
      }
    }
    const doc = {
      taskId: null,
      usersId: usersIdForDoc,
      staffId: staffIdStr,
      staffName: staffName || undefined,
      latitude: latNum,
      longitude: lngNum,
      presenceStatus: resolvedPresenceStatus,
      timestamp: now,
      status: 'active',
      appStatus: appStatusValue,
      time: now,
      batteryPercent: batteryPercent != null ? Number(batteryPercent) : undefined,
      movementType: normalizedMovementType || undefined,
      accuracy: accuracy != null ? Number(accuracy) : undefined,
      address: resolvedAddress?.address || resolvedAddress?.fullAddress || undefined,
      fullAddress: resolvedAddress?.fullAddress || resolvedAddress?.address || undefined,
      city: resolvedAddress?.city || undefined,
      area: resolvedAddress?.area || undefined,
      pincode: resolvedAddress?.pincode || undefined,
    };
    console.log(
      '[PresenceTracking] create doc:',
      JSON.stringify({
        staffId: doc.staffId,
        usersId: doc.usersId ? String(doc.usersId) : null,
        presenceStatus: doc.presenceStatus,
        appStatus: doc.appStatus,
        movementType: doc.movementType,
        latitude: doc.latitude,
        longitude: doc.longitude,
        timestamp: doc.timestamp,
      }),
    );

    const saved = await Tracking.create(doc);
    console.log(
      '[PresenceTracking] stored:',
      JSON.stringify({
        _id: String(saved._id),
        staffId: doc.staffId,
        presenceStatus: doc.presenceStatus,
        appStatus: doc.appStatus,
        movementType: doc.movementType,
      }),
    );

    if (resolvedPresenceStatus === 'in_office') {
      console.log(
        '[PresenceTracking] in_office stored:',
        JSON.stringify({
          _id: saved._id,
          staffId: String(staffId),
          staffName: doc.staffName,
          latitude: doc.latitude,
          longitude: doc.longitude,
          presenceStatus: resolvedPresenceStatus,
          movementType: doc.movementType,
          timestamp: doc.timestamp,
          address: doc.address,
          accuracy: doc.accuracy,
        }),
      );
    }

    res.status(201).json({ success: true, data: { _id: saved._id } });
  } catch (error) {
    console.error('[PresenceTracking] Error storing:', error?.message || error);
    if (error?.stack) console.error(error.stack);
    const dev = process.env.NODE_ENV !== 'production';
    res.status(500).json({
      success: false,
      message: 'Server Error',
      ...(dev && error?.message ? { details: String(error.message) } : {}),
    });
  }
};

/**
 * GET /api/tracking/presence/status
 * Returns whether staff can start presence tracking (attendance-validated).
 */
exports.getPresenceTrackingStatus = async (req, res) => {
  try {
    const staffId = resolveActor(req).id;
    if (!staffId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const validation = await validateAttendanceForPresence(staffId);
    const baseQuery = User.findById(staffId).select('branchId');
    const staff = Branch
      ? await baseQuery.populate('branchId', 'branchName latitude longitude radius geofence').lean()
      : await baseQuery.lean();

    /** Full office circle(s) for the app — same rules as attendance (locations[] + legacy). Web check-in has no app pin; client compares against this. */
    let branchGeofence = null;
    const branch = staff?.branchId;
    if (branch && typeof branch === 'object') {
      const ge = getBranchGeofenceTargets(branch);
      if (ge.enabled && ge.targets.length > 0) {
        branchGeofence = {
          enabled: true,
          targets: ge.targets.map((t) => {
            const o = {
              latitude: t.latitude,
              longitude: t.longitude,
              radius: t.radius,
            };
            if (t.label) o.label = t.label;
            return o;
          }),
        };
        const t0 = ge.targets[0];
        branchGeofence.latitude = t0.latitude;
        branchGeofence.longitude = t0.longitude;
        branchGeofence.radius = t0.radius;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        canTrack: validation.canTrack,
        reason: validation.reason,
        branchGeofence,
      },
    });
  } catch (error) {
    console.error('[PresenceTracking] Error getting status:', error.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

/**
 * GET /api/tracking/presence
 * Query: staffId, from, to, limit – admin fetches presence records.
 */
exports.getPresenceTrackingData = async (req, res) => {
  try {
    const { staffId, from, to, limit = 500 } = req.query;
    const query = { $or: [{ taskId: null }, { taskId: { $exists: false } }] };
    if (staffId) query.staffId = staffId;
    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from);
      if (to) query.timestamp.$lte = new Date(to);
    }
    const records = await Tracking.find(query)
      .sort({ timestamp: -1 })
      .limit(Math.min(parseInt(limit, 10) || 500, 2000))
      .lean();
    res.status(200).json({ success: true, data: records });
  } catch (error) {
    console.error('[PresenceTracking] Error fetching:', error.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

/**
 * POST /api/tracking/store
 * Body: { taskId, lat, lng, timestamp?, batteryPercent?, movementType?, address?, fullAddress?, city?, area?, pincode? }
 * Stores tracking point in Tracking collection with reverse-geocoded address.
 * Called by mobile app on Start Ride and every 15 sec during Live Tracking.
 */
exports.storeTracking = async (req, res) => {
  try {
    if (shouldLogTrackings()) {
      logTrackingWrite('task_store_request', {
        taskId: req.body?.taskId,
        lat: req.body?.lat,
        lng: req.body?.lng,
        movementType: req.body?.movementType,
        batteryPercent: req.body?.batteryPercent,
      });
    }
    const {
      taskId,
      lat,
      lng,
      timestamp,
      batteryPercent,
      movementType,
      destinationLat,
      destinationLng,
      address,
      fullAddress,
      city,
      area,
      pincode,
    } = req.body;
    const actor = resolveActor(req);
    const staffId = actor.id;
    const staffName = actor.name;
    if (!taskId || lat == null || lng == null) {
      return res.status(400).json({ success: false, message: 'taskId, lat, lng required' });
    }
    // taskId from body can be mongo _id or TASK-XXXXXXXX-XXXX; we store tasks._id (ObjectId)
    const isObjectId = /^[a-fA-F0-9]{24}$/.test(String(taskId));
    let task = isObjectId
      ? await Task.findById(taskId).select('_id taskId assignedTo status')
      : await Task.findOne({ taskId }).select('_id taskId assignedTo status');
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    const staffIdObj = staffId;
    const branchId = actor.branchId;
    if (!staffIdObj) {
      return res.status(400).json({
        success: false,
        message: 'Unable to resolve user for tracking. Please login again.',
      });
    }
    const presenceStatus = await computePresenceStatus(task.status, lat, lng, branchId);
    const resolvedStaffName = staffName;
    const hasClientAddress =
      [address, fullAddress, city, area, pincode].some(
        (value) => value != null && String(value).trim() !== '',
      );
    let geo = null;
    if (!hasClientAddress) {
      try {
        geo = await reverseGeocode(Number(lat), Number(lng));
      } catch (e) {
        console.log('[Tracking] Geocode failed:', e.message);
      }
    }
    const clientAddress = buildAddressSnapshot({ address, fullAddress, city, area, pincode });
    const resolvedAddress = hasUsableAddressSnapshot(clientAddress)
      ? clientAddress
      : buildAddressSnapshot(geo);
    const atTime = parseTimestamp(timestamp);
    const bizTz = await resolveBusinessTimezone(
      req.staff || { businessId: actor.companyId }
    );
    const taskCount = await computeDailyTaskCountForStaff({
      staffId: staffIdObj,
      taskId: task._id,
      atTime,
      timeZone: bizTz,
    });
    const trackingDoc = {
      taskId: task._id,
      staffId: staffIdObj,
      staffName: resolvedStaffName,
      latitude: Number(lat),
      longitude: Number(lng),
      presenceStatus,
      timestamp: atTime,
      batteryPercent: batteryPercent != null ? Number(batteryPercent) : undefined,
      movementType: movementType || undefined,
      destinationLat: destinationLat != null ? Number(destinationLat) : undefined,
      destinationLng: destinationLng != null ? Number(destinationLng) : undefined,
      address: resolvedAddress?.address || resolvedAddress?.fullAddress || undefined,
      fullAddress: resolvedAddress?.fullAddress || resolvedAddress?.address || undefined,
      city: resolvedAddress?.city || undefined,
      area: resolvedAddress?.area || undefined,
      pincode: resolvedAddress?.pincode || undefined,
      taskCount,
    };
    const saved = await Tracking.create(trackingDoc);
    logTrackingWrite('task_store_saved', {
      _id: String(saved._id),
      taskId: String(task._id),
      taskIdDisplay: task.taskId,
      staffId: String(trackingDoc.staffId),
      staffName: trackingDoc.staffName,
      latitude: trackingDoc.latitude,
      longitude: trackingDoc.longitude,
      presenceStatus: trackingDoc.presenceStatus,
      movementType: trackingDoc.movementType,
      batteryPercent: trackingDoc.batteryPercent,
      timestamp: trackingDoc.timestamp,
    });
    res.status(201).json({ success: true, data: { _id: saved._id } });
  } catch (error) {
    console.error('[Tracking] Error storing:', error.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

/**
 * GET /api/tracking
 * Query: staffId, taskId, from (ISO date), to (ISO date), limit (default 500)
 * Admin fetches tracking records from the Tracking collection.
 */
exports.getTrackingData = async (req, res) => {
  try {
    const { staffId, taskId, from, to, limit = 500 } = req.query;
    const query = {};
    if (staffId) query.staffId = staffId;
    if (taskId) {
      const isObjectId = /^[a-fA-F0-9]{24}$/.test(String(taskId));
      const taskDoc = isObjectId ? await Task.findById(taskId).select('_id') : await Task.findOne({ taskId }).select('_id');
      query.taskId = taskDoc ? taskDoc._id : taskId;
    }
    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from);
      if (to) query.timestamp.$lte = new Date(to);
    }
    const records = await Tracking.find(query)
      .sort({ timestamp: -1 })
      .limit(Math.min(parseInt(limit, 10) || 500, 2000))
      .lean();
    res.status(200).json({ success: true, data: records });
  } catch (error) {
    console.error('[Tracking] Error fetching tracking data:', error.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

/**
 * POST /api/tracking/exit
 * Body: { taskId, exitReason, exitType, lat?, lng? }
 * exitType: 'hold' (staff can resume) | 'exited' (exit full ride; only admin can reopen, then staff resumes).
 * Saves exit to tasks.task_exit, task_details.exit array AND trackings collection.
 */
exports.exitTracking = async (req, res) => {
  try {
    console.log('[Tracking] POST /exit – body:', JSON.stringify(req.body));
    const { taskId, exitReason, exitType, lat, lng } = req.body;
    const actor = resolveActor(req);
    const staffId = actor.id;
    const staffName = actor.name;
    if (!taskId || !exitReason || String(exitReason).trim() === '') {
      const missing = [];
      if (!taskId) missing.push('taskId');
      if (!exitReason || String(exitReason).trim() === '') missing.push('exitReason');
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`,
      });
    }
    const normalizedExitType = (exitType === 'hold' || exitType === 'exited') ? exitType : 'exited';
    // Support taskId as MongoDB ObjectId or TASK-XXXXXXXX-XXXX
    const isObjectId = /^[a-fA-F0-9]{24}$/.test(String(taskId));
    let taskModel = Task;
    let task = isObjectId
      ? await taskModel.findById(taskId).select('_id taskId status task_exit assignedTo')
      : await taskModel.findOne({ taskId }).select('_id taskId status task_exit assignedTo');
    if (!task) {
      taskModel = LegacyTask;
      task = isObjectId
        ? await taskModel.findById(taskId).select('_id taskId status task_exit assignedTo')
        : await taskModel.findOne({ taskId }).select('_id taskId status task_exit assignedTo');
    }
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    const statusLower = normalizeTaskStatus(task.status);
    const staffIdObj = staffId;
    const resolvedStaffName = staffName;
    if (!staffIdObj) {
      return res.status(400).json({
        success: false,
        message: 'Unable to resolve user for tracking. Please login again.',
      });
    }

    const exitLat = lat != null ? Number(lat) : 0;
    const exitLng = lng != null ? Number(lng) : 0;
    let geo = null;
    if (exitLat !== 0 || exitLng !== 0) {
      try {
        geo = await reverseGeocode(exitLat, exitLng);
      } catch (e) {
        console.log('[Tracking] Exit geocode failed:', e.message);
      }
    }

    const exitAddress = geo?.address || undefined;
    const exitNow = parseTimestamp(new Date());
    const exitLocation = buildLocationObject(exitLat, exitLng, exitAddress, geo?.pincode);
    const exitRecord = {
      exitedAt: exitNow,
      exitReason: String(exitReason).trim(),
      exitLocation,
      status: normalizedExitType,
    };

    const taskStatus = normalizedExitType === 'hold' ? 'hold' : 'exited';

    // Append to task.exit (never delete previous exits); set current task_exit and status
    const taskMongoId = task._id;
    try {
      await taskModel.findByIdAndUpdate(taskMongoId, {
        $set: {
          status: taskStatus,
          task_exit: {
            status: normalizedExitType,
            exitReason: String(exitReason).trim(),
            exitedAt: exitNow,
          },
        },
        $push: { exit: exitRecord },
        $unset: buildUnsetExtended(),
      }, { runValidators: false });
    } catch (updateErr) {
      console.error('[Tracking] Exit Task update failed:', updateErr.message);
      return res.status(400).json({
        success: false,
        message: `Failed to update task status: ${updateErr.message}`,
      });
    }
    // Secondary writes should never block exit completion.
    // If these fail, task exit still stays recorded in main task document.
    try {
      const details = await TaskDetails.findOne({ taskId: task._id }).lean();
      const tasksExit = [...(details?.exit || []), exitRecord];

      // Compute and append travel segment only when exiting during ride (in_progress/progress).
      let taskTravelDuration = details?.taskTravelDuration || [];
      let taskTravelDistance = details?.taskTravelDistance || [];
      if (statusLower === 'inprogress' || statusLower === 'progress') {
        const startPoint = getLastStartPoint(details);
        const travelSegment = computeTravelSegment(startPoint, exitLat, exitLng, exitNow, false);
        taskTravelDuration = [...taskTravelDuration, { segment: travelSegment.segment, endType: travelSegment.endType, durationSeconds: travelSegment.durationSeconds, endTime: travelSegment.endTime }];
        taskTravelDistance = [...taskTravelDistance, { segment: travelSegment.segment, endType: travelSegment.endType, distanceKm: travelSegment.distanceKm, endTime: travelSegment.endTime }];
      }

      const fullDoc = {
        ...(details || {}),
        taskMongoId: task._id,
        status: taskStatus,
        exit: tasksExit,
        taskTravelDuration,
        taskTravelDistance,
      };
      await upsertTaskDetails(fullDoc);

      const bizTz = await resolveBusinessTimezone(
        req.staff || { businessId: actor.companyId }
      );
      const taskCount = await computeDailyTaskCountForStaff({
        staffId: staffIdObj,
        taskId: task._id,
        atTime: exitNow,
        timeZone: bizTz,
      });
      const trackingDoc = {
        taskId: task._id,
        staffId: staffIdObj,
        staffName: resolvedStaffName,
        latitude: exitLat,
        longitude: exitLng,
        presenceStatus: 'task', // task is in_progress at exit time
        exitStatus: normalizedExitType,
        exitReason: exitRecord.exitReason,
        exitedAt: exitRecord.exitedAt,
        time: exitRecord.exitedAt,
        timestamp: exitNow,
        address: exitAddress,
        fullAddress: exitAddress,
        pincode: geo?.pincode || undefined,
        taskCount,
      };
      const savedExit = await Tracking.create(trackingDoc);
      logTrackingWrite('task_exit', {
        _id: String(savedExit._id),
        taskId: String(task._id),
        staffId: String(trackingDoc.staffId),
        latitude: trackingDoc.latitude,
        longitude: trackingDoc.longitude,
        exitStatus: trackingDoc.exitStatus,
        presenceStatus: trackingDoc.presenceStatus,
      });
    } catch (nonBlockingErr) {
      console.error('[Tracking] Non-blocking exit follow-up failed:', nonBlockingErr.message);
    }
    res.status(201).json({ success: true, message: 'Exit recorded' });
  } catch (error) {
    console.error('[Tracking] Error recording exit:', error.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

/**
 * POST /api/tracking/restart
 * Body: { taskId, lat?, lng? }
 * Allowed only when: task_exit.status === 'hold' (staff can resume) OR task.status === 'reopened' (admin reopened after exit full).
 */
exports.restartTracking = async (req, res) => {
  try {
    const { taskId, lat, lng, fullAddress, pincode } = req.body;
    if (!taskId) {
      return res.status(400).json({ success: false, message: 'taskId required' });
    }
    const task = await Task.findById(taskId).select('taskId status task_exit').lean();
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    const exitStatus = task.task_exit?.status;
    const statusLower = normalizeTaskStatus(task.status);
    const canRestart =
      statusLower === 'hold' ||
      statusLower === 'resumed' ||
      (statusLower === 'exited' && (exitStatus === 'hold' || exitStatus == null)) ||
      statusLower === 'reopened';
    if (!canRestart) {
      if (!['exited', 'reopened', 'hold', 'resumed'].includes(statusLower)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status for restart: task must be hold, resumed, exited, or reopened, got ${task.status}`,
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Only admin can reopen this task. You cannot resume until the task is reopened.',
      });
    }
    const resumeLat = lat != null ? Number(lat) : 0;
    const resumeLng = lng != null ? Number(lng) : 0;
    let geo = null;
    if (resumeLat !== 0 || resumeLng !== 0) {
      try {
        geo = await reverseGeocode(resumeLat, resumeLng);
      } catch (e) {
        console.log('[Tracking] Restart geocode failed:', e.message);
      }
    }
    const restartAddress = fullAddress || geo?.address || undefined;
    const resumeNow = parseTimestamp(new Date());
    const restartLocation = buildLocationObject(
      resumeLat,
      resumeLng,
      restartAddress,
      pincode || geo?.pincode
    );
    const restartRecord = {
      restartedAt: resumeNow,
      restartLocation,
    };
    const wasOnArrival = false;
    const updateData = {
      status: wasOnArrival ? 'arrived' : 'progress',
      startTime: resumeNow,
      started: resumeNow,
      startLocation: { lat: resumeLat, lng: resumeLng },
      rideStartLocation: restartLocation,
      rideStartedAt: resumeNow,
      sourceLocation: {
        lat: resumeLat,
        lng: resumeLng,
        address: fullAddress || geo?.address || undefined,
        fullAddress: fullAddress || geo?.address || undefined,
        pincode: pincode || geo?.pincode || undefined,
      },
    };
    // Append to task.restarted; clear task_exit; set arrived (if on-arrival legacy) or progress.
    await Task.findByIdAndUpdate(taskId, {
      $set: { status: wasOnArrival ? 'arrived' : 'progress' },
      $push: { restarted: restartRecord },
      $unset: { ...buildUnsetExtended(), task_exit: 1 },
    });
    const details = await TaskDetails.findOne({ taskId: task._id }).lean();
    const tasksRestarted = [...(details?.restarted || []), restartRecord];
    const fullDoc = {
      ...(details || {}),
      taskMongoId: task._id,
      ...updateData,
      restarted: tasksRestarted,
    };
    await upsertTaskDetails(fullDoc);
    res.status(200).json({ success: true, message: 'Restart recorded' });
  } catch (error) {
    console.error('[Tracking] Error recording restart:', error.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

/**
 * POST /api/tracking/arrived
 * Body: { taskId, lat, lng, fullAddress?, pincode?, sourceFullAddress? }
 * Stores arrived in tasks and trackings. Sets task status to "arrived".
 */
exports.arrivedTracking = async (req, res) => {
  try {
    const { taskId, lat, lng, fullAddress, pincode, sourceFullAddress } = req.body;
    const actor = resolveActor(req);
    const staffId = actor.id;
    const staffName = actor.name;
    if (!taskId || lat == null || lng == null) {
      return res.status(400).json({ success: false, message: 'taskId, lat, lng required' });
    }
    const task = await Task.findById(taskId).select(
      '_id assignedTo taskId status customerId'
    );
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    const currentStatus = normalizeTaskStatus(task.status);
    if (currentStatus !== 'inprogress' && currentStatus !== 'progress') {
      return res.status(400).json({
        success: false,
        message: `Invalid status for arrived: task must be progress, got ${task.status}`,
      });
    }
    const details = await TaskDetails.findOne({ taskId: task._id }).lean();
    const staffIdObj = staffId;
    const resolvedStaffName = staffName;
    if (!staffIdObj) {
      return res.status(400).json({
        success: false,
        message: 'Unable to resolve user for tracking. Please login again.',
      });
    }

    const arrivalLat = Number(lat);
    const arrivalLng = Number(lng);
    let geo = null;
    try {
      geo = await reverseGeocode(arrivalLat, arrivalLng);
    } catch (e) {
      console.log('[Tracking] Arrived geocode failed:', e.message);
    }
    const resolvedFullAddress = fullAddress || geo?.address;
    const resolvedPincode = pincode || geo?.pincode;
    const srcLoc = details?.sourceLocation || req.body?.sourceLocation || {};
    const resolvedSourceFullAddress = sourceFullAddress || srcLoc.address || srcLoc.fullAddress;

    const now = parseTimestamp(new Date());
    const arrivalLocation = buildLocationObject(
      arrivalLat,
      arrivalLng,
      resolvedFullAddress,
      resolvedPincode
    );

    // Compute override flags for staff "Arrived" tap.
    // 1) Arrival vs customer's stored GPS: true when arrival is farther than ~50m.
    // 2) Destination override: true when arrival is farther than ~50m from the last destinationLocation.
    let overridenCustomerlocation = false;
    const customerId = details?.customerId || task.customerId;
    if (customerId) {
      const customer = await Customer.findById(customerId).lean();
      const customerCoords = extractCustomerLatLng(customer);
      if (customerCoords) {
        const distM = haversineDistanceM(arrivalLat, arrivalLng, customerCoords.lat, customerCoords.lng);
        overridenCustomerlocation = distM > 50;
      }
    }
    // "Last destination" is stored in task_details.destinationLocation.
    // Mark override when staff arrived > 50m away from that last destination.
    let overridendestinationlocation = false;
    const destination = details?.destinationLocation;
    const destinationLat = destination?.lat ?? destination?.latitude;
    const destinationLng = destination?.lng ?? destination?.longitude;
    if (destinationLat != null && destinationLng != null) {
      const distM = haversineDistanceM(
        arrivalLat,
        arrivalLng,
        Number(destinationLat),
        Number(destinationLng),
      );
      overridendestinationlocation = distM > 50;
    } else {
      // Backward compat fallback: older documents might rely on destinationChanged only.
      overridendestinationlocation = details?.destinationChanged === true;
    }

    arrivalLocation.overridencustomerlocation = overridenCustomerlocation;
    arrivalLocation.overridendestinationlocation = overridendestinationlocation;
    const updateData = {
      status: 'arrived',
      progressSteps: { ...(details?.progressSteps || {}), reachedLocation: true },
      arrivalTime: now,
      arrived: now,
      arrivedAt: now,
      arrivedLatitude: arrivalLat,
      arrivedLongitude: arrivalLng,
      arrivedFullAddress: resolvedFullAddress,
      arrivedPincode: resolvedPincode,
      arrivedDate: now,
      arrivedTime: new Date(now).toTimeString().slice(0, 8),
      arrivalLocation,
      sourceFullAddress: resolvedSourceFullAddress,
    };
    const persistedTravelMetrics = await computePersistedTravelMetrics(
      task._id,
      details || task,
      now
    );
    if (persistedTravelMetrics) {
      updateData.tripDurationSeconds = persistedTravelMetrics.tripDurationSeconds;
      updateData.travelActivityDuration =
        persistedTravelMetrics.travelActivityDuration;
    } else if (req.body.tripDurationSeconds != null) {
      updateData.tripDurationSeconds = Number(req.body.tripDurationSeconds);
    }
    const travelActivityDuration = normalizeTravelActivityDuration(
      req.body?.travelActivityDuration
    );
    if (travelActivityDuration && !persistedTravelMetrics) {
      updateData.travelActivityDuration = travelActivityDuration;
    }
    if (req.body.sourceLocation) {
      updateData.sourceLocation = { ...srcLoc, ...req.body.sourceLocation };
    }
    const srcLat = srcLoc.lat ?? srcLoc.latitude;
    const srcLng = srcLoc.lng ?? srcLoc.longitude;
    if (srcLat != null && srcLng != null) {
      const distM = haversineDistanceM(srcLat, srcLng, arrivalLat, arrivalLng);
      updateData.tripDistanceKm = distM / 1000;
    } else if (req.body.tripDistanceKm != null) {
      updateData.tripDistanceKm = Number(req.body.tripDistanceKm);
    }

    // Compute and append travel segment: travel_started→arrived or travel_resumed→arrived
    const startPoint = getLastStartPoint(details);
    const travelSegment = computeTravelSegment(startPoint, arrivalLat, arrivalLng, now, true);
    const taskTravelDuration = [...(details?.taskTravelDuration || []), { segment: travelSegment.segment, endType: travelSegment.endType, durationSeconds: travelSegment.durationSeconds, endTime: travelSegment.endTime }];
    const taskTravelDistance = [...(details?.taskTravelDistance || []), { segment: travelSegment.segment, endType: travelSegment.endType, distanceKm: travelSegment.distanceKm, endTime: travelSegment.endTime }];

    await Task.findByIdAndUpdate(taskId, {

      $set: { status: 'arrived' },
      $unset: buildUnsetExtended(),
    });
    const fullDoc = {
      ...(details || {}),
      taskMongoId: task._id,
      ...updateData,
      taskTravelDuration,
      taskTravelDistance,
    };
    await upsertTaskDetails(fullDoc);

    const bizTz = await resolveBusinessTimezone(
      req.staff || { businessId: actor.companyId }
    );
    const taskCount = await computeDailyTaskCountForStaff({
      staffId: staffIdObj,
      taskId: task._id,
      atTime: now,
      timeZone: bizTz,
    });
    const trackingDoc = {
      taskId: task._id,
      staffId: staffIdObj,
      staffName: resolvedStaffName,
      latitude: arrivalLat,
      longitude: arrivalLng,
      presenceStatus: 'task', // task is in_progress at arrived time
      status: 'arrived',
      fullAddress: resolvedFullAddress,
      address: resolvedFullAddress,
      pincode: resolvedPincode,
      time: now,
      timestamp: now,
      taskCount,
    };
    const savedArrived = await Tracking.create(trackingDoc);
    logTrackingWrite('task_arrived', {
      _id: String(savedArrived._id),
      taskId: String(task._id),
      staffId: String(trackingDoc.staffId),
      latitude: trackingDoc.latitude,
      longitude: trackingDoc.longitude,
      status: trackingDoc.status,
      presenceStatus: trackingDoc.presenceStatus,
    });
    res.status(201).json({ success: true, message: 'Arrived recorded' });
  } catch (error) {
    console.error('[Tracking] Error recording arrived:', error.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

/**
 * POST /api/tracking/start
 * Body: { staffId: "698431645d46a76820cf973d" }
 * Admin starts tracking a staff by staffId. Returns staff info.
 * Admin then connects via Socket.io, emits admin:track-staff { staffId }, and receives
 * tracking:location events for that staff.
 */
exports.startTracking = async (req, res) => {
  try {
    const { staffId } = req.body;
    if (!staffId) {
      return res.status(400).json({ success: false, message: 'staffId required' });
    }
    const staff = await User.findById(staffId).select('name');
    if (!staff) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(200).json({
      success: true,
      data: {
        message: `Tracking started for ${staff.name}`,
        staffId: staff._id.toString(),
        staffName: staff.name,
      },
    });
  } catch (error) {
    console.error('[Tracking] Error starting tracking:', error.message);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
