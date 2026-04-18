const mongoose = require('mongoose');
const Company = require('../models/Company');
const GeoFence = require('../models/GeoFence');

async function getCompanyIdForAdmin(adminId) {
  const company = await Company.findOne({ adminId }).select('_id');
  return company?._id || null;
}

async function loadCompanyBranches(companyId) {
  const company = await Company.findById(companyId).select('branches').lean();
  return company?.branches || [];
}

function branchNameForId(branches, branchId) {
  if (!branchId) return '';
  const b = branches.find((x) => String(x._id) === String(branchId));
  return b?.name || '';
}

async function assertBranchForCompany(companyId, branchId) {
  if (!branchId || !mongoose.Types.ObjectId.isValid(String(branchId))) {
    const error = new Error('branchId is required and must be a valid branch.');
    error.status = 400;
    throw error;
  }
  const branches = await loadCompanyBranches(companyId);
  const ok = branches.some((b) => String(b._id) === String(branchId));
  if (!ok) {
    const error = new Error('Branch does not exist for this company.');
    error.status = 400;
    throw error;
  }
}

function enrichFencesWithBranch(items, branches) {
  return items.map((g) => ({
    ...g,
    branchName: branchNameForId(branches, g.branchId),
  }));
}

async function listGeoFences(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const q = { companyId };
    const branchFilter = req.query.branchId;
    if (branchFilter && mongoose.Types.ObjectId.isValid(String(branchFilter))) {
      q.branchId = new mongoose.Types.ObjectId(String(branchFilter));
    }
    const [items, branches] = await Promise.all([
      GeoFence.find(q).sort({ branchId: 1, createdAt: -1 }).lean(),
      loadCompanyBranches(companyId),
    ]);
    return res.json({ items: enrichFencesWithBranch(items, branches), branches });
  } catch (e) {
    return next(e);
  }
}

async function createGeoFence(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const { name, lat, lng, radiusM, alertOnEntry, alertOnExit, branchId, isActive } = req.body;
    if (!name || lat == null || lng == null || radiusM == null) {
      return res.status(400).json({ message: 'name, lat, lng, radiusM are required.' });
    }
    await assertBranchForCompany(companyId, branchId);
    const item = await GeoFence.create({
      companyId,
      branchId: new mongoose.Types.ObjectId(String(branchId)),
      name: String(name).trim(),
      lat: Number(lat),
      lng: Number(lng),
      radiusM: Number(radiusM),
      alertOnEntry: Boolean(alertOnEntry),
      alertOnExit: Boolean(alertOnExit),
      isActive: isActive !== false,
    });
    const branches = await loadCompanyBranches(companyId);
    const lean = item.toObject();
    return res.status(201).json({ item: { ...lean, branchName: branchNameForId(branches, lean.branchId) } });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    return next(e);
  }
}

const ALLOWED_UPDATE = new Set([
  'name',
  'lat',
  'lng',
  'radiusM',
  'alertOnEntry',
  'alertOnExit',
  'branchId',
  'isActive',
]);

async function updateGeoFence(req, res, next) {
  try {
    const companyId = await getCompanyIdForAdmin(req.admin._id);
    if (!companyId) return res.status(400).json({ message: 'Complete company setup first.' });
    const patch = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      if (!ALLOWED_UPDATE.has(k)) continue;
      if (k === 'branchId') {
        if (v == null || v === '') {
          const error = new Error('branchId cannot be cleared; assign another branch.');
          error.status = 400;
          throw error;
        }
        await assertBranchForCompany(companyId, v);
        patch.branchId = new mongoose.Types.ObjectId(String(v));
        continue;
      }
      if (k === 'name') patch.name = String(v).trim();
      else if (k === 'lat') patch.lat = Number(v);
      else if (k === 'lng') patch.lng = Number(v);
      else if (k === 'radiusM') patch.radiusM = Number(v);
      else if (k === 'alertOnEntry') patch.alertOnEntry = Boolean(v);
      else if (k === 'alertOnExit') patch.alertOnExit = Boolean(v);
      else if (k === 'isActive') patch.isActive = Boolean(v);
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ message: 'No valid fields to update.' });
    }
    const item = await GeoFence.findOneAndUpdate({ _id: req.params.id, companyId }, { $set: patch }, { new: true }).lean();
    if (!item) return res.status(404).json({ message: 'Geo-fence not found.' });
    const branches = await loadCompanyBranches(companyId);
    return res.json({ item: { ...item, branchName: branchNameForId(branches, item.branchId) } });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
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
