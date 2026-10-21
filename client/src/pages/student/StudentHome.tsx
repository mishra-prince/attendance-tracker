import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Bluetooth, ArrowUpRight, ChevronRight, CalendarDays, QrCode, BookOpen, RefreshCw } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useAuth } from '../../store/auth';
import { Stagger, StaggerItem } from '../../components/motion';

interface Summary {
  overall: { percentage: number | null; eligible_sessions: number; counted_present: number };
  subjects: { subject_code: string; subject_name: string; percentage: number | null }[];
  rules: { minimum_attendance_percentage: number };
  condonation: { classes_can_still_miss: number | null; classes_needed_to_reach_threshold: number | null };
}

export default function StudentHome() {
  const user = useAuth((s) => s.user)!;
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (!user.studentId) { setError('Your student profile is not ready. Contact your institution to finish enrollment.'); return; }
    setError('');
    api.get('/students/' + user.studentId + '/attendance/summary')
      .then((r) => { if (!cancelled) setData(r.data.data); })
      .catch((e) => { if (!cancelled) setError(errMsg(e)); });
    return () => { cancelled = true; };
  }, [user.studentId, attempt]);

  const pct = data?.overall.percentage;
  const minimum = data?.rules.minimum_attendance_percentage;
  const below = pct != null && minimum != null && pct < minimum;
  const date = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date());
  return (
    <Stagger className="student-page flex flex-col gap-7">
      <StaggerItem className="flex items-center justify-between gap-4">
        <div><p className="eyebrow">{date}</p><h1 className="page-title">Hello, {user.name?.split(' ')[0] || 'there'}<span className="text-signal">.</span></h1><p className="text-ash text-sm mt-1">A little consistency goes a long way.</p></div>
        <Link to="/student/notifications" className="icon-tile no-underline shrink-0" aria-label="Notifications"><Bell size={20} /></Link>
      </StaggerItem>
      <StaggerItem>
        <Link to="/student/auto" className="bluetooth-cta no-underline">
          <span className="icon-tile bluetooth-tile"><Bluetooth size={25} /></span>
          <div className="min-w-0"><p className="eyebrow">NO CARDS. JUST YOUR PHONE.</p><h2 className="text-lg font-semibold">Check in with Bluetooth</h2><p className="text-ash text-sm mt-1">Open, connect, and focus on class.</p></div>
          <ArrowUpRight size={22} className="ml-auto shrink-0" />
        </Link>
      </StaggerItem>
      {error && <section className="notice notice-error" role="alert"><p>{error}</p><button onClick={() => setAttempt((n) => n + 1)} className="btn-ghost mt-3 flex items-center gap-2"><RefreshCw size={16} />Try again</button></section>}
      {!data && !error && <><div className="skeleton h-64" /><div className="skeleton h-32" /></>}
      {data && <>
        <StaggerItem className="overview-grid">
          <section className="attendance-card glass-medium">
            <div className="flex justify-between items-center gap-3"><p className="eyebrow">YOUR ATTENDANCE</p><span className={'badge ' + (pct == null ? 'badge-neutral' : below ? 'badge-late' : 'badge-present')}>{pct == null ? 'Getting started' : below ? 'Needs attention' : 'On track'}</span></div>
            <div className="attendance-ring">
              <svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="86" className="ring-track" /><circle cx="100" cy="100" r="86" className="ring-value" strokeDasharray={2 * Math.PI * 86} strokeDashoffset={2 * Math.PI * 86 * (1 - Math.min(100, Math.max(0, pct ?? 0)) / 100)} /></svg>
              <div className="ring-label"><span>{pct == null ? '—' : Math.round(pct)}{pct != null && <small>%</small>}</span><p>overall attendance</p></div>
            </div>
            <p className="text-ash text-sm text-center">{pct == null ? 'Your attendance will appear after your first recorded class.' : 'Your institution’s minimum is ' + minimum + '%.'}</p>
            <div className="attendance-metrics"><div><strong>{data.overall.counted_present}</strong><span>Counted present</span></div><div><strong>{data.overall.eligible_sessions}</strong><span>Eligible classes</span></div></div>
          </section>
          <div className="flex flex-col gap-4">
            <section className="glass-medium rounded-2xl p-5 flex-1"><span className="icon-tile mb-4"><BookOpen size={20} /></span><p className="eyebrow">PLAN AHEAD</p><h2 className="text-xl font-semibold mt-2">{pct == null ? 'A fresh start' : below ? 'Every class counts' : 'Keep your momentum'}</h2><p className="text-ash text-sm leading-relaxed mt-3">{pct == null ? 'Join your class and start building your attendance record.' : below ? 'Attend ' + (data.condonation.classes_needed_to_reach_threshold ?? 'your next') + ' more classes to reach the minimum.' : 'You can miss ' + (data.condonation.classes_can_still_miss ?? 0) + ' further classes while staying at or above your minimum.'}</p><Link to={below ? '/student/condonation' : '/student/sessions'} className="text-sm text-bone mt-5 flex justify-between items-center no-underline">{below ? 'View your options' : 'View class sessions'}<ChevronRight size={16} /></Link></section>
            <div className="grid grid-cols-2 gap-3"><Link to="/student/scan" className="quick-action"><QrCode size={20} /><span>Scan QR</span></Link><Link to="/student/sessions" className="quick-action"><CalendarDays size={20} /><span>Sessions</span></Link></div>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="flex justify-between items-center mb-4"><h2 className="text-lg font-semibold">Subject breakdown</h2><span className="text-xs text-ash">{data.subjects.length} subjects</span></div>
          <div className="glass-medium rounded-2xl overflow-hidden">
            {data.subjects.length === 0 && <p className="p-6 text-sm text-ash">No enrolled subjects yet. Join your class below or contact your teacher.</p>}
            {data.subjects.map((subject, index) => (
              <div key={subject.subject_code} className="subject-row">
                <span className="subject-index">{String(index + 1).padStart(2, '0')}</span>
                <div className="min-w-0 flex-1"><h3 className="text-sm font-medium">{subject.subject_name}</h3><p className="text-xs text-ash mt-1">{subject.subject_code}</p><div className="subject-track mt-3"><div style={{ width: Math.min(100, Math.max(0, subject.percentage ?? 0)) + '%' }} /></div></div>
                <span className={'badge ' + (subject.percentage == null ? 'badge-neutral' : subject.percentage < data.rules.minimum_attendance_percentage ? 'badge-late' : 'badge-present')}>{subject.percentage == null ? 'No record' : Math.round(subject.percentage) + '%'}</span>
              </div>
            ))}
          </div>
        </StaggerItem>
      </>}
      <StaggerItem><Link to="/student/join" className="fallback-link"><span className="text-ash">Have a class invite?</span><span>Join a class</span><ChevronRight size={16} /></Link></StaggerItem>
    </Stagger>
  );
}
