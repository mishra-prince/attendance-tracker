// Threshold main attendance reader: ESP32-S3 + RC522. No credentials in this file.
#include <Arduino.h>
#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <NetworkClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <esp_system.h>
#include <sys/time.h>
#include "cert_bundle.h"

static constexpr int RFID_SCK = 12, RFID_MISO = 13, RFID_MOSI = 11, RFID_SS = 10, RFID_RST = 9;
MFRC522 rfid(RFID_SS, RFID_RST);
Preferences preferences;
String wifiName, wifiPassword, readerId, readerKey, serverUrl;
String serialLine, pendingId, pendingUid, lastUid;
uint64_t pendingSentAt = 0;
uint32_t pendingSince = 0, retryAt = 0, lastPoll = 0, lastSeen = 0, reconnectAt = 0, ledUntil = 0;
bool latched = false, readerHealthy = false;

void light(uint8_t red, uint8_t green, uint8_t blue, uint32_t duration = 700) {
#ifdef RGB_BUILTIN
  rgbLedWrite(RGB_BUILTIN, red, green, blue);
#endif
  ledUntil = millis() + duration;
}
bool configured() { return wifiName.length() && readerId.length() == 36 && readerKey.length() >= 40 && serverUrl.startsWith("https://"); }
void loadConfiguration() {
  preferences.begin("threshold-rfid", false);
  wifiName = preferences.getString("ssid", ""); wifiPassword = preferences.getString("wifi-password", "");
  readerId = preferences.getString("reader-id", ""); readerKey = preferences.getString("reader-key", "");
  serverUrl = preferences.getString("server", "https://threshold-api-j5wk.onrender.com");
}
void handleCommand(const String &line) {
  JsonDocument doc;
  if (deserializeJson(doc, line)) { Serial.println("Invalid JSON command. Configuration was not changed."); return; }
  String command = doc["command"] | "";
  if (command == "status") {
    JsonDocument status; status["configured"] = configured(); status["wifi_connected"] = WiFi.status() == WL_CONNECTED;
    status["reader_healthy"] = readerHealthy; status["reader_id"] = readerId; status["server"] = serverUrl; status["pending_delivery"] = pendingId.length() > 0;
    serializeJson(status, Serial); Serial.println(); return;
  }
  if (command != "configure") { Serial.println("Commands: configure, status. Secrets are never echoed."); return; }
  String ssid = doc["ssid"] | "", pass = doc["password"] | "", id = doc["readerId"] | "", key = doc["key"] | "", url = doc["server"] | "";
  while (url.endsWith("/")) url.remove(url.length() - 1);
  if (!ssid.length() || ssid.length() > 32 || pass.length() > 63 || id.length() != 36 || key.length() < 40 || key.length() > 128
      || !url.startsWith("https://") || url.length() > 200 || url.indexOf('@') >= 0 || url.indexOf('?', 8) >= 0 || url.indexOf('#', 8) >= 0 || url.indexOf('/', 8) >= 0) {
    Serial.println("Invalid configuration. Use Wi-Fi details, the main app reader ID/key and an HTTPS server origin without a path."); return;
  }
  preferences.putString("ssid", ssid); preferences.putString("wifi-password", pass); preferences.putString("reader-id", id);
  preferences.putString("reader-key", key); preferences.putString("server", url);
  Serial.println("Configuration saved privately. Restarting reader. No credentials printed."); delay(200); ESP.restart();
}
void serialCommands() {
  while (Serial.available()) {
    char c = char(Serial.read());
    if (c == '\n') { handleCommand(serialLine); serialLine = ""; }
    else if (c != '\r') {
      if (serialLine.length() < 2048) serialLine += c;
      else { serialLine = ""; Serial.println("Command too long; discarded."); }
    }
  }
}
String eventUuid() {
  uint8_t b[16]; esp_fill_random(b, sizeof(b)); b[6] = (b[6] & 15) | 0x40; b[8] = (b[8] & 63) | 0x80;
  char out[37]; snprintf(out, sizeof(out), "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x", b[0],b[1],b[2],b[3],b[4],b[5],b[6],b[7],b[8],b[9],b[10],b[11],b[12],b[13],b[14],b[15]);
  return String(out);
}
uint64_t epochMillis() { timeval tv; gettimeofday(&tv, nullptr); return uint64_t(tv.tv_sec) * 1000 + tv.tv_usec / 1000; }
void deliver() {
  if (!pendingId.length() || int32_t(millis() - retryAt) < 0) return;
  if (millis() - pendingSince > 20000) {
    Serial.println("Delivery unconfirmed. Check attendance in Threshold before tapping again."); pendingId = ""; pendingUid = ""; light(70,0,0); return;
  }
  retryAt = millis() + 1500;
  if (WiFi.status() != WL_CONNECTED) return;
  NetworkClientSecure tls; tls.setCACertBundle(THRESHOLD_CA_BUNDLE, sizeof(THRESHOLD_CA_BUNDLE)); tls.setHandshakeTimeout(5);
  HTTPClient http; http.setConnectTimeout(4000); http.setTimeout(4000); http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  if (!http.begin(tls, serverUrl + "/api/rfid/device/tap")) { Serial.println("HTTPS setup failed. Nothing confirmed."); return; }
  http.addHeader("Content-Type", "application/json"); http.addHeader("X-Reader-Id", readerId); http.addHeader("Authorization", "Bearer " + readerKey);
  JsonDocument payload; payload["eventId"] = pendingId; payload["uid"] = pendingUid; payload["sentAt"] = pendingSentAt;
  String body; serializeJson(payload, body); int code = http.POST(body);
  if (code == 200) {
    JsonDocument response;
    if (!deserializeJson(response, http.getString()) && response["success"].as<bool>()) {
      String outcome = response["data"]["outcome"] | "", direction = response["data"]["direction"] | "";
      Serial.print("Server result: "); Serial.print(outcome); if (direction.length()) { Serial.print(" "); Serial.print(direction); } Serial.println();
      if (outcome == "RECORDED") light(0,55,0); else if (outcome == "CAPTURED" || outcome == "CAPTURE_WAIT") light(45,25,0); else light(65,0,0);
      pendingId = ""; pendingUid = "";
    }
  } else if (code >= 400 && code < 500 && code != 408 && code != 429) {
    Serial.printf("Request rejected (HTTP %d). Check reader setup in the main app. No success claimed.\n", code); pendingId = ""; pendingUid = ""; light(70,0,0);
  } else Serial.printf("Network/server error %d. Retrying the SAME event; attendance is unconfirmed.\n", code);
  http.end();
}
void readCards() {
  if (!readerHealthy || millis() - lastPoll < 100) return; lastPoll = millis();
  byte atqa[2], size = sizeof(atqa); auto result = rfid.PICC_WakeupA(atqa, &size);
  if (result == MFRC522::STATUS_OK || result == MFRC522::STATUS_COLLISION) {
    lastSeen = millis();
    if (!rfid.PICC_ReadCardSerial()) return;
    String uid; for (byte i = 0; i < rfid.uid.size; i++) { char hex[3]; snprintf(hex,sizeof(hex),"%02X",rfid.uid.uidByte[i]); uid += hex; }
    bool newPresentation = !latched || uid != lastUid;
    latched = true; lastUid = uid; rfid.PICC_HaltA(); rfid.PCD_StopCrypto1();
    if (!newPresentation) return;
    if (pendingId.length()) { Serial.println("Reader is still confirming the previous tap. Wait for its result, then remove and tap this card again."); return; }
    if (!configured() || WiFi.status() != WL_CONNECTED || time(nullptr) < 1735689600) { Serial.println("Reader not online or clock not synchronized. Tap was NOT recorded."); light(70,0,0); return; }
    pendingId = eventUuid(); pendingUid = uid; pendingSentAt = epochMillis(); pendingSince = millis(); retryAt = millis();
    Serial.println("Card read. Waiting for the server result…");
  } else if (result == MFRC522::STATUS_TIMEOUT && millis() - lastSeen >= 600) { latched = false; lastUid = ""; }
}
void setup() {
  Serial.begin(115200); delay(200); loadConfiguration();
  SPI.begin(RFID_SCK, RFID_MISO, RFID_MOSI, RFID_SS); rfid.PCD_Init(); delay(50);
  byte version = rfid.PCD_ReadRegister(MFRC522::VersionReg); readerHealthy = version != 0 && version != 0xff;
  Serial.println("Threshold RFID 1.3.1 — main attendance reader");
  Serial.println("RC522 wiring: 3.3V, GND, SCK GPIO12, MISO GPIO13, MOSI GPIO11, SDA/SS GPIO10, RST GPIO9; IRQ unused.");
  Serial.println(readerHealthy ? "RC522 responded. Physical card reception still requires a test." : "RC522 not detected. Check 3.3V supply and SPI wiring.");
  WiFi.mode(WIFI_STA); WiFi.setAutoReconnect(true); if (configured()) WiFi.begin(wifiName.c_str(), wifiPassword.c_str());
  configTime(0,0,"time.google.com","pool.ntp.org","time.cloudflare.com");
  Serial.println("Send a configure JSON command through the private provisioning tool. No default reader key or admin PIN exists.");
}
void loop() {
  serialCommands();
  if (configured() && WiFi.status() != WL_CONNECTED && millis() - reconnectAt > 15000) { reconnectAt = millis(); WiFi.begin(wifiName.c_str(), wifiPassword.c_str()); }
  readCards(); deliver();
  if (ledUntil && int32_t(millis() - ledUntil) >= 0) { light(0,0,0,0); ledUntil = 0; }
  delay(5);
}
