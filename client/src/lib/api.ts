import axios from 'axios';

// API base: tunneled public URL so the Android APK works from anywhere.
// Web dev (vite) uses the /api proxy instead.
const IS_NATIVE = !!(window as any).Capacitor?.isNativePlatform?.();
export const API_BASE = IS_NATIVE
  ? 'https://att.threshold.dpdns.org'
  : '';

export const api = axios.create({ baseURL: `${API_BASE}/api` });

function readAuth(): { accessToken?: string; refreshToken?: string } | null {
  try {
    const raw = localStorage.getItem('auth');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // corrupt storage must not break every request
  }
}

api.interceptors.request.use((cfg) => {
  const auth = readAuth();
  if (auth?.accessToken) cfg.headers.Authorization = `Bearer ${auth.accessToken}`;
  return cfg;
});

// Single in-flight refresh shared across all concurrent 401s (avoids a refresh stampede
// that, with refresh-token rotation, logs the user out mid-session).
let refreshing: Promise<string> | null = null;

async function doRefresh(): Promise<string> {
  const auth = readAuth();
  const res = await axios.post(`${API_BASE}/api/auth/refresh`, { refreshToken: auth?.refreshToken });
  const token = res.data.data.accessToken;
  const next = { ...(auth ?? {}), accessToken: token };
  localStorage.setItem('auth', JSON.stringify(next));
  return token;
}

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      try {
        refreshing = refreshing ?? doRefresh();
        const token = await refreshing;
        refreshing = null;
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        refreshing = null;
        localStorage.removeItem('auth');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export function errMsg(e: unknown): string {
  const ax = e as { response?: { data?: { error?: string } } };
  return ax?.response?.data?.error || 'Something went wrong';
}
