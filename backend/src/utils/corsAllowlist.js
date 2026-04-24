/**
 * Browser CORS (mobile API + optional web clients).
 * Keep in sync with web_backend/src/utils/corsAllowlist.js where possible.
 */

function normalizeBrowserOrigin(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    return u.origin;
  } catch {
    return s.replace(/\/+$/, '');
  }
}

function parseCorsOrigins() {
  const raw = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '';
  const list = raw
    .split(',')
    .map((s) => normalizeBrowserOrigin(s))
    .filter(Boolean);
  if (list.length) return list;
  return [
    'https://ehrms.askeva.net',
    'http://ehrms.askeva.net',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://localhost:5173',
    'http://localhost:5174',
  ];
}

function isProduction() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function isDevLocalFrontendOrigin(origin) {
  if (isProduction() || !origin || typeof origin !== 'string') return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (host !== 'localhost' && host !== '127.0.0.1') return false;
    const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
    if (!Number.isFinite(port)) return false;
    if (port >= 5173 && port <= 5199) return true;
    if (port >= 3000 && port <= 3999) return true;
    if (port === 4173) return true;
    if (port === 8080) return true;
    return false;
  } catch {
    return false;
  }
}

function parseVercelProjectSlugs() {
  const raw = process.env.CORS_VERCEL_SLUGS;
  if (raw != null && String(raw).trim() !== '') {
    return String(raw)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  return ['customerconnect', 'hr-gamma-two'];
}

function isAllowedVercelProjectOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  let hostname;
  try {
    const u = new URL(normalizeBrowserOrigin(origin));
    if (u.protocol !== 'https:') return false;
    hostname = u.hostname.toLowerCase();
    if (!hostname.endsWith('.vercel.app')) return false;
  } catch {
    return false;
  }
  const slugs = parseVercelProjectSlugs();
  return slugs.some((slug) => {
    if (!slug) return false;
    return (
      hostname === `${slug}.vercel.app` ||
      (hostname.startsWith(`${slug}-`) && hostname.endsWith('.vercel.app'))
    );
  });
}

module.exports = {
  normalizeBrowserOrigin,
  parseCorsOrigins,
  parseVercelProjectSlugs,
  isProduction,
  isDevLocalFrontendOrigin,
  isAllowedVercelProjectOrigin,
};
