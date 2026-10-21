import { Router } from 'express';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.middleware';
import { httpError } from '../middleware/error.middleware';
import { bleLimiter } from '../middleware/rateLimit.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { flagEnabled } from './features.controller';
import { BEACON_WINDOW_MS, DEFAULT_BLE_POLICY, BlePolicy, beaconIdFor, matchesBeacon, campusDate, sessionBounds, requiredMinutes, dwellSeconds } from '../services/bleEvidence.service';

const router = Router();
router.use(authMiddleware);
if (!process.env.BLE_BEACON_SECRET || process.env.BLE_BEACON_SECRET.length < 32) throw new Error('BLE_BEACON_SECRET must contain at least 32 characters');
const SECRET = process.env.BLE_BEACON_SECRET;
const ZONE = process.env.ATTENDANCE_TIMEZONE || 'Asia/Kolkata';
campusDate(new Date(), ZONE);

async function policy(): Promise<BlePolicy> {
  const rows = await prisma.settings.findMany({ where: { key: { in: ['ble_dwell_percent', 'ble_min_minutes', 'ble_rssi_floor', 'ble_max_gap_seconds'] } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  const bounded = (key: string, fallback: number, min: number, max: number) => Number.isFinite(map[key]) && map[key] >= min && map[key] <= max ? map[key] : fallback;
  return {
    dwellPercent: bounded('ble_dwell_percent', DEFAULT_BLE_POLICY.dwellPercent, 1, 100),
    minMinutes: bounded('ble_min_minutes', DEFAULT_BLE_POLICY.minMinutes, 1, 120),
    rssiFloor: bounded('ble_rssi_floor', DEFAULT_BLE_POLICY.rssiFloor, -127, -1),
    maxGapSeconds: bounded('ble_max_gap_seconds', DEFAULT_BLE_POLICY.maxGapSeconds, 30, 120),
  };
}

router.post('/start-session', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), validateBody(z.object({ timetableId: z.string().uuid() })), async (req: AuthRequest, res, next) => {
  try {
    if (!(await flagEnabled('ble_auto_attendance'))) throw httpError(403, 'Bluetooth attendance is disabled');
    const tt = await prisma.timetable.findUnique({ where: { timetable_id: req.body.timetableId }, include: { subject: true, section: true } });
    if (!tt || !tt.is_active) throw httpError(404, 'Active timetable slot not found');
    if (tt.teacher_id !== req.user!.teacherId) throw httpError(403, 'Only the assigned teacher can start this class');
    const now = new Date();
    const date = new Date(campusDate(now, ZONE) + 'T00:00:00Z');
    const day = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, weekday: 'short' }).format(now);
    const bounds = sessionBounds({ date, start_time: tt.start_time, end_time: tt.end_time }, ZONE);
    if (day !== tt.day_of_week || now < bounds.start || now >= bounds.end) throw httpError(409, 'Start Bluetooth attendance during the scheduled class time');
    const rules = await policy();
    const minutes = requiredMinutes(tt.start_time, tt.end_time, rules);
    const anchor = await flagEnabled('esp32_anchor');
    const session = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tt.section_id}))`;
      const existing = await tx.bleSession.findFirst({ where: { section_id: tt.section_id, status: 'active' } });
      if (existing) throw httpError(409, 'This section already has an active Bluetooth session');
      const classSession = await tx.classSession.findFirst({ where: { timetable_id: tt.timetable_id, date, status: { not: 'cancelled' } } });
      if (classSession) throw httpError(409, 'This class already has an attendance session. Open its roster instead');
      const cs = await tx.classSession.create({ data: {
        timetable_id: tt.timetable_id, subject_id: tt.subject_id, section_id: tt.section_id,
        teacher_id: tt.teacher_id, date, start_time: tt.start_time, end_time: tt.end_time,
        session_type: tt.session_type, status: 'open',
      } });
      const created = await tx.bleSession.create({ data: {
        timetable_id: tt.timetable_id, class_session_id: cs.session_id, subject_id: tt.subject_id,
        section_id: tt.section_id, teacher_id: tt.teacher_id, date, start_time: tt.start_time, end_time: tt.end_time,
        beacon_nonce: randomBytes(24).toString('hex'), required_minutes: minutes, anchor_required: anchor,
      } });
      await tx.auditLog.create({ data: { table_name: 'ClassSession', record_id: cs.session_id, action: 'CREATE', changed_by: req.user!.userId, new_value: { method: 'BLE_AUTO', ble_session_id: created.session_id } } });
      return created;
    });
    res.status(201).json({ success: true, data: { session_id: session.session_id, class_session_id: session.class_session_id, required_minutes: minutes, anchor_required: anchor } });
  } catch (e) { next(e); }
});

router.get('/my-session', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.user!.teacherId) return res.json({ success: true, data: null });
    const s = await prisma.bleSession.findFirst({ where: { teacher_id: req.user!.teacherId, status: 'active' }, include: { blePings: { select: { student_id: true } } }, orderBy: { created_at: 'desc' } });
    if (!s) return res.json({ success: true, data: null });
    const now = Date.now();
    const window = Math.floor(now / BEACON_WINDOW_MS);
    const { end } = sessionBounds(s, ZONE);
    res.json({ success: true, data: {
      session_id: s.session_id, class_session_id: s.class_session_id, subject_id: s.subject_id, section_id: s.section_id,
      required_minutes: s.required_minutes, pings: s.blePings.length, students_seen: new Set(s.blePings.map((p) => p.student_id)).size,
      beacon_id: now < end.getTime() ? beaconIdFor(s, window, SECRET) : null,
      window, rotate_ms: BEACON_WINDOW_MS, valid_for_ms: Math.max(0, Math.min((window + 1) * BEACON_WINDOW_MS, end.getTime()) - now),
      expires_at: new Date(Math.min((window + 1) * BEACON_WINDOW_MS, end.getTime())).toISOString(),
    } });
  } catch (e) { next(e); }
});

router.post('/scan', requireRole('STUDENT'), bleLimiter, validateBody(z.object({ beaconId: z.string().regex(/^[A-F0-9]{16}$/), rssi: z.number().int().min(-127).max(-1) })), async (req: AuthRequest, res, next) => {
  try {
    if (!(await flagEnabled('ble_auto_attendance'))) throw httpError(403, 'Bluetooth attendance is disabled');
    const student = await prisma.student.findUnique({ where: { user_id: req.user!.userId } });
    if (!student) throw httpError(403, 'No student profile');
    const rules = await policy();
    const now = new Date();
    const window = Math.floor(now.getTime() / BEACON_WINDOW_MS);
    const sessions = await prisma.bleSession.findMany({ where: { section_id: student.section_id, status: 'active' } });
    const match = sessions.find((s) => matchesBeacon(s, req.body.beaconId, window, SECRET));
    if (!match) throw httpError(404, 'No current class signal for your section');
    const { start, end } = sessionBounds(match, ZONE);
    if (now < start || now >= end) throw httpError(409, 'This class is outside its attendance window');
    const enrolled = await prisma.enrollment.findFirst({ where: { student_id: student.student_id, subject_id: match.subject_id, section_id: match.section_id, status: 'active', enrolled_at: { lte: now } } });
    if (!enrolled) throw httpError(403, 'Active enrollment in this class is required');
    if (req.body.rssi < rules.rssiFloor) return res.json({ success: true, data: { recorded: false, reason: 'signal_too_weak' } });
    let anchorOk: boolean | null = null;
    if (match.anchor_required) {
      const tt = match.timetable_id ? await prisma.timetable.findUnique({ where: { timetable_id: match.timetable_id } }) : null;
      const sighting = tt && await prisma.anchorSighting.findFirst({ where: { student_id: student.student_id, room_no: tt.room_no, seen_at: { gte: new Date(now.getTime() - 60_000), lte: now } } });
      anchorOk = !!sighting;
      if (!anchorOk) return res.json({ success: true, data: { recorded: false, reason: 'anchor_verification_failed' } });
    }
    const seenAt = new Date(window * BEACON_WINDOW_MS);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${match.section_id}))`;
      const active = await tx.bleSession.findUnique({ where: { session_id: match.session_id } });
      if (active?.status !== 'active') throw httpError(409, 'Class signal has closed');
      return tx.blePing.createMany({ data: [{ session_id: match.session_id, student_id: student.student_id, rssi: req.body.rssi, anchor_ok: anchorOk, seen_at: seenAt }], skipDuplicates: true });
    });
    res.json({ success: true, data: { recorded: result.count > 0, reason: result.count ? undefined : 'already_recorded', required_minutes: match.required_minutes } });
  } catch (e) { next(e); }
});

router.get('/status', requireRole('STUDENT'), async (req: AuthRequest, res, next) => {
  try {
    const student = await prisma.student.findUnique({ where: { user_id: req.user!.userId } });
    if (!student) throw httpError(403, 'No student profile');
    const s = await prisma.bleSession.findFirst({ where: { section_id: student.section_id, status: 'active' }, include: { blePings: { where: { student_id: student.student_id }, orderBy: { seen_at: 'asc' } } } });
    if (!s) return res.json({ success: true, data: null });
    const rules = await policy();
    const { start, end } = sessionBounds(s, ZONE);
    const seconds = dwellSeconds(s.blePings, start, end, rules.maxGapSeconds);
    res.json({ success: true, data: {
      session_id: s.session_id, required_minutes: s.required_minutes, dwell_minutes: Math.floor(seconds / 60),
      progress: Math.min(1, seconds / (s.required_minutes * 60)), secured: seconds >= s.required_minutes * 60,
      anchor_required: s.anchor_required, last_seen_at: s.blePings.at(-1)?.seen_at ?? null, ends_at: end.toISOString(),
      awaiting_teacher: true,
    } });
  } catch (e) { next(e); }
});

router.post('/finalize/:sessionId', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const rules = await policy();
    const owner = await prisma.bleSession.findUnique({ where: { session_id: req.params.sessionId } });
    if (!owner) throw httpError(404, 'Session not found');
    if (owner.teacher_id !== req.user!.teacherId) throw httpError(403, 'Only the assigned teacher can finalize this class');
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${owner.section_id}))`;
      const s = await tx.bleSession.findUnique({ where: { session_id: owner.session_id }, include: { blePings: true } });
      if (!s || s.status !== 'active') throw httpError(409, 'Session already finalized');
      if (!s.class_session_id) throw httpError(409, 'Attendance session is missing');
      const cs = await tx.classSession.findUnique({ where: { session_id: s.class_session_id } });
      if (cs?.status !== 'open') throw httpError(423, 'Attendance session is no longer open');
      const enrolled = await tx.enrollment.findMany({ where: { subject_id: s.subject_id, section_id: s.section_id, status: 'active' } });
      const { start, end } = sessionBounds(s, ZONE);
      let present = 0;
      for (const enrollment of enrolled) {
        const seconds = dwellSeconds(s.blePings.filter((p) => p.student_id === enrollment.student_id && p.seen_at >= enrollment.enrolled_at), start, end, rules.maxGapSeconds);
        if (seconds < s.required_minutes * 60) continue;
        // Preserve teacher and leave records. Missing evidence goes to teacher review.
        const inserted = await tx.attendance.createMany({ data: [{ session_id: s.class_session_id, student_id: enrollment.student_id, status: 'present', method: 'BLE_AUTO', marked_by: req.user!.userId, remarks: 'Bluetooth dwell met; finalized by assigned teacher' }], skipDuplicates: true });
        present += inserted.count;
        if (inserted.count) await tx.auditLog.create({ data: { table_name: 'Attendance', record_id: s.class_session_id, action: 'CREATE', changed_by: req.user!.userId, new_value: { student_id: enrollment.student_id, status: 'present', method: 'BLE_AUTO' } } });
      }
      await tx.bleSession.update({ where: { session_id: s.session_id }, data: { status: 'finalized', finalized_at: new Date() } });
      const marked = await tx.attendance.count({ where: { session_id: s.class_session_id, student_id: { in: enrolled.map((e) => e.student_id) } } });
      const review = enrolled.length - marked;
      await tx.auditLog.create({ data: { table_name: 'ClassSession', record_id: s.class_session_id, action: 'BLE_FINALIZE', changed_by: req.user!.userId, new_value: { present, review_required: review } } });
      return { present, low: review, absent: 0, review_required: review, class_session_id: s.class_session_id };
    }, { timeout: 30_000 });
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

router.post('/cancel/:sessionId', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const session = await prisma.bleSession.findUnique({ where: { session_id: req.params.sessionId } });
    if (!session) throw httpError(404, 'Session not found');
    if (session.teacher_id !== req.user!.teacherId) throw httpError(403, 'Only the assigned teacher can stop this class signal');
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.section_id}))`;
      const closed = await tx.bleSession.updateMany({ where: { session_id: session.session_id, status: 'active' }, data: { status: 'cancelled', finalized_at: new Date() } });
      if (!closed.count) throw httpError(409, 'Class signal already closed');
      await tx.auditLog.create({ data: { table_name: 'BleSession', record_id: session.session_id, action: 'UPDATE', changed_by: req.user!.userId, new_value: { status: 'cancelled' } } });
    });
    res.json({ success: true, data: { class_session_id: session.class_session_id } });
  } catch (e) { next(e); }
});

export default router;
