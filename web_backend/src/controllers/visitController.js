const {
  checkInVisit,
  checkOutVisit,
  getActiveVisits,
  getAgentRoute,
} = require('../services/visitService');

function ensureMobileKey(req, res) {
  const mobileKey = process.env.MOBILE_INGEST_KEY;
  if (mobileKey && req.headers['x-mobile-key'] !== mobileKey) {
    res.status(401).json({ message: 'Unauthorized mobile source' });
    return false;
  }
  return true;
}

async function checkIn(req, res, next) {
  try {
    if (!ensureMobileKey(req, res)) return;
    const item = await checkInVisit({
      agentId: req.body.agentId,
      customerId: req.body.customerId,
      lat: Number(req.body.lat),
      lng: Number(req.body.lng),
      checkInTime: req.body.checkInTime,
      meta: req.body.meta,
    });
    return res.status(201).json({ item });
  } catch (error) {
    return next(error);
  }
}

async function checkOut(req, res, next) {
  try {
    if (!ensureMobileKey(req, res)) return;
    const item = await checkOutVisit({
      visitId: req.body.visitId,
      agentId: req.body.agentId,
      customerId: req.body.customerId,
      lat: req.body.lat != null ? Number(req.body.lat) : undefined,
      lng: req.body.lng != null ? Number(req.body.lng) : undefined,
      checkOutTime: req.body.checkOutTime,
      minDurationSeconds: Number(req.body.minDurationSeconds) || 120,
    });
    return res.json({ item });
  } catch (error) {
    return next(error);
  }
}

async function activeVisits(req, res, next) {
  try {
    const items = await getActiveVisits({ agentId: req.query.agentId });
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
}

async function agentRoute(req, res, next) {
  try {
    const items = await getAgentRoute({
      agentId: req.query.agentId,
      date: typeof req.query.date === 'string' ? req.query.date : undefined,
    });
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  checkIn,
  checkOut,
  activeVisits,
  agentRoute,
};
