/**
 * Browser CORS + Socket.IO origin checks.
 * In development, allow common Vite localhost ports so login works when Vite bumps 5173→5174.
 */

function parseCorsOrigins() {
  const raw = process.env.CORS_ORIGIN || '';
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length) return list;
  return ['http://localhost:5173', 'http://localhost:5174'];
}

function isProduction() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

/** Non-production: http(s)://localhost|127.0.0.1 with typical Vite / CRA dev ports. */
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
    return false;
  } catch {
    return false;
  }
}

module.exports = {
  parseCorsOrigins,
  isProduction,
  isDevLocalFrontendOrigin,
};
