# Test builds, firmware and reports

The files here are development and calibration artifacts. The source code is maintained in the repository; included source ZIPs and patches are dated delivery snapshots. Installed dependencies, downloaded toolchains, local environment files, signing keys and hardware backups are excluded.

## Android downloads

- [**Latest Threshold 1.2.1 — download APK**](https://github.com/mishra-prince/attendance-tracker/raw/refs/heads/master/downloads/threshold-1.2.1-test.apk). Face recognition, two randomized actions and an ESP32 class demo inside the original `com.attendance.tracker` app. Fixes the reported smile/eye capture timeout with a preparation screen, Start button, visible countdown and frame guidance. Updates our published 1.1.0/1.2.0 test APKs in place. Tap **Face & ESP32 classroom demo** on the login page; no account/server required for that demo. Its local identity/evidence is separate from real institutional attendance. [Current setup and S3 verification-only recovery](../prototype/SUBMISSION-GUIDE.md), [build report](../prototype/BUILD-REPORT.md), [current checksums](THRESHOLD-1.2.1-SHA256SUMS.txt).
- [Historical separate prototype 0.2.0 APK](https://github.com/mishra-prince/attendance-tracker/raw/refs/heads/master/downloads/threshold-prototype-0.2.0-test.apk). Superseded for this submission by the same-app Threshold 1.2.1 build. Retained as a dated snapshot; its checksums/source paths describe that earlier version. No new separate prototype APK is being delivered.
- [Previous attendance app 1.1.0 APK](https://github.com/mishra-prince/attendance-tracker/raw/refs/heads/master/downloads/threshold-1.1.0-test.apk). Historical baseline, superseded by the same-package 1.2.1 build. Native teacher Bluetooth check-in requires the updated backend and institution configuration. Both phones must keep their Bluetooth screens open.
- [Threshold Room Lab 0.1.0 — download APK](https://github.com/mishra-prince/attendance-tracker/raw/refs/heads/master/downloads/threshold-room-lab-0.1.0-test.apk). Separate offline application for six-second acoustic/Bluetooth measurements. No account or attendance server required. It does not award attendance, verify a face, or operate with the screen locked.
- [Complete Room Lab pilot kit](https://github.com/mishra-prince/attendance-tracker/raw/refs/heads/master/downloads/threshold-room-lab-0.1.0-pilot-kit.zip). Includes the calibration APK, desktop speaker emitter, source, firmware, guides and checksums.

All APKs are debug-signed for testing. Production distribution needs the institution's protected release-signing setup.

## Hardware and room calibration

- [Compiled ESP32-C3 and ESP32-S3 firmware](https://github.com/mishra-prince/attendance-tracker/raw/refs/heads/master/downloads/esp32-room-lab-0.1.0-firmware.zip).
- [Firmware settings, build record and pending hardware checks](ESP32-FIRMWARE-README.md).
- [Room Lab quickstart](ROOM-LAB-QUICKSTART.md).
- [Offline speaker emitter HTML — download and open locally](https://github.com/mishra-prince/attendance-tracker/raw/refs/heads/master/downloads/room-lab-emitter.html).

The C3 image defaults to corridor role 2; S3 defaults to inside role 1. Both use study code A17C. The firmware was compiled with Arduino-ESP32 3.3.2 using a 4 MB layout. The later user-run S3 upload identified 16 MB flash, saved a full backup and passed the immediate write hash; post-reset whole-image verification failed. Use the current [verification-only recovery](../prototype/SUBMISSION-GUIDE.md) to check immutable code without reflashing. Radio reception and the room boundary remain unverified. Public acoustic codes and unsigned lab advertisements cannot provide production authentication or relay resistance.

## Research, setup and verification

- [Attendance research and measurable pilot](ATTENDANCE-RESEARCH-AND-PILOT.md): the 60-student mixed Android/iPhone design, corridor and phone-sharing limits, identity verification and the three independent 95% targets.
- [Attendance backend deployment and security guide](SETUP-AND-SECURITY.md).
- [Attendance build report](BUILD-REPORT.md).
- [Room Lab build report](ROOM-LAB-BUILD-REPORT.md).
- [Attendance artifact checksums](SHA256SUMS.txt) and [Room Lab artifact checksums](ROOM-LAB-SHA256SUMS.txt).

Before repository publication on 22 October 2026, the backend's 40 tests and TypeScript build, frontend production build, both Android app builds/lint/unit-test tasks, calibration's 9 Java decoder tests, 6 export-analyzer tests, and all 6 emitter-to-decoder profile/rate combinations passed. Two wrong-code interoperation checks also passed. The attendance app retains 20 Android lint warnings; Room Lab has none. Both firmware targets compile and their image checksums validate. These software checks do not establish physical-phone behaviour, battery life, face anti-spoof performance, iPhone support or 95% classroom reliability.

The main APK targets the owner-confirmed HTTPS server. Repository publication does not deploy its updated backend, modify DNS, migrate live data or program hardware. Pilot data, student records, face images and raw microphone recordings are not included.
