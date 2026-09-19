import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, Users, CheckCircle2 } from 'lucide-react';
import { errMsg } from '../../lib/api';
import { myBleSession, finalizeBle, type BleTeacherSession } from '../../lib/features';
import { Page } from '../../components/motion';

export default function BleSession() {
  const nav = useNavigate();
  const [sess, setSess] = useState<BleTeacherSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [finalizing, setFinalizing] = useState(false);

  const poll = useCallback(() => {
    myBleSession()
      .then((s) => setSess(s))
      .catch((e) => setErr(errMsg(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 5000); // refresh ping count + rotating beacon
    return () => clearInterval(t);
  }, [poll]);

  async function finalize() {
    if (!sess) return;
    setFinalizing(true); setErr('');
    try {
      const r = await finalizeBle(sess.session_id);
      setMsg(`✓ Finalized — ${r.present} present, ${r.low} low-confidence, ${r.absent} absent`);
      setSess(null);
    } catch (e) { setErr(errMsg(e)); } finally { setFinalizing(false); }
  }

  return (
    <Page className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Radio size={20} className="text-signal" />
        <div className="text-bone text-lg font-semibold">BLE Auto-Attendance</div>
      </div>

      {loading && <div className="skeleton h-40 w-full rounded-2xl" />}
      {err && <div role="alert" className="text-signal text-sm">{err}</div>}
      {msg && <div className="glass-medium rounded-2xl p-6 text-emerald-300 text-center">{msg}</div>}

      {!loading && !sess && !msg && (
        <div className="glass-medium rounded-2xl p-6 text-center text-ash">
          No active BLE session. Start one from “Take Attendance”.
        </div>
      )}

      {sess && (
        <>
          <div className="glass-medium rounded-2xl p-6 flex flex-col items-center gap-3">
            <div className="text-ash text-xs uppercase tracking-wide">Beacon ID (rotates every 30s)</div>
            <div className="text-signal text-3xl font-black tracking-[0.2em] tabular-nums">{sess.beacon_id}</div>
            <div className="text-muted text-xs">Students’ phones detect this automatically</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="glass-medium rounded-2xl p-5 flex flex-col items-center">
              <Users size={20} className="text-bone mb-1" />
              <div className="display-numeral !text-4xl text-bone">{sess.students_seen}</div>
              <div className="text-ash text-xs mt-1">Students seen</div>
            </div>
            <div className="glass-medium rounded-2xl p-5 flex flex-col items-center">
              <Radio size={20} className="text-bone mb-1" />
              <div className="display-numeral !text-4xl text-bone">{sess.pings}</div>
              <div className="text-ash text-xs mt-1">Total pings</div>
            </div>
          </div>

          <div className="text-ash text-sm text-center">Dwell requirement: {sess.required_minutes} min in class</div>

          <button className="btn-primary flex items-center justify-center gap-2" disabled={finalizing} onClick={finalize}>
            <CheckCircle2 size={16} />
            {finalizing ? 'Finalizing…' : 'Finalize & mark attendance'}
          </button>
        </>
      )}

      {msg && (
        <button className="btn-ghost" onClick={() => nav('/staff')}>Back to dashboard</button>
      )}
    </Page>
  );
}
