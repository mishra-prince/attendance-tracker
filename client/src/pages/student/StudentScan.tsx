import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Link } from 'react-router-dom';
import { Bluetooth, Camera, CheckCircle2, RotateCcw } from 'lucide-react';
import { api, errMsg } from '../../lib/api';

function deviceId(): string {
  try {
    const stored = localStorage.getItem('device_id');
    if (stored) return stored;
    const id = 'install-' + crypto.randomUUID();
    localStorage.setItem('device_id', id);
    return id;
  } catch { return 'unknown-install'; }
}

export default function StudentScan() {
  const [attempt, setAttempt] = useState(0);
  const [active, setActive] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const device = useRef(deviceId());
  useEffect(() => {
    if (!active) return;
    let cancelled = false, pending = false, lastTry = 0;
    const scanner = new Html5Qrcode('qr-reader');
    const startup = scanner.start({ facingMode: 'environment' }, { fps: 8, qrbox: (width, height) => ({ width: Math.min(220, width - 32), height: Math.min(220, height - 32) }) }, async (decoded) => {
      if (cancelled || pending || Date.now() - lastTry < 3000) return;
      pending = true; lastTry = Date.now();
      setBusy(true); setError('');
      try {
        let payload: { token?: unknown };
        try { payload = JSON.parse(decoded); } catch { throw new Error('This is not a class attendance QR. Scan the code shown by your teacher.'); }
        if (typeof payload?.token !== 'string' || !payload.token || payload.token.length > 4096) throw new Error('This QR does not contain a valid attendance token.');
        const response = await api.post('/attendance/qr/scan', { token: payload.token, deviceId: device.current });
        if (cancelled) return;
        setResult(response.data.data.marked ? 'You’re checked in.' : 'Your check-in was recorded.');
        setActive(false);
      } catch (e) { if (!cancelled) setError(errMsg(e)); }
      finally { pending = false; if (!cancelled) setBusy(false); }
    }, () => {});
    void startup.catch((e) => {
      if (!cancelled) {
        setError(/permission|NotAllowed|denied/i.test(String(e)) ? 'Allow camera access in app settings, then tap Retry camera.' : 'Camera unavailable. Close other camera apps, then retry.');
        setActive(false);
      }
    });
    return () => {
      cancelled = true;
      void startup.then(async () => { if (scanner.isScanning) await scanner.stop(); scanner.clear(); }).catch(() => {});
    };
  }, [active, attempt]);

  return (
    <div className="student-page flex flex-col gap-5">
      <header><p className="eyebrow">ANOTHER WAY TO CHECK IN</p><h1 className="page-title">Scan your class QR</h1><p className="text-sm text-ash mt-2">Point your camera at the code shown by your teacher.</p></header>
      {result ? <section className="presence-panel glass-medium" role="status"><CheckCircle2 size={44} className="text-emerald-300" /><h2 className="text-xl font-semibold">{result}</h2><Link to="/student/sessions" className="btn-primary no-underline">View class sessions</Link></section> :
        <section className="glass-medium rounded-2xl p-5 flex flex-col gap-4">
          <div id="qr-reader" className={'w-full rounded-xl overflow-hidden ' + (!active ? 'hidden' : '')} />
          {!active && <div className="py-10 flex flex-col items-center gap-4 text-ash"><Camera size={42} /><p className="text-sm text-center">Camera access starts when you choose.</p></div>}
          {busy && <p role="status" className="text-ash text-sm">Checking attendance…</p>}
          {error && <p role="alert" className="notice notice-error">{error}</p>}
          {!active && <button className="btn-primary flex justify-center gap-2 items-center" onClick={() => { setError(''); setActive(true); setAttempt((n) => n + 1); }}>{error ? <RotateCcw size={18} /> : <Camera size={18} />}{error ? 'Retry camera' : 'Open camera'}</button>}
          {active && <button className="btn-ghost" disabled={busy} onClick={() => setActive(false)}>Close camera</button>}
        </section>}
      <Link to="/student/auto" className="fallback-link"><Bluetooth size={18} />Use Bluetooth check-in instead</Link>
    </div>
  );
}
