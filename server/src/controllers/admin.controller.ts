import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { httpError } from '../middleware/error.middleware';
import { hashPassword } from '../utils/hash';
import { audit, auditFromReq } from '../services/audit.service';
import { DEFAULT_RULES } from '../services/attendance.service';

const router = Router();
router.use(authMiddleware);

// ---- Org structure CRUD (admin-managed) ----
function crud(path: string, model: any, scope: any[], uniqueMsg: string) {
  router.post(path, requireRole(...scope), async (req: AuthRequest, res, next) => {
    try {
      const created = await model().create({ data: req.body });
      await audit({ tableName: path, recordId: created[Object.keys(created)[0]], action: 'CREATE', changedBy: req.user!.userId, newValue: created, ...auditFromReq(req) });
      res.status(201).json({ success: true, data: created });
    } catch (e: any) {
      if (e.code === 'P2002') return res.status(409).json({ success: false, error: uniqueMsg });
      next(e);
    }
  });
  router.get(path, requireRole(...scope), async (_req, res, next) => {
    try {
      const rows = await model().findMany({ take: 500 });
      res.json({ success: true, data: rows });
    } catch (e) { next(e); }
  });
}

crud('/departments', () => prisma.department, ['ADMIN', 'SUPER_ADMIN'], 'Department code exists');
crud('/academic-years', () => prisma.academicYear, ['ADMIN', 'SUPER_ADMIN'], 'Academic year exists');
crud('/semesters', () => prisma.semester, ['ADMIN', 'SUPER_ADMIN'], 'Semester exists');
crud('/courses', () => prisma.course, ['ADMIN', 'SUPER_ADMIN'], 'Course code exists');
crud('/sections', () => prisma.section, ['ADMIN', 'SUPER_ADMIN'], 'Section exists');
crud('/subjects', () => prisma.subject, ['ADMIN', 'SUPER_ADMIN'], 'Subject code exists');

// read endpoints for all roles (scoped usage)
router.get('/catalog/:entity', async (req: AuthRequest, res, next) => {
  try {
    const map: Record<string, any> = {
      departments: () => prisma.department.findMany(),
      courses: () => prisma.course.findMany(),
      sections: () => prisma.section.findMany({ include: { course: true, semester: true } }),
      subjects: () => prisma.subject.findMany(),
      semesters: () => prisma.semester.findMany({ include: { academicYear: true } }),
      academicYears: () => prisma.academicYear.findMany(),
    };
    const fn = map[req.params.entity];
    if (!fn) throw httpError(404, 'Unknown entity');
    res.json({ success: true, data: await fn() });
  } catch (e) { next(e); }
});

// ---- Students / Teachers provisioning ----
const studentSchema = z.object({
  name: z.string().min(1), email: z.string().email(), password: z.string().min(8),
  roll_no: z.string().min(1), phone: z.string().optional(),
  course_id: z.string(), section_id: z.string(), parent_email: z.string().email().optional(),
});

router.post('/students', requireRole('ADMIN', 'SUPER_ADMIN'), validateBody(studentSchema), async (req: AuthRequest, res, next) => {
  try {
    const { password, ...rest } = req.body;
    const user = await prisma.user.create({
      data: { name: rest.name, email: rest.email, password_hash: await hashPassword(password), role: 'STUDENT' },
    });
    const student = await prisma.student.create({ data: { ...rest, user_id: user.user_id } });
    res.status(201).json({ success: true, data: student });
  } catch (e) { next(e); }
});

router.get('/students', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { sectionId } = req.query as { sectionId?: string };
    const rows = await prisma.student.findMany({
      where: sectionId ? { section_id: sectionId } : {},
      include: { section: true, course: true },
      take: 500,
    });
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.post('/teachers', requireRole('ADMIN', 'SUPER_ADMIN'), validateBody(z.object({
  name: z.string().min(1), email: z.string().email(), password: z.string().min(8),
  employee_id: z.string().min(1), department_id: z.string(),
})), async (req: AuthRequest, res, next) => {
  try {
    const { password, email, ...rest } = req.body;
    const user = await prisma.user.create({
      data: { name: rest.name, email, password_hash: await hashPassword(password), role: 'TEACHER' },
    });
    const teacher = await prisma.teacher.create({ data: { ...rest, user_id: user.user_id } });
    res.status(201).json({ success: true, data: teacher });
  } catch (e) { next(e); }
});

// ---- Bulk CSV import (students or teachers) ----
router.post('/bulk-import', requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const { type, rows } = req.body as { type: 'students' | 'teachers'; rows: Record<string, string>[] };
    if (!rows || !Array.isArray(rows) || rows.length === 0) throw httpError(400, 'rows required');
    const results: { row: number; email: string; ok: boolean; error?: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        if (type === 'students') {
          if (!r.name || !r.email || !r.roll_no || !r.course_code || !r.section_name) throw new Error('missing fields (name,email,roll_no,course_code,section_name)');
          const course = await prisma.course.findFirst({ where: { course_code: r.course_code } });
          if (!course) throw new Error(`course ${r.course_code} not found`);
          const section = await prisma.section.findFirst({ where: { section_name: r.section_name, course_id: course.course_id } });
          if (!section) throw new Error(`section ${r.section_name} not found in ${r.course_code}`);
          const password = r.password || 'Password@123';
          const user = await prisma.user.create({
            data: { name: r.name, email: r.email, password_hash: await hashPassword(password), role: 'STUDENT' },
          });
          await prisma.student.create({ data: {
            user_id: user.user_id, name: r.name, roll_no: r.roll_no, email: r.email,
            phone: r.phone || null, course_id: course.course_id, section_id: section.section_id,
            parent_email: r.parent_email || null, parent_phone: r.parent_phone || null,
          }});
        } else {
          if (!r.name || !r.email || !r.employee_id || !r.department_code) throw new Error('missing fields (name,email,employee_id,department_code)');
          const dept = await prisma.department.findFirst({ where: { code: r.department_code } });
          if (!dept) throw new Error(`department ${r.department_code} not found`);
          const user = await prisma.user.create({
            data: { name: r.name, email: r.email, password_hash: await hashPassword(r.password || 'Password@123'), role: 'TEACHER' },
          });
          await prisma.teacher.create({ data: {
            user_id: user.user_id, name: r.name, employee_id: r.employee_id, department_id: dept.department_id,
          }});
        }
        results.push({ row: i + 1, email: r.email, ok: true });
      } catch (rowErr: any) {
        results.push({ row: i + 1, email: r.email || '(?)', ok: false, error: rowErr.message });
      }
    }
    const okCount = results.filter((x) => x.ok).length;
    await audit({ tableName: 'User', recordId: 'bulk-import', action: 'CREATE', changedBy: req.user!.userId, newValue: { type, ok: okCount, total: rows.length }, ...auditFromReq(req) });
    res.status(201).json({ success: true, data: { total: rows.length, created: okCount, failed: rows.length - okCount, results } });
  } catch (e) { next(e); }
});

router.get('/teachers', requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const rows = await prisma.teacher.findMany({ include: { department: true }, take: 500 });
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

// ---- Subject-teacher assignment ----
router.post('/subject-teachers', requireRole('ADMIN', 'SUPER_ADMIN', 'HOD'), async (req: AuthRequest, res, next) => {
  try {
    const st = await prisma.subjectTeacher.create({ data: req.body });
    res.status(201).json({ success: true, data: st });
  } catch (e) { next(e); }
});

// ---- Enrollment ----
router.post('/enrollment', requireRole('ADMIN', 'HOD'), async (req: AuthRequest, res, next) => {
  try {
    const enr = await prisma.enrollment.create({ data: req.body });
    res.status(201).json({ success: true, data: enr });
  } catch (e) { next(e); }
});

// ---- Timetable ----
router.get('/timetable', async (req: AuthRequest, res, next) => {
  try {
    const { sectionId, teacherId } = req.query as { sectionId?: string; teacherId?: string };
    const rows = await prisma.timetable.findMany({
      where: { is_active: true, ...(sectionId ? { section_id: sectionId } : {}), ...(teacherId ? { teacher_id: teacherId } : {}) },
      include: { subject: true, section: true, teacher: true },
    });
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

const overlapWhere = (b: any) => ({
  day_of_week: b.day_of_week,
  is_active: true,
  OR: [
    { teacher_id: b.teacher_id },
    { section_id: b.section_id },
    { room_no: b.room_no },
  ],
  start_time: { lt: b.end_time },
  end_time: { gt: b.start_time },
});

router.post('/timetable', requireRole('ADMIN', 'HOD'), async (req: AuthRequest, res, next) => {
  try {
    const body = req.body as {
      subject_id: string; section_id: string; teacher_id: string; day_of_week: string;
      start_time: string; end_time: string; room_no: string; session_type?: string;
    };
    if (body.start_time >= body.end_time) throw httpError(400, 'end_time must be after start_time');

    const conflict = await prisma.timetable.findFirst({ where: overlapWhere(body) });
    if (conflict) throw httpError(409, `Timetable conflict with existing slot (${conflict.room_no}, ${conflict.day_of_week} ${conflict.start_time})`);

    const row = await prisma.timetable.create({ data: { ...body, session_type: (body.session_type as any) || 'lecture', day_of_week: body.day_of_week as any } });
    await audit({ tableName: 'Timetable', recordId: row.timetable_id, action: 'CREATE', changedBy: req.user!.userId, ...auditFromReq(req) });
    res.status(201).json({ success: true, data: row });
  } catch (e) { next(e); }
});

router.delete('/timetable/:id', requireRole('ADMIN', 'HOD'), async (req: AuthRequest, res, next) => {
  try {
    await prisma.timetable.update({ where: { timetable_id: req.params.id }, data: { is_active: false } });
    await audit({ tableName: 'Timetable', recordId: req.params.id, action: 'DELETE', changedBy: req.user!.userId, ...auditFromReq(req) });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ---- Settings ----
router.get('/settings', async (req: AuthRequest, res, next) => {
  try {
    const rows = await prisma.settings.findMany();
    const map: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({ success: true, data: { ...DEFAULT_RULES, ...map } });
  } catch (e) { next(e); }
});

router.put('/settings/:key', requireRole('ADMIN', 'SUPER_ADMIN'), validateBody(z.object({ value: z.string().min(1) })), async (req: AuthRequest, res, next) => {
  try {
    const old = await prisma.settings.findUnique({ where: { key: req.params.key } });
    const row = await prisma.settings.upsert({
      where: { key: req.params.key },
      update: { value: req.body.value, updated_by: req.user!.userId },
      create: { key: req.params.key, value: req.body.value, updated_by: req.user!.userId },
    });
    await audit({ tableName: 'Settings', recordId: req.params.key, action: 'UPDATE', changedBy: req.user!.userId, oldValue: old?.value, newValue: row.value, ...auditFromReq(req) });
    res.json({ success: true, data: row });
  } catch (e) { next(e); }
});

// ---- Audit log (read-only for all roles, no update/delete routes exist) ----
router.get('/audit-log', requireRole('HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const { table, from, to } = req.query as { table?: string; from?: string; to?: string };
    const rows = await prisma.auditLog.findMany({
      where: {
        ...(table ? { table_name: table } : {}),
        ...(from || to ? { changed_at: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
      },
      include: { changedByUser: { select: { name: true } } },
      orderBy: { changed_at: 'desc' },
      take: 300,
    });
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

// ---- Notifications ----
router.get('/notifications', async (req: AuthRequest, res, next) => {
  try {
    const rows = await prisma.notification.findMany({
      where: { user_id: req.user!.userId },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.put('/notifications/:id/read', async (req: AuthRequest, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { notification_id: req.params.id, user_id: req.user!.userId },
      data: { read_at: new Date() },
    });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ---- Defaulters (analytics) ----
router.get('/analytics/defaulters', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const settings = await prisma.settings.findUnique({ where: { key: 'minimum_attendance_percentage' } });
    const min = settings ? Number(settings.value) : 75;
    const students = await prisma.student.findMany({ include: { section: true } });
    const { computeStudentSummary } = await import('../services/attendance.service');
    const defaulters = [];
    for (const s of students) {
      const summary = await computeStudentSummary(s.student_id);
      if (summary.overall.percentage !== null && summary.overall.percentage < min) {
        defaulters.push({
          student_id: s.student_id, name: s.name, roll_no: s.roll_no,
          section: s.section.section_name, percentage: summary.overall.percentage,
        });
      }
    }
    res.json({ success: true, data: { minimum: min, defaulters } });
  } catch (e) { next(e); }
});

export default router;
