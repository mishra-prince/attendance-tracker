import { useState } from 'react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../store/auth';

export default function StudentProfile() {
  const user = useAuth((s) => s.user)!;
  const logout = useAuth((s) => s.logout);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function applyLeave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await api.post('/leave', { reason, fromDate: new Date().toISOString().slice(0, 10), toDate: new Date().toISOString().slice(0, 10) });
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
        <textarea className="input min-h-24" placeholder="Reason…" value={reason} onChange={(e) => setReason(e.target.value)} required />
        <button className="btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</button>
        {msg && <div className="text-sm text-ash">{msg}</div>}
      </form>

      <button className="btn-ghost" onClick={logout}>Sign out</button>
    </div>
  );
}
