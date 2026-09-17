import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { RowSkeleton } from '../../components/skeletons';

interface Notif {
  notification_id: string;
  message: string;
  type: string;
  sent_at: string;
  read_at: string | null;
}

const TYPE_COLORS: Record<string, string> = {
  leave_status: 'bg-emerald-500/20 text-emerald-300',
  correction_status: 'bg-blue-500/20 text-blue-300',
  attendance_alert: 'bg-rose-500/20 text-rose-300',
  session_update: 'bg-amber-500/20 text-amber-300',
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => api.get('/notifications').then(r => { setItems(r.data.data ?? []); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => {
    try { await api.put(`/notifications/${id}/read`); } catch {}
    load();
  };

  const fmt = (s: string) => new Date(s).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-xl font-semibold text-white">Notifications</h1>
      {loading && <RowSkeleton rows={4} />}
      {!loading && items.length === 0 && (
        <div className="glass-card p-6 text-center text-white/50">No notifications yet</div>
      )}
      {!loading && items.map(n => (
        <div key={n.notification_id} className={`glass-card p-4 flex items-start gap-3 ${n.read_at ? 'opacity-50' : ''}`}>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${TYPE_COLORS[n.type] ?? 'bg-white/10 text-white/70'}`}>
                {n.type.replace('_', ' ')}
              </span>
              <span className="text-white/40 text-xs">{fmt(n.sent_at)}</span>
              {!n.read_at && <span className="w-2 h-2 rounded-full bg-signal-red" />}
            </div>
            <div className="text-white/90 text-sm">{n.message}</div>
          </div>
          {!n.read_at && (
            <button onClick={() => markRead(n.notification_id)}
              className="text-xs text-blue-300 hover:text-blue-200 whitespace-nowrap mt-1">
              Mark read
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
