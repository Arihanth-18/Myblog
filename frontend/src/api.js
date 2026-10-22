import axios from 'axios';

export const API = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
export const RSS_URL = `${API.replace(/\/api$/, '')}/rss.xml`;
const TOKEN_KEY = 'musings_token';

export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } };

export const api = axios.create({ baseURL: API });
api.interceptors.request.use(config => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const errMsg = (e, fallback) => e?.response?.data?.error || fallback;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dateParts(iso) {
  const d = new Date(iso);
  return { day: d.getDate(), month: MONTHS[d.getMonth()], year: d.getFullYear() };
}
export const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
