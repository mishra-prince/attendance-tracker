# Threshold 1.4.0 build and rollout record

24 October 2026. Same main app: `com.attendance.tracker`, versionCode **7**, versionName **1.4.0**. No separate demo APK is the deliverable.

## Added permanent behavior

- Supervised, scoped institutional face capture replaces checkbox-only enrollment. Existing metadata and demo templates do not count as face references.
- Server YuNet/SFace identity matching plus MediaPipe action evaluation; two distinct random actions, neutral identity checkpoints, expiring single-use challenges, login/student/class/version binding and exact-clip replay detection.
- AES-256-GCM references bound to student/model/version, staff consent/ID record, HOD/admin recovery/revocation and deletion on student deactivation. No raw photos persisted.
- Visible native camera preparation and Start button; automatic bounded RAM-only capture. No background camera. Student entry/random class checks, teacher status, optional combined RFID credit and existing staff correction path.
- One bounded upload/inference job, pre-JSON admission, bounded retry and no unbounded biometric queue. New RFID entries require both face checks before automatic credit, as explicitly selected by the owner. Physical calibration remains pending.

## Passed software checks

- Backend TypeScript build and **74 tests**, including real HTTP/PGlite migration, auth/scope, no client success flags, supervised-only enrollment, expiry/replay, atomic audit rollback, encrypted references, busy retry, revoked references and combined card/face credit. HTTP integration isolates inference with a test double; separate checks below exercise real models.
- Frontend production build and Capacitor sync.
- Android main APK assemble/lint/unit tests; internal camera library lint and **38 JVM tests**. The app's existing example test also passes. Both lint reports have **0 errors, 19 warnings** (the app report includes library warnings).
- Real Python/OpenCV/MediaPipe model loading and worker protocol on this Mac. SFace generated normalized 128-value embeddings; repeated-image cosine 1.0 and different-portrait cosine about -0.023 for the two public fixtures. Blank frame rejected. Public fixtures are not committed and no live students were enrolled by these tests. This proves inference execution, not population accuracy/PAD.
- One smoke run measured about **328 MiB** peak worker memory on this Mac. It does not establish Linux/Render load capacity. Linux x86_64 Python 3.12 binary wheels resolved for all pinned dependencies.
- Server runtime-only npm audit: **0 known advisories** at build time. Build/test dependencies still require normal maintenance.
- APK signature verified: certificate SHA-256 `bca7e1406cb3f713aceeab3d6b50aee0d015933c321e73c046b77b29cdfcfdca` (same as 1.3.1). APK SHA-256 `f4a5e358aeec2c913ef775932e8c0dd4ef54aec527be838e3c7df7071e883d61`.

## Deployment status

**Live at 23:19:05 IST on 24 October 2026.** The existing Render service successfully deployed backend commit `d9778ea5bc572e4a8dbb9680a9bd57ec9aa03d2b` using Docker. [Verified deployment](https://dashboard.render.com/web/srv-dbdrqrrncjis73d9n3pg/deploys/dep-dbeetsm7bikc7387r43g). All four Prisma migrations are applied, including `20261024030000_permanent_face`.

External HTTPS checks passed: `/ready` returns 200 with `face_verifier: ready`; face policy, image-submission and RFID-reader endpoints reject unauthenticated requests with 401. The enabled worker warms the detector, recognizer and landmark inference paths before startup/readiness can pass. Linux uses official MediaPipe 0.10.35; local Mac tests use 1.1.1. The compatibility pin avoids the newest Linux allocator's CPU-discovery abort in Render; EGL/GLES libraries are installed explicitly. Mandatory face gating is the server default at the owner's explicit request; no opt-out setting exists in the live database.

Supabase verification found RLS enabled on all face tables and no grants to anon/authenticated/PUBLIC. The security advisor reports only 33 expected informational no-policy notices: direct browser table access intentionally stays denied ([explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). Existing **9 users and 78 attendance records** remain unchanged. No live student was enrolled or awarded attendance by these checks. Private credentials and the public API URL are preserved; no seed/reset was run.

The APK remains the same signed 1.4.0 artifact; the required-credit default and Linux compatibility fixes are server changes. Software checks do not establish a physical classroom pass.

## Physical validation still required

Nothing Phone (1) preparation/smile/turn/eye capture, ML Kit/MediaPipe axis and expression agreement, camera pause/permission behavior, real enrollment/matching and accessible alternatives, spoof/replay/injection resistance, fairness across lighting/student groups, RC522 entry/exit and 60-student load. No ESP32 serial write or physical attendance pass is claimed. Basic active liveness is not validated PAD or a 95% reliability result.

[Setup and operation](../docs/PERMANENT-FACE-SETUP.md) · [APK checksum](THRESHOLD-1.4.0-SHA256SUMS.txt)
