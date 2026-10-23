// Institutional metadata is readable, but only the server-evaluated camera flow can enroll a face.
import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.middleware';
import { httpError } from '../middleware/error.middleware';
import { staffStudentScope } from '../services/roster.service';
import { lockStudent } from '../services/rfid.service';
import { FACE_MODEL } from '../services/faceEvidence.service';
const router = Router();
router.use(authMiddleware);
router.post(['/biometric', '/biometric/reenroll'], requireRole('TEACHER','HOD','ADMIN','SUPER_ADMIN'), (_req, _res, next) => {
  next(httpError(410, 'Update Threshold and use supervised camera enrollment. Checkbox confirmations cannot create a face identity.'));
});
router.put('/biometric/:studentId/revoke', requireRole('HOD','ADMIN','SUPER_ADMIN'), async (req: AuthRequest,res,next) => {
  try {
    await prisma.$transaction(async (tx) => {
      const student = await tx.student.findFirst({ where: { AND: [{ student_id: req.params.studentId }, await staffStudentScope(tx, req.user!)] } });
      if (!student) throw httpError(404,'Student not found in your scope');
      await lockStudent(tx, student.student_id);
      const enrollment = await tx.biometricEnrollment.findUnique({ where: { student_id: student.student_id } });
      if (!enrollment) throw httpError(404,'No enrollment to revoke');
      await tx.biometricEnrollment.update({ where: { enrollment_id: enrollment.enrollment_id }, data: { status: 'revoked', revoked_at: new Date(),
        face_ciphertext: null, face_model: null, face_captured_at: null, biometric_version: { increment: 1 } } });
      await tx.student.update({ where: { student_id: student.student_id }, data: { enrollment_trust_state: 'REQUIRES_REENROLLMENT' } });
      await tx.faceRequirement.updateMany({ where: { student_id: student.student_id, deadline_at: { gt: new Date() } }, data: { join_passed_at: null, spot_passed_at: null } });
      await tx.faceChallenge.updateMany({ where: { student_id: student.student_id, state: { in: ['pending','processing'] } }, data: { state: 'cancelled' } });
      await tx.auditLog.create({ data: { table_name: 'BiometricEnrollment', record_id: enrollment.enrollment_id, action: 'BIOMETRIC_REVOCATION', changed_by: req.user!.userId,
        new_value: { student_id: student.student_id, template_deleted: true } } });
    });
    res.json({success:true});
  } catch(e) {next(e);}
});
router.get('/biometric/:studentId', async(req:AuthRequest,res,next)=>{
  try {
    const scope = req.user!.role === 'STUDENT' ? {student_id:req.user!.studentId || ''} : await staffStudentScope(prisma,req.user!);
    const student=await prisma.student.findFirst({where:{AND:[{student_id:req.params.studentId},scope]},include:{biometricEnrollment:true}});
    if(!student) throw httpError(404,'Student not found in your scope');
    const e=student.biometricEnrollment;
    res.json({success:true,data:{enrollment_trust_state:student.enrollment_trust_state,enrollment:e?{
      status:e.status,method:e.enrollment_method,biometric_version:e.biometric_version,
      hasFace:e.status==='active' && e.face_model===FACE_MODEL && !!e.face_ciphertext, faceCapturedAt:e.face_captured_at,
    }:null}});
  }catch(e){next(e);}
});
export default router;
