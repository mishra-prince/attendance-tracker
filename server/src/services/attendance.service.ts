import { prisma } from '../utils/prisma';
import { httpError } from '../middleware/error.middleware';
import { sessionBounds } from './bleEvidence.service';

/** Single source of truth for attendance percentage math. Never duplicate elsewhere. */

export interface AttendanceRules {
  minimum_attendance_percentage: number;
  late_counts_present: boolean;
  on_duty_counts_present: boolean;
  exclude_medical_from_denominator: boolean;
  exclude_excused_from_denominator: boolean;
}

export async function getRules(): Promise<AttendanceRules> {
  const rows = await prisma.settings.findMany({
    where: { key: { in: Object.keys(DEFAULT_RULES) } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    minimum_attendance_percentage: Number(map.minimum_attendance_percentage ?? DEFAULT_RULES.minimum_attendance_percentage),
    late_counts_present: (map.late_counts_present ?? 'true') === 'true',
    on_duty_counts_present: (map.on_duty_counts_present ?? 'true') === 'true',
    exclude_medical_from_denominator: (map.exclude_medical_from_denominator ?? 'true') === 'true',
    exclude_excused_from_denominator: (map.exclude_excused_from_denominator ?? 'true') === 'true',
  };
}

export const DEFAULT_RULES = {
  minimum_attendance_percentage: '75',
  late_counts_present: 'true',
  on_duty_counts_present: 'true',
  exclude_medical_from_denominator: 'true',
  exclude_excused_from_denominator: 'true',
  submission_edit_window_minutes: '30',
  auto_lock_enabled: 'true',
};

function countsAsPresent(status: string, rules: AttendanceRules): boolean {
  if (status === 'present') return true;
  if (status === 'late') return rules.late_counts_present;
  if (status === 'on_duty') return rules.on_duty_counts_present;
  return false; // absent, excused, medical never count
}

function excludedFromDenominator(status: string, rules: AttendanceRules): boolean {
  if (status === 'medical') return rules.exclude_medical_from_denominator;
  if (status === 'excused') return rules.exclude_excused_from_denominator;
  return false;
}

export async function computeStudentSummary(studentId: string, subjectId?: string) {
  const rules = await getRules();

  const enrollments = await prisma.enrollment.findMany({
    where: { student_id: studentId, status: 'active', ...(subjectId ? { subject_id: subjectId } : {}) },
  });

  const subjectIds = [...new Set(enrollments.map((e) => e.subject_id))];
  const subjects = subjectIds.length
    ? await prisma.subject.findMany({ where: { subject_id: { in: subjectIds } } })
    : [];

  const attendanceRows = await prisma.attendance.findMany({
    where: {
      student_id: studentId,
      ...(subjectId ? {} : {}),
      session: subjectId ? { subject_id: subjectId } : { subject_id: { in: subjectIds } },
    },
    include: { session: { select: { subject_id: true, section_id: true, date: true, start_time: true, end_time: true, status: true } } },
  });

  const bySubject: Record<string, { eligible: number; present: number }> = {};
  let totalEligible = 0;
  let totalPresent = 0;

  for (const row of attendanceRows) {
    // skip cancelled sessions entirely
    if (row.session.status === 'cancelled') continue;
    // must have had active enrollment at that date
    const enr = enrollments.find(
      (e) => e.subject_id === row.session.subject_id && e.section_id === row.session.section_id
        && e.enrolled_at <= sessionBounds(row.session, process.env.ATTENDANCE_TIMEZONE || 'Asia/Kolkata').end
    );
    if (!enr) continue;

    const s = (bySubject[row.session.subject_id] ||= { eligible: 0, present: 0 });
    if (excludedFromDenominator(row.status, rules)) continue;
    s.eligible += 1;
    totalEligible += 1;
    if (countsAsPresent(row.status, rules)) {
      s.present += 1;
      totalPresent += 1;
    }
  }

  const subjectSummaries = subjects.map((sub) => {
    const stat = bySubject[sub.subject_id] || { eligible: 0, present: 0 };
    return {
      subject_id: sub.subject_id,
      subject_code: sub.subject_code,
      subject_name: sub.subject_name,
      eligible_sessions: stat.eligible,
      counted_present: stat.present,
      percentage: stat.eligible === 0 ? null : Math.round((stat.present / stat.eligible) * 10000) / 100,
    };
  });

  return {
    overall: {
      eligible_sessions: totalEligible,
      counted_present: totalPresent,
      // guard divide-by-zero → null, not 0
      percentage: totalEligible === 0 ? null : Math.round((totalPresent / totalEligible) * 10000) / 100,
    },
    subjects: subjectSummaries,
    rules: { minimum_attendance_percentage: rules.minimum_attendance_percentage },
  };
}

/** Condonation calculator — separate from core % calc, built on top of it. */
export function condonation(summary: ReturnType<typeof computeStudentSummary> extends Promise<infer T> ? T : never) {
  const min = summary.rules.minimum_attendance_percentage;
  const { eligible_sessions, counted_present, percentage } = summary.overall;
  if (eligible_sessions === 0 || percentage === null) {
    return { classes_needed_to_reach_threshold: null, classes_can_still_miss: null };
  }
  if (percentage >= min) {
    // max x so that (present)/(eligible + x) >= min
    const canMiss = Math.floor(counted_present / (min / 100) - eligible_sessions);
    return { classes_needed_to_reach_threshold: 0, classes_can_still_miss: Math.max(0, canMiss) };
  }
  // needed n so that (present + n)/(eligible + n) >= min
  const needed = Math.ceil((min / 100 * eligible_sessions - counted_present) / (1 - min / 100));
  return { classes_needed_to_reach_threshold: Math.max(0, needed), classes_can_still_miss: 0 };
}
