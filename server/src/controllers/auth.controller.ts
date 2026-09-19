import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { authLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  portal: z.enum(['student', 'staff']).optional(),
});

const STAFF_ROLES = ['TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'];
const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
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
    const payload = await buildPayload(user);
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, data: { accessToken, user: { id: user.user_id, name: user.name, email: user.email, ...payload } } });
  } catch (e) { next(e); }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) return res.status(401).json({ success: false, error: 'No refresh token' });
    const payload = verifyRefreshToken(token);
    if (!payload) return res.status(401).json({ success: false, error: 'Invalid refresh token' });

    const user = await prisma.user.findUnique({ where: { user_id: payload.userId } });
    if (!user || !user.is_active) return res.status(401).json({ success: false, error: 'User inactive' });

    const newPayload = await buildPayload(user);
    const accessToken = signAccessToken(newPayload);
    res.json({ success: true, data: { accessToken } });
  } catch (e) { next(e); }
});

router.post('/logout', authMiddleware, (req, res) => {
  res.clearCookie('refresh_token');
  res.json({ success: true });
});

// Admin-only provisioning (most colleges: no self-signup)
router.post('/signup', authMiddleware, requireRole('ADMIN', 'SUPER_ADMIN'), validateBody(signupSchema), async (req: AuthRequest, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password_hash: hash, role },
    });
    res.status(201).json({ success: true, data: { user_id: user.user_id, email: user.email, role: user.role } });
  } catch (e) { next(e); }
});

export default router;
