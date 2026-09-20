import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { getEnrollment, type EnrollmentTrustState } from '../../lib/features';
import { useAuth } from '../../store/auth';

const ENROLL_UI: Record<EnrollmentTrustState, { label: string; hint: string; cls: string; Icon: typeof ShieldCheck }> = {
  ACTIVE: { label: 'Identity verified', hint: 'Your biometric identity is enrolled.', cls: 'text-emerald-300', Icon: ShieldCheck },
  UNENROLLED: { label: 'Not enrolled', hint: 'Visit the enrollment desk to verify your identity in person.', cls: 'text-ash', Icon: ShieldQuestion },
  PENDING_SUPERVISED_ENROLLMENT: { label: 'Pending enrollment', hint: 'Complete supervised enrollment at the desk.', cls: 'text-amber-300', Icon: ShieldQuestion },
  REVOKED: { label: 'Enrollment revoked', hint: 'Visit the enrollment desk to re-verify.', cls: 'text-signal', Icon: ShieldAlert },
  REQUIRES_REENROLLMENT: { label: 'Re-enrollment required', hint: 'New device detected — re-verify at the enrollment desk.', cls: 'text-amber-300', Icon: ShieldAlert },
};

export default function StudentProfile() {
  const user = useAuth((s) => s.user)!;
  const logout = useAuth((s) => s.logout);
  const [enroll, setEnroll] = useState<EnrollmentTrustState | null>(null);

  useEffect(() => {
    if (!user.studentId) return;
    getEnrollment(user.studentId).then((e) => setEnroll(e.enrollment_trust_state)).catch(() => {});
  }, [user.studentId]);
  const today = new Date().toISOString().slice(0, 10);
  const [reason, setReason] = useState('');
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function applyLeave(e: React.FormEvent) {
    e.preventDefault();
    if (new Date(toDate) < new Date(fromDate)) { setMsg('End date cannot be before start date'); return; }
    setBusy(true);
    setMsg('');
    try {
      await api.post('/leave', { reason, fromDate, toDate });
      setMsg('✓ Leave request submitted');
      setReason('');
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="glass-medium rounded-2xl p-6 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-b from-signal to-ember flex items-center justify-center text-xl font-semibold">
          {user.name?.[0]}
        </div>
        <div>
          <div className="font-semibold">{user.name}</div>
          <div className="text-ash text-sm">{user.email}</div>
        </div>
      </div>

      {enroll && (() => {
        const { label, hint, cls, Icon } = ENROLL_UI[enroll];
        return (
          <div className="glass-medium rounded-2xl p-4 flex items-start gap-3">
            <Icon size={20} className={`${cls} mt-0.5 shrink-0`} />
            <div>
              <div className={`text-sm font-medium ${cls}`}>{label}</div>
              <div className="text-ash text-xs mt-0.5">{hint}</div>
            </div>
          </div>
        );
      })()}

      <form onSubmit={applyLeave} className="glass-medium rounded-2xl p-6 flex flex-col gap-4">
        <div className="font-medium">Apply for leave</div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-ash text-xs min-w-0">From
            <input type="date" className="input mt-1 w-full min-w-0" value={fromDate} min={today} onChange={(e) => setFromDate(e.target.value)} required />
          </label>
          <label className="text-ash text-xs min-w-0">To
            <input type="date" className="input mt-1 w-full min-w-0" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} required />
          </label>
        </div>
        <textarea className="input min-h-24" placeholder="Reason…" value={reason} onChange={(e) => setReason(e.target.value)} required />
        <button className="btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</button>
        {msg && <div className="text-sm text-ash">{msg}</div>}
      </form>

      <button className="btn-ghost" onClick={logout}>Sign out</button>
    </div>
  );
}
