# Room Lab ESP32 beacon firmware

Both sketches were compiled successfully on 22 October 2026 using Arduino CLI 1.5.1 and Espressif Arduino-ESP32 3.3.2. Their image checksums and validation hashes passed host-side inspection. Hardware upload, boot and Bluetooth reception are still pending.

## Prepared versions

| Folder | Board target | Beacon role | Study code | Candidate flash settings |
|---|---|---|---|---|
| c3 | ESP32-C3 | 2: corridor | A17C | 4 MB, DIO, 40 MHz, USB CDC enabled |
| s3 | ESP32-S3 | 1: inside | A17C | 4 MB, DIO, hardware USB CDC/JTAG enabled |

These are compile-time settings. The connected board's chip and actual flash capacity must be queried before programming. The laptop detects an Espressif USB serial device at `/dev/cu.usbmodem101`, but chip-identification commands require serial write access that this session has not yet received. Its existing flash has not been changed or backed up.

The C3 sketch uses 642272 bytes of application program storage and 23776 bytes of static RAM. The S3 sketch uses 618839 bytes of application program storage and 32828 bytes of static RAM. Each fits the selected 1310720-byte application partition; dynamic Bluetooth memory consumption still needs runtime testing.

## Files

Each folder contains a per-board sketch with the correct default role, an application binary, bootloader, partition table, and a complete merged 4 MB image. The merged image includes the flash layout and can replace existing firmware/data when written. Confirm the chip/flash size and save a full flash backup before upload. The C3 folder is the candidate for the connected C3; the S3 folder is for the separate S3 board.

The source can also be opened in Arduino IDE with core version 3.3.2. Select the matching board and actual USB port, enable USB CDC On Boot, and use settings matching the physical board. No external pin wiring is needed for the beacon task.

## After a verified upload

At 115200 baud, the C3 should report `Room Lab role=2 code=A17C`. It checks advertisement configuration and start results before printing that status. A boot message alone does not verify radio reception.

Open **Threshold Room Lab**, the separate Android calibration app. Enable the ESP Bluetooth measurement option, grant the requested permissions, and measure near the C3. Check that the **corridor readings** count is greater than zero. With only the C3 present, zero inside-beacon readings are expected. Sound decoding is a separate measurement: if the computer emitter is off, the acoustic code may correctly show as not received.

The serial monitor accepts `role 1`, `role 2`, and `code A17C`, followed by a newline. Runtime serial changes reset after a restart; the per-board source defaults preserve the intended role. After flashing and testing, USB power can run the beacon without a laptop connection.

## Build record

C3 FQBN:

```
esp32:esp32:esp32c3:CDCOnBoot=cdc,FlashMode=dio,FlashFreq=40,FlashSize=4M
```

S3 FQBN:

```
esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc,FlashMode=dio,FlashSize=4M
```

The native compiler found and the source now fixes an advertising-mode constant difference between NimBLE and Bluedroid. The packet format is unchanged. On this Apple Silicon host, Arduino's Intel-only ctags helper was replaced for the build using a local native build from Arduino's tagged `5.8-arduino11` source, with `CFLAGS='-g -O2 -include dirent.h'` and a `runtime.tools.ctags.path` override. No system tools or security settings were modified.

The source remains calibration-only. Codes and beacon packets are public and unsigned; these beacons do not award attendance, prove identity, prevent relays or establish a 95% room boundary. The updated general Room Lab kit includes the corrected common sketch.

Primary tool sources: [Espressif Arduino installation](https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html), [Arduino CLI installation](https://docs.arduino.cc/arduino-cli/installation), [Arduino ctags source](https://github.com/arduino/ctags/tree/5.8-arduino11), [Espressif flash commands](https://docs.espressif.com/projects/esptool/en/latest/esp32c3/esptool/basic-commands.html).
