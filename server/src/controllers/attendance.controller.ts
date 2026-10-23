import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { qrLimiter, correctionLimiter } from '../middleware/rateLimit.middleware';
import { httpError } from '../middleware/error.middleware';
import { transitionStatus, canEditAttendance } from '../services/session.service';
import { computeStudentSummary, condonation } from '../services/attendance.service';
import { audit, auditFromReq } from '../services/audit.service';
import { staffSessionScope, staffStudentScope } from '../services/roster.service';
import { campusDate } from '../services/bleEvidence.service';

const router = Router();
router.use(authMiddleware);

// A student may only read their OWN records; staff may read anyone's.
async function assertSelfOrStaff(req: AuthRequest, studentId: string) {
  if (req.user!.role === 'STUDENT' && req.user!.studentId !== studentId) {
    throw httpError(403, 'Forbidden');
  }
  if (req.user!.role !== 'STUDENT' && !await prisma.student.findFirst({ where: { AND: [{ student_id: studentId }, await staffStudentScope(prisma, req.user!)] } })) throw httpError(403, 'Student outside your classes');
}

// ---- Sessions ----
router.get('/sessions', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const { date, sectionId } = req.query as { date?: string; sectionId?: string };
    const where: any = { AND: [await staffSessionScope(prisma, req.user!)] };
    if (date) where.date = new Date(date);
    if (sectionId) where.section_id = sectionId;
    // teachers see only their own sessions
    if (req.user!.role === 'TEACHER' && req.user!.teacherId) where.teacher_id = req.user!.teacherId;
    const sessions = await prisma.classSession.findMany({
      where,
      include: { subject: true, section: true, teacher: true },
      orderBy: { date: 'asc' },
      take: 200,
    });
    res.json({ success: true, data: sessions });
  } catch (e) { next(e); }
});

router.post('/sessions/generate', requireRole('HOD', 'ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { date } = req.body as { date: string };
    const target = new Date(date);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
    const dayName = days[target.getDay()] as any;
    const slots = await prisma.timetable.findMany({
      where: { day_of_week: dayName, is_active: true },
      include: { subjectTeacher: true },
    });
    const created = [];
    for (const slot of slots) {
      const existing = await prisma.classSession.findFirst({
        where: { timetable_id: slot.timetable_id, date: target },
      });
      if (existing) continue;
      const session = await prisma.classSession.create({
        data: {
          timetable_id: slot.timetable_id,
          subject_id: slot.subject_id,
          section_id: slot.section_id,
          teacher_id: slot.teacher_id,
          date: target,
          start_time: slot.start_time,
          end_time: slot.end_time,
          session_type: slot.session_type,
        },
      });
      created.push(session);
    }
    res.status(201).json({ success: true, data: { created: created.length, sessions: created } });
  } catch (e) { next(e); }
});

// Teacher one-tap: create (if needed) + open TODAY's session for one of their timetable slots.
// Idempotent — returns the existing session if it already exists.
router.post('/sessions/quick-start', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), validateBody(z.object({ timetableId: z.string().min(1) })), async (req: AuthRequest, res, next) => {
  try {
    const slot = await prisma.timetable.findFirst({ where: { AND: [{ timetable_id: req.body.timetableId, is_active: true }, await staffSessionScope(prisma, req.user!)] } });
    if (!slot) throw httpError(404, 'Timetable slot not found');
    if (req.user!.role === 'TEACHER' && slot.teacher_id !== req.user!.teacherId) {
      throw httpError(403, 'Not your class');
    }
    const today = new Date(campusDate(new Date(), process.env.ATTENDANCE_TIMEZONE || 'Asia/Kolkata'));
    const session = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT timetable_id FROM "Timetable" WHERE timetable_id = ${slot.timetable_id} FOR UPDATE`;
      let row = await tx.classSession.findFirst({ where: { timetable_id: slot.timetable_id, date: today } });
      if (!row) {
        row = await tx.classSession.create({
        data: {
          timetable_id: slot.timetable_id, room_no: slot.room_no, subject_id: slot.subject_id, section_id: slot.section_id,
          teacher_id: slot.teacher_id, date: today, start_time: slot.start_time, end_time: slot.end_time,
          session_type: slot.session_type, status: 'open',
        },
        });
        await tx.auditLog.create({ data: { table_name: 'ClassSession', record_id: row.session_id, action: 'CREATE', changed_by: req.user!.userId, new_value: { source: 'QUICK_START', status: 'open' } } });
      } else if (row.status === 'scheduled') {
        row = await tx.classSession.update({ where: { session_id: row.session_id }, data: { status: 'open' } });
        await tx.auditLog.create({ data: { table_name: 'ClassSession', record_id: row.session_id, action: 'UPDATE', changed_by: req.user!.userId, new_value: { source: 'QUICK_START', status: 'open' } } });
      }
      return row;
    });
    res.status(201).json({ success: true, data: session });
  } catch (e) { next(e); }
});

router.get('/sessions/:id', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const session = await prisma.classSession.findFirst({
      where: { AND: [{ session_id: req.params.id }, await staffSessionScope(prisma, req.user!)] },
      include: { subject: true, section: true, teacher: true },
    });
    if (!session) throw httpError(404, 'Session not found');
    const students = await prisma.student.findMany({ where: { section_id: session.section_id, user: { is_active: true },
      enrollments: { some: { subject_id: session.subject_id, section_id: session.section_id, status: 'active' } } } });
    res.json({ success: true, data: { ...session, section: { ...session.section, students } } });
  } catch (e) { next(e); }
});

router.put('/sessions/:id/status', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), validateBody(z.object({ status: z.enum(['open', 'submitted', 'locked', 'cancelled']) })), async (req: AuthRequest, res, next) => {
  try {
    const updated = await transitionStatus(req.params.id, req.body.status, req.user!.userId, req.user!.role, req, req.user!.teacherId);
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

router.post('/sessions/:id/attendance', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), validateBody(z.object({
  records: z.array(z.object({
    studentId: z.string(),
    status: z.enum(['present', 'absent', 'late', 'excused', 'on_duty', 'medical']),
  })).min(1),
})), async (req: AuthRequest, res, next) => {
  try {
    const session = await prisma.classSession.findUnique({ where: { session_id: req.params.id } });
    if (!session) throw httpError(404, 'Session not found');

    if (!await prisma.classSession.findFirst({ where: { AND: [{ session_id: session.session_id }, await staffSessionScope(prisma, req.user!)] } })) {
      throw httpError(403, 'Not your session');
    }

    const editable = await canEditAttendance(session.session_id);
    // Admins may override a locked session; teachers/HOD must file a correction.
    if (!editable && req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
      throw httpError(423, 'Session locked — submit a correction instead');
    }

    const eligible = await prisma.student.findMany({ where: { student_id: { in: req.body.records.map((r: { studentId: string }) => r.studentId) },
      section_id: session.section_id, user: { is_active: true }, enrollments: { some: { subject_id: session.subject_id, section_id: session.section_id, status: 'active' } } } });
    if (new Set(req.body.records.map((r: { studentId: string }) => r.studentId)).size !== req.body.records.length || eligible.length !== req.body.records.length) throw httpError(403, 'Every student must be active and enrolled in this class');
    const results = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT session_id FROM "ClassSession" WHERE session_id = ${session.session_id} FOR UPDATE`;
      const current = await tx.classSession.findUniqueOrThrow({ where: { session_id: session.session_id } });
      if (current.status === 'cancelled' || (current.status === 'locked' && !['ADMIN', 'SUPER_ADMIN'].includes(req.user!.role))) throw httpError(423, 'Session is closed');
      const records = [];
      for (const rec of req.body.records as { studentId: string; status: string }[]) records.push(await tx.attendance.upsert({
          where: { session_id_student_id: { session_id: session.session_id, student_id: rec.studentId } },
          update: { status: rec.status as any, marked_by: req.user!.userId, method: 'manual', marked_at: new Date() },
          create: {
            session_id: session.session_id,
            student_id: rec.studentId,
            status: rec.status as any,
            marked_by: req.user!.userId,
            method: 'manual',
          },
        }));
      await tx.auditLog.create({ data: { table_name: 'Attendance', record_id: session.session_id, action: 'UPDATE', changed_by: req.user!.userId, new_value: { count: records.length, method: 'manual' } } });
      return records;
    });

    res.status(201).json({ success: true, data: { marked: results.length } });
  } catch (e) { next(e); }
});

// ---- Attendance records ----
router.get('/attendance/session/:sessionId', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    if (!await prisma.classSession.findFirst({ where: { AND: [{ session_id: req.params.sessionId }, await staffSessionScope(prisma, req.user!)] } })) throw httpError(404, 'Session not found in your classes');
    const rows = await prisma.attendance.findMany({
      where: { session_id: req.params.sessionId },
      include: { student: { select: { student_id: true, name: true, roll_no: true } } },
    });
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.get('/students/:id/attendance', async (req: AuthRequest, res, next) => {
  try {
    await assertSelfOrStaff(req, req.params.id);
    const rows = await prisma.attendance.findMany({
      where: {
        student_id: req.params.id,
        ...(req.query.subjectId ? { session: { subject_id: req.query.subjectId as string } } : {}),
      },
      include: {
        session: { include: { subject: { select: { subject_code: true, subject_name: true } } } },
      },
      orderBy: { session: { date: 'desc' } },
      take: 500,
    });
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.get('/students/:id/attendance/summary', async (req: AuthRequest, res, next) => {
  try {
    await assertSelfOrStaff(req, req.params.id);
    const subjectId = req.query.subjectId as string | undefined;
    const summary = await computeStudentSummary(req.params.id, subjectId);
    const extra = condonation(summary);
    res.json({ success: true, data: { ...summary, condonation: extra } });
  } catch (e) { next(e); }
});

// ---- QR ----
router.post('/attendance/qr/generate', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const { sessionId } = req.body as { sessionId: string };
    // Teachers may only generate for their own session; HOD/ADMIN may generate for any.
    const scopeTeacherId = req.user!.role === 'TEACHER' ? req.user!.teacherId : undefined;
    const result = await qrGenerate(sessionId, scopeTeacherId);
    res.status(201).json({ success: true, data: result });
  } catch (e) { next(e); }
});

import { generateQR as qrGenerate, scanQR, revokeQR } from '../services/qr.service';

router.post('/attendance/qr/scan', qrLimiter, requireRole('STUDENT'), async (req: AuthRequest, res, next) => {
  try {
    const { token, deviceId } = req.body as { token: string; deviceId?: string };
    if (!req.user!.studentId) throw httpError(403, 'Not a student profile');
    const result = await scanQR(token, req.user!.studentId, deviceId);
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

router.put('/attendance/qr/:qrId/revoke', requireRole('TEACHER', 'HOD'), async (req: AuthRequest, res, next) => {
  try {
    const updated = await revokeQR(req.params.qrId, req.user!.role === 'TEACHER' ? req.user!.teacherId : undefined);
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// ---- Corrections ----
router.post('/attendance/corrections', correctionLimiter, validateBody(z.object({
  attendanceId: z.string().min(1),
  requestedStatus: z.enum(['present', 'absent', 'late', 'excused', 'on_duty', 'medical']),
  reason: z.string().min(3),
})), async (req: AuthRequest, res, next) => {
  try {
    const { attendanceId, requestedStatus, reason } = req.body as { attendanceId: string; requestedStatus: string; reason: string };
    const att = await prisma.attendance.findUnique({ where: { attendance_id: attendanceId } });
    if (!att) throw httpError(404, 'Attendance record not found');

    // A student may only request corrections on their OWN attendance rows.
    if (req.user!.role === 'STUDENT' && att.student_id !== req.user!.studentId) {
      throw httpError(403, 'Forbidden');
    }

    const correction = await prisma.attendanceCorrection.create({
      data: {
        attendance_id: attendanceId,
        requested_by: req.user!.userId,
        old_status: att.status,
        requested_status: requestedStatus as any,
        reason,
      },
    });
    await audit({ tableName: 'AttendanceCorrection', recordId: correction.correction_id, action: 'CREATE', changedBy: req.user!.userId, newValue: correction, ...auditFromReq(req) });
    res.status(201).json({ success: true, data: correction });
  } catch (e) { next(e); }
});

router.get('/attendance/corrections', requireRole('HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const { status } = req.query as { status?: string };
    const rows = await prisma.attendanceCorrection.findMany({
      where: status ? { status: status as any } : {},
      include: {
        attendance: { include: { student: { select: { name: true, roll_no: true } }, session: { include: { subject: true } } } },
        requestedByUser: { select: { name: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.put('/attendance/corrections/:id/approve', requireRole('HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const correction = await prisma.attendanceCorrection.findUnique({ where: { correction_id: req.params.id }, include: { attendance: true } });
    if (!correction) throw httpError(404, 'Correction not found');
    if (correction.status !== 'pending') throw httpError(409, 'Already reviewed');

    await prisma.$transaction([
      prisma.attendanceCorrection.update({
        where: { correction_id: correction.correction_id },
        data: { status: 'approved', reviewed_by: req.user!.userId, reviewed_at: new Date() },
      }),
      prisma.attendance.update({
        where: { attendance_id: correction.attendance_id },
        data: { status: correction.requested_status },
      }),
    ]);

    const { notify } = await import('../services/notification.service');
    await notify({ userId: correction.requested_by, message: 'Your correction request was approved', type: 'correction_status' });
    await audit({ tableName: 'AttendanceCorrection', recordId: correction.correction_id, action: 'APPROVE', changedBy: req.user!.userId, oldValue: correction.attendance.status, newValue: correction.requested_status, ...auditFromReq(req) });

    res.json({ success: true });
  } catch (e) { next(e); }
});

router.put('/attendance/corrections/:id/reject', requireRole('HOD', 'ADMIN', 'SUPER_ADMIN'), validateBody(z.object({ reason: z.string().min(1) })), async (req: AuthRequest, res, next) => {
  try {
    const correction = await prisma.attendanceCorrection.findUnique({ where: { correction_id: req.params.id } });
    if (!correction) throw httpError(404, 'Correction not found');
    if (correction.status !== 'pending') throw httpError(409, 'Already reviewed');

    await prisma.attendanceCorrection.update({
      where: { correction_id: correction.correction_id },
      data: { status: 'rejected', reviewed_by: req.user!.userId, reviewed_at: new Date(), rejection_reason: req.body.reason },
    });
    const { notify } = await import('../services/notification.service');
    await notify({ userId: correction.requested_by, message: `Your correction was rejected: ${req.body.reason}`, type: 'correction_status' });
    await audit({ tableName: 'AttendanceCorrection', recordId: correction.correction_id, action: 'REJECT', changedBy: req.user!.userId, ...auditFromReq(req) });

    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
