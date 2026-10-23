import { Router } from 'express';
import { createHash, randomInt } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { authMiddleware, requireRole, type AuthRequest } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { httpError } from '../middleware/error.middleware';
import { staffStudentScope } from '../services/roster.service';
import { lockStudent } from '../services/rfid.service';
import { FACE_ACTIONS, FACE_MODEL, evaluateFaceEvidence, type FaceAction } from '../services/faceEvidence.service';
import { frameSchema, inspectFace, type FaceFrame } from '../services/faceVision.service';
import { encryptFace, decryptFace } from '../services/faceTemplate.service';
import { creditFaceAndRfid, facePolicy } from '../services/faceAttendance.service';
import { sessionBounds } from '../services/bleEvidence.service';

const router = Router();
router.use(authMiddleware);
const staff = requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN');
const issueLimit = rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).user!.userId, message: { success: false, error: 'Too many camera attempts. Wait a minute and retry.' } });
const enrollmentSchema = z.object({ studentId: z.string().uuid(), replace: z.boolean().default(false),
  idConfirmed: z.literal(true), consentRecorded: z.literal(true),
  enrollmentMethod: z.enum(['SUPERVISED_STAFF', 'INSTITUTIONAL_ID_CARD', 'REGISTRATION_RECORD', 'TRUSTED_IDENTITY_SYSTEM', 'BIOMETRIC_ENROLLMENT_STATION']),
}).strict();
async function scopedStudent(tx: Prisma.TransactionClient, req: AuthRequest, studentId: string) {
  const where = req.user!.role === 'STUDENT' ? { student_id: req.user!.studentId || '' } : await staffStudentScope(tx, req.user!);
  const student = await tx.student.findFirst({ where: { AND: [{ student_id: studentId, user: { is_active: true } }, where] }, include: { biometricEnrollment: true } });
  if (!student) throw httpError(404, 'Student not found in your classes');
  return student;
}
async function activeClass(tx: Prisma.TransactionClient, studentId: string, sessionId: string) {
  const student = await tx.student.findUniqueOrThrow({ where: { student_id: studentId } });
  const session = await tx.classSession.findFirst({ where: { session_id: sessionId, section_id: student.section_id, status: { in: ['open', 'scheduled'] } } });
  if (!session) throw httpError(409, 'Class is not open for face verification');
  const bounds = sessionBounds(session, process.env.ATTENDANCE_TIMEZONE || 'Asia/Kolkata'), now = new Date();
  if (now < bounds.start || now >= bounds.end) throw httpError(409, 'Face checks are available only during this class');
  const enrollment = await tx.enrollment.findFirst({ where: { student_id: studentId, subject_id: session.subject_id, section_id: session.section_id, status: 'active' } });
  const visit = await tx.rfidVisit.findFirst({ where: { student_id: studentId, session_id: sessionId }, orderBy: { entry_at: 'desc' } });
  if (!enrollment || !visit || visit.exit_at) throw httpError(409, 'Tap your registered card at the classroom reader before verifying your face');
  return session;
}
function actions() {
  const pool = [...FACE_ACTIONS];
  const first = pool.splice(randomInt(pool.length), 1)[0];
  return [first, pool[randomInt(pool.length)]];
}
function publicChallenge(row: { challenge_id: string; actions: unknown; expires_at: Date; purpose: string; phase: string | null }) {
  return { challengeId: row.challenge_id, actions: row.actions, expiresAt: row.expires_at, purpose: row.purpose, phase: row.phase, maxCaptureMs: 90_000 };
}
router.post('/enroll/challenge', staff, issueLimit, validateBody(enrollmentSchema), async (req: AuthRequest, res, next) => {
  try {
    if (process.env.FACE_VISION_ENABLED !== 'true') throw httpError(503, 'The server face verifier has not been enabled yet');
    const result = await prisma.$transaction(async (tx) => {
      const student = await scopedStudent(tx, req, req.body.studentId);
      await lockStudent(tx, student.student_id);
      const previous = await tx.biometricEnrollment.findUnique({ where: { student_id: student.student_id } });
      if (previous && (previous.face_ciphertext || previous.status === 'revoked' || student.enrollment_trust_state === 'REQUIRES_REENROLLMENT') && !req.body.replace) throw httpError(409, 'This identity requires supervised recovery by an HOD or administrator.');
      if (req.body.replace && !['HOD', 'ADMIN', 'SUPER_ADMIN'].includes(req.user!.role)) throw httpError(403, 'Identity replacement requires your HOD or administrator');
      await tx.faceChallenge.updateMany({ where: { student_id: student.student_id, purpose: { in: ['ENROLL', 'REENROLL'] }, state: 'pending' }, data: { state: 'cancelled' } });
      const row = await tx.faceChallenge.create({ data: { student_id: student.student_id, actor_id: req.user!.userId, actor_session_id: req.user!.sessionId!,
        purpose: req.body.replace ? 'REENROLL' : 'ENROLL', enrollment_version: previous?.biometric_version || 0,
        enrollment_method: req.body.enrollmentMethod, actions: actions(), policy: await facePolicy(tx), expires_at: new Date(Date.now() + 180_000) } });
      await tx.auditLog.create({ data: { table_name: 'FaceChallenge', record_id: row.challenge_id, action: 'CREATE', changed_by: req.user!.userId,
        new_value: { student_id: student.student_id, purpose: row.purpose, institutional_id_confirmed: true, consent_recorded: true } } });
      return publicChallenge(row);
    });
    res.status(201).json({ success: true, data: result });
  } catch (e) { next(e); }
});
router.post('/verify/challenge', requireRole('STUDENT'), issueLimit, validateBody(z.object({ sessionId: z.string().uuid() }).strict()), async (req: AuthRequest, res, next) => {
  try {
    if (process.env.FACE_VISION_ENABLED !== 'true') throw httpError(503, 'The server face verifier has not been enabled yet');
    const row = await prisma.$transaction(async (tx) => {
      const student = await scopedStudent(tx, req, req.user!.studentId || '');
      await lockStudent(tx, student.student_id);
      await activeClass(tx, student.student_id, req.body.sessionId);
      const reference = student.biometricEnrollment;
      if (student.enrollment_trust_state !== 'ACTIVE' || reference?.status !== 'active' || !reference.face_ciphertext || reference.face_model !== FACE_MODEL)
        throw httpError(409, 'Ask staff to capture your approved face reference first');
      const requirement = await tx.faceRequirement.findUnique({ where: { student_id_session_id: { student_id: student.student_id, session_id: req.body.sessionId } } });
      if (!requirement) throw httpError(409, 'Classroom entry has not been recorded');
      const phase = !requirement.join_passed_at ? 'JOIN' : !requirement.spot_passed_at && new Date() >= requirement.spot_due_at ? 'SPOT' : null;
      if (!phase) throw httpError(409, 'No face check is due right now');
      await tx.faceChallenge.updateMany({ where: { student_id: student.student_id, purpose: 'VERIFY', state: 'pending' }, data: { state: 'cancelled' } });
      const c = await tx.faceChallenge.create({ data: { student_id: student.student_id, actor_id: req.user!.userId, actor_session_id: req.user!.sessionId!,
        class_session_id: req.body.sessionId, purpose: 'VERIFY', phase, enrollment_version: reference.biometric_version,
        actions: actions(), policy: await facePolicy(tx), expires_at: new Date(Math.min(Date.now() + 180_000, requirement.deadline_at.getTime())) } });
      await tx.auditLog.create({ data: { table_name: 'FaceChallenge', record_id: c.challenge_id, action: 'CREATE', changed_by: req.user!.userId, new_value: { purpose: 'VERIFY', student_id: student.student_id, session_id: req.body.sessionId, phase } } });
      return c;
    });
    res.status(201).json({ success: true, data: publicChallenge(row) });
  } catch (e) { next(e); }
});
const evidenceSchema = z.object({ frames: z.array(frameSchema).min(8).max(32).refine((frames) => frames.reduce((n, f) => n + f.jpeg.length, 0) <= 4_000_000, 'Camera evidence is too large') }).strict();
router.post('/challenges/:id/complete', validateBody(evidenceSchema), async (req: AuthRequest, res, next) => {
  let claimed = false;
  try {
    const frames: FaceFrame[] = req.body.frames;
    const hash = createHash('sha256');
    for (const frame of frames) { const bytes = Buffer.from(frame.jpeg, 'base64'); hash.update(String(bytes.length) + ':'); hash.update(bytes); }
    const digest = hash.digest('hex');
    const challenge = await prisma.$transaction(async (tx) => {
      const c = await tx.faceChallenge.findFirst({ where: { challenge_id: req.params.id, actor_id: req.user!.userId, actor_session_id: req.user!.sessionId! } });
      if (!c) throw httpError(404, 'Camera challenge not found');
      await scopedStudent(tx, req, c.student_id);
      if (c.state === 'succeeded' && c.evidence_hash === digest) return c;
      if (c.state !== 'pending' || c.expires_at <= new Date()) throw httpError(409, 'Camera challenge was used or expired. Start a new check.');
      if (c.evidence_hash && c.evidence_hash !== digest) throw httpError(409, 'This challenge is already bound to another camera sequence');
      const previous = await tx.faceChallenge.findUnique({ where: { evidence_hash: digest } });
      if (previous && previous.challenge_id !== c.challenge_id) throw httpError(409, 'This camera evidence has already been submitted');
      const reserved = await tx.faceChallenge.updateMany({ where: { challenge_id: c.challenge_id, state: 'pending' }, data: { state: 'processing', evidence_hash: digest } });
      if (reserved.count !== 1) throw httpError(409, 'Camera challenge is already being checked');
      return c;
    });
    if (challenge.state === 'succeeded') { res.json({ success: true, data: { verified: true, purpose: challenge.purpose, phase: challenge.phase } }); return; }
    claimed = true;
    const stored = await prisma.biometricEnrollment.findUnique({ where: { student_id: challenge.student_id } });
    const reference = challenge.purpose === 'VERIFY' && stored?.face_ciphertext ? decryptFace(stored.face_ciphertext, stored.student_id, stored.biometric_version) : null;
    if (challenge.purpose === 'VERIFY' && !reference) throw httpError(409, 'Approved face reference is unavailable');
    const policy = z.object({ match: z.number(), continuity: z.number() }).parse(challenge.policy);
    const evaluated = evaluateFaceEvidence(challenge.actions as FaceAction[], await inspectFace(frames), reference, policy);
    await prisma.$transaction(async (tx) => {
      await lockStudent(tx, challenge.student_id);
      const student = await scopedStudent(tx, req, challenge.student_id);
      const c = await tx.faceChallenge.findUniqueOrThrow({ where: { challenge_id: challenge.challenge_id } });
      const actor = await tx.user.findUnique({ where: { user_id: req.user!.userId } });
      const auth = await tx.refreshSession.findFirst({ where: { session_id: c.actor_session_id, user_id: c.actor_id, revoked_at: null, expires_at: { gt: new Date() } } });
      if (!actor?.is_active || actor.role !== req.user!.role || !auth) throw httpError(401, 'Sign in again before retrying');
      if (c.state !== 'processing' || c.expires_at <= new Date()) throw httpError(409, 'Camera challenge expired. Start a new check.');
      const existing = student.biometricEnrollment;
      if ((existing?.biometric_version || 0) !== c.enrollment_version) throw httpError(409, 'Approved identity changed. Start a new check.');
      if (c.purpose === 'VERIFY') {
        if (existing?.status !== 'active' || student.enrollment_trust_state !== 'ACTIVE' || !existing.face_ciphertext) throw httpError(409, 'Approved identity was revoked');
        const session = await activeClass(tx, student.student_id, c.class_session_id!);
        const requirement = await tx.faceRequirement.findUniqueOrThrow({ where: { student_id_session_id: { student_id: student.student_id, session_id: session.session_id } } });
        if (c.phase === 'SPOT' && (new Date() < requirement.spot_due_at || !requirement.join_passed_at)) throw httpError(409, 'This check is not due');
        await tx.faceRequirement.update({ where: { requirement_id: requirement.requirement_id }, data: c.phase === 'JOIN' ? { join_passed_at: new Date() } : { spot_passed_at: new Date() } });
        await tx.$queryRaw`SELECT session_id FROM "ClassSession" WHERE session_id = ${session.session_id} FOR UPDATE`;
        await creditFaceAndRfid(tx, student.student_id, await tx.classSession.findUniqueOrThrow({ where: { session_id: session.session_id } }));
      } else {
        if (!['TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'].includes(actor.role) || (c.purpose === 'REENROLL' && actor.role === 'TEACHER')) throw httpError(403, 'Staff approval is required');
        const version = c.enrollment_version + 1;
        const data = { enrollment_method: c.enrollment_method!, enrolled_by: c.actor_id, biometric_version: version, status: 'active' as const,
          revoked_at: null, enrolled_at: new Date(), face_ciphertext: encryptFace(evaluated.vector, student.student_id, version),
          face_model: FACE_MODEL, face_captured_at: new Date(), consent_recorded_at: c.created_at };
        await tx.biometricEnrollment.upsert({ where: { student_id: student.student_id }, create: { student_id: student.student_id, ...data }, update: data });
        await tx.student.update({ where: { student_id: student.student_id }, data: { enrollment_trust_state: 'ACTIVE' } });
        await tx.faceRequirement.updateMany({ where: { student_id: student.student_id, deadline_at: { gt: new Date() } }, data: { join_passed_at: null, spot_passed_at: null } });
        await tx.faceChallenge.updateMany({ where: { student_id: student.student_id, state: 'pending' }, data: { state: 'cancelled' } });
      }
      await tx.faceChallenge.update({ where: { challenge_id: c.challenge_id }, data: { state: 'succeeded', completed_at: new Date() } });
      await tx.auditLog.create({ data: { table_name: 'FaceChallenge', record_id: c.challenge_id, action: c.purpose === 'VERIFY' ? 'UPDATE' : 'BIOMETRIC_ENROLLMENT',
        changed_by: c.actor_id, new_value: { student_id: student.student_id, class_session_id: c.class_session_id, phase: c.phase, result: 'VERIFIED', model: FACE_MODEL, assurance: 'BASIC_ACTIVE_LIVENESS' } } });
    });
    res.json({ success: true, data: { verified: true, purpose: challenge.purpose, phase: challenge.phase } });
  } catch (e: any) {
    if (claimed) await prisma.$transaction(async (tx) => {
      const failed = await tx.faceChallenge.updateMany({ where: { challenge_id: req.params.id, state: 'processing' }, data: { state: e.status === 503 ? 'pending' : 'failed', completed_at: e.status === 503 ? null : new Date(),
        failure_reason: /^FACE_[A-Z_]+$/.test(e.message) ? e.message : 'CHECK_UNAVAILABLE' } });
      if (failed.count) await tx.auditLog.create({ data: { table_name: 'FaceChallenge', record_id: req.params.id, action: 'UPDATE', changed_by: req.user!.userId,
        new_value: { result: 'RETRY_OR_REVIEW', reason: /^FACE_[A-Z_]+$/.test(e.message) ? e.message : 'CHECK_UNAVAILABLE' } } });
    }).catch(() => {});
    if (/^FACE_[A-Z_]+$/.test(e.message)) next(httpError(422, e.message === 'FACE_IDENTITY_MISMATCH' ? 'Face does not match the approved reference. Retry in good light or ask staff for review.' : 'Camera actions were incomplete or out of order. Keep one person visible and follow each instruction.'));
    else next(e);
  }
});
router.get('/status/:sessionId', requireRole('STUDENT'), async (req: AuthRequest, res, next) => {
  try {
    const row = await prisma.faceRequirement.findUnique({ where: { student_id_session_id: { student_id: req.user!.studentId || '', session_id: req.params.sessionId } } });
    const enrolled = await prisma.biometricEnrollment.findUnique({ where: { student_id: req.user!.studentId || '' }, select: { status: true, face_model: true, face_captured_at: true } });
    res.json({ success: true, data: { approvedFace: enrolled?.status === 'active' && enrolled.face_model === FACE_MODEL && !!enrolled.face_captured_at,
      required: row?.required || false, joinPassed: !!row?.join_passed_at, spotPassed: !!row?.spot_passed_at,
      due: row ? !row.join_passed_at ? 'JOIN' : !row.spot_passed_at && new Date() >= row.spot_due_at ? 'SPOT' : null : null,
      expired: !!row && new Date() >= row.deadline_at } });
  } catch (e) { next(e); }
});
router.get('/policy', requireRole('ADMIN', 'SUPER_ADMIN'), async (_req, res, next) => {
  try { res.json({ success: true, data: { ...await facePolicy(prisma), available: process.env.FACE_VISION_ENABLED === 'true' } }); } catch (e) { next(e); }
});
router.put('/policy', requireRole('ADMIN', 'SUPER_ADMIN'), validateBody(z.object({ required: z.boolean(), match: z.number().min(.4).max(.95), continuity: z.number().min(.5).max(.95) }).strict()), async (req: AuthRequest, res, next) => {
  try {
    if (req.body.required && process.env.FACE_VISION_ENABLED !== 'true') throw httpError(409, 'Enable and test the server face verifier before requiring it');
    await prisma.$transaction(async (tx) => {
      const values = { face_required_for_rfid: String(req.body.required), face_match_threshold: String(req.body.match), face_continuity_threshold: String(req.body.continuity) };
      for (const [key, value] of Object.entries(values)) await tx.settings.upsert({ where: { key }, create: { key, value, updated_by: req.user!.userId }, update: { value, updated_by: req.user!.userId } });
      await tx.auditLog.create({ data: { table_name: 'Settings', record_id: 'face-policy', action: 'UPDATE', changed_by: req.user!.userId, new_value: req.body } });
    });
    res.json({ success: true, data: await facePolicy(prisma) });
  } catch (e) { next(e); }
});
export default router;
