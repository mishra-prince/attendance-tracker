import { describe, it, expect } from 'vitest';
import { aggregateTierMetrics, flagFairnessDisparities, type TierEvent } from './deviceTier.service';

function ev(overrides: Partial<TierEvent>): TierEvent {
  return {
    tier: 'modern_supported',
    attestationAvailable: true,
    attestationFailed: false,
    faceVerificationFailed: false,
    usedFallback: false,
    teacherReview: false,
    verificationMs: 1000,
    attendanceRejected: false,
    appealed: false,
    ...overrides,
  };
}

describe('Device-tier fairness metrics', () => {
  it('aggregates rates per tier', () => {
    const events: TierEvent[] = [
      ev({ tier: 'modern_supported' }),
      ev({ tier: 'modern_supported' }),
      ev({ tier: 'no_attestation_capability', attestationAvailable: false, usedFallback: true }),
      ev({ tier: 'no_attestation_capability', attestationAvailable: false, usedFallback: true }),
    ];
    const m = aggregateTierMetrics(events);
    const modern = m.find((x) => x.tier === 'modern_supported')!;
    const noAtt = m.find((x) => x.tier === 'no_attestation_capability')!;
    expect(modern.attestationAvailabilityRate).toBe(1);
    expect(noAtt.attestationAvailabilityRate).toBe(0);
    expect(noAtt.fallbackFrequency).toBe(1);
  });

  it('flags a tier that is disproportionately burdened', () => {
    // modern tier: no rejections; low-end tier: rejected every time
    const events: TierEvent[] = [
      ev({ tier: 'modern_supported' }),
      ev({ tier: 'modern_supported' }),
      ev({ tier: 'low_end', attendanceRejected: true, usedFallback: true }),
      ev({ tier: 'low_end', attendanceRejected: true, usedFallback: true }),
    ];
    const m = aggregateTierMetrics(events);
    const flags = flagFairnessDisparities(m, 0.15);
    expect(flags.some((f) => f.startsWith('low_end'))).toBe(true);
  });

  it('does not flag when tiers behave equivalently', () => {
    const events: TierEvent[] = [
      ev({ tier: 'modern_supported' }),
      ev({ tier: 'older_supported' }),
    ];
    const flags = flagFairnessDisparities(aggregateTierMetrics(events), 0.15);
    expect(flags).toEqual([]);
  });
});
