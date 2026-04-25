const mongoose = require('mongoose');
const Company = require('../models/Company');
const CompanyProduct = require('../models/CompanyProduct');
const { toItem, parseBody } = require('./companyProductController');

function isMainSuperAdmin(req) {
  return req.admin?.role === 'mainsuperadmin';
}

function canAccessPartnerResource(req, createdById) {
  if (isMainSuperAdmin(req)) return true;
  const ownerId =
    createdById && typeof createdById === 'object' && createdById._id != null
      ? createdById._id
      : createdById;
  return String(ownerId || '') === String(req.admin?._id || '');
}

/** Partner: portfolio ads + any legacy per-company products for companies they created. */
async function listQueryForRequester(req) {
  if (isMainSuperAdmin(req)) {
    return {};
  }
  const companyIds = await Company.find({ createdBySuperAdminId: req.admin._id }).distinct('_id');
  return {
    $or: [{ portfolioSuperAdminId: req.admin._id }, { companyId: { $in: companyIds } }],
  };
}

async function assertCanMutateProduct(req, doc) {
  if (!doc) {
    const err = new Error('Product not found.');
    err.status = 404;
    throw err;
  }
  if (doc.portfolioSuperAdminId) {
    if (!canAccessPartnerResource(req, doc.portfolioSuperAdminId)) {
      const err = new Error('Access denied.');
      err.status = 403;
      throw err;
    }
    return;
  }
  if (doc.companyId) {
    const company = await Company.findById(doc.companyId).select('createdBySuperAdminId').lean();
    if (!company || !canAccessPartnerResource(req, company.createdBySuperAdminId)) {
      const err = new Error('Access denied.');
      err.status = 403;
      throw err;
    }
    return;
  }
  const err = new Error('Product not found.');
  err.status = 404;
  throw err;
}

async function listProducts(req, res, next) {
  try {
    const q = await listQueryForRequester(req);
    const items = await CompanyProduct.find(q).sort({ updatedAt: -1 }).limit(1000).lean();
    return res.json({ items: items.map((p) => toItem(p)) });
  } catch (e) {
    return next(e);
  }
}

async function createProduct(req, res, next) {
  try {
    const raw = parseBody(req.body || {}, { partial: false });
    if (!raw.name) return res.status(400).json({ message: 'Product name is required.' });
    const doc = await CompanyProduct.create({
      portfolioSuperAdminId: req.admin._id,
      ...raw,
    });
    return res.status(201).json({ item: toItem(doc) });
  } catch (e) {
    return next(e);
  }
}

async function updateProduct(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id))) return res.status(400).json({ message: 'Invalid product id.' });
    const existing = await CompanyProduct.findById(id);
    if (!existing) return res.status(404).json({ message: 'Product not found.' });
    try {
      await assertCanMutateProduct(req, existing);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ message: e.message });
      throw e;
    }
    const raw = parseBody(req.body || {}, { partial: true });
    if (raw.name !== undefined) {
      if (!String(raw.name).trim()) return res.status(400).json({ message: 'Product name cannot be empty.' });
      existing.name = raw.name;
    }
    for (const k of [
      'shortDescription',
      'fullDescription',
      'bannerImage',
      'videoUrl',
      'images',
      'price',
      'offerTag',
      'showInApp',
      'highlightProduct',
      'showOnHomeBanner',
      'status',
      'ctaLabel',
      'ctaType',
      'ctaValue',
    ]) {
      if (raw[k] !== undefined) existing[k] = raw[k];
    }
    await existing.save();
    return res.json({ item: toItem(existing) });
  } catch (e) {
    return next(e);
  }
}

async function deleteProduct(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id))) return res.status(400).json({ message: 'Invalid product id.' });
    const existing = await CompanyProduct.findById(id);
    if (!existing) return res.status(404).json({ message: 'Product not found.' });
    try {
      await assertCanMutateProduct(req, existing);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ message: e.message });
      throw e;
    }
    await CompanyProduct.deleteOne({ _id: id });
    return res.json({ ok: true });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
};
