import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

let db: PGlite;
let socket: PGLiteSocketServer;
let appServer: Server;
let prisma: PrismaClient;
let base: string;
const ids = Object.fromEntries(['teacherUser', 'teacher', 'otherTeacherUser', 'otherTeacher', 'studentUser', 'student', 'department', 'course', 'year', 'semester', 'section', 'otherSection', 'subject', 'timetable'].map((key) => [key, randomUUID()]));
let teacherToken: string, otherTeacherToken: string, studentToken: string;
let bleId: string, classId: string, beacon: string;
const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'Threshold' };
async function request(path: string, token?: string, body?: unknown, cookie?: string) {
  return fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...headers, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function login(email: string) {
  const response = await request('/api/auth/login', undefined, { email, password: 'TestPassword!123', portal: email.startsWith('student') ? 'student' : 'staff' });
  expect(response.status).toBe(200);
  return { ...((await response.json()).data), cookie: response.headers.get('set-cookie')!.split(';')[0] };
}
beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', 'integration-access-secret-long-enough-123456789');
  vi.stubEnv('JWT_REFRESH_SECRET', 'integration-refresh-secret-different-123456789');
  vi.stubEnv('BLE_BEACON_SECRET', 'integration-beacon-secret-long-enough-123456789');
  vi.stubEnv('NODE_ENV', 'test');
  db = await PGlite.create();
  for (const file of ['20260916052028_init', '20261020120000_bluetooth_and_sessions']) {
    await db.exec(await readFile(new URL('../prisma/migrations/' + file + '/migration.sql', import.meta.url), 'utf8'));
  }
  socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 5549 });
  await socket.start();
  vi.stubEnv('DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:5549/postgres?connection_limit=1');
  prisma = (await import('../src/utils/prisma')).prisma;
  await prisma.$connect();
  const password_hash = await bcrypt.hash('TestPassword!123', 4);
  for (const [user_id, email, role] of [[ids.teacherUser, 'teacher@test.invalid', 'TEACHER'], [ids.otherTeacherUser, 'other@test.invalid', 'TEACHER'], [ids.studentUser, 'student@test.invalid', 'STUDENT']] as const) {
    await prisma.user.create({ data: { user_id, name: email.split('@')[0], email, role, password_hash } });
  }
  await prisma.department.create({ data: { department_id: ids.department, name: 'Test Department', code: 'TEST' } });
  await prisma.academicYear.create({ data: { academic_year_id: ids.year, name: 'Test Year', start_date: new Date('2026-01-01'), end_date: new Date('2026-12-31') } });
  await prisma.semester.create({ data: { semester_id: ids.semester, academic_year_id: ids.year, semester_number: 1, start_date: new Date('2026-01-01'), end_date: new Date('2026-12-31') } });
  await prisma.course.create({ data: { course_id: ids.course, course_name: 'Test Course', course_code: 'TC', department_id: ids.department, duration_years: 4 } });
  for (const section_id of [ids.section, ids.otherSection]) await prisma.section.create({ data: { section_id, section_name: section_id, course_id: ids.course, semester_id: ids.semester } });
  for (const [teacher_id, user_id] of [[ids.teacher, ids.teacherUser], [ids.otherTeacher, ids.otherTeacherUser]]) await prisma.teacher.create({ data: { teacher_id, user_id, name: 'Test teacher', employee_id: teacher_id, department_id: ids.department } });
  await prisma.subject.create({ data: { subject_id: ids.subject, subject_code: 'TS', subject_name: 'Test Subject', course_id: ids.course, semester_id: ids.semester, credits: 3 } });
  await prisma.subjectTeacher.create({ data: { subject_id: ids.subject, teacher_id: ids.teacher, section_id: ids.section } });
  await prisma.student.create({ data: { student_id: ids.student, user_id: ids.studentUser, name: 'Test Student', roll_no: 'T001', email: 'student@test.invalid', course_id: ids.course, section_id: ids.section } });
  await prisma.enrollment.create({ data: { student_id: ids.student, subject_id: ids.subject, section_id: ids.section, semester_id: ids.semester, enrolled_at: new Date('2026-01-01') } });
  await prisma.timetable.create({ data: { timetable_id: ids.timetable, subject_id: ids.subject, section_id: ids.section, teacher_id: ids.teacher, day_of_week: 'Tue', start_time: '09:00', end_time: '10:00', room_no: '101' } });
  const app = (await import('../src/app')).default;
  appServer = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => appServer.once('listening', resolve));
  base = 'http://127.0.0.1:' + (appServer.address() as { port: number }).port;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-20T04:00:00Z'));
  teacherToken = (await login('teacher@test.invalid')).accessToken;
  otherTeacherToken = (await login('other@test.invalid')).accessToken;
  studentToken = (await login('student@test.invalid')).accessToken;
}, 60000);

afterAll(async () => {
  vi.useRealTimers();
  await new Promise<void>((resolve) => appServer?.close(() => resolve()) ?? resolve());
  await prisma?.$disconnect();
  await socket?.stop();
  await db?.close();
  vi.unstubAllEnvs();
});

describe.sequential('Attendance API security and migration regression', () => {
  it('builds all previously missing Bluetooth, identity and refresh tables', async () => {
    expect(await prisma.blePing.count()).toBe(0);
    expect(await prisma.biometricEnrollment.count()).toBe(0);
    expect(await prisma.refreshSession.count()).toBe(3);
  });
  it('requires the application header for cookie operations', async () => {
    const response = await fetch(base + '/api/auth/logout', { method: 'POST' });
    expect(response.status).toBe(403);
  });
  it('rejects bad credentials and a student trying to enter the staff portal', async () => {
    expect((await request('/api/auth/login', undefined, { email: 'student@test.invalid', password: 'wrong' })).status).toBe(401);
    expect((await request('/api/auth/login', undefined, { email: 'student@test.invalid', password: 'TestPassword!123', portal: 'staff' })).status).toBe(403);
  });
  it('rotates refresh cookies and revokes the session on replay', async () => {
    const auth = await login('student@test.invalid');
    const refreshed = await request('/api/auth/refresh', undefined, {}, auth.cookie);
    expect(refreshed.status).toBe(200);
    const nextCookie = refreshed.headers.get('set-cookie')!.split(';')[0];
    expect(nextCookie).not.toBe(auth.cookie);
    expect((await request('/api/auth/refresh', undefined, {}, auth.cookie)).status).toBe(401);
    expect((await request('/api/ble/status', auth.accessToken)).status).toBe(401);
  });
  it('revokes active access immediately when signing out', async () => {
    const auth = await login('student@test.invalid');
    expect((await request('/api/auth/logout', undefined, {}, auth.cookie)).status).toBe(200);
    expect((await request('/api/ble/status', auth.accessToken)).status).toBe(401);
  });
  it('rejects invalid and expired access tokens', async () => {
    expect((await request('/api/ble/status', 'not-a-token')).status).toBe(401);
    vi.setSystemTime(new Date('2026-10-20T04:16:00Z'));
    expect((await request('/api/ble/status', studentToken)).status).toBe(401);
    vi.setSystemTime(new Date('2026-10-20T04:00:00Z'));
  });
  it('limits class start to the assigned teacher and rejects students', async () => {
    expect((await request('/api/ble/start-session', otherTeacherToken, { timetableId: ids.timetable })).status).toBe(403);
    expect((await request('/api/ble/start-session', studentToken, { timetableId: ids.timetable })).status).toBe(403);
  });
  it('rejects out-of-hours starts, creates one class, and rejects duplicate starts', async () => {
    vi.setSystemTime(new Date('2026-10-20T02:00:00Z'));
    expect((await request('/api/ble/start-session', teacherToken, { timetableId: ids.timetable })).status).toBe(409);
    vi.setSystemTime(new Date('2026-10-20T04:00:00Z'));
    const response = await request('/api/ble/start-session', teacherToken, { timetableId: ids.timetable });
    expect(response.status).toBe(201);
    const body = (await response.json()).data;
    bleId = body.session_id; classId = body.class_session_id;
    expect(body.required_minutes).toBe(33);
    expect((await request('/api/ble/start-session', teacherToken, { timetableId: ids.timetable })).status).toBe(409);
    beacon = (await (await request('/api/ble/my-session', teacherToken)).json()).data.beacon_id;
  });
  it('rejects malformed strength and ignores weak readings', async () => {
    expect((await request('/api/ble/scan', studentToken, { beaconId: beacon, rssi: 20 })).status).toBe(400);
    const weak = await request('/api/ble/scan', studentToken, { beaconId: beacon, rssi: -100 });
    expect((await weak.json()).data.reason).toBe('signal_too_weak');
    expect(await prisma.blePing.count()).toBe(0);
  });
  it('rejects a student from a different section and a dropped enrollment', async () => {
    await prisma.student.update({ where: { student_id: ids.student }, data: { section_id: ids.otherSection } });
    expect((await request('/api/ble/scan', studentToken, { beaconId: beacon, rssi: -50 })).status).toBe(404);
    await prisma.student.update({ where: { student_id: ids.student }, data: { section_id: ids.section } });
    await prisma.enrollment.updateMany({ where: { student_id: ids.student }, data: { status: 'dropped' } });
    expect((await request('/api/ble/scan', studentToken, { beaconId: beacon, rssi: -50 })).status).toBe(403);
    await prisma.enrollment.updateMany({ where: { student_id: ids.student }, data: { status: 'active' } });
  });
  it('deduplicates a repeated signal and does not award dwell for a single sighting', async () => {
    const first = await request('/api/ble/scan', studentToken, { beaconId: beacon, rssi: -50 });
    expect((await first.json()).data.recorded).toBe(true);
    const second = await request('/api/ble/scan', studentToken, { beaconId: beacon, rssi: -50 });
    expect((await second.json()).data.reason).toBe('already_recorded');
    expect(await prisma.blePing.count()).toBe(1);
    const status = (await (await request('/api/ble/status', studentToken)).json()).data;
    expect(status.dwell_minutes).toBe(0); expect(status.secured).toBe(false);
  });
  it('rejects stale beacons and observations after class hours', async () => {
    vi.setSystemTime(new Date('2026-10-20T04:01:00Z'));
    expect((await request('/api/ble/scan', studentToken, { beaconId: beacon, rssi: -50 })).status).toBe(404);
    vi.setSystemTime(new Date('2026-10-20T04:00:00Z'));
  });
  it('keeps insufficient evidence unmarked for teacher review, with an atomic audited finalization', async () => {
    expect((await request('/api/ble/finalize/' + bleId, otherTeacherToken, {})).status).toBe(403);
    const response = await request('/api/ble/finalize/' + bleId, teacherToken, {});
    expect(response.status).toBe(200);
    expect((await response.json()).data.review_required).toBe(1);
    expect(await prisma.attendance.count({ where: { session_id: classId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'BLE_FINALIZE', record_id: classId } })).toBe(1);
    expect((await request('/api/ble/finalize/' + bleId, teacherToken, {})).status).toBe(409);
    expect((await request('/api/ble/scan', studentToken, { beaconId: beacon, rssi: -50 })).status).toBe(404);
  });
  it('records a qualifying student, preserves manual decisions, and rolls back on audit failure', async () => {
    const cs = await prisma.classSession.create({ data: { subject_id: ids.subject, section_id: ids.section, teacher_id: ids.teacher, date: new Date('2026-10-20'), start_time: '09:00', end_time: '10:00', status: 'open' } });
    const ble = await prisma.bleSession.create({ data: { class_session_id: cs.session_id, subject_id: ids.subject, section_id: ids.section, teacher_id: ids.teacher, date: new Date('2026-10-20'), start_time: '09:00', end_time: '10:00', beacon_nonce: randomUUID(), required_minutes: 1 } });
    await prisma.blePing.createMany({ data: [0, 30, 60].map((offset) => ({ session_id: ble.session_id, student_id: ids.student, rssi: -50, seen_at: new Date(new Date('2026-10-20T03:30:00Z').getTime() + offset * 1000) })) });
    await db.exec(`CREATE FUNCTION reject_finalize_audit() RETURNS trigger AS $$ BEGIN IF NEW.action = 'BLE_FINALIZE' THEN RAISE EXCEPTION 'test audit unavailable'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_finalize BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_finalize_audit();`);
    expect((await request('/api/ble/finalize/' + ble.session_id, teacherToken, {})).status).toBe(500);
    expect(await prisma.attendance.count({ where: { session_id: cs.session_id } })).toBe(0);
    expect((await prisma.bleSession.findUniqueOrThrow({ where: { session_id: ble.session_id } })).status).toBe('active');
    await db.exec('DROP TRIGGER reject_finalize ON "AuditLog"; DROP FUNCTION reject_finalize_audit();');
    const response = await request('/api/ble/finalize/' + ble.session_id, teacherToken, {});
    expect((await response.json()).data.present).toBe(1);
    expect((await prisma.attendance.findFirstOrThrow({ where: { session_id: cs.session_id } })).status).toBe('present');

    const next = await prisma.classSession.create({ data: { subject_id: ids.subject, section_id: ids.section, teacher_id: ids.teacher, date: new Date('2026-10-20'), start_time: '09:00', end_time: '10:00', status: 'open' } });
    const nextBle = await prisma.bleSession.create({ data: { class_session_id: next.session_id, subject_id: ids.subject, section_id: ids.section, teacher_id: ids.teacher, date: new Date('2026-10-20'), start_time: '09:00', end_time: '10:00', beacon_nonce: randomUUID(), required_minutes: 1 } });
    await prisma.blePing.createMany({ data: [0, 30, 60].map((offset) => ({ session_id: nextBle.session_id, student_id: ids.student, rssi: -50, seen_at: new Date(new Date('2026-10-20T03:30:00Z').getTime() + offset * 1000) })) });
    await prisma.attendance.create({ data: { session_id: next.session_id, student_id: ids.student, status: 'medical', method: 'manual', marked_by: ids.teacherUser } });
    expect((await request('/api/ble/finalize/' + nextBle.session_id, teacherToken, {})).status).toBe(200);
    expect((await prisma.attendance.findFirstOrThrow({ where: { session_id: next.session_id } })).status).toBe('medical');
  });

  it('ends a class signal without changing a closed roster, while enforcing teacher ownership', async () => {
    const cs = await prisma.classSession.create({ data: { subject_id: ids.subject, section_id: ids.section, teacher_id: ids.teacher, date: new Date('2026-10-20'), start_time: '09:00', end_time: '10:00', status: 'locked' } });
    const ble = await prisma.bleSession.create({ data: { class_session_id: cs.session_id, subject_id: ids.subject, section_id: ids.section, teacher_id: ids.teacher, date: new Date('2026-10-20'), start_time: '09:00', end_time: '10:00', beacon_nonce: randomUUID() } });
    expect((await request('/api/ble/finalize/' + ble.session_id, teacherToken, {})).status).toBe(423);
    expect((await request('/api/ble/cancel/' + ble.session_id, otherTeacherToken, {})).status).toBe(403);
    expect((await request('/api/ble/cancel/' + ble.session_id, teacherToken, {})).status).toBe(200);
    expect((await prisma.classSession.findUniqueOrThrow({ where: { session_id: cs.session_id } })).status).toBe('locked');
    expect((await prisma.bleSession.findUniqueOrThrow({ where: { session_id: ble.session_id } })).status).toBe('cancelled');
    expect((await request('/api/ble/cancel/' + ble.session_id, teacherToken, {})).status).toBe(409);
  });
  it('rejects a valid rotating token after the scheduled end time', async () => {
    vi.setSystemTime(new Date('2026-10-20T04:30:00Z'));
    const auth = await login('student@test.invalid');
    const ble = await prisma.bleSession.create({ data: { subject_id: ids.subject, section_id: ids.section, teacher_id: ids.teacher, date: new Date('2026-10-20'), start_time: '09:00', end_time: '10:00', beacon_nonce: randomUUID() } });
    const { beaconIdFor } = await import('../src/services/bleEvidence.service');
    const token = beaconIdFor(ble, Math.floor(Date.now() / 30000), process.env.BLE_BEACON_SECRET!);
    expect((await request('/api/ble/scan', auth.accessToken, { beaconId: token, rssi: -50 })).status).toBe(409);
    expect(await prisma.blePing.count({ where: { session_id: ble.session_id } })).toBe(0);
    vi.setSystemTime(new Date('2026-10-20T04:00:00Z'));
  });


});
