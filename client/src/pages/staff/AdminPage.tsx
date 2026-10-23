import { useEffect, useState } from 'react';
import { api, errMsg } from '../../lib/api';
import { FLAGS_META, useFlags } from '../../lib/features';
import { useAuth } from '../../store/auth';
import { Link } from 'react-router-dom';

type Row = Record<string, string>;

// Splits a CSV line honoring double-quoted fields (so "Rao, S." stays one cell)
// and "" escaped quotes. Good enough for the admin bulk-import format.
function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur); cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseCSV(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).filter((l) => l.trim()).map((l) => {
    const cells = splitCSVLine(l);
    const row: Row = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

export default function AdminPage() {
  const user = useAuth((s) => s.user)!;
  const [minPct, setMinPct] = useState(75);
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [tab, setTab] = useState<'students' | 'teachers'>('students');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  // create teacher form
  const [tName, setTName] = useState('');
  const [tEmail, setTEmail] = useState('');
  const [tEmpId, setTEmpId] = useState('');
  const [tDept, setTDept] = useState('');
  const [depts, setDepts] = useState<any[]>([]);
  // csv
  const [csvText, setCsvText] = useState('');
  const [csvResult, setCsvResult] = useState<any>(null);
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

  useEffect(() => {
    api.get('/settings').then((r) => setMinPct(Number(r.data.data.minimum_attendance_percentage ?? 75))).catch(() => {});
    api.get('/students').then((r) => setStudents(r.data.data)).catch(() => {});
    api.get('/catalog/departments').then((r) => setDepts(r.data.data)).catch(() => {});
  }, []);

  async function loadTeachers() {
    try {
      const r = await api.get('/teachers');
      setTeachers(r.data.data);
    } catch { /* teachers list may need separate endpoint */ }
  }
  useEffect(() => { if (isAdmin) loadTeachers(); }, [isAdmin]);

  async function saveSetting() {
    setErr(''); setMsg('');
    try {
      await api.put('/settings/minimum_attendance_percentage', { value: String(minPct) });
      setMsg('✓ Saved');
    } catch (e) { setErr(errMsg(e)); }
  }

  async function createTeacher() {
    setErr(''); setMsg('');
    try {
      await api.post('/teachers', {
        name: tName, email: tEmail, employee_id: tEmpId,
        department_id: tDept, password: 'Password@123',
      });
      setMsg(`✓ Teacher ${tName} created (password: Password@123)`);
      setTName(''); setTEmail(''); setTEmpId('');
      loadTeachers();
    } catch (e) { setErr(errMsg(e)); }
  }

  async function runImport(type: 'students' | 'teachers') {
    setErr(''); setMsg(''); setCsvResult(null);
    const rows = parseCSV(csvText);
    if (rows.length === 0) { setErr('Paste CSV with a header row'); return; }
    try {
      const r = await api.post('/bulk-import', { type, rows });
      setCsvResult(r.data.data);
      if (type === 'students') api.get('/students').then((x) => setStudents(x.data.data)).catch(() => {});
      else loadTeachers();
    } catch (e) { setErr(errMsg(e)); }
  }

  const { flags, setFlag } = useFlags();

  if (!isAdmin) {
    return <div className="text-ash">Admin tools are for ADMIN / SUPER_ADMIN roles.</div>;
  }

  const studentCsvHint = 'name,email,roll_no,course_code,section_name\nRavi Kumar,ravi@att.edu,CS2026005,CSE101,A';
  const teacherCsvHint = 'name,email,employee_id,department_code\nS. Rao,rao@att.edu,T100,CSE';

  return (
    <div className="flex flex-col gap-6">
      <div className="text-bone text-lg font-semibold">Admin</div>
      <Link to="/staff/rfid/manage" className="glass-medium rounded-2xl p-5 block"><span className="font-semibold">Register students & manage RFID →</span><span className="block text-sm text-ash mt-1">Class and section rosters, card registration/reset, readers and students leaving college.</span></Link>

      {/* Minimum attendance setting */}
      <div className="glass-medium rounded-2xl p-5 flex flex-col gap-3 w-full max-w-sm">
        <div className="font-medium">Minimum attendance %</div>
        <input className="input" type="number" min={0} max={100} value={minPct} onChange={(e) => { const v = e.target.value; if (v !== '') setMinPct(Math.max(0, Math.min(100, Number(v)))); }} />
        <button className="btn-primary w-fit" onClick={saveSetting}>Save</button>
      </div>

      {/* Feature flags */}
      <div className="glass-medium rounded-2xl p-5 flex flex-col gap-3 w-full max-w-sm">
        <div className="font-medium">Feature flags</div>
        {flags === null ? (
          <div className="skeleton h-10 w-full" />
        ) : (
          FLAGS_META.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm">{f.label}</div>
                <div className="text-muted text-xs">{f.desc}</div>
              </div>
              <button
                onClick={() => setFlag(f.key, !flags[f.key])}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${flags[f.key] ? 'bg-emerald-500' : 'bg-white/15'}`}
                aria-label={`Toggle ${f.label}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${flags[f.key] ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Teacher creation */}
      <div className="glass-medium rounded-2xl p-5 flex flex-col gap-3 w-full max-w-sm">
        <div className="font-medium">Create teacher</div>
        <input className="input" placeholder="Full name" value={tName} onChange={(e) => setTName(e.target.value)} />
        <input className="input" placeholder="Email" value={tEmail} onChange={(e) => setTEmail(e.target.value)} />
        <input className="input" placeholder="Employee ID" value={tEmpId} onChange={(e) => setTEmpId(e.target.value)} />
        <select className="input" value={tDept} onChange={(e) => setTDept(e.target.value)}>
          <option value="">Select department…</option>
          {depts.map((d) => <option key={d.department_id} value={d.department_id}>{d.name} ({d.code})</option>)}
        </select>
        <button className="btn-primary w-fit" onClick={createTeacher} disabled={!tName || !tEmail || !tEmpId || !tDept}>
          Create (default password: Password@123)
        </button>
      </div>

      {/* Bulk import */}
      <div className="glass-medium rounded-2xl p-5 flex flex-col gap-3 w-full">
        <div className="font-medium">Bulk import (CSV)</div>
        <div className="flex gap-2">
          <button className={`badge ${tab === 'students' ? 'badge-neutral' : ''}`} onClick={() => { setTab('students'); setCsvResult(null); }}>Students</button>
          <button className={`badge ${tab === 'teachers' ? 'badge-neutral' : ''}`} onClick={() => { setTab('teachers'); setCsvResult(null); }}>Teachers</button>
        </div>
        <div className="text-muted text-xs">
          {tab === 'students'
            ? 'Columns: name,email,roll_no,course_code,section_name (optional: phone,parent_email,password)'
            : 'Columns: name,email,employee_id,department_code (optional: password)'}
        </div>
        <textarea
          className="input font-mono text-xs min-h-28"
          placeholder={tab === 'students' ? studentCsvHint : teacherCsvHint}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
        />
        <button className="btn-primary w-fit" onClick={() => runImport(tab)}>Import</button>
        {csvResult && (
          <div className="text-sm">
            <div className={csvResult.failed === 0 ? 'text-green-400' : 'text-amber-400'}>
              {csvResult.created}/{csvResult.total} created, {csvResult.failed} failed
            </div>
            {csvResult.results.filter((x: any) => !x.ok).map((x: any) => (
              <div key={x.row} className="text-signal text-xs">Row {x.row} ({x.email}): {x.error}</div>
            ))}
          </div>
        )}
      </div>

      {msg && <div className="text-ash text-sm">{msg}</div>}
      {err && <div className="text-signal text-sm">{err}</div>}

      {/* User lists */}
      <div className="flex flex-col gap-2">
        <div className="text-ash text-sm">Students ({students.length})</div>
        {students.map((s) => (
          <div key={s.student_id} className="glass-medium rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <div className="font-medium">{s.name}</div>
              <div className="text-muted text-xs">{s.email} · roll {s.roll_no}</div>
            </div>
            <span className="badge badge-neutral">STUDENT</span>
          </div>
        ))}
      </div>

      {teachers.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-ash text-sm">Teachers ({teachers.length})</div>
          {teachers.map((t) => (
            <div key={t.teacher_id} className="glass-medium rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-muted text-xs">{t.employee_id}</div>
              </div>
              <span className="badge badge-neutral">TEACHER</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
