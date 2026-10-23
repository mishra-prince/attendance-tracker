import { Capacitor, registerPlugin } from '@capacitor/core';

export const hasNativeVerification = Capacitor.getPlatform() === 'android';
export type FaceAction = 'BLINK' | 'SMILE' | 'TURN_LEFT' | 'TURN_RIGHT' | 'LOOK_UP' | 'LOOK_DOWN';
export interface FaceChallenge { challengeId: string; actions: FaceAction[]; expiresAt: string; purpose: string; phase: string | null; }
export const verification = registerPlugin<{
  openClassDemo(): Promise<void>;
  captureFace(options: { actions: FaceAction[]; purpose: string }): Promise<{ frames: { atMs: number; jpeg: string }[] }>;
}>('AttendanceVerification');
