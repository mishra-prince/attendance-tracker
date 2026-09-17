import { useState } from 'react';
import { api, errMsg } from '../../lib/api';
import { Page } from '../../components/motion';
import { useAuth } from '../../store/auth';

export default function JoinSectionStudent() {
  const user = useAuth((s) => s.user)!;
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function join() {
    if (code.length < 4) return;
    setBusy(true);
    try {
      const r = await api.post('/classroom/join', { code: code.toUpperCase() });
      setMsg(`✓ Joined ${r.data.data.section_name}`);
      setCode('');
    } catch (e) { setMsg('⚠ ' + errMsg(e)); }
    setBusy(false);
  }

  return (
    <Page className="flex flex-col gap-4">
      <div className="text-bone text-lg font-semibold">Join a Class</div>
      <div className="text-ash text-sm">Enter the 6-character code your teacher shows on screen.</div>

      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
        placeholder="ABC123"
        inputMode="text"
        autoCapitalize="characters"
        className="glass-card px-4 py-4 rounded-xl bg-transparent text-bone text-2xl text-center tracking-[0.4em] font-semibold w-full outline-none focus:border-signal/50"
      />
      <div className="flex gap-1.5 justify-center">
        {[0,1,2,3,4,5].map((i) => (
          <div key={i} className={`w-9 h-11 rounded-lg ${code.length > i ? 'bg-signal/30 border border-signal/50' : 'bg-white/5'}`} />
        ))}
      </div>

      <button onClick={join} disabled={busy || code.length < 4} className="btn-primary rounded-xl py-3.5 text-sm font-semibold">
        {busy ? 'Joining…' : 'Join class'}
      </button>
      {msg && <div className="text-sm text-signal text-center">{msg}</div>}
    </Page>
  );
}
