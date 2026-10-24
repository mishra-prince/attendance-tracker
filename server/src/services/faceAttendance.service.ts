import { randomInt } from 'node:crypto';
import type { ClassSession, Prisma } from '@prisma/client';
import { sessionBounds } from './bleEvidence.service';
import { httpError } from '../middleware/error.middleware';

type Tx = Prisma.TransactionClient;
export const FACE_DEFAULTS = { face_required_for_rfid: 'true', face_match_threshold: '0.55', face_continuity_threshold: '0.70' };
export async function facePolicy(tx: Tx) {
  const rows = await tx.settings.findMany({ where: { key: { in: Object.keys(FACE_DEFAULTS) } } });
  const p = { ...FACE_DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  const match = Number(p.face_match_threshold), continuity = Number(p.face_continuity_threshold);
  if (!['true', 'false'].includes(p.face_required_for_rfid) || !Number.isFinite(match) || match < .4 || match > .95 || !Number.isFinite(continuity) || continuity < .5 || continuity > .95)
    throw httpError(503, 'Invalid face policy. Ask an administrator to review settings.');
  return { required: p.face_required_for_rfid === 'true', match, continuity };
}
export async function ensureFaceRequirement(tx: Tx, studentId: string, session: ClassSession) {
  const existing = await tx.faceRequirement.findUnique({ where: { student_id_session_id: { student_id: studentId, session_id: session.session_id } } });
  if (existing) return existing;
  const { start, end } = sessionBounds(session, process.env.ATTENDANCE_TIMEZONE || 'Asia/Kolkata');
  const p = await facePolicy(tx), duration = end.getTime() - start.getTime();
  // Random per student, fixed on the server. Late arrivals still need separate join and spot checks.
  const due = Math.max(Date.now() + 60_000, start.getTime() + duration * (35 + randomInt(31)) / 100);
  return tx.faceRequirement.create({ data: { student_id: studentId, session_id: session.session_id, required: p.required,
    spot_due_at: new Date(Math.min(due, end.getTime() - 15_000)), deadline_at: end } });
}
export async function faceAllowsCredit(tx: Tx, studentId: string, sessionId: string) {
  const r = await tx.faceRequirement.findUnique({ where: { student_id_session_id: { student_id: studentId, session_id: sessionId } } });
  return !!r && (!r.required || !!(r.join_passed_at && r.spot_passed_at));
}
/** Face alone never earns attendance: a registered reader visit and an active enrollment are required. */
export async function creditFaceAndRfid(tx: Tx, studentId: string, session: ClassSession) {
  if (!['open', 'scheduled'].includes(session.status) || !await faceAllowsCredit(tx, studentId, session.session_id)) return;
  const visit = await tx.rfidVisit.findFirst({ where: { student_id: studentId, session_id: session.session_id }, include: { reader: { include: { owner: true } } } });
  if (!visit || !visit.reader.owner.is_active || !['ADMIN', 'SUPER_ADMIN'].includes(visit.reader.owner.role)) return;
  const enrolled = await tx.enrollment.findFirst({ where: { student_id: studentId, subject_id: session.subject_id, section_id: session.section_id, status: 'active' } });
  if (!enrolled) return;
  const result = await tx.attendance.createMany({ data: [{ session_id: session.session_id, student_id: studentId, status: 'present', method: 'RFID',
    marked_by: visit.reader.created_by, device_id: visit.reader_id, remarks: 'Registered RFID visit + server face checks; basic active liveness' }], skipDuplicates: true });
  if (result.count) await tx.auditLog.create({ data: { table_name: 'Attendance', record_id: session.session_id, action: 'CREATE',
    changed_by: visit.reader.created_by, new_value: { student_id: studentId, source: 'RFID_AND_FACE' } } });
}
