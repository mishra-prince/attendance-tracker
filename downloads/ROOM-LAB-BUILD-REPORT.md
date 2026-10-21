# Threshold Room Lab 0.1.0 — build report

Prepared 22 October 2026. Stage 1 software delivery; no classroom measurements have been collected.

## Delivered

- Separate native Android app, package `com.attendance.calibration`, version 0.1.0 (code 1), minimum Android API 24, target/compile API 36.
- User-started six-second microphone measurements, optional ESP beacon scanning, position/condition labels, interrupted/error/device-limitation records, private local summaries and JSON export through Android's document picker.
- Offline desktop-browser speaker emitter, three experimental frequency pairs, public study code, CRC error checking and optional WAV download.
- Calibration-only ESP32-S3/C3 beacon sketch, pinned to Arduino-ESP32 3.3.2 APIs; inside and corridor roles.
- Offline Python report generator and source/tests. An isolated Gradle entry point builds the module without Capacitor, npm packages, backend credentials or a database.

No attendance, account, face-enrollment or server logic was changed in this stage. The pre-existing 1.1.0 APK and its earlier delivery artifacts remain separate. The new source archive contains the current repository, including that earlier work and the new calibration module.

## Verified

| Check | Result |
|---|---|
| Android debug build, existing Android project | Passed |
| Isolated Room Lab debug build | Passed |
| Android lint for Room Lab | 0 errors, 0 warnings |
| Pure Java decoder unit tests | 9 passed, 0 failed |
| Actual HTML emitter audio decoded by actual Java decoder | All 6 profile/sample-rate combinations passed: 3 profiles × 44.1/48 kHz |
| Interoperation negative controls with a different expected code | 2 passed |
| Export-analysis tests | 6 passed, covering duplicate/conflicting exports, failure denominators, condition separation, malformed capture and alias collision |
| APK manifest inspection | Correct package/version/API; microphone/Bluetooth/location permissions; no Internet or Camera permission; optional lab hardware features |
| APK signature | Valid Android debug certificate, APK Signature Scheme v2 |
| Source diff whitespace check | Passed |
| ESP32-C3 corridor sketch, Arduino-ESP32 3.3.2 | Compiled; 642272 bytes of program storage, 23776 bytes static RAM |
| ESP32-S3 inside sketch, Arduino-ESP32 3.3.2 | Compiled; 618839 bytes of program storage, 32828 bytes static RAM |

Decoder tests include noise/offsets, all frequency profiles at both supported rates, a valid unexpected code, changed payload with invalid CRC, bad preamble, partial frames, silence, short buffers, clipping, frequency mismatch and invalid input. Synthetic audio tests establish protocol compatibility, not physical room performance.

Both builds used the local JDK 21 and cached Gradle 8.14.3/Android Gradle Plugin 8.13.0 with Android SDK 36, in offline mode. The build environment reported non-fatal Gradle deprecation and Android metrics-file warnings. The local socket permission required by Gradle was granted for this turn; no attendance server was contacted.

## Not verified

- No physical Android phone install or microphone/Bluetooth capture was performed. No Android emulator/system image was available. The app's native UI, permission flow, routing, interruption handling and file export need real-device checks.
- A local HTML browser preview was blocked by the browser's file-URL policy. No browser visual review or actual speaker playback is claimed. The emitter's waveform generation and WAV structure were tested directly without a browser.
- The ESP firmware was compile-tested after correcting a NimBLE/Bluedroid advertising-mode incompatibility. Host-side image inspection passed for both chip targets. It has not yet been flashed or measured on hardware. The laptop sees an Espressif USB serial device at `/dev/cu.usbmodem101`; the session's granted port access was read-only, so chip-identification commands and upload remain pending.
- No iPhone app, background/locked-phone attendance, battery-life measurement, populated-room trial, corridor rejection measurement, spoof/relay testing, face matching or presentation-attack detection was implemented or validated in this stage.
- No production backend/frontend regression suite was rerun for this isolated calibration stage. Its only existing Android build-graph change is inclusion of a separate module; the earlier application source was not edited by this stage.

## Interpretation

This app tests whether the proposed acoustic room boundary deserves further development. Reception outside the room exposes leakage; missing reception inside exposes a legitimate-user failure. Neither outcome identifies a person. A public 16-bit code and unsigned BLE packets provide no cryptographic authentication. This delivery does not satisfy or certify any of the three 95% targets.

The next required evidence comes from labelled measurements using students' actual phones in the real room, including occupied/open-door conditions, failures and a separate iPhone study. Face verification remains an independent workstream that must start from institution-approved identity enrollment and include anti-spoof testing and appropriate alternatives.

## ESP compilation environment update

Arduino CLI 1.5.1, Arduino-ESP32 3.3.2, DIO flash, 40 MHz flash for C3, 4 MB compile-time flash size, USB CDC enabled; S3 hardware CDC/JTAG mode. These are candidate build settings, not a measurement of the connected board's flash size. C3 uses role 2 and S3 role 1, both with code A17C. Each application fits the default 1310720-byte application partition. The sketch now checks advertisement configuration/start results before printing success.

The bundled Arduino ctags helper was Intel-only. On this Apple Silicon host, Arduino's tagged `5.8-arduino11` helper source was built locally with `CFLAGS='-g -O2 -include dirent.h'`, then selected using the `runtime.tools.ctags.path` build override. This avoids an Intel-helper execution failure and a header-macro conflict with the current macOS SDK; no system tool or security setting was changed. The Espressif compiler and image tools are native ARM64.
