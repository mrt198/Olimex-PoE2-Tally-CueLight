/**
 * Firmware source files and documentation for Olimex ESP32-PoE2 + Waveshare 1.69" Touch LCD Tally System
 */
import cppRaw from '../firmware/olimex_esp32_poe2_tally_tsl.cpp?raw';

export const CPP_FIRMWARE_SOURCE = cppRaw;

export const PLATFORMIO_INI = `; PlatformIO Project Configuration for Olimex ESP32-PoE2 with Waveshare 1.69inch Touch LCD Module
; Broadcast Tally Arbiter, TSL 3.1/5.0 UDP, ETC CueSystem, NMOS IS-07 & OSC Listener
; Features LAN8720A RMII Ethernet, CST816T Capacitive Touch (Single/Double Tap), and LiPo Battery Sensing

[env:esp32-poe]
; ESP32 Arduino Core 3.x (pioarduino) required for MycilaESPConnect + native LAN8720A RMII
platform = https://github.com/pioarduino/platform-espressif32/releases/download/53.03.13/platform-espressif32.zip
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
    -D ESPCONNECT_ETH_SUPPORT
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
    -D PIN_LCD_BL=5
    ; Waveshare CST816T Capacitive Touch (I2C)
    -D PIN_TOUCH_SDA=33
    -D PIN_TOUCH_SCL=32
    -D PIN_TOUCH_INT=34
    -D PIN_TOUCH_RST=4
    -D CST816T_I2C_ADDR=0x15
    ; Olimex LiPo Battery Sensing (ADC1_CH7 on GPIO 35)
    -D PIN_BATTERY_ADC=35
    -D BATTERY_DIVIDER=2.0
    ; Core Debug Level
    -D CORE_DEBUG_LEVEL=ARDUHAL_LOG_LEVEL_INFO

lib_deps =
    lovyan03/LovyanGFX @ ^1.1.16
    mathieucarbou/MycilaESPConnect @ ^10.6.3
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
    adapted: `// Olimex + Waveshare 1.69": Debounced CST816T Capacitive Touch
void processTouchEvents() {
  // Poll every 20ms while INT==LOW or finger is held (INT pulses briefly)
  if (digitalRead(PIN_TOUCH_INT) == LOW || touch.isPressed) {
    readCST816TRegisters(0x01, &gesture, &points, &x, &y); // I2C 0x15 (33/32)
    if (points >= 1 && points <= 2) {
      // Reject lift-off chatter (<95ms after release) so single taps never double-trigger
      if (!touch.isPressed && (now - touch.lastReleaseTime) >= 95) {
        if (touch.tapCount == 1 && (now - touch.firstTapTime) <= 420) {
          handleScreenDoubleTap(); // Toggles Screen 0 <-> Screen 1 Diagnostics
        } else {
          touch.isPressed = true;
        }
      } else if (held > 1200) {
        handleScreenLongPress(); // Cycles display brightness
      }
    } else if (touch.isPressed && ++touch.releaseZeroCount >= 2) { // 40ms confirm
      touch.isPressed = false;
      touch.tapCount = 1;
    }
  }
  if (touch.tapCount == 1 && !touch.isPressed && (now - touch.firstTapTime >= 420)) {
    handleScreenSingleTap(); // TSL return, ETC/Promptside ACK, MIDI return, NMOS
  }
}`,
    explanation: 'The Waveshare 1.69" module replaces the mechanical button with a CST816T capacitive touch screen. A 2-frame (40ms) release filter and 95ms inter-tap bounce guard prevent capacitive lift chatter from firing false double-taps, keeping Single Tap crisp and Double Tap deliberate.'
  },
  {
    category: 'Battery Charge Level & Status Readout',
    original: `// Legacy M5AtomS3R: No battery monitoring (Strictly PoE wired power)`,
    adapted: `// Olimex ESP32-PoE2: GPIO 35 ADC Battery Voltage & Charge Readout
void readBatteryState() {
  uint32_t mvTotal = 0;
  for (int i = 0; i < 8; i++) mvTotal += analogReadMilliVolts(PIN_BATTERY_ADC);
  battery.voltage = (mvTotal / 8000.0f) * BATTERY_DIVIDER; // 2:1 divider
  battery.percentage = mapLiPoPercentage(battery.voltage);

  if (eth_connected) {
    battery.status = (battery.voltage >= 4.15f)
      ? "PoE Powered (Full)" : "PoE Active (Charging)";
  } else {
    battery.status = (battery.voltage < 3.40f)
      ? "LOW BATTERY ALERT!" : "LiPo Discharging";
  }
}`,
    explanation: 'The Olimex ESP32-PoE2 includes an onboard Microchip MCP73831 LiPo charger with ADC battery voltage monitoring on GPIO 35. The firmware calculates calibrated battery voltage, percentage (0-100%), and power rail status on Screen 0, Screen 1, the Web UI, and /api/battery.'
  },
  {
    category: 'Display Resolution, RGB Order & Anti-Flicker Buffering',
    original: `// M5AtomS3R: 128x128 GC9107 Color LCD via M5GFX
M5Canvas canvas(&M5.Display);
canvas.createSprite(128, 128); // 32 KB buffer`,
    adapted: `// Waveshare 1.69": 240x280 ST7789V2 IPS LCD via LovyanGFX
// cfg.invert = true; cfg.rgb_order = true; (RGB subpixel order -> Red stays Red!)
LGFX lcd;
LGFX_Sprite canvas(&lcd);       // 16-bit PSRAM (134KB) or 8-bit SRAM (67KB) fallback
LGFX_Sprite headerCanvas(&lcd); // 17KB 16-bit top-banner sprite for 1Hz clock/battery

void renderClockTick() {
  drawTopBannerWidget(&headerCanvas, 0, 0, W - 16, 38, bgColor, true);
  headerCanvas.pushSprite(8, 8); // Zero-flicker 1Hz clock & battery refresh
}`,
    explanation: 'Uses cfg.rgb_order = true for accurate RGB color reproduction on the ST7789V2 IPS panel, 16-bit PSRAM / 8-bit internal SRAM full-frame sprite fallback, and a dedicated 17 KB top-banner sprite so 1-second clock & battery updates never erase or flicker the screen.'
  },
  {
    category: 'Ethernet Architecture: LAN8720A RMII vs W5500 SPI',
    original: `// M5AtomS3R + AtomPoE: External W5500 via SPI bus
SPI.begin(5, 7, 8, 6);
ETH.begin(ETH_PHY_W5500, 1, 6, -1, -1, SPI);`,
    adapted: `// Olimex ESP32-PoE2: Native ESP32 EMAC + Microchip LAN8720A RMII
ETH.begin(ETH_PHY_LAN8720, 0, 23, 18, 12, ETH_CLOCK_GPIO0_IN);
// Managed via MycilaESPConnect + RF Shutdown on PoE link:
if (ETH.linkUp()) {
  WiFi.mode(WIFI_OFF);
  esp_wifi_stop();
  esp_bt_controller_disable();
}`,
    explanation: 'The Olimex ESP32-PoE2 uses the native ESP32 RMII Ethernet MAC connected to a LAN8720A transceiver at 50 MHz with MycilaESPConnect. When PoE Ethernet links up, Wi-Fi and Bluetooth radios shut down to prevent dual-IP routing issues and reduce heat.'
  },
  {
    category: 'Promptside, MSC rtpMIDI, MTC Timecode & MIDI Button Return',
    original: `// Original Base Firmware: 11 modes, SNTP clock only, passive rtpMIDI`,
    adapted: `// Updated 13-Mode Universal Stack:
// - Mode 7: Promptside (UDP 8000 /promptside/channel/<ch>/standby|go|off|text)
// - Mode 8: MSC_RTP_MIDI (RP-002 SysEx 01 GO, 02 STOP, 0B STANDBY+ with cue #)
// - Global MTC Reader: Decodes 0xF1 Quarter-Frame & SysEx Full-Frame HH:MM:SS:FF
// - Global MIDI Return Action: Note/CC/PC transmitted on Single Tap`,
    explanation: 'All updates from the M5AtomS3R reference firmware are integrated: Promptside theatrical wing cue lights, MIDI Show Control (MSC RP-002) over AppleMIDI, live SMPTE MTC timecode header readout, and configurable MIDI button return feedback.'
  },
  {
    category: '250ms P2P Heartbeat, POSIX Timezones, Power Eco & Shared I2C ENV',
    original: `// Legacy: Passive P2P UDP, manual GMT offset, fixed 240 MHz clock`,
    adapted: `// Updated Global Architecture:
// 1. P2P 250ms CXPING/CXPONG heartbeat -> >4 missed triggers Yellow DISCONNECTED alarm
// 2. POSIX DST Timezones (configTzTime) for Europe/London, US, EU, Tokyo, Custom
// 3. Power & Thermal Eco: 80/160/240 MHz CPU scaling, waiti idle yield, 10% Auto-Dim
// 4. External SHT30 (0x44) + BMP280 (0x76) ENV sensor on shared I2C (GPIO 33/32)`,
    explanation: 'Includes sub-second P2P disconnect fault detection, automatic DST timezone rules, 80 MHz PoE Eco thermal management with instant wake on cue/touch, and optional external SHT30/BMP280 environment telemetry exposed via /api/env alongside /api/battery and /api/power.'
  }
];
