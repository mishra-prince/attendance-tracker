import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { motion } from 'framer-motion';
import { api } from '../../lib/api';
import { useAuth } from '../../store/auth';
import { Stagger, StaggerItem, Pressable, spring } from '../../components/motion';

interface Summary {
  overall: { percentage: number | null; eligible_sessions: number; counted_present: number };
  subjects: { subject_code: string; subject_name: string; percentage: number | null }[];
  condonation: { classes_can_still_miss: number | null };
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
  if (!data)
    return (
      <div className="p-6 flex flex-col gap-4">
        <div className="skeleton h-16 w-2/3" />
        <div className="skeleton h-40 w-full" />
        <div className="skeleton h-16 w-full" />
        <div className="skeleton h-16 w-full" />
      </div>
    );

  const pct = data.overall.percentage == null ? 0 : Math.round(data.overall.percentage);
  const hasData = data.overall.percentage != null;
  const pctColor = !hasData || pct >= 75 ? 'text-bone' : 'text-signal';

  return (
    <Stagger className="p-6 flex flex-col gap-6">
      <StaggerItem className="flex items-start justify-between">
        <div>
          <div className="text-ash text-sm">Good day</div>
          <div className="text-bone text-xl font-semibold">{user.name}</div>
        </div>
        <Link to="/student/notifications" className="glass-chip p-2 rounded-full no-underline" aria-label="Notifications">
          <Bell size={18} className="text-bone" />
        </Link>
      </StaggerItem>

      <StaggerItem className="glass-medium rounded-2xl p-6 text-center relative overflow-hidden sweep card-lift">
        <div className={`display-numeral ${pctColor}`}>{pct}<span className="text-3xl text-ash">%</span></div>
        <div className="text-ash text-sm mt-2">
          {data.overall.counted_present}/{data.overall.eligible_sessions} classes · you can still miss{' '}
          <span className="text-signal font-medium">{data.condonation.classes_can_still_miss ?? 0}</span>
        </div>
      </StaggerItem>

      <div className="grid gap-3">
        {(data.subjects ?? []).map((s) => {
          const ok = s.percentage == null || s.percentage >= 75;
          return (
            <StaggerItem key={s.subject_code} className="glass-medium rounded-xl px-4 py-3 flex items-center justify-between card-lift">
              <div>
                <div className="font-medium">{s.subject_name}</div>
                <div className="text-muted text-xs">{s.subject_code}</div>
              </div>
              <span className={`badge ${ok ? 'badge-present' : 'badge-absent'}`}>
                {s.percentage == null ? '—' : `${Math.round(s.percentage)}%`}
              </span>
            </StaggerItem>
          );
        })}
      </div>

      {'classes_needed_to_reach_threshold' in data.condonation && (data.condonation as any).classes_needed_to_reach_threshold > 0 && (
        <StaggerItem><Link to="/student/condonation" className="glass-medium rounded-2xl p-4 no-underline flex items-center justify-between card-lift">
          <div>
            <div className="text-signal font-medium text-sm">Below minimum attendance</div>
            <div className="text-ash text-xs mt-0.5">Apply for condonation →</div>
          </div>
          <span className="text-signal text-lg">⚠</span>
        </Link></StaggerItem>
      )}

      <StaggerItem>
        <motion.div whileTap={{ scale: 0.97 }} transition={spring}>
          <Link to="/student/scan" className="btn-primary text-center no-underline block pulse-glow">Scan QR to check in</Link>
        </motion.div>
      </StaggerItem>

      <StaggerItem>
        <Link to="/student/join" className="glass-medium rounded-xl px-4 py-3 no-underline flex items-center justify-between card-lift">
          <div>
            <div className="text-bone text-sm font-medium">Join a class</div>
            <div className="text-ash text-xs mt-0.5">Enter a code from your teacher</div>
          </div>
          <span className="text-ash">›</span>
        </Link>
      </StaggerItem>
    </Stagger>
  );
}
