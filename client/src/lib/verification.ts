import { Capacitor, registerPlugin } from '@capacitor/core';

export const hasNativeVerification = Capacitor.getPlatform() === 'android';
export const verification = registerPlugin<{ openClassDemo(): Promise<void> }>('AttendanceVerification');
