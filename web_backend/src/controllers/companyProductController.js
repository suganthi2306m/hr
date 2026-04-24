const mongoose = require('mongoose');
const Company = require('../models/Company');
const CompanyProduct = require('../models/CompanyProduct');

async function getCompanyForAdmin(adminId) {
  return Company.findOne({ adminId }).select('_id');
}

function toItem(doc) {
  const p = doc && typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(p._id),
    companyId: String(p.companyId),
    name: p.name,
    shortDescription: p.shortDescription || '',
    fullDescription: p.fullDescription || '',
    bannerImage: p.bannerImage || '',
    images: Array.isArray(p.images) ? p.images.filter(Boolean) : [],
    price: p.price != null ? p.price : null,
    offerTag: p.offerTag || '',
    showInApp: Boolean(p.showInApp),
    highlightProduct: Boolean(p.highlightProduct),
    showOnHomeBanner: Boolean(p.showOnHomeBanner),
    status: p.status === 'inactive' ? 'inactive' : 'active',
    ctaLabel: p.ctaLabel || 'Contact Us',
    ctaType: ['none', 'phone', 'url', 'email'].includes(p.ctaType) ? p.ctaType : 'none',
    ctaValue: p.ctaValue || '',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function parseImages(body) {
  if (Array.isArray(body.images)) {
    return body.images.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 20);
  }
  if (typeof body.imagesText === 'string') {
    return body.imagesText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  return [];
}

function parseBody(body, { partial } = { partial: false }) {
  const next = {};
  if (!partial || body.name != null) next.name = String(body.name || '').trim();
  if (!partial || body.shortDescription != null) next.shortDescription = String(body.shortDescription || '').trim();
  if (!partial || body.fullDescription != null) next.fullDescription = String(body.fullDescription || '').trim();
  if (!partial || body.bannerImage != null) next.bannerImage = String(body.bannerImage || '').trim();
  if (!partial || body.images != null || body.imagesText != null) next.images = parseImages(body);
  if (!partial || body.price !== undefined) {
    if (body.price === '' || body.price == null) next.price = null;
    else {
      const n = Number(body.price);
      next.price = Number.isFinite(n) ? n : null;
    }
  }
  if (!partial || body.offerTag != null) next.offerTag = String(body.offerTag || '').trim();
  if (!partial || body.showInApp != null) next.showInApp = Boolean(body.showInApp);
  if (!partial || body.highlightProduct != null) next.highlightProduct = Boolean(body.highlightProduct);
  if (!partial || body.showOnHomeBanner != null) next.showOnHomeBanner = Boolean(body.showOnHomeBanner);
  if (!partial || body.status != null) {
    next.status = String(body.status || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active';
  }
  if (!partial || body.ctaLabel != null) next.ctaLabel = String(body.ctaLabel || 'Contact Us').trim() || 'Contact Us';
  if (!partial || body.ctaType != null) {
    const t = String(body.ctaType || 'none').toLowerCase();
    next.ctaType = ['phone', 'url', 'email'].includes(t) ? t : 'none';
  }
  if (!partial || body.ctaValue != null) next.ctaValue = String(body.ctaValue || '').trim();
  return next;
}

async function listProducts(req, res, next) {
  try {
    const company = await getCompanyForAdmin(req.admin._id);
    if (!company?._id) return res.status(400).json({ message: 'Complete company setup first.' });
    const items = await CompanyProduct.find({ companyId: company._id }).sort({ updatedAt: -1 }).lean();
    return res.json({ items: items.map((p) => toItem(p)) });
  } catch (e) {
    return next(e);
  }
}

async function createProduct(req, res, next) {
  try {
    const company = await getCompanyForAdmin(req.admin._id);
    if (!company?._id) return res.status(400).json({ message: 'Complete company setup first.' });
    const raw = parseBody(req.body || {}, { partial: false });
    if (!raw.name) return res.status(400).json({ message: 'Product name is required.' });
    const doc = await CompanyProduct.create({
      companyId: company._id,
      ...raw,
    });
    return res.status(201).json({ item: toItem(doc) });
  } catch (e) {
    return next(e);
  }
}

async function updateProduct(req, res, next) {
  try {
    const company = await getCompanyForAdmin(req.admin._id);
    if (!company?._id) return res.status(400).json({ message: 'Complete company setup first.' });
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid product id.' });
    const existing = await CompanyProduct.findOne({ _id: id, companyId: company._id });
    if (!existing) return res.status(404).json({ message: 'Product not found.' });
    const raw = parseBody(req.body || {}, { partial: true });
    if (raw.name !== undefined) {
      if (!String(raw.name).trim()) return res.status(400).json({ message: 'Product name cannot be empty.' });
      existing.name = raw.name;
    }
    for (const k of [
      'shortDescription',
      'fullDescription',
      'bannerImage',
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
    const company = await getCompanyForAdmin(req.admin._id);
    if (!company?._id) return res.status(400).json({ message: 'Complete company setup first.' });
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid product id.' });
    const r = await CompanyProduct.deleteOne({ _id: id, companyId: company._id });
    if (!r.deletedCount) return res.status(404).json({ message: 'Product not found.' });
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
