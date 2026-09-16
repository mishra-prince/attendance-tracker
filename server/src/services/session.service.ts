import { prisma } from '../utils/prisma';
import { httpError } from '../middleware/error.middleware';
import { audit, auditFromReq } from './audit.service';

const EDIT_WINDOW_MIN = 30; // fallback; prefer Settings

async function editWindowMinutes(): Promise<number> {
  const s = await prisma.settings.findUnique({ where: { key: 'submission_edit_window_minutes' } });
  return s ? Number(s.value) : EDIT_WINDOW_MIN;
}

export async function transitionStatus(sessionId: string, next: string, actorUserId: string, actorRole: string, req: any, teacherId?: string) {
  const session = await prisma.classSession.findUnique({ where: { session_id: sessionId } });
  if (!session) throw httpError(404, 'Session not found');

  const allowed: Record<string, string[]> = {
    scheduled: ['open', 'cancelled'],
    open: ['submitted', 'cancelled'],
    submitted: ['locked'],
    locked: [],
    cancelled: [],
  };
  if (!allowed[session.status]?.includes(next)) {
    throw httpError(409, `Cannot transition ${session.status} → ${next}`);
  }

  // scope check: teacher must own the session
  if (actorRole === 'TEACHER' && session.teacher_id !== teacherId) {
    throw httpError(403, 'Not your session');
  }

  const updated = await prisma.classSession.update({
    where: { session_id: sessionId },
    data: { status: next as any },
  });

  await audit({
    tableName: 'ClassSession',
    recordId: sessionId,
    action: 'UPDATE',
    changedBy: actorUserId,
    oldValue: { status: session.status },
    newValue: { status: next },
    ...auditFromReq(req),
  });

  return updated;
}

/** Can teacher/HOD still edit attendance on this session directly? */
export async function canEditAttendance(sessionId: string): Promise<boolean> {
  const session = await prisma.classSession.findUnique({ where: { session_id: sessionId } });
  if (!session) return false;
  if (session.status === 'open') return true;
  if (session.status === 'submitted') {
    const window = await editWindowMinutes();
    const cutoff = new Date(session.updated_at.getTime() + window * 60 * 1000);
    return new Date() <= cutoff;
  }
  return false; // scheduled, locked, cancelled
}
