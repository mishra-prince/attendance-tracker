import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, ClipboardCheck, Loader2 } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../store/auth';
import { useFlags } from '../../lib/features';
import { myTimetable, quickStartSession, startBleSession, type TimetableSlot } from '../../lib/features';
import { Page } from '../../components/motion';
import { RowSkeleton } from '../../components/skeletons';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TakeAttendance() {
  const user = useAuth((s) => s.user)!;
  const nav = useNavigate();
  const { flags } = useFlags();
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');

  const todayName = DAYS[new Date().getDay()];

  useEffect(() => {
    myTimetable(user.role === 'TEACHER' ? user.teacherId : undefined)
      .then((rows) => setSlots(rows ?? []))
      .catch((e) => setErr(errMsg(e)))
      .finally(() => setLoading(false));
  }, [user.teacherId, user.role]);

  async function manual(slot: TimetableSlot) {
    setBusyId(slot.timetable_id); setErr('');
    try {
      const s = await quickStartSession(slot.timetable_id);
      nav(`/staff/sessions/${s.session_id}`);
    } catch (e) { setErr(errMsg(e)); } finally { setBusyId(''); }
  }

  async function ble(slot: TimetableSlot) {
    setBusyId(slot.timetable_id + '-ble'); setErr('');
    try {
      await startBleSession(slot.timetable_id);
      nav('/staff/ble');
    } catch (e) { setErr(errMsg(e)); } finally { setBusyId(''); }
  }

  const today = slots.filter((s) => s.day_of_week === todayName);
  const rest = slots.filter((s) => s.day_of_week !== todayName);

  const Card = ({ slot }: { slot: TimetableSlot }) => (
    <div className="glass-medium rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-bone">{slot.subject.subject_name}</div>
          <div className="text-muted text-xs">
            {slot.subject.subject_code} · {slot.section.section_name} · {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
            {slot.room_no ? ` · ${slot.room_no}` : ''}
          </div>
        </div>
        <span className="badge badge-neutral">{slot.day_of_week}</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button className="btn-primary !py-2 !px-4 text-sm flex items-center gap-1.5" disabled={!!busyId} onClick={() => manual(slot)}>
          {busyId === slot.timetable_id ? <Loader2 size={15} className="animate-spin" /> : <ClipboardCheck size={15} />}
          Take attendance
        </button>
        {flags?.ble_auto_attendance && (
          <button className="btn-ghost !py-2 !px-4 text-sm flex items-center gap-1.5" disabled={!!busyId} onClick={() => ble(slot)}>
            {busyId === slot.timetable_id + '-ble' ? <Loader2 size={15} className="animate-spin" /> : <Radio size={15} />}
            Start BLE
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Page className="flex flex-col gap-5">
      <div>
        <div className="text-bone text-lg font-semibold">Take Attendance</div>
        <div className="text-ash text-sm mt-0.5">Pick a class to open a session and mark students.</div>
      </div>

      {loading && <RowSkeleton rows={4} />}
      {err && <div role="alert" className="text-signal text-sm">{err}</div>}

      {!loading && !err && slots.length === 0 && (
        <div className="glass-medium rounded-2xl p-6 text-center text-ash">
          No classes in your timetable yet. Use the AI Timetable Analyzer to add your schedule.
        </div>
      )}

      {today.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="text-ash text-sm">Today ({todayName})</div>
          {today.map((s) => <Card key={s.timetable_id} slot={s} />)}
        </div>
      )}

      {rest.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="text-ash text-sm">Other days</div>
          {rest.map((s) => <Card key={s.timetable_id} slot={s} />)}
        </div>
      )}
    </Page>
  );
}
