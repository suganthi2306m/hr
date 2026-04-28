const { getLatestLocations, getUserHistory, getUserRoute, upsertLocation } = require('../services/locationService');
const Company = require('../models/Company');

async function getCompanyIdForAdmin(adminId) {
  if (!adminId) return null;
  const company = await Company.findOne({ adminId }).select('_id').lean();
  return company?._id || null;
}

async function ingestLocation(req, res, next) {
  try {
    const mobileKey = process.env.MOBILE_INGEST_KEY;
    if (mobileKey && req.headers['x-mobile-key'] !== mobileKey) {
      return res.status(401).json({ message: 'Unauthorized mobile source' });
    }

    const entry = await upsertLocation(req.body);
    req.app.get('io').emit('location:update', entry);
    return res.status(201).json({ item: entry });
  } catch (error) {
    return next(error);
  }
}

async function latestLocations(_req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(_req.admin?._id);
    if (!companyId) {
      return res.status(400).json({ message: 'Complete company setup to view tracking.' });
    }
    const items = await getLatestLocations({
      userId: _req.query.userId,
      limit: Number(_req.query.limit) || undefined,
      companyId,
    });
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
}

async function userHistory(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin?._id);
    if (!companyId) {
      return res.status(400).json({ message: 'Complete company setup to view tracking.' });
    }
    const items = await getUserHistory(req.params.userId, {
      limit: Number(req.query.limit) || undefined,
      date: typeof req.query.date === 'string' ? req.query.date : undefined,
      companyId,
    });
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
}

async function userRoute(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin?._id);
    if (!companyId) {
      return res.status(400).json({ message: 'Complete company setup to view tracking.' });
    }
    const items = await getUserRoute(req.params.userId, {
      date: typeof req.query.date === 'string' ? req.query.date : undefined,
      companyId,
    });
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  ingestLocation,
  latestLocations,
  userHistory,
  userRoute,
};
