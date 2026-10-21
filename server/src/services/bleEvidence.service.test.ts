import { describe, it, expect } from 'vitest';
import { BEACON_WINDOW_MS, DEFAULT_BLE_POLICY, beaconIdFor, matchesBeacon, dwellSeconds, requiredMinutes, sessionBounds, campusDate } from './bleEvidence.service';

const session = { session_id: 'class-a', beacon_nonce: 'private-nonce' };
const secret = 'test-only-beacon-secret-at-least-32-characters';
describe('Bluetooth evidence', () => {
  it('accepts current and previous windows, rejecting older, future and foreign signals', () => {
    expect(matchesBeacon(session, beaconIdFor(session, 100, secret), 100, secret)).toBe(true);
    expect(matchesBeacon(session, beaconIdFor(session, 99, secret), 100, secret)).toBe(true);
    for (const window of [98, 101]) expect(matchesBeacon(session, beaconIdFor(session, window, secret), 100, secret)).toBe(false);
    expect(matchesBeacon({ ...session, session_id: 'class-b' }, beaconIdFor(session, 100, secret), 100, secret)).toBe(false);
    expect(matchesBeacon(session, 'not-a-beacon', 100, secret)).toBe(false);
    expect(matchesBeacon(session, beaconIdFor(session, 100, 'wrong'), 100, secret)).toBe(false);
  });
  it('counts continuous observations but gives no credit for long gaps or duplicate packets', () => {
    const start = new Date('2026-10-20T04:00:00Z');
    const end = new Date('2026-10-20T05:00:00Z');
    const pings = [-30, 0, 30, 30, 60, 600, 630, 3601].map((seconds) => ({ seen_at: new Date(start.getTime() + seconds * 1000) }));
    expect(dwellSeconds(pings, start, end, 60)).toBe(90);
    expect(dwellSeconds([], start, end, 60)).toBe(0);
    expect(dwellSeconds([pings[1]], start, end, 60)).toBe(0);
  });
  it('does not let two isolated pings earn even a minute', () => {
    const start = new Date(0);
    expect(dwellSeconds([{ seen_at: start }, { seen_at: new Date(3600000) }], start, new Date(4000000), 60)).toBe(0);
  });
  it('uses institution time rather than server time, including date boundaries', () => {
    expect(campusDate(new Date('2026-10-19T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-10-20');
    const bounds = sessionBounds({ date: new Date('2026-10-20T00:00:00Z'), start_time: '09:00', end_time: '10:00' }, 'Asia/Kolkata');
    expect(bounds.start.toISOString()).toBe('2026-10-20T03:30:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-10-20T04:30:00.000Z');
  });
  it('supports timezone offsets west of UTC', () => {
    const bounds = sessionBounds({ date: new Date('2026-10-20T00:00:00Z'), start_time: '09:00', end_time: '10:00' }, 'America/New_York');
    expect(bounds.start.toISOString()).toBe('2026-10-20T13:00:00.000Z');
  });
  it('applies configured dwell and caps short classes at their actual duration', () => {
    expect(requiredMinutes('09:00', '10:00', DEFAULT_BLE_POLICY)).toBe(33);
    expect(requiredMinutes('09:00', '10:00', { ...DEFAULT_BLE_POLICY, dwellPercent: 80 })).toBe(48);
    expect(requiredMinutes('09:00', '09:03', DEFAULT_BLE_POLICY)).toBe(3);
    expect(() => requiredMinutes('10:00', '09:00', DEFAULT_BLE_POLICY)).toThrow();
    expect(BEACON_WINDOW_MS).toBe(30000);
  });
});
