import { Router, Request } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../utils/prisma';
import { authMiddleware, AuthRequest, requireRole } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { httpError } from '../middleware/error.middleware';
import { campusDate } from '../services/bleEvidence.service';
import { cardHash, dailyRfid, lockReader, lockStudent, readerKeyHash, recordTap, RFID_LIMITS, rfidRules, rfidZone, validReaderKey } from '../services/rfid.service';
import { ensureSectionEnrollments, registerStudent } from '../services/roster.service';

const router = Router();
type ReaderRequest = Request & { reader?: { reader_id: string; key_hash: string } };
const tapSchema = z.object({ eventId: z.string().uuid(), uid: z.string().min(8).max(40), sentAt: z.number().int().nonnegative().safe() }).strict();
const tapLimiter = rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => (req as ReaderRequest).reader!.reader_id });
// This route precedes human JWT middleware. Its credentials cannot access human APIs.
router.post('/device/tap', async (req: ReaderRequest, res, next) => {
  try {
    const id = req.header('X-Reader-Id'), key = req.header('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{40,128})$/)?.[1];
    if (!id || !key) throw httpError(401, 'Reader authentication required');
    const reader = await prisma.rfidReader.findUnique({ where: { reader_id: id }, include: { owner: true } });
    if (!reader?.is_active || !reader.owner.is_active || !['ADMIN', 'SUPER_ADMIN'].includes(reader.owner.role) || !validReaderKey(key, reader.key_hash)) throw httpError(401, 'Invalid reader credentials');
    req.reader = { reader_id: id, key_hash: reader.key_hash }; next();
  } catch (e) { next(e); }
}, tapLimiter, validateBody(tapSchema), async (req: ReaderRequest, res, next) => {
  try {
    const row = await recordTap(req.body, req.reader!);
    res.json({ success: true, data: { event_id: row.event_id, outcome: row.outcome, direction: row.direction, received_at: row.received_at, duplicate: row.duplicate } });
  } catch (e) { next(e); }
});
router.use(authMiddleware);
const admins = requireRole('ADMIN', 'SUPER_ADMIN');
const dateQuery = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Invalid date');
function selectedDate(value: unknown) {
  const parsed = dateQuery.safeParse(value || campusDate(new Date(), rfidZone()));
  if (!parsed.success) throw httpError(400, 'Use a valid YYYY-MM-DD date');
  return parsed.data;
}
router.get('/my-day', requireRole('STUDENT'), async (req: AuthRequest, res, next) => {
  try { if (!req.user!.studentId) throw httpError(403, 'Student profile required'); res.json({ success: true, data: await dailyRfid(req.user!, selectedDate(req.query.date)) }); }
  catch (e) { next(e); }
});
router.get('/day', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try { res.json({ success: true, data: await dailyRfid(req.user!, selectedDate(req.query.date)) }); } catch (e) { next(e); }
});
export function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  const safe = /^[\s]*[=+@\-]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}
router.get('/export', async (req: AuthRequest, res, next) => {
  try {
    const day = await dailyRfid(req.user!, selectedDate(req.query.date));
    const rows: unknown[][] = [['date','time_zone','subject','subject_code','section','room','student','roll_no','status','method','entry_at','exit_at']];
    for (const c of day.classes) for (const s of c.roster) for (const v of s.visits.length ? s.visits : [{ entry_at: null, exit_at: null }])
      rows.push([day.date,day.time_zone,c.subject,c.subject_code,c.section,c.room_no,s.name,s.roll_no,s.status,s.method,v.entry_at?.toISOString(),v.exit_at?.toISOString()]);
    res.setHeader('Cache-Control','no-store'); res.attachment('threshold-attendance-'+day.date+'.csv');
    res.type('text/csv').send('\uFEFF'+rows.map((r)=>r.map(csvCell).join(',')).join('\r\n'));
  } catch (e) { next(e); }
});
router.post('/students/import', admins, validateBody(z.object({ sectionId: z.string().uuid(), rows: z.array(z.object({
  name: z.string().trim().min(1).max(100), email: z.string().email().transform((v)=>v.toLowerCase()), roll_no: z.string().trim().min(1).max(50),
  phone: z.string().max(30).optional(), parent_email: z.string().email().optional(), parent_phone: z.string().max(30).optional(),
}).strict()).min(1).max(500) }).strict()), async (req: AuthRequest, res, next) => {
  try {
    const section = await prisma.section.findUnique({ where: { section_id: req.body.sectionId } });
    if (!section) throw httpError(404,'Section not found');
    const results = [];
    for (const [i, row] of req.body.rows.entries()) {
      try {
        const password = randomBytes(18).toString('base64url');
        const student = await prisma.$transaction((tx)=>registerStudent(tx,{ ...row, password, section_id: section.section_id, course_id: section.course_id },req.user!.userId),{timeout:15_000});
        results.push({ row: i+1, name: student.name, email: student.email, roll_no: student.roll_no, student_id: student.student_id, ok: true, initial_password: password });
      } catch (e: any) { results.push({ row: i+1, email: row.email, roll_no: row.roll_no, ok: false, error: e.code==='P2002' ? 'Email or roll number already exists' : e.status ? e.message : 'Student registration failed' }); }
    }
    res.setHeader('Cache-Control','no-store'); res.status(201).json({success:true,data:{created:results.filter((r)=>r.ok).length,total:results.length,results}});
  } catch(e) {next(e);}
});
router.post('/timetable', admins, validateBody(z.object({ subject_id:z.string().uuid(),section_id:z.string().uuid(),teacher_id:z.string().uuid(),
  day_of_week:z.enum(['Mon','Tue','Wed','Thu','Fri','Sat']),start_time:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),end_time:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  room_no:z.string().trim().min(1).max(40),session_type:z.enum(['lecture','lab','tutorial']) }).strict()),async(req:AuthRequest,res,next)=>{
  try {
    const b={...req.body,room_no:req.body.room_no.toUpperCase()};
    if(b.start_time>=b.end_time)throw httpError(400,'Class end must be after its start');
    const row=await prisma.$transaction(async(tx)=>{
      await tx.$executeRaw`LOCK TABLE "Timetable" IN SHARE ROW EXCLUSIVE MODE`;
      const section=await tx.section.findUnique({where:{section_id:b.section_id}}),subject=await tx.subject.findUnique({where:{subject_id:b.subject_id}}),teacher=await tx.teacher.findUnique({where:{teacher_id:b.teacher_id}});
      if(!section||!subject||!teacher||section.course_id!==subject.course_id||section.semester_id!==subject.semester_id)throw httpError(400,'Subject must belong to the selected class/semester');
      const assigned=await tx.subjectTeacher.findUnique({where:{subject_id_section_id:{subject_id:b.subject_id,section_id:b.section_id}}});
      if(assigned&&assigned.teacher_id!==b.teacher_id)throw httpError(409,'This subject and section already have another assigned teacher');
      const overlap=await tx.timetable.findFirst({where:{is_active:true,day_of_week:b.day_of_week,start_time:{lt:b.end_time},end_time:{gt:b.start_time},OR:[{section_id:b.section_id},{teacher_id:b.teacher_id},{room_no:{equals:b.room_no,mode:'insensitive'}}]}});
      if(overlap)throw httpError(409,'Room, teacher or section already has an overlapping class');
      if(!assigned)await tx.subjectTeacher.create({data:{subject_id:b.subject_id,section_id:b.section_id,teacher_id:b.teacher_id}});
      const slot=await tx.timetable.create({data:b}); await ensureSectionEnrollments(tx,b.section_id);
      await tx.auditLog.create({data:{table_name:'Timetable',record_id:slot.timetable_id,action:'CREATE',changed_by:req.user!.userId,new_value:{source:'RFID_SETUP',room_no:b.room_no,section_id:b.section_id}}});
      return slot;
    });res.status(201).json({success:true,data:row});
  }catch(e){next(e);}
});
const readerSelect = { reader_id: true, name: true, room_no: true, is_active: true, created_at: true, last_seen_at: true,
  capture_id: true, capture_until: true, capture_suffix: true, captured_at: true } as const;
router.get('/readers', admins, async (_req, res, next) => {
  try { res.json({ success: true, data: await prisma.rfidReader.findMany({ select: readerSelect, orderBy: { room_no: 'asc' } }) }); } catch (e) { next(e); }
});
router.post('/readers', admins, validateBody(z.object({ name: z.string().trim().min(1).max(80), room_no: z.string().trim().min(1).max(40) }).strict()), async (req: AuthRequest, res, next) => {
  try {
    cardHash('00000000'); // Fail clearly before provisioning if the stable UID hashing key is missing.
    const key = randomBytes(32).toString('base64url');
    const row = await prisma.$transaction(async (tx) => {
      const reader = await tx.rfidReader.create({ data: { name: req.body.name, room_no: req.body.room_no.toUpperCase(), key_hash: readerKeyHash(key), created_by: req.user!.userId }, select: readerSelect });
      await tx.auditLog.create({ data: { table_name: 'RfidReader', record_id: reader.reader_id, action: 'CREATE', changed_by: req.user!.userId, new_value: { room_no: reader.room_no } } });
      return reader;
    });
    res.status(201).json({ success: true, data: { ...row, key } });
  } catch (e) { next(e); }
});
router.post('/readers/:id/rotate-key', admins, async (req: AuthRequest, res, next) => {
  try {
    const key = randomBytes(32).toString('base64url');
    const row = await prisma.$transaction(async (tx) => {
      // Disabled readers can also rotate; re-enabling is an explicit separate action.
      await tx.$queryRaw`SELECT reader_id FROM "RfidReader" WHERE reader_id = ${req.params.id} FOR UPDATE`;
      const reader = await tx.rfidReader.update({ where: { reader_id: req.params.id }, data: { key_hash: readerKeyHash(key), capture_id: null, capture_until: null, capture_hash: null, capture_suffix: null, captured_at: null }, select: readerSelect });
      await tx.auditLog.create({ data: { table_name: 'RfidReader', record_id: reader.reader_id, action: 'UPDATE', changed_by: req.user!.userId, new_value: { key_rotated: true } } });
      return reader;
    });
    res.json({ success: true, data: { ...row, key } });
  } catch (e) { next(e); }
});
router.patch('/readers/:id', admins, validateBody(z.object({ is_active: z.boolean() }).strict()), async (req: AuthRequest, res, next) => {
  try {
    const row = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT reader_id FROM "RfidReader" WHERE reader_id = ${req.params.id} FOR UPDATE`;
      const reader = await tx.rfidReader.update({ where: { reader_id: req.params.id }, data: { is_active: req.body.is_active, capture_id: null, capture_until: null, capture_hash: null, capture_suffix: null, captured_at: null }, select: readerSelect });
      await tx.auditLog.create({ data: { table_name: 'RfidReader', record_id: reader.reader_id, action: 'UPDATE', changed_by: req.user!.userId, new_value: { is_active: reader.is_active } } });
      return reader;
    });
    res.json({ success: true, data: row });
  } catch (e) { next(e); }
});
router.post('/readers/:id/capture', admins, async (req: AuthRequest, res, next) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const reader = await lockReader(tx, req.params.id);
      if (reader.capture_until && reader.capture_until > new Date()) throw httpError(409, 'This reader already has an active card capture. Cancel it first');
      const row = await tx.rfidReader.update({ where: { reader_id: reader.reader_id }, data: { capture_id: randomUUID(), capture_until: new Date(Date.now() + 60_000), capture_hash: null, capture_suffix: null, captured_at: null }, select: readerSelect });
      await tx.auditLog.create({ data: { table_name: 'RfidReader', record_id: reader.reader_id, action: 'UPDATE', changed_by: req.user!.userId, new_value: { capture_started: true } } });
      return row;
    });
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});
router.delete('/readers/:id/capture', admins, async (req: AuthRequest, res, next) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT reader_id FROM "RfidReader" WHERE reader_id = ${req.params.id} FOR UPDATE`;
      await tx.rfidReader.update({ where: { reader_id: req.params.id }, data: { capture_id: null, capture_until: null, capture_hash: null, capture_suffix: null, captured_at: null } });
      await tx.auditLog.create({ data: { table_name: 'RfidReader', record_id: req.params.id, action: 'UPDATE', changed_by: req.user!.userId, new_value: { capture_cancelled: true } } });
    }); res.json({ success: true });
  } catch (e) { next(e); }
});
router.post('/cards/assign', admins, validateBody(z.object({ captureId: z.string().uuid(), studentId: z.string().uuid() }).strict()), async (req: AuthRequest, res, next) => {
  try {
    const card = await prisma.$transaction(async (tx) => {
      const found = await tx.rfidReader.findUnique({ where: { capture_id: req.body.captureId } });
      if (!found) throw httpError(404, 'Capture not found');
      const reader = await lockReader(tx, found.reader_id);
      if (reader.capture_id !== req.body.captureId || !reader.capture_hash || !reader.capture_until || reader.capture_until <= new Date()) throw httpError(409, 'Capture expired or no card has been tapped');
      const student = await lockStudent(tx, req.body.studentId);
      if (!student.user.is_active) throw httpError(409, 'Student is inactive');
      // Two administrators can capture one card on different readers. Serialize
      // that UID across students before checking/upserting its current owner.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${reader.capture_hash}))`;
      const old = await tx.rfidCard.findUnique({ where: { uid_hash: reader.capture_hash } });
      if (old?.is_active && old.student_id !== student.student_id) throw httpError(409, 'Card already belongs to another active student. Revoke that assignment first');
      await tx.rfidCard.updateMany({ where: { student_id: student.student_id, is_active: true }, data: { is_active: false, revoked_at: new Date() } });
      const row = await tx.rfidCard.upsert({ where: { uid_hash: reader.capture_hash },
        update: { student_id: student.student_id, is_active: true, revoked_at: null, assigned_by: req.user!.userId, assigned_at: new Date() },
        create: { uid_hash: reader.capture_hash, uid_suffix: reader.capture_suffix!, student_id: student.student_id, assigned_by: req.user!.userId },
        select: { card_id: true, uid_suffix: true, student_id: true, is_active: true } });
      await tx.rfidReader.update({ where: { reader_id: reader.reader_id }, data: { capture_id: null, capture_until: null, capture_hash: null, capture_suffix: null, captured_at: null } });
      await tx.auditLog.create({ data: { table_name: 'RfidCard', record_id: row.card_id, action: 'UPDATE', changed_by: req.user!.userId,
        old_value: old ? { student_id: old.student_id, is_active: old.is_active } : undefined, new_value: { student_id: student.student_id, replaced_previous_card: true, suffix: row.uid_suffix } } });
      return row;
    });
    res.json({ success: true, data: card });
  } catch (e) { next(e); }
});
router.get('/students', admins, async (_req, res, next) => {
  try { res.json({ success: true, data: await prisma.student.findMany({ select: { student_id: true, name: true, roll_no: true, email: true, section_id: true,
    section: { select: { section_name: true, course: { select: { course_name: true } } } }, user: { select: { is_active: true } },
    rfidCards: { where: { is_active: true }, select: { card_id: true, uid_suffix: true } } }, orderBy: { roll_no: 'asc' }, take: 2000 }) }); } catch (e) { next(e); }
});
export const rfidStudentSchema = z.object({ name: z.string().trim().min(1).max(100), email: z.string().email().transform((v) => v.toLowerCase()), password: z.string().min(10).max(128),
  roll_no: z.string().trim().min(1).max(50), course_id: z.string().uuid(), section_id: z.string().uuid(), phone: z.string().max(30).optional(), parent_email: z.string().email().optional(), parent_phone: z.string().max(30).optional() }).strict();
router.post('/students', admins, validateBody(rfidStudentSchema), async (req: AuthRequest, res, next) => {
  try { const student = await prisma.$transaction((tx) => registerStudent(tx, req.body, req.user!.userId), { timeout: 15_000 }); res.status(201).json({ success: true, data: student }); } catch (e) { next(e); }
});
router.post('/students/:id/revoke-card', admins, validateBody(z.object({ reason: z.string().trim().min(3).max(300) }).strict()), async (req: AuthRequest, res, next) => {
  try {
    await prisma.$transaction(async (tx) => {
      await lockStudent(tx, req.params.id);
      await tx.rfidCard.updateMany({ where: { student_id: req.params.id, is_active: true }, data: { is_active: false, revoked_at: new Date() } });
      await tx.auditLog.create({ data: { table_name: 'RfidCard', record_id: req.params.id, action: 'UPDATE', changed_by: req.user!.userId, new_value: { revoked: true, reason: req.body.reason } } });
    }); res.json({ success: true });
  } catch (e) { next(e); }
});
router.post('/students/:id/deactivate', admins, validateBody(z.object({ reason: z.string().trim().min(3).max(300) }).strict()), async (req: AuthRequest, res, next) => {
  try {
    await prisma.$transaction(async (tx) => {
      const student = await lockStudent(tx, req.params.id);
      await tx.user.update({ where: { user_id: student.user_id }, data: { is_active: false } });
      await tx.refreshSession.updateMany({ where: { user_id: student.user_id, revoked_at: null }, data: { revoked_at: new Date() } });
      await tx.biometricEnrollment.updateMany({ where: { student_id: student.student_id }, data: { status: 'revoked', revoked_at: new Date(), face_ciphertext: null, face_model: null, face_captured_at: null, biometric_version: { increment: 1 } } });
      await tx.faceChallenge.updateMany({ where: { student_id: student.student_id, state: { in: ['pending', 'processing'] } }, data: { state: 'cancelled' } });
      await tx.rfidCard.updateMany({ where: { student_id: student.student_id, is_active: true }, data: { is_active: false, revoked_at: new Date() } });
      await tx.auditLog.create({ data: { table_name: 'Student', record_id: student.student_id, action: 'UPDATE', changed_by: req.user!.userId, new_value: { is_active: false, cards_revoked: true, reason: req.body.reason } } });
    }); res.json({ success: true });
  } catch (e) { next(e); }
});
router.get('/policy', admins, async (_req, res, next) => {
  try { res.json({ success: true, data: { ...await rfidRules(prisma), time_zone: rfidZone() } }); } catch (e) { next(e); }
});
router.put('/policy', admins, validateBody(z.object({ rfid_debounce_seconds: z.number().int().min(2).max(120), rfid_exit_grace_minutes: z.number().int().min(0).max(60), rfid_event_max_age_seconds: z.number().int().min(5).max(120) }).strict()), async (req: AuthRequest, res, next) => {
  try {
    await prisma.$transaction(async (tx) => {
      for (const key of Object.keys(RFID_LIMITS)) await tx.settings.upsert({ where: { key }, create: { key, value: String(req.body[key]), updated_by: req.user!.userId }, update: { value: String(req.body[key]), updated_by: req.user!.userId } });
      await tx.auditLog.create({ data: { table_name: 'Settings', record_id: 'rfid-policy', action: 'UPDATE', changed_by: req.user!.userId, new_value: req.body } });
    }); res.json({ success: true, data: await rfidRules(prisma) });
  } catch (e) { next(e); }
});
export default router;
