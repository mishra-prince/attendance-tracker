# Threshold prototype — submission on 23 October 2026

Use **Threshold Prototype 0.2.0**, the separate Android app with actual offline face matching. The older Threshold attendance APK needs the server; Room Lab measures radio/audio and has no face matching. This prototype does not need either app, Wi-Fi or the attendance server.

## Prepare tonight

1. Transfer `threshold-prototype-0.2.0-test.apk` from `downloads/` to an **Android 8 or newer ARM phone**, install it and open **Threshold Prototype**. Temporarily allow installation from the app you use to open the APK. It is a debug-signed submission build. Reserve about 400 MB free storage for installation and model preparation. iPhone cannot install an APK.
2. Leave the ESP32-S3 connected with a data-capable USB cable. On the prepared Mac, open `prototype/UPLOAD-S3-MAC.command` in Terminal. It identifies the chip and full flash capacity, checks security settings, backs up **all** existing flash privately, then writes and verifies the included 4 MB demonstration layout. Larger flash capacity is left unused. It stops on a wrong chip, checksum error, unreadable backup or protected security configuration. It never changes eFuses or disables secure boot/encryption. The agent could enumerate USB but was not granted serial write access, so the board is **not yet confirmed or flashed by the agent**.
3. If the port changed, drag the launcher into Terminal, add the current `/dev/cu.usbmodem…` port as its first argument and run it. If connection fails, close Arduino Serial Monitor; hold **BOOT**, tap **RESET**, release BOOT, and rerun. After a successful upload, tap RESET if needed. Do not connect external voltage to GPIO pins. USB power is enough for this BLE beacon. No C3 or speaker is required for this demonstration.
4. In the phone app, grant **Camera** and **Nearby devices**. Android 8–11 additionally needs Location permission and the Location setting for BLE scans. Enable Bluetooth.
5. A supervisor operates **Enrol demo identity**, checks a consenting volunteer's ID in person, enters their demo roll number and staff name, chooses a private **6–20 digit PIN**, and confirms consent. This is a local supervised demonstration convention, not authenticated college enrollment. Replacing/deleting the saved template needs that PIN through the app; reinstall/clearing app data resets this local demo.
6. Capture in good front lighting. Look straight, perform one or two **slow** blinks as requested (close both eyes, then reopen), turn toward the indicated preview edge, then return to the centre. Hold still for three face samples. Use **Test face verification only** once before the presentation.
7. Tap **Find ESP32**. Confirm **Inside beacon detected · A17C** and a rising dwell count. This is the first physical radio acceptance test; software compilation cannot establish it.

The launcher uses the ESP32 toolchain already prepared in this task workspace. For a different computer, use Python + `esptool==4.12.0` and invoke `upload_s3.py --port PORT --python PYTHON --firmware prototype/firmware/threshold-s3-demo.merged.bin --backup-dir PRIVATE_DIRECTORY --flash`. Keep the adjacent checksum file. The backup directory must be outside this repository. Alternatively build the canonical `calibration/esp32/RoomLabBeacon/RoomLabBeacon.ino` with Arduino-ESP32 3.3.2, the correct ESP32-S3 board/flash settings and role 1/code A17C, after backing up the board. Never use a C3 image on an S3.

## Two-minute presentation

Say: “This low-cost prototype combines ESP32 Bluetooth proximity with an enrolled face comparison. A phone in class is not enough; the enrolled person must complete an active check. It demonstrates the components without claiming that Bluetooth proves a classroom boundary.”

1. Show the encrypted local identity and live ESP32 detection. Start the **60-second class demo** after at least two seconds of beacon readings.
2. Complete the join face check. The class timer then starts at 60 seconds. The camera stops while waiting; the screen dims after eight seconds. This short demonstration uses responsive BLE scanning, not a measured battery-saving production service.
3. Between **20 and 35 seconds**, a randomly timed middle prompt appears. Tap **Verify my face now** and complete it promptly before the class ends. Each phone draws its own time; this spreads prompts but does not guarantee no simultaneous prompts.
4. At the end, **Demo checks complete** requires both face checks, a fresh beacon and at least **45 seconds of observed dwell**. A missing check or missing signal produces **Review required**, never “cheating” or a real attendance penalty. The app leaving the foreground interrupts the demo.
5. Separately test another consenting person's face against the saved volunteer. The comparison should return **Face did not match**. Test removing ESP32 power: the last observation becomes stale after five seconds and cannot finish a successful class. A different face test is an acceptance test you must perform on your phone, not a guaranteed result from a host test.

**If hardware reception is unavailable during the presentation:** use **Test face verification only**, demonstrate matching with the enrolled person and non-matching with another consenting person, and show the compiled beacon firmware/build report. Clearly say the integrated radio test remains pending. Do not simulate a successful hardware check.

## What is implemented

- Bundled YuNet face alignment/detection and **SFace 128-dimensional identity embeddings**. Identity is compared before blinking, immediately after blinking, and across three final frontal camera samples, so a different face cannot simply perform the blink and hand over to the enrolled face for the final comparison. ML Kit supplies eye-open probabilities, face tracking and head pose; ML Kit detection alone is not face recognition. This is basic continuity checking, not validated spoof resistance.
- Random one/two-blink + random direction turn + frontal return; resets on missing/multiple/tracked-face changes and frame gaps. Thirty-second challenge expiry. Eye classification may be unavailable during a turn, as documented by ML Kit; it is required again for frontal capture.
- One encrypted face template per phone, AES-GCM with Android Keystore; PBKDF2 supervisor demo PIN, consent/identity confirmation, explicit deletion, no raw image files, no backups or camera frames in Git. Screenshots/casting are blocked for privacy.
- The APK has **no Internet permission**. No biometric data is uploaded. It receives only the existing public lab beacon's service UUID and role/code data; no device MAC is saved. Camera is released after each check and on leaving the foreground. Idle scanning stops after two minutes.
- A separate package `com.attendance.prototype`, version 0.2.0. It can coexist with the full attendance app and Room Lab. No production API, login, enrollment record, database migration or attendance percentage was changed. The web staff screen now accurately labels its manual observation.

## Honest limits and next stage

This is a **submission prototype**, not a deployed anti-proxy system. The local setup PIN is not authenticated staff identity. A self-selected initial face cannot establish institutional identity. Face matching uses an experimental cosine threshold of **0.50** and a three-sample consistency threshold of **0.70**; neither is calibrated for this college, lighting, demographic groups or device mix. Do not turn scores into an accuracy percentage or an attendance penalty.

Blink/turn checks are **basic active challenges**, not validated presentation-attack detection. Video replays, responsive deepfakes, modified apps, camera injection and colluding relays remain untested. Face tracking is continuity evidence, not identity proof. The public unsigned BLE beacon can be copied/relayed; reception reaches corridors and other rooms. No RSSI threshold can establish the wall boundary, and this app deliberately makes no such decision. Locked-phone operation, iOS, 60 concurrent-device field performance, battery life, and the proposed acoustic room gate are not implemented/validated in this prototype. No 95% claim is made.

For production, integrate institution-approved supervised enrollment, protected template lifecycle and authenticated staff access; use server-issued session/device-bound nonces, verified platform attestation as a signal, authenticated anchor challenges, independently calibrated room evidence and a tested PAD/injection defence. Validate corridor/relay/sharing attacks, legitimate completion, battery and fairness separately before connecting evidence to actual attendance. The existing server at `https://att.threshold.dpdns.org` is separate and is not deployed by this prototype work.

## Evidence and source

See `BUILD-REPORT.md`, `MODEL-SMOKE-CHECK.json`, `THIRD-PARTY-NOTICES.md`, `IMPLEMENTATION-PLAN.md` and the source under `client/android/prototype`. All published APK/model/firmware checksums are in `downloads/PROTOTYPE-SHA256SUMS.txt`.
