// deviceTier.service.ts — device-tier FAIRNESS metrics.
//
// Purpose (see docs/BACKEND.md "Device-tier fairness"): detect whether attestation/fallback
// requirements disproportionately burden particular device groups. This is a FAIRNESS
// instrument, NOT an integrity signal.
//
// Hard rules:
//   - Device capability is a technical property, never a proxy for honesty.
//   - We NEVER infer socioeconomic characteristics from device type.
//   - Buckets are coarse capability tiers, defined by the institution.

export type DeviceTier =
  | 'modern_supported'
  | 'older_supported'
  | 'no_attestation_capability'
  | 'low_end'
  | 'other_platform';

export interface TierEvent {
  tier: DeviceTier;
  attestationAvailable: boolean;
  attestationFailed: boolean;
  faceVerificationFailed: boolean;
  usedFallback: boolean;
  teacherReview: boolean;
  verificationMs: number;
  attendanceRejected: boolean;
  appealed: boolean;
}

export interface TierMetrics {
  tier: DeviceTier;
  n: number;
  attestationAvailabilityRate: number;
  attestationFailureRate: number;
  faceVerificationFailureRate: number;
  fallbackFrequency: number;
  teacherReviewFrequency: number;
  avgVerificationMs: number;
  attendanceRejectionRate: number;
  appealRate: number;
}

function rate(count: number, n: number): number {
  return n === 0 ? 0 : Math.round((count / n) * 10000) / 10000;
}

/** Aggregate raw per-attempt events into per-tier fairness metrics. */
export function aggregateTierMetrics(events: TierEvent[]): TierMetrics[] {
  const byTier = new Map<DeviceTier, TierEvent[]>();
  for (const e of events) {
    const arr = byTier.get(e.tier) ?? [];
    arr.push(e);
    byTier.set(e.tier, arr);
  }

  const out: TierMetrics[] = [];
  for (const [tier, evs] of byTier) {
    const n = evs.length;
    out.push({
      tier,
      n,
      attestationAvailabilityRate: rate(evs.filter((e) => e.attestationAvailable).length, n),
      attestationFailureRate: rate(evs.filter((e) => e.attestationFailed).length, n),
      faceVerificationFailureRate: rate(evs.filter((e) => e.faceVerificationFailed).length, n),
      fallbackFrequency: rate(evs.filter((e) => e.usedFallback).length, n),
      teacherReviewFrequency: rate(evs.filter((e) => e.teacherReview).length, n),
      avgVerificationMs: n === 0 ? 0 : Math.round(evs.reduce((s, e) => s + e.verificationMs, 0) / n),
      attendanceRejectionRate: rate(evs.filter((e) => e.attendanceRejected).length, n),
      appealRate: rate(evs.filter((e) => e.appealed).length, n),
    });
  }
  return out;
}

/**
 * Flag tiers whose burden metrics diverge materially from the best-performing tier.
 * This surfaces UNFAIR technical burden — it does not judge the students on those devices.
 */
export function flagFairnessDisparities(metrics: TierMetrics[], tolerancePct = 0.15): string[] {
  const flags: string[] = [];
  if (metrics.length < 2) return flags;

  const minRejection = Math.min(...metrics.map((m) => m.attendanceRejectionRate));
  const minFallback = Math.min(...metrics.map((m) => m.fallbackFrequency));

  for (const m of metrics) {
    if (m.attendanceRejectionRate - minRejection > tolerancePct) {
      flags.push(`${m.tier}: attendance rejection ${(m.attendanceRejectionRate * 100).toFixed(1)}% exceeds fairest tier by >${tolerancePct * 100}%`);
    }
    if (m.fallbackFrequency - minFallback > tolerancePct) {
      flags.push(`${m.tier}: fallback frequency ${(m.fallbackFrequency * 100).toFixed(1)}% exceeds fairest tier by >${tolerancePct * 100}%`);
    }
  }
  return flags;
}
