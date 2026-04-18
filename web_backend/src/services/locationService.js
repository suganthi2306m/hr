const mongoose = require('mongoose');
const dayjs = require('dayjs');
const Location = require('../models/Location');
const User = require('../models/User');
const Task = require('../models/Task');
const GeoFence = require('../models/GeoFence');
const { haversineKm } = require('../utils/geo');

/** `YYYY-MM-DD` → UTC midnight … end-of-day (inclusive) for DB range queries */
function parseHistoryDateRange(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  const start = new Date(Date.UTC(y, mo, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo, d, 23, 59, 59, 999));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

function isUserActive(timestamp) {
  return dayjs().diff(dayjs(timestamp), 'minute') <= 10;
}

function resolveUserIdFromLocation(doc = {}) {
  const id = doc.usersId || doc.userId || doc.staffId;
  if (!id) return null;
  return String(id);
}

function normalizeTaskId(taskId) {
  if (!taskId) return null;
  if (typeof taskId === 'object' && taskId._id) return String(taskId._id);
  return String(taskId);
}

async function fetchUsersMap(userIds = []) {
  if (!userIds.length) return new Map();
  const users = await User.find({ _id: { $in: userIds } }).select('name isActive companyId').lean();
  return new Map(users.map((user) => [String(user._id), user]));
}

async function fetchTasksMap(taskIds = []) {
  if (!taskIds.length) return new Map();
  const objectIdTaskIds = taskIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  const nonObjectIds = taskIds.filter((id) => !mongoose.Types.ObjectId.isValid(id));
  const tasks = await Task.find({
    $or: [
      ...(objectIdTaskIds.length ? [{ _id: { $in: objectIdTaskIds } }] : []),
      ...(nonObjectIds.length ? [{ taskCode: { $in: nonObjectIds } }] : []),
    ],
  })
    .select('taskCode taskName taskTitle status description assignedTo')
    .lean();
  const map = new Map();
  tasks.forEach((task) => {
    map.set(String(task._id), task);
    if (task.taskCode) map.set(String(task.taskCode), task);
  });
  return map;
}

function toLocationEntry(doc, userMap, taskMap, fencesByCompany) {
  const userId = resolveUserIdFromLocation(doc);
  const ts = doc.timestamp || doc.time || doc.createdAt || new Date();
  const user = userMap.get(userId);
  const taskId = normalizeTaskId(doc.taskId);
  const task = taskMap.get(taskId);
  const lat = Number(doc.latitude);
  const lng = Number(doc.longitude);
  const idleMinutes = Math.max(0, Math.round(dayjs().diff(dayjs(ts), 'minute', true)));
  const isIdle = idleMinutes > 15;
  const cid = user?.companyId ? String(user.companyId) : null;
  const fences = cid && fencesByCompany ? fencesByCompany.get(cid) || [] : [];
  const geofenceStatus = fences.map((g) => {
    const distM = haversineKm(lat, lng, g.lat, g.lng) * 1000;
    return {
      id: String(g._id),
      name: g.name,
      inside: distM <= Number(g.radiusM || 0),
      distanceM: Math.round(distM),
    };
  });

  return {
    _id: String(doc._id),
    userId,
    userName: user?.name || 'Unknown user',
    latitude: lat,
    longitude: lng,
    timestamp: ts,
    lastSeenAt: ts,
    idleMinutes,
    isIdle,
    geofenceStatus,
    isActive: isUserActive(ts) && Boolean(user?.isActive ?? true),
    batteryPercent: doc.batteryPercent ?? null,
    movementType: doc.movementType ?? null,
    status: doc.status ?? null,
    address: doc.address || doc.fullAddress || null,
    pincode: doc.pincode || null,
    taskId,
    taskCode: task?.taskCode || null,
    taskName: task?.taskName || task?.taskTitle || null,
    taskStatus: task?.status || null,
    taskDescription: task?.description || null,
  };
}

async function enrichLocationDocs(docs) {
  const userIds = [...new Set(docs.map((doc) => resolveUserIdFromLocation(doc)).filter(Boolean))];
  const taskIds = [...new Set(docs.map((doc) => normalizeTaskId(doc.taskId)).filter(Boolean))];
  const [userMap, taskMap] = await Promise.all([fetchUsersMap(userIds), fetchTasksMap(taskIds)]);
  const companyIds = [
    ...new Set(
      [...userMap.values()]
        .map((u) => u.companyId)
        .filter(Boolean)
        .map((id) => String(id)),
    ),
  ];
  let fencesByCompany = new Map();
  if (companyIds.length) {
    const oids = companyIds.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
    const fences = await GeoFence.find({ companyId: { $in: oids } }).lean();
    fencesByCompany = fences.reduce((map, g) => {
      const k = String(g.companyId);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(g);
      return map;
    }, new Map());
  }
  return docs.map((doc) => toLocationEntry(doc, userMap, taskMap, fencesByCompany));
}

async function upsertLocation(payload = {}) {
  const userId = payload.usersId || payload.userId || payload.staffId;
  if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
    const error = new Error('Valid userId/usersId is required');
    error.status = 400;
    throw error;
  }
  if (payload.latitude == null || payload.longitude == null) {
    const error = new Error('latitude and longitude are required');
    error.status = 400;
    throw error;
  }

  const user = await User.findById(userId).select('_id');
  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  const entry = await Location.create({
    ...payload,
    usersId: user._id,
    timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
    latitude: Number(payload.latitude),
    longitude: Number(payload.longitude),
  });

  const [enriched] = await enrichLocationDocs([entry.toObject()]);
  return enriched;
}

async function getLatestLocations({ userId, limit = 500 } = {}) {
  const baseQuery = {
    latitude: { $ne: null },
    longitude: { $ne: null },
  };
  if (userId && mongoose.Types.ObjectId.isValid(String(userId))) {
    const oid = new mongoose.Types.ObjectId(String(userId));
    baseQuery.$or = [{ usersId: oid }, { userId: oid }, { staffId: oid }];
  }

  const raw = await Location.find(baseQuery)
    .sort({ timestamp: -1, createdAt: -1 })
    .limit(Math.max(limit, 50))
    .lean();

  const latestByUser = new Map();
  for (const item of raw) {
    const uid = resolveUserIdFromLocation(item);
    if (!uid || latestByUser.has(uid)) continue;
    latestByUser.set(uid, item);
  }
  return enrichLocationDocs([...latestByUser.values()]);
}

async function getUserHistory(userId, { limit = 200, date } = {}) {
  if (!mongoose.Types.ObjectId.isValid(String(userId))) return [];
  const oid = new mongoose.Types.ObjectId(String(userId));
  const range = parseHistoryDateRange(date);
  const base = {
    $or: [{ usersId: oid }, { userId: oid }, { staffId: oid }],
    latitude: { $ne: null },
    longitude: { $ne: null },
  };
  if (range) {
    base.$expr = {
      $let: {
        vars: { ts: { $ifNull: ['$timestamp', '$createdAt'] } },
        in: { $and: [{ $gte: ['$$ts', range.start] }, { $lte: ['$$ts', range.end] }] },
      },
    };
  }
  const docs = await Location.find(base)
    .sort({ timestamp: -1, createdAt: -1 })
    .limit(Math.max(1, Math.min(Number(limit) || 200, 2000)))
    .lean();
  return enrichLocationDocs(docs);
}

async function getUserRoute(userId, { date } = {}) {
  if (!mongoose.Types.ObjectId.isValid(String(userId))) return [];
  const oid = new mongoose.Types.ObjectId(String(userId));
  const range = parseHistoryDateRange(date);
  const base = {
    $or: [{ usersId: oid }, { userId: oid }, { staffId: oid }],
    latitude: { $ne: null },
    longitude: { $ne: null },
  };
  if (range) {
    base.$expr = {
      $let: {
        vars: { ts: { $ifNull: ['$timestamp', '$createdAt'] } },
        in: { $and: [{ $gte: ['$$ts', range.start] }, { $lte: ['$$ts', range.end] }] },
      },
    };
  }
  const docs = await Location.find(base).sort({ timestamp: 1, createdAt: 1 }).lean();
  return docs.map((doc) => ({
    lat: Number(doc.latitude),
    lng: Number(doc.longitude),
    timestamp: doc.timestamp || doc.createdAt || null,
    movementType: doc.movementType || null,
    batteryPercent: doc.batteryPercent ?? null,
  }));
}

module.exports = {
  upsertLocation,
  getLatestLocations,
  getUserHistory,
  getUserRoute,
  resolveUserIdFromLocation,
};
