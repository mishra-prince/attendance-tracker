# Submission prototype — 23 October 2026

Historical initial plan for 0.2.0. The user subsequently requested the original Threshold APK; the current implementation follows `SAME-APP-PLAN.md` and packages this code as an internal library in Threshold 1.2.0.

The existing database already uses central User authentication, ClassSession attendance and supervised enrollment metadata. It does not contain a face template or real face matcher. No schema/data migration, production API change or attendance calculation change is needed for this isolated demonstration.

Add a separate native Android module/package, alongside the unchanged attendance APK and Room Lab. It bundles offline YuNet/SFace face inference and ML Kit eye/pose detection, records a locally supervised demonstration enrollment, listens for the existing ESP32 role-1 A17C beacon, and demonstrates a 60-second class with join and staggered identity checks. Results are local demonstration evidence, never real attendance or institution-approved enrollment. No camera frames/templates enter the attendance server. Existing production auth, roles and roster remain independent.

The existing web enrollment page must describe its manual staff observation accurately instead of implying its checkbox performed face capture. A local setup PIN is a demo safeguard, not staff authentication. Production needs a staff-authorized signed enrollment, server-bound nonces, attestation and independent room validation.

Verify inference inputs, challenge timing, face continuity, stale BLE evidence, encryption/backup exclusions, native build/lint/tests and APK signatures. Physical front-camera, blink, beacon reception and corridor trials require a real phone; no 95% or robust anti-spoof claim follows from software checks.
