import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export const hasNativeBluetooth = Capacitor.getPlatform() === 'android';
export interface BeaconReading { beaconId: string; rssi: number }
interface AttendanceBluetooth {
  getStatus(): Promise<{ supported: boolean; enabled: boolean; canAdvertise: boolean }>;
  startScan(): Promise<void>;
  advertise(options: { beaconId: string }): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'beacon', listener: (reading: BeaconReading) => void): Promise<PluginListenerHandle>;
  addListener(event: 'stopped', listener: (event: { message: string }) => void): Promise<PluginListenerHandle>;
}
export const bluetooth = registerPlugin<AttendanceBluetooth>('AttendanceBluetooth');
