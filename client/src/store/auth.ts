import { create } from 'zustand';
import axios from 'axios';
import { API_BASE, requestOptions } from '../lib/config';
export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'HOD' | 'TEACHER' | 'STUDENT';
export interface AuthUser { userId: string; role: Role; name?: string; email?: string; studentId?: string; teacherId?: string; departmentId?: string | null; }
interface AuthState {
  user: AuthUser | null; accessToken: string | null; error: string;
  login: (user: AuthUser, accessToken: string) => void;
  clear: () => void;
  logout: () => Promise<void>;
}
try { localStorage.removeItem('auth'); } catch { /* storage may be disabled */ }
export const useAuth = create<AuthState>((set) => ({
  user: null, accessToken: null, error: '',
  login: (user, accessToken) => set({ user, accessToken, error: '' }),
  clear: () => set({ user: null, accessToken: null }),
  logout: async () => {
    try {
      await axios.post(API_BASE + '/api/auth/logout', {}, requestOptions);
      set({ user: null, accessToken: null, error: '' });
    } catch { set({ error: 'Could not sign out. Check your connection and try again.' }); }
  },
}));
