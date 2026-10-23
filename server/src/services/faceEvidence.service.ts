import { z } from 'zod';

export const FACE_MODEL = 'sface-2021dec-yunet-2023mar-mp-fl-v1';
export const FACE_ACTIONS = ['BLINK', 'SMILE', 'TURN_LEFT', 'TURN_RIGHT', 'LOOK_UP', 'LOOK_DOWN'] as const;
export type FaceAction = typeof FACE_ACTIONS[number];
export const observationSchema = z.object({
  atMs: z.number().int().min(0).max(90_000), yaw: z.number().finite(), pitch: z.number().finite(),
  leftBlink: z.number().min(0).max(1), rightBlink: z.number().min(0).max(1), smile: z.number().min(0).max(1),
  neutral: z.boolean(), vector: z.array(z.number().finite()).length(128).nullable(),
}).strict();
export type FaceObservation = z.infer<typeof observationSchema>;
export function normalized(vector: number[]) {
  if (vector.length !== 128 || vector.some((v) => !Number.isFinite(v))) throw new Error('FACE_VECTOR_INVALID');
  const norm = Math.hypot(...vector);
  if (norm < 1e-8) throw new Error('FACE_VECTOR_INVALID');
  return vector.map((v) => v / norm);
}
export function similarity(a: number[], b: number[]) {
  const x = normalized(a), y = normalized(b);
  return x.reduce((sum, v, i) => sum + v * y[i], 0);
}
export function actionSeen(o: FaceObservation): FaceAction | null {
  if (o.yaw > 20 && Math.abs(o.pitch) < 18) return 'TURN_LEFT';
  if (o.yaw < -20 && Math.abs(o.pitch) < 18) return 'TURN_RIGHT';
  if (o.pitch > 16 && Math.abs(o.yaw) < 15) return 'LOOK_UP';
  if (o.pitch < -16 && Math.abs(o.yaw) < 15) return 'LOOK_DOWN';
  if (Math.abs(o.yaw) < 15 && Math.abs(o.pitch) < 15) {
    if (o.smile > .65) return 'SMILE';
    if (o.leftBlink > .55 && o.rightBlink > .55) return 'BLINK';
  }
  return null;
}

/** Called ONLY on trusted worker output, never on client-supplied observations. */
export function evaluateFaceEvidence(actions: FaceAction[], observations: FaceObservation[], reference: number[] | null,
  policy: { match: number; continuity: number }) {
  if (actions.length !== 2 || new Set(actions).size !== 2 || observations.length < 8 || observations.length > 32) throw new Error('FACE_SEQUENCE_INVALID');
  let stage: 'CENTER' | 'ACTION' | 'RETURN' = 'CENTER', index = 0, stable = 0, hits = 0;
  let blinkClosed = false, minimumScore = 1, previous = -1;
  const samples: number[][] = [];
  for (const o of observations) {
    observationSchema.parse(o);
    if (o.atMs <= previous || (previous >= 0 && o.atMs - previous > 12_000)) throw new Error('FACE_TIMING_INVALID');
    previous = o.atMs;
    // Recompute neutral criteria; a compromised worker flag cannot hide non-neutral samples.
    const neutral = Math.abs(o.yaw) < 15 && Math.abs(o.pitch) < 15 && o.leftBlink < .35 && o.rightBlink < .35 && o.smile < .4;
    if (neutral) {
      if (!o.vector) throw new Error('FACE_IDENTITY_UNREADABLE');
      const vector = normalized(o.vector);
      if (reference) {
        const score = similarity(vector, reference); minimumScore = Math.min(minimumScore, score);
        if (score < policy.match) throw new Error('FACE_IDENTITY_MISMATCH');
      }
      if (samples.length && similarity(vector, samples[0]) < policy.continuity) throw new Error('FACE_IDENTITY_CHANGED');
      samples.push(vector);
    }
    if (index === actions.length) {
      if (!neutral) throw new Error('FACE_RETURN_TO_CENTER_REQUIRED');
      continue;
    }
    if (stage === 'CENTER' || stage === 'RETURN') {
      stable = neutral ? stable + 1 : 0;
      const heldAction = actionSeen(o);
      // A third qualifying capture can arrive while the phone changes its return instruction.
      if (heldAction && (stage === 'CENTER' || heldAction !== actions[index])) throw new Error('FACE_ACTION_OUT_OF_ORDER');
      if (stable >= 2) {
        if (stage === 'RETURN') index++;
        stage = 'ACTION'; stable = hits = 0; blinkClosed = false;
      }
      continue;
    }
    const action = actionSeen(o), expected = actions[index];
    if (action && action !== expected) throw new Error('FACE_ACTION_OUT_OF_ORDER');
    if (expected === 'BLINK') {
      if (action === 'BLINK') { hits++; if (hits >= 2) { blinkClosed = true; hits = 0; } }
      else if (blinkClosed && o.leftBlink < .35 && o.rightBlink < .35 && Math.abs(o.yaw) < 15 && Math.abs(o.pitch) < 15) {
        if (++stable >= 2) { stage = 'RETURN'; stable = hits = 0; }
      } else { stable = 0; if (!blinkClosed) hits = 0; }
    } else {
      hits = action === expected ? hits + 1 : 0;
      if (hits >= 2) { stage = 'RETURN'; stable = hits = 0; }
    }
  }
  if (index !== actions.length || samples.length < 6) throw new Error('FACE_ACTIONS_INCOMPLETE');
  const average = normalized(samples[0].map((_, i) => samples.reduce((sum, s) => sum + s[i], 0) / samples.length));
  return { vector: average, minimumScore, samples: samples.length };
}
