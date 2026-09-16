import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((cfg) => {
  const raw = localStorage.getItem('auth');
  if (raw) {
    const { accessToken } = JSON.parse(raw);
    if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  }
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const raw = localStorage.getItem('auth');
        if (!raw) throw new Error('no auth');
        const { refreshToken } = JSON.parse(raw);
        const res = await axios.post('/api/auth/refresh', { refreshToken });
        const auth = JSON.parse(raw);
        auth.accessToken = res.data.data.accessToken;
        localStorage.setItem('auth', JSON.stringify(auth));
        original.headers.Authorization = `Bearer ${auth.accessToken}`;
        return api(original);
      } catch {
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
