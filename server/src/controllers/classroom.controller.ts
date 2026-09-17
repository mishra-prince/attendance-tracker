import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.middleware';
import { httpError } from '../middleware/error.middleware';
import { audit, auditFromReq } from '../services/audit.service';
import { flagEnabled } from './features.controller';

const router = Router();
router.use(authMiddleware);

function makeCode(): string {
  // 6-char unambiguous code (no 0/O/1/I)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += alphabet[Math.floor(Math.random() * alphabet.length)];
  return c;
}

// POST /classroom/generate-code  { sectionId, expiresInHours? }  (TEACHER/HOD/ADMIN)
router.post('/generate-code', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    if (!(await flagEnabled('join_codes'))) throw httpError(403, 'Join codes feature is disabled');
    const { sectionId, expiresInHours } = req.body as { sectionId?: string; expiresInHours?: number };
    if (!sectionId) throw httpError(400, 'sectionId required');

    const section = await prisma.section.findUnique({ where: { section_id: sectionId }, include: { course: true } });
    if (!section) throw httpError(404, 'Section not found');

    // Retry up to 5 times for a unique code
    let code = '';
    for (let i = 0; i < 5; i++) {
      const candidate = makeCode();
      const exists = await prisma.section.findFirst({ where: { join_code: candidate } });
      if (!exists) { code = candidate; break; }
    }
    if (!code) throw httpError(500, 'Could not generate unique code, try again');

    const expiresAt = expiresInHours && expiresInHours > 0
      ? new Date(Date.now() + expiresInHours * 3600_000)
      : null;

    const updated = await prisma.section.update({
      where: { section_id: sectionId },
      data: { join_code: code, join_code_expires_at: expiresAt },
    });
    await audit({ tableName: 'Section', recordId: sectionId, action: 'UPDATE', changedBy: req.user!.userId, newValue: { join_code: code }, ...auditFromReq(req) });
    res.json({ success: true, data: { code, section: updated } });
  } catch (e) { next(e); }
});

// GET /classroom/my-code?sectionId=...  (TEACHER/HOD/ADMIN — view current code without regenerating)
router.get('/my-code', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    if (!(await flagEnabled('join_codes'))) throw httpError(403, 'Join codes feature is disabled');
    const { sectionId } = req.query as { sectionId?: string };
    if (!sectionId) throw httpError(400, 'sectionId required');
    const section = await prisma.section.findUnique({ where: { section_id: sectionId } });
    if (!section) throw httpError(404, 'Section not found');
    res.json({ success: true, data: { code: section.join_code, expires_at: section.join_code_expires_at } });
  } catch (e) { next(e); }
});

// POST /classroom/join  { code }  (STUDENT) — enrolls student into the section's subjects for current semester
router.post('/join', requireRole('STUDENT'), async (req: AuthRequest, res, next) => {
  try {
    if (!(await flagEnabled('join_codes'))) throw httpError(403, 'Join codes feature is disabled');
    const { code } = req.body as { code?: string };
    if (!code) throw httpError(400, 'code required');

    const section = await prisma.section.findFirst({ where: { join_code: code.trim().toUpperCase() } });
    if (!section) throw httpError(404, 'Invalid code');
    if (section.join_code_expires_at && section.join_code_expires_at < new Date()) throw httpError(410, 'Code expired — ask your teacher for a new one');

    const student = await prisma.student.findFirst({ where: { user_id: req.user!.userId } });
    if (!student) throw httpError(403, 'No student profile');
    if (student.section_id === section.section_id) throw httpError(409, 'You are already in this section');

    const semester = await prisma.semester.findFirst({
      where: { sections: { some: { section_id: section.section_id } } },
      orderBy: { start_date: 'desc' },
    });
    const subjects = await prisma.subject.findMany({
      where: semester ? { semester_id: semester.semester_id, course_id: section.course_id } : { course_id: section.course_id },
    });

    // Move student into section + enroll into section subjects (skip existing)
    await prisma.student.update({ where: { student_id: student.student_id }, data: { section_id: section.section_id } });
    let enrolled = 0;
    for (const subj of subjects) {
      const exists = await prisma.enrollment.findFirst({ where: { student_id: student.student_id, subject_id: subj.subject_id } });
      if (!exists) {
        await prisma.enrollment.create({ data: {
          student_id: student.student_id, subject_id: subj.subject_id,
          semester_id: subj.semester_id, section_id: section.section_id,
        } });
        enrolled++;
      }
    }
    await audit({ tableName: 'Enrollment', recordId: student.student_id, action: 'CREATE', changedBy: req.user!.userId, newValue: { via: 'join_code', section: section.section_id, enrolled }, ...auditFromReq(req) });
    res.json({ success: true, data: { joined: section.section_name, enrolled } });
  } catch (e) { next(e); }
});

export default router;
