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

async function scopeQueryForUserCompany(companyId) {
  const co = await Company.findById(companyId).select('createdBySuperAdminId').lean();
  const partnerId = co?.createdBySuperAdminId;
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
