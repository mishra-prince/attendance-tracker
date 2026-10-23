import { Prisma } from '@prisma/client';
import { hashPassword } from '../utils/hash';
import { httpError } from '../middleware/error.middleware';
import type { AccessPayload } from '../utils/jwt';

type Tx = Prisma.TransactionClient;
export async function ensureSectionEnrollments(tx: Tx, sectionId: string) {
  const section = await tx.section.findUnique({ where: { section_id: sectionId } });
  if (!section) throw httpError(404, 'Section not found');
  const [students, subjects] = await Promise.all([
    tx.student.findMany({ where: { section_id: sectionId, user: { is_active: true } }, select: { student_id: true } }),
    tx.subject.findMany({ where: { course_id: section.course_id, semester_id: section.semester_id }, select: { subject_id: true } }),
  ]);
  // Existing dropped/completed enrollments remain explicit institutional decisions.
  return tx.enrollment.createMany({ data: students.flatMap((s) => subjects.map((subject) => ({
    student_id: s.student_id, subject_id: subject.subject_id, enrolled_at: new Date(), semester_id: section.semester_id, section_id: sectionId,
  }))), skipDuplicates: true });
}
export async function registerStudent(tx: Tx, input: {
  name: string; email: string; password: string; roll_no: string; section_id: string; course_id: string;
  phone?: string; parent_email?: string; parent_phone?: string;
}, actor: string) {
  const { password, ...data } = input;
  const section = await tx.section.findUnique({ where: { section_id: data.section_id } });
  if (!section || section.course_id !== data.course_id) throw httpError(400, 'Choose a section in the selected course');
  const user = await tx.user.create({ data: { name: data.name, email: data.email, role: 'STUDENT', password_hash: await hashPassword(password) } });
  const student = await tx.student.create({ data: { ...data, user_id: user.user_id } });
  const synced = await ensureSectionEnrollments(tx, section.section_id);
  await tx.auditLog.create({ data: { table_name: 'Student', record_id: student.student_id, action: 'CREATE', changed_by: actor,
    new_value: { name: student.name, roll_no: student.roll_no, section_id: student.section_id, enrollments_created: synced.count } } });
  return student;
}
export async function staffSessionScope(tx: Tx, user: AccessPayload): Promise<{ teacher_id?: string; section?: { course: { department_id: string } } }> {
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return {};
  if (user.role === 'TEACHER' && user.teacherId) return { teacher_id: user.teacherId };
  if (user.role === 'HOD' && user.teacherId) {
    const department = await tx.department.findUnique({ where: { hod_id: user.teacherId } });
    if (department) return { section: { course: { department_id: department.department_id } } };
  }
  throw httpError(403, 'No assigned staff scope');
}
export async function staffStudentScope(tx: Tx, user: AccessPayload): Promise<Prisma.StudentWhereInput> {
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return {};
  if (user.role === 'TEACHER' && user.teacherId) return { section: { subjectTeachers: { some: { teacher_id: user.teacherId } } } };
  if (user.role === 'HOD' && user.teacherId) {
    const department = await tx.department.findUnique({ where: { hod_id: user.teacherId } });
    if (department) return { course: { department_id: department.department_id } };
  }
  throw httpError(403, 'No assigned staff scope');
}
