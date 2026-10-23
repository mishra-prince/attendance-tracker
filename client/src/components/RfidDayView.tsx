import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../lib/api';
import { saveAttendanceFile } from '../lib/attendanceFiles';

interface Visit { entry_at: string; exit_at: string | null }
interface Row { student_id: string; name: string; roll_no: string; status: string; method: string | null; first_in: string | null; last_out: string | null; inside: boolean; missing_exit: boolean; visits: Visit[] }
interface ClassRow { key: string; session_id: string | null; subject: string; subject_code: string; section: string; teacher: string; room_no: string | null; start_time: string; end_time: string; status: string; roster: Row[] }
interface Day { date: string; time_zone: string; classes: ClassRow[] }

export default function RfidDayView({ student = false }: { student?: boolean }) {
  const [data, setData] = useState<Day | null>(null), [date, setDate] = useState('');
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  const [exporting, setExporting] = useState(false);
  async function exportDay() {
    setExporting(true);
    try { const r=await api.get('/rfid/export',{params:date?{date}:{},responseType:'blob'}); await saveAttendanceFile(new Blob([r.data],{type:'text/csv'}),`threshold-attendance-${data?.date || 'today'}.csv`); }
    catch(e){setError(errMsg(e));} finally{setExporting(false);}
  }
  useEffect(() => {
    let live = true, pending = false;
    const controller = new AbortController(); setLoading(true); setData(null);
    async function load() {
      if (pending) return; pending = true;
      try {
        const r = await api.get(student ? '/rfid/my-day' : '/rfid/day', { params: date ? { date } : {}, signal: controller.signal });
        if (live) { setData(r.data.data); setDate((old) => old || r.data.data.date); setError(''); }
      } catch (e) { if (live) setError(errMsg(e)); }
      finally { pending = false; if (live) setLoading(false); }
    }
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 10_000);
    return () => { live = false; controller.abort(); window.clearInterval(timer); };
  }, [student, date, refresh]);
  const clock = (value: string | null) => value && data ? new Date(value).toLocaleTimeString('en-IN', { timeZone: data.time_zone, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  return <section className="flex flex-col gap-4">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div><h1 className="text-xl font-semibold">{student ? 'My classes today' : 'RFID class attendance'}</h1><p className="text-sm text-ash mt-1">Entry and exit from registered classroom readers{data ? ` · ${data.time_zone}` : ''}</p></div>
      <div className="flex gap-2 items-center flex-wrap"><label className="sr-only" htmlFor="rfid-date">Attendance date</label><input id="rfid-date" className="input max-w-44" type="date" value={date} onChange={(e) => setDate(e.target.value)} /><button className="btn-ghost" onClick={() => setRefresh((n) => n + 1)}>Refresh</button><button className="btn-ghost" disabled={loading || exporting || !data} onClick={()=>void exportDay()}>{exporting?'Saving…':'Export for Excel'}</button></div>
    </div>
    {error && <p role="alert" className="text-signal text-sm">{error} Ask your administrator to check the RFID server setup if this feature is unavailable.</p>}
    {loading && <p role="status" className="text-ash">Loading classes…</p>}
    {!loading && data?.classes.length === 0 && <p className="text-ash">No classes or attendance records for this date.</p>}
    {data?.classes.map((c) => <article key={c.key} className="glass-medium rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold text-bone">{c.subject}</h2><p className="text-xs text-ash mt-1">{c.subject_code} · {c.section} · {c.start_time}–{c.end_time} · Room {c.room_no || 'unassigned'}</p><p className="text-xs text-muted mt-1">{c.teacher}</p></div><span className="badge badge-neutral h-fit">{c.status}</span></div>
      {student ? c.roster.map((r) => <div key={r.student_id} className="mt-4 flex flex-col gap-2"><span className={`badge w-fit ${r.status === 'present' ? 'badge-present' : r.status === 'unmarked' ? 'badge-neutral' : 'badge-late'}`}>{r.status === 'unmarked' ? 'No attendance recorded' : `${r.status} · ${r.method || 'staff'}`}</span><p className="text-sm">First entry <strong>{clock(r.first_in)}</strong> · Last exit <strong>{clock(r.last_out)}</strong></p>{r.inside && <p className="text-xs text-emerald-400">Entry recorded; exit not tapped yet</p>}{r.missing_exit && <p className="text-xs text-amber-300">Exit was not recorded. Contact your teacher if a correction is needed.</p>}{r.visits.length > 1 && <details className="text-xs text-ash"><summary>All entry and exit times</summary>{r.visits.map((v, i) => <p key={i} className="mt-1">{clock(v.entry_at)} → {clock(v.exit_at)}</p>)}</details>}</div>) : <details className="mt-4" open={data.classes.length === 1}><summary className="cursor-pointer text-sm text-ash">Class list · {c.roster.length} students · {c.roster.filter((r) => r.status !== 'unmarked').length} marked</summary><div className="mt-3 divide-y divide-white/10">{c.roster.map((r) => <div key={r.student_id} className="py-3 flex flex-wrap justify-between gap-2"><div><p className="text-sm font-medium">{r.name} <span className="text-muted text-xs">{r.roll_no}</span></p><p className="text-xs text-ash mt-1">In {clock(r.first_in)} · Out {clock(r.last_out)}</p>{r.missing_exit && <p className="text-xs text-amber-300">Missing exit</p>}{r.visits.length > 1 && <details className="text-xs text-ash"><summary>All taps</summary>{r.visits.map((v, i) => <p key={i}>{clock(v.entry_at)} → {clock(v.exit_at)}</p>)}</details>}</div><span className={`badge h-fit ${r.status === 'present' ? 'badge-present' : 'badge-neutral'}`}>{r.status}{r.method ? ` · ${r.method}` : ''}</span></div>)}{!c.roster.length && <p className="text-sm text-ash">No active enrolled students. Register students in this section first.</p>}</div>{c.session_id && <Link className="btn-ghost inline-block mt-3" to={`/staff/sessions/${c.session_id}`}>Review class attendance</Link>}</details>}
    </article>)}
    <p className="text-xs text-muted">A card tap records card presence. It does not verify the holder’s face. Exit times are never filled in automatically.</p>
  </section>;
}
