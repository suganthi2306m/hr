const mongoose = require('mongoose');
const Company = require('../models/Company');
const CompanyProduct = require('../models/CompanyProduct');

function activeBase() {
  return { status: 'active', showInApp: true };
}

function productScopeOrForCompany(companyDocId, partnerSuperAdminId) {
  const or = [{ companyId: companyDocId }];
  if (partnerSuperAdminId) {
    or.push({ companyId: null, portfolioSuperAdminId: partnerSuperAdminId });
  }
  return { $or: or };
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

function pickPartnerIdFromDoc(doc) {
  if (!doc || typeof doc !== 'object') return '';
  const candidates = [
    doc.createdBySuperAdminId,
    doc.superAdminId,
    doc.createdByMainSuperAdminId,
    doc.createdByAdminId,
  ];
  for (const c of candidates) {
    const id = normalizeObjectIdString(c);
    if (id) return id;
  }
  return '';
}

async function resolvePartnerSuperAdminId(companyRaw, companyDocId) {
  const direct = pickPartnerIdFromDoc(companyRaw);
  if (direct) return direct;

  // Fallback: resolve from the company admin account linked to this company.
  const usersColl = Company.db.collection('users');
  let companyAdmin = null;
  const adminId = normalizeObjectIdString(companyRaw?.adminId);
  if (adminId) {
    try {
      companyAdmin = await usersColl.findOne({ _id: new mongoose.Types.ObjectId(adminId) });
    } catch (_) {}
  }
  if (!companyAdmin) {
    try {
      companyAdmin = await usersColl.findOne(
        { companyId: new mongoose.Types.ObjectId(String(companyDocId)), role: { $regex: /admin/i } },
        { sort: { createdAt: 1 } },
      );
    } catch (_) {}
  }
  return pickPartnerIdFromDoc(companyAdmin);
}

async function scopeQueryForUserCompany(companyId) {
  const coRaw = await loadCompanyRawById(companyId);
  const partnerId = await resolvePartnerSuperAdminId(coRaw, companyId);
  return { ...activeBase(), ...productScopeOrForCompany(companyId, partnerId) };
}

function toMobileCard(p) {
  return {
    id: String(p._id),
    name: p.name,
    shortDescription: p.shortDescription || '',
    bannerImage: p.bannerImage || '',
    videoUrl: p.videoUrl || '',
    offerTag: p.offerTag || '',
    price: p.price != null ? p.price : null,
    highlightProduct: Boolean(p.highlightProduct),
    showOnHomeBanner: Boolean(p.showOnHomeBanner),
    portfolioWide: Boolean(p.portfolioSuperAdminId),
  };
}

function toMobileDetail(p) {
  const base = toMobileCard(p);
  return {
    ...base,
    fullDescription: p.fullDescription || '',
    videoUrl: p.videoUrl || '',
    images: Array.isArray(p.images) ? p.images.filter(Boolean) : [],
    ctaLabel: p.ctaLabel || 'Contact Us',
    ctaType: ['none', 'phone', 'url', 'email'].includes(p.ctaType) ? p.ctaType : 'none',
    ctaValue: p.ctaValue || '',
  };
}

async function listHomeProducts(req, res, next) {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ message: 'No company assigned to this account.' });
    const q = await scopeQueryForUserCompany(companyId);
    const [banners, highlighted] = await Promise.all([
      CompanyProduct.find({ ...q, showOnHomeBanner: true }).sort({ updatedAt: -1 }).limit(12).lean(),
      CompanyProduct.find({ ...q, highlightProduct: true }).sort({ updatedAt: -1 }).limit(24).lean(),
    ]);
    return res.json({
      banners: banners.map(toMobileCard),
      highlighted: highlighted.map(toMobileCard),
    });
  } catch (e) {
    return next(e);
  }
}

async function listCatalogProducts(req, res, next) {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ message: 'No company assigned to this account.' });
    const q = await scopeQueryForUserCompany(companyId);
    const items = await CompanyProduct.find(q).sort({ updatedAt: -1 }).lean();
    return res.json({ items: items.map(toMobileCard) });
  } catch (e) {
    return next(e);
  }
}

async function getProductById(req, res, next) {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) return res.status(400).json({ message: 'No company assigned to this account.' });
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid product id.' });
    const q = await scopeQueryForUserCompany(companyId);
    const p = await CompanyProduct.findOne({ _id: id, ...q }).lean();
    if (!p) return res.status(404).json({ message: 'Product not found.' });
    return res.json({ item: toMobileDetail(p) });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  listHomeProducts,
  listCatalogProducts,
  getProductById,
};
