import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';

export interface AccessPayload {
  userId: string;
  role: Role;
  teacherId?: string;
  studentId?: string;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(payload: AccessPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): AccessPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AccessPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): AccessPayload | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as AccessPayload;
  } catch {
    return null;
  }
}
