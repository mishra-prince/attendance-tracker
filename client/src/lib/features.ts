import { useState, useCallback, useEffect } from 'react';
import { api, errMsg } from './api';

// ---- Feature flags ----
export const FLAGS_META: { key: keyof Flags; label: string; desc: string }[] = [
  { key: 'ai_timetable', label: 'AI Timetable Analyzer', desc: 'Upload timetable photo → auto-create schedule' },
  { key: 'join_codes', label: 'Classroom Join Codes', desc: 'Students join sections with a code' },
  { key: 'ble_auto_attendance', label: 'BLE Auto Attendance', desc: 'Beacon scan + 55% dwell rule' },
  { key: 'esp32_anchor', label: 'ESP32 Room Anchor', desc: 'Hardware cross-check (OFF by default)' },
];

export function useFlags() {
  const [flags, setFlags] = useState<Flags | null>(null);
  const load = useCallback(() => { fetchFlags().then(setFlags).catch(() => {}); }, []);
  useEffect(load, [load]);
  const setFlag = useCallback(async (key: keyof Flags, enabled: boolean) => {
    const optimistic = { ...(flags as Flags), [key]: enabled };
    setFlags(optimistic);
    try { const f = await toggleFlag(key, enabled); setFlags(f); } catch { load(); }
  }, [flags, load]);
  return { flags, setFlag, reload: load };
}

export interface Flags { ai_timetable: boolean; join_codes: boolean; ble_auto_attendance: boolean; esp32_anchor: boolean; }

export async function fetchFlags(): Promise<Flags> {
  const r = await api.get('/features');
  return r.data.data;
}

export async function toggleFlag(name: keyof Flags, enabled: boolean): Promise<Flags> {
  const r = await api.post(`/features/${name}`, { enabled });
  return r.data.data;
}

// ---- AI Timetable ----
export interface ParsedSlot {
  day: string; start: string; end: string; subject_name: string;
  subject_code: string | null; room_no: string | null; teacher_name: string | null; session_type: string;
}

export async function parseTimetable(file: File): Promise<{ slots: ParsedSlot[]; errors: string[] }> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve((fr.result as string).split(',')[1]);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
  const r = await api.post('/ai/parse-timetable', { imageBase64: base64, mimeType: file.type || 'image/jpeg' });
  return r.data.data;
}

export async function commitTimetable(sectionId: string, slots: ParsedSlot[]): Promise<{ created: number; skipped: { subject_name: string; day: string; start: string; reason: string }[] }> {
  const r = await api.post('/ai/commit-timetable', { sectionId, slots });
  return r.data.data;
}

// ---- Join codes ----
export async function generateJoinCode(sectionId: string, expiresInHours?: number): Promise<{ code: string }> {
  const r = await api.post('/classroom/generate-code', { sectionId, expiresInHours });
  return r.data.data;
}

export async function myJoinCode(sectionId: string): Promise<{ code: string | null; expires_at: string | null }> {
  const r = await api.get('/classroom/my-code', { params: { sectionId } });
  return r.data.data;
}

export async function joinClassroom(code: string): Promise<{ joined: string; enrolled: number }> {
  const r = await api.post('/classroom/join', { code });
  return r.data.data;
}

// ---- BLE ----
export interface BleTeacherSession { session_id: string; class_session_id: string; subject_id: string; section_id: string; required_minutes: number; pings: number; students_seen: number; beacon_id: string | null; window: number; rotate_ms: number; valid_for_ms: number; expires_at: string; }
export interface BleStudentStatus { session_id: string; required_minutes: number; dwell_minutes: number; progress: number; secured: boolean; anchor_required: boolean; last_seen_at: string | null; ends_at: string; awaiting_teacher: boolean; }

export async function startBleSession(timetableId: string): Promise<any> {
  const r = await api.post('/ble/start-session', { timetableId });
  return r.data.data;
}

export async function myBleSession(): Promise<BleTeacherSession | null> {
  const r = await api.get('/ble/my-session');
  return r.data.data;
}

export async function bleScan(beaconId: string, rssi: number): Promise<any> {
  const r = await api.post('/ble/scan', { beaconId, rssi });
  return r.data.data;
}

export async function bleStatus(): Promise<BleStudentStatus | null> {
  const r = await api.get('/ble/status');
  return r.data.data;
}

export async function finalizeBle(sessionId: string): Promise<{ present: number; low: number; absent: number; review_required: number; class_session_id: string }> {
  const r = await api.post(`/ble/finalize/${sessionId}`);
  return r.data.data;
}

export async function cancelBle(sessionId: string): Promise<{ class_session_id: string }> {
  const response = await api.post(`/ble/cancel/${sessionId}`);
  return response.data.data;
}

// ---- Timetable + quick session start ----
export interface TimetableSlot {
  timetable_id: string; day_of_week: string; start_time: string; end_time: string; room_no: string | null;
  session_type: string; subject: { subject_code: string; subject_name: string }; section: { section_name: string };
}

export async function myTimetable(teacherId?: string): Promise<TimetableSlot[]> {
  const r = await api.get('/timetable', { params: teacherId ? { teacherId } : {} });
  return r.data.data;
}

export async function quickStartSession(timetableId: string): Promise<{ session_id: string; status: string }> {
  const r = await api.post('/sessions/quick-start', { timetableId });
  return r.data.data;
}

// ---- Biometric enrollment (root of trust) ----
export type EnrollmentTrustState =
  | 'UNENROLLED' | 'PENDING_SUPERVISED_ENROLLMENT' | 'ACTIVE' | 'REVOKED' | 'REQUIRES_REENROLLMENT';
export type EnrollmentMethod =
  | 'SUPERVISED_STAFF' | 'INSTITUTIONAL_ID_CARD' | 'REGISTRATION_RECORD'
  | 'TRUSTED_IDENTITY_SYSTEM' | 'BIOMETRIC_ENROLLMENT_STATION';

export interface EnrollmentInfo {
  enrollment_trust_state: EnrollmentTrustState;
  enrollment: { status: string; method: EnrollmentMethod; biometric_version: number; hasFace: boolean; faceCapturedAt: string | null } | null;
}

export async function getEnrollment(studentId: string): Promise<EnrollmentInfo> {
  const r = await api.get(`/enrollment/biometric/${studentId}`);
  return r.data.data;
}

// Supervised (staff-operated) initial enrollment. Students cannot call this for themselves.
export async function superviseEnroll(studentId: string, enrollmentMethod: EnrollmentMethod, livenessPassed: boolean, deviceId?: string) {
  const r = await api.post('/enrollment/biometric', { studentId, enrollmentMethod, livenessPassed, deviceId });
  return r.data.data;
}

export async function reEnroll(studentId: string, enrollmentMethod: EnrollmentMethod, livenessPassed: boolean, deviceId?: string) {
  const r = await api.post('/enrollment/biometric/reenroll', { studentId, enrollmentMethod, livenessPassed, deviceId });
  return r.data.data;
}

// Roster for staff-side enrollment (reuses admin students list).
export async function listStudents(): Promise<{ student_id: string; name: string; roll_no: string; enrollment_trust_state?: EnrollmentTrustState }[]> {
  const r = await api.get('/students');
  return r.data.data ?? [];
}

export { errMsg, api };
