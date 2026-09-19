import { useEffect, useState } from 'react';
import { api, errMsg } from '../../lib/api';
import { Page } from '../../components/motion';

export default function JoinCodeStaff() {
  const [sectionId, setSectionId] = useState('');
  const [sections, setSections] = useState<{ section_id: string; section_name: string }[]>([]);
  const [code, setCode] = useState<{ join_code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/catalog/sections').then((r) => setSections(r.data.data ?? [])).catch(() => setMsg('Failed to load sections.'));
  }, []);

  async function generate() {
    if (!sectionId) return;
    setBusy(true); setMsg(''); setCode(null);
    try {
      const r = await api.post('/classroom/generate-code', { sectionId });
      setCode({ join_code: r.data.data.code, expires_at: r.data.data.section.join_code_expires_at || '' });
    } catch (e) { setMsg(errMsg(e)); }
    setBusy(false);
  }

  return (
    <Page className="flex flex-col gap-4">
      <div>
        <h1 className="text-bone text-lg font-semibold">Classroom Join Code</h1>
        <p className="text-ash text-sm mt-1">Generate a code students use to join your section.</p>
      </div>

      <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="input">
        <option value="" className="bg-carbon">Select section…</option>
        {sections.map((s) => <option key={s.section_id} value={s.section_id} className="bg-carbon">{s.section_name}</option>)}
      </select>

      <button onClick={generate} disabled={!sectionId || busy} className="btn-primary disabled:opacity-50">
        {busy ? 'Generating…' : 'Generate code'}
      </button>

      {msg && <p className="text-signal text-sm">{msg}</p>}

      {code && (
        <div className="glass-medium rounded-2xl p-6 text-center">
          <p className="text-ash text-xs uppercase tracking-wide">Share this code</p>
          <p className="text-signal text-4xl font-black tracking-[0.3em] my-3">{code.join_code}</p>
          <p className="text-muted text-xs">
            {code.expires_at ? `Expires: ${new Date(code.expires_at).toLocaleString()}` : 'No expiry'}
          </p>
        </div>
      )}
    </Page>
  );
}
