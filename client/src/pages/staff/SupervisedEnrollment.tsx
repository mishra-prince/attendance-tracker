import { useEffect, useState } from 'react';
import { ShieldCheck, ScanFace, Loader2, Search } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { listStudents, getEnrollment, type EnrollmentMethod, type EnrollmentInfo } from '../../lib/features';
import { enrollFace } from '../../lib/face';
import { hasNativeVerification } from '../../lib/verification';
import { useAuth } from '../../store/auth';
import { Page } from '../../components/motion';
import FacePolicy from '../../components/FacePolicy';

type Row = { student_id: string; name: string; roll_no: string };
export default function SupervisedEnrollment() {
  const user = useAuth((s) => s.user)!;
  const canRecover = ['HOD','ADMIN','SUPER_ADMIN'].includes(user.role);
  const [rows,setRows] = useState<Row[]>([]), [selected,setSelected] = useState<Row | null>(null);
  const [info,setInfo] = useState<EnrollmentInfo | null>(null), [query,setQuery] = useState('');
  const [loading,setLoading] = useState(true), [busy,setBusy] = useState(false), [error,setError] = useState(''), [message,setMessage] = useState('');
  const [confirmed,setConfirmed] = useState(false), [consent,setConsent] = useState(false), [replace,setReplace] = useState(false);
  const [method,setMethod] = useState<EnrollmentMethod>('INSTITUTIONAL_ID_CARD');
  useEffect(() => { let live=true; listStudents().then((r) => { if(live)setRows(r); }).catch((e) => { if(live)setError(errMsg(e)); }).finally(() => { if(live)setLoading(false); }); return () => {live=false;}; },[]);
  async function open(row: Row) {
    setSelected(row); setInfo(null); setConfirmed(false); setConsent(false); setReplace(false); setMessage(''); setError(''); setBusy(true);
    try { setInfo(await getEnrollment(row.student_id)); } catch(e) {setError(errMsg(e));} finally {setBusy(false);}
  }
  async function capture() {
    if(!selected || !confirmed || !consent) return;
    setBusy(true);setError('');setMessage('');
    try {
      await enrollFace({studentId:selected.student_id,replace,enrollmentMethod:method,idConfirmed:true,consentRecorded:true},setMessage);
      setInfo(await getEnrollment(selected.student_id)); setMessage('Approved face reference saved securely. The student can now verify in their own account during class.');
      setConfirmed(false);setConsent(false);setReplace(false);
    } catch(e) {setError(errMsg(e));setMessage('');} finally {setBusy(false);}
  }
  const needsRecovery = !!info && (!!info.enrollment?.hasFace || info.enrollment?.status === 'revoked' || info.enrollment_trust_state === 'REQUIRES_REENROLLMENT');
  return <Page className="flex flex-col gap-5">
    <div className="flex gap-3"><ShieldCheck className="text-signal shrink-0 mt-1" size={22} /><div><h1 className="text-xl font-semibold">Approved face enrollment</h1><p className="text-sm text-ash mt-1">Verify the student’s college identity in person, then capture their face with two random actions. Demo enrollments are never used here.</p></div></div>
    {['ADMIN','SUPER_ADMIN'].includes(user.role) && <FacePolicy />}
    {error && <p role="alert" className="text-sm text-signal">{error}</p>}
    {message && <p role="status" className="glass-medium p-4 rounded-xl text-sm text-emerald-300">{message}</p>}
    {!hasNativeVerification && <p className="text-sm text-amber-300">Open this page in the updated Threshold Android app for supervised camera capture. You can view status and manage policy here.</p>}
    {!selected && <><label className="flex gap-2 items-center"><Search size={17} /><input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find student by name or roll number" aria-label="Find student" /></label>{loading && <p className="text-ash">Loading your class rosters…</p>}{rows.filter((r) => `${r.name} ${r.roll_no}`.toLowerCase().includes(query.toLowerCase())).map((r) => <button key={r.student_id} className="glass-medium rounded-xl px-4 py-3 text-left" onClick={() => void open(r)}><span className="block font-medium">{r.name}</span><span className="text-xs text-ash">{r.roll_no}</span></button>)}{!loading && !rows.length && <p className="text-ash">No students in your assigned scope.</p>}</>}
    {selected && <section className="glass-medium rounded-2xl p-5 flex flex-col gap-4">
      <div><h2 className="font-semibold">{selected.name}</h2><p className="text-xs text-ash">{selected.roll_no}</p></div>
      {busy && <p role="status" className="text-sm text-ash flex items-center gap-2"><Loader2 size={15} className="animate-spin" />{message || 'Loading…'}</p>}
      {info && <>
        <p className="text-sm">{info.enrollment?.hasFace ? `Approved face reference · version ${info.enrollment.biometric_version}` : 'No usable approved face reference. Earlier staff confirmations do not contain a captured face.'}{info.enrollment?.faceCapturedAt && <span className="block text-xs text-ash mt-1">Captured {new Date(info.enrollment.faceCapturedAt).toLocaleString()}</span>}</p>
        {needsRecovery && (canRecover ? <label className="flex gap-3 text-sm"><input type="checkbox" checked={replace} disabled={busy} onChange={(e) => setReplace(e.target.checked)} />Supervised identity recovery: replace the current reference after verifying college records again.</label> : <p className="text-sm text-ash">An HOD or administrator must authorize replacement of this identity.</p>)}
        {(!needsRecovery || replace) && <>
          <label className="text-sm">Institutional identity record<select className="input mt-1" value={method} disabled={busy} onChange={(e) => setMethod(e.target.value as EnrollmentMethod)}><option value="INSTITUTIONAL_ID_CARD">College ID card</option><option value="REGISTRATION_RECORD">College registration record</option><option value="SUPERVISED_STAFF">Approved staff verification</option></select></label>
          <label className="flex gap-3 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} />I checked this person against the student’s institutional identity record in person.</label>
          <label className="flex gap-3 text-sm"><input type="checkbox" checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)} />The student agreed to face enrollment after being told its purpose, storage and review options. An alternative is available if they decline.</label>
          <p className="text-xs text-ash">The server extracts an encrypted face template and checks the random actions. Raw images are processed in memory and are not retained. Revocation removes the stored template. Matching and basic active liveness can make mistakes; unresolved checks need staff review.</p>
          <button className="btn-primary flex items-center justify-center gap-2" disabled={busy || !confirmed || !consent || !hasNativeVerification} onClick={() => void capture()}><ScanFace size={17} />{replace ? 'Capture replacement face' : 'Capture approved face'}</button>
        </>}
        {canRecover && info.enrollment?.hasFace && <button className="btn-ghost text-signal" disabled={busy} onClick={async () => {setBusy(true);setError('');try {await api.put(`/enrollment/biometric/${selected.student_id}/revoke`);setInfo(await getEnrollment(selected.student_id));setMessage('Face reference removed. A new supervised enrollment is required.');}catch(e){setError(errMsg(e));}finally{setBusy(false);}}}>Revoke and remove face reference</button>}
      </>}
      <button className="btn-ghost" disabled={busy} onClick={() => {setSelected(null);setInfo(null);setError('');}}>Back to students</button>
    </section>}
  </Page>;
}
