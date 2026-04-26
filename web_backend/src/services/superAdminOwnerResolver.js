const Admin = require('../models/Admin');

const DEFAULT_SUPERADMIN_EMAIL = 'manjunath@mcrindia.in';

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function getPreferredSuperAdminEmail() {
  return normalizeEmail(DEFAULT_SUPERADMIN_EMAIL);
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

/** Billing / public signup catalog owner: only manjunath@mcrindia.in (no env override, no fallback to other mainsuperadmins). */
async function resolveDefaultCatalogOwnerAdmin() {
  return findPreferredSuperAdmin();
}

module.exports = {
  DEFAULT_SUPERADMIN_EMAIL,
  getPreferredSuperAdminEmail,
  findPreferredSuperAdmin,
  resolveDefaultCatalogOwnerAdmin,
};
