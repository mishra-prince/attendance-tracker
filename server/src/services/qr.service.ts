import crypto from 'crypto';
import QRCode from 'qrcode';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';
import { httpError } from '../middleware/error.middleware';

const QR_SECRET = process.env.JWT_SECRET || 'dev-secret';
const QR_TTL_MIN = 5;

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Generate a short-lived opaque token for a session. QR encodes ONLY the token. */
export async function generateQR(sessionId: string, teacherId: string | undefined) {
  const session = await prisma.classSession.findUnique({ where: { session_id: sessionId } });
  if (!session) throw httpError(404, 'Session not found');
  if (!teacherId || session.teacher_id !== teacherId) throw httpError(403, 'Not your session');
  if (session.status !== 'open') throw httpError(409, 'Session is not open');

  const token = jwt.sign({ sid: sessionId, kind: 'qr' }, QR_SECRET, { expiresIn: `${QR_TTL_MIN}m` });

  const qr = await prisma.attendanceQRSession.create({
    data: {
      session_id: sessionId,
      token_hash: tokenHash(token),
      expires_at: new Date(Date.now() + QR_TTL_MIN * 60 * 1000),
    },
  });

  const dataUrl = await QRCode.toDataURL(token, { width: 320, margin: 2 });

  return { qr_id: qr.qr_id, token, expires_at: qr.expires_at, qr_image: dataUrl };
}

/** Full verification checklist, in order. Generic errors — never leak which check failed. */
export async function scanQR(token: string, studentId: string, deviceId?: string): Promise<{ marked: true }> {
  const fail = () => httpError(400, 'QR check-in failed');

  // 1+2. signature & expiry
  let payload: any;
  try {
    payload = jwt.verify(token, QR_SECRET);
  } catch {
    throw fail();
  }
  if (payload.kind !== 'qr' || !payload.sid) throw fail();

  // 3. revoked
  const qr = await prisma.attendanceQRSession.findFirst({
    where: { token_hash: tokenHash(token), session_id: payload.sid },
  });
  if (!qr || qr.revoked_at) throw fail();

  // 4. session open
  const session = await prisma.classSession.findUnique({ where: { session_id: payload.sid } });
  if (!session || session.status !== 'open') throw fail();

  // 5. student belongs to session's section
  const student = await prisma.student.findUnique({ where: { student_id: studentId } });
  if (!student || student.section_id !== session.section_id) throw fail();

  // 6. active enrollment in the subject
  const enrollment = await prisma.enrollment.findFirst({
    where: { student_id: studentId, subject_id: session.subject_id, status: 'active' },
  });
  if (!enrollment) throw fail();

  // 7. no existing attendance row (unique constraint as defense in depth)
  const existing = await prisma.attendance.findUnique({
    where: { session_id_student_id: { session_id: session.session_id, student_id: studentId } },
  });
  if (existing) throw fail();

  // find the student's User row to record marked_by as the student themselves
  const marked = await prisma.attendance.create({
    data: {
      session_id: session.session_id,
      student_id: studentId,
      status: 'present',
      marked_by: student.user_id,
      method: 'QR',
      device_id: deviceId,
    },
  });

  return { marked: true };
}

export async function revokeQR(qrId: string) {
  const qr = await prisma.attendanceQRSession.findUnique({ where: { qr_id: qrId } });
  if (!qr) throw httpError(404, 'QR not found');
  return prisma.attendanceQRSession.update({
    where: { qr_id: qrId },
    data: { revoked_at: new Date() },
  });
}
