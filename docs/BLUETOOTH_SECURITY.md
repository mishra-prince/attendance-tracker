# Threshold 1.1: Bluetooth setup and security

Students use their Android phones. They do not need RFID cards, wristbands, or tags.

## What is implemented

- A native Capacitor Android plugin broadcasts an 8-byte rotating classroom token from the teacher phone and scans for it on student phones. No pairing is required.
- Nearby devices and precise Location permissions are requested only when starting Bluetooth. Location is declared because the purpose is to establish classroom presence; the app does not read GPS coordinates.
- The app checks device support and reports permission failures. Browsers show the Android requirement instead of pretending to scan.
- Both apps must remain open on their Bluetooth screens with internet connected. Native radio work stops when the app leaves the foreground; scanning/broadcasting keeps the screen awake. Returning requires pressing Start again.
- The server issues HMAC-based tokens, rotating every 30 seconds. It tolerates the previous window for delivery delay, checks the scheduled day/time in the institution timezone, assigned teacher, active subject enrollment, and student section.
- Scan strength is validated and weak readings are ignored. Only one observation per student per server window is stored, enforced by a database unique constraint. The scan limit applies per authenticated student so shared classroom Wi-Fi works.
- Consecutive sightings contribute to dwell only if the gap is within policy. Longer gaps contribute zero. Token expiration and timestamps use server time.
- Finalization is a transaction: qualifying students get present records, existing manual/medical/leave decisions are preserved, and each new record is audited. Insufficient evidence stays unmarked for teacher review. The teacher reviews the roster and submits it separately.
- Teachers can end a signal without changing attendance, including when a roster was already closed.
- Access credentials live in memory. Rotating refresh credentials live in HttpOnly cookies; only their hashes are stored in the database. Logout and account disablement invalidate active access immediately. Roles and profiles are reloaded from the database.
- APK backups and cleartext traffic are disabled; microphone permissions and broad file-sharing paths were removed.

## Using two phones

1. Configure the institution, student enrollments, teacher assignment and timetable.
2. Teacher: sign in to Staff → Take Attendance during the scheduled class → Start BLE → Start class broadcast. Allow Nearby devices and turn on Bluetooth.
3. Student: sign in → Check in → Start Bluetooth check-in. Allow Nearby devices and precise Location; older Android versions also need Location services enabled.
4. Keep both screens open. Students see recorded minutes toward the institution's requirement. The default is 55% of the scheduled duration, with a five-minute minimum capped to the duration of a short class.
5. Teacher: Finalize Bluetooth & review roster. Review students without enough evidence, check any existing manual records, then submit the roster.

A class started late still requires the scheduled dwell requirement. A phone without BLE broadcasting support can be replaced with another teacher Android phone, or the teacher can use the existing manual/QR workflow. A device limitation is not evidence of dishonesty.

## Server deployment

The included APK targets https://att.threshold.dpdns.org, confirmed by the repository owner. Its new authentication and Bluetooth flows require this updated backend. The live server was not changed during this task.

1. Back up the database and stop ongoing attendance sessions.
2. Install Node.js 22 or newer and PostgreSQL 14 or newer.
3. Copy server/.env.example to server/.env. Set the database URL and generate three distinct random secrets, each at least 32 characters. A generator is:
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
4. Set NODE_ENV=production and CLIENT_URL to exact browser origins, comma-separated. The Android origin https://localhost is already included. Do not use a wildcard. Set ATTENDANCE_TIMEZONE to the institution's IANA timezone (default Asia/Kolkata).
5. Set TRUST_PROXY_HOPS=1 only if direct access is blocked and all API traffic passes through exactly one trusted reverse proxy; otherwise leave it at 0.
6. In server/: npm ci; npx prisma generate; npm run migrate:deploy; npm run build; npm start.
7. Use HTTPS for the API and reverse proxy. Validate login, refresh after 15 minutes, and sign-out from both Android and web.
8. Install the test APK on two physical phones and run the checks below.

Migration 20261020120000_bluetooth_and_sessions restores BLE, identity, and section join-code structures missing from the original migration history, and adds RefreshSession. It was tested against a clean database created from the committed initial migration.

If a live database was created with prisma db push or manual SQL and already has these structures, compare its schema and reconcile/baseline its migration history before applying this migration. It is not a blind replay over an untracked live schema. No production database was accessed or migrated.

Old login tokens are intentionally invalid after this update; everyone must sign in again. Database rollback needs planning: restore the backup and previous server/client together rather than dropping new tables with live attendance data.

## Live server DNS finding (20 October 2026)

The confirmed hostname att.threshold.dpdns.org did not resolve during verification. Google's public DNS returned SERVFAIL (status 2), with name servers refusing queries at the threshold.dpdns.org delegation. The same failure occurred with DNSSEC checking disabled, so this is not simply a browser or APK problem.

Check the domain's delegation/registration and DNS zone with DigitalPlat or the DNS operator. The delegated name servers must actually serve the zone. Once delegation is correct, restore the att record to the real backend or its configured tunnel target, then verify /health over HTTPS. No DNS account, tunnel account or server access was provided, so DNS records and the live deployment were not changed.

DNS evidence: https://dns.google/resolve?name=att.threshold.dpdns.org&type=A

## Build the APK

In client/, copy .env.example to .env.production and set VITE_API_BASE_URL to your institution-owned HTTPS address. Then:

    npm ci
    npm run android:sync
    cd android
    ./gradlew assembleDebug

Android SDK 36 and JDK 21 are required by this checked-in Capacitor 8 project. A debug APK is an installable test build. A production release must be signed using the institution's own protected release key. If an earlier installation has a different signing certificate, Android will reject an in-place update. Preserve any needed local data before replacing it.

## Server policy settings

Use the admin settings API; values are strings. Invalid BLE policy values fall back to safe defaults.

| Key | Default | Accepted range |
| --- | --- | --- |
| ble_dwell_percent | 55 | 1–100 |
| ble_min_minutes | 5 | 1–120 |
| ble_rssi_floor | -80 | -127 to -1 dBm |
| ble_max_gap_seconds | 60 | 30–120 seconds |

The existing minimum_attendance_percentage is returned by the summary service and used by the new dashboard. No attendance percentage formula was added to the client.

The optional esp32_anchor flag must stay off for the phone-only setup. This task does not supply an authenticated anchor ingestion protocol or firmware.

## What Bluetooth cannot prove

This build is a stronger phone-proximity workflow, not proof that a particular person is holding the phone. A modified client can forge RSSI and a student can share or relay a still-valid signal. A rotating beacon reduces old-token replay but does not prevent real-time relays or account sharing. Radio signal strength is not a reliable wall boundary or exact distance measurement.

For a higher-assurance rollout, the next implementation work is:

| Addition | Purpose | Status |
| --- | --- | --- |
| Staff-approved phone binding with Android Keystore signatures and server challenges | Limit credential/device sharing and authenticate each attendance submission | Not implemented |
| Server-verified Play Integrity linked to challenge and app identity | Add an independent app/device integrity signal | Not implemented; existing metadata/engine is not attestation verification |
| Authenticated teacher/room GATT challenge-response | Improve on broadcast-only observations; still needs relay threat analysis | Not implemented |
| Optional fixed room hardware with protected keys and signed, replay-protected ingestion | Provide independent room evidence without students carrying extra objects | Design option only; requires firmware and mobile protocol work |
| Foreground service with visible notification, class-only lifetime and tested battery behavior | Continue supported attendance work after leaving the screen | Not implemented |
| Teacher spot checks, correction/appeal path and in-person enrollment | Address phone/person mismatch and device limitations | Human procedure; existing review workflows remain available |

Do not enable automatic punishments from Bluetooth loss, unsupported devices, or attestation failure. Use teacher review and the existing correction process. The inherited organization-wide role/scope rules, biometric/liveness claims, notification delivery, and production infrastructure still need a separate full security review before high-stakes deployment.

## Physical pilot before rollout

Test at least two teacher phone models and several student Android versions:

- First-run permissions, denied permissions, approximate instead of precise Location, Bluetooth off, and unsupported advertising.
- Rotation across multiple windows, weak signals, a corridor and an adjacent classroom. Calibrate signal policy in the actual building.
- Wi-Fi shared by a full class, internet loss, battery saver, screen lock and leaving/returning to the app.
- Arrival late, leaving/rejoining, section transfer, dropped enrollment and manual/medical attendance preservation.
- Teacher review/finalization, simultaneous requests, sign-out and disabled accounts.

Hardware radio behavior was compiled and lint-checked but could not be tested on physical Android phones in this workspace.

## Verification performed

- Frontend and backend TypeScript builds.
- 40 automated checks: integrity fairness, token rotation/reuse, session revocation, enrollment/section checks, timing, deduplication, dwell, teacher scope, manual-record preservation, and transactional rollback on audit failure.
- Integration tests execute both committed migrations in the PGlite PostgreSQL engine and send real HTTP requests to the Express app; they do not use the production database.
- Native Android compilation, lint and JVM test tasks.
- Visual inspection of the new screens in the in-app browser using a local sample-data API. Screenshots contain sample records.
