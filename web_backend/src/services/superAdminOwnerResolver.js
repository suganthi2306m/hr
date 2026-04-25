const Admin = require('../models/Admin');

const DEFAULT_SUPERADMIN_EMAIL = 'manjunath@mcrindia.in';

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function getPreferredSuperAdminEmail() {
  return normalizeEmail(process.env.PREFERRED_BILLING_SUPERADMIN_EMAIL || DEFAULT_SUPERADMIN_EMAIL);
}

async function findPreferredSuperAdmin() {
  const email = getPreferredSuperAdminEmail();
  if (!email) return null;
  return Admin.findOne({
    email,
    role: { $in: ['superadmin', 'mainsuperadmin'] },
    isActive: true,
  })
    .sort({ createdAt: 1 })
    .lean();
}

async function findFallbackMainSuperAdmin() {
  return Admin.findOne({ role: 'mainsuperadmin' }).sort({ createdAt: 1 }).lean();
}

async function resolveDefaultCatalogOwnerAdmin() {
  const preferred = await findPreferredSuperAdmin();
  if (preferred) return preferred;
  return findFallbackMainSuperAdmin();
}

module.exports = {
  DEFAULT_SUPERADMIN_EMAIL,
  getPreferredSuperAdminEmail,
  findPreferredSuperAdmin,
  findFallbackMainSuperAdmin,
  resolveDefaultCatalogOwnerAdmin,
};
