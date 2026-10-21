import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import type { Role } from '@prisma/client';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || !process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32 || process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
  throw new Error('Configure distinct JWT_SECRET and JWT_REFRESH_SECRET values of at least 32 characters');
}
const JWT_SECRET: string = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET: string = process.env.JWT_REFRESH_SECRET;

export interface AccessPayload {
  userId: string;
  role: Role;
  teacherId?: string;
  studentId?: string;
  sessionId?: string;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign({ ...payload, tokenUse: 'access' }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '15m', issuer: 'threshold', audience: 'threshold-client' });
}

export function signRefreshToken(payload: AccessPayload): string {
  return jwt.sign({ ...payload, tokenUse: 'refresh' }, JWT_REFRESH_SECRET, { algorithm: 'HS256', jwtid: randomUUID(), expiresIn: '7d', issuer: 'threshold', audience: 'threshold-refresh' });
}

export function verifyAccessToken(token: string): AccessPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], issuer: 'threshold', audience: 'threshold-client' }) as AccessPayload & { tokenUse?: string };
    return payload.tokenUse === 'access' && typeof payload.userId === 'string' && typeof payload.sessionId === 'string' ? payload : null;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): AccessPayload | null {
  try {
    const payload = jwt.verify(token, JWT_REFRESH_SECRET, { algorithms: ['HS256'], issuer: 'threshold', audience: 'threshold-refresh' }) as AccessPayload & { tokenUse?: string };
    return payload.tokenUse === 'refresh' && typeof payload.userId === 'string' && typeof payload.sessionId === 'string' ? payload : null;
  } catch {
    return null;
  }
}
