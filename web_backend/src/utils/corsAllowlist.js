/**
 * Browser CORS + Socket.IO origin checks.
 * In development, allow common Vite localhost ports so login works when Vite bumps 5173→5174.
 */

/** Strip paths/trailing slashes so env can use `https://app.vercel.app/` and still match the browser Origin. */
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

/** Always merged so local Vite works even when CORS_ORIGIN lists only production (e.g. Vercel). */
const DEFAULT_LOCAL_FRONTEND_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

function parseCorsOrigins() {
  const raw = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '';
  const fromEnv = raw
    .split(',')
    .map((s) => normalizeBrowserOrigin(s))
    .filter(Boolean);
  return [...new Set([...DEFAULT_LOCAL_FRONTEND_ORIGINS, ...fromEnv])];
}

function isProduction() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

/**
 * Local machine browser hitting the API (Vite, CRA, preview). Not gated on NODE_ENV so
 * `NODE_ENV=production` on a laptop still allows http://localhost:5173 → http://localhost:5000.
 */
function isLocalhostDevFrontendOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
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

/** Non-production only (legacy); prefer [isLocalhostDevFrontendOrigin] in CORS callback. */
function isDevLocalFrontendOrigin(origin) {
  if (isProduction() || !origin || typeof origin !== 'string') return false;
  return isLocalhostDevFrontendOrigin(origin);
}

/**
 * Vercel project name(s) (the first segment of *.vercel.app), comma-separated.
 * Allows production `https://<slug>.vercel.app` and previews `https://<slug>-….vercel.app`
 * without listing each URL in CORS_ORIGIN.
 * When unset, keeps legacy `customerconnect` and LiveTrack HR web `hr-gamma-two`.
 */
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
  isLocalhostDevFrontendOrigin,
  isDevLocalFrontendOrigin,
  isAllowedVercelProjectOrigin,
};
