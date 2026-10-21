import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Demo seed is destructive. Use a disposable local database and explicitly set ALLOW_DEMO_SEED=true.');
  }
  const demoPassword = process.env.DEMO_SEED_PASSWORD;
  if (!demoPassword || demoPassword.length < 12) throw new Error('Set DEMO_SEED_PASSWORD to a development-only password of at least 12 characters');
  console.log('🌱 Seeding…');
  const hash = await bcrypt.hash(demoPassword, 12);

  // wipe (dev seed)
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "AuditLog", "Notification", "AttendanceQRSession", "AttendanceCorrection", "Attendance", "ClassSession", "Timetable", "Enrollment", "SubjectTeacher", "Leave", "Settings", "Student", "Teacher", "Section", "Subject", "Course", "Semester", "AcademicYear", "Department", "User" CASCADE`);

  // ---- Users (5 roles) ----
  const superAdmin = await prisma.user.create({ data: { name: 'System Admin', email: 'superadmin@att.edu', password_hash: hash, role: 'SUPER_ADMIN' } });
  const admin = await prisma.user.create({ data: { name: 'College Admin', email: 'admin@att.edu', password_hash: hash, role: 'ADMIN' } });
  const hodUser = await prisma.user.create({ data: { name: 'Dr. Meera HOD', email: 'hod@att.edu', password_hash: hash, role: 'HOD' } });
  const teacherUser = await prisma.user.create({ data: { name: 'Prof. Rahul Verma', email: 'teacher@att.edu', password_hash: hash, role: 'TEACHER' } });
  const teacher2User = await prisma.user.create({ data: { name: 'Prof. Anjali Rao', email: 'teacher2@att.edu', password_hash: hash, role: 'TEACHER' } });
  const studentUser = await prisma.user.create({ data: { name: 'Aarav Sharma', email: 'student@att.edu', password_hash: hash, role: 'STUDENT' } });

  const extraStudentUsers = await Promise.all(
    ['Neha Gupta', 'Vikram Singh', 'Priya Patel'].map((name, i) =>
      prisma.user.create({ data: { name, email: `student${i + 2}@att.edu`, password_hash: hash, role: 'STUDENT' } })
    )
  );

  // ---- Org structure ----
  const department = await prisma.department.create({ data: { name: 'Computer Science', code: 'CSE' } });
  const hod = await prisma.teacher.create({ data: { user_id: hodUser.user_id, name: 'Dr. Meera HOD', employee_id: 'EMP000', department_id: department.department_id } });
  await prisma.department.update({ where: { department_id: department.department_id }, data: { hod_id: hod.teacher_id } });

  const t1 = await prisma.teacher.create({ data: { user_id: teacherUser.user_id, name: 'Prof. Rahul Verma', employee_id: 'EMP001', department_id: department.department_id } });
  const t2 = await prisma.teacher.create({ data: { user_id: teacher2User.user_id, name: 'Prof. Anjali Rao', employee_id: 'EMP002', department_id: department.department_id } });

  const ay = await prisma.academicYear.create({ data: { name: '2026-27', start_date: new Date('2026-07-01'), end_date: new Date('2027-05-31'), is_current: true } });
  const sem = await prisma.semester.create({ data: { academic_year_id: ay.academic_year_id, semester_number: 3, start_date: new Date('2026-07-01'), end_date: new Date('2026-12-15') } });

  const course = await prisma.course.create({ data: { course_name: 'B.Tech CSE', course_code: 'BTCSE', department_id: department.department_id, duration_years: 4 } });
  const section = await prisma.section.create({ data: { section_name: 'CS-A', course_id: course.course_id, semester_id: sem.semester_id } });

  const subjects = await Promise.all([
    prisma.subject.create({ data: { subject_code: 'CS301', subject_name: 'Data Structures', course_id: course.course_id, semester_id: sem.semester_id, credits: 4 } }),
    prisma.subject.create({ data: { subject_code: 'CS302', subject_name: 'Operating Systems', course_id: course.course_id, semester_id: sem.semester_id, credits: 3 } }),
    prisma.subject.create({ data: { subject_code: 'CS303L', subject_name: 'DS Lab', course_id: course.course_id, semester_id: sem.semester_id, credits: 2, type: 'lab' } }),
  ]);

  await Promise.all(subjects.map((s, i) =>
    prisma.subjectTeacher.create({ data: { subject_id: s.subject_id, teacher_id: i === 2 ? t2.teacher_id : t1.teacher_id, section_id: section.section_id } })
  ));

  // ---- Students ----
  const student = await prisma.student.create({
    data: { user_id: studentUser.user_id, name: 'Aarav Sharma', roll_no: 'CSA001', email: 'student@att.edu', course_id: course.course_id, section_id: section.section_id },
  });
  const extraStudents = await Promise.all(extraStudentUsers.map((u, i) =>
    prisma.student.create({
      data: { user_id: u.user_id, name: u.name, roll_no: `CSA00${i + 2}`, email: u.email, course_id: course.course_id, section_id: section.section_id },
    })
  ));
  const allStudents = [student, ...extraStudents];

  // ---- Enrollments ----
  for (const s of allStudents) {
    for (const sub of subjects) {
      await prisma.enrollment.create({
        data: { student_id: s.student_id, subject_id: sub.subject_id, semester_id: sem.semester_id, section_id: section.section_id, enrolled_at: new Date('2026-07-01') },
      });
    }
  }

  // ---- Timetable (Mon-Fri slots) ----
  const slots = [
    { day: 'Mon', start: '09:00', end: '10:00', subject: subjects[0], teacher: t1.teacher_id, room: 'L101' },
    { day: 'Mon', start: '10:00', end: '11:00', subject: subjects[1], teacher: t1.teacher_id, room: 'L102' },
    { day: 'Tue', start: '09:00', end: '10:00', subject: subjects[2], teacher: t2.teacher_id, room: 'LAB1' },
    { day: 'Wed', start: '09:00', end: '10:00', subject: subjects[0], teacher: t1.teacher_id, room: 'L101' },
    { day: 'Thu', start: '11:00', end: '12:00', subject: subjects[1], teacher: t1.teacher_id, room: 'L102' },
  ] as const;

  const timetableRows = [];
  for (const s of slots) {
    timetableRows.push(await prisma.timetable.create({
      data: {
        subject_id: s.subject.subject_id, section_id: section.section_id, teacher_id: s.teacher,
        day_of_week: s.day as any, start_time: s.start, end_time: s.end, room_no: s.room,
        session_type: s.subject.type === 'lab' ? 'lab' : 'lecture',
      },
    }));
  }

  // ---- Settings ----
  for (const [key, value] of Object.entries({
    minimum_attendance_percentage: '75',
    late_counts_present: 'true',
    on_duty_counts_present: 'true',
    exclude_medical_from_denominator: 'true',
    exclude_excused_from_denominator: 'true',
    submission_edit_window_minutes: '30',
    auto_lock_enabled: 'true',
  })) {
    await prisma.settings.create({ data: { key, value, updated_by: admin.user_id } });
  }

  // ---- Historical sessions + attendance (last 3 weeks) ----
  let made = 0;
  for (let d = 21; d >= 1; d--) {
    const date = new Date();
    date.setDate(date.getDate() - d);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = dayNames[date.getDay()];
    const daySlots = slots.filter((s) => s.day === dayName);
    for (const slot of daySlots) {
      const tt = timetableRows.find((t) => t.subject_id === slot.subject.subject_id && t.start_time === slot.start)!;
      const session = await prisma.classSession.create({
        data: {
          timetable_id: tt.timetable_id, subject_id: slot.subject.subject_id, section_id: section.section_id,
          teacher_id: slot.teacher, date, start_time: slot.start, end_time: slot.end,
          session_type: slot.subject.type === 'lab' ? 'lab' : 'lecture', status: 'locked',
        },
      });
      for (const s of allStudents) {
        // deterministic pattern: Aarav ~85%, others ~65-95%
        const seed = (made + s.roll_no.charCodeAt(4) + d) % 100;
        const threshold = s.roll_no === 'CSA001' ? 85 : s.roll_no === 'CSA003' ? 60 : 75;
        const status = seed < threshold ? 'present' : 'absent';
        await prisma.attendance.create({
          data: { session_id: session.session_id, student_id: s.student_id, status: status as any, marked_by: teacherUser.user_id, method: 'manual' },
        });
      }
      made++;
    }
  }

  // ---- Today's open session for teacher demo ----
  const today = new Date();
  const todayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][today.getDay()];
  const todaySlots = slots.filter((s) => s.day === todayName);
  let openSession = null;
  if (todaySlots.length) {
    const slot = todaySlots[0];
    const tt = timetableRows.find((t) => t.subject_id === slot.subject.subject_id && t.start_time === slot.start)!;
    openSession = await prisma.classSession.create({
      data: {
        timetable_id: tt.timetable_id, subject_id: slot.subject.subject_id, section_id: section.section_id,
        teacher_id: slot.teacher, date: today, start_time: slot.start, end_time: slot.end,
        session_type: slot.subject.type === 'lab' ? 'lab' : 'lecture', status: 'open',
      },
    });
  } else {
    // fallback: make an open session today regardless of day
    openSession = await prisma.classSession.create({
      data: {
        subject_id: subjects[0].subject_id, section_id: section.section_id, teacher_id: t1.teacher_id,
        date: today, start_time: '09:00', end_time: '10:00', status: 'open',
      },
    });
  }

  // ---- A pending leave + pending correction for HOD demo ----
  await prisma.leave.create({
    data: {
      student_id: student.student_id,
      from_date: new Date(Date.now() + 3 * 864e5), to_date: new Date(Date.now() + 5 * 864e5),
      reason: 'Family function out of town',
    },
  });

  const someAtt = await prisma.attendance.findFirst({
    where: { student_id: student.student_id, status: 'absent' },
    include: { session: true },
  });
  if (someAtt) {
    await prisma.attendanceCorrection.create({
      data: {
        attendance_id: someAtt.attendance_id, requested_by: studentUser.user_id,
        old_status: 'absent', requested_status: 'medical', reason: 'Was hospitalized, have medical certificate',
      },
    });
  }

  console.log(`✅ Seed complete: ${allStudents.length} students, ${made} past sessions, 1 open session today`);
  console.log('   Development logins use your DEMO_SEED_PASSWORD:');
  console.log('   superadmin@att.edu | admin@att.edu | hod@att.edu | teacher@att.edu | teacher2@att.edu | student@att.edu');
}

main().finally(() => prisma.$disconnect());
