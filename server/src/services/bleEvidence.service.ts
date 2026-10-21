import { createHmac, timingSafeEqual } from 'crypto';

export const BEACON_WINDOW_MS = 30_000;
export const DEFAULT_BLE_POLICY = { dwellPercent: 55, minMinutes: 5, rssiFloor: -80, maxGapSeconds: 60 };
export type BlePolicy = typeof DEFAULT_BLE_POLICY;

export function beaconIdFor(session: { session_id: string; beacon_nonce: string }, window: number, secret: string): string {
  return createHmac('sha256', secret).update(`${session.session_id}|${session.beacon_nonce}|${window}`)
    .digest('hex').slice(0, 16).toUpperCase();
}

export function matchesBeacon(session: { session_id: string; beacon_nonce: string }, beacon: string, window: number, secret: string) {
  if (!/^[A-F0-9]{16}$/.test(beacon)) return false;
  return [window, window - 1].some((w) => timingSafeEqual(Buffer.from(beacon), Buffer.from(beaconIdFor(session, w, secret))));
}

export function campusDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Interpret timetable wall times in the institution's zone, independently of the server's zone. */
export function sessionBounds(session: { date: Date; start_time: string; end_time: string }, timeZone: string) {
  const day = session.date.toISOString().slice(0, 10);
  const toInstant = (time: string) => {
    const wall = new Date(`${day}T${time.slice(0, 5)}:00Z`).getTime();
    let instant = wall;
    for (let i = 0; i < 3; i++) {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date(instant));
      const offset = parts.find((p) => p.type === 'timeZoneName')!.value;
      const match = offset.match(/GMT([+-])(\d{2}):(\d{2})/);
      const minutes = match ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '+' ? 1 : -1) : 0;
      instant = wall - minutes * 60_000;
    }
    return new Date(instant);
  };
  return { start: toInstant(session.start_time), end: toInstant(session.end_time) };
}

export function requiredMinutes(start: string, end: string, policy: BlePolicy): number {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const duration = minutes(end) - minutes(start);
  if (duration <= 0) throw new Error('BLE sessions require an end time after the start time on the same day');
  return Math.min(duration, Math.max(policy.minMinutes, Math.ceil(duration * policy.dwellPercent / 100)));
}

/** Gaps beyond the grace period count for zero time; two isolated sightings cannot earn dwell. */
export function dwellSeconds(pings: { seen_at: Date }[], start: Date, end: Date, maxGapSeconds: number): number {
  const times = [...new Set(pings.map((p) => p.seen_at.getTime()))]
    .filter((t) => t >= start.getTime() && t <= end.getTime()).sort((a, b) => a - b);
  let seconds = 0;
  for (let i = 1; i < times.length; i++) {
    const gap = (times[i] - times[i - 1]) / 1000;
    if (gap <= maxGapSeconds) seconds += gap;
  }
  return Math.floor(seconds);
}
