import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bluetooth, Users, Radio, ClipboardCheck, ArrowRight } from 'lucide-react';
import { errMsg } from '../../lib/api';
import { myBleSession, finalizeBle, cancelBle, type BleTeacherSession } from '../../lib/features';
import { bluetooth, hasNativeBluetooth } from '../../lib/bluetooth';
import { Page } from '../../components/motion';

export default function BleSession() {
  const navigate = useNavigate();
  const [session, setSession] = useState<BleTeacherSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ present: number; review_required: number; class_session_id: string } | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try { const s = await myBleSession(); if (mounted.current) { setSession(s); setError(''); } }
      catch (e) { if (mounted.current) { setError(errMsg(e)); setBroadcasting(false); } }
      finally { pending = false; if (mounted.current) setLoading(false); }
    };
    void poll();
    const timer = setInterval(poll, 5000);
    const handle = hasNativeBluetooth ? bluetooth.addListener('stopped', (e) => {
      if (mounted.current) { setBroadcasting(false); setError(e.message); }
    }) : null;
    return () => {
      mounted.current = false; clearInterval(timer);
      void handle?.then((h) => h.remove());
      if (hasNativeBluetooth) void bluetooth.stop();
    };
  }, []);

  useEffect(() => {
    if (!hasNativeBluetooth) return;
    if (!broadcasting || !session?.beacon_id) { void bluetooth.stop(); return; }
    let cancelled = false;
    const remaining = session.valid_for_ms;
    if (remaining <= 0) { void bluetooth.stop(); return; }
    void bluetooth.advertise({ beaconId: session.beacon_id }).catch((e) => {
      if (!cancelled && mounted.current) { setError(errMsg(e)); setBroadcasting(false); }
    });
    const timer = setTimeout(() => { void bluetooth.stop(); }, Math.min(remaining, 35000));
    return () => { cancelled = true; clearTimeout(timer); };
  }, [broadcasting, session?.beacon_id, session?.expires_at]);

  async function finalize() {
    if (!session) return;
    setBusy(true); setError(''); setBroadcasting(false);
    try {
      const r = await finalizeBle(session.session_id);
      setResult(r); setSession(null);
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (!session) return;
    setBusy(true); setBroadcasting(false); setError('');
    try { const closed = await cancelBle(session.session_id); navigate('/staff/sessions/' + closed.class_session_id); }
    catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  }

  return (
    <Page className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <div><p className="eyebrow">CLASSROOM CONTROL</p><h1 className="page-title">Bluetooth attendance</h1></div>
        <span className="icon-tile"><Bluetooth size={22} /></span>
      </header>
      {error && <p role="alert" className="notice notice-error">{error}</p>}
      {loading && <div className="skeleton h-64" />}
      {!loading && !session && !result && <section className="glass-medium rounded-2xl p-8 text-center flex flex-col items-center gap-4"><Radio size={32} className="text-ash" /><h2 className="text-xl font-semibold">Ready for your next class</h2><p className="text-ash text-sm">Start a Bluetooth session from your timetable during class time.</p><Link to="/staff/take" className="btn-primary no-underline">Choose a class</Link></section>}
      {session && <>
        <section className="presence-panel glass-medium">
          <span className={'badge ' + (broadcasting && session.beacon_id ? 'badge-present' : 'badge-neutral')}><span className="status-dot" />{broadcasting && session.beacon_id ? 'Broadcasting class signal' : 'Broadcast paused'}</span>
          <div className={'radar ' + (broadcasting ? 'radar-active' : '')} aria-hidden="true"><div className="radar-ring radar-ring-1" /><div className="radar-ring radar-ring-2" /><div className="radar-core"><Radio size={34} /></div></div>
          <h2 className="text-2xl font-semibold">Your classroom. Connected.</h2>
          <p className="text-ash text-sm max-w-sm">{session.beacon_id ? 'Students open Bluetooth check-in on their phones. The class signal changes every 30 seconds.' : 'The scheduled class has ended. Review and finalize attendance.'}</p>
          {!hasNativeBluetooth ? <p className="notice">Open the Android app on a teacher phone to broadcast. This browser can review the session.</p> :
            <button className={broadcasting ? 'btn-ghost w-full max-w-sm' : 'btn-primary w-full max-w-sm'} disabled={!session.beacon_id || busy} onClick={() => { setError(''); setBroadcasting(!broadcasting); }}>{broadcasting ? 'Pause broadcast' : 'Start class broadcast'}</button>}
          <p className="text-xs text-ash">Keep this screen open and your internet connected while broadcasting.</p>
        </section>
        <div className="grid grid-cols-2 gap-4">
          <div className="glass-medium rounded-2xl p-5"><Users size={20} className="text-ash mb-3" /><p className="text-4xl font-light tabular-nums">{session.students_seen}</p><p className="text-ash text-xs mt-2">Phones detected</p></div>
          <div className="glass-medium rounded-2xl p-5"><Radio size={20} className="text-ash mb-3" /><p className="text-4xl font-light tabular-nums">{session.required_minutes}<span className="text-base text-ash ml-1">min</span></p><p className="text-ash text-xs mt-2">Required time in class</p></div>
        </div>
        <section className="glass-medium rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex gap-3"><ClipboardCheck size={22} className="text-ash shrink-0" /><div><h2 className="font-medium">You make the final call</h2><p className="text-sm text-ash mt-2">Finalizing records students who met the time requirement. Missing Bluetooth evidence stays unmarked for your review. Existing manual records are preserved.</p></div></div>
          <button className="btn-primary" disabled={busy} onClick={() => void finalize()}>{busy ? 'Finalizing…' : 'Finalize Bluetooth & review roster'}</button>
          <button className="btn-ghost text-sm" disabled={busy} onClick={() => void cancel()}>End signal without marking</button>
          <Link className="text-sm text-ash" to={'/staff/sessions/' + session.class_session_id}>Open attendance roster</Link>
        </section>
      </>}
      {result && <section className="glass-medium rounded-2xl p-6 flex flex-col gap-4"><ClipboardCheck className="text-emerald-300" size={32} /><h2 className="text-xl font-semibold">Bluetooth session finished</h2><p className="text-ash text-sm">{result.present} new present records. {result.review_required} students need your review. Review the roster and submit the class attendance.</p><Link to={'/staff/sessions/' + result.class_session_id} className="btn-primary no-underline flex justify-between items-center">Review attendance <ArrowRight size={18} /></Link></section>}
    </Page>
  );
}
