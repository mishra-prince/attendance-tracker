import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bluetooth, Check, ChevronRight, Radio, ShieldCheck, Smartphone, QrCode } from 'lucide-react';
import type { PluginListenerHandle } from '@capacitor/core';
import { errMsg } from '../../lib/api';
import { bleStatus, bleScan, useFlags, type BleStudentStatus } from '../../lib/features';
import { bluetooth, hasNativeBluetooth } from '../../lib/bluetooth';

export default function BleCheckin() {
  const { flags } = useFlags();
  const [status, setStatus] = useState<BleStudentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('Start when you are seated in class.');
  const [lastSeen, setLastSeen] = useState<Date | null>(null);
  const mounted = useRef(true);
  const lastSubmission = useRef(0);
  const submitting = useRef(false);
  const generation = useRef(0);
  const handles = useRef<PluginListenerHandle[]>([]);

  useEffect(() => {
    mounted.current = true;
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try { const next = await bleStatus(); if (mounted.current) setStatus(next); }
      catch (e) { if (mounted.current) setError(errMsg(e)); }
      finally { pending = false; if (mounted.current) setLoading(false); }
    };
    void poll();
    const timer = setInterval(poll, 5000);
    return () => {
      mounted.current = false; generation.current++;
      clearInterval(timer);
      handles.current.forEach((handle) => void handle.remove());
      handles.current = [];
      if (hasNativeBluetooth) void bluetooth.stop();
    };
  }, []);

  async function stop() {
    generation.current++;
    await bluetooth.stop();
    await Promise.all(handles.current.map((h) => h.remove()));
    handles.current = [];
    setScanning(false);
    setHint('Paused. Tap Start to continue recording your class time.');
  }

  useEffect(() => {
    if (flags?.ble_auto_attendance === false && hasNativeBluetooth) void stop();
  }, [flags?.ble_auto_attendance]);

  async function start() {
    setBusy(true); setError('');
    const attempt = ++generation.current;
    try {
      await Promise.all(handles.current.map((h) => h.remove()));
      handles.current = [];
      const beaconHandle = await bluetooth.addListener('beacon', async (reading) => {
        if (!mounted.current || attempt !== generation.current || submitting.current || Date.now() - lastSubmission.current < 12000) return;
        submitting.current = true;
        lastSubmission.current = Date.now();
        try {
          const response = await bleScan(reading.beaconId, reading.rssi);
          if (!mounted.current || attempt !== generation.current) return;
          if (response.recorded || response.reason === 'already_recorded') {
            setLastSeen(new Date()); setHint('Class signal received. Keep this screen open.'); setError('');
          } else if (response.reason === 'signal_too_weak') setHint('Signal is weak. Move closer to the teacher and try again.');
          else setHint('Room verification is unavailable. Ask your teacher for help.');
        } catch (e) { if (mounted.current && attempt === generation.current) setError(errMsg(e)); }
        finally { submitting.current = false; }
      });
      if (!mounted.current || attempt !== generation.current) { await beaconHandle.remove(); return; }
      handles.current.push(beaconHandle);
      const stoppedHandle = await bluetooth.addListener('stopped', (event) => {
        if (!mounted.current || attempt !== generation.current) return;
        generation.current++; setScanning(false); setHint(event.message);
      });
      if (!mounted.current || attempt !== generation.current) { await stoppedHandle.remove(); return; }
      handles.current.push(stoppedHandle);
      await bluetooth.startScan();
      if (!mounted.current || attempt !== generation.current) { await bluetooth.stop(); return; }
      setScanning(true); setHint('Listening for your teacher’s class signal…');
    } catch (e) {
      if (mounted.current) { setScanning(false); setError(errMsg(e)); }
      await Promise.all(handles.current.map((h) => h.remove())); handles.current = [];
    } finally { if (mounted.current) setBusy(false); }
  }

  const pct = Math.round((status?.progress ?? 0) * 100);
  const disabled = flags?.ble_auto_attendance === false;
  return (
    <div className="student-page flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div><p className="eyebrow">PHONE TO PHONE</p><h1 className="page-title">Bluetooth check-in</h1></div>
        <span className="icon-tile"><Bluetooth size={22} /></span>
      </header>
      <section className="presence-panel glass-medium">
        <span className={'badge ' + (scanning ? 'badge-present' : 'badge-neutral')}><span className="status-dot" />{scanning ? 'Listening' : 'Ready when you are'}</span>
        <div className={'radar ' + (scanning ? 'radar-active' : '')} aria-hidden="true">
          <div className="radar-ring radar-ring-1" /><div className="radar-ring radar-ring-2" /><div className="radar-ring radar-ring-3" />
          <div className="radar-core">{status?.secured ? <Check size={34} /> : <Bluetooth size={34} />}</div>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">{status?.secured ? 'Class time requirement met' : scanning ? 'You focus on class.' : 'Your phone is your check-in.'}</h2>
        <p className="text-ash text-sm leading-relaxed max-w-sm">{status?.secured ? 'Your teacher will finalize the attendance record. Bluetooth measures your phone’s presence.' : hint}</p>
        {lastSeen && <p className="text-xs text-emerald-300">Last signal received at {lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
        {!hasNativeBluetooth ? <p className="notice">Open the Android app to use Bluetooth. QR and teacher-assisted check-in are available here.</p>
          : disabled ? <p className="notice">Your institution has paused Bluetooth attendance. Ask your teacher to mark attendance.</p>
          : <button className={scanning ? 'btn-ghost w-full max-w-sm' : 'btn-primary w-full max-w-sm'} disabled={busy || !flags} onClick={() => void (scanning ? stop() : start()).catch((e) => setError(errMsg(e)))}>
            {busy ? 'Starting Bluetooth…' : scanning ? 'Pause check-in' : 'Start Bluetooth check-in'}
          </button>}
        {error && <p role="alert" className="notice notice-error">{error}</p>}
      </section>
      {loading ? <div className="skeleton h-28" /> : status ? (
        <section className="glass-medium rounded-2xl p-5">
          <div className="flex justify-between items-center gap-4"><div><p className="eyebrow">TIME IN CLASS</p><p className="text-lg font-semibold">{status.dwell_minutes} <span className="text-ash font-normal text-sm">of {status.required_minutes} min</span></p></div><span className="badge badge-neutral">{pct}%</span></div>
          <div className="progress-track mt-4" role="progressbar" aria-label="Required time in class" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="bar-fill h-full" style={{ width: pct + '%' }} /></div>
          <p className="text-xs text-ash mt-3">Detection gaps do not count toward class time. Final attendance is confirmed by your teacher.</p>
        </section>
      ) : <div className="notice flex items-start gap-3"><Radio size={20} className="shrink-0" /><p>No active class for your section. Your teacher starts the session; your phone listens for its signal.</p></div>}
      <div className="glass-medium rounded-2xl p-5 flex flex-col gap-4">
        <p className="eyebrow">BEFORE YOU START</p>
        <div className="checklist-row"><Bluetooth size={18} /><span>Turn on Bluetooth and allow Nearby devices.</span></div>
        <div className="checklist-row"><Smartphone size={18} /><span>Allow precise Location for classroom detection. Keep the app open and internet connected.</span></div>
        <div className="checklist-row"><ShieldCheck size={18} /><span>No cards, tags, GPS coordinates or Bluetooth addresses are collected by this check-in.</span></div>
      </div>
      <Link to="/student/scan" className="fallback-link"><QrCode size={18} /><span>Need another way? Scan a class QR</span><ChevronRight size={18} /></Link>
    </div>
  );
}
