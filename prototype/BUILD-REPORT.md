# Threshold Prototype 0.2.0 — build record

Prepared 22 October 2026 for the 23 October submission.

## Completed checks

| Check | Result |
| --- | --- |
| Android debug APK assembly | Pass; package `com.attendance.prototype`, version 0.2.0/code 1 |
| Android lint | **0 errors**, 19 warnings (English strings/localization, pinned dependency update notices, phone orientation and newer manifest attributes) |
| JVM tests | **21 passed**, zero failures/skips |
| Uploader safety tests with simulated device responses | **6 passed**; no real serial device opened by these tests |
| Host OpenCV 4.12.0 model inference | Pass, both pinned ONNX models load and produce finite 128-value embeddings |
| Same test image with a lighting change | Cosine **0.989557**, above experimental 0.50 threshold |
| Different test subject | Cosine **0.111303**, below experimental 0.50 threshold |
| Updated web client TypeScript/Vite build | Pass; manual enrollment observation copy corrected |
| APK package inspection | Android 8+/API 26 minimum, target 36, ARM64 + ARMv7 libraries; bundled models |
| APK permissions | Camera, Bluetooth and legacy Android location only, plus AndroidX private receiver permission; **no Internet, network-state or advertising-ID permission** |
| APK signature | Android APK signature v2 verified; debug signing only |
| ESP32-S3 image | Existing Arduino-ESP32 3.3.2 S3 build; 4 MB merged image, SHA-256 `8fa0d05b9d872afa101bd211b80c9cda7dd6acc366597ccf7e3fd15e073169f5` |

JVM tests cover still-image/non-blink behavior, complete and incomplete blink sequences, randomized challenge requirements, wrong turn, missing classifications, missing/multiple/tracked-face continuity, stale frames, expiry, invalid face vectors, cosine normalization, wrong/corridor beacon payloads, stale readings, duplicate observations and gaps that must not count as dwell. Nonfrontal eye-classification absence is allowed only during the turn/return portion; frontal eye checks remain required.

Uploader tests confirm wrong chip, security flags, corrupt image hash and incomplete backup cannot reach flash writing; a complete backup precedes write/verify; backup-only mode never writes. They validate program flow, not USB hardware compatibility.

## Physical acceptance still required

USB enumeration detected an Espressif family device on the connected serial port. **Serial write permission was not granted to the agent**, so the chip/flash/security state has not been queried through esptool, the existing board has not been backed up, and the board has **not been flashed by this work**. The provided uploader performs these checks when the user runs it outside the agent session. Neither compilation nor an image checksum establishes that the board is operating or broadcasting.

No Android phone was available to this session for installation, camera/UI checks, actual blink/turn checks, live identity comparisons, Keystore behavior or radio reception. There is no emulator/simulated physical test result. Complete the “Prepare tonight” acceptance steps before presenting the integrated flow. The host photograph smoke test does **not** evaluate Android camera preprocessing/orientation, facial presentation attacks, fairness, field accuracy or battery consumption.

No real student images, templates, device MACs, private hardware logs/backups, signing keys or model-test photographs are included in this submission. No server/database/DNS deployment was performed. Production backend tests were not repeated for this isolated module; the preceding 1.1.0 baseline has its own report.

## Rebuild

Set `JAVA_HOME` to JDK 21, `ANDROID_HOME`/`ANDROID_SDK_ROOT` to an Android SDK with API 36, and `GRADLE_USER_HOME` to a writable cache. If the OS temp folder is restricted, set `JAVA_TOOL_OPTIONS=-Djava.io.tmpdir=WRITABLE_DIRECTORY` to a real writable directory. From `prototype/android` run:

```sh
../../client/android/gradlew --no-daemon :prototype:assembleDebug :prototype:lintDebug :prototype:testDebugUnitTest
```

The isolated entry point needs no attendance backend, database, Node modules or Capacitor sync. First build needs network access to Google's Maven repository and Maven Central; subsequent builds can use `--offline` with the populated cache. Output is `client/android/prototype/build/outputs/apk/debug/prototype-debug.apk`.

From `prototype`, `python3 -m unittest -v test_upload_s3.py` runs the simulated uploader checks. Host inference requires `opencv-python-headless==4.12.0.88`; run `check_models.py --same IMAGE --different OTHER_IMAGE` with two local consented/test images. The script checks only that the first image's lighting variant matches and a second test subject differs. It is not a representative validation dataset. See `MODEL-SMOKE-CHECK.json` for measured output and model hashes, and `THIRD-PARTY-NOTICES.md` for source/license attribution.
