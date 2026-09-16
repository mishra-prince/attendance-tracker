import { create } from 'zustand';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'HOD' | 'TEACHER' | 'STUDENT';

export interface AuthUser {
  userId: string;
  role: Role;
  name?: string;
  email?: string;
  studentId?: string;
  teacherId?: string;
  departmentId?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  login: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: (() => {
    try {
      const raw = localStorage.getItem('auth');
      return raw ? (JSON.parse(raw).user as AuthUser) : null;
    } catch {
      return null;
    }
  })(),
  accessToken: (() => {
    try {
      const raw = localStorage.getItem('auth');
      return raw ? (JSON.parse(raw).accessToken as string) : null;
    } catch {
      return null;
    }
  })(),
  login: (user, accessToken, refreshToken) => {
    localStorage.setItem('auth', JSON.stringify({ user, accessToken, refreshToken }));
    set({ user, accessToken });
  },
  logout: () => {
    localStorage.removeItem('auth');
    set({ user: null, accessToken: null });
  },
}));
