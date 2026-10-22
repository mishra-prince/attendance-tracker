# Threshold 1.2.1 — same-app build record

Prepared 23 October 2026. Patch 1.2.1 addresses the user-reported face capture timeout on a Nothing Phone (1); the user confirmed its camera preview works, but did not complete enrollment. The agent has not operated that phone. This supersedes the separate Prototype 0.2.0 delivery for the current user request.

## Face capture correction

The 1.2.0 challenge began before the camera was ready. A smile also required both eye-open scores above 0.65, which can reject a natural eye-narrowing smile. Generic instructions and overwritten frame errors gave little explanation before timeout. These are code findings, not a device-log diagnosis of the user's exact failure.

1.2.1 has a bounded 60-second preparation stage, three fresh stable readiness observations, an explicit **Start face capture** button and a separate visible **30-second** challenge countdown. Preparation does not capture identity, complete actions or consume challenge time. Guidance above the smaller preview distinguishes face count/size, pose, eye readability/opening and relaxed mouth. ML Kit landmarks are explicitly enabled alongside classification. The setup button says **Open face camera**, and automatic capture is explained on the camera page.

Smile actions require a clear frontal smile without requiring eye-open scores at the same time. Neutral baselines/returns still require open eyes and a relaxed mouth; blink still requires closure then reopening. Identity checkpoints, matching thresholds, random action order and final samples remain. The UI holds the next prompt until synchronous SFace inference finishes; that known processing pause no longer masquerades as a missing-camera-frame gap. It does not extend wall-clock expiry, and comparisons finishing after expiry cannot save a result. Actual camera gaps still reset continuity. No action is accepted during the processing pause; this is still basic active liveness, not validated continuous person tracking or PAD.

Seven additional regression tests cover a narrowed-eye smile and neutral return, missing smile output, inference delay without false reset or deadline extension, preparation freshness/tracking, preparation without challenge consumption and specific guidance. Existing tests still exercise all 30 ordered action pairs. Native capture only changed, so the previously built frontend/portal/backend are unchanged; no new frontend build or server tests were necessary for this patch.

References: [ML Kit classification and landmark/frontal-face requirements](https://developers.google.com/ml-kit/vision/face-detection/face-detection-concepts), [Android face detection configuration](https://developers.google.com/ml-kit/vision/face-detection/android), [CameraX latest-frame analysis](https://developer.android.com/media/camera/camerax/analyze).

## Completed software checks

| Check | Result |
| --- | --- |
| Main Android APK | Pass; **com.attendance.tracker**, version **1.2.1 / code 4**, min API 24 / Android 7, target 36, ARM64 + ARMv7 |
| Update compatibility | Package unchanged and signing certificate SHA-256 equals the published 1.1.0 test APK: `bca7e1406cb3f713aceeab3d6b50aee0d015933c321e73c046b77b29cdfcfdca` |
| Main app lint | **0 errors, 19 warnings** |
| Internal verification library lint | **0 errors, 16 warnings** |
| Verification library JVM tests | **35 passed**, zero failures/skips; includes all **30 ordered pairs** of distinct actions with synthetic signals |
| Main existing JVM sample test | Pass (boilerplate only; not evidence of application behaviour) |
| Uploader safety/regression tests | **11 passed**, no real serial device opened |
| Frontend TypeScript/Vite + Capacitor sync | Prior 1.2.0 pass, unchanged for this native-only patch; native classroom-demo buttons are included in packaged web assets |
| APK signature | Verified debug signing; certificate matches prior published Threshold test build |
| Packaged feature | Actual YuNet/SFace models, native bridge/class and multi-action UI text confirmed inside the main APK |
| Internal feature boundary | `:prototype` is now an Android **library**; its activity is **not exported**, with no launcher/application identity or separate APK |
| Previous host inference smoke check | OpenCV 4.12.0: same-image lighting variant cosine **0.989557**; different subject **0.111303**, against experimental 0.50 threshold |

The meaningful new automated checks total **46** (35 native logic + 11 simulated uploader tests). They do not establish field accuracy. Java tests cover neutral baselines/returns, smile/pose/blink actions, wrong order/direction, missing classifiers, track/multiple-face continuity, gaps, expiry, checkpoint serials, private action-array copies, invalid/empty embeddings, matching math and fresh/dwell beacon evidence. Pose actions allow unavailable nonfrontal eye/smile classifiers; frontal identity checkpoints require the neutral baseline again.

The random sequence selects two distinct actions using SecureRandom from blink, smile, turn left/right and look up/down. Native identity embeddings are checked before actions, after each neutral return and across the final three frames. No client-side face result is sent to a production attendance endpoint. The native bridge only opens the demo. Authenticated portal data/roles/calculations/migrations are unchanged.

The library supports Android 7: bounded stream reads replace API-26-only file reads; the local PIN KDF is PBKDF2-HMAC-SHA256 on API 26+ and PBKDF2-HMAC-SHA1 on API 24–25, each with random salt and 210,000 iterations, encrypted under the Keystore key. This is a local demonstration safeguard, not institutional staff authentication.

Main Threshold retains Internet/Location/Bluetooth permissions for its existing portal and classroom scan. No advertising-ID permission is packaged. The native demo has no network client, no raw photo output and no authority to mark real attendance. Existing main no-backup/data-transfer exclusions cover local templates. Face camera access remains foreground-only.

## S3 evidence and recovery

The user-run log confirms ESP32-S3 revision 0.2 with 16 MB flash, a complete private 16 MB backup, and a completed 4 MB write with **Hash of data verified**. The original backup's saved SHA-256 was independently checked on disk. A later full-merged-image verification failed after reset. Contrary to the earlier tentative explanation, offline esptool 4.12 header normalization changes **zero bytes** for this image. Normal NVS/OTA data changes are a plausible explanation for a post-reset mismatch; exact differing device bytes have not been inspected.

The corrected uploader verifies the following pinned code regions from the original merged image, each proven byte-for-byte equal to its separately compiled image:

| Region | Offset | Length |
| --- | --- | --- |
| Bootloader | `0x0` | 18,976 bytes |
| Partition table | `0x8000` | 3,072 bytes |
| Application | `0x10000` | 618,992 bytes |

It uses consistent explicit flash options and excludes writable NVS (`0x9000–0xdfff`), OTA state (`0xe000–0xffff`), filesystem and unused application space. The immutable-region layout is bound to the original merged SHA-256 `8fa0d05b9d872afa101bd211b80c9cda7dd6acc366597ccf7e3fd15e073169f5`. Invalid layouts, region hashes, chip/security settings, image hashes and incomplete backups stop before writing. Verification-only mode performs no backup/read_flash/write_flash; simulated startup-mutated NVS is accepted while corrupted application bytes fail.

**Physical verification-only execution and phone reception remain pending.** Serial write access was not granted to the agent. No eFuse/secure-boot/encryption state was changed by agent commands; no private hardware backups, identifiers or logs are published.

## Physical acceptance still required

No Android phone was installed/operated by the agent. Camera preview/orientation, live face matching, blink/smile/pose recognition, Keystore behavior and S3 radio reception need the guide's real-phone checks. No emulator, physical-phone, battery, corridor, spoof/PAD, relay, demographic fairness, iPhone or 60-device success claim is made. No 95% claim is made. The host inference test uses static photographs only and is not a representative accuracy dataset.

Production backend/server/DNS/database deployment was not performed. The backend was not modified or retested for this internal feature; the existing 1.1.0 baseline has its own 40-test report. Historical standalone APKs remain dated artifacts; only the main updated Threshold APK was built for this request.

## Rebuild

Use Node 22+, JDK 21 and Android SDK 36. In `client`, run `npm run android:sync`. From `client/android`, run:

```sh
./gradlew --no-daemon :app:assembleDebug :app:lintDebug :app:testDebugUnitTest :prototype:lintDebug :prototype:testDebugUnitTest
```

The APK is `client/android/app/build/outputs/apk/debug/app-debug.apk`. The `prototype/android` isolated entry point now builds/tests the feature library; it does not produce an installable app. First build needs Google's Maven repository and Maven Central. With a populated cache use `--offline`. Use a writable Java temp/cache directory in restricted environments.

From `prototype`, run `python3 -m unittest -v test_upload_s3.py` for simulated uploader checks. `check_models.py` uses OpenCV 4.12.0 and two local test images for the previously recorded host smoke check. Model hashes/licences/provenance are bundled with the APK; see the notices and `MODEL-SMOKE-CHECK.json`.
