import { describe, it, expect } from 'vitest';
import {
  evaluateIntegrity,
  assessAttestationHistory,
  type IntegritySignals,
} from './integrity.service';

// Baseline: a valid, enrolled, present student on a fully-capable device.
function base(overrides: Partial<IntegritySignals> = {}): IntegritySignals {
  return {
    mode: 'MODE_B',
    enrollmentTrustState: 'ACTIVE',
    accountAuthenticated: true,
    sessionValid: true,
    blePresent: true,
    esp32Present: false,
    dwellSatisfied: true,
    faceMatch: true,
    livenessPassed: true,
    attestationResult: 'passed',
    recentAttestation: ['passed'],
    otherAnomalies: [],
    attestationPolicy: 'REQUIRE_ALTERNATIVE_VERIFICATION',
    ...overrides,
  };
}

describe('Root of trust — enrollment gates Mode B/C', () => {
  it('UNENROLLED cannot use Mode B biometric verification', () => {
    const d = evaluateIntegrity(base({ enrollmentTrustState: 'UNENROLLED' }));
    expect(d.outcome).toBe('FALLBACK_REQUIRED');
    expect(d.reasons).toContain('not_enrolled_root_of_trust_missing');
  });

  it('PENDING_SUPERVISED_ENROLLMENT cannot use Mode B', () => {
    const d = evaluateIntegrity(base({ enrollmentTrustState: 'PENDING_SUPERVISED_ENROLLMENT' }));
    expect(d.outcome).toBe('FALLBACK_REQUIRED');
  });

  it('REVOKED / REQUIRES_REENROLLMENT fall back', () => {
    expect(evaluateIntegrity(base({ enrollmentTrustState: 'REVOKED' })).outcome).toBe('FALLBACK_REQUIRED');
    expect(evaluateIntegrity(base({ enrollmentTrustState: 'REQUIRES_REENROLLMENT' })).outcome).toBe('FALLBACK_REQUIRED');
  });

  it('Mode A does not require enrollment', () => {
    const d = evaluateIntegrity(base({ mode: 'MODE_A', enrollmentTrustState: 'UNENROLLED', faceMatch: undefined, livenessPassed: undefined }));
    expect(d.outcome).toBe('VERIFIED_PRESENT');
  });
});

describe('Attestation failure is a SIGNAL, not automatic guilt', () => {
  it('unsupported device (attestation unavailable) with strong evidence => VERIFIED, not suspicious', () => {
    const d = evaluateIntegrity(base({ attestationResult: 'unavailable', recentAttestation: ['unavailable'] }));
    expect(d.outcome).toBe('VERIFIED_PRESENT');
    expect(d.reasons).not.toContain('biometric_verification_failed');
  });

  it('single attestation failure alone is NOT flagged as cheating', () => {
    const risks = assessAttestationHistory(['failed'], 0);
    expect(risks).toEqual([]);
  });

  it('repeated unavailable/error is a compatibility signal, never risk', () => {
    const risks = assessAttestationHistory(['unavailable', 'error', 'unavailable', 'error'], 0);
    expect(risks).toEqual([]);
  });

  it('repeated failures WITHOUT other anomalies do not auto-elevate', () => {
    const risks = assessAttestationHistory(['failed', 'failed', 'failed'], 0);
    expect(risks).toEqual([]);
  });

  it('repeated failures WITH independent anomalies produce a risk signal', () => {
    const risks = assessAttestationHistory(['failed', 'failed'], 1);
    expect(risks).toContain('repeated_attestation_failures_with_anomalies');
  });
});

describe('Combined-signal decisions (never single-signal verdicts)', () => {
  it('attestation unavailable + face/liveness pass + strong presence + clean history => VERIFIED', () => {
    const d = evaluateIntegrity(base({
      attestationResult: 'unavailable',
      recentAttestation: ['unavailable', 'unavailable'],
      otherAnomalies: [],
    }));
    expect(d.outcome).toBe('VERIFIED_PRESENT');
  });

  it('genuine biometric failure with weak presence => REVIEW', () => {
    const d = evaluateIntegrity(base({ faceMatch: false, blePresent: false, esp32Present: false, dwellSatisfied: false }));
    expect(d.outcome).toBe('REVIEW_REQUIRED');
    expect(d.reasons).toContain('biometric_verification_failed');
  });

  it('attestation failed + independent anomalies => REVIEW (higher assurance)', () => {
    const d = evaluateIntegrity(base({ attestationResult: 'failed', otherAnomalies: ['device_reuse'], faceMatch: false }));
    expect(d.outcome).toBe('REVIEW_REQUIRED');
  });
});

describe('Attestation policy governs non-passing attestation (institution-set)', () => {
  it('ALLOW_WITH_LOWER_ASSURANCE => verified when presence weak but attestation just unavailable', () => {
    const d = evaluateIntegrity(base({
      attestationResult: 'unavailable', blePresent: false, esp32Present: false, dwellSatisfied: false,
      faceMatch: undefined, livenessPassed: undefined, mode: 'MODE_A',
      attestationPolicy: 'ALLOW_WITH_LOWER_ASSURANCE',
    }));
    expect(d.outcome).toBe('VERIFIED_PRESENT');
  });

  it('TEACHER_REVIEW => review', () => {
    const d = evaluateIntegrity(base({
      attestationResult: 'unavailable', blePresent: false, esp32Present: false, dwellSatisfied: false,
      faceMatch: undefined, livenessPassed: undefined, mode: 'MODE_A',
      attestationPolicy: 'TEACHER_REVIEW',
    }));
    expect(d.outcome).toBe('REVIEW_REQUIRED');
  });

  it('REQUIRE_ALTERNATIVE_VERIFICATION => fallback', () => {
    const d = evaluateIntegrity(base({
      attestationResult: 'unavailable', blePresent: false, esp32Present: false, dwellSatisfied: false,
      faceMatch: undefined, livenessPassed: undefined, mode: 'MODE_A',
      attestationPolicy: 'REQUIRE_ALTERNATIVE_VERIFICATION',
    }));
    expect(d.outcome).toBe('FALLBACK_REQUIRED');
  });
});
