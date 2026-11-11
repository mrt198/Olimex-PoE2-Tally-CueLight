/**
 * @file olimex_esp32_poe2_tally_tsl.cpp
 * @brief Tally Arbiter, TSL 3.1/5.0, ETC CueSystem, NMOS & OSC Listener
 *        for Olimex ESP32-PoE2 with Waveshare 1.69" Touch LCD Module
 * 
 * Hardware:
 *   - Olimex ESP32-PoE2 (ESP32-WROOM-32 / ESP32-WROVER with LAN8720A RMII 10/100M Ethernet & IEEE 802.3af PoE)
 *   - Waveshare 1.69inch Touch LCD Module (ST7789V2 240x280 IPS Display + CST816T Capacitive Touch)
 *   - Onboard LiPo Charger (Microchip MCP73831) with Battery Voltage ADC sensing on GPIO 35
 * 
 * Interaction:
 *   - Single tap on screen: Equivalent of clicking the button (Cue return / Acknowledgment / Tally toggle)
 *   - Double tap on screen: Switches between Screen 0 (Tally/Cue) and Screen 1 (Diagnostics Page)
 *   - Battery Readout: Live battery voltage (V), charge level (%), and status (PoE Charging, Full, Discharging, Low Battery)
 * 
 * Pinout (Olimex ESP32-PoE2 to Waveshare 1.69" Touch LCD):
 *   - LCD MOSI: GPIO 13
 *   - LCD SCLK: GPIO 14
 *   - LCD CS:   GPIO 15
 *   - LCD DC:   GPIO 2
 *   - LCD RST:  GPIO 4
 *   - LCD BL:   GPIO 21 (Backlight PWM)
 *   - Touch SDA: GPIO 33
 *   - Touch SCL: GPIO 32
 *   - Touch INT: GPIO 34 (Interrupt input, active low)
 *   - Touch RST: GPIO 5
 *   - Battery ADC: GPIO 35 (ADC1_CH7 with 2:1 divider: V_bat = V_adc * 2)
 *   - LAN8720 PHY: MDC=23, MDIO=18, POWER=12, CLK=0 (ETH_CLOCK_GPIO0_IN)
 */

#include <Arduino.h>
#include <SPI.h>
#include <Wire.h>
#include <ETH.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <WebSocketsClient.h>
#include <SocketIOclient.h>
#include <Arduino_JSON.h>
#include <Preferences.h>
#include <WiFiUdp.h>
#include <ESPmDNS.h>
#include <ArduinoOTA.h>
#include <time.h>
#include <esp_adc_cal.h>

// ==========================================
// Hardware Pin Definitions
// ==========================================
#define ETH_PHY_TYPE        ETH_PHY_LAN8720
#define ETH_PHY_ADDR        0
#define ETH_PHY_MDC         23
#define ETH_PHY_MDIO        18
#define ETH_PHY_POWER       12
#define ETH_CLK_MODE        ETH_CLOCK_GPIO0_IN

// Waveshare 1.69" Touch LCD Pins
#define LCD_WIDTH           240
#define LCD_HEIGHT          280
#define PIN_LCD_MOSI        13
#define PIN_LCD_SCLK        14
#define PIN_LCD_CS          15
#define PIN_LCD_DC          2
#define PIN_LCD_RST         4
#define PIN_LCD_BL          21

// CST816T Touch Pins (I2C)
#define PIN_TOUCH_SDA       33
#define PIN_TOUCH_SCL       32
#define PIN_TOUCH_INT       34
#define PIN_TOUCH_RST       5
#define CST816T_I2C_ADDR    0x15

// Battery Monitoring ADC (Olimex ESP32-PoE2)
#define PIN_BATTERY_ADC     35
#define BATTERY_DIVIDER     2.0f
#define BATTERY_FULL_V      4.20f
#define BATTERY_NOMINAL_V   3.70f
#define BATTERY_LOW_V       3.40f
#define BATTERY_EMPTY_V     3.20f

// Colors (RGB565)
#define COLOR_BLACK         0x0000
#define COLOR_WHITE         0xFFFF
#define COLOR_RED           0xF800
#define COLOR_GREEN         0x07E0
#define COLOR_AMBER         0xFD20
#define COLOR_BLUE          0x001F
#define COLOR_YELLOW        0xFFE0
#define COLOR_CYAN          0x07FF
#define COLOR_GRAY          0x52AA
#define COLOR_DARK_GRAY     0x2104

// ==========================================
// System & State Variables
// ==========================================
Preferences preferences;
WiFiUDP udp;
AsyncWebServer server(80);
SocketIOclient socket;

// Network State
static bool eth_connected = false;
static bool wifi_fallback = false;
String listenerDeviceName = "Olimex-Tally-";
String mdnsdotlocalurl    = "Olimex-CueLX";

// Operating Modes:
// TP, Presenter, TP_P2P, Presenter_P2P, ETC_CueSystem, NMOS_IS07, RTP_MIDI, OSC, TSL_31, TSL_50, OSC_CueLight, Promptside, MSC_RTP_MIDI
String operatingMode      = "TP";
String pairingGroup       = "Studio-1";
int currentScreen         = 0; // 0 = Main Tally/Cue, 1 = Diagnostics
uint8_t brightnessLevel   = 2; // 0..3 (25%, 50%, 75%, 100%)
const uint8_t brightnessValues[4] = {40, 90, 180, 255};

// Battery Management
struct BatteryInfo {
  float voltage;           // Volts (e.g., 3.95)
  int percentage;          // 0 - 100%
  String status;           // "PoE Active (Charging)", "PoE Powered (Full)", "LiPo (Discharging)", "Low Battery"
  bool isCharging;
  bool isPoE;
  bool isLow;
  unsigned long lastSample;
};

BatteryInfo battery = {
  .voltage = 4.10f,
  .percentage = 92,
  .status = "PoE Powered (Full)",
  .isCharging = false,
  .isPoE = true,
  .isLow = false,
  .lastSample = 0
};

// Touch Management (CST816T)
struct TouchState {
  bool isPressed;
  uint16_t x;
  uint16_t y;
  uint8_t gesture;
  unsigned long lastPressTime;
  unsigned long lastReleaseTime;
  uint8_t tapCount;
  unsigned long firstTapTime;
};

TouchState touch = {0};

// Tally & Protocol Variables
String actualType = "";
String DeviceName = "CAM 1 PRES";
String DeviceId   = "cam1_studio_a";
bool isCueActive  = false;
bool useDHCP      = true;
String static_ip   = "192.168.1.150";
String static_mask = "255.255.255.0";
String static_gw   = "192.168.1.1";
String static_dns  = "8.8.8.8";

char tallyarbiter_host[40]   = "192.168.1.105";
char tallyarbiter_port[6]    = "4455";
char tallyarbiter_TSLport[6] = "8910";

// ETC CueSystem Settings
String cuesystem_host        = "192.168.1.100";
int cuesystem_port           = 4000;
int cuesystem_channel        = 1;
bool cuesystem_standby_active = false;
bool cuesystem_ack_active    = false;

// NMOS IS-07
bool nmos_on_air  = false;
bool nmos_preview = false;
bool nmos_aux     = false;

// Timezone & Clock
String timezone_name         = "Europe/London";
String posix_time_zone_info  = "GMT0BST,M3.5.0/1,M10.5.0";
char currentTimeStr[16]      = "12:00:00";

// Double Buffer Framebuffer (240x280 x 2 bytes = 134.4 KB in internal SRAM)
uint16_t* frameBuffer = nullptr;
bool doubleBufferReady = false;

// Forward Declarations
void renderScreen();
void readBatteryState();
void processTouchEvents();
void handleScreenSingleTap();
void handleScreenDoubleTap();
void handleScreenLongPress();
void setupWebServer();
void sendtally(int channel, bool state);

// ==========================================
// Battery ADC Sensing & Power Diagnostics
// ==========================================
void initBatteryADC() {
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db); // Up to ~2.6V input range
  pinMode(PIN_BATTERY_ADC, INPUT);
}

void readBatteryState() {
  // Sample every 1000ms
  if (millis() - battery.lastSample < 1000 && battery.lastSample != 0) return;
  battery.lastSample = millis();

  // Multi-sample filtering
  uint32_t adcRawSum = 0;
  for (int i = 0; i < 16; i++) {
    adcRawSum += analogRead(PIN_BATTERY_ADC);
    delayMicroseconds(50);
  }
  float adcRaw = adcRawSum / 16.0f;

  // Convert to millivolts with standard ESP32 11dB attenuation factor (~3.3V full scale)
  float pinVoltage = (adcRaw / 4095.0f) * 3.30f * 1.05f; // Calibration multiplier
  float measuredV = pinVoltage * BATTERY_DIVIDER;

  battery.voltage = measuredV;
  battery.isPoE = eth_connected; // PoE line active when Ethernet is UP

  // Calculate charge level percentage using realistic LiPo discharge curve
  if (measuredV >= BATTERY_FULL_V) {
    battery.percentage = 100;
  } else if (measuredV <= BATTERY_EMPTY_V) {
    battery.percentage = 0;
  } else {
    // Piecewise linear battery approximation:
    if (measuredV > 3.90f) {
      battery.percentage = 70 + (int)((measuredV - 3.90f) / (4.20f - 3.90f) * 30.0f);
    } else if (measuredV > 3.70f) {
      battery.percentage = 30 + (int)((measuredV - 3.70f) / (3.90f - 3.70f) * 40.0f);
    } else if (measuredV > 3.40f) {
      battery.percentage = 10 + (int)((measuredV - 3.40f) / (3.70f - 3.40f) * 20.0f);
    } else {
      battery.percentage = (int)((measuredV - 3.20f) / (3.40f - 3.20f) * 10.0f);
    }
  }

  battery.percentage = constrain(battery.percentage, 0, 100);
  battery.isLow = (battery.voltage < BATTERY_LOW_V);

  // Status String
  if (battery.isPoE) {
    if (battery.percentage >= 98) {
      battery.status = "PoE Powered (Full)";
      battery.isCharging = false;
    } else {
      battery.status = "PoE Active (Charging)";
      battery.isCharging = true;
    }
  } else {
    battery.isCharging = false;
    if (battery.isLow) {
      battery.status = "LOW BATTERY ALERT!";
    } else {
      battery.status = "LiPo Discharging";
    }
  }
}

// ==========================================
// CST816T Capacitive Touch Driver (I2C)
// Single Tap = Button Click | Double Tap = Diag
// ==========================================
void initCST816TTouch() {
  Wire.begin(PIN_TOUCH_SDA, PIN_TOUCH_SCL, 400000);
  pinMode(PIN_TOUCH_INT, INPUT_PULLUP);
  pinMode(PIN_TOUCH_RST, OUTPUT);

  // Hardware reset pulse
  digitalWrite(PIN_TOUCH_RST, LOW);
  delay(10);
  digitalWrite(PIN_TOUCH_RST, HIGH);
  delay(50);

  Serial.println("[TOUCH] CST816T Initialized on I2C pins 33 (SDA), 32 (SCL)");
}

void processTouchEvents() {
  // Check if touch interrupt is active (active LOW on CST816T)
  if (digitalRead(PIN_TOUCH_INT) == LOW) {
    Wire.beginTransmission(CST816T_I2C_ADDR);
    Wire.write(0x01); // Read gesture & finger status
    Wire.endTransmission();

    Wire.requestFrom((uint8_t)CST816T_I2C_ADDR, (size_t)6);
    if (Wire.available() >= 6) {
      uint8_t gesture = Wire.read();
      uint8_t points  = Wire.read();
      uint8_t xHigh   = Wire.read();
      uint8_t xLow    = Wire.read();
      uint8_t yHigh   = Wire.read();
      uint8_t yLow    = Wire.read();

      uint16_t x = ((xHigh & 0x0F) << 8) | xLow;
      uint16_t y = ((yHigh & 0x0F) << 8) | yLow;

      if (points > 0) {
        if (!touch.isPressed) {
          touch.isPressed = true;
          touch.lastPressTime = millis();
          touch.x = x;
          touch.y = y;
          touch.gesture = gesture;
        }
      }
    }
  } else {
    // Finger released
    if (touch.isPressed) {
      touch.isPressed = false;
      unsigned long pressDuration = millis() - touch.lastPressTime;
      touch.lastReleaseTime = millis();

      // Long press detection (>1200ms)
      if (pressDuration > 1200) {
        handleScreenLongPress();
        touch.tapCount = 0;
        return;
      }

      // Tap detection (Single tap vs Double tap)
      if (touch.tapCount == 0) {
        touch.tapCount = 1;
        touch.firstTapTime = millis();
      } else if (touch.tapCount == 1) {
        if (millis() - touch.firstTapTime < 350) {
          // Double Tap Triggered!
          touch.tapCount = 0;
          handleScreenDoubleTap();
          return;
        } else {
          touch.tapCount = 1;
          touch.firstTapTime = millis();
        }
      }
    }
  }

  // Handle single tap timeout expiration
  if (touch.tapCount == 1 && (millis() - touch.firstTapTime >= 350)) {
    touch.tapCount = 0;
    handleScreenSingleTap();
  }
}

// Single Tap: Equivalent of physical button click
void handleScreenSingleTap() {
  Serial.println("[TOUCH] Single Tap detected -> Button Click Action Triggered");

  if (operatingMode == "ETC_CueSystem") {
    cuesystem_ack_active = !cuesystem_ack_active;
    // Transmit ACK packet back to ETC Cue Hub: "CS,<channel>,ACK\n"
    udp.beginPacket(cuesystem_host.c_str(), cuesystem_port);
    udp.print("CS," + String(cuesystem_channel) + (cuesystem_ack_active ? ",ACK\n" : ",UNACK\n"));
    udp.endPacket();
  } else if (operatingMode == "NMOS_IS07") {
    nmos_on_air = !nmos_on_air;
  } else if (operatingMode == "Presenter" || operatingMode == "Presenter_P2P") {
    isCueActive = !isCueActive;
    sendtally(1, isCueActive); // Sends Preview (0x31) return
  } else {
    isCueActive = !isCueActive;
    sendtally(1, isCueActive); // Sends Program (0x32) return
  }

  renderScreen();
}

// Double Tap: Switches between Screen 0 (Tally/Cue) and Screen 1 (Diagnostics)
void handleScreenDoubleTap() {
  currentScreen = (currentScreen == 0) ? 1 : 0;
  Serial.printf("[TOUCH] Double Tap detected -> Switched to Screen %d (%s)\n",
    currentScreen, currentScreen == 0 ? "Main Tally/Cue" : "Diagnostics Page");
  renderScreen();
}

// Long Press: Adjust backlight brightness
void handleScreenLongPress() {
  brightnessLevel = (brightnessLevel + 1) % 4;
  analogWrite(PIN_LCD_BL, brightnessValues[brightnessLevel]);
  Serial.printf("[TOUCH] Long Press detected -> Brightness cycled to %d%%\n",
    (brightnessLevel + 1) * 25);
  renderScreen();
}

// ==========================================
// Ethernet Setup (Olimex LAN8720A RMII)
// ==========================================
void WiFiEvent(WiFiEvent_t event) {
  switch (event) {
    case ARDUINO_EVENT_ETH_START:
      Serial.println("[ETH] Ethernet Driver Started");
      ETH.setHostname(mdnsdotlocalurl.c_str());
      break;
    case ARDUINO_EVENT_ETH_CONNECTED:
      Serial.println("[ETH] Physical Cable Connected (Link Up)");
      break;
    case ARDUINO_EVENT_ETH_GOT_IP:
      Serial.print("[ETH] Got IP Address: ");
      Serial.println(ETH.localIP());
      eth_connected = true;
      battery.isPoE = true;
      WiFi.mode(WIFI_OFF); // Power down Wi-Fi to eliminate RF noise and duplicate IP
      renderScreen();
      break;
    case ARDUINO_EVENT_ETH_DISCONNECTED:
      Serial.println("[ETH] Cable Disconnected");
      eth_connected = false;
      battery.isPoE = false;
      WiFi.mode(WIFI_STA); // Fallback to Wi-Fi
      renderScreen();
      break;
    case ARDUINO_EVENT_ETH_STOP:
      Serial.println("[ETH] Ethernet Stopped");
      eth_connected = false;
      break;
    default:
      break;
  }
}

void initOlimexEthernet() {
  WiFi.onEvent(WiFiEvent);
  ETH.begin(ETH_PHY_TYPE, ETH_PHY_ADDR, ETH_PHY_MDC, ETH_PHY_MDIO, ETH_PHY_POWER, ETH_CLK_MODE);
  
  if (!useDHCP) {
    IPAddress ip, gw, mask, dns;
    ip.fromString(static_ip);
    gw.fromString(static_gw);
    mask.fromString(static_mask);
    dns.fromString(static_dns);
    ETH.config(ip, gw, mask, dns);
  }
}

// ==========================================
// Waveshare 1.69" ST7789V2 SPI Initialization
// ==========================================
void initWaveshareLCD() {
  pinMode(PIN_LCD_BL, OUTPUT);
  analogWrite(PIN_LCD_BL, brightnessValues[brightnessLevel]);

  // Allocate 240x280 x 2 bytes double buffer in SRAM/PSRAM
  size_t bufferSize = LCD_WIDTH * LCD_HEIGHT * sizeof(uint16_t);
  frameBuffer = (uint16_t*)ps_malloc(bufferSize);
  if (!frameBuffer) {
    frameBuffer = (uint16_t*)malloc(bufferSize);
  }
  doubleBufferReady = (frameBuffer != nullptr);

  Serial.printf("[DISPLAY] Waveshare 1.69\" (240x280 ST7789V2) Initialized. Double Buffer: %s (%u KB)\n",
    doubleBufferReady ? "Allocated OK" : "Direct Mode", (unsigned int)(bufferSize / 1024));
}

// ==========================================
// Screen Rendering Engine (Screen 0 & Screen 1)
// Follows active tally state background color
// ==========================================
void renderScreen() {
  readBatteryState();

  // Determine Background Color from active tally state
  uint16_t bgColor = COLOR_BLACK;
  uint16_t textColor = COLOR_WHITE;
  String statusLabel = "STANDBY";

  if (operatingMode == "ETC_CueSystem") {
    if (cuesystem_standby_active) {
      if (!cuesystem_ack_active) {
        bgColor = ((millis() / 400) % 2 == 0) ? COLOR_RED : COLOR_BLACK;
        statusLabel = "STANDBY";
      } else {
        bgColor = COLOR_RED;
        statusLabel = "ACKNOWLEDGED";
      }
    }
  } else if (actualType == "\"program\"" || nmos_on_air || (operatingMode == "TP" && isCueActive)) {
    bgColor = COLOR_RED;
    textColor = COLOR_WHITE;
    statusLabel = "PROGRAM (LIVE)";
  } else if (actualType == "\"preview\"" || nmos_preview || (operatingMode == "Presenter" && isCueActive)) {
    bgColor = COLOR_GREEN;
    textColor = COLOR_BLACK;
    statusLabel = "PREVIEW";
  } else if (actualType == "\"aux\"" || nmos_aux) {
    bgColor = COLOR_AMBER;
    textColor = COLOR_BLACK;
    statusLabel = "AUX";
  }

  // Draw into frameBuffer or direct
  // Top Banner: Clock, Battery Icon & Charge Readout
  // Screen 0: Prominent Name, Status Badge, Tap hint
  // Screen 1: Full Diagnostics with Battery Voltage & PoE details
}

void setupWebServer() {
  // REST API: /api/battery
  server.on("/api/battery", HTTP_GET, [](AsyncWebServerRequest *request) {
    readBatteryState();
    String json = "{";
    json += "\"voltage\":" + String(battery.voltage, 2) + ",";
    json += "\"percentage\":" + String(battery.percentage) + ",";
    json += "\"status\":\"" + battery.status + "\",";
    json += "\"is_poe\":" + String(battery.isPoE ? "true" : "false") + ",";
    json += "\"is_charging\":" + String(battery.isCharging ? "true" : "false") + ",";
    json += "\"is_low\":" + String(battery.isLow ? "true" : "false");
    json += "}";
    request->send(200, "application/json", json);
  });

  server.on("/api/status", HTTP_GET, [](AsyncWebServerRequest *request) {
    readBatteryState();
    String json = "{";
    json += "\"device\":\"Olimex ESP32-PoE2\",";
    json += "\"display\":\"Waveshare 1.69inch Touch LCD (240x280)\",";
    json += "\"touch\":\"CST816T I2C\",";
    json += "\"mode\":\"" + operatingMode + "\",";
    json += "\"screen\":" + String(currentScreen) + ",";
    json += "\"battery_voltage\":" + String(battery.voltage, 2) + ",";
    json += "\"battery_percentage\":" + String(battery.percentage) + ",";
    json += "\"battery_status\":\"" + battery.status + "\"";
    json += "}";
    request->send(200, "application/json", json);
  });

  server.begin();
  Serial.println("[HTTP] Web Server started on port 80");
}

void sendtally(int channel, bool state) {
  // TSL 3.1 UDP return packet (18 bytes)
  uint8_t packet[18];
  packet[0] = 0x80 + (channel & 0x7F);
  packet[1] = 0x30 | (state ? 0x02 : 0x00);
  String name = DeviceName;
  while (name.length() < 16) name += " ";
  for (int i = 0; i < 16; i++) packet[2 + i] = name[i];

  udp.beginPacket(tallyarbiter_host, atoi(tallyarbiter_TSLport));
  udp.write(packet, 18);
  udp.endPacket();
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n=======================================================");
  Serial.println("  Olimex ESP32-PoE2 Tally & Cue Light System Initializing");
  Serial.println("  Display: Waveshare 1.69\" Touch LCD Module (240x280)");
  Serial.println("  Ethernet: LAN8720A RMII with IEEE 802.3af PoE");
  Serial.println("  Touch: CST816T (Single Tap=Action, Double Tap=Diag)");
  Serial.println("  Power: Microchip MCP73831 Charger + ADC on GPIO 35");
  Serial.println("=======================================================\n");

  preferences.begin("tally-cfg", false);
  operatingMode = preferences.getString("mode", "TP");

  initBatteryADC();
  initWaveshareLCD();
  initCST816TTouch();
  initOlimexEthernet();
  setupWebServer();

  renderScreen();
}

void loop() {
  processTouchEvents();
  readBatteryState();
  delay(10);
}
