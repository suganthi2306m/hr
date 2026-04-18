const mongoose = require('mongoose');
const dayjs = require('dayjs');
const VisitLog = require('../models/VisitLog');

function parseDateRange(dateStr) {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
  if (!m) return null;
  const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0));
  const end = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999));
  return { start, end };
}

function toObjectId(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
  return new mongoose.Types.ObjectId(String(id));
}

async function checkInVisit({ agentId, customerId, lat, lng, checkInTime, meta }) {
  const agentOid = toObjectId(agentId);
  const customerOid = toObjectId(customerId);
  if (!agentOid || !customerOid) {
    const err = new Error('Valid agentId and customerId are required');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const err = new Error('Valid lat and lng are required');
    err.status = 400;
    throw err;
  }

  const open = await VisitLog.findOne({ agentId: agentOid, customerId: customerOid, status: 'IN' })
    .sort({ checkInTime: -1 })
    .lean();
  if (open) {
    return open;
  }

  return VisitLog.create({
    agentId: agentOid,
    customerId: customerOid,
    checkInTime: checkInTime ? new Date(checkInTime) : new Date(),
    status: 'IN',
    location: { type: 'Point', coordinates: [lng, lat] },
    source: 'mobile',
    meta: meta && typeof meta === 'object' ? meta : {},
  });
}

async function checkOutVisit({ visitId, agentId, customerId, lat, lng, checkOutTime, minDurationSeconds = 120 }) {
  let doc = null;
  if (visitId && mongoose.Types.ObjectId.isValid(String(visitId))) {
    doc = await VisitLog.findById(String(visitId));
  }
  if (!doc) {
    const q = { status: 'IN' };
    const a = toObjectId(agentId);
    const c = toObjectId(customerId);
    if (a) q.agentId = a;
    if (c) q.customerId = c;
    doc = await VisitLog.findOne(q).sort({ checkInTime: -1 });
  }
  if (!doc) {
    const err = new Error('No active visit found');
    err.status = 404;
    throw err;
  }

  const outAt = checkOutTime ? new Date(checkOutTime) : new Date();
  const durationSeconds = Math.max(0, dayjs(outAt).diff(dayjs(doc.checkInTime), 'second'));
  if (durationSeconds < Number(minDurationSeconds || 120)) {
    const err = new Error(`Minimum visit duration is ${minDurationSeconds} seconds`);
    err.status = 400;
    throw err;
  }

  doc.checkOutTime = outAt;
  doc.status = 'OUT';
  doc.durationSeconds = durationSeconds;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    doc.checkOutLocation = { type: 'Point', coordinates: [lng, lat] };
  }
  await doc.save();
  return doc;
}

async function getActiveVisits({ agentId }) {
  const q = { status: 'IN' };
  const a = toObjectId(agentId);
  if (a) q.agentId = a;
  return VisitLog.find(q).sort({ checkInTime: -1 }).lean();
}

async function getAgentRoute({ agentId, date }) {
  const a = toObjectId(agentId);
  if (!a) return [];
  const range = parseDateRange(date);
  const q = { agentId: a };
  if (range) {
    q.checkInTime = { $gte: range.start, $lte: range.end };
  }
  const rows = await VisitLog.find(q).sort({ checkInTime: 1 }).lean();
  return rows.map((r) => ({
    visitId: String(r._id),
    customerId: String(r.customerId),
    checkInTime: r.checkInTime,
    checkOutTime: r.checkOutTime || null,
    durationSeconds: r.durationSeconds || 0,
    checkInPoint: r.location?.coordinates
      ? { lng: Number(r.location.coordinates[0]), lat: Number(r.location.coordinates[1]) }
      : null,
    checkOutPoint: r.checkOutLocation?.coordinates
      ? { lng: Number(r.checkOutLocation.coordinates[0]), lat: Number(r.checkOutLocation.coordinates[1]) }
      : null,
  }));
}

module.exports = {
  checkInVisit,
  checkOutVisit,
  getActiveVisits,
  getAgentRoute,
};
