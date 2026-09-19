// integrity.service.ts — Threshold integrity engine.
//
// Design principles (see docs/BACKEND.md "Integrity Architecture" and the Root of Trust section):
//   1. Institutional identity established at supervised enrollment is the ROOT OF TRUST.
//   2. Device attestation is an integrity SIGNAL, never proof of identity.
//   3. A missing/failed attestation is NOT evidence of dishonesty — it may be an
//      unsupported device, old OS, network hiccup, etc.
//   4. Device capability is a technical property, never an integrity judgment.
//   5. The engine combines multiple INDEPENDENT signals; no single signal is a verdict.
//
// This module is pure/deterministic so it is fully unit-testable without a DB.

export type Outcome = 'VERIFIED_PRESENT' | 'REVIEW_REQUIRED' | 'FALLBACK_REQUIRED';

export type AttestationResult = 'passed' | 'failed' | 'unavailable' | 'error';
export type AttestationPolicy =
  | 'ALLOW_WITH_LOWER_ASSURANCE'
  | 'REQUIRE_ALTERNATIVE_VERIFICATION'
  | 'TEACHER_REVIEW';
export type EnrollmentTrustState =
  | 'UNENROLLED'
  | 'PENDING_SUPERVISED_ENROLLMENT'
  | 'ACTIVE'
  | 'REVOKED'
  | 'REQUIRES_REENROLLMENT';
export type Mode = 'MODE_A' | 'MODE_B' | 'MODE_C';

export interface IntegritySignals {
  mode: Mode;
  // Root of trust
  enrollmentTrustState: EnrollmentTrustState;
  // Account / session
  accountAuthenticated: boolean;
  sessionValid: boolean;
  // Classroom presence (independent signals)
  blePresent?: boolean;
  esp32Present?: boolean;
  dwellSatisfied?: boolean;
  // Biometric verification (Mode B/C)
  faceMatch?: boolean;
  livenessPassed?: boolean;
  challengePassed?: boolean;
  // Device integrity — a signal, NOT identity
  attestationResult: AttestationResult;
  // Attestation history: recent results for THIS student's device(s), newest first
  recentAttestation?: AttestationResult[];
  // Other independent anomaly signals already surfaced elsewhere (e.g. device reuse,
  // impossible travel, velocity). true = an anomaly is present.
  otherAnomalies?: string[];
  // Institution policy for how to treat non-passing attestation. NEVER client-chosen.
  attestationPolicy: AttestationPolicy;
}

export interface IntegrityDecision {
  outcome: Outcome;
  reasons: string[];
  // Non-binding risk score for review triage; NEVER used as an automatic guilt threshold.
  riskSignals: string[];
}

// attestation_failed != cheating. Only `passed` is a positive signal; everything else is
// "not proven", which the policy — not a guilt rule — decides how to handle.
function attestationIsPositive(r: AttestationResult): boolean {
  return r === 'passed';
}

// A device that simply can't attest (unavailable/error) is a compatibility fact, not suspicion.
function attestationIsBenignGap(r: AttestationResult): boolean {
  return r === 'unavailable' || r === 'error';
}

/**
 * Pattern-based risk from attestation history. Repeated FAILED results are only a
 * meaningful risk signal when combined with OTHER independent anomalies. Repeated
 * `unavailable`/`error` are treated as a device-compatibility issue, never risk.
 */
export function assessAttestationHistory(history: AttestationResult[] = [], otherAnomalyCount = 0): string[] {
  const risks: string[] = [];
  const failed = history.filter((r) => r === 'failed').length;
  const benignGaps = history.filter(attestationIsBenignGap).length;

  // Repeated unavailable/error => compatibility signal, explicitly NOT risk.
  if (benignGaps >= 3 && failed === 0) {
    // no-op: this is a device capability/fallback signal, handled by fairness path.
    return risks;
  }

  // A single failure is low significance on its own.
  if (failed === 1 && otherAnomalyCount === 0) return risks;

  // Repeated failures alone are still NOT an automatic violation — only elevate when
  // combined with independent anomalies.
  if (failed >= 2 && otherAnomalyCount >= 1) {
    risks.push('repeated_attestation_failures_with_anomalies');
  } else if (failed >= 4 && otherAnomalyCount >= 1) {
    risks.push('systematic_attestation_failures_with_anomalies');
  }
  return risks;
}

/**
 * Core engine. Combines independent signals into an outcome. Never collapses to
 * "attestation failed => cheating" or "face => identity" or "device => person".
 */
export function evaluateIntegrity(s: IntegritySignals): IntegrityDecision {
  const reasons: string[] = [];

  // Hard preconditions — not integrity judgments, just validity.
  if (!s.accountAuthenticated || !s.sessionValid) {
    return { outcome: 'REVIEW_REQUIRED', reasons: ['account_or_session_invalid'], riskSignals: [] };
  }

  // Root of trust gate: Mode B/C require an ACTIVE biometric enrollment.
  if ((s.mode === 'MODE_B' || s.mode === 'MODE_C')) {
    if (s.enrollmentTrustState === 'UNENROLLED' || s.enrollmentTrustState === 'PENDING_SUPERVISED_ENROLLMENT') {
      return { outcome: 'FALLBACK_REQUIRED', reasons: ['not_enrolled_root_of_trust_missing'], riskSignals: [] };
    }
    if (s.enrollmentTrustState === 'REVOKED' || s.enrollmentTrustState === 'REQUIRES_REENROLLMENT') {
      return { outcome: 'FALLBACK_REQUIRED', reasons: ['enrollment_revoked_or_stale'], riskSignals: [] };
    }
  }

  // Classroom presence — independent evidence.
  const presenceSignals = [s.blePresent, s.esp32Present, s.dwellSatisfied].filter((x) => x === true).length;
  const strongPresence = presenceSignals >= 1;

  // Biometric verification (Mode B/C).
  const bioRequired = s.mode === 'MODE_B' || s.mode === 'MODE_C';
  const bioPassed = !bioRequired || (s.faceMatch === true && s.livenessPassed === true);

  // Independent anomaly count (NOT device capability).
  const otherAnomalyCount = (s.otherAnomalies ?? []).length;

  // Attestation history risk — combined-signal only.
  const riskSignals = assessAttestationHistory(s.recentAttestation ?? [s.attestationResult], otherAnomalyCount);

  // Device attestation handling. A non-positive attestation is NOT suspicion by itself.
  const attestationOk = attestationIsPositive(s.attestationResult);
  const attestationBenignGap = attestationIsBenignGap(s.attestationResult);

  // Decision composition -------------------------------------------------

  // Strong legitimate case: enrolled + biometric passed + real classroom presence,
  // even if device attestation is unavailable. Must NOT be flagged suspicious.
  if (bioPassed && strongPresence && (attestationOk || attestationBenignGap)) {
    if (riskSignals.length > 0) {
      reasons.push('verified_but_risk_signals_recorded');
      return { outcome: 'VERIFIED_PRESENT', reasons, riskSignals };
    }
    reasons.push('all_independent_signals_consistent');
    return { outcome: 'VERIFIED_PRESENT', reasons, riskSignals };
  }

  // Biometric explicitly failed (not merely unavailable) with weak presence => review.
  if (bioRequired && (s.faceMatch === false || s.livenessPassed === false)) {
    reasons.push('biometric_verification_failed');
    return { outcome: 'REVIEW_REQUIRED', reasons, riskSignals };
  }

  // Attestation genuinely FAILED (device claims tampering) AND other anomalies => higher assurance.
  if (s.attestationResult === 'failed' && otherAnomalyCount >= 1) {
    reasons.push('attestation_failed_with_independent_anomalies');
    return { outcome: 'REVIEW_REQUIRED', reasons, riskSignals };
  }

  // Attestation can't pass (unavailable/error/failed-without-anomalies): apply POLICY,
  // never an automatic guilt verdict.
  if (!attestationOk) {
    switch (s.attestationPolicy) {
      case 'ALLOW_WITH_LOWER_ASSURANCE':
        reasons.push('attestation_not_passed_allowed_lower_assurance');
        return { outcome: 'VERIFIED_PRESENT', reasons, riskSignals };
      case 'TEACHER_REVIEW':
        reasons.push('attestation_not_passed_teacher_review');
        return { outcome: 'REVIEW_REQUIRED', reasons, riskSignals };
      case 'REQUIRE_ALTERNATIVE_VERIFICATION':
      default:
        reasons.push('attestation_not_passed_fallback');
        return { outcome: 'FALLBACK_REQUIRED', reasons, riskSignals };
    }
  }

  // Enrolled + attestation ok but weak classroom presence => review, not guilt.
  if (!strongPresence) {
    reasons.push('insufficient_classroom_presence');
    return { outcome: 'REVIEW_REQUIRED', reasons, riskSignals };
  }

  reasons.push('default_review');
  return { outcome: 'REVIEW_REQUIRED', reasons, riskSignals };
}
