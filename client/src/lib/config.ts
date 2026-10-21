import { Capacitor } from '@capacitor/core';
const configured = (import.meta as any).env.VITE_API_BASE_URL?.replace(/\/$/, '') as string | undefined;
if (configured && !configured.startsWith('https://') && Capacitor.isNativePlatform()) throw new Error('Android requires an HTTPS API URL');
export const API_BASE = configured || '';
export const apiConfigured = !Capacitor.isNativePlatform() || !!configured;
export const requestOptions = { withCredentials: true, timeout: 15000, headers: { 'X-Requested-With': 'Threshold' } };
