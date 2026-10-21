
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main(){
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Demo attendance repair is for disposable local data only. Explicitly set ALLOW_DEMO_SEED=true.');
  }
  const students = await prisma.student.findMany();
  const atts = await prisma.attendance.findMany({ include: { session: true } });
  const pct = { 'CSA001': 85, 'CSA002': 92, 'CSA003': 60, 'CSA004': 74 };
  let i = 0;
  for (const a of atts) {
    const roll = students.find(s=>s.student_id===a.student_id)?.roll_no || 'CSA001';
    const target = pct[roll] ?? 80;
    // deterministic pseudo-random per row
    const h = (i * 137 + a.student_id.charCodeAt(0) + new Date(a.session.date).getDate() * 31) % 100;
    const status = h < target ? 'present' : 'absent';
    if (status !== a.status) await prisma.attendance.update({ where: { attendance_id: a.attendance_id }, data: { status } });
    i++;
  }
  // add a pending correction for Aarav on an absent record
  const aarav = students.find(s=>s.roll_no==='CSA001')!;
  const absent = await prisma.attendance.findFirst({ where: { student_id: aarav.student_id, status: 'absent' } });
  const user = await prisma.user.findFirst({ where: { email: 'student@att.edu' } });
  if (absent && user) {
    const existing = await prisma.attendanceCorrection.count();
    if (!existing) await prisma.attendanceCorrection.create({ data: {
      attendance_id: absent.attendance_id, requested_by: user.user_id,
      old_status: 'absent', requested_status: 'medical', reason: 'Was hospitalized, have medical certificate' } });
  }
  console.log('fixed', i, 'rows');
}
main().finally(()=>prisma.$disconnect());
