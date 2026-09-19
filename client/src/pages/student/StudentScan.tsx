import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api, errMsg } from '../../lib/api';

// Stable-ish per-install device id (not a fingerprint, just dedup help for the server).
function deviceId(): string {
  try {
    let id = localStorage.getItem('device_id');
    if (!id) {
      id = 'web-' + (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem('device_id', id);
    }
    return id;
  } catch {
    return 'web-anon';
  }
}

export default function StudentScan() {
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;
    let started = false;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decoded) => {
          if (fired.current) return;
          fired.current = true;
          try {
            if (started) await scanner.stop();
          } catch {
            /* already stopped */
          }
          try {
            const payload = JSON.parse(decoded);
            const r = await api.post('/attendance/qr/scan', { token: payload.token, deviceId: deviceId() });
            setResult(`✓ Checked in — ${r.data.data.marked ? 'present' : 'recorded'}`);
          } catch (e) {
            setError(errMsg(e));
            fired.current = false; // allow re-scan after a failed check-in
          }
        },
        () => {
          /* per-frame decode miss — ignore */
        }
      )
      .then(() => {
        started = true;
      })
      .catch((e) => {
        const msg = String(e || '');
        setError(
          /permission|NotAllowed|denied/i.test(msg)
            ? 'Camera permission denied. Enable camera access in settings and reopen this page.'
            : 'Camera unavailable. Check that no other app is using it.'
        );
      });

    return () => {
      const s = scannerRef.current;
      if (s && started) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {
            /* stop can race unmount; safe to ignore */
          });
      }
    };
  }, []);

  return (
    <div className="p-6 flex flex-col gap-4 items-center">
      <div className="text-bone text-lg font-semibold">Scan QR to check in</div>
      <div id="qr-reader" className="w-full max-w-sm rounded-2xl overflow-hidden glass-medium" />
      {result && <div className="badge badge-present text-sm">{result}</div>}
      {error && <div role="alert" className="text-signal text-sm text-center">{error}</div>}
    </div>
  );
}
