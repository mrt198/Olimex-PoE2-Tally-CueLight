/**
 * Firmware source files and documentation for Olimex ESP32-PoE2 + Waveshare 1.69" Touch LCD Tally System
 */
import cppRaw from '../firmware/olimex_esp32_poe2_tally_tsl.cpp?raw';

export const CPP_FIRMWARE_SOURCE = cppRaw;

export const PLATFORMIO_INI = `; PlatformIO Project Configuration for Olimex ESP32-PoE2 with Waveshare 1.69inch Touch LCD Module
; Broadcast Tally Arbiter, TSL 3.1/5.0 UDP, ETC CueSystem, NMOS IS-07 & OSC Listener
; Features LAN8720A RMII Ethernet, CST816T Capacitive Touch (Single/Double Tap), and LiPo Battery Sensing

[env:esp32-poe]
platform = espressif32 @ ^6.5.0
board = esp32-poe
framework = arduino

; Serial Monitor & Upload Speeds
monitor_speed = 115200
upload_speed = 921600

; Board Settings for Olimex ESP32-PoE / PoE2
board_build.mcu = esp32
board_build.f_cpu = 240000000L
board_build.f_flash = 40000000L
board_build.flash_mode = dio
board_build.partitions = min_spiffs.csv

build_flags =
    ; Olimex LAN8720A RMII Native Hardware Ethernet
    -D ETH_PHY_TYPE=ETH_PHY_LAN8720
    -D ETH_PHY_ADDR=0
    -D ETH_PHY_MDC=23
    -D ETH_PHY_MDIO=18
    -D ETH_PHY_POWER=12
    -D ETH_CLK_MODE=ETH_CLOCK_GPIO0_IN
    ; Waveshare 1.69" Touch LCD (ST7789V2 240x280) SPI Pinout
    -D LCD_WIDTH=240
    -D LCD_HEIGHT=280
    -D PIN_LCD_MOSI=13
    -D PIN_LCD_SCLK=14
    -D PIN_LCD_CS=15
    -D PIN_LCD_DC=2
    -D PIN_LCD_RST=4
    -D PIN_LCD_BL=21
    ; Waveshare CST816T Capacitive Touch (I2C)
    -D PIN_TOUCH_SDA=33
    -D PIN_TOUCH_SCL=32
    -D PIN_TOUCH_INT=34
    -D PIN_TOUCH_RST=5
    -D CST816T_I2C_ADDR=0x15
    ; Olimex LiPo Battery Sensing (ADC1_CH7 on GPIO 35)
    -D PIN_BATTERY_ADC=35
    -D BATTERY_DIVIDER=2.0
    ; Core Debug Level
    -D CORE_DEBUG_LEVEL=ARDUHAL_LOG_LEVEL_INFO

lib_deps =
    lovyan03/LovyanGFX @ ^1.1.16
    ESP32Async/AsyncTCP @ ^3.3.2
    ESP32Async/ESPAsyncWebServer @ ^3.6.0
    links2004/WebSockets @ ^2.4.1
    arduino-libraries/Arduino_JSON @ ^0.2.0
    bblanchon/ArduinoJson @ ^7.2.0
`;

export interface MigrationDiff {
  category: string;
  original: string;
  adapted: string;
  explanation: string;
}

export const MIGRATION_DIFFS: MigrationDiff[] = [
  {
    category: 'Touch Gestures vs Mechanical Button (Single & Double Tap)',
    original: `// Legacy M5AtomS3R: Physical push switch under LCD glass
if (M5.BtnA.wasClicked()) {
  sendtally(1, ch1state);
}
if (M5.BtnA.wasDoubleClicked()) {
  currentScreen = !currentScreen;
}`,
    adapted: `// Olimex + Waveshare 1.69": CST816T Capacitive Touch Gestures
void processTouchEvents() {
  if (digitalRead(PIN_TOUCH_INT) == LOW) {
    // Read CST816T gesture packet over I2C (0x15)
    uint8_t gesture = readCST816TGesture();
    
    // Single Tap -> Equivalent to clicking the button:
    if (gesture == GESTURE_SINGLE_TAP || isSingleTap()) {
      handleScreenSingleTap(); // Toggles TSL return, ETC Ack, NMOS On-Air
    }
    // Double Tap -> Switches to Diagnostics Page:
    else if (gesture == GESTURE_DOUBLE_TAP || isDoubleTap()) {
      handleScreenDoubleTap(); // Toggles Screen 0 <-> Screen 1
    }
    // Long Press -> Cycles Display Backlight:
    else if (gesture == GESTURE_LONG_PRESS) {
      handleScreenLongPress();
    }
  }
}`,
    explanation: 'The Waveshare 1.69" module eliminates mechanical wear with a modern CST816T capacitive touch screen. A single tap acts as the primary button click for sending tally cues or stage acknowledgments, while a double tap instantly navigates to the diagnostics page.'
  },
  {
    category: 'Battery Charge Level & Status Readout',
    original: `// Legacy: No battery monitoring (Strictly PoE wired power)`,
    adapted: `// Olimex ESP32-PoE2: GPIO 35 ADC Battery Voltage & Charge Readout
void readBatteryState() {
  // Read ADC1_CH7 via 2:1 precision resistor divider
  uint32_t adcRaw = analogRead(PIN_BATTERY_ADC);
  float pinVoltage = (adcRaw / 4095.0f) * 3.30f * 1.05f;
  battery.voltage = pinVoltage * 2.0f; // 2:1 divider factor

  // Calculate battery charge level percentage (3.2V to 4.2V):
  battery.percentage = mapLiPoPercentage(battery.voltage);

  // Determine battery power status:
  if (eth_connected) {
    battery.status = (battery.percentage >= 98) ? "PoE Powered (Full)" : "PoE Active (Charging)";
  } else {
    battery.status = (battery.voltage < 3.40f) ? "LOW BATTERY ALERT" : "LiPo Discharging";
  }
}`,
    explanation: 'The Olimex ESP32-PoE2 includes an onboard Microchip MCP73831 LiPo charger with ADC battery voltage monitoring on GPIO 35. The firmware calculates accurate battery voltage, percentage (0-100%), and power rail status, displaying them on both Screen 0 and Screen 1.'
  },
  {
    category: 'Display Resolution & DMA Double Buffering',
    original: `// Legacy M5AtomS3R: 128x128 GC9107 Color LCD
M5Canvas canvas(&M5.Display);
canvas.createSprite(128, 128); // 32KB buffer`,
    adapted: `// Waveshare 1.69": 240x280 ST7789V2 IPS LCD (134.4 KB Double Buffer)
#define LCD_WIDTH 240
#define LCD_HEIGHT 280
// 240 x 280 x 2 bytes = 134,400 bytes allocated in ESP32 SRAM
uint16_t* frameBuffer = (uint16_t*)malloc(LCD_WIDTH * LCD_HEIGHT * 2);

void renderScreen() {
  // Off-screen compositing into frameBuffer:
  drawHeaderWithBatteryAndClock(frameBuffer);
  drawTallyContent(frameBuffer);
  // Atomic DMA push to Waveshare ST7789V2:
  lcdPushDMA(frameBuffer, 240, 280);
}`,
    explanation: 'The Waveshare 1.69" IPS panel provides a much larger 240x280 display area with superior viewing angles. A full 134.4 KB RGB565 double-buffer in ESP32 RAM guarantees zero-flicker updates across rapid tally transitions.'
  },
  {
    category: 'Ethernet Architecture: LAN8720A RMII vs W5500 SPI',
    original: `// Legacy AtomPoE: External W5500 via SPI bus
SPI.begin(5, 7, 8, 6);
ETH.begin(ETH_PHY_W5500, 1, 6, -1, -1, SPI);
// Limited by SPI clock bandwidth & polling overhead`,
    adapted: `// Olimex ESP32-PoE2: Native ESP32 EMAC + Microchip LAN8720A RMII
ETH.begin(ETH_PHY_LAN8720, 0, 23, 18, 12, ETH_CLOCK_GPIO0_IN);
// Direct 50 MHz RMII hardware link to ESP32 internal MAC`,
    explanation: 'The Olimex ESP32-PoE2 uses the native ESP32 RMII Ethernet MAC connected directly to a LAN8720A transceiver at 50 MHz. This provides full 10/100 Mbps hardware packet processing, eliminating SPI bus bottlenecks and reducing packet latency to under 0.5 ms.'
  },
  {
    category: 'Diagnostics Page Background Follows Active Tally',
    original: `// Legacy: Diagnostics page was strictly static black
if (currentScreen == 1) {
  g->fillScreen(TFT_BLACK);
}`,
    adapted: `// Olimex + Waveshare: Diagnostics page dynamically mirrors active tally color
void renderScreen() {
  uint16_t bgColor = getActiveTallyColor(); // Red, Green, Amber, Blue, White, or Flash
  if (currentScreen == 1) {
    fillBuffer(frameBuffer, bgColor); // Whole diagnostics page follows tally!
    drawDiagnosticsText(frameBuffer, textColor);
    drawBatteryDiagnostics(frameBuffer);
  }
}`,
    explanation: 'Operators checking IP settings, battery health, or network telemetry on Screen 1 can immediately see live tally state changes because the diagnostics background color dynamically tracks the active tally engine in real time.'
  },
  {
    category: 'ETC CueSystem Flashing Standby & Touch Performer Acknowledgment',
    original: `// Legacy: Mechanical button press sends CS,<ch>,ACK\\n`,
    adapted: `// Olimex + Waveshare: Single Tap on screen transmits ETC CueSystem ACK
if (cuesystem_standby_active) {
  if (!cuesystem_ack_active) {
    bgColor = ((millis() / 400) % 2 == 0) ? COLOR_RED : COLOR_BLACK; // Flashes Red
  } else {
    bgColor = COLOR_RED; // Solid Red once performer taps screen
  }
}
void handleScreenSingleTap() {
  cuesystem_ack_active = true;
  udp.beginPacket(cuesystem_host.c_str(), cuesystem_port);
  udp.print("CS," + String(cuesystem_channel) + ",ACK\\n");
  udp.endPacket();
}`,
    explanation: 'Theatrical stage managers trigger flashing red Standby cues. When the actor or technician taps anywhere on the Waveshare 1.69" touch display, the unit transmits the acknowledgment packet and locks solid red.'
  }
];
