import { useState } from 'react';
import { ScanFace, ArrowRight } from 'lucide-react';
import { hasNativeVerification, verification } from '../lib/verification';
import { errMsg } from '../lib/api';

export default function ClassroomDemoButton() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!hasNativeVerification) return null;
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="btn-ghost flex items-center justify-between gap-3 w-full" disabled={busy}
        onClick={async () => {
          setBusy(true); setError('');
          try { await verification.openClassDemo(); }
          catch (e) { setError(errMsg(e)); }
          finally { setBusy(false); }
        }}>
        <span className="flex items-center gap-2"><ScanFace size={18} />{busy ? 'Opening…' : 'Face & ESP32 classroom demo'}</span><ArrowRight size={17} />
      </button>
      <p className="text-xs text-ash leading-relaxed">Offline submission demo. No account needed; real attendance stays in your institution’s portal.</p>
      {error && <p role="alert" className="notice notice-error">{error}</p>}
    </div>
  );
}
