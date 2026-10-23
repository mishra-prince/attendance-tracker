# Threshold 1.3.1 verification

24 October 2026. Main package `com.attendance.tracker`, version name 1.3.1, version code 6. This is the existing Threshold APK, not a separate RFID demo. All APKs here remain development/test builds.

The owner-approved API origin is https://threshold-api-j5wk.onrender.com in the APK and reader provisioning defaults. The older custom domain is no longer required. Firmware 1.3.1 was rebuilt and verified against its new immutable-region manifest.

## Delivered behavior

- Admin student registration and CSV workbook import create central User, Student and section subject enrollments atomically. Batches of ten avoid a single long-running class import request. Per-student random imported passwords are returned once to the admin and never audited in plaintext.
- Admin manages revocable per-reader credentials, supervised 60-second card capture, masked card assignments/replacements, card revocation and account deactivation. History is retained. Concurrent registration of one card on two readers is serialized and cannot silently transfer its owner.
- An authenticated reader tap is resolved server-side by registered room, current timetable, active card/student/enrollment and class state. Event IDs are idempotent, rapid taps debounced, stale/future deliveries rejected, class sessions generated automatically and IN/OUT visits audited atomically. Staff/manual attendance is preserved. There is no offline backdating or client-selected attendance/student/session/direction.
- Students see their own daily class records and intervals. Teachers see assigned class lists, HODs their department and admins all. CSV exports apply the same scope and escape spreadsheet formula prefixes. Android file saves use a user-chosen document destination, with no broad storage permission.
- Supabase additive schema repair/migration completed. Existing account, attendance and session row counts were preserved. Columns/enums match the repository schema; pre-existing deferrable foreign keys remain. All 31 application/history tables have RLS and no anon/authenticated/PUBLIC grants. Advisor's no-policy informational notices are deliberate for the Prisma server-only model.

## Checks actually run

- Backend TypeScript build and **66 tests** passed (40 existing, 26 RFID HTTP/database integration cases). Includes migration preservation, reader auth/key rotation/disable, supervised capture, replay collision, debounce, IN/OUT/reentry, wrong room, stale delivery, class locking, audit-failure rollback, card replacement, student removal, role/object scope, same-day attendance percentage, import uniqueness/credentials, CSV injection protection, concurrent card assignment timetable overlaps and teacher quick-start reuse of an RFID-created class.
- Frontend TypeScript/Vite build and Capacitor sync passed. Template is bundled in the APK. Two workbook sheets rendered and inspected; header freeze and two duplicate conditional-format rules confirmed in exported XLSX.
- Android app/library assemble, lint and JVM test tasks passed. **35 meaningful existing face/security tests** pass, plus the template app example test. App lint: **0 errors, 19 warnings**; native classroom library lint: no errors. Final APK rebuild/lint passed after the import batching change.
- APK signature verified against previous Threshold releases: SHA-256 certificate `bca7e1406cb3f713aceeab3d6b50aee0d015933c321e73c046b77b29cdfcfdca`. Android package/version read from the APK. Artifact hashes are in `THRESHOLD-1.3.1-SHA256SUMS.txt`.
- ESP32-S3 firmware compiled with Arduino-ESP32 3.3.2, MFRC522 1.4.12 and ArduinoJson 7.4.2. 1,163,099 program bytes (88% of the application partition), 45,184 static RAM bytes. Merged image is 4 MB. Bootloader/table/application slices match the immutable verification manifest. **11 simulated uploader safety tests** passed without opening a physical serial device.

## Live deployment verified

On 24 October 2026, Render successfully deployed backend commit `e9108c9` using the existing Supabase Session-pooler connection. All three migrations were recognized with none pending. External HTTPS readiness returned HTTP 200. Unauthenticated RFID management/device requests and a nonexistent-account login correctly returned HTTP 401. The APK origin's CORS preflight returned HTTP 204 with credentials allowed for exactly `https://localhost`. No real attendance or student data was created by these deployment checks.

## Still pending

Actual institution login, physical S3 flash verification, RC522 wiring/read/tap tests, Wi-Fi/NTP/TLS tests and phone install/file chooser tests. These are not established by compilation or database migration. Free Render cold starts can exceed the reader retry window; wake and verify `/ready` before collecting attendance.

No 95% reliability, corridor containment, battery life, iPhone/locked-phone support or validated face spoof resistance is claimed. RFID UIDs can be lent/cloned. IN marks present immediately; dwell duration is not an eligibility threshold. Lost checkout taps remain missing. The retained local face demo does not award actual attendance or replace supervised institutional enrollment.

The runtime-only npm dependency audit returned zero known advisories. Render's build-time install also includes development/test tools and reported seven advisories; this does not establish that every development dependency is clean.
