import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../store/auth';

interface Summary {
  overall: { percentage: number; eligible_sessions: number; counted_present: number };
  subjects: { subject_code: string; subject_name: string; percentage: number }[];
  condonation: { classes_can_still_miss: number };
}

export default function StudentHome() {
  const user = useAuth((s) => s.user)!;
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!user.studentId) return;
    api.get(`/students/${user.studentId}/attendance/summary`)
      .then((r) => setData(r.data.data))
      .catch((e) => setErr(e.response?.data?.error || 'Failed to load'));
  }, [user.studentId]);

  if (err) return <div className="text-signal p-6">{err}</div>;
  if (!data) return <div className="text-ash p-6">Loading…</div>;

  const pct = Math.round(data.overall.percentage);
  const pctColor = pct >= 75 ? 'text-bone' : 'text-signal';

  return (
    <div className="p-6 flex flex-col gap-6">
      <div>
        <div className="text-ash text-sm">Good day</div>
        <div className="text-bone text-xl font-semibold">{user.name}</div>
      </div>

      <div className="glass-medium rounded-2xl p-6 text-center relative overflow-hidden sweep">
        <div className={`display-numeral ${pctColor}`}>{pct}<span className="text-3xl text-ash">%</span></div>
        <div className="text-ash text-sm mt-2">
          {data.overall.counted_present}/{data.overall.eligible_sessions} classes · you can still miss{' '}
          <span className="text-signal font-medium">{data.condonation.classes_can_still_miss}</span>
        </div>
      </div>

      <div className="grid gap-3">
        {data.subjects.map((s) => {
          const ok = s.percentage >= 75;
          return (
            <div key={s.subject_code} className="glass-medium rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{s.subject_name}</div>
                <div className="text-muted text-xs">{s.subject_code}</div>
              </div>
              <span className={`badge ${ok ? 'badge-present' : 'badge-absent'}`}>
                {Math.round(s.percentage)}%
              </span>
            </div>
          );
        })}
      </div>

      <Link to="/student/scan" className="btn-primary text-center no-underline">Scan QR to check in</Link>
    </div>
  );
}
