import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { httpError } from '../middleware/error.middleware';
import { audit, auditFromReq } from '../services/audit.service';
import { notify } from '../services/notification.service';

const router = Router();
router.use(authMiddleware);

router.post('/leave', requireRole('STUDENT'), validateBody(z.object({
  fromDate: z.string(),
  toDate: z.string(),
  reason: z.string().min(3),
})), async (req: AuthRequest, res, next) => {
  try {
    const fromDate = new Date(req.body.fromDate);
    const toDate = new Date(req.body.toDate);
    if (toDate < fromDate) throw httpError(400, 'toDate before fromDate');
    if (!req.user!.studentId) throw httpError(403, 'Not a student profile');

    // reject overlapping pending/approved leaves for same student
    const overlap = await prisma.leave.findFirst({
      where: {
        student_id: req.user!.studentId,
        status: { in: ['pending', 'approved'] },
        from_date: { lte: toDate },
        to_date: { gte: fromDate },
      },
    });
    if (overlap) throw httpError(409, 'Overlapping leave request exists');

    const leave = await prisma.leave.create({
      data: { student_id: req.user!.studentId, from_date: fromDate, to_date: toDate, reason: req.body.reason },
    });
    await audit({ tableName: 'Leave', recordId: leave.leave_id, action: 'CREATE', changedBy: req.user!.userId, ...auditFromReq(req) });
    res.status(201).json({ success: true, data: leave });
  } catch (e) { next(e); }
});

router.get('/leave/student/:id', async (req: AuthRequest, res, next) => {
  try {
    if (req.user!.role === 'STUDENT' && req.user!.studentId !== req.params.id) {
      throw httpError(403, 'Forbidden');
    }
    const leaves = await prisma.leave.findMany({ where: { student_id: req.params.id }, orderBy: { created_at: 'desc' } });
    res.json({ success: true, data: leaves });
  } catch (e) { next(e); }
});

router.get('/leave', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const { status } = req.query as { status?: string };
    const leaves = await prisma.leave.findMany({
      where: status ? { status: status as any } : {},
      include: { student: { select: { name: true, roll_no: true, section_id: true } } },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    res.json({ success: true, data: leaves });
  } catch (e) { next(e); }
});

router.put('/leave/:id/approve', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const leave = await prisma.leave.findUnique({ where: { leave_id: req.params.id }, include: { student: true } });
    if (!leave) throw httpError(404, 'Leave not found');
    if (leave.status !== 'pending') throw httpError(409, 'Already reviewed');

    await prisma.leave.update({
      where: { leave_id: leave.leave_id },
      data: { status: 'approved', approved_by: req.user!.userId, approved_at: new Date() },
    });
    await notify({ userId: leave.student.user_id, studentId: leave.student_id, message: `Leave ${leave.from_date.toDateString()} → ${leave.to_date.toDateString()} approved`, type: 'leave_status' });
    await audit({ tableName: 'Leave', recordId: leave.leave_id, action: 'APPROVE', changedBy: req.user!.userId, ...auditFromReq(req) });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.put('/leave/:id/reject', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), validateBody(z.object({ reason: z.string().min(1) })), async (req: AuthRequest, res, next) => {
  try {
    const leave = await prisma.leave.findUnique({ where: { leave_id: req.params.id }, include: { student: true } });
    if (!leave) throw httpError(404, 'Leave not found');
    if (leave.status !== 'pending') throw httpError(409, 'Already reviewed');

    await prisma.leave.update({
      where: { leave_id: leave.leave_id },
      data: { status: 'rejected', rejection_reason: req.body.reason },
    });
    await notify({ userId: leave.student.user_id, studentId: leave.student_id, message: `Leave rejected: ${req.body.reason}`, type: 'leave_status' });
    await audit({ tableName: 'Leave', recordId: leave.leave_id, action: 'REJECT', changedBy: req.user!.userId, ...auditFromReq(req) });
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
