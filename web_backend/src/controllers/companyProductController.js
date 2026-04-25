const Company = require('../models/Company');
const CompanyProduct = require('../models/CompanyProduct');

async function getCompanyForAdmin(adminId) {
  return Company.findOne({ adminId }).select('_id');
}

function toItem(doc) {
  const p = doc && typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(p._id),
    companyId: p.companyId != null ? String(p.companyId) : '',
    portfolioWide: Boolean(p.portfolioSuperAdminId),
    name: p.name,
    shortDescription: p.shortDescription || '',
    fullDescription: p.fullDescription || '',
    bannerImage: p.bannerImage || '',
    videoUrl: p.videoUrl || '',
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
  if (!partial || body.videoUrl != null) next.videoUrl = String(body.videoUrl || '').trim();
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

function productScopeOrForCompany(companyDocId, partnerSuperAdminId) {
  const or = [{ companyId: companyDocId }];
  if (partnerSuperAdminId) {
    or.push({ companyId: null, portfolioSuperAdminId: partnerSuperAdminId });
  }
  return { $or: or };
}

async function listProducts(req, res, next) {
  try {
    const company = await getCompanyForAdmin(req.admin._id);
    if (!company?._id) return res.status(400).json({ message: 'Complete company setup first.' });
    const co = await Company.findById(company._id).select('createdBySuperAdminId').lean();
    const partnerId = co?.createdBySuperAdminId;
    const items = await CompanyProduct.find(productScopeOrForCompany(company._id, partnerId))
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({ items: items.map((p) => toItem(p)) });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  listProducts,
  toItem,
  parseBody,
  productScopeOrForCompany,
};
