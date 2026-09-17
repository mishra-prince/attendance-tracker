import { useRef, useState } from 'react';
import { api, errMsg } from '../../lib/api';
import { Page } from '../../components/motion';
import { CardSkeleton } from '../../components/skeletons';

interface ParsedSlot { day: string; start_time: string; end_time: string; subject_code: string; subject_name: string; room_no?: string; teacher_name?: string; }

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat'];

export default function TimetableAnalyzer() {
  const [preview, setPreview] = useState<ParsedSlot[] | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [sections, setSections] = useState<{ section_id: string; section_name: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useState(() => { api.get('/catalog/sections').then((r) => setSections(r.data.data)).catch(() => {}); });

  async function pick(f: File | undefined) {
    if (!f || !sectionId) return;
    setBusy(true); setMsg('Reading timetable with AI…'); setPreview(null);
    const b64 = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f); });
    setImgUrl(b64);
    try {
      const m = b64.match(/^data:(image\/[\w+]+);base64,(.*)$/);
      const r = await api.post('/ai/parse-timetable', { imageBase64: m ? m[2] : b64, mimeType: m ? m[1] : 'image/jpeg' });
      setPreview(r.data.data.slots);
      setMsg(`Found ${r.data.data.slots.length} classes. Review and confirm.`);
    } catch (e) { setMsg('⚠ ' + errMsg(e)); }
    setBusy(false);
  }

  async function commit() {
    if (!preview?.length) return;
    setBusy(true);
    try {
      const r = await api.post('/ai/commit-timetable', { sectionId, slots: preview });
      setMsg(`✓ Created ${r.data.data.created} timetable slots`);
      setPreview(null); setImgUrl(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) { setMsg('⚠ ' + errMsg(e)); }
    setBusy(false);
  }

  return (
    <Page className="flex flex-col gap-4">
      <div className="text-bone text-lg font-semibold">AI Timetable Analyzer</div>
      <div className="text-ash text-sm">Upload a photo of the timetable — AI extracts every class automatically.</div>

      <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="glass-card px-4 py-3 rounded-xl bg-transparent text-bone text-sm w-full">
        <option value="" className="bg-ink">Select section…</option>
        {sections.map((s) => <option key={s.section_id} value={s.section_id} className="bg-ink">{s.section_name}</option>)}
      </select>

      <label className={`glass-card rounded-2xl p-6 flex flex-col items-center gap-2 cursor-pointer ${sectionId ? '' : 'opacity-40 pointer-events-none'}`}>
        <span className="text-3xl">📸</span>
        <span className="text-bone text-sm">Tap to upload timetable photo</span>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </label>

      {busy && !preview && (
        <>
          <CardSkeleton h="h-40" />
          <CardSkeleton h="h-32" />
        </>
      )}

      {imgUrl && <img src={imgUrl} alt="uploaded" className="rounded-xl max-h-48 object-contain self-center" />}

      {msg && <div className="text-sm text-signal">{msg}</div>}

      {preview && (
        <div className="flex flex-col gap-2">
          {DAYS.filter((d) => preview.some((p) => p.day === d)).map((d) => (
            <div key={d} className="glass-card p-3">
              <div className="text-ash text-xs mb-2">{d}</div>
              {preview.filter((p) => p.day === d).map((p, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                  <div>
                    <div className="text-bone text-sm">{p.subject_code} — {p.subject_name}</div>
                    <div className="text-muted text-xs">{p.start_time}–{p.end_time}{p.room_no ? ` · ${p.room_no}` : ''}</div>
                  </div>
                  <button onClick={() => setPreview(preview.filter((x) => x !== p))} className="text-white/30 text-lg leading-none">✕</button>
                </div>
              ))}
            </div>
          ))}
          <button onClick={commit} disabled={busy} className="btn-primary rounded-xl py-3.5 text-sm font-semibold">
            {busy ? 'Creating…' : `✓ Create ${preview.length} slots`}
          </button>
        </div>
      )}
    </Page>
  );
}
