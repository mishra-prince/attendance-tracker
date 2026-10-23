import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api, errMsg } from '../../lib/api';
import { RowSkeleton, Skeleton } from '../../components/skeletons';

interface Rec { studentId: string; roll_no: string; name: string; status: string; dirty?: boolean }
interface Sess { session_id: string; status: string; subject: { subject_name: string; subject_code: string }; section: { section_name: string } }

export default function SessionMark() {
  const { id } = useParams();
  const [sess, setSess] = useState<Sess | null>(null);
  const [rows, setRows] = useState<Rec[]>([]);
  const [qr, setQr] = useState<{ token: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([
      api.get(`/sessions/${id}`),
      api.get(`/attendance/session/${id}`),
    ]).then(([s, a]) => {
      setSess(s.data.data);
      const students = new Map<string, { student_id: string; roll_no: string; name: string }>();
      for (const student of s.data.data.section.students) students.set(student.student_id, student);
      for (const record of a.data.data) students.set(record.student.student_id, record.student);
      setRows([...students.values()].map((student) => ({ studentId: student.student_id, roll_no: student.roll_no, name: student.name,
        status: a.data.data.find((r: any) => r.student.student_id === student.student_id)?.status || 'unmarked', dirty: false })));
    }).catch((e) => setErr(errMsg(e)));
  }, [id]);

  function setStatus(studentId: string, status: string) {
    setRows((rs) => rs.map((r) => (r.studentId === studentId ? { ...r, status, dirty: true } : r)));
  }

  async function save() {
    setMsg(''); setErr('');
    try {
      await api.post(`/sessions/${id}/attendance`, {
        records: rows.filter((r) => r.dirty).map((r) => ({ studentId: r.studentId, status: r.status })),
      });
      setRows((rs) => rs.map((r) => ({ ...r, dirty: false })));
      setMsg('✓ Saved');
    } catch (e) { setErr(errMsg(e)); }
  }

  async function transition(status: string) {
    setErr('');
    try {
      await api.put(`/sessions/${id}/status`, { status });
      setSess((s) => (s ? { ...s, status } : s));
      setMsg(`✓ Session ${status}`);
    } catch (e) { setErr(errMsg(e)); }
  }

  async function genQR() {
    setErr('');
    try {
      const r = await api.post('/attendance/qr/generate', { sessionId: id });
      setQr(r.data.data);
    } catch (e) { setErr(errMsg(e)); }
  }

  if (err && !sess) return <div className="text-signal">{err}</div>;
  if (!sess) return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-32" />
      <RowSkeleton rows={8} />
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-bone text-lg font-semibold">{sess.subject.subject_name}</div>
          <div className="text-muted text-sm">{sess.section.section_name} · {sess.subject.subject_code}</div>
        </div>
        <span className={`badge ${sess.status === 'open' ? 'badge-present' : sess.status === 'locked' ? 'badge-neutral' : 'badge-medical'}`}>{sess.status}</span>
      </div>

      <div className="flex gap-2 flex-wrap">
        {sess.status === 'scheduled' && <button className="btn-primary" onClick={() => transition('open')}>Open session</button>}
        {sess.status === 'open' && <button className="btn-ghost" onClick={() => transition('submitted')}>Submit</button>}
        {sess.status === 'submitted' && <button className="btn-ghost" onClick={() => transition('locked')}>Lock</button>}
        {sess.status === 'open' && !qr && <button className="btn-primary" onClick={genQR}>Show QR</button>}
      </div>

      {qr && (
        <div className="glass-medium rounded-2xl p-6 flex flex-col items-center gap-3 w-fit">
          <QRCodeSVG value={JSON.stringify({ token: qr.token })} size={200} bgColor="#1C1B1E" fgColor="#F5F1EE" />
          <div className="text-muted text-xs">Valid for 5 minutes</div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.studentId} className="glass-medium rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-medium">{r.name}</div>
              <div className="text-muted text-xs">{r.roll_no}</div>
              <div className="text-xs text-ash mt-1">Recorded: {r.status}</div>
            </div>
            <div className="flex gap-1.5">
              {['present', 'absent', 'late'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatus(r.studentId, st)}
                  className={`badge cursor-pointer ${r.status === st ? (st === 'present' ? 'badge-present' : st === 'absent' ? 'badge-absent' : 'badge-late') : 'badge-neutral'}`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button className="btn-primary w-fit" onClick={save} disabled={!rows.some((r) => r.dirty)}>Save changed attendance</button>
      <p className="text-xs text-muted">Only your selected changes are saved. Use RFID attendance for live entry and exit times.</p>
      {msg && <div className="text-ash text-sm">{msg}</div>}
      {err && <div className="text-signal text-sm">{err}</div>}
    </div>
  );
}
