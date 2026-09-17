import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.middleware';
import { httpError } from '../middleware/error.middleware';
import { audit } from '../services/audit.service';
import { flagEnabled } from './features.controller';
import { createHash, createHmac } from 'crypto';

const router = Router();
router.use(authMiddleware);

// Server-side session secret for beacon HMAC (env or generated once per process is NOT durable — use env in prod)
const BEACON_SECRET = process.env.BLE_BEACON_SECRET || 'threshold-ble-secret-v1';

// Dwell rule: 55% of class duration, min 5 min
function requiredMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return Math.max(5, Math.ceil(mins * 0.55));
}

// Rotating beacon ID: HMAC(secret, session|window) — rotates every 30s window
function beaconIdFor(session: { session_id: string; beacon_nonce: string }, window: number): string {
  return createHmac('sha256', BEACON_SECRET)
    .update(`${session.session_id}|${session.beacon_nonce}|${window}`)
    .digest('hex').slice(0, 16).toUpperCase();
}

function timeWindowNow(): number { return Math.floor(Date.now() / 30_000); }

// POST /ble/start-session  { timetableId }  (TEACHER/HOD/ADMIN)
// Creates ClassSession + BleSession, computes dwell requirement
router.post('/start-session', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    if (!(await flagEnabled('ble_auto_attendance'))) throw httpError(403, 'BLE auto-attendance feature is disabled');
    const { timetableId } = req.body as { timetableId?: string };
    if (!timetableId) throw httpError(400, 'timetableId required');

    const tt = await prisma.timetable.findUnique({ where: { timetable_id: timetableId }, include: { subject: true, section: true } });
    if (!tt) throw httpError(404, 'Timetable slot not found');

    const teacher = await prisma.teacher.findFirst({ where: { user_id: req.user!.userId } });
    if (!teacher) throw httpError(403, 'No teacher profile');

    // One active BLE session per section
    const existing = await prisma.bleSession.findFirst({ where: { section_id: tt.section_id, status: 'active' } });
    if (existing) throw httpError(409, 'A BLE session is already active for this section');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cs = await prisma.classSession.create({ data: {
      timetable_id: tt.timetable_id, subject_id: tt.subject_id, section_id: tt.section_id,
      teacher_id: tt.teacher_id, date: today, start_time: tt.start_time, end_time: tt.end_time,
      session_type: tt.session_type, status: 'open' as any,
    } });

    const anchorRequired = await flagEnabled('esp32_anchor');
    const nonce = createHash('sha256').update(`${cs.session_id}|${Date.now()}`).digest('hex').slice(0, 24);
    const session = await prisma.bleSession.create({ data: {
      timetable_id: tt.timetable_id, class_session_id: cs.session_id,
      subject_id: tt.subject_id, section_id: tt.section_id, teacher_id: tt.teacher_id,
      date: today, start_time: tt.start_time, end_time: tt.end_time,
      beacon_nonce: nonce, required_minutes: requiredMinutes(tt.start_time, tt.end_time),
      anchor_required: anchorRequired,
    } });

    res.status(201).json({ success: true, data: {
      session_id: session.session_id, class_session_id: cs.session_id,
      subject: tt.subject.subject_name, section: tt.section.section_name,
      start_time: tt.start_time, end_time: tt.end_time,
      required_minutes: session.required_minutes, anchor_required: anchorRequired,
    } });
  } catch (e) { next(e); }
});

// GET /ble/my-session  (TEACHER) — active session for this teacher + current beacon id
router.get('/my-session', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const teacher = await prisma.teacher.findFirst({ where: { user_id: req.user!.userId } });
    if (!teacher) return res.json({ success: true, data: null });
    const s = await prisma.bleSession.findFirst({
      where: { teacher_id: teacher.teacher_id, status: 'active' },
      include: { blePings: true },
      orderBy: { created_at: 'desc' },
    });
    if (!s) return res.json({ success: true, data: null });
    const count = await prisma.bleSession.count({ where: { session_id: s.session_id } });
    const distinctStudents = new Set(s.blePings.map((p) => p.student_id)).size;
    res.json({ success: true, data: {
      session_id: s.session_id, subject_id: s.subject_id, section_id: s.section_id,
      start_time: s.start_time, end_time: s.end_time, required_minutes: s.required_minutes,
      pings: s.blePings.length, students_seen: distinctStudents,
      beacon_id: beaconIdFor(s, timeWindowNow()),
      window: timeWindowNow(), rotate_ms: 30_000,
    } });
  } catch (e) { next(e); }
});

// POST /ble/scan  { beaconId, rssi }  (STUDENT) — records a sighting; server validates the beacon id
router.post('/scan', requireRole('STUDENT'), async (req: AuthRequest, res, next) => {
  try {
    if (!(await flagEnabled('ble_auto_attendance'))) throw httpError(403, 'BLE auto-attendance feature is disabled');
    const { beaconId, rssi } = req.body as { beaconId?: string; rssi?: number };
    if (!beaconId || typeof rssi !== 'number') throw httpError(400, 'beaconId and rssi required');

    const student = await prisma.student.findFirst({ where: { user_id: req.user!.userId } });
    if (!student) throw httpError(403, 'No student profile');

    // Find the active session this beacon belongs to: check current & previous window (clock skew tolerance)
    const active = await prisma.bleSession.findMany({ where: { status: 'active' } });
    const now = timeWindowNow();
    const match = active.find((s) => beaconIdFor(s, now) === beaconId || beaconIdFor(s, now - 1) === beaconId);
    if (!match) throw httpError(404, 'No active class beacon in range');

    // Enrollment check
    const enrolled = await prisma.enrollment.findFirst({ where: { student_id: student.student_id, subject_id: match.subject_id } });
    if (!enrolled) throw httpError(403, 'You are not enrolled in this subject');

    // RSSI floor: reject implausibly far reads (corridor attack filter). Floor ≈ -80 dBm.
    if (rssi < -80) return res.json({ success: true, data: { recorded: false, reason: 'signal_too_weak' } });

    // Anchor cross-check (ESP32, flag-gated): require a recent anchor sighting if anchor_required
    let anchorOk: boolean | null = null;
    if (match.anchor_required) {
      const recent = await prisma.anchorSighting.findFirst({ where: {
        student_id: student.student_id, room_no: { equals: (await prisma.timetable.findUnique({ where: { timetable_id: match.timetable_id! }, select: { room_no: true } }))?.room_no || '__none__' },
        seen_at: { gte: new Date(Date.now() - 10 * 60_000) },
      } });
      anchorOk = !!recent;
      if (!anchorOk) return res.json({ success: true, data: { recorded: false, reason: 'anchor_verification_failed' } });
    }

    await prisma.blePing.create({ data: { session_id: match.session_id, student_id: student.student_id, rssi, anchor_ok: anchorOk } });
    res.json({ success: true, data: { recorded: true, subject: match.subject_id, required_minutes: match.required_minutes } });
  } catch (e) { next(e); }
});

// GET /ble/status  (STUDENT) — live dwell status for the session covering student's section
router.get('/status', requireRole('STUDENT'), async (req: AuthRequest, res, next) => {
  try {
    const student = await prisma.student.findFirst({ where: { user_id: req.user!.userId } });
    if (!student) throw httpError(403, 'No student profile');
    const s = await prisma.bleSession.findFirst({
      where: { section_id: student.section_id, status: 'active' },
      include: { blePings: { where: { student_id: student.student_id }, orderBy: { seen_at: 'asc' } } },
    });
    if (!s) return res.json({ success: true, data: null });

    // Dwell calc: tolerant of gaps ≤ 60s; count from first to last ping, capped at session window
    const pings = s.blePings;
    let dwellSeconds = 0;
    if (pings.length > 0) {
      dwellSeconds = Math.floor((pings[pings.length - 1].seen_at.getTime() - pings[0].seen_at.getTime()) / 1000);
      // subtract gaps > 60s
      for (let i = 1; i < pings.length; i++) {
        const gap = (pings[i].seen_at.getTime() - pings[i - 1].seen_at.getTime()) / 1000;
        if (gap > 60) dwellSeconds -= gap - 60;
      }
    }
    const requiredSec = s.required_minutes * 60;
    res.json({ success: true, data: {
      session_id: s.session_id, required_minutes: s.required_minutes,
      dwell_minutes: Math.floor(dwellSeconds / 60), progress: Math.min(1, dwellSeconds / requiredSec),
      secured: dwellSeconds >= requiredSec,
      anchor_required: s.anchor_required,
    } });
  } catch (e) { next(e); }
});

// POST /ble/finalize/:sessionId  (TEACHER/ADMIN — also called by auto-finalize)
async function finalizeSession(sessionId: string): Promise<{ present: number; low: number; absent: number }> {
  const s = await prisma.bleSession.findUnique({ where: { session_id: sessionId }, include: { blePings: true } });
  if (!s) throw httpError(404, 'Session not found');
  if (s.status !== 'active') throw httpError(409, 'Session already finalized');

  const enrolled = await prisma.enrollment.findMany({ where: { subject_id: s.subject_id, section_id: s.section_id, status: 'active' } });
  const teacherUser = await prisma.teacher.findUnique({ where: { teacher_id: s.teacher_id }, select: { user_id: true } });
  const byStudent = new Map<string, typeof s.blePings>();
  for (const p of s.blePings) {
    const arr = byStudent.get(p.student_id) || [];
    arr.push(p); byStudent.set(p.student_id, arr);
  }

  const requiredSec = s.required_minutes * 60;
  let present = 0, low = 0;
  const [sh, sm] = s.start_time.split(':').map(Number);
  const [eh, em] = s.end_time.split(':').map(Number);
  const today = new Date(s.date); today.setHours(0, 0, 0, 0);
  const csId = s.class_session_id!;

  for (const enr of enrolled) {
    const pings = (byStudent.get(enr.student_id) || []).sort((a, b) => a.seen_at.getTime() - b.seen_at.getTime());
    let dwell = 0;
    if (pings.length) {
      dwell = (pings[pings.length - 1].seen_at.getTime() - pings[0].seen_at.getTime()) / 1000;
      for (let i = 1; i < pings.length; i++) {
        const gap = (pings[i].seen_at.getTime() - pings[i - 1].seen_at.getTime()) / 1000;
        if (gap > 60) dwell -= gap - 60;
      }
    }
    let status: 'present' | 'absent' | 'late' = 'absent';
    if (dwell >= requiredSec) { status = 'present'; present++; }
    else if (dwell >= requiredSec * 0.7) { status = 'late'; low++; } // low-confidence → condonation candidate
    await prisma.attendance.upsert({
      where: { session_id_student_id: { session_id: csId, student_id: enr.student_id } },
      update: { status, method: 'BLE_AUTO' as any },
      create: { session_id: csId, student_id: enr.student_id, status, method: 'BLE_AUTO' as any, marked_by: teacherUser?.user_id || s.teacher_id },
    });
  }
  await prisma.classSession.update({ where: { session_id: csId }, data: { status: 'submitted' as any } });
  await prisma.bleSession.update({ where: { session_id: s.session_id }, data: { status: 'finalized', finalized_at: new Date() } });
  await audit({ tableName: 'Attendance', recordId: csId, action: 'BLE_FINALIZE', changedBy: teacherUser?.user_id || s.teacher_id, newValue: { present, low } });
  return { present, low, absent: enrolled.length - present - low };
}

router.post('/finalize/:sessionId', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    res.json({ success: true, data: await finalizeSession(req.params.sessionId) });
  } catch (e) { next(e); }
});

// Internal auto-finalize (cron/watchdog): finalize any active session past its end time
router.post('/auto-finalize', async (req: AuthRequest, res, next) => {
  try {
    // secured by secret header from watchdog
    if (req.headers['x-internal-key'] !== (process.env.INTERNAL_JOB_KEY || 'threshold-internal')) throw httpError(403, 'forbidden');
    const active = await prisma.bleSession.findMany({ where: { status: 'active' } });
    const now = new Date();
    const done: any[] = [];
    for (const s of active) {
      const [eh, em] = s.end_time.split(':').map(Number);
      const end = new Date(s.date); end.setHours(eh, em, 0, 0);
      // finalize 5 min after end time
      if (end.getTime() + 5 * 60_000 < now.getTime()) done.push(await finalizeSession(s.session_id));
    }
    res.json({ success: true, data: { finalized: done.length, results: done } });
  } catch (e) { next(e); }
});

export default router;
