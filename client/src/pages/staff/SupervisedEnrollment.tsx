import { useEffect, useState } from 'react';
import { ShieldCheck, ScanFace, CheckCircle2, Loader2, IdCard } from 'lucide-react';
import { errMsg } from '../../lib/api';
import {
  listStudents, getEnrollment, superviseEnroll, reEnroll,
  type EnrollmentMethod, type EnrollmentTrustState,
} from '../../lib/features';
import { Page } from '../../components/motion';
import { RowSkeleton } from '../../components/skeletons';
import ClassroomDemoButton from '../../components/ClassroomDemoButton';

// This is the ROOT-OF-TRUST station. Staff verify institutional identity in person,
// then record the staff observation. This page does not run camera capture or face inference.

const METHODS: { value: EnrollmentMethod; label: string }[] = [
  { value: 'SUPERVISED_STAFF', label: 'Supervised by staff' },
  { value: 'INSTITUTIONAL_ID_CARD', label: 'Institutional ID card' },
  { value: 'REGISTRATION_RECORD', label: 'College registration record' },
  { value: 'TRUSTED_IDENTITY_SYSTEM', label: 'Trusted identity system' },
  { value: 'BIOMETRIC_ENROLLMENT_STATION', label: 'Biometric enrollment station' },
];

const STATE_BADGE: Record<EnrollmentTrustState, string> = {
  UNENROLLED: 'badge-neutral',
  PENDING_SUPERVISED_ENROLLMENT: 'badge-late',
  ACTIVE: 'badge-present',
  REVOKED: 'badge-absent',
  REQUIRES_REENROLLMENT: 'badge-late',
};

type Row = { student_id: string; name: string; roll_no: string; enrollment_trust_state?: EnrollmentTrustState };

export default function SupervisedEnrollment() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<Row | null>(null);
  const [method, setMethod] = useState<EnrollmentMethod>('SUPERVISED_STAFF');
  const [idConfirmed, setIdConfirmed] = useState(false);
  const [liveness, setLiveness] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  function load() {
    setLoading(true);
    listStudents()
      .then((r) => setRows(r))
      .catch((e) => setErr(errMsg(e)))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function open(row: Row) {
    setSel(row); setIdConfirmed(false); setLiveness(false); setMsg('');
    try {
      const info = await getEnrollment(row.student_id);
      setSel({ ...row, enrollment_trust_state: info.enrollment_trust_state });
    } catch { /* keep row state */ }
  }

  async function submit() {
    if (!sel) return;
    setBusy(true); setMsg('');
    try {
      const isReenroll = sel.enrollment_trust_state === 'ACTIVE' || sel.enrollment_trust_state === 'REVOKED' || sel.enrollment_trust_state === 'REQUIRES_REENROLLMENT';
      if (isReenroll) await reEnroll(sel.student_id, method, liveness);
      else await superviseEnroll(sel.student_id, method, liveness);
      setMsg('✓ Supervised enrollment metadata recorded — no face template was captured by this page');
      setSel(null);
      load();
    } catch (e) { setMsg('⚠ ' + errMsg(e)); }
    finally { setBusy(false); }
  }

  return (
    <Page className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <ShieldCheck size={20} className="text-signal" />
        <div>
          <div className="text-bone text-lg font-semibold">Supervised Enrollment</div>
          <div className="text-ash text-sm mt-0.5">Record an in-person staff observation. Threshold’s classroom demo includes local face matching; its templates do not update this institutional enrollment.</div>
        </div>
      </div>

      <ClassroomDemoButton />
      {msg && <div className="glass-medium rounded-2xl p-4 text-sm text-emerald-300">{msg}</div>}
      {err && <div role="alert" className="text-signal text-sm">{err}</div>}
      {loading && <RowSkeleton rows={5} />}

      {!sel && !loading && (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <button key={r.student_id} onClick={() => open(r)}
              className="glass-medium rounded-xl px-4 py-3 flex items-center justify-between text-left">
              <div>
                <div className="font-medium text-bone">{r.name}</div>
                <div className="text-muted text-xs">{r.roll_no}</div>
              </div>
              {r.enrollment_trust_state && (
                <span className={`badge ${STATE_BADGE[r.enrollment_trust_state]}`}>
                  {r.enrollment_trust_state.replace(/_/g, ' ').toLowerCase()}
                </span>
              )}
            </button>
          ))}
          {!rows.length && <div className="text-ash">No students found.</div>}
        </div>
      )}

      {sel && (
        <div className="glass-medium rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-bone">{sel.name}</div>
              <div className="text-muted text-xs">{sel.roll_no}</div>
            </div>
            {sel.enrollment_trust_state && (
              <span className={`badge ${STATE_BADGE[sel.enrollment_trust_state]}`}>
                {sel.enrollment_trust_state.replace(/_/g, ' ').toLowerCase()}
              </span>
            )}
          </div>

          {(sel.enrollment_trust_state === 'ACTIVE') && (
            <div className="text-amber-300 text-xs">Re-enrollment will revoke the existing template and issue a new version.</div>
          )}

          <label className="text-ash text-xs">Identity anchor
            <select className="input mt-1" value={method} onChange={(e) => setMethod(e.target.value as EnrollmentMethod)}>
              {METHODS.map((m) => <option key={m.value} value={m.value} className="bg-carbon">{m.label}</option>)}
            </select>
          </label>

          <button onClick={() => setIdConfirmed((v) => !v)}
            className={`glass-card rounded-xl p-3 flex items-center gap-3 text-left ${idConfirmed ? 'ring-1 ring-emerald-400/40' : ''}`}>
            <IdCard size={18} className={idConfirmed ? 'text-emerald-400' : 'text-ash'} />
            <div className="flex-1 text-sm">{idConfirmed ? 'Institutional identity verified' : 'Confirm institutional identity'}</div>
            {idConfirmed && <CheckCircle2 size={16} className="text-emerald-400" />}
          </button>

          <button onClick={() => setLiveness((v) => !v)}
            className={`glass-card rounded-xl p-3 flex items-center gap-3 text-left ${liveness ? 'ring-1 ring-emerald-400/40' : ''}`}>
            <ScanFace size={18} className={liveness ? 'text-emerald-400' : 'text-ash'} />
            <div className="flex-1 text-sm">{liveness ? 'Staff confirms an in-person live observation' : 'Confirm staff observed the student live in person'}</div>
            {liveness && <CheckCircle2 size={16} className="text-emerald-400" />}
          </button>

          <div className="flex gap-2">
            <button className="btn-primary flex-1 flex items-center justify-center gap-2"
              disabled={!idConfirmed || !liveness || busy} onClick={submit}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
              {sel.enrollment_trust_state === 'ACTIVE' ? 'Re-enroll' : 'Enroll identity'}
            </button>
            <button className="btn-ghost" onClick={() => setSel(null)}>Cancel</button>
          </div>
          <div className="text-muted text-[11px]">
            Both confirmations are manual staff observations. This web page stores enrollment metadata; it does not capture, match or test a face. Prototype templates are local and are not linked to this record.
          </div>
        </div>
      )}
    </Page>
  );
}
