# Threshold — Attendance Tracker

A college attendance app for Android and the web. Students check in using their phones; teachers review and submit session attendance. No RFID cards or tags are required.

## Threshold 1.2.0 — same-app submission for 23 October 2026

[Download the updated Threshold 1.2.0 APK](https://github.com/mishra-prince/attendance-tracker/raw/refs/heads/master/downloads/threshold-1.2.0-test.apk) · [Demo setup and S3 recovery](prototype/SUBMISSION-GUIDE.md) · [Build report](prototype/BUILD-REPORT.md)

Face matching, two randomized actions and the ESP32-S3 class demo are now **inside the original Threshold app**, preserving `com.attendance.tracker` and its test-signing certificate. Tap **Face & ESP32 classroom demo** on the login screen; no account/server is needed for this local demo. The original institution portal remains available. Demo enrollment/results do not award real attendance or establish institution-approved identity. The feature module is an internal library, not a separately installed app.

The user-run S3 write passed its immediate hash check but the later whole-image comparison failed after reset. Use the corrected uploader's **--verify-only** mode to check code regions without another backup or firmware write. Physical camera/radio tests remain pending. Corridor rejection, iPhone/locked-phone operation, validated spoof protection, battery performance and 95% reliability are not established.

## Test builds and project reports

The [downloads folder](downloads/README.md) contains the test APKs, Room Lab pilot kit, compiled ESP32-C3/S3 firmware, setup guides and attendance research report.

- [Download the current Threshold 1.2.0 Android test APK](https://github.com/mishra-prince/attendance-tracker/raw/refs/heads/master/downloads/threshold-1.2.0-test.apk) — embedded classroom demo works offline; real attendance needs the updated backend.
- [Previous Threshold 1.1.0 Android test APK](https://github.com/mishra-prince/attendance-tracker/raw/refs/heads/master/downloads/threshold-1.1.0-test.apk) — retained historical build.
- [Download the offline Room Lab Android test APK](https://github.com/mishra-prince/attendance-tracker/raw/refs/heads/master/downloads/threshold-room-lab-0.1.0-test.apk) — room-calibration measurements only.
- [Room Lab setup guide](downloads/ROOM-LAB-QUICKSTART.md) and [research and pilot plan](downloads/ATTENDANCE-RESEARCH-AND-PILOT.md).

These are development test builds. Physical-phone, classroom and ESP radio validation remain pending; the experiment has not established 95% reliability. Publishing this repository does not deploy the backend or upload firmware to a connected board.

## Updated in 1.1

- Native Android Bluetooth scanning and teacher-phone broadcasting, with rotating classroom signals.
- A new student dashboard, Bluetooth progress screen, teacher controls and camera retry flow.
- Server-side enrollment, section, teacher ownership and scheduled-time checks.
- Dwell tracking with duplicate suppression and no credit for long detection gaps.
- Teacher review for missing evidence; existing manual and medical attendance is preserved.
- In-memory access tokens, rotating HttpOnly refresh cookies, replay detection and immediate session revocation.
- Restored database migrations, repaired admin organization setup, safer APK defaults and guarded development seeding.

**The APK requires the updated backend.** Both phones need the app open on their Bluetooth screen and an internet connection. Background attendance and verified hardware/device attestation are future work. Bluetooth measures phone proximity; it does not prove a person's identity or prevent every real-time relay.

See [Bluetooth setup, hardware options and security limits](docs/BLUETOOTH_SECURITY.md) for deployment, a two-phone pilot, policy settings and a higher-assurance roadmap.

## Room Lab: experimental room calibration

[Room Lab](calibration/README.md) is a separate, offline Android application for testing acoustic reception and ESP32 beacon readings at seats, doorways and corridor positions. It collects six-second measurements and exports numeric summaries, including failed attempts. It does not award attendance, collect faces, or require the attendance server. The accompanying speaker emitter runs on an existing classroom computer; no spare-phone kiosk is required. This experiment has not established a reliable room boundary or 95% performance.

## Stack

React 18, TypeScript, Vite, Tailwind, React Router 7, Capacitor 8, native Android BLE; Express, Prisma 5 and PostgreSQL.

## Local setup

Requirements: Node.js 22+, PostgreSQL 14+. Android builds additionally require JDK 21 and Android SDK 36.

1. Create a local PostgreSQL database.
2. Copy server/.env.example to server/.env. Set DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET and BLE_BEACON_SECRET. Generate three different random secrets of at least 32 characters:

       node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

3. Install and migrate:

       cd server
       npm ci
       npx prisma generate
       npm run migrate:deploy
       npm run dev

4. In another terminal:

       cd client
       npm ci
       npm run dev

The client runs at http://localhost:5173 and proxies /api to http://localhost:4100. Set CLIENT_URL if using a different browser origin.

For sample data, use a disposable local database, explicitly set ALLOW_DEMO_SEED=true and a DEMO_SEED_PASSWORD of at least 12 characters, then run npm run seed from server/. This seed wipes its target database and is blocked in production. Demo accounts include student@att.edu, teacher@att.edu, hod@att.edu, admin@att.edu and superadmin@att.edu, using your chosen demo password. Never seed a live institution database.

## Android

Copy client/.env.example to client/.env.production and set VITE_API_BASE_URL to your institution-owned HTTPS address.

    cd client
    npm ci
    npm run android:sync
    cd android
    ./gradlew assembleDebug

Output: client/android/app/build/outputs/apk/debug/app-debug.apk. Debug APKs are for testing. Production releases need your protected release signing key. Both student scanning and teacher broadcasting are available only in the Android app; browsers provide the existing QR/manual alternatives.

## Verification

    cd server
    npm test
    npm run build
    cd ../client
    npm run build
    cd android
    ./gradlew lintDebug testDebugUnitTest assembleDebug

Integration tests create an isolated PGlite PostgreSQL database, apply the committed migrations and test the Express API over HTTP. They require no production database or account credentials.

## Production configuration

Every required setting is documented in server/.env.example and client/.env.example. Use production HTTPS, exact CORS origins and a trusted proxy configuration. Read the [deployment and migration notes](docs/BLUETOOTH_SECURITY.md#server-deployment) before updating an existing database, especially one previously managed with prisma db push.

The existing role-based attendance, session, leave, correction, notification, timetable and supervised-enrollment modules remain in the repository. Documentation for intended architecture is in docs/. This update hardens the Bluetooth and authentication paths; it is not a complete audit or certification of every inherited module.
