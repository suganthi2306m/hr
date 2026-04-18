const Company = require('../models/Company');
const GeoFence = require('../models/GeoFence');

async function getCompanyIdForAdmin(adminId) {
  const company = await Company.findOne({ adminId }).select('_id');
  return company?._id || null;
}

async function listGeoFences(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const items = await GeoFence.find({ companyId }).sort({ createdAt: -1 }).lean();
    return res.json({ items });
  } catch (e) {
    return next(e);
  }
}

async function createGeoFence(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const { name, lat, lng, radiusM, alertOnEntry, alertOnExit } = req.body;
    if (!name || lat == null || lng == null || radiusM == null) {
      return res.status(400).json({ message: 'name, lat, lng, radiusM are required.' });
    }
    const item = await GeoFence.create({
      companyId,
      name: String(name).trim(),
      lat: Number(lat),
      lng: Number(lng),
      radiusM: Number(radiusM),
      alertOnEntry: Boolean(alertOnEntry),
      alertOnExit: Boolean(alertOnExit),
    });
    return res.status(201).json({ item });
  } catch (e) {
    return next(e);
  }
}

async function updateGeoFence(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const item = await GeoFence.findOneAndUpdate(
      { _id: req.params.id, companyId },
      { $set: req.body },
      { new: true },
    );
    if (!item) return res.status(404).json({ message: 'Geo-fence not found.' });
    return res.json({ item });
  } catch (e) {
    return next(e);
  }
}

async function deleteGeoFence(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    await GeoFence.findOneAndDelete({ _id: req.params.id, companyId });
    return res.status(204).send();
  } catch (e) {
    return next(e);
  }
}

module.exports = { listGeoFences, createGeoFence, updateGeoFence, deleteGeoFence };
