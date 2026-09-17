import { useState } from 'react';
import { api, errMsg } from '../../lib/api';
import { Page } from '../../components/motion';
import { CardSkeleton } from '../../components/skeletons';

export default function JoinCodeStaff() {
  const [sectionId, setSectionId] = useState('');
  const [sections, setSections] = useState<{ section_id: string; section_name: string }[]>([]);
  const [code, setCode] = useState<{ join_code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useState(() => { api.get('/admin/sections').then((r) => setSections(r.data.data ?? r.data)).catch(() => {}); });

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
    <Page className="p-4 pb-24">
      <h1 className="text-xl font-bold">Classroom Join Code</h1>
      <p className="text-sm text-muted-foreground mt-1">Generate a code students use to join your section.</p>

      <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="w-full mt-4 rounded-xl bg-card border border-border px-3 py-2.5 text-sm">
        <option value="">Select section…</option>
        {sections.map((s) => <option key={s.section_id} value={s.section_id}>{s.section_name}</option>)}
      </select>

      <button onClick={generate} disabled={!sectionId || busy} className="w-full mt-3 rounded-xl bg-primary text-primary-foreground py-3 text-sm font-semibold disabled:opacity-50">
        {busy ? 'Generating…' : 'Generate code'}
      </button>

      {msg && <p className="text-sm text-destructive mt-3">{msg}</p>}

      {code && (
        <div className="mt-5 rounded-2xl border border-border bg-card p-5 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Share this code</p>
          <p className="text-4xl font-black tracking-[0.3em] my-3">{code.join_code}</p>
          <p className="text-xs text-muted-foreground">Expires: {new Date(code.expires_at).toLocaleString()}</p>
        </div>
      )}
    </Page>
  );
}
