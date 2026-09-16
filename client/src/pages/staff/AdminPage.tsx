import { useEffect, useState } from 'react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../store/auth';

export default function AdminPage() {
  const user = useAuth((s) => s.user)!;
  const [minPct, setMinPct] = useState(75);
  const [users, setUsers] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/settings').then((r) => setMinPct(Number(r.data.data.minimum_attendance_percentage ?? 75))).catch(() => {});
    api.get('/students').then((r) => setUsers(r.data.data.map((s: any) => ({ user_id: s.student_id, name: s.name, email: s.roll_no, role: 'STUDENT' })))).catch(() => {});
  }, []);

  async function saveSetting() {
    setErr(''); setMsg('');
    try {
      await api.put(`/settings/minimum_attendance_percentage`, { value: String(minPct) });
      setMsg('✓ Saved');
    } catch (e) { setErr(errMsg(e)); }
  }

  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    return <div className="text-ash">Admin tools are for ADMIN / SUPER_ADMIN roles.</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-bone text-lg font-semibold">Admin</div>

      <div className="glass-medium rounded-2xl p-5 flex flex-col gap-3 w-full max-w-sm">
        <div className="font-medium">Minimum attendance %</div>
        <input className="input" type="number" min={0} max={100} value={minPct} onChange={(e) => setMinPct(Number(e.target.value))} />
        <button className="btn-primary w-fit" onClick={saveSetting}>Save</button>
        {msg && <div className="text-ash text-sm">{msg}</div>}
        {err && <div className="text-signal text-sm">{err}</div>}
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-ash text-sm">Users ({users.length})</div>
        {users.map((u) => (
          <div key={u.user_id} className="glass-medium rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <div className="font-medium">{u.name}</div>
              <div className="text-muted text-xs">{u.email}</div>
            </div>
            <span className="badge badge-neutral">{u.role}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
