import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api, errMsg } from '../../lib/api';

export default function StudentScan() {
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;
    scanner
      .start({ facingMode: 'environment' }, { fps: 10 },
        async (decoded) => {
          if (fired.current) return;
          fired.current = true;
          try {
            await scanner.stop();
          } catch { /* ignore */ }
          try {
            const payload = JSON.parse(decoded);
            const r = await api.post('/attendance/qr/scan', { token: payload.token, deviceId: 'web-' + navigator.userAgent.length });
            setResult(`✓ Checked in — ${r.data.data.marked ? 'present' : 'recorded'}`);
          } catch (e) {
            setError(errMsg(e));
          }
        },
        () => { /* per-frame skip */ })
      .catch((e) => setError('Camera unavailable: ' + e));
    return () => { scanner.stop().catch(() => {}); };
  }, []);

  return (
    <div className="p-6 flex flex-col gap-4 items-center">
      <div className="text-bone text-lg font-semibold">Scan QR to check in</div>
      <div id="qr-reader" className="w-full max-w-sm rounded-2xl overflow-hidden glass-medium" />
      {result && <div className="badge badge-present text-sm">{result}</div>}
      {error && <div className="text-signal text-sm">{error}</div>}
    </div>
  );
}
