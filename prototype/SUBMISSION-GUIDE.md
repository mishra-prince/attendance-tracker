# Threshold 1.2.1 — same-app submission guide

Use **Threshold 1.2.1** (`com.attendance.tracker`), not the historical separate Prototype 0.2.0 app. Face matching and the ESP32 class demonstration are now inside the existing Threshold APK. Its account-based attendance portal remains available. The internal `:prototype` source module is now an Android library and has no launcher or separate APK.

## Install and open the demo

1. Download `downloads/threshold-1.2.1-test.apk` to an **Android 7 or newer ARM phone** and install it. It uses the same signing certificate/package as our published Threshold 1.1.0 and 1.2.0 test APKs and a higher version code, so that test build can be updated in place. Reserve about 400 MB free space. This debug-signed submission build is not a production release.
2. Open **Threshold**. On the login screen, tap **Face & ESP32 classroom demo**. No username/password or server is needed for this local demonstration. The same button is also available on the signed-in student Bluetooth page. Use **Back to Threshold portal** or Android Back to return.
3. Allow Camera, Nearby devices/Bluetooth and Location permissions. Enable Bluetooth and Location services for the scan. Threshold does not read or save GPS coordinates in this flow. Face recognition and enrollment work locally; the normal attendance portal still uses the confirmed HTTPS server.
4. A supervisor opens **Enrol demo identity**, checks a consenting volunteer's ID in person, enters their name/demo roll number and supervisor name, and chooses a private **6–20 digit PIN**. The local PIN is a demo safeguard, not authenticated college staff identity. Replacing/deleting the local face template through the app requires it. Reinstall/clearing app data resets this local demo. Templates from the old separate Prototype app are not migrated; capture a new consented demo enrollment inside Threshold.
5. Tap **Open face camera**. In front lighting, look straight, relax your mouth and keep both eyes open. The instruction **above the preview** explains anything blocking readiness (face too small, unreadable eyes, tilted head or an existing smile). Once ready, tap **Start face capture**. The **30-second action timer starts now**, separately from the bounded 60-second preparation period. Follow the two randomly selected actions in order: turn towards the left/right preview edge, look up/down, smile or blink. During a smile your eyes may narrow; return to a relaxed mouth and open eyes afterwards. For a blink, close both eyes slowly and reopen them. Wait during an identity comparison rather than doing the next action early. **Capture is automatic** after the actions and three final samples; there is no shutter button. If it times out, note the last instruction/error and retry. No enrollment is saved from an incomplete check.
6. Use **Test face verification only** with the enrolled person, then a different consenting person. The identity is compared with the saved SFace template before the actions, after each action and across the final samples. Face detection by itself is not treated as identity matching.

This is a local submission demonstration inside the same app. It never creates institution-approved enrollment or awards actual attendance. The original account/role/session attendance paths remain separate. Real students must not treat a self-selected demo enrollment as institutional identity.

If the preview works but capture stalls, keep your face close enough to fill much of the preview, use light from in front and follow only the current instruction. Smile only when asked; return to neutral afterwards. Send the exact on-screen blocking reason if it repeats. The user reported a working preview on a Nothing Phone (1); the corrected complete capture still needs that physical acceptance test.

## Recover the S3 verification without another write

The user-run log identified **ESP32-S3, 16 MB flash**, saved a full private backup and completed a 4 MB firmware write with **Hash of data verified**. A later whole-image comparison failed after reset. The compiled image includes data areas that startup may modify; a post-boot mismatch does not by itself prove damaged code. The exact differing device bytes have not been read, so runtime data mutation remains an explanation to check, not a confirmed physical finding. Offline header normalization changed zero bytes for this image; the earlier flash-header diagnosis was too strong.

The corrected uploader now verifies only the pinned bootloader, partition table and application code, with the same explicit header options used for writing. It excludes runtime-writable NVS, OTA state, filesystem and unused areas. On the prepared Mac, with the S3 attached and Serial Monitor closed, run:

```sh
/bin/zsh "/Users/princemishra/Documents/Codex/2026-10-20/https-github-com-mishra-prince-attendance/work/attendance-tracker/prototype/UPLOAD-S3-MAC.command" --verify-only
```

This checks the chip/security settings and code contents. It does **not** repeat the backup, erase flash or write firmware. Wait for **Firmware code verified**. The old 16 MB backup remains private outside the repository. If verification still fails, preserve the new private log and diagnose it; do not keep rewriting the board.

After a successful check, press RESET if needed and leave the board powered by USB. In Threshold's classroom demo, tap **Find ESP32** and confirm **Inside beacon detected · A17C** and a rising dwell count. Radio reception still requires this real-phone test. No C3, speaker or GPIO wiring is required for the S3 beacon demonstration.

The launcher supports an optional changed port after `--verify-only`, for example `--verify-only /dev/cu.usbmodem102`. If connection fails, close Serial Monitor, hold BOOT, tap RESET, release BOOT, and retry. Keep the complete firmware `.bin`, `.sha256` and `.verify.json` files together. To provision an unprogrammed board, run the launcher without `--verify-only`; it makes a new full-flash backup before writing and verifying. Never use a C3 image on the S3 or disable security fuses. The agent cannot access the serial device for writing and has not executed the recovery check itself.

## Present the 60-second class

Say: “This low-cost demonstration combines Bluetooth proximity with real enrolled-face comparison and an unpredictable action sequence. A phone in class is not enough to satisfy the face check. It demonstrates the components without claiming that Bluetooth establishes a classroom wall boundary.”

1. Find the S3 and wait for at least two seconds of fresh readings. Tap **Start 60-second class demo** and complete the join face check. The class timer begins after it passes.
2. Keep Threshold in the foreground. The camera stops while waiting, and the screen dims after eight seconds. The phone is still the student's personal device: this app cannot lock the rest of the phone. This short demo uses responsive BLE scanning; battery performance is not measured.
3. A middle-check prompt appears between **20 and 35 seconds**. Tap it and complete its fresh, randomly selected two-action sequence before the class ends. Each phone chooses its own timing; simultaneous prompts remain possible.
4. **Demo checks complete** requires both face checks, a fresh S3 beacon and at least **45 seconds of observed dwell**. Missing evidence produces **Review required**, not a cheating verdict or attendance penalty. Leaving the foreground interrupts the demonstration; no background/locked-phone attendance is claimed.
5. Try a different consenting person against the enrolled template. Try a wrong action and show that it does not advance the requested sequence. Try removing S3 power: readings become stale after five seconds and cannot finish a successful class. These are acceptance tests to perform on the actual phone, not guaranteed field results from host tests.

If the radio check is unavailable, present **Test face verification only**, the compiled S3 firmware and the build report, and explicitly state that integrated radio validation is pending. Do not simulate a successful hardware result.

## Privacy, limits and evidence

The demo stores one AES-GCM encrypted SFace template in Android's no-backup area using an Android Keystore key. It stores no raw camera images and uploads no demo frames/templates. Main Threshold retains Internet access for its normal attendance portal; the demo library contains no network client or attendance-authority callback. Screenshots/casting are blocked on the native camera/demo page. Idle scanning stops after two minutes; the camera is released after each check and on leaving the foreground.

Random actions are **basic active liveness/continuity checks**, not validated presentation-attack detection. Responsive video/deepfakes, camera injection, modified apps and colluding relays remain untested. Experimental matching/consistency thresholds are not calibrated for this institution, demographic groups, lighting or device mix. A local PIN/setup cannot establish institution-approved identity. The public unsigned beacon can be copied/relayed and BLE reaches corridors and neighbouring rooms. iPhone, locked-phone operation, 60-device field performance, battery life, acoustic room gating and 95% reliability are not established.

Production needs authenticated staff-approved enrollment and template lifecycle, server/device/session-bound nonces and evidence, attestation as a signal, independent room calibration, validated PAD/injection defences, fairness/fallback/appeals and actual attendance API integration. This build does not deploy the backend or migrate live data.

See `BUILD-REPORT.md`, `MODEL-SMOKE-CHECK.json`, `THIRD-PARTY-NOTICES.md` and `SAME-APP-PLAN.md`. Checksums for the current deliverable are in `downloads/THRESHOLD-1.2.1-SHA256SUMS.txt`. Old 0.2.0 prototype binaries/checksums remain historical snapshots, not the requested current APK.
