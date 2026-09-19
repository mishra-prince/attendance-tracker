import { useState } from 'react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../store/auth';

export default function StudentProfile() {
  const user = useAuth((s) => s.user)!;
  const logout = useAuth((s) => s.logout);
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

      <form onSubmit={applyLeave} className="glass-medium rounded-2xl p-6 flex flex-col gap-4">
        <div className="font-medium">Apply for leave</div>
        <div className="flex gap-3">
          <label className="flex-1 text-ash text-xs">From
            <input type="date" className="input mt-1" value={fromDate} min={today} onChange={(e) => setFromDate(e.target.value)} required />
          </label>
          <label className="flex-1 text-ash text-xs">To
            <input type="date" className="input mt-1" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} required />
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
