import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { FACE_MODEL, observationSchema, type FaceObservation } from './faceEvidence.service';
import { httpError } from '../middleware/error.middleware';

export const frameSchema = z.object({ atMs: z.number().int().min(0).max(90_000),
  jpeg: z.string().min(136).max(240_000).regex(/^[A-Za-z0-9+/]+={0,2}$/) }).strict();
export type FaceFrame = z.infer<typeof frameSchema>;
let child: ChildProcessWithoutNullStreams | undefined;
let starting: Promise<void> | undefined;
let pending: { id: string; resolve: (value: FaceObservation[]) => void; reject: (error: Error) => void } | undefined;
let occupied = false, buffer = '';
let readyResolve: (() => void) | undefined, readyReject: ((error: Error) => void) | undefined;
function unavailable() { return httpError(503, 'Face verification is unavailable. Retry shortly or ask for staff review.'); }
function stop() {
  const old = child; child = undefined; buffer = ''; starting = undefined;
  readyReject?.(unavailable()); readyResolve = readyReject = undefined;
  pending?.reject(unavailable()); pending = undefined;
  old?.kill();
}
function start() {
  if (starting) return starting;
  if (process.env.FACE_VISION_ENABLED !== 'true') return Promise.reject(unavailable());
  starting = new Promise<void>((done, fail) => {
    const timer = setTimeout(() => { fail(unavailable()); stop(); }, 30_000);
    readyResolve = () => { clearTimeout(timer); done(); };
    readyReject = (e) => { clearTimeout(timer); fail(e); };
    const processChild = spawn(process.env.FACE_PYTHON || '/opt/vision/bin/python', [resolve('vision/worker.py')], {
      cwd: process.cwd(), env: { ...process.env, PYTHONUNBUFFERED: '1', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child = processChild;
    // Library diagnostics contain no submitted images. Do not echo worker output into application logs.
    processChild.stderr.on('data', () => {});
    processChild.on('error', stop);
    processChild.on('exit', () => { if (child === processChild) stop(); });
    processChild.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 500_000) { stop(); return; }
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        try {
          const packet = JSON.parse(line);
          if (packet.ready === true && packet.model === FACE_MODEL) { readyResolve?.(); readyResolve = readyReject = undefined; continue; }
          if (packet.ready === false) { stop(); return; }
          if (!pending || packet.id !== pending.id) { stop(); return; }
          const current = pending; pending = undefined;
          if (!packet.ok) current.reject(httpError(422, 'Face evidence could not be read. Use good light and keep one face visible.'));
          else if (packet.model !== FACE_MODEL) { current.reject(unavailable()); stop(); return; }
          else {
            const result = z.array(observationSchema).min(8).max(32).safeParse(packet.observations);
            if (result.success) current.resolve(result.data); else { current.reject(unavailable()); stop(); return; }
          }
        } catch { stop(); return; }
      }
    });
  });
  return starting;
}
/** One model process, one bounded job. Busy requests fail with a retry message; no unbounded biometric queue. */
export async function inspectFace(frames: FaceFrame[]) {
  if (occupied) throw httpError(503, 'Face verifier is busy. Wait a few seconds, then try again.');
  occupied = true;
  try {
    await start();
    return await new Promise<FaceObservation[]>((done, fail) => {
      const timer = setTimeout(() => { fail(unavailable()); stop(); }, 45_000);
      pending = { id: randomUUID(), resolve: (value) => { clearTimeout(timer); done(value); }, reject: (e) => { clearTimeout(timer); fail(e); } };
      child!.stdin.write(JSON.stringify({ id: pending.id, frames }) + '\n', (error) => { if (error) stop(); });
    });
  } finally { occupied = false; }
}
export function closeFaceWorker() { stop(); }
export async function checkFaceWorker() { if (process.env.FACE_VISION_ENABLED === 'true') await start(); }
