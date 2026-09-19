// enrollment.controller.ts — biometric identity ROOT OF TRUST.
//
// See docs/BACKEND.md "Root of Trust". Initial enrollment is NOT ordinary authentication:
// it binds a biometric identity to an institutional student account and therefore REQUIRES
// an institution-approved verification step performed by authorized staff. An authenticated
// API call or a remote selfie upload ALONE is never sufficient.

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { httpError } from '../middleware/error.middleware';
import { audit, auditFromReq } from '../services/audit.service';

const router = Router();
router.use(authMiddleware);

const enrollSchema = z.object({
  studentId: z.string().min(1),
  enrollmentMethod: z.enum([
    'SUPERVISED_STAFF',
    'INSTITUTIONAL_ID_CARD',
    'REGISTRATION_RECORD',
    'TRUSTED_IDENTITY_SYSTEM',
    'BIOMETRIC_ENROLLMENT_STATION',
  ]),
  deviceId: z.string().optional(),
  // Liveness must be confirmed at capture time by the supervised station/app.
  livenessPassed: z.boolean(),
});

// POST /enrollment/biometric — INITIAL supervised enrollment (root-of-trust event).
// Only authorized staff (TEACHER/HOD/ADMIN/SUPER_ADMIN) may perform this, and it records
// WHO verified the institutional identity. A student cannot self-enroll their own biometric.
router.post('/biometric', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), validateBody(enrollSchema), async (req: AuthRequest, res, next) => {
  try {
    const { studentId, enrollmentMethod, deviceId, livenessPassed } = req.body;
    if (!livenessPassed) throw httpError(400, 'Liveness check must pass during supervised enrollment');

    const student = await prisma.student.findUnique({ where: { student_id: studentId }, include: { biometricEnrollment: true } });
    if (!student) throw httpError(404, 'Student not found');

    // Root-of-trust: refuse to silently replace an existing active identity here.
    if (student.biometricEnrollment && student.biometricEnrollment.status === 'active') {
      throw httpError(409, 'Active enrollment exists — use the re-enrollment recovery path');
    }

    const result = await prisma.$transaction(async (tx) => {
      const enrollment = await tx.biometricEnrollment.upsert({
        where: { student_id: studentId },
        update: {
          enrollment_method: enrollmentMethod,
          enrolled_by: req.user!.userId,
          device_id: deviceId,
          status: 'active',
          revoked_at: null,
          biometric_version: { increment: 1 } as any,
        },
        create: {
          student_id: studentId,
          enrollment_method: enrollmentMethod,
          enrolled_by: req.user!.userId,
          device_id: deviceId,
          status: 'active',
        },
      });
      await tx.student.update({ where: { student_id: studentId }, data: { enrollment_trust_state: 'ACTIVE' } });
      return enrollment;
    });

    await audit({
      tableName: 'BiometricEnrollment', recordId: result.enrollment_id, action: 'BIOMETRIC_ENROLLMENT',
      changedBy: req.user!.userId,
      newValue: { student_id: studentId, enrollment_method: enrollmentMethod, device_id: deviceId, biometric_version: result.biometric_version },
      ...auditFromReq(req),
    });

    res.status(201).json({ success: true, data: { enrollment_id: result.enrollment_id, status: result.status } });
  } catch (e) { next(e); }
});

// POST /enrollment/biometric/reenroll — authenticated recovery path (lost phone / new device).
// Must NOT let a student silently replace their identity template. Requires staff verification
// again (same authority as initial), revokes the old enrollment, issues a new one.
router.post('/biometric/reenroll', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), validateBody(enrollSchema), async (req: AuthRequest, res, next) => {
  try {
    const { studentId, enrollmentMethod, deviceId, livenessPassed } = req.body;
    if (!livenessPassed) throw httpError(400, 'Liveness check must pass during re-enrollment');

    const student = await prisma.student.findUnique({ where: { student_id: studentId }, include: { biometricEnrollment: true } });
    if (!student) throw httpError(404, 'Student not found');
    if (!student.biometricEnrollment) throw httpError(409, 'No prior enrollment — use initial enrollment');

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.biometricEnrollment.update({
        where: { student_id: studentId },
        data: {
          enrollment_method: enrollmentMethod,
          enrolled_by: req.user!.userId,
          device_id: deviceId,
          status: 'active',
          revoked_at: null,
          biometric_version: { increment: 1 },
        },
      });
      await tx.student.update({ where: { student_id: studentId }, data: { enrollment_trust_state: 'ACTIVE' } });
      return updated;
    });

    await audit({
      tableName: 'BiometricEnrollment', recordId: result.enrollment_id, action: 'BIOMETRIC_ENROLLMENT',
      changedBy: req.user!.userId,
      oldValue: { note: 'reenroll — old device/template revoked' },
      newValue: { student_id: studentId, device_id: deviceId, biometric_version: result.biometric_version },
      ...auditFromReq(req),
    });

    res.status(200).json({ success: true, data: { enrollment_id: result.enrollment_id, biometric_version: result.biometric_version } });
  } catch (e) { next(e); }
});

// PUT /enrollment/biometric/:studentId/revoke — admin/HOD revokes (marks REQUIRES_REENROLLMENT).
router.put('/biometric/:studentId/revoke', requireRole('HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const student = await prisma.student.findUnique({ where: { student_id: req.params.studentId }, include: { biometricEnrollment: true } });
    if (!student?.biometricEnrollment) throw httpError(404, 'No enrollment to revoke');

    await prisma.$transaction([
      prisma.biometricEnrollment.update({ where: { student_id: req.params.studentId }, data: { status: 'revoked', revoked_at: new Date() } }),
      prisma.student.update({ where: { student_id: req.params.studentId }, data: { enrollment_trust_state: 'REQUIRES_REENROLLMENT' } }),
    ]);

    await audit({
      tableName: 'BiometricEnrollment', recordId: student.biometricEnrollment.enrollment_id, action: 'BIOMETRIC_REVOCATION',
      changedBy: req.user!.userId, newValue: { revoked: true }, ...auditFromReq(req),
    });

    res.json({ success: true });
  } catch (e) { next(e); }
});

// GET /enrollment/biometric/:studentId — trust state (self or staff).
router.get('/biometric/:studentId', async (req: AuthRequest, res, next) => {
  try {
    if (req.user!.role === 'STUDENT' && req.user!.studentId !== req.params.studentId) {
      throw httpError(403, 'Forbidden');
    }
    const student = await prisma.student.findUnique({
      where: { student_id: req.params.studentId },
      include: { biometricEnrollment: true },
    });
    if (!student) throw httpError(404, 'Student not found');
    res.json({
      success: true,
      data: {
        enrollment_trust_state: student.enrollment_trust_state,
        enrollment: student.biometricEnrollment
          ? { status: student.biometricEnrollment.status, method: student.biometricEnrollment.enrollment_method, biometric_version: student.biometricEnrollment.biometric_version }
          : null,
      },
    });
  } catch (e) { next(e); }
});

export default router;
