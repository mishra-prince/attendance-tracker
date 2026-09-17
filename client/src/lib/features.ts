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
export interface BleTeacherSession { session_id: string; subject_id: string; section_id: string; required_minutes: number; pings: number; students_seen: number; beacon_id: string; window: number; rotate_ms: number; }
export interface BleStudentStatus { session_id: string; required_minutes: number; dwell_minutes: number; progress: number; secured: boolean; anchor_required: boolean; }

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

export async function finalizeBle(sessionId: string): Promise<{ present: number; low: number; absent: number }> {
  const r = await api.post(`/ble/finalize/${sessionId}`);
  return r.data.data;
}

export { errMsg, api };
