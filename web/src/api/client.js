import axios from 'axios';

function trimEnv(key) {
  return String(import.meta.env[key] ?? '').trim();
}

function wantsRemoteApiInDev() {
  const v = trimEnv('VITE_DEV_USE_REMOTE_API').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function isLoopbackApiUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /localhost|127\.0\.0\.1/i.test(url);
}

/**
 * Vite inlines VITE_* at build time (Vercel / Render).
 * In `npm run dev`, we default to **localhost** so a production URL in `.env`
 * does not send local traffic to Render. Set `VITE_DEV_USE_REMOTE_API=1` to
 * keep using `VITE_API_BASE_URL` from .env while on localhost.
 */
const fromEnv = trimEnv('VITE_API_BASE_URL').replace(/\/$/, '');
export const API_BASE_URL = (() => {
  if (import.meta.env.DEV) {
    if (wantsRemoteApiInDev() && fromEnv) return fromEnv;
    if (fromEnv && isLoopbackApiUrl(fromEnv)) return fromEnv;
    return 'http://localhost:5000/api';
  }
  return fromEnv || '';
})();

/** Socket.io origin (no `/api`). Same dev vs remote rules as API_BASE_URL. */
export const SOCKET_BASE_URL = (() => {
  const raw = trimEnv('VITE_SOCKET_URL').replace(/\/$/, '');
  if (import.meta.env.DEV) {
    if (wantsRemoteApiInDev() && raw) return raw;
    if (raw && isLoopbackApiUrl(raw)) return raw;
    return 'http://localhost:5000';
  }
  return raw || '';
})();

if (import.meta.env.PROD && !API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.error(
    '[LiveTrack] VITE_API_BASE_URL is missing at build time. Add it in Vercel → Settings → Environment Variables, then Redeploy (use "Clear cache and redeploy" if it still fails).',
  );
}

export const API_BASE_URL_STORAGE_KEY = 'livetrack_api_base_url';

export const TOKEN_KEY = 'livetrack_admin_token';

/** In production, never reuse old dev URLs from this key (they cause many failed OPTIONS to localhost). */
if (import.meta.env.PROD) {
  try {
    const stored = localStorage.getItem(API_BASE_URL_STORAGE_KEY);
    if (stored && isLoopbackApiUrl(stored)) {
      localStorage.removeItem(API_BASE_URL_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

const savedBaseUrl = localStorage.getItem(API_BASE_URL_STORAGE_KEY);
if (savedBaseUrl && savedBaseUrl !== API_BASE_URL) {
  localStorage.setItem(API_BASE_URL_STORAGE_KEY, API_BASE_URL);
}

export function filterProductionApiBases(urls) {
  if (!import.meta.env.PROD) return urls.filter(Boolean);
  return urls.filter((u) => u && !isLoopbackApiUrl(u));
}

/** Primary host gets a full timeout; fallbacks fail fast so wrong ports do not add 15s each. */
export const LOGIN_PRIMARY_TIMEOUT_MS = 15000;
export const LOGIN_FALLBACK_TIMEOUT_MS = 4000;

/** Shorter primary probe in dev when multiple bases exist (e.g. 5000 vs 9001). */
export function getLoginAttemptTimeoutMs(index, candidateCount) {
  if (index > 0) return LOGIN_FALLBACK_TIMEOUT_MS;
  if (import.meta.env.DEV && candidateCount > 1) {
    return Math.min(LOGIN_PRIMARY_TIMEOUT_MS, 7500);
  }
  return LOGIN_PRIMARY_TIMEOUT_MS;
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

/** Saved API origin from last successful login (or env default). Tried first on sign-in. */
/** Readable message from axios errors (handles `{ message }`, `{ error: { message } }`, plain text, network). */
export function getApiErrorMessage(error, fallback = 'Request failed.') {
  const data = error?.response?.data;
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (data && typeof data === 'object') {
    if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();
    const nested = data.error;
    if (nested && typeof nested === 'object' && typeof nested.message === 'string' && nested.message.trim()) {
      return nested.message.trim();
    }
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
  }
  const net = String(error?.message || '').trim();
  if (net) return net;
  return fallback;
}

export function getOrderedLoginBaseCandidates() {
  /** Prefer web admin API (5000) before field API (9001) in dev. */
  const devHosts = import.meta.env.DEV ? ['http://localhost:5000/api', 'http://localhost:9001/api'] : [];
  let saved = '';
  try {
    saved = String(localStorage.getItem(API_BASE_URL_STORAGE_KEY) || '').trim();
  } catch {
    /* ignore */
  }
  const raw = [saved, apiClient.defaults.baseURL, API_BASE_URL, ...devHosts].filter(Boolean);
  const normalized = raw.map((u) => String(u).replace(/\/$/, ''));
  return filterProductionApiBases([...new Set(normalized)]);
}

export function setApiBaseUrl(url) {
  if (!url) return;
  if (import.meta.env.PROD && isLoopbackApiUrl(url)) return;
  apiClient.defaults.baseURL = url;
  localStorage.setItem(API_BASE_URL_STORAGE_KEY, url);
}

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * POST to /auth/* before login — tries the same base URL fallbacks as sign-in.
 * @param {string} path e.g. '/auth/forgot-password/request-otp'
 * @param {object} body
 */
export async function postPublicAuth(path, body) {
  const bases = getOrderedLoginBaseCandidates();

  let lastError;
  for (let i = 0; i < bases.length; i += 1) {
    const base = bases[i];
    const timeout = getLoginAttemptTimeoutMs(i, bases.length);
    try {
      const { data } = await axios.post(`${base.replace(/\/$/, '')}${path}`, body, {
        timeout,
      });
      setApiBaseUrl(base);
      return data;
    } catch (error) {
      lastError = error;
      if (error.response) {
        throw error;
      }
    }
  }
  throw lastError || new Error('Unable to reach auth service');
}

export default apiClient;
