const crypto = require('crypto');
const License = require('../models/License');

const DEFAULT_PRODUCT_PREFIX = process.env.LICENSE_PRODUCT_PREFIX || 'LT';

function normalizeProductPrefix() {
  const p = String(DEFAULT_PRODUCT_PREFIX).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (p.slice(0, 4) || 'LT').slice(0, 4);
}

function normalizePlanTag(plan) {
  const raw = String(plan.licensePrefix || plan.planCode || 'PLN')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return (raw.slice(0, 4) || 'PLN').slice(0, 4);
}

async function generateUniqueLicenseKey(plan) {
  const product = normalizeProductPrefix();
  const tag = normalizePlanTag(plan);
  for (let i = 0; i < 24; i += 1) {
    const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
    const key = `${product}-${tag}-${suffix}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await License.exists({ licenseKey: key });
    if (!exists) return key;
  }
  const err = new Error('Could not allocate a unique license key');
  err.status = 500;
  throw err;
}

function addMonths(date, months) {
  const d = new Date(date);
  const m = Math.max(1, Math.floor(Number(months) || 12));
  d.setMonth(d.getMonth() + m);
  return d;
}

module.exports = {
  generateUniqueLicenseKey,
  addMonths,
  normalizePlanTag,
};
