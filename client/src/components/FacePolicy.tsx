import { useEffect, useState } from 'react';
import { api, errMsg } from '../lib/api';

export default function FacePolicy() {
  const [policy,setPolicy] = useState<{required:boolean;match:number;continuity:number;available:boolean} | null>(null);
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [message,setMessage] = useState('');
  useEffect(() => { let live=true; api.get('/face/policy').then((r) => {if(live)setPolicy(r.data.data);}).catch((e) => {if(live)setError(errMsg(e));});return () => {live=false;}; },[]);
  return <details className="glass-medium rounded-xl p-4"><summary className="cursor-pointer font-medium">Face attendance policy</summary>
    <p className="text-xs text-ash mt-3">Start with separate face status while you enroll students and test the cameras. Enable the requirement only after arranging a staff correction path for students who cannot complete a check. A failed check is not proof of misconduct.</p>
    {policy && <form className="flex flex-col gap-3 mt-3" onSubmit={async (e) => {e.preventDefault();setBusy(true);setError('');setMessage('');try{await api.put('/face/policy',{required:policy.required,match:policy.match,continuity:policy.continuity});setMessage('Saved. Applies to new classroom entries; existing class requirements stay unchanged.');}catch(e){setError(errMsg(e));}finally{setBusy(false);}}}>
      <p className="text-xs text-ash">Server verifier: {policy.available ? 'enabled' : 'awaiting server setup'}</p>
      <label className="flex gap-3 text-sm"><input type="checkbox" checked={policy.required} disabled={busy || !policy.available} onChange={(e) => setPolicy({...policy,required:e.target.checked})} />Require entry + random face checks and RFID before automatic credit</label>
      <details><summary className="text-xs text-ash cursor-pointer">Matching thresholds</summary><p className="text-xs text-ash my-2">Experimental starting values. Calibrate false acceptance and rejection on consenting volunteers before enforcement.</p>{([{key:'match',label:'Approved-reference match',min:.4},{key:'continuity',label:'Same-person continuity',min:.5}] as const).map((f) => <label className="text-xs block mt-2" key={f.key}>{f.label}<input className="input mt-1 max-w-40 block" type="number" step="0.01" min={f.min} max="0.95" required value={policy[f.key]} onChange={(e) => setPolicy({...policy,[f.key]:Number(e.target.value)})} /></label>)}</details>
      <button className="btn-primary w-fit" disabled={busy}>{busy?'Saving…':'Save policy'}</button>
    </form>}
    {error && <p role="alert" className="text-xs text-signal mt-2">{error}</p>}{message && <p role="status" className="text-xs text-emerald-300 mt-2">{message}</p>}
  </details>;
}
