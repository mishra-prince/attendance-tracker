// Calibration-only beacon for Arduino-ESP32 3.3.2, ESP32-S3 and ESP32-C3.
// This advertisement is public and unsigned. It must never award attendance.
#include <BLEDevice.h>
#include <BLEAdvertising.h>
#include <esp_bt.h>
#include <ctype.h>
#include <stdlib.h>

static const char *SERVICE = "a2f2a5d0-558e-4c89-993a-d93215ef98f1";
// Set role 1 on the inside S3; role 2 on the corridor C3.
static uint8_t role = 1;
static uint16_t studyCode = 0xA17C;
static BLEAdvertising *advertiser;

void updateBeacon() {
  advertiser->stop();
  BLEAdvertisementData packet;
  packet.setFlags(0x06);
  packet.setCompleteServices(BLEUUID(SERVICE));
  const uint8_t payload[] = {0xff, 0xff, 1, role, uint8_t(studyCode >> 8), uint8_t(studyCode)};
  packet.setManufacturerData(String(reinterpret_cast<const char *>(payload), sizeof(payload)));
  const bool configured = advertiser->setAdvertisementData(packet);
  advertiser->setScanResponse(false);
  advertiser->setMinInterval(160); // 100 ms; units are 0.625 ms.
  advertiser->setMaxInterval(240); // 150 ms.
  if (!configured || !advertiser->start()) {
    Serial.println("Room Lab beacon could not start. Check the board and restart.");
    return;
  }
  Serial.printf("Room Lab role=%u code=%04X, TX=0 dBm. Calibration only.\n", role, studyCode);
}

void setup() {
  Serial.begin(115200);
  BLEDevice::init("Room Lab");
  BLEDevice::setPower(ESP_PWR_LVL_N0, ESP_BLE_PWR_TYPE_ADV);
  advertiser = BLEDevice::getAdvertising();
#if defined(CONFIG_NIMBLE_ENABLED)
  // This API takes a GAP connection mode with NimBLE, not an HCI advertising type.
  advertiser->setAdvertisementType(BLE_GAP_CONN_MODE_NON);
#elif defined(CONFIG_BLUEDROID_ENABLED)
  advertiser->setAdvertisementType(ADV_TYPE_NONCONN_IND);
#endif
  updateBeacon();
  Serial.println("Commands: role 1 | role 2 | code A17C");
}

void loop() {
  static String line;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      line.trim();
      if (line == "role 1" || line == "role 2") { role = line.endsWith("1") ? 1 : 2; updateBeacon(); }
      else if (line.startsWith("code ") && line.length() == 9) {
        bool valid = true;
        for (int i = 5; i < 9; i++) if (!isxdigit(line[i])) valid = false;
        if (valid) { studyCode = uint16_t(strtoul(line.substring(5).c_str(), nullptr, 16)); updateBeacon(); }
        else Serial.println("Use four hexadecimal characters, for example code A17C.");
      } else if (line.length()) Serial.println("Commands: role 1 | role 2 | code A17C");
      line = "";
    } else if (line.length() < 32) line += c;
  }
  delay(10);
}
