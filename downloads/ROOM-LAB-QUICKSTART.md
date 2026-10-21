# Start the classroom room-boundary test

This kit tests sound reception and Bluetooth readings. It does not award attendance, verify faces or establish 95% reliability. Use volunteers' own Android phones; an iPhone pilot still needs a separate app.

## First test: no ESP setup needed

1. Install **threshold-room-lab-0.1.0-test.apk** on an Android phone (Android 7+). Open **Threshold Room Lab**. It is a separate debug test app and needs no account or attendance server.
2. Open **room-lab-emitter.html** in a desktop browser on the existing classroom computer. Use its wired speaker. Set **A17C** and **Audible diagnostic · 3 / 4 kHz** on both emitter and app. Begin at low speaker volume and stop if uncomfortable. High-frequency signals may also be audible.
3. Uncheck the app's **Also measure the ESP Bluetooth beacons** option for now. Assign unique anonymous phone labels, such as P01 and P02. Label the actual room position and door/window/occupancy conditions. Do not enter student names or roll numbers.
4. Start the emitter. Tap **Measure for 6 seconds** in the app. Grant microphone permission, then tap Measure again. First test at an inside seat, then at the doorway and outside corridor, updating **Actual location** each time.
5. Compare the **17 / 18 kHz** and **19 / 20 kHz** profiles, changing the profile on both emitter and phone. Retain failed captures; do not assume every speaker or phone supports these frequencies.
6. Choose **Export measurement summaries** on each phone. Save the JSON file in a location you choose. Keep all exports, including interrupted captures and reported device limitations. There is a limit of 250 saved attempts per phone; export before clearing or uninstalling.

If a corridor phone receives the expected code, the tested setup leaks into the corridor. If lowering volume then makes legitimate seats fail, the room gate has not worked. This experiment must not change anyone's attendance credit.

The app captures only while this screen is in the foreground. Stop, switching apps or locking the phone cancels an active measurement. It tries to save an interrupted result; process termination or power loss may leave no saved attempt, which should be logged separately. Locked-phone attendance and lesson-long battery use are not measured by this kit.

## Add your S3 and C3

Open **RoomLabBeacon.ino** using Arduino IDE with Espressif's **Arduino-ESP32 3.3.2** board package. Use the board definition and USB port matching your actual board. Leave `role = 1` for the inside ESP32-S3 and change it to `role = 2` for the corridor ESP32-C3 Super Mini. Leave code **A17C** on both. Compile and upload separately; no external pins need wiring. USB power is sufficient for the beacon task.

The corrected sketch has now been compiled for both C3 and S3 using the pinned core. Enable **USB CDC On Boot** for native-USB serial commands and confirm the actual flash size before uploading. Compilation does not verify physical upload or radio reception; check each role gives readings on a nearby phone before relying on the measurements.

After upload, the serial monitor at 115200 baud accepts `role 1`, `role 2`, or `code A17C`, followed by a newline. These serial changes reset after a restart; editing the defaults preserves the intended role. Place one board inside and the other in the corridor, and record their fixed positions.

Enable Bluetooth and the beacon option in Room Lab. Allow Nearby devices and precise Location when requested, then tap Measure again. Bluetooth location experiments require Location permission; the app does not read GPS. Some Android versions also need the system Location switch enabled. Look for readings from the correct role when close to each board. Use **Log a device problem** when permissions or hardware prevent a test.

The beacons and acoustic code are public and unsigned. They are not production authentication and cannot prevent copying, replay or live relays. Similar audio or Bluetooth readings do not show that two phones have the same carrier.

## Run a useful pilot

Test different Android phone models at front, middle, back and edge seats, at windows, just outside the door, farther along the corridor, and in adjacent rooms. Include normal open-door/window conditions, ordinary noise and realistic occupancy. Repeat on another day and with previously unused phones after choosing settings. Keep the speaker level, speaker position and board positions fixed within each comparison run, and record them in a room note. Use a new study code when the speaker setup changes.

Keep tuning measurements separate from later validation. A successful small demonstration does not establish that 95% of a mixed Android/iPhone class is covered. Face identity, spoof resistance, supervised initial enrollment, app integrity and a fair review/fallback process remain separate production work.

## What is saved

The app retains numeric signal summaries, anonymous labels, room conditions, Android model/API, microphone source/routing, battery percentage and lab beacon RSSI. It discards microphone PCM after analysis and writes no raw sound file. It has no Internet or Camera permission and does not contact **att.threshold.dpdns.org**. It stores no face images, student accounts, GPS coordinates or Bluetooth MAC addresses. The export location you select may itself sync to a cloud service. Aliases can become identifying if mapped back to people, so limit access to pilot results.

## Source, analysis and rebuild

Extract **threshold-room-lab-0.1.0-source.zip**. It contains the updated repository, the module, emitter, sketch, analyzer, tests and detailed `calibration/README.md`. Keep its folder layout intact. No `.env`, signing keys, installed dependencies or build caches are included.

The optional analyzer uses Python 3 with no extra packages. From the extracted repository root:

```sh
python3 calibration/analyze.py exports/*.json --output room-study.md
```

It removes duplicate exported copies by sample ID, rejects conflicting records, and keeps errors, interruptions and device limitations visible. Outside failures are not counted as successful rejection. It does not award attendance or certify reliability.

To rebuild only Room Lab, use JDK 21, Android SDK 36 and the committed wrapper. No client npm install, server or database is required:

```sh
cd calibration/android
../../client/android/gradlew :calibration:assembleDebug :calibration:testDebugUnitTest :calibration:lintDebug
```

The APK is produced at `client/android/calibration/build/outputs/apk/debug/calibration-debug.apk`. First builds need the Android/Gradle dependencies downloaded. The distributed APK is debug-signed for testing; production distribution needs a protected release-signing setup.
