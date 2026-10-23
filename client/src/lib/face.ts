import { api } from './api';
import { hasNativeVerification, verification, type FaceChallenge } from './verification';
import type { EnrollmentMethod } from './features';

export async function runFaceCapture(challenge: FaceChallenge, progress: (message: string) => void) {
  if (!hasNativeVerification) throw new Error('Open this page in the updated Threshold Android app to use the face camera.');
  progress('Follow the camera instructions. Capture happens automatically.');
  const evidence = await verification.captureFace({ actions: challenge.actions, purpose: challenge.purpose });
  try {
    progress('Checking identity and actions securely. This may take a moment…');
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await api.post(`/face/challenges/${challenge.challengeId}/complete`, evidence, { timeout: 90_000 });
        return result.data.data as { verified: boolean; purpose: string; phase: string | null };
      } catch (error: any) {
        if (error?.response?.status !== 503 || attempt >= 5 || Date.now() + 6_000 >= Date.parse(challenge.expiresAt)) throw error;
        progress('The verifier is busy. Retrying your captured sequence; no new camera check is needed…');
        await new Promise((resolve) => window.setTimeout(resolve,3_000 + Math.random()*3_000));
      }
    }
  } finally { evidence.frames.length = 0; }
}
export async function enrollFace(options: { studentId: string; replace: boolean; enrollmentMethod: EnrollmentMethod; idConfirmed: true; consentRecorded: true }, progress: (message: string) => void) {
  if (!hasNativeVerification) throw new Error('Use the updated Threshold Android app for supervised face capture.');
  progress('Preparing a secure camera check…');
  const r = await api.post('/face/enroll/challenge', options);
  return runFaceCapture(r.data.data, progress);
}
export async function verifyClassFace(sessionId: string, progress: (message: string) => void) {
  if (!hasNativeVerification) throw new Error('Use the updated Threshold Android app to verify your face.');
  progress('Preparing your camera check…');
  const r = await api.post('/face/verify/challenge', { sessionId });
  return runFaceCapture(r.data.data, progress);
}
export interface FaceStatus { approvedFace: boolean; required: boolean; joinPassed: boolean; spotPassed: boolean; due: 'JOIN' | 'SPOT' | null; expired: boolean; }
