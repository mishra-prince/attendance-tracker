import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../store/auth';

interface Row {
  roll_no: string;
  name: string;
  percentage: number;
}
interface Session {
  session_id: string;
  status: string;
  date: string;
  start_time: string;
  subject: { subject_code: string; subject_name: string };
  section: { section_name: string };
}

export default function StaffHome() {
  const user = useAuth((s) => s.user)!;
  const [sessions, setSessions] = useState<Session[]>([]);
  const [defaulters, setDefaulters] = useState<Row[]>([]);

  useEffect(() => {
    api.get('/sessions').then((r) => setSessions(r.data.data.slice(0, 5))).catch(() => {});
    api.get('/analytics/defaulters').then((r) => setDefaulters(r.data.data.defaulters.slice(0, 5))).catch(() => {});
  }, []);

  const open = sessions.filter((s) => s.status === 'open').length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-ash text-sm">Welcome back</div>
        <div className="text-bone text-xl font-semibold">{user.name}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="glass-medium rounded-2xl p-5">
          <div className="display-numeral !text-5xl text-bone">{open}</div>
          <div className="text-ash text-sm mt-1">Open sessions now</div>
        </div>
        <div className="glass-medium rounded-2xl p-5">
          <div className="display-numeral !text-5xl text-signal">{defaulters.length}</div>
          <div className="text-ash text-sm mt-1">Defaulters below 75%</div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="text-ash text-sm">Recent sessions</div>
        {sessions.map((s) => (
          <Link key={s.session_id} to={`/staff/sessions/${s.session_id}`} className="glass-medium rounded-xl px-4 py-3 flex items-center justify-between no-underline text-bone">
            <div>
              <div className="font-medium">{s.subject.subject_name}</div>
              <div className="text-muted text-xs">{s.section.section_name} · {new Date(s.date).toLocaleDateString()} {s.start_time.slice(0, 5)}</div>
            </div>
            <span className={`badge ${s.status === 'open' ? 'badge-present' : s.status === 'locked' ? 'badge-neutral' : 'badge-medical'}`}>{s.status}</span>
          </Link>
        ))}
        {!sessions.length && <div className="text-ash">No sessions yet.</div>}
      </div>

      {defaulters.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="text-ash text-sm">Below threshold</div>
          {defaulters.map((d) => (
            <div key={d.roll_no} className="glass-medium rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{d.name}</div>
                <div className="text-muted text-xs">{d.roll_no}</div>
              </div>
              <span className="badge badge-absent">{Math.round(d.percentage)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
