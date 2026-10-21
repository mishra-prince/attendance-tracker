import axios from 'axios';
import { useAuth } from '../store/auth';
import { API_BASE, apiConfigured, requestOptions } from './config';
export { API_BASE } from './config';
export const api = axios.create({ baseURL: API_BASE + '/api', ...requestOptions });
api.interceptors.request.use((cfg) => {
  if (!apiConfigured) throw new Error('This app is not connected to your institution yet. Contact your administrator.');
  const token = useAuth.getState().accessToken;
  if (token) cfg.headers.Authorization = 'Bearer ' + token;
  return cfg;
});
let refreshing: Promise<string> | null = null;
let authGeneration = 0;
useAuth.subscribe((state, previous) => {
  if (state.user?.userId !== previous.user?.userId) authGeneration++;
});
export async function restoreSession(): Promise<string> {
  if (!apiConfigured) throw new Error('Institution server is not configured');
  if (!refreshing) {
    const generation = authGeneration;
    refreshing = axios.post(API_BASE + '/api/auth/refresh', {}, requestOptions)
      .then((res) => {
        if (generation !== authGeneration) throw new Error('Session changed');
        const { accessToken, user } = res.data.data;
        useAuth.getState().login(user, accessToken);
        return accessToken as string;
      }).finally(() => { refreshing = null; });
  }
  return refreshing;
}
api.interceptors.response.use((r) => r, async (err) => {
  const original = err.config;
  if (err.response?.status === 401 && original && !original._retry && !original.url?.startsWith('/auth/')) {
    original._retry = true;
    try {
      const token = await restoreSession();
      original.headers.Authorization = 'Bearer ' + token;
      return api(original);
    } catch (refreshError) {
      if (axios.isAxiosError(refreshError) && refreshError.response?.status === 401) useAuth.getState().clear();
      return Promise.reject(refreshError);
    }
  }
  return Promise.reject(err);
});
export function errMsg(e: unknown): string {
  if (e instanceof Error && !axios.isAxiosError(e)) return e.message;
  const ax = e as { response?: { data?: { error?: string } }; code?: string };
  return ax?.response?.data?.error || (ax?.code === 'ECONNABORTED' ? 'The server took too long. Try again.' : 'Could not connect. Check your internet connection and try again.');
}
