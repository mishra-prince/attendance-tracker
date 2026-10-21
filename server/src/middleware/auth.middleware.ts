import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessPayload } from '../utils/jwt';
import { prisma } from '../utils/prisma';

export interface AuthRequest extends Request {
  user?: AccessPayload;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing token' });
  }
  const payload = verifyAccessToken(header.slice(7));
  if (!payload) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
  try {
    const session = await prisma.refreshSession.findUnique({ where: { session_id: payload.sessionId }, include: { user: { include: { student: true, teacher: true } } } });
    if (!session || session.user_id !== payload.userId || session.revoked_at || session.expires_at <= new Date() || !session.user.is_active) {
      return res.status(401).json({ success: false, error: 'Session expired or revoked' });
    }
    req.user = { userId: session.user_id, sessionId: session.session_id, role: session.user.role, studentId: session.user.student?.student_id, teacherId: session.user.teacher?.teacher_id };
    next();
  } catch (e) { next(e); }
}

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'HOD' | 'TEACHER' | 'STUDENT';

export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient role' });
    }
    next();
  };
}
