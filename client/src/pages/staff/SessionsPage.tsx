import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { RowSkeleton } from '../../components/skeletons';

interface Session {
  session_id: string;
  status: string;
  date: string;
  start_time: string;
  subject: { subject_code: string; subject_name: string };
  section: { section_name: string };
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.get('/sessions').then((r) => setSessions(r.data.data))
      .finally(() => setLoading(false));
  }, []);

  const shown = sessions.filter((s) => filter === 'all' || s.status === filter);

  return (
    <div className="flex flex-col gap-4">
      <div className="text-bone text-lg font-semibold">Sessions</div>
      <div className="flex gap-2">
        {['all', 'open', 'submitted', 'locked'].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`badge ${filter === f ? 'badge-absent' : 'badge-neutral'} cursor-pointer`}>
            {f}
          </button>
        ))}
      </div>
      {loading ? (
        <RowSkeleton />
      ) : (
        <>
{shown.map((s) => (
        <Link key={s.session_id} to={`/staff/sessions/${s.session_id}`} className="glass-medium rounded-xl px-4 py-3 flex items-center justify-between no-underline text-bone">
          <div>
            <div className="font-medium">{s.subject.subject_name}</div>
            <div className="text-muted text-xs">{s.section.section_name} · {new Date(s.date).toLocaleDateString()} {s.start_time.slice(0, 5)}</div>
          </div>
          <span className={`badge ${s.status === 'open' ? 'badge-present' : s.status === 'locked' ? 'badge-neutral' : 'badge-medical'}`}>{s.status}</span>
        </Link>
      ))}
      {!shown.length && <div className="text-ash">No sessions.</div>}
        </>
      )}
    </div>
  );
}
