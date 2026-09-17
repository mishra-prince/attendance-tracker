import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../store/auth';
import { RowSkeleton } from '../../components/skeletons';

interface Att {
  attendance_id: string;
  status: string;
  session: { date: string; start_time: string; subject: { subject_code: string; subject_name: string } };
}

const badge = (s: string) =>
  s === 'present' ? 'badge-present' : s === 'absent' ? 'badge-absent' : s === 'medical' ? 'badge-medical' : s === 'late' ? 'badge-late' : 'badge-neutral';

export default function StudentSessions() {
  const user = useAuth((s) => s.user)!;
  const [rows, setRows] = useState<Att[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user.studentId) return;
    api.get(`/students/${user.studentId}/attendance`).then((r) => setRows(r.data.data))
      .finally(() => setLoading(false));
  }, [user.studentId]);

  return (
    <div className="p-6 flex flex-col gap-3">
      <div className="text-bone text-lg font-semibold">My attendance</div>
      {rows.map((a) => (
        <div key={a.attendance_id} className="glass-medium rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-medium">{a.session.subject.subject_name}</div>
            <div className="text-muted text-xs">
              {a.session.subject.subject_code} · {new Date(a.session.date).toLocaleDateString()} · {a.session.start_time.slice(0, 5)}
            </div>
          </div>
          <span className={`badge ${badge(a.status)}`}>{a.status}</span>
        </div>
      ))}
      {!rows.length && <div className="text-ash">No records yet.</div>}
    </div>
  );
}
