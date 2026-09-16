import { useEffect, useState } from 'react';
import { api, errMsg } from '../../lib/api';

interface Item { id: string; kind: 'correction' | 'leave'; title: string; sub: string; detail: string }

export default function ApprovalsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [msg, setMsg] = useState('');

  async function load() {
    const [corr, leave] = await Promise.all([
      api.get('/attendance/corrections?status=pending').then((r) => r.data.data).catch(() => []),
      api.get('/leave?status=pending').then((r) => r.data.data).catch(() => []),
    ]);
    const mapped: Item[] = [
      ...corr.map((c: any) => ({
        id: c.correction_id, kind: 'correction' as const,
        title: `${c.student?.name || 'Student'} — ${c.old_status} → ${c.requested_status}`,
        sub: 'Attendance correction', detail: c.reason,
      })),
      ...leave.map((l: any) => ({
        id: l.leave_id, kind: 'leave' as const,
        title: l.student?.name || l.user?.name || 'Student',
        sub: `Leave ${l.from_date} → ${l.to_date}`, detail: l.reason,
      })),
    ];
    setItems(mapped);
  }

  async function decideRej(kind: 'correction' | 'leave', id: string) {
    try {
      if (kind === 'correction') await api.put(`/attendance/corrections/${id}/reject`, { reason: 'Rejected by HOD' });
      else await api.put(`/leave/${id}/reject`, { reason: 'Rejected by HOD' });
      setMsg('✓ rejected');
      await load();
    } catch (e) { setMsg(errMsg(e)); }
  }

  useEffect(() => { load(); }, []);

  async function decide(kind: 'correction' | 'leave', id: string, action: 'approved' | 'rejected') {
    try {
      if (kind === 'correction') await api.put(`/attendance/corrections/${id}/approve`);
      else await api.put(`/leave/${id}/approve`);
      setMsg(`✓ ${action}`);
      await load();
    } catch (e) { setMsg(errMsg(e)); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-bone text-lg font-semibold">Approvals</div>
      {items.map((it) => (
        <div key={it.kind + it.id} className="glass-medium rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{it.title}</div>
              <div className="text-muted text-xs">{it.sub} · {it.kind}</div>
            </div>
          </div>
          {it.detail && <div className="text-ash text-sm">{it.detail}</div>}
          <div className="flex gap-2">
            <button className="btn-primary !py-2 !px-4 text-sm" onClick={() => decide(it.kind, it.id, 'approved')}>Approve</button>
            <button className="btn-ghost !py-2 !px-4 text-sm" onClick={() => decideRej(it.kind, it.id)}>Reject</button>
          </div>
        </div>
      ))}
      {!items.length && <div className="text-ash">Nothing pending 🎉</div>}
      {msg && <div className="text-sm text-ash">{msg}</div>}
    </div>
  );
}
