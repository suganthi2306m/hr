const mongoose = require('mongoose');
const CompanyProduct = require('../models/CompanyProduct');

function activeVisibleQuery(companyId) {
  return {
    companyId,
    status: 'active',
    showInApp: true,
  };
}

function toMobileCard(p) {
  return {
    id: String(p._id),
    name: p.name,
    shortDescription: p.shortDescription || '',
    bannerImage: p.bannerImage || '',
    offerTag: p.offerTag || '',
    price: p.price != null ? p.price : null,
    highlightProduct: Boolean(p.highlightProduct),
    showOnHomeBanner: Boolean(p.showOnHomeBanner),
  };
}

function toMobileDetail(p) {
  const base = toMobileCard(p);
  return {
    ...base,
    fullDescription: p.fullDescription || '',
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
    const q = activeVisibleQuery(companyId);
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
    const items = await CompanyProduct.find(activeVisibleQuery(companyId)).sort({ updatedAt: -1 }).lean();
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
    const p = await CompanyProduct.findOne({
      _id: id,
      ...activeVisibleQuery(companyId),
    }).lean();
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
