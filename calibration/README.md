# Threshold Room Lab — Stage 1

Room Lab tests one question: can an existing classroom speaker send a short code that students' phones receive at legitimate seats but do not receive in the corridor under normal room conditions? It also records readings from an inside ESP32-S3 and a corridor ESP32-C3 Super Mini for later comparison. Students use their own phones. No spare-phone kiosk, RFID or new ranging hardware is required.

This is a separate **Android test application**, not production attendance. It does not identify students, lock their phones, run in the background, connect to the attendance server, or award credit. iPhones require a later native calibration app and field validation. Neither unsigned BLE advertisements nor this public acoustic test code can prevent replay or real-time relay attacks.

## Start without the ESP boards

1. Install `threshold-room-lab-0.1.0-test.apk` on consenting volunteers' Android phones (Android 7 or later). The app appears as **Threshold Room Lab**, alongside the existing attendance app. This is a debug-signed test build, not a Play Store release.
2. Open `emitter.html` on the existing classroom computer in a current desktop browser. Connect its wired speaker. Avoid Bluetooth speakers for the first measurements because their processing adds another variable. This page needs no server or internet connection.
3. Leave the study code at **A17C** on both devices. Start with **Audible diagnostic · 3 / 4 kHz**, and low computer and speaker volume. The digital level starts at 3%; it is not a sound-pressure measurement. Stop if the signal is uncomfortable. Later compare 17/18 and 19/20 kHz; those profiles may be audible or filtered out by equipment.
4. In the Android app, uncheck **Also measure the ESP Bluetooth beacons** for an acoustic-only test. Give each phone a unique anonymous label, such as P01, P02 and P03. Use room and seat labels; do not enter student names or roll numbers.
5. Label the **actual** location, door/window state, placement and occupancy. Start the emitter, then tap **Measure for 6 seconds**. Grant microphone permission when requested, then tap Measure again. Keep the built-in microphone unobstructed for the initial diagnostic.
6. Repeat at seats, doorway and corridor locations. Set **Actual location** accurately each time. Save unsuccessful measurements too. Use **Log a device problem** if permissions or hardware prevent a capture.
7. Select **Export measurement summaries**, choose a file location, and collect the JSON exports using your institution's normal method. Up to 250 attempts are stored on each phone; export before clearing, uninstalling or changing devices. No server account is needed.

The app samples for six seconds and then analyses the signal. Switching away, locking the phone, or pressing Stop cancels an active capture; the app attempts to save it as interrupted. If Android kills the process or power is lost, the attempt may not be saved. Log that missing attempt separately. It is a foreground calibration tool, so this stage does not test locked-phone attendance.

“Expected code received” means the test code decoded on that phone. “Different code received” means a valid frame with another code was heard. “Code not received” is a result to retain. None of these statuses verifies attendance or the holder's identity.

## Add your ESP32-S3 and ESP32-C3 Super Mini

The sketch is at `esp32/RoomLabBeacon/RoomLabBeacon.ino`. It targets the official **Arduino-ESP32 3.3.2** BLE APIs and has been compile-tested for ESP32-C3 and ESP32-S3. The real compiler exposed a difference between NimBLE and Bluedroid advertising settings, which is now handled explicitly. Physical flashing and radio reception are separate checks; a successful build does not establish either.

1. In Arduino IDE, install Espressif's `esp32` board package version **3.3.2**. Use the board definition matching your board, typically ESP32S3 Dev Module and ESP32C3 Dev Module. Select the actual USB port and enable **USB CDC On Boot** for serial commands over native USB. Confirm flash size and other board settings before upload. These instructions do not require connecting any external pins.
2. Open the sketch. Leave `role = 1` for the **inside S3**. Change it to `role = 2` for the **corridor C3**, then compile and upload to each board. Leave `studyCode = 0xA17C` on both. Place the S3 inside away from the doorway and the C3 in the corridor, with stable USB power. Record their positions and keep them fixed during comparisons.
3. Alternatively, the serial monitor at 115200 baud accepts `role 1`, `role 2` and `code A17C`, followed by a newline. Serial changes reset after power loss; editing the defaults is more convenient for a fixed study.
4. In Room Lab, enable the Bluetooth option and Bluetooth itself. Allow Nearby devices on newer Android versions and precise Location when requested. Location permission is needed because the Bluetooth readings are being used to study location; the app never reads GPS coordinates. Some versions also require the system Location switch to be on.
5. Take an initial measurement close to each board. Confirm a positive inside or corridor reading count for its role before moving to room-boundary trials. A completed scan with zero readings does not establish that a phone was outside. If Bluetooth is unavailable, retain the issue and continue a separately labelled acoustic-only test.

The firmware broadcasts a public, nonconnectable calibration advertisement at nominal 0 dBm, every 100–150 ms. Service UUID: `a2f2a5d0-558e-4c89-993a-d93215ef98f1`. Manufacturer ID `0xffff` is for laboratory testing. Its payload after the company ID is `[version=1, role=1 or 2, code-high, code-low]`. It deliberately contains no student identifiers or credentials. These beacons are not compatible with the production attendance app's rotating teacher beacon protocol.

## Collect a useful room study

Begin outside teaching time with a small set of different Android manufacturers, ages and price ranges. An initial smoke test checks that the speaker and microphones work. It is not a reliability trial. Then include all Android phone families that students actually use, with phones assigned unique anonymous labels across the entire study.

Keep one speaker position, volume, profile, study code, ESP placement and computer audio configuration fixed within a run. The app records door/window state, phone placement and occupancy, but does not measure speaker volume or board positions. Record those settings in a separate room note, together with the date and any fan/AC/noise conditions. Use a new study code when changing the speaker configuration so the exports remain separable. Never adjust volume during a comparison run.

- **Inside:** sample front, middle, back, side seats, positions near doors/windows, and the least favourable seats. Repeat handheld, on desk, and in the pocket/bag if those placements are expected in production.
- **Outside:** sample immediately outside the door, farther along the corridor, next to windows, across thin walls, on the neighbouring floor if relevant, and in adjacent rooms. Doorway results remain separate from corridor results.
- **Conditions:** test normal open-door ventilation, closed doors, open windows, a realistically occupied room and ordinary classroom noise. Use the conditions the college will actually permit; closing doors only for the test cannot establish normal performance.
- **Validation:** repeat on another day and with previously unused phones after selecting settings. Keep tuning and validation measurements separate using study codes and room notes. Do not tune a volume or BLE cutoff on the same results later presented as independent validation.
- **Negative controls:** stop the speaker and measure; use a different emitter code and measure; turn off each ESP in turn to confirm role counts fall to zero. Retain the records. These check the setup, not adversarial spoof resistance.

If corridor phones decode the expected signal, that is leakage. If reducing volume then makes legitimate seats fail, this setup has not provided a usable boundary. Adding a face check cannot repair a leaking room gate. Do not describe this FSK experiment as a reproduction of an academic acoustic room classifier or as Wi-Fi wall mapping.

## Read the exported results

The export contains pseudonymous phone/room/position labels, Android model/API, recording source and rate, input routing type, numeric audio quality, decoded frame codes and offsets, scan state and RSSI readings from the two beacon roles, timing, battery percentage, conditions and any problem. It contains **no raw audio, face images, GPS, Bluetooth MAC addresses, student accounts or attendance records**. A rooted phone or physical device administrator can still access local app data; these summaries are not tamper-proof evidence. Exports can become identifying if you map aliases back to people, so limit access and retain only what the pilot needs.

Microphone PCM exists temporarily in memory, is analysed locally and is zeroed on normal completion or handled failure. No raw sound file is written. The app has no INTERNET or CAMERA permission; cloud/device-transfer backup is disabled for app data. The file location you choose for export may itself sync to a cloud provider. Clearing the app does not delete exported copies.

Battery start/end percentages are coarse metadata. Six-second captures cannot establish lesson-long battery consumption or reliability. Classroom teacher involvement, staggered face prompts, app integrity and identity verification are outside this stage.

For a descriptive report, use Python 3 without additional packages:

```sh
python3 calibration/analyze.py exports/*.json --output room-study.md
```

The analyzer removes duplicate copies of the same sample ID, rejects conflicting records and reports reception by room, profile, actual location and conditions. Interrupted attempts, errors and reported device limitations remain visible. It does not classify anyone as absent or suspicious, fit an RSSI threshold, or certify 95% performance. Completed scans can contain zero beacon readings. Look at the original `bluetooth.inside` and `bluetooth.corridor` summaries to compare distributions; similar readings on two phones are not proof of one carrier.

Do not pool repeated measurements into a claim that 95% of students are covered. Same-phone samples are correlated, unrecorded failures need a separate log, and iPhones are not covered. The broader attendance research and pilot report explains the three independent success targets and identity checks that a later production design would require.

## Build and software checks

The isolated build entry point includes only the calibration module. It needs no client npm install, Capacitor generation, backend, database, `.env` or server configuration. Room Lab has no runtime third-party libraries. Keep the source archive's directory layout intact so the entry point can find the module and wrapper.

Use JDK 21, Android SDK 36 and the committed Gradle wrapper:

```sh
cd calibration/android
../../client/android/gradlew :calibration:assembleDebug :calibration:testDebugUnitTest :calibration:lintDebug
```

APK: `client/android/calibration/build/outputs/apk/debug/calibration-debug.apk`.

```sh
# From the repository root. Node 22+ and JAVA_HOME pointing to JDK 21:
node calibration/tests/emitter.test.mjs
python3 -m unittest discover -s calibration/tests -p 'test_*.py' -v
```

The Java tests cover all profiles/rates, offset/noise, corruption, silence, truncation, clipping and profile mismatch. The interoperation check generates audio from the actual HTML emitter and decodes it using the actual Java decoder. These checks do not simulate real speakers, phone microphones, reverberation, corridor leakage, OS lifecycle behaviour or adversarial relays. No real-phone measurements are included in this delivery.

## Protocol and scope

The emitter repeats a two-second cycle: 40 bits at 40 ms each plus 400 ms silence. Bits use two frequencies per selected profile with a two-millisecond edge fade. The frame is preamble `DDAA`, 16-bit study code, and CRC-8 polynomial `0x07`, MSB first. The initial rate is 48 kHz; the decoder also supports 44.1 kHz. CRC detects some transmission errors; it provides no authentication. A 16-bit public code can be guessed, copied or replayed and must not be used as production room evidence.

The decoder uses 20 ms Hann-windowed two-tone measurements at approximately 5 ms hops. Its implementation constants are experimental detection settings, not institutional attendance thresholds. It stores received matching and other-code frames separately. Production authentication, replay/relay resistance and per-room validation remain work for later stages.

Primary API references checked for this implementation: [Android AudioRecord](https://developer.android.com/reference/android/media/AudioRecord), [Android Bluetooth permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions), [Android document picker](https://developer.android.com/training/data-storage/shared/documents-files), [Arduino-ESP32 3.3.2 BLEAdvertising header](https://github.com/espressif/arduino-esp32/blob/3.3.2/libraries/BLE/src/BLEAdvertising.h), [Arduino-ESP32 3.3.2 BLEDevice header](https://github.com/espressif/arduino-esp32/blob/3.3.2/libraries/BLE/src/BLEDevice.h).
