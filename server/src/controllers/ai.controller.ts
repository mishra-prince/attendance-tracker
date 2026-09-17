import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.middleware';
import { httpError } from '../middleware/error.middleware';
import { audit, auditFromReq } from '../services/audit.service';
import { flagEnabled } from './features.controller';

const router = Router();
router.use(authMiddleware);

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

const PROMPT = `You are a timetable parser. Extract the weekly class timetable from this image.
Return ONLY valid JSON (no markdown, no explanation) shaped exactly:
{"slots":[{"day":"MON|TUE|WED|THU|FRI|SAT","start":"HH:MM","end":"HH:MM","subject":"<name as written>","code":"<subject code if visible, else null>","room":"<room if visible, else null>","teacher":"<teacher name if visible, else null>","type":"lecture|lab|tutorial"}]}
Rules:
- 24h time format. If a time looks like "10:00-10:55 AM", use 10:00 and 10:55.
- "day" must be one of MON TUE WED THU FRI SAT.
- Skip breaks/lunch/free rows. Only actual class slots.
- If the image is not a timetable, return {"slots":[]} .`;

interface GeminiSlot { day: string; start: string; end: string; subject: string; code?: string | null; room?: string | null; teacher?: string | null; type?: string | null; }

const DAY_MAP: Record<string, string> = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat' };

function normalizeTime(t: string): string {
  const m = t.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) throw new Error(`bad time: ${t}`);
  const h = Math.min(23, parseInt(m[1], 10));
  const min = Math.min(59, parseInt(m[2], 10));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// POST /ai/parse-timetable  { imageBase64, mimeType }  → parsed slots preview (NOT saved)
router.post('/parse-timetable', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    if (!(await flagEnabled('ai_timetable'))) throw httpError(403, 'AI timetable feature is disabled');
    const { imageBase64, mimeType } = req.body as { imageBase64?: string; mimeType?: string };
    if (!imageBase64) throw httpError(400, 'imageBase64 required');
    const mime = mimeType || 'image/jpeg';

    const body = {
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: imageBase64 } }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
    };
    let r: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      r = await fetch(GEMINI_URL('gemini-3.6-flash'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.status !== 503) break;
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    }
    if (!r.ok) {
      const t = await r.text();
      throw httpError(502, `AI service error (${r.status})`);
    }
    const data = await r.json() as any;
    const text: string = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
    const jsonStr = text.replace(/```json|```/g, '').trim();
    let parsed: { slots: GeminiSlot[] };
    try { parsed = JSON.parse(jsonStr); } catch { throw httpError(502, 'AI returned unparseable response'); }
    if (!Array.isArray(parsed.slots)) throw httpError(502, 'AI returned unexpected shape');

    // Normalize + validate every slot; collect errors instead of failing whole request
    const slots: any[] = [];
    const errors: string[] = [];
    parsed.slots.forEach((s, i) => {
      try {
        const day = String(s.day).slice(0, 3).toUpperCase();
        if (!DAY_MAP[day]) throw new Error(`unknown day ${s.day}`);
        const start = normalizeTime(String(s.start));
        const end = normalizeTime(String(s.end));
        if (start >= end) throw new Error('end before start');
        if (!s.subject || !String(s.subject).trim()) throw new Error('missing subject');
        slots.push({
          day: DAY_MAP[day], start, end,
          subject_name: String(s.subject).trim(),
          subject_code: s.code ? String(s.code).trim().toUpperCase().replace(/\s+/g, '') : null,
          room_no: s.room ? String(s.room).trim() : null,
          teacher_name: s.teacher ? String(s.teacher).trim() : null,
          session_type: ['lecture', 'lab', 'tutorial'].includes(String(s.type).toLowerCase()) ? String(s.type).toLowerCase() : 'lecture',
        });
      } catch (e: any) {
        errors.push(`Slot ${i + 1}: ${e.message}`);
      }
    });
    res.json({ success: true, data: { slots, errors } });
  } catch (e) { next(e); }
});

// POST /ai/commit-timetable  { sectionId, slots: [...] } → creates subjects if needed + Timetable rows (conflict-checked)
router.post('/commit-timetable', requireRole('TEACHER', 'HOD', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    if (!(await flagEnabled('ai_timetable'))) throw httpError(403, 'AI timetable feature is disabled');
    const { sectionId, defaultTeacherId, slots } = req.body as { sectionId?: string; defaultTeacherId?: string; slots?: any[] };
    if (!sectionId || !Array.isArray(slots) || slots.length === 0) throw httpError(400, 'sectionId and slots required');

    const section = await prisma.section.findUnique({ where: { section_id: sectionId }, include: { course: true } });
    if (!section) throw httpError(404, 'Section not found');

    // Semester: latest active semester linked to this section, else latest active anywhere
    let semester = await prisma.semester.findFirst({
      where: { sections: { some: { section_id: sectionId } } },
      orderBy: { start_date: 'desc' },
    });
    if (!semester) semester = await prisma.semester.findFirst({ where: { is_active: true }, orderBy: { start_date: 'desc' } });
    if (!semester) throw httpError(400, 'No semester found — create one first');

    // Default teacher = the uploader if they have a Teacher row
    const meTeacher = await prisma.teacher.findFirst({ where: { user_id: req.user!.userId } });
    const defaultTeacherId2 = defaultTeacherId || meTeacher?.teacher_id || null;
    if (!defaultTeacherId2) throw httpError(400, 'No teacher specified and uploader has no Teacher profile');

    const created: any[] = [];
    const skipped: any[] = [];
    for (const s of slots) {
      try {
        // Find or create subject (unique by subject_code)
        let code = (s.subject_code && String(s.subject_code).trim()) ||
          s.subject_name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
        let subject = await prisma.subject.findUnique({ where: { subject_code: code } });
        if (!subject) {
          subject = await prisma.subject.create({ data: {
            subject_code: code, subject_name: s.subject_name,
            course_id: section.course_id, semester_id: semester.semester_id,
            type: s.session_type === 'lab' ? 'lab' : 'theory',
          } });
        }
        // Resolve teacher: by name match on Teacher table, else default
        let teacherId = defaultTeacherId2;
        if (s.teacher_name) {
          const t = await prisma.teacher.findFirst({ where: { user: { name: { contains: s.teacher_name, mode: 'insensitive' } } } });
          if (t) teacherId = t.teacher_id;
        }
        // Conflict check (same as manual create)
        const conflict = await prisma.timetable.findFirst({ where: {
          day_of_week: s.day as any, is_active: true,
          OR: [{ teacher_id: teacherId }, { section_id: sectionId }, ...(s.room_no ? [{ room_no: s.room_no }] : [])],
          start_time: { lt: s.end }, end_time: { gt: s.start },
        } });
        if (conflict) { skipped.push({ ...s, reason: `conflict with ${conflict.day_of_week} ${conflict.start_time} (room ${conflict.room_no})` }); continue; }

        // Ensure SubjectTeacher link exists (Timetable FK composite)
        await prisma.subjectTeacher.upsert({
          where: { subject_id_section_id: { subject_id: subject.subject_id, section_id: sectionId } },
          update: {}, create: { subject_id: subject.subject_id, section_id: sectionId, teacher_id: teacherId },
        });
        const row = await prisma.timetable.create({ data: {
          subject_id: subject.subject_id, section_id: sectionId, teacher_id: teacherId,
          day_of_week: s.day as any, start_time: s.start, end_time: s.end,
          room_no: s.room_no || 'TBA', session_type: s.session_type as any,
        } });
        created.push(row);
        await audit({ tableName: 'Timetable', recordId: row.timetable_id, action: 'CREATE', changedBy: req.user!.userId, ...auditFromReq(req) });
      } catch (e: any) {
        skipped.push({ ...s, reason: (e.message || 'error').slice(0, 600) });
      }
    }
    res.status(201).json({ success: true, data: { created: created.length, skipped } });
  } catch (e) { next(e); }
});

export default router;
