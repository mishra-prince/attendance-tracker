import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { httpError } from '../middleware/error.middleware';
import { campusDate, sessionBounds } from './bleEvidence.service';
import { staffSessionScope } from './roster.service';
import type { AccessPayload } from '../utils/jwt';

type Tx = Prisma.TransactionClient;
export const RFID_DEFAULTS = { rfid_debounce_seconds: '10', rfid_exit_grace_minutes: '15', rfid_event_max_age_seconds: '30' };
export const RFID_LIMITS = { rfid_debounce_seconds: [2, 120], rfid_exit_grace_minutes: [0, 60], rfid_event_max_age_seconds: [5, 120] } as const;
export function normalizeUid(value: string) {
  const uid = value.replace(/[ :\-]/g, '').toUpperCase();
  if (!/^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(uid)) throw httpError(400, 'RFID UID must contain 4, 7 or 10 hexadecimal bytes');
  return uid;
}
export function cardHash(uid: string) {
  const secret = process.env.RFID_CARD_HASH_SECRET;
  if (!secret || secret.length < 32) throw httpError(503, 'RFID is not configured: set a stable RFID_CARD_HASH_SECRET of at least 32 characters');
  return createHmac('sha256', secret).update(normalizeUid(uid)).digest('hex');
}
export function readerKeyHash(key: string) { return createHash('sha256').update(key).digest('hex'); }
export function validReaderKey(key: string, stored: string) {
  if (!/^[a-f0-9]{64}$/.test(stored) || key.length > 256) return false;
  return timingSafeEqual(Buffer.from(readerKeyHash(key), 'hex'), Buffer.from(stored, 'hex'));
}
export function rfidZone() { return process.env.ATTENDANCE_TIMEZONE || 'Asia/Kolkata'; }
export async function rfidRules(tx: Tx) {
  const rows = await tx.settings.findMany({ where: { key: { in: Object.keys(RFID_DEFAULTS) } } });
  const values: Record<string, string> = { ...RFID_DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  const result: Record<string, number> = {};
  for (const [key, [min, max]] of Object.entries(RFID_LIMITS)) {
    const n = Number(values[key]);
    if (!Number.isInteger(n) || n < min || n > max) throw httpError(503, 'Invalid RFID policy: ' + key);
    result[key] = n;
  }
  return result;
}
export async function lockReader(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT reader_id FROM "RfidReader" WHERE reader_id = ${id} FOR UPDATE`;
  const reader = await tx.rfidReader.findUnique({ where: { reader_id: id }, include: { owner: true } });
  if (!reader || !reader.is_active || !reader.owner.is_active || !['ADMIN', 'SUPER_ADMIN'].includes(reader.owner.role)) throw httpError(401, 'Reader is disabled');
  return reader;
}
export async function lockStudent(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT student_id FROM "Student" WHERE student_id = ${id} FOR UPDATE`;
  const student = await tx.student.findUnique({ where: { student_id: id }, include: { user: { select: { is_active: true } } } });
  if (!student) throw httpError(404, 'Student not found');
  return student;
}
export async function recordTap(input: { eventId: string; uid: string; sentAt: number }, authorized: { reader_id: string; key_hash: string }) {
  const uid = normalizeUid(input.uid), hash = cardHash(uid), now = new Date();
  return prisma.$transaction(async (tx) => {
    const reader = await lockReader(tx, authorized.reader_id);
    if (reader.key_hash !== authorized.key_hash) throw httpError(401, 'Reader key has changed');
    const previous = await tx.rfidEvent.findUnique({ where: { event_id: input.eventId } });
    if (previous) {
      if (previous.reader_id !== reader.reader_id || previous.uid_hash !== hash) throw httpError(409, 'Event ID already used for another tap');
      return { ...previous, duplicate: true };
    }
    const rules = await rfidRules(tx);
    await tx.rfidReader.update({ where: { reader_id: reader.reader_id }, data: { last_seen_at: now } });
    const event: Prisma.RfidEventUncheckedCreateInput = { event_id: input.eventId, reader_id: reader.reader_id,
      uid_hash: hash, uid_suffix: uid.slice(-4), received_at: now, outcome: 'UNKNOWN_CARD' };
    const finish = async (outcome: string) => {
      const row = await tx.rfidEvent.create({ data: { ...event, outcome } });
      await tx.auditLog.create({ data: { table_name: 'RfidEvent', record_id: row.event_id, action: 'CREATE', changed_by: reader.created_by,
        new_value: { reader_id: reader.reader_id, student_id: row.student_id, session_id: row.session_id, outcome, direction: row.direction } } });
      return { ...row, duplicate: false };
    };
    if (Math.abs(now.getTime() - input.sentAt) > rules.rfid_event_max_age_seconds * 1000) return finish('STALE_TAP');
    if (reader.capture_until && reader.capture_until > now) {
      if (reader.capture_hash) return finish('CAPTURE_WAIT');
      await tx.rfidReader.update({ where: { reader_id: reader.reader_id }, data: { capture_hash: hash, capture_suffix: uid.slice(-4), captured_at: now } });
      return finish('CAPTURED');
    }
    let card = await tx.rfidCard.findUnique({ where: { uid_hash: hash } });
    if (!card?.is_active) return finish('UNKNOWN_CARD');
    const student = await lockStudent(tx, card.student_id);
    card = await tx.rfidCard.findUnique({ where: { uid_hash: hash } });
    if (!card?.is_active || card.student_id !== student.student_id) return finish('UNKNOWN_CARD');
    event.student_id = student.student_id;
    if (!student.user.is_active) return finish('STUDENT_INACTIVE');
    const last = await tx.rfidEvent.findFirst({ where: { reader_id: reader.reader_id, student_id: student.student_id, outcome: 'RECORDED' }, orderBy: { received_at: 'desc' } });
    if (last && now.getTime() - last.received_at.getTime() < rules.rfid_debounce_seconds * 1000) return finish('DEBOUNCED');
    const open = await tx.rfidVisit.findFirst({ where: { reader_id: reader.reader_id, student_id: student.student_id, exit_at: null }, include: { session: true }, orderBy: { entry_at: 'desc' } });
    let session = open?.session;
    let exiting = false;
    if (open && session) {
      const { end } = sessionBounds(session, rfidZone());
      exiting = now >= open.entry_at && now.getTime() <= end.getTime() + rules.rfid_exit_grace_minutes * 60_000;
    }
    if (!exiting) {
      const day = campusDate(now, rfidZone()), date = new Date(day);
      const weekday = new Intl.DateTimeFormat('en-US', { timeZone: rfidZone(), weekday: 'short' }).format(now);
      const slots = weekday === 'Sun' ? [] : await tx.timetable.findMany({ where: { is_active: true, section_id: student.section_id,
        room_no: { equals: reader.room_no, mode: 'insensitive' }, day_of_week: weekday as any } });
      const active = slots.filter((slot) => { const b = sessionBounds({ ...slot, date }, rfidZone()); return now >= b.start && now < b.end; });
      if (active.length !== 1) return finish(active.length ? 'AMBIGUOUS_CLASS' : 'NO_CLASS');
      const slot = active[0];
      // Share the creation lock with teacher quick-start, so simultaneous entry
      // and teacher actions reuse one class session.
      await tx.$queryRaw`SELECT timetable_id FROM "Timetable" WHERE timetable_id = ${slot.timetable_id} FOR UPDATE`;
      const classes = await tx.classSession.findMany({ where: { date, OR: [{ timetable_id: slot.timetable_id },
        { room_no: reader.room_no, section_id: slot.section_id, subject_id: slot.subject_id, start_time: slot.start_time, end_time: slot.end_time }] } });
      if (classes.length > 1) return finish('AMBIGUOUS_CLASS');
      session = classes[0];
      if (!session) {
        session = await tx.classSession.create({ data: { timetable_id: slot.timetable_id, room_no: reader.room_no, subject_id: slot.subject_id,
          section_id: slot.section_id, teacher_id: slot.teacher_id, date, start_time: slot.start_time, end_time: slot.end_time, session_type: slot.session_type, status: 'open' } });
        await tx.auditLog.create({ data: { table_name: 'ClassSession', record_id: session.session_id, action: 'CREATE', changed_by: reader.created_by,
          new_value: { source: 'RFID', reader_id: reader.reader_id, timetable_id: slot.timetable_id } } });
      }
    }
    if (!session) return finish('NO_CLASS');
    await tx.$queryRaw`SELECT session_id FROM "ClassSession" WHERE session_id = ${session.session_id} FOR UPDATE`;
    session = await tx.classSession.findUniqueOrThrow({ where: { session_id: session.session_id } });
    event.session_id = session.session_id;
    if (!['open', 'scheduled'].includes(session.status)) return finish('SESSION_CLOSED');
    const enrollment = await tx.enrollment.findFirst({ where: { student_id: student.student_id, subject_id: session.subject_id,
      section_id: session.section_id, status: 'active', enrolled_at: { lte: now } } });
    if (student.section_id !== session.section_id || !enrollment) return finish('NOT_ENROLLED');
    if (session.status === 'scheduled') {
      await tx.classSession.update({ where: { session_id: session.session_id }, data: { status: 'open' } });
      await tx.auditLog.create({ data: { table_name: 'ClassSession', record_id: session.session_id, action: 'UPDATE', changed_by: reader.created_by, new_value: { status: 'open', source: 'RFID' } } });
    }
    event.direction = exiting ? 'OUT' : 'IN';
    if (exiting && open) await tx.rfidVisit.update({ where: { visit_id: open.visit_id }, data: { exit_at: now, exit_event_id: input.eventId } });
    else await tx.rfidVisit.create({ data: { reader_id: reader.reader_id, student_id: student.student_id, session_id: session.session_id, entry_at: now, entry_event_id: input.eventId } });
    const created = await tx.attendance.createMany({ data: [{ session_id: session.session_id, student_id: student.student_id, status: 'present',
      method: 'RFID', marked_by: reader.created_by, device_id: reader.reader_id, remarks: 'Registered RFID card tap; card identity only' }], skipDuplicates: true });
    if (created.count) await tx.auditLog.create({ data: { table_name: 'Attendance', record_id: session.session_id, action: 'CREATE', changed_by: reader.created_by,
      new_value: { student_id: student.student_id, method: 'RFID', reader_id: reader.reader_id } } });
    return finish('RECORDED');
  }, { timeout: 15_000 });
}

export async function dailyRfid(user: AccessPayload, date: string) {
  const day = new Date(date), zone = rfidZone();
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(day);
  const scope = user.role === 'STUDENT' ? { section_id: (await prisma.student.findUniqueOrThrow({ where: { student_id: user.studentId || '' } })).section_id }
    : await staffSessionScope(prisma, user);
  const slots = weekday === 'Sun' ? [] : await prisma.timetable.findMany({ where: { AND: [scope as Prisma.TimetableWhereInput, { is_active: true, day_of_week: weekday as any }] }, include: { subject: true, section: true, teacher: true }, orderBy: { start_time: 'asc' } });
  const sessions = await prisma.classSession.findMany({ where: { AND: [scope, { date: day }] }, include: { subject: true, section: true, teacher: true }, orderBy: { start_time: 'asc' } });
  const items = [...sessions.map((s) => ({ ...s, key: s.session_id, session_id: s.session_id as string | null })), ...slots.filter((t) => !sessions.some((s) => s.timetable_id === t.timetable_id)).map((t) => ({ ...t, key: t.timetable_id, session_id: null, date: day, status: 'scheduled' }))];
  const classes = [];
  for (const item of items) {
    const [students, attendance, visits] = await Promise.all([
      prisma.student.findMany({ where: { section_id: item.section_id, ...(user.role === 'STUDENT' ? { student_id: user.studentId } : { user: { is_active: true } }),
        enrollments: { some: { subject_id: item.subject_id, section_id: item.section_id, status: 'active' } } }, select: { student_id: true, name: true, roll_no: true }, orderBy: { roll_no: 'asc' } }),
      item.session_id ? prisma.attendance.findMany({ where: { session_id: item.session_id, ...(user.role === 'STUDENT' ? { student_id: user.studentId } : {}) }, include: { student: { select: { student_id: true, name: true, roll_no: true } } } }) : [],
      item.session_id ? prisma.rfidVisit.findMany({ where: { session_id: item.session_id, ...(user.role === 'STUDENT' ? { student_id: user.studentId } : {}) }, orderBy: { entry_at: 'asc' } }) : [],
    ]);
    const all = new Map([...students, ...attendance.map((a) => a.student)].map((s) => [s.student_id, s]));
    const roster = [...all.values()].map((s) => {
      const intervals = visits.filter((v) => v.student_id === s.student_id), record = attendance.find((a) => a.student_id === s.student_id);
      const last = intervals.at(-1), bounds = sessionBounds(item, zone);
      return { ...s, status: record?.status || 'unmarked', method: record?.method || null,
        first_in: intervals[0]?.entry_at || null, last_out: [...intervals].reverse().find((v) => v.exit_at)?.exit_at || null,
        inside: !!last && !last.exit_at && new Date() <= bounds.end, missing_exit: !!last && !last.exit_at && new Date() > bounds.end,
        visits: intervals.map((v) => ({ entry_at: v.entry_at, exit_at: v.exit_at })) };
    });
    if (user.role === 'STUDENT' && roster.length === 0) continue;
    classes.push({ key: item.key, session_id: item.session_id, date, start_time: item.start_time, end_time: item.end_time, room_no: item.room_no || null,
      status: item.status, subject: item.subject.subject_name, subject_code: item.subject.subject_code, section: item.section.section_name, teacher: item.teacher.name, roster });
  }
  return { date, time_zone: zone, classes: classes.sort((a, b) => a.start_time.localeCompare(b.start_time)) };
}
