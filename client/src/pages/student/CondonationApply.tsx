import { useEffect, useState } from 'react';
import { api, errMsg } from '../../lib/api';
import { PageSkeleton } from '../../components/skeletons';
import { useAuth } from '../../store/auth';

interface Summary {
  overall: { percentage: number | null; eligible_sessions: number; counted_present: number };
  rules: { minimum_attendance_percentage: number };
  condonation: { classes_needed_to_reach_threshold: number | null; classes_can_still_miss: number | null };
}

export default function CondonationApply() {
  const user = useAuth((s) => s.user)!;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const [loadErr, setLoadErr] = useState('');

  useEffect(() => {
    if (!user.studentId) return;
    api.get(`/students/${user.studentId}/attendance/summary`)
      .then(r => setSummary(r.data.data))
      .catch(() => setLoadErr('Could not load your attendance status.'));
  }, [user.studentId]);

  const min = summary?.rules.minimum_attendance_percentage ?? 75;
  const pct = summary?.overall.percentage;
  const needed = summary?.condonation.classes_needed_to_reach_threshold;
  const canMiss = summary?.condonation.classes_can_still_miss;
  const eligible = pct !== null && pct !== undefined && pct < min;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const today = new Date().toISOString().slice(0, 10);
      await api.post('/leave', { reason: `[Condonation] ${reason}`, fromDate: today, toDate: today });
      setMsg('✓ Condonation request submitted for HOD review');
      setApplied(true);
      setReason('');
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (loadErr) return <div role="alert" className="text-signal p-6">{loadErr}</div>;
  if (!summary) return <PageSkeleton />;
  const neededSafe = needed ?? 0;
  const canMissSafe = canMiss ?? 0;

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="glass-medium rounded-2xl p-6">
        <div className="text-ash text-sm mb-1">Attendance status</div>
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-bold ${eligible ? 'text-signal' : 'text-bone'}`}>
            {pct != null ? `${Math.round(pct)}%` : '—'}
          </span>
          <span className="text-ash text-sm">/ {min}% required</span>
        </div>
        <div className="mt-3 text-sm">
          {eligible ? (
          <span className="text-amber-300">
            You are below the minimum. You need to attend the next {neededSafe} session{neededSafe === 1 ? '' : 's'} consecutively to reach {min}%, and you can apply for condonation below.
          </span>
          ) : (
            <span className="text-emerald-300">
              You are above the minimum — you can still miss {canMissSafe} more class{canMissSafe === 1 ? '' : 'es'}. No condonation needed.
            </span>
          )}
        </div>
      </div>

      {eligible && !applied && (
        <form onSubmit={submit} className="glass-medium rounded-2xl p-6 flex flex-col gap-4">
          <div className="font-medium">Apply for condonation</div>
          <div className="text-ash text-sm">Filed as: {user.name}</div>
          <textarea className="input min-h-24" placeholder="State the reason (medical, official duty, etc.)…"
            value={reason} onChange={(e) => setReason(e.target.value)} required />
          <button className="btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit condonation request'}</button>
          {msg && <div className="text-sm text-ash">{msg}</div>}
        </form>
      )}

      {applied && (
        <div className="glass-medium rounded-2xl p-6 text-emerald-300 text-sm">{msg}</div>
      )}
    </div>
  );
}
