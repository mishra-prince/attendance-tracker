import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { authLimiter } from '../middleware/rateLimit.middleware';
import { httpError } from '../middleware/error.middleware';

const router = Router();
const cookieOptions = {
  httpOnly: true, secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
  path: '/api/auth',
};
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
// Cross-site native cookies require SameSite=None. A non-simple header plus exact CORS
// origins prevents a third-party form from refreshing or clearing the session.
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST' && req.headers['x-requested-with'] !== 'Threshold') {
    return res.status(403).json({ success: false, error: 'Missing application request header' });
  }
  next();
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
  portal: z.enum(['student', 'staff']).optional(),
});

const STAFF_ROLES = ['TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'];
const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(72),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'HOD', 'TEACHER', 'STUDENT']),
});

async function buildPayload(user: any) {
  const [student, teacher] = await Promise.all([
    user.role === 'STUDENT'
      ? prisma.student.findUnique({ where: { user_id: user.user_id } })
      : null,
    user.role === 'TEACHER' || user.role === 'HOD'
      ? prisma.teacher.findUnique({ where: { user_id: user.user_id } })
      : null,
  ]);
  return {
    userId: user.user_id,
    role: user.role,
    teacherId: teacher?.teacher_id,
    studentId: student?.student_id,
  };
}

router.post('/login', authLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password, portal } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    // Portal separation: students and staff sign in through different doors.
    // A valid staff credential cannot log in via the student portal, and vice-versa.
    if (portal === 'student' && user.role !== 'STUDENT') {
      return res.status(403).json({ success: false, error: 'Use the staff portal to sign in with this account.' });
    }
    if (portal === 'staff' && !STAFF_ROLES.includes(user.role)) {
      return res.status(403).json({ success: false, error: 'This is the staff portal. Students should use the main sign-in.' });
    }

    await prisma.user.update({ where: { user_id: user.user_id }, data: { last_login_at: new Date() } });
    const payload = { ...await buildPayload(user), sessionId: randomUUID() };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await prisma.refreshSession.create({ data: { session_id: payload.sessionId, user_id: user.user_id, token_hash: tokenHash(refreshToken), expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });
    res.cookie('refresh_token', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

    res.json({ success: true, data: { accessToken, user: { id: user.user_id, name: user.name, email: user.email, ...payload } } });
  } catch (e) { next(e); }
});

router.post('/refresh', authLimiter, async (req, res, next) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) return res.status(401).json({ success: false, error: 'No refresh token' });
    const payload = verifyRefreshToken(token);
    if (!payload) return res.status(401).json({ success: false, error: 'Invalid refresh token' });

    const user = await prisma.user.findUnique({ where: { user_id: payload.userId } });
    if (!user || !user.is_active) return res.status(401).json({ success: false, error: 'User inactive' });

    const session = await prisma.refreshSession.findUnique({ where: { session_id: payload.sessionId } });
    if (!session || session.user_id !== user.user_id || session.revoked_at || session.expires_at <= new Date()) {
      return res.status(401).json({ success: false, error: 'Session expired or revoked' });
    }
    const newPayload = { ...await buildPayload(user), sessionId: session.session_id };
    const accessToken = signAccessToken(newPayload);
    const nextRefresh = signRefreshToken(newPayload);
    const rotated = await prisma.refreshSession.updateMany({ where: { session_id: session.session_id, token_hash: tokenHash(token), revoked_at: null }, data: { token_hash: tokenHash(nextRefresh) } });
    if (rotated.count !== 1) {
      await prisma.refreshSession.update({ where: { session_id: session.session_id }, data: { revoked_at: new Date() } });
      res.clearCookie('refresh_token', cookieOptions);
      return res.status(401).json({ success: false, error: 'Session reuse detected. Sign in again' });
    }
    res.cookie('refresh_token', nextRefresh, { ...cookieOptions, maxAge: session.expires_at.getTime() - Date.now() });
    res.json({ success: true, data: { accessToken, user: { name: user.name, email: user.email, ...newPayload } } });
  } catch (e) { next(e); }
});

router.post('/logout', async (req, res, next) => {
  try {
    const payload = verifyRefreshToken(req.cookies?.refresh_token || '');
    if (payload) await prisma.refreshSession.updateMany({ where: { session_id: payload.sessionId, user_id: payload.userId }, data: { revoked_at: new Date() } });
    res.clearCookie('refresh_token', cookieOptions);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Admin-only provisioning (most colleges: no self-signup)
router.post('/signup', authMiddleware, requireRole('ADMIN', 'SUPER_ADMIN'), validateBody(signupSchema), async (req: AuthRequest, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    // Prevent privilege escalation: only a SUPER_ADMIN may mint another SUPER_ADMIN.
    if (role === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
      throw httpError(403, 'Only a SUPER_ADMIN may create a SUPER_ADMIN');
    }
    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, password_hash: hash, role },
    });
    res.status(201).json({ success: true, data: { user_id: user.user_id, email: user.email, role: user.role } });
  } catch (e) { next(e); }
});

export default router;
