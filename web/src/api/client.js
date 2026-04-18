import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
export const API_BASE_URL_STORAGE_KEY = 'livetrack_api_base_url';

export const TOKEN_KEY = 'livetrack_admin_token';

const savedBaseUrl = localStorage.getItem(API_BASE_URL_STORAGE_KEY);
if (savedBaseUrl && savedBaseUrl !== API_BASE_URL) {
  localStorage.setItem(API_BASE_URL_STORAGE_KEY, API_BASE_URL);
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

export function setApiBaseUrl(url) {
  if (!url) return;
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
  const bases = Array.from(
    new Set(
      [
        apiClient.defaults.baseURL,
        API_BASE_URL,
        localStorage.getItem(API_BASE_URL_STORAGE_KEY),
        'http://localhost:9001/api',
        'http://localhost:5000/api',
      ].filter(Boolean),
    ),
  );

  let lastError;
  for (const base of bases) {
    try {
      const { data } = await axios.post(`${base.replace(/\/$/, '')}${path}`, body, {
        timeout: 15000,
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
