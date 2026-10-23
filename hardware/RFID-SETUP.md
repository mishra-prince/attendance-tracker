# Threshold RFID 1.3.0

This is a main attendance feature in `com.attendance.tracker`. It uses the existing staff/student logins, class sessions, attendance percentages and audit trail. Install the [same-package APK](../downloads/threshold-1.3.0-test.apk). This development APK updates our previous signed test builds in place. Do not uninstall to update, since that removes local demo enrollment.

## RC522 wiring to ESP32-S3

Unplug USB before wiring. Use **3.3 V**, never 5 V, for the RC522. Use the board's printed **GPIO numbers**, not physical header positions. Confirm your particular S3 board exposes GPIO9–13.

| RC522 pin | ESP32-S3 connection |
|---|---|
| 3.3V | 3V3 |
| GND | GND |
| SDA / SS | GPIO10 |
| SCK | GPIO12 |
| MOSI | GPIO11 |
| MISO | GPIO13 |
| RST | GPIO9 |
| IRQ | Leave disconnected |

RC522's SDA label means SPI chip select here. This sketch does not use I²C. Keep wires short. Supported card UID lengths are 4, 7 or 10 bytes. Typical 13.56 MHz ISO14443A cards work; 125 kHz cards do not.

## Backend and main app

1. Finish the [Supabase + Render setup](../docs/SUPABASE-RENDER-SETUP.md). GitHub is the source/download location. Supabase stores the database. Render runs the authenticated API. The public Supabase project URL is **not** the API origin to enter in this firmware.
2. Sign into Threshold's staff portal as Admin or Super Admin. Open **Students, cards & readers**.
3. Expand **Institution, classes & timetable**. Use the existing college setup or add department, academic year, semester, course, section, subjects and teachers in order. Assign teachers and timetable slots. **Room numbers must match the reader room**. Overlapping room/teacher/section slots are rejected.
4. Register students individually or download the workbook, fill its Students sheet and save that sheet as CSV UTF-8. Choose the class/section, review and import. Each imported account gets a different password, available once in the response. Save privately and give each student only their own login. Registration creates missing section subject enrollments automatically. Existing dropped/completed enrollments are preserved.
5. Add a classroom reader, e.g. `Room 101 S3` with room `101`. Copy its generated reader ID and one-time key privately. This is not an admin PIN or student password.

## Flash and provision on the prepared Mac

The new RFID image replaces the earlier BLE-only A17C demo image on this S3. It does not advertise that demo beacon. The C3 can retain its previous calibration firmware. Phone-based BLE and face demo screens remain in the main APK.

Close serial monitors and connect only the S3 using a data USB cable. From the repository folder run:

```sh
/bin/zsh hardware/UPLOAD-RFID-S3-MAC.command
```

The launcher detects a single USB serial port. If it finds several, pass the S3 port explicitly. It confirms the chip is S3, checks security flags, backs up **all detected flash** privately outside the repository, writes the 4 MB layout and verifies bootloader, partition table and application regions. Remaining capacity on a 16 MB board is unused. It does not set eFuses or enable secure boot/encryption. Never interrupt power during backup/write. An error is not success; retain the private log.

To check already-installed code without another backup or write:

```sh
/bin/zsh hardware/UPLOAD-RFID-S3-MAC.command --verify-only
```

If chip identification fails, close other serial tools, unplug/reconnect, hold BOOT while pressing and releasing RESET, release BOOT and retry with the new port. Do not use force/erase options. If the previous backup matters, keep it separately before doing anything else.

Then provision credentials through hidden prompts:

```sh
/bin/zsh hardware/PROVISION-RFID-MAC.command
/bin/zsh hardware/PROVISION-RFID-MAC.command --status
```

Use 2.4 GHz Wi-Fi, the app's reader ID/key and the actual HTTPS API origin (default `https://att.threshold.dpdns.org`). The URL must have no `/api` suffix. The tool keeps keys out of shell history and logs. The board saves them in ordinary NVS; this code does not provide encrypted storage against physical flash extraction. Rotate the reader key in the app after a lost/compromised board and provision again.

On another Mac, install Python, `esptool==4.12` and pyserial in your own virtual environment, and set `THRESHOLD_ESP_PYTHON` to its Python. The shared `prototype/upload_s3.py` script accepts explicit `--firmware`, `--port`, `--python`, `--backup-dir`, `--purpose rfid` and `--flash`/`--verify-only` arguments. Backup directory must be outside the repository.

## Register, attend and remove

1. Select the reader in **Student cards**. Choose **Register card** for the correct student. The student should be present with their approved details.
2. Tap the card within 60 seconds. Confirm the student's name/roll and masked card suffix in the app. **Capture mode never marks attendance** and temporarily blocks normal taps on that reader. Confirm or cancel before class entry.
3. During a matching active timetable slot, remove and tap the registered card. Wait for **RECORDED IN** in serial feedback/green LED if supported. The server creates today's class session when needed and marks present immediately. Teachers do not need to start each class.
4. After the configured debounce (default 10 seconds), remove and tap again for **OUT**. Further valid taps alternate. Checkout after class is accepted only within the configured grace (default 15 minutes), while the class is open/scheduled. Submitted/locked/cancelled classes reject taps. Avoid a shared checkout/next-class entry moment: one tap has one result.
5. Students open attendance to see today's classes and IN/OUT intervals. Teachers open **RFID attendance** for their assigned classes and can use the normal review/submit workflow. Admin sees all. Export saves a scoped CSV that opens in Excel.
6. Lost card: **Reset / revoke card**, enter reason, then capture/confirm a replacement. To reuse a former student's card, first revoke/deactivate their assignment, then capture it for the new student. **Student left college** disables login and cards while retaining historical attendance/audit records.

No class/wrong room, unknown card, expired request and disabled readers do not create attendance. Existing teacher/manual attendance decisions are preserved. First IN marks present; duration is not an automatic eligibility threshold. Missing exits are shown as missing rather than invented. This reader cannot establish live identity: cards can be lent or cloned.

## Connection and test limits

The reader needs Wi-Fi, a synchronized clock and certificate-verified HTTPS. It retries the **same event ID** for up to 20 seconds so a lost reply does not create an OUT tap. It does not store offline attendance or backdate taps. A failed/unconfirmed delivery requires checking the app before tapping again. Free Render cold starts can exceed that retry window; wake and verify `/ready` before collecting attendance. There is no fabricated green success while the service wakes.

Compiled with Arduino-ESP32 3.3.2, MFRC522 1.4.12 and ArduinoJson 7.4.2, generic S3, USB CDC on boot, 4 MB default partition layout. Program 1,163,099 bytes, static RAM 45,184 bytes. The CA bundle and provenance are in `ThresholdRFID/`. No physical flash, RC522 tap, live Wi-Fi/TLS or end-to-end phone test has been claimed by the agent. A hardware pilot is still required.
