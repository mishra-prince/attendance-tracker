import { useEffect, useState, useCallback } from 'react';
import { Radio, CheckCircle2 } from 'lucide-react';
import { errMsg } from '../../lib/api';
import { bleStatus, type BleStudentStatus } from '../../lib/features';
import { useFlags } from '../../lib/features';

export default function BleCheckin() {
  const { flags } = useFlags();
  const [status, setStatus] = useState<BleStudentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const poll = useCallback(() => {
    bleStatus()
      .then((s) => setStatus(s))
      .catch((e) => setErr(errMsg(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [poll]);

  if (flags && !flags.ble_auto_attendance) {
    return (
      <div className="p-6">
        <div className="glass-medium rounded-2xl p-6 text-center text-ash">
          Auto-attendance is turned off. Use QR check-in instead.
        </div>
      </div>
    );
  }

  const pct = status ? Math.round(status.progress * 100) : 0;

  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Radio size={20} className="text-signal" />
        <div className="text-bone text-lg font-semibold">Auto check-in</div>
      </div>

      {loading && <div className="skeleton h-40 w-full rounded-2xl" />}
      {err && <div role="alert" className="text-signal text-sm">{err}</div>}

      {!loading && !status && (
        <div className="glass-medium rounded-2xl p-6 text-center text-ash">
          No class beacon detected right now. Keep this open during class — you’ll be marked automatically once your teacher starts a BLE session.
        </div>
      )}

      {status && (
        <div className="glass-medium rounded-2xl p-6 flex flex-col items-center gap-4">
          {status.secured ? (
            <>
              <CheckCircle2 size={40} className="text-emerald-400" />
              <div className="text-emerald-300 font-medium">You’re marked present</div>
            </>
          ) : (
            <div className="text-ash text-sm text-center">Stay in class to secure your attendance</div>
          )}

          <div className="w-full">
            <div className="h-3 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-ember to-signal transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between text-xs text-muted mt-1.5">
              <span>{status.dwell_minutes} min in class</span>
              <span>{status.required_minutes} min needed</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
