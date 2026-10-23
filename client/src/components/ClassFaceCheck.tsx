import { useEffect, useState } from 'react';
import { ScanFace, Loader2 } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { verifyClassFace, type FaceStatus } from '../lib/face';
import { hasNativeVerification } from '../lib/verification';

export default function ClassFaceCheck({ sessionId }: { sessionId: string }) {
  const [info, setInfo] = useState<FaceStatus | null>(null), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true, pending = false;
    const controller = new AbortController();
    async function load() {
      if (pending) return; pending = true;
      try { const r = await api.get(`/face/status/${sessionId}`, { signal: controller.signal }); if (live) { setInfo(r.data.data); setError(''); } }
      catch (e) { if (live) setError(errMsg(e)); }
      finally { pending = false; }
    }
    void load(); const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); },15_000);
    return () => { live = false; controller.abort(); window.clearInterval(timer); };
  },[sessionId,refresh]);
  return <div className="mt-3 rounded-xl border border-white/10 p-3 flex flex-col gap-2">
    <p className="text-sm font-medium flex items-center gap-2"><ScanFace size={17} />Face identity</p>
    {info && <>
      <p className="text-xs text-ash">{!info.approvedFace ? 'Ask staff to capture your approved face reference in person.' : info.spotPassed ? 'Entry and random class checks verified.' : info.joinPassed ? 'Entry identity verified. A random class check will appear here when due.' : 'Verify your identity after tapping your classroom card.'}</p>
      {info.required && <p className="text-xs text-amber-300">This class requires both face checks and the registered card visit before automatic attendance credit.</p>}
      {info.due && !info.expired && info.approvedFace && <div role="status"><p className="text-sm text-bone mb-2">{info.due === 'SPOT' ? 'Your random identity check is ready.' : 'Your entry identity check is ready.'}</p><button className="btn-primary flex items-center gap-2" disabled={busy || !hasNativeVerification} onClick={async () => {
        setBusy(true); setError('');
        try { await verifyClassFace(sessionId,setMessage); setMessage('Identity and random actions verified by the server.'); setRefresh((n) => n+1); }
        catch(e) { setError(errMsg(e)); setMessage(''); }
        finally { setBusy(false); }
      }}>{busy ? <Loader2 size={15} className="animate-spin" /> : <ScanFace size={15} />}{busy ? 'Checking…' : 'Verify live face'}</button></div>}
      {!hasNativeVerification && !info.expired && <p className="text-xs text-ash">Use the latest Threshold Android app for camera checks.</p>}
      {info.expired && !info.spotPassed && <p className="text-xs text-amber-300">The check window has ended. Ask staff for a review or an accessible alternative; this is not a finding of misconduct.</p>}
    </>}
    {message && <p role="status" className="text-xs text-emerald-300">{message}</p>}
    {error && <p role="alert" className="text-xs text-signal">{error}</p>}
    <p className="text-[11px] text-muted">Keep Threshold visible to see a check when due. The camera opens only when you tap Verify. Camera or network problems can be reviewed by staff.</p>
  </div>;
}
