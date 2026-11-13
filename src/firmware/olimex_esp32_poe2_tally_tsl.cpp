/**
 * @file olimex_esp32_poe2_tally_tsl.cpp
 * @brief Universal Broadcast Tally & Theatrical Cue Light Controller
 *        for Olimex ESP32-PoE2 with Waveshare 1.69" Touch LCD Module
 *
 * Hardware:
 *   - Olimex ESP32-PoE2 (ESP32-WROOM-32 / WROVER, LAN8720A RMII 10/100M Ethernet, IEEE 802.3af PoE)
 *   - Waveshare 1.69inch Touch LCD Module (ST7789V2 240x280 IPS Display + CST816T Capacitive Touch)
 *   - Onboard LiPo Charger (Microchip MCP73831) with Battery Voltage ADC sensing on GPIO 35
 *
 * Interaction (CST816T Capacitive Touch):
 *   - Single Tap on screen : Equivalent of clicking the physical button (mode-aware cue/tally/ACK action)
 *   - Double Tap on screen : Switches between Screen 0 (Main Tally/Cue) and Screen 1 (Diagnostics Page)
 *   - Long Press (>1.2s)   : Cycles display backlight brightness (25%, 50%, 75%, 100%)
 *   - Hold (>7.0s)         : Emergency network/config reset & reboot
 *
 * Supported Operating Modes (13):
 *   1. TP                 - Technical Producer with Tally Arbiter (button sends TSL 3.1 Program 0x32)
 *   2. Presenter          - Presenter with Tally Arbiter (button sends TSL 3.1 Preview 0x31)
 *   3. TP_P2P             - Standalone TP Master (no Tally Arbiter, 250ms heartbeat + fault alarm)
 *   4. Presenter_P2P      - Standalone Presenter Slave (no Tally Arbiter, 250ms heartbeat + fault alarm)
 *   5. ETC_CueSystem      - ETC CueSystem Outstation (Flashing Red Standby -> Touch ACK Solid Red -> GO Green)
 *   6. NMOS_IS07          - AMWA NMOS IS-07 Event & Tally (DNS-SD _nmos-registration._tcp + Program/Preview/Aux)
 *   7. Promptside         - Promptside Theatrical Cue Light (promptside.co, UDP 8000, wing banner + ACK)
 *   8. MSC_RTP_MIDI       - MIDI Show Control (MSC RP-002) over rtpMIDI / AppleMIDI (UDP 5004)
 *   9. RTP_MIDI           - rtpMIDI / AppleMIDI Outstation (6 colors with priority + MIDI button return)
 *  10. OSC                - Open Sound Control Outstation (UDP 8000, 6 colors + scrolling text ticker)
 *  11. TSL_31             - TSL UMD v3.1 Dedicated Listener (UDP or TCP, centered source name)
 *  12. TSL_50             - TSL UMD v5.0 Dedicated Listener (UDP or TCP, 4 tally bits + UTF-8 name)
 *  13. OSC_CueLight       - OSC Cue Light for iOS (RSMCK protocol, UDP 53000, persistent banner + ACK)
 *
 * Global Features:
 *   - Live LiPo Battery Charge Level (%), Voltage (V), and PoE/Charging Status Readout
 *   - MycilaESPConnect network manager with LAN8720A PoE Ethernet precedence & Wi-Fi fallback
 *   - Static IP / DHCP configuration with mDNS (_CueLX._tcp, _http._tcp, _cuelx-tally._udp) & ArduinoOTA
 *   - Double-buffered 240x280 ST7789V2 rendering using LovyanGFX LGFX_Sprite (~134.4 KB) + direct fallback
 *   - Diagnostics page (Screen 1) background dynamically mirrors the active tally/cue state
 *   - Dual-Core FreeRTOS isolation (Socket.IO pinned to Core 0, real-time UI/Touch/UDP on Core 1)
 *   - Power & Thermal management (80/160/240 MHz CPU scaling, auto-dimming, RF shutdown on PoE, FreeRTOS waiti yield)
 *   - POSIX Timezone SNTP clock + MTC (MIDI Time Code) Quarter-Frame/SysEx reader
 *   - Optional external I2C Environment Sensor (SHT30 0x44 + BMP280 0x76) sharing I2C GPIO 33/32
 *   - Embedded AsyncWebServer Web Dashboard (/), HTML User Manual (/manual), & REST APIs
 *
 * Pinout (Olimex ESP32-PoE2 to Waveshare 1.69" Touch LCD):
 *   - LCD MOSI : GPIO 13
 *   - LCD SCLK : GPIO 14
 *   - LCD CS   : GPIO 15
 *   - LCD DC   : GPIO 2
 *   - LCD RST  : GPIO 4  (Shared reset with Touch RST)
 *   - LCD BL   : GPIO 5  (Backlight PWM; GPIO 21 is reserved for EMAC_TX_EN!)
 *   - Touch SDA: GPIO 33 (Shared I2C SDA)
 *   - Touch SCL: GPIO 32 (Shared I2C SCL)
 *   - Touch INT: GPIO 34 (Active LOW interrupt)
 *   - Touch RST: GPIO 4  (Shared with LCD RST, or wire TP_RST to ESP_EN & set -1)
 *   - Battery  : GPIO 35 (ADC1_CH7 via 2:1 divider: V_bat = V_adc * 2)
 *   - LAN8720A : PHY_ADDR=0, MDC=23, MDIO=18, POWER=12, CLK=GPIO0_IN, TX_EN=21
 */

#include <Arduino.h>
#include <SPI.h>
#include <Wire.h>
#include <LovyanGFX.hpp>

// Enable Ethernet support in MycilaESPConnect before include
#ifndef ESPCONNECT_ETH_SUPPORT
#define ESPCONNECT_ETH_SUPPORT
#endif

// Olimex ESP32-PoE2 LAN8720A RMII Hardware Ethernet Definitions
#ifndef ETH_PHY_TYPE
#define ETH_PHY_TYPE ETH_PHY_LAN8720
#endif
#ifndef ETH_PHY_ADDR
#define ETH_PHY_ADDR 0
#endif
#ifndef ETH_PHY_MDC
#define ETH_PHY_MDC 23
#endif
#ifndef ETH_PHY_MDIO
#define ETH_PHY_MDIO 18
#endif
#ifndef ETH_PHY_POWER
#define ETH_PHY_POWER 12
#endif
#ifndef ETH_CLK_MODE
#define ETH_CLK_MODE ETH_CLOCK_GPIO0_IN
#endif

// Waveshare 1.69" ST7789V2 LCD SPI Pinout
#ifndef LCD_WIDTH
#define LCD_WIDTH 240
#endif
#ifndef LCD_HEIGHT
#define LCD_HEIGHT 280
#endif
#ifndef PIN_LCD_MOSI
#define PIN_LCD_MOSI 13
#endif
#ifndef PIN_LCD_SCLK
#define PIN_LCD_SCLK 14
#endif
#ifndef PIN_LCD_CS
#define PIN_LCD_CS 15
#endif
#ifndef PIN_LCD_DC
#define PIN_LCD_DC 2
#endif
#ifndef PIN_LCD_RST
#define PIN_LCD_RST 4
#endif
#ifndef PIN_LCD_BL
#define PIN_LCD_BL 5  // Note: GPIO 21 is EMAC_TX_EN on Olimex ESP32-PoE2
#endif

// Waveshare CST816T Capacitive Touch (I2C)
#ifndef PIN_TOUCH_SDA
#define PIN_TOUCH_SDA 33
#endif
#ifndef PIN_TOUCH_SCL
#define PIN_TOUCH_SCL 32
#endif
#ifndef PIN_TOUCH_INT
#define PIN_TOUCH_INT 34
#endif
#ifndef PIN_TOUCH_RST
#define PIN_TOUCH_RST 4  // Shared with PIN_LCD_RST (or set -1 if wired to ESP_EN)
#endif
#ifndef CST816T_I2C_ADDR
#define CST816T_I2C_ADDR 0x15
#endif

// Olimex LiPo Battery Monitoring ADC (ADC1_CH7)
#ifndef PIN_BATTERY_ADC
#define PIN_BATTERY_ADC 35
#endif
#ifndef BATTERY_DIVIDER
#define BATTERY_DIVIDER 2.0f
#endif
#define BATTERY_FULL_V    4.20f
#define BATTERY_NOMINAL_V 3.70f
#define BATTERY_LOW_V     3.40f
#define BATTERY_EMPTY_V   3.20f

#include <ETH.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>

// Compatibility typedef: Ensures AsyncWebServerRequestPtr is defined for MycilaESPConnect
#ifndef AsyncWebServerRequestPtr
typedef AsyncWebServerRequest* AsyncWebServerRequestPtr;
#endif

#include <MycilaESPConnect.h>
#include <WebSocketsClient.h>
#include <SocketIOclient.h>
#include <Arduino_JSON.h>
#include <Preferences.h>
#include <WiFiUdp.h>
#include <ESPmDNS.h>
#include <ArduinoOTA.h>
#include <time.h>
#include <esp_bt.h>
#include <esp_wifi.h>

// ==========================================
// LovyanGFX Display Driver (Waveshare 1.69" ST7789V2)
// ==========================================
class LGFX : public lgfx::LGFX_Device {
  lgfx::Panel_ST7789 _panel_instance;
  lgfx::Bus_SPI      _bus_instance;
  lgfx::Light_PWM    _light_instance;

public:
  LGFX(void) {
    {
      auto cfg = _bus_instance.config();
      cfg.spi_host    = HSPI_HOST;
      cfg.spi_mode    = 0;
      cfg.freq_write  = 40000000;
      cfg.freq_read   = 16000000;
      cfg.spi_3wire   = false;
      cfg.use_lock    = true;
      cfg.dma_channel = SPI_DMA_CH_AUTO;
      cfg.pin_sclk    = PIN_LCD_SCLK;
      cfg.pin_mosi    = PIN_LCD_MOSI;
      cfg.pin_miso    = -1;
      cfg.pin_dc      = PIN_LCD_DC;
      _bus_instance.config(cfg);
      _panel_instance.setBus(&_bus_instance);
    }
    {
      auto cfg = _panel_instance.config();
      cfg.pin_cs           = PIN_LCD_CS;
      cfg.pin_rst          = PIN_LCD_RST;
      cfg.pin_busy         = -1;
      cfg.panel_width      = LCD_WIDTH;
      cfg.panel_height     = LCD_HEIGHT;
      cfg.memory_width     = 240;
      cfg.memory_height    = 320;
      cfg.offset_x         = 0;
      cfg.offset_y         = 20; // ST7789V2 240x280 vertical offset inside 240x320 GRAM
      cfg.offset_rotation  = 0;
      cfg.dummy_read_pixel = 8;
      cfg.dummy_read_bits  = 1;
      cfg.readable         = false;
      cfg.invert           = true;
      cfg.rgb_order        = true; // Waveshare 1.69" ST7789V2 IPS uses RGB subpixel order (fixes Red/Blue swap)
      cfg.dlen_16bit       = false;
      cfg.bus_shared       = false;
      _panel_instance.config(cfg);
    }
    {
      auto cfg = _light_instance.config();
      cfg.pin_bl      = PIN_LCD_BL;
      cfg.invert      = false;
      cfg.freq        = 12000;
      cfg.pwm_channel = 7;
      _light_instance.config(cfg);
      _panel_instance.setLight(&_light_instance);
    }
    setPanel(&_panel_instance);
  }
};

LGFX lcd;
LGFX_Sprite canvas(&lcd);
LGFX_Sprite headerCanvas(&lcd);
bool doubleBufferEnabled = false;
bool headerBufferEnabled = false;
uint8_t doubleBufferColorDepth = 0;

// Cached render state to prevent unnecessary full-screen erasures / 1 Hz flicker
bool screenHasRenderedOnce = false;
int lastRenderedScreen = -1;
uint16_t lastRenderedBgColor = 0xFFFF;
uint16_t lastRenderedTextColor = 0xFFFF;
String lastRenderedStatus = "";
String lastRenderedBatteryStatus = "";
bool lastRenderedBatteryPoE = false;
bool lastRenderedBatteryLow = false;

// ==========================================
// TSL 3.1 Definitions & Protocol Settings
// ==========================================
#define DISPLAY_ADDRESS 0x00
#define REDTALLY        0x02
#define GREENTALLY      0x01
#define FULLBRIGHT      0x30

WiFiUDP udp;
const int udpPort = 8910;

volatile bool ch1state = false;
volatile bool ch2state = false;
volatile bool ch3state = false;
volatile bool ch4state = false;

// NTP & Timezone Setup
const char* ntpServer1 = "0.pool.ntp.org";
const char* ntpServer2 = "time.nist.gov";
String timezone_name        = "Europe/London";
String posix_time_zone_info = "GMT0BST,M3.5.0/1,M10.5.0";
String custom_tz_posix      = "";

// Device & Network Variables
String listenerDeviceName = "Olimex-Tally-";
String mdnsdotlocalurl    = "Olimex-CueLX";

// User Config Variables (saved in NVS Preferences)
char tallyarbiter_host[40]    = "192.168.1.105";
char tallyarbiter_port[6]     = "4455";
char tallyarbiter_TSLport[6]  = "8910";

// Operating Modes (13 total)
String operatingMode    = "TP";
String pairingGroup     = "Studio-1";
String pairedTargetIP   = "";
String pairedTargetName = "";
bool presenterCueActive = false;

// ==========================================
// Olimex Battery Monitoring (GPIO 35 ADC1_CH7)
// ==========================================
struct BatteryInfo {
  float voltage;
  int percentage;
  String status;
  bool isCharging;
  bool isPoE;
  bool isLow;
  unsigned long lastSample;
};

BatteryInfo battery = {
  4.10f,
  92,
  "PoE Powered (Full)",
  false,
  true,
  false,
  0
};

// ==========================================
// CST816T Capacitive Touch State
// ==========================================
struct TouchState {
  bool isPressed;
  uint16_t x;
  uint16_t y;
  uint8_t gesture;
  unsigned long lastPressTime;
  unsigned long lastReleaseTime;
  unsigned long lastSeenTouchTime;
  uint8_t tapCount;
  unsigned long firstTapTime;
  unsigned long cooldownUntil;
  uint8_t releaseZeroCount;
  bool suppressUntilRelease;
  bool longPressHandled;
  bool emergencyResetHandled;
};

TouchState touch = {false, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, false, false, false};

// ETC CueSystem Settings
String cuesystem_host           = "192.168.1.100";
int    cuesystem_port           = 4000;
int    cuesystem_channel        = 1;
bool   cuesystem_standby_active = false;
bool   cuesystem_ack_active     = false;

// NMOS IS-07 Event & Tally Settings (SMPTE ST 2110)
bool   nmos_auto_discover   = true;
String nmos_registry_host   = "192.168.1.50";
int    nmos_registry_port   = 8235;
String nmos_source_id       = "urn:uuid:7c9e6679-7425-4094-8f92-d6c1b35b62b1";
String nmos_program_topic   = "tally/program";
String nmos_preview_topic   = "tally/preview";
String nmos_aux_topic       = "tally/aux";
bool   nmos_program_active  = false;
bool   nmos_preview_active  = false;
bool   nmos_aux_active      = false;
bool   nmos_is_on_air       = false;

// rtpMIDI / AppleMIDI Configuration & State
int    rtpmidi_port         = 5004;
int    rtpmidi_channel      = 1;
int    rtpmidi_trigger_type = 0; // 0=Note, 1=CC, 2=PC
int    rtpmidi_num_red       = 60;
int    rtpmidi_num_flash_red = 61;
int    rtpmidi_num_green     = 62;
int    rtpmidi_num_yellow    = 63;
int    rtpmidi_num_blue      = 64;
int    rtpmidi_num_white     = 65;
bool   midi_active_red       = false;
bool   midi_active_flash_red = false;
bool   midi_active_green     = false;
bool   midi_active_yellow    = false;
bool   midi_active_blue      = false;
bool   midi_active_white     = false;

// OSC (Open Sound Control) Configuration & State
int    osc_port             = 8000;
String osc_prefix           = "/cuelight";
String osc_custom_message   = "";
bool   osc_active_red       = false;
bool   osc_active_flash_red = false;
bool   osc_active_green     = false;
bool   osc_active_yellow    = false;
bool   osc_active_blue      = false;
bool   osc_active_white     = false;

// TSL 3.1 Dedicated Listener Mode
int    tsl31_port           = 8910;
String tsl31_transport      = "UDP";
int    tsl31_address        = 0;
String tsl31_name           = "TSL 3.1 CUE";

// TSL 5.0 Dedicated Listener Mode
int    tsl50_port           = 8900;
String tsl50_transport      = "UDP";
int    tsl50_screen         = 0;
int    tsl50_index          = 0;
String tsl50_name           = "TSL 5.0 CUE";

// OSC Cue Light for iOS (RSMCK protocol)
int    osccue_port          = 53000;
String osccue_station_id    = "SL";
String osccue_banner        = "CUE LIGHT";
String osccue_message       = "";
String osccue_state         = "off";
bool   osccue_ack_done      = false;
IPAddress osccue_last_sender_ip = IPAddress(255, 255, 255, 255);
uint16_t osccue_last_sender_port = 53000;

// Promptside Theatrical Cue Light Outstation (promptside.co)
int    promptside_port          = 8000;
String promptside_channel       = "1";
String promptside_wing_label    = "STAGE LEFT";
String promptside_cue_text      = "";
String promptside_state         = "off";
bool   promptside_ack_done      = false;
IPAddress promptside_desk_ip    = IPAddress(255, 255, 255, 255);
uint16_t  promptside_desk_port  = 8000;

// MIDI Show Control (MSC) over rtpMIDI (RP-002)
int    msc_rtpmidi_port         = 5004;
int    msc_device_id            = 0x7F;
int    msc_cmd_format           = 0x7F;
String msc_target_cue           = "";
String msc_current_cue          = "";
String msc_last_command         = "STOP";
String msc_state                = "off";

// MTC (MIDI Time Code) Reader
bool   mtc_reader_enabled     = false;
String mtc_timecode_str       = "--:--:--:--";
uint8_t mtc_fps_type          = 1;
unsigned long lastMTCTime     = 0;
uint8_t mtc_qframe_pieces[8]  = {0};

// MIDI Mode Button Return Action
int    midi_btn_type          = 1; // 0=None, 1=Note Mom, 2=Note Tog, 3=CC Mom, 4=CC Tog, 5=PC
int    midi_btn_channel       = 1;
int    midi_btn_number        = 60;
int    midi_btn_val_press     = 127;
int    midi_btn_val_release   = 0;
bool   midi_btn_toggle_state  = false;

// P2P 0.25s Heartbeat & Fault Detection
unsigned long lastP2PPingSendTime = 0;
unsigned long lastP2PPeerRecvTime = 0;
int    p2p_missed_heartbeats      = 0;
bool   p2p_disconnected_state     = false;
uint32_t p2p_heartbeat_seq        = 0;

// External I2C Environment Sensor Support (SHT30 0x44 + BMP280 0x76 on shared I2C 33/32)
bool   env_sensor_enabled     = false;
bool   env_sensor_detected    = false;
float  env_temperature        = 0.0f;
float  env_humidity           = 0.0f;
float  env_pressure           = 0.0f;
unsigned long lastEnvReadTime = 0;

// Wi-Fi Precedence State
bool   wifiDisabledForEth     = false;

// TCP Server instance for TSL 3.1 & TSL 5.0 TCP modes
AsyncServer* tslTcpServer     = nullptr;

// Manual Display Orientation (0=0 deg, 1=90 deg, 2=180 deg, 3=270 deg)
uint8_t currentRotation       = 0;

// Network IP Configuration (DHCP vs Static IP)
bool   useDHCP                = true;
String static_ip              = "192.168.1.185";
String static_mask            = "255.255.255.0";
String static_gw              = "192.168.1.1";
String static_dns             = "192.168.1.1";

// Brightness levels (0-255 PWM scale)
const uint8_t brightnessLevels[] = { 64, 128, 192, 255 };
uint8_t brightnessIndex = 2;

// Power & Thermal Management Variables
int           cpu_freq_mhz            = 80;    // 80 (Eco), 160 (Balanced), 240 (Max)
int           screen_dim_timeout_sec  = 60;    // 0 = Disabled, 30, 60, 180
bool          screen_dimmed           = false;
unsigned long last_user_or_tally_act  = 0;

// Screen navigation: 0 = Main Tally/Cue Screen, 1 = Diagnostics Screen
int currentScreen = 0;
bool networkConnected = false;

// Tally Arbiter State Variables
SocketIOclient socket;
JSONVar BusOptions;
JSONVar Devices;
JSONVar DeviceStates;
String DeviceId   = "unassigned";
String DeviceName = "CAM 1 PRES";
String LastMessage = "";

String actualType     = "";
String actualColor    = "";
int actualPriority    = 0;

Preferences preferences;

// Web Server & MycilaESPConnect Instance
AsyncWebServer server(80);
Mycila::ESPConnect espConnect(server);

// Multi-Core & Thread-Safety Variables (FreeRTOS)
volatile bool tallyStateChanged = false;
volatile bool flashRequested = false;
TaskHandle_t socketTaskHandle = NULL;

// Forward Declarations
void initBatteryADC();
void readBatteryState();
void initCST816TTouch();
void processTouchEvents();
void handleScreenSingleTap();
void handleScreenDoubleTap();
void handleScreenLongPress();
void initDoubleBuffer();
void applyPowerManagementConfig();
void wakeDisplayFromDim();
void socketTask(void *pvParameters);
void sendtally(int channel, bool live);
void sendCueAck();
void sendNMOSTally(bool live);
void sendP2PPing();
void sendP2PPong(uint32_t seq);
void handleP2PHeartbeatCheck();
void sendMidiButtonAction(bool pressed);
void readEnvSensor();
void processIncomingTSL();
void processRTPMidiPacket(uint8_t* buf, int len, IPAddress remoteIP, uint16_t remotePort);
void processOSCPacket(uint8_t* buf, int len);
void processTSL31Packet(uint8_t* buf, int len);
void processTSL50Packet(uint8_t* buf, int len);
void processOSCCueLightPacket(uint8_t* buf, int len, IPAddress remoteIP, uint16_t remotePort);
void sendOSCCueLightState(String stateName);
void processPromptsidePacket(uint8_t* buf, int len, IPAddress remoteIP, uint16_t remotePort);
void sendPromptsideAck();
void processMSCRTPMidiPacket(uint8_t* buf, int len, IPAddress remoteIP, uint16_t remotePort);
void applyTimezoneConfig();
void discoverNMOSRegistrationServer();
void checkEthernetWifiPrecedence();
void setupTSLTcpServer(uint16_t port);
void evaluateRTPMidiState();
void evaluateOSCState();
void evaluateMode();
void showSettings();
void showDeviceInfo();
void renderScreen();
void renderClockTick();
void updateBrightness();
void connectToServer();
void disconnectFromServer();
void applyNetworkIPConfig();
void socket_event(socketIOmessageType_t type, uint8_t *payload, size_t length);
void socket_Connected(const char *payload, size_t length);
void socket_Flash();
void socket_Reassign(String payload);
void socket_Messaging(String payload);
void processTallyData();
void SetDeviceName();
String getBusTypeById(String busId);
String getBusColorById(String busId);
int getBusPriorityById(String busId);
void ws_emit(String event, const char *payload = NULL);
void setupWebServer();
void logger(String strLog, String strType = "info");

// ==========================================
// Mode Helper Functions
// ==========================================
bool isP2PMode()         { return operatingMode == "Presenter_P2P" || operatingMode == "TP_P2P"; }
bool isPresenter()       { return operatingMode == "Presenter" || operatingMode == "Presenter_P2P"; }
bool isTP()              { return operatingMode == "TP" || operatingMode == "TP_P2P"; }
bool isETCCueSystem()    { return operatingMode == "ETC_CueSystem"; }
bool isNMOSIS07()        { return operatingMode == "NMOS_IS07"; }
bool isRTPMidi()         { return operatingMode == "RTP_MIDI"; }
bool isOSC()             { return operatingMode == "OSC"; }
bool isTSL31Listener()   { return operatingMode == "TSL_31"; }
bool isTSL50Listener()   { return operatingMode == "TSL_50"; }
bool isOSCCueLight()     { return operatingMode == "OSC_CueLight"; }
bool isPromptside()      { return operatingMode == "Promptside"; }
bool isMSCRTPMidi()      { return operatingMode == "MSC_RTP_MIDI"; }
bool usesTallyArbiter()  { return operatingMode == "TP" || operatingMode == "Presenter"; }

uint16_t getActiveListenPort() {
  if (isETCCueSystem())  return (uint16_t)cuesystem_port;
  if (isRTPMidi())       return (uint16_t)rtpmidi_port;
  if (isMSCRTPMidi())    return (uint16_t)msc_rtpmidi_port;
  if (isPromptside())    return (uint16_t)promptside_port;
  if (isOSC())           return (uint16_t)osc_port;
  if (isTSL31Listener()) return (uint16_t)tsl31_port;
  if (isTSL50Listener()) return (uint16_t)tsl50_port;
  if (isOSCCueLight())   return (uint16_t)osccue_port;
  return (uint16_t)atoi(tallyarbiter_TSLport);
}

// ==========================================
// Battery ADC Sensing & Power Diagnostics
// ==========================================
void initBatteryADC() {
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  pinMode(PIN_BATTERY_ADC, INPUT);
  readBatteryState();
}

void readBatteryState() {
  if (millis() - battery.lastSample < 1000 && battery.lastSample != 0) return;
  battery.lastSample = millis();

  uint32_t adcRawSum = 0;
  for (int i = 0; i < 16; i++) {
    adcRawSum += analogRead(PIN_BATTERY_ADC);
    delayMicroseconds(50);
  }
  float adcRaw = adcRawSum / 16.0f;
  float pinVoltage = (adcRaw / 4095.0f) * 3.30f * 1.05f;
  float measuredV = pinVoltage * BATTERY_DIVIDER;

  battery.voltage = measuredV;
  battery.isPoE = (ETH.linkUp() && ETH.localIP() != IPAddress(0, 0, 0, 0));

  if (measuredV >= BATTERY_FULL_V) {
    battery.percentage = 100;
  } else if (measuredV <= BATTERY_EMPTY_V) {
    battery.percentage = 0;
  } else if (measuredV > 3.90f) {
    battery.percentage = 70 + (int)((measuredV - 3.90f) / (4.20f - 3.90f) * 30.0f);
  } else if (measuredV > 3.70f) {
    battery.percentage = 30 + (int)((measuredV - 3.70f) / (3.90f - 3.70f) * 40.0f);
  } else if (measuredV > 3.40f) {
    battery.percentage = 10 + (int)((measuredV - 3.40f) / (3.70f - 3.40f) * 20.0f);
  } else {
    battery.percentage = (int)((measuredV - 3.20f) / (3.40f - 3.20f) * 10.0f);
  }

  battery.percentage = constrain(battery.percentage, 0, 100);
  battery.isLow = (battery.voltage < BATTERY_LOW_V);

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
    battery.status = battery.isLow ? "LOW BATTERY ALERT!" : "LiPo Discharging";
  }
}

// ==========================================
// CST816T Capacitive Touch Driver (I2C GPIO 33/32)
// ==========================================
#define TOUCH_POLL_INTERVAL_MS      20
#define TOUCH_RELEASE_CONFIRM_POLLS 2    // Require 2 consecutive points==0 reads (~40ms) to ignore lift chatter
#define TOUCH_MIN_INTERTAP_GAP_MS   95   // Minimum ms after release before Tap 2 can start (blocks bounce)
#define TOUCH_DOUBLE_TAP_WINDOW_MS  420  // Max ms from Tap 1 release to Tap 2 press
#define TOUCH_COOLDOWN_MS           320  // Lockout after Double-Tap or Long-Press completes

void initCST816TTouch() {
  Wire.begin(PIN_TOUCH_SDA, PIN_TOUCH_SCL, 400000);
  pinMode(PIN_TOUCH_INT, INPUT);
  // Only pulse Touch RST separately if not sharing GPIO 4 with LCD_RST (lcd.init() already pulsed GPIO 4)
  if (PIN_TOUCH_RST >= 0 && PIN_TOUCH_RST != PIN_LCD_RST) {
    pinMode(PIN_TOUCH_RST, OUTPUT);
    digitalWrite(PIN_TOUCH_RST, LOW);
    delay(10);
    digitalWrite(PIN_TOUCH_RST, HIGH);
    delay(50);
  }

  // Probe CST816T Chip ID register (0xA7) for diagnostics
  uint8_t chipId = 0;
  Wire.beginTransmission(CST816T_I2C_ADDR);
  Wire.write(0xA7);
  if (Wire.endTransmission() == 0 && Wire.requestFrom((uint8_t)CST816T_I2C_ADDR, (size_t)1) == 1) {
    chipId = Wire.read();
  }

  logger(String("[TOUCH] CST816T Initialized SDA=") + PIN_TOUCH_SDA +
         " SCL=" + PIN_TOUCH_SCL + " INT=" + PIN_TOUCH_INT + " RST=" + PIN_TOUCH_RST +
         " ChipID=0x" + String(chipId, HEX), "info");
}

void processTouchEvents() {
  static unsigned long lastPollTime = 0;
  unsigned long now = millis();

  // Poll when INT is active LOW OR while a touch press is active (INT may pulse briefly)
  if (digitalRead(PIN_TOUCH_INT) == LOW || touch.isPressed) {
    if (now - lastPollTime >= TOUCH_POLL_INTERVAL_MS) {
      lastPollTime = now;
      bool readOk = false;
      uint8_t gesture = 0;
      uint8_t points = 0;
      uint16_t x = 0;
      uint16_t y = 0;

      Wire.beginTransmission(CST816T_I2C_ADDR);
      Wire.write(0x01);
      if (Wire.endTransmission() == 0) {
        if (Wire.requestFrom((uint8_t)CST816T_I2C_ADDR, (size_t)6) >= 6) {
          gesture       = Wire.read();
          points        = Wire.read();
          uint8_t xHigh = Wire.read();
          uint8_t xLow  = Wire.read();
          uint8_t yHigh = Wire.read();
          uint8_t yLow  = Wire.read();
          x = ((xHigh & 0x0F) << 8) | xLow;
          y = ((yHigh & 0x0F) << 8) | yLow;
          readOk = true;
        }
      }

      if (readOk) {
        bool fingerPresent = (points >= 1 && points <= 2);

        if (fingerPresent) {
          touch.releaseZeroCount = 0;
          touch.lastSeenTouchTime = now;

          if (!touch.isPressed) {
            // Ignore any touch during post-action cooldown
            if (now < touch.cooldownUntil) {
              return;
            }
            // Reject capacitive lift-off bounce (< 95ms after release) so a single tap never double-triggers
            if (touch.lastReleaseTime > 0 && (now - touch.lastReleaseTime) < TOUCH_MIN_INTERTAP_GAP_MS) {
              return;
            }

            // Second valid press inside double-tap window -> Double Tap!
            if (touch.tapCount == 1 && (now - touch.firstTapTime) <= TOUCH_DOUBLE_TAP_WINDOW_MS) {
              touch.tapCount = 0;
              touch.isPressed = true;
              touch.suppressUntilRelease = true;
              touch.longPressHandled = false;
              touch.emergencyResetHandled = false;
              touch.cooldownUntil = now + TOUCH_COOLDOWN_MS;
              handleScreenDoubleTap();
              return;
            }

            // Fresh first press
            touch.isPressed = true;
            touch.suppressUntilRelease = false;
            touch.lastPressTime = now;
            touch.x = x;
            touch.y = y;
            touch.gesture = gesture;
            touch.longPressHandled = false;
            touch.emergencyResetHandled = false;
            wakeDisplayFromDim();
          } else if (!touch.suppressUntilRelease) {
            unsigned long held = now - touch.lastPressTime;
            if (held > 7000 && !touch.emergencyResetHandled) {
              touch.emergencyResetHandled = true;
              touch.suppressUntilRelease = true;
              touch.tapCount = 0;
              touch.cooldownUntil = now + TOUCH_COOLDOWN_MS;
              logger("[Touch] Emergency Hold (>7s): Resetting & Rebooting...", "error");
              if (doubleBufferEnabled) {
                canvas.fillScreen(TFT_RED);
                canvas.setTextColor(TFT_WHITE, TFT_RED);
                canvas.setTextDatum(middle_center);
                canvas.setTextSize(2);
                canvas.drawString("RESETTING...", canvas.width() / 2, canvas.height() / 2);
                canvas.pushSprite(0, 0);
              } else {
                lcd.fillScreen(TFT_RED);
              }
              delay(1000);
              ESP.restart();
            } else if (held > 1200 && !touch.longPressHandled) {
              touch.longPressHandled = true;
              touch.suppressUntilRelease = true;
              touch.tapCount = 0;
              touch.cooldownUntil = now + TOUCH_COOLDOWN_MS;
              handleScreenLongPress();
            }
          }
        } else if (touch.isPressed) {
          // points == 0: Require sustained release to filter capacitive contact chatter
          touch.releaseZeroCount++;
          if (touch.releaseZeroCount >= TOUCH_RELEASE_CONFIRM_POLLS) {
            touch.isPressed = false;
            touch.releaseZeroCount = 0;
            touch.lastReleaseTime = now;

            if (touch.suppressUntilRelease || touch.longPressHandled || touch.emergencyResetHandled) {
              touch.suppressUntilRelease = false;
              touch.cooldownUntil = now + TOUCH_COOLDOWN_MS;
              return;
            }

            touch.tapCount = 1;
            touch.firstTapTime = now;
          }
        }
      } else if (touch.isPressed && digitalRead(PIN_TOUCH_INT) == HIGH && (now - touch.lastSeenTouchTime >= 60)) {
        // I2C safety timeout release if INT returned HIGH
        touch.isPressed = false;
        touch.releaseZeroCount = 0;
        touch.lastReleaseTime = now;
        if (touch.suppressUntilRelease || touch.longPressHandled || touch.emergencyResetHandled) {
          touch.suppressUntilRelease = false;
          touch.cooldownUntil = now + TOUCH_COOLDOWN_MS;
        } else {
          touch.tapCount = 1;
          touch.firstTapTime = now;
        }
      }
    }
  }

  // Commit Single Tap once double-tap window elapses cleanly after finger lift
  if (touch.tapCount == 1 && !touch.isPressed && (now - touch.firstTapTime >= TOUCH_DOUBLE_TAP_WINDOW_MS)) {
    touch.tapCount = 0;
    handleScreenSingleTap();
  }
}

// Single Tap: Exact mode-aware equivalent of physical button click
void handleScreenSingleTap() {
  wakeDisplayFromDim();
  if (isPromptside()) {
    logger(String("[Touch] Single Tap -> Promptside ACK for CH ") + promptside_channel, "info");
    promptside_ack_done = true;
    if (networkConnected) sendPromptsideAck();
    renderScreen();
  } else if (isETCCueSystem()) {
    logger(String("[Touch] Single Tap -> ETC CueSystem ACK for CH ") + String(cuesystem_channel), "info");
    cuesystem_ack_active = true;
    if (networkConnected) sendCueAck();
    renderScreen();
  } else if (isOSCCueLight()) {
    logger(String("[Touch] Single Tap -> OSC Cue Light ACK for station ") + osccue_station_id, "info");
    osccue_ack_done = true;
    if (networkConnected) sendOSCCueLightState("ack");
    renderScreen();
  } else if (isNMOSIS07()) {
    logger("[Touch] Single Tap -> NMOS IS-07 Tally toggle", "info");
    nmos_program_active = !nmos_program_active;
    if (nmos_program_active) {
      actualType = "\"program\"";
      actualColor = "#FF0000";
    } else {
      actualType = "";
      actualColor = "";
    }
    if (networkConnected) sendNMOSTally(nmos_program_active);
    renderScreen();
  } else if (isRTPMidi() || isMSCRTPMidi()) {
    logger("[Touch] Single Tap -> MIDI button return action", "info");
    sendMidiButtonAction(true);
    delay(40);
    sendMidiButtonAction(false);
    renderScreen();
  } else if (isOSC()) {
    logger("[Touch] Single Tap -> OSC Red test toggle", "info");
    osc_active_red = !osc_active_red;
    evaluateOSCState();
    renderScreen();
  } else if (isTSL31Listener() || isTSL50Listener()) {
    logger("[Touch] Single Tap -> TSL Listener diagnostics toggle", "info");
    currentScreen = (currentScreen == 0) ? 1 : 0;
    renderScreen();
  } else {
    logger(String("[Touch] Single Tap -> Toggle Cue CH1 (") + (isPresenter() ? "Presenter Preview" : "TP Program") + ")", "info");
    ch1state = !ch1state;
    if (networkConnected) sendtally(1, ch1state);
    renderScreen();
  }
}

// Double Tap: Switches between Screen 0 (Tally/Cue) and Screen 1 (Diagnostics)
void handleScreenDoubleTap() {
  wakeDisplayFromDim();
  currentScreen = (currentScreen == 0) ? 1 : 0;
  logger(String("[Touch] Double Tap -> Switched to Screen ") + String(currentScreen) + (currentScreen == 0 ? " (Main Tally/Cue)" : " (Diagnostics)"), "info");
  renderScreen();
}

// Long Press: Adjust backlight brightness
void handleScreenLongPress() {
  updateBrightness();
}

// ==========================================
// Display Double Buffer Helper (16-bit PSRAM -> 8-bit SRAM + 17KB Header Sprite)
// ==========================================
void initDoubleBuffer() {
  canvas.deleteSprite();
  headerCanvas.deleteSprite();
  doubleBufferEnabled = false;
  headerBufferEnabled = false;
  doubleBufferColorDepth = 0;
  screenHasRenderedOnce = false;

  int w = lcd.width();
  int h = lcd.height();

  // Tier 1: Full 16-bit sprite (uses PSRAM on WROVER when enabled, or SRAM if contiguous block available)
  canvas.setPsram(psramFound());
  canvas.setColorDepth(16);
  if (canvas.createSprite(w, h) != nullptr) {
    doubleBufferEnabled = true;
    doubleBufferColorDepth = 16;
    logger(String("[Display] 16-bit Double buffer allocated (") + String(w) + "x" + String(h) + " = " + String((w * h * 2) / 1024) + " KB).", "info");
  } else {
    // Tier 2: 8-bit RGB332 full-frame sprite (~67.2 KB fits cleanly in ESP32 internal SRAM without PSRAM)
    canvas.setPsram(false);
    canvas.setColorDepth(8);
    if (canvas.createSprite(w, h) != nullptr) {
      doubleBufferEnabled = true;
      doubleBufferColorDepth = 8;
      logger(String("[Display] 8-bit Double buffer allocated in SRAM (") + String(w) + "x" + String(h) + " = " + String((w * h) / 1024) + " KB).", "info");
    } else {
      logger("[Display] WARNING: Full double buffer failed; using partial header sprite + direct rendering.", "error");
    }
  }

  // Lightweight 16-bit top-banner sprite (~17 KB) for flicker-free 1 Hz clock & battery updates
  headerCanvas.setPsram(false);
  headerCanvas.setColorDepth(16);
  if (headerCanvas.createSprite(w - 16, 38) != nullptr) {
    headerBufferEnabled = true;
  }
}

// ==========================================
// Network Helper Utilities & IP Configuration
// ==========================================
void applyNetworkIPConfig() {
  if (!useDHCP && static_ip.length() > 0 && static_mask.length() > 0 && static_gw.length() > 0) {
    IPAddress ip, mask, gw, dns;
    if (ip.fromString(static_ip) && mask.fromString(static_mask) && gw.fromString(static_gw)) {
      if (!dns.fromString(static_dns)) dns = gw;
      logger(String("[Network] Static IP: ") + static_ip + " Mask: " + static_mask + " GW: " + static_gw, "info");
      ETH.config(ip, gw, mask, dns);
      WiFi.config(ip, gw, mask, dns);
      return;
    }
  }
  logger("[Network] DHCP IP assignment configured", "info");
  ETH.config(IPAddress(0, 0, 0, 0), IPAddress(0, 0, 0, 0), IPAddress(0, 0, 0, 0));
}

bool isEthernetActive() {
  return ETH.linkUp() && ETH.localIP() != IPAddress(0, 0, 0, 0);
}

void applyTimezoneConfig() {
  if (timezone_name == "Europe/London") {
    posix_time_zone_info = "GMT0BST,M3.5.0/1,M10.5.0";
  } else if (timezone_name == "UTC") {
    posix_time_zone_info = "UTC0";
  } else if (timezone_name == "Europe/Paris" || timezone_name == "Europe/Berlin" || timezone_name == "Europe/Rome" || timezone_name == "Europe/Madrid") {
    posix_time_zone_info = "CET-1CEST,M3.5.0,M10.5.0/3";
  } else if (timezone_name == "America/New_York") {
    posix_time_zone_info = "EST5EDT,M3.2.0,M11.1.0";
  } else if (timezone_name == "America/Chicago") {
    posix_time_zone_info = "CST6CDT,M3.2.0,M11.1.0";
  } else if (timezone_name == "America/Denver") {
    posix_time_zone_info = "MST7MDT,M3.2.0,M11.1.0";
  } else if (timezone_name == "America/Los_Angeles") {
    posix_time_zone_info = "PST8PDT,M3.2.0,M11.1.0";
  } else if (timezone_name == "Asia/Tokyo") {
    posix_time_zone_info = "JST-9";
  } else if (timezone_name == "Australia/Sydney") {
    posix_time_zone_info = "AEST-10AEDT,M10.1.0,M4.1.0/3";
  } else if (timezone_name == "Custom" && custom_tz_posix.length() > 0) {
    posix_time_zone_info = custom_tz_posix;
  } else {
    posix_time_zone_info = "GMT0BST,M3.5.0/1,M10.5.0";
  }
  configTzTime(posix_time_zone_info.c_str(), ntpServer1, ntpServer2);
  logger(String("[Time] Timezone applied: ") + timezone_name + " (" + posix_time_zone_info + ")", "info");
}

// Send User-Configured MIDI Message on Touch Button Action
void sendMidiButtonAction(bool pressed) {
  if (!networkConnected || midi_btn_type == 0) return;

  uint8_t ch = (midi_btn_channel >= 1 && midi_btn_channel <= 16) ? (midi_btn_channel - 1) : 0;
  uint8_t packet[8];
  int pLen = 0;

  if (midi_btn_type == 1) {
    packet[0] = pressed ? (0x90 | ch) : (0x80 | ch);
    packet[1] = midi_btn_number & 0x7F;
    packet[2] = pressed ? (midi_btn_val_press & 0x7F) : (midi_btn_val_release & 0x7F);
    pLen = 3;
  } else if (midi_btn_type == 2 && pressed) {
    midi_btn_toggle_state = !midi_btn_toggle_state;
    packet[0] = midi_btn_toggle_state ? (0x90 | ch) : (0x80 | ch);
    packet[1] = midi_btn_number & 0x7F;
    packet[2] = midi_btn_toggle_state ? (midi_btn_val_press & 0x7F) : (midi_btn_val_release & 0x7F);
    pLen = 3;
  } else if (midi_btn_type == 3) {
    packet[0] = 0xB0 | ch;
    packet[1] = midi_btn_number & 0x7F;
    packet[2] = pressed ? (midi_btn_val_press & 0x7F) : (midi_btn_val_release & 0x7F);
    pLen = 3;
  } else if (midi_btn_type == 4 && pressed) {
    midi_btn_toggle_state = !midi_btn_toggle_state;
    packet[0] = 0xB0 | ch;
    packet[1] = midi_btn_number & 0x7F;
    packet[2] = midi_btn_toggle_state ? (midi_btn_val_press & 0x7F) : (midi_btn_val_release & 0x7F);
    pLen = 3;
  } else if (midi_btn_type == 5 && pressed) {
    packet[0] = 0xC0 | ch;
    packet[1] = midi_btn_number & 0x7F;
    pLen = 2;
  }

  if (pLen > 0) {
    IPAddress targetIP(255, 255, 255, 255);
    if (pairedTargetIP.length() > 0 && pairedTargetIP != "0.0.0.0") {
      targetIP.fromString(pairedTargetIP);
    }
    uint16_t destPort = isMSCRTPMidi() ? (uint16_t)msc_rtpmidi_port : (uint16_t)rtpmidi_port;
    udp.beginPacket(targetIP, destPort);
    udp.write(packet, pLen);
    udp.endPacket();
    logger(String("[rtpMIDI] Sent Button Action: Type=") + String(midi_btn_type) + " Num=" + String(midi_btn_number), "info");
  }
}

// ==========================================
// P2P 0.25s (250ms) Heartbeat & 4-Missed Fault Detection
// ==========================================
void sendP2PPing() {
  if (!networkConnected || !isP2PMode()) return;
  p2p_heartbeat_seq++;
  String pingStr = "CXPING," + pairingGroup + "," + String(p2p_heartbeat_seq) + "," + listenerDeviceName + "\n";
  IPAddress targetIP(255, 255, 255, 255);
  if (pairedTargetIP.length() > 0 && pairedTargetIP != "0.0.0.0") {
    targetIP.fromString(pairedTargetIP);
  }
  udp.beginPacket(targetIP, atoi(tallyarbiter_TSLport));
  udp.write((const uint8_t*)pingStr.c_str(), pingStr.length());
  udp.endPacket();
}

void sendP2PPong(uint32_t seq) {
  if (!networkConnected || !isP2PMode()) return;
  String pongStr = "CXPONG," + pairingGroup + "," + String(seq) + "," + listenerDeviceName + "\n";
  IPAddress targetIP(255, 255, 255, 255);
  if (pairedTargetIP.length() > 0 && pairedTargetIP != "0.0.0.0") {
    targetIP.fromString(pairedTargetIP);
  }
  udp.beginPacket(targetIP, atoi(tallyarbiter_TSLport));
  udp.write((const uint8_t*)pongStr.c_str(), pongStr.length());
  udp.endPacket();
}

void handleP2PHeartbeatCheck() {
  if (!isP2PMode() || !networkConnected) return;

  unsigned long now = millis();
  if (now - lastP2PPingSendTime >= 250) {
    lastP2PPingSendTime = now;
    sendP2PPing();
  }

  if (lastP2PPeerRecvTime == 0) {
    if (now > 2500) lastP2PPeerRecvTime = now;
  } else {
    unsigned long elapsed = now - lastP2PPeerRecvTime;
    p2p_missed_heartbeats = elapsed / 250;
    if (p2p_missed_heartbeats > 4) {
      if (!p2p_disconnected_state) {
        p2p_disconnected_state = true;
        logger(String("[P2P] Fault Detected: >4 heartbeats missed (") + String(elapsed) + "ms). Peer lost!", "error");
        renderScreen();
      }
    } else if (p2p_disconnected_state) {
      p2p_disconnected_state = false;
      logger("[P2P] Peer connection re-established.", "info");
      renderScreen();
    }
  }
}

// ==========================================
// Optional External I2C ENV Sensor (SHT30 + BMP280 on shared SDA=33, SCL=32)
// ==========================================
void readEnvSensor() {
  if (!env_sensor_enabled) return;
  if (millis() - lastEnvReadTime < 2000) return;
  lastEnvReadTime = millis();

  // SHT30 on 0x44
  Wire.beginTransmission(0x44);
  Wire.write(0x2C);
  Wire.write(0x06);
  if (Wire.endTransmission() == 0) {
    env_sensor_detected = true;
    delay(15);
    Wire.requestFrom((uint8_t)0x44, (size_t)6);
    if (Wire.available() >= 6) {
      uint8_t data[6];
      for (int i = 0; i < 6; i++) data[i] = Wire.read();
      uint16_t rawT = (data[0] << 8) | data[1];
      uint16_t rawH = (data[3] << 8) | data[4];
      env_temperature = -45.0f + 175.0f * ((float)rawT / 65535.0f);
      env_humidity = 100.0f * ((float)rawH / 65535.0f);
    }
  }

  // BMP280 / QMP6988 on 0x76
  Wire.beginTransmission(0x76);
  if (Wire.endTransmission() == 0) {
    env_sensor_detected = true;
    Wire.beginTransmission(0x76);
    Wire.write(0xF7);
    Wire.endTransmission(false);
    Wire.requestFrom((uint8_t)0x76, (size_t)3);
    if (Wire.available() >= 3) {
      uint32_t pRaw = ((uint32_t)Wire.read() << 12) | ((uint32_t)Wire.read() << 4) | (Wire.read() >> 4);
      env_pressure = (float)pRaw / 256.0f;
      if (env_pressure < 800.0f || env_pressure > 1150.0f) env_pressure = 1013.25f;
    }
  } else if (env_pressure < 800.0f) {
    env_pressure = 1013.25f;
  }
}

String getNetworkModeStr() {
  if (isEthernetActive()) return "PoE Ethernet (LAN8720A)";
  if (WiFi.status() == WL_CONNECTED) return "Wi-Fi STA";
  return "Disconnected";
}

String getNetworkIPStr() {
  if (isEthernetActive()) return ETH.localIP().toString();
  if (WiFi.status() == WL_CONNECTED) return WiFi.localIP().toString();
  return "0.0.0.0";
}

// Disable Wi-Fi & Bluetooth when PoE Ethernet is active
void checkEthernetWifiPrecedence() {
  if (isEthernetActive()) {
    battery.isPoE = true;
    if (!wifiDisabledForEth) {
      wifiDisabledForEth = true;
      logger("[Network] PoE Ethernet active (" + ETH.localIP().toString() + "). Disabling Wi-Fi & Bluetooth.", "info");
      WiFi.disconnect(true);
      WiFi.mode(WIFI_OFF);
      esp_wifi_stop();
      if (esp_bt_controller_get_status() == ESP_BT_CONTROLLER_STATUS_ENABLED) {
        btStop();
        esp_bt_controller_disable();
      }
    }
  } else {
    battery.isPoE = false;
    if (wifiDisabledForEth) {
      wifiDisabledForEth = false;
      logger("[Network] PoE Ethernet disconnected. Re-enabling Wi-Fi fallback.", "info");
      esp_wifi_start();
      WiFi.mode(WIFI_STA);
      espConnect.begin(listenerDeviceName.c_str(), listenerDeviceName.c_str());
    }
  }
}

// Discover NMOS IS-04 registration server via DNS-SD (_nmos-registration._tcp)
void discoverNMOSRegistrationServer() {
  if (!nmos_auto_discover || !networkConnected) return;
  logger("[NMOS] Browsing DNS-SD for _nmos-registration._tcp...", "info");
  int n = MDNS.queryService("nmos-registration", "tcp");
  if (n == 0) n = MDNS.queryService("nmos-register", "tcp");
  if (n > 0) {
    nmos_registry_host = MDNS.address(0).toString();
    nmos_registry_port = MDNS.port(0);
    logger("[NMOS] Discovered IS-04 Registration Server: " + nmos_registry_host + ":" + String(nmos_registry_port), "info");
  } else {
    logger("[NMOS] No DNS-SD server found; using " + nmos_registry_host + ":" + String(nmos_registry_port), "info");
  }
}

// TCP Server initialization for TSL 3.1 & 5.0 TCP listeners
void setupTSLTcpServer(uint16_t port) {
  if (tslTcpServer != nullptr) {
    tslTcpServer->end();
    delete tslTcpServer;
    tslTcpServer = nullptr;
  }
  tslTcpServer = new AsyncServer(port);
  tslTcpServer->onClient([](void* arg, AsyncClient* client) {
    logger("[TCP] TSL Client connected: " + client->remoteIP().toString(), "info");
    client->onData([](void* arg, AsyncClient* c, void* data, size_t len) {
      uint8_t* p = (uint8_t*)data;
      if (isTSL31Listener()) processTSL31Packet(p, len);
      else if (isTSL50Listener()) processTSL50Packet(p, len);
    }, NULL);
  }, NULL);
  tslTcpServer->begin();
  logger("[TCP] TSL TCP Server started listening on port " + String(port), "info");
}

// ==========================================
// TSL 3.1 UDP Packet Sender
// ==========================================
void sendtally(int channel, bool live) {
  if (!networkConnected) return;

  byte channelname[16];
  String lbl = DeviceName;
  if (lbl.length() == 0 || lbl == "Unassigned") lbl = listenerDeviceName;
  while (lbl.length() < 16) lbl += " ";
  lbl = lbl.substring(0, 16);
  lbl.getBytes(channelname, 17);

  byte command[18];
  command[0] = (DISPLAY_ADDRESS + channel);
  if (isPresenter()) {
    // Presenter owns GREENTALLY (Preview 0x01); preserve REDTALLY if Program is currently active
    uint8_t flags = live ? GREENTALLY : 0;
    if (usesTallyArbiter() && actualType == "\"program\"") flags |= REDTALLY;
    command[1] = FULLBRIGHT + flags;
  } else {
    // TP owns REDTALLY (Program 0x02); activating Program clears Preview unless off
    command[1] = live ? (FULLBRIGHT + REDTALLY) : FULLBRIGHT;
  }
  for (int i = 0; i < 16; i++) command[2 + i] = channelname[i];

  if (usesTallyArbiter()) {
    IPAddress targetIP;
    if (targetIP.fromString(tallyarbiter_host)) udp.beginPacket(targetIP, atoi(tallyarbiter_TSLport));
    else udp.beginPacket(tallyarbiter_host, atoi(tallyarbiter_TSLport));
  } else if (pairedTargetIP.length() > 0 && pairedTargetIP != "0.0.0.0") {
    IPAddress pIP;
    if (pIP.fromString(pairedTargetIP)) udp.beginPacket(pIP, atoi(tallyarbiter_TSLport));
    else udp.beginPacket(pairedTargetIP.c_str(), atoi(tallyarbiter_TSLport));
  } else {
    udp.beginPacket(IPAddress(255, 255, 255, 255), atoi(tallyarbiter_TSLport));
  }

  udp.write(command, 18);
  udp.endPacket();
  logger(String("[TSL] Sent CH ") + String(channel) + (live ? (isPresenter() ? " PREVIEW" : " PROGRAM") : " OFF"), "info-quiet");
}

// ==========================================
// ETC CueSystem Acknowledge Packet Sender
// ==========================================
void sendCueAck() {
  if (!networkConnected) return;
  cuesystem_ack_active = true;
  String ackMsg = String("CS,") + String(cuesystem_channel) + ",ACK\n";
  IPAddress cueIP;
  if (cueIP.fromString(cuesystem_host)) udp.beginPacket(cueIP, cuesystem_port);
  else udp.beginPacket(cuesystem_host.c_str(), cuesystem_port);
  udp.write((const uint8_t*)ackMsg.c_str(), ackMsg.length());
  udp.endPacket();
  logger(String("[ETC CueSystem] Sent ACK for CH ") + String(cuesystem_channel), "info");
  renderScreen();
}

// ==========================================
// NMOS IS-07 Event & Tally Sender
// ==========================================
void sendNMOSTally(bool live) {
  if (!networkConnected) return;
  nmos_is_on_air = live;
  JSONVar msg;
  msg["message_type"] = "state";
  msg["source_id"] = nmos_source_id;
  msg["topic"] = nmos_program_topic;
  msg["event_type"] = "boolean";
  msg["payload"]["value"] = live;
  String jsonStr = JSON.stringify(msg);

  IPAddress nmosIP;
  if (nmosIP.fromString(nmos_registry_host)) udp.beginPacket(nmosIP, nmos_registry_port);
  else udp.beginPacket(nmos_registry_host.c_str(), nmos_registry_port);
  udp.write((const uint8_t*)jsonStr.c_str(), jsonStr.length());
  udp.endPacket();
  logger(String("[NMOS IS-07] Emitted event on ") + nmos_program_topic + ": " + (live ? "TRUE" : "FALSE"), "info");
  renderScreen();
}

// ==========================================
// Incoming Packet Receiver (All Protocols)
// ==========================================
void processIncomingTSL() {
  int packetSize = udp.parsePacket();
  if (packetSize <= 0) return;

  byte packetBuffer[512];
  int len = udp.read(packetBuffer, sizeof(packetBuffer) - 1);
  if (len <= 0) return;
  packetBuffer[len] = '\0';

  // P2P Heartbeat Ping / Pong Packet Detection
  String p2pHeader = String((char*)packetBuffer);
  if (p2pHeader.startsWith("CXPING,")) {
    int c1 = p2pHeader.indexOf(',');
    int c2 = p2pHeader.indexOf(',', c1 + 1);
    int c3 = p2pHeader.indexOf(',', c2 + 1);
    if (c1 > 0 && c2 > 0 && p2pHeader.substring(c1 + 1, c2) == pairingGroup) {
      uint32_t seq = p2pHeader.substring(c2 + 1, c3 > 0 ? c3 : p2pHeader.length()).toInt();
      lastP2PPeerRecvTime = millis();
      p2p_disconnected_state = false;
      p2p_missed_heartbeats = 0;
      sendP2PPong(seq);
      return;
    }
  } else if (p2pHeader.startsWith("CXPONG,")) {
    int c1 = p2pHeader.indexOf(',');
    int c2 = p2pHeader.indexOf(',', c1 + 1);
    if (c1 > 0 && c2 > 0 && p2pHeader.substring(c1 + 1, c2) == pairingGroup) {
      lastP2PPeerRecvTime = millis();
      p2p_disconnected_state = false;
      p2p_missed_heartbeats = 0;
      return;
    }
  }

  if (isTSL31Listener() && tsl31_transport == "UDP") {
    processTSL31Packet(packetBuffer, len);
    return;
  }
  if (isTSL50Listener() && tsl50_transport == "UDP") {
    processTSL50Packet(packetBuffer, len);
    return;
  }
  if (isOSCCueLight()) {
    processOSCCueLightPacket(packetBuffer, len, udp.remoteIP(), udp.remotePort());
    return;
  }
  if (isPromptside()) {
    processPromptsidePacket(packetBuffer, len, udp.remoteIP(), udp.remotePort());
    return;
  }
  if (isMSCRTPMidi()) {
    processMSCRTPMidiPacket(packetBuffer, len, udp.remoteIP(), udp.remotePort());
    return;
  }
  if (isRTPMidi()) {
    processRTPMidiPacket(packetBuffer, len, udp.remoteIP(), udp.remotePort());
    return;
  }
  if (isOSC()) {
    processOSCPacket(packetBuffer, len);
    return;
  }

  // ETC CueSystem Mode (CS,<ch>,<CMD> or CUE:<ch>:<CMD>)
  if (isETCCueSystem()) {
    String msg = String((char*)packetBuffer);
    msg.trim();
    if (msg.startsWith("CS,") || msg.startsWith("CUE:")) {
      char delimiter = msg.startsWith("CS,") ? ',' : ':';
      int firstDelim = msg.indexOf(delimiter);
      int secondDelim = msg.indexOf(delimiter, firstDelim + 1);
      if (firstDelim > 0 && secondDelim > 0) {
        int ch = msg.substring(firstDelim + 1, secondDelim).toInt();
        String stateCmd = msg.substring(secondDelim + 1);
        stateCmd.toUpperCase();
        if (ch == cuesystem_channel || ch == 0) {
          if (stateCmd == "STANDBY") {
            cuesystem_standby_active = true;
            cuesystem_ack_active = false;
            actualType = "\"standby\"";
            actualColor = "#FF0000";
          } else if (stateCmd == "ACK") {
            cuesystem_standby_active = true;
            cuesystem_ack_active = true;
            actualType = "\"standby\"";
            actualColor = "#FF0000";
          } else if (stateCmd == "GO") {
            cuesystem_standby_active = false;
            cuesystem_ack_active = false;
            actualType = "\"program\"";
            actualColor = "#00FF00";
          } else if (stateCmd == "OFF") {
            cuesystem_standby_active = false;
            cuesystem_ack_active = false;
            actualType = "";
            actualColor = "";
          }
          renderScreen();
          return;
        }
      }
    }
  }

  // NMOS IS-07 Event & Tally Mode (JSON payload)
  if (isNMOSIS07() && packetBuffer[0] == '{') {
    JSONVar obj = JSON.parse((char*)packetBuffer);
    String topic = "";
    if (obj.hasOwnProperty("topic")) topic = (const char*)obj["topic"];
    else if (obj.hasOwnProperty("event_type")) topic = (const char*)obj["event_type"];
    else if (obj.hasOwnProperty("source_id")) topic = (const char*)obj["source_id"];

    bool val = false;
    if (obj.hasOwnProperty("payload") && obj["payload"].hasOwnProperty("value")) {
      val = (bool)obj["payload"]["value"];
    }

    if (topic == nmos_program_topic || topic.endsWith("program") || topic.indexOf("prg") >= 0) nmos_program_active = val;
    else if (topic == nmos_preview_topic || topic.endsWith("preview") || topic.indexOf("pvw") >= 0) nmos_preview_active = val;
    else if (topic == nmos_aux_topic || topic.endsWith("aux")) nmos_aux_active = val;
    else nmos_program_active = val;

    if (nmos_program_active) {
      actualType = "\"program\""; actualColor = "#FF0000"; nmos_is_on_air = true;
    } else if (nmos_preview_active) {
      actualType = "\"preview\""; actualColor = "#00FF00"; nmos_is_on_air = false;
    } else if (nmos_aux_active) {
      actualType = "\"aux\""; actualColor = "#FFA500"; nmos_is_on_air = false;
    } else {
      actualType = ""; actualColor = ""; nmos_is_on_air = false;
    }
    renderScreen();
    return;
  }

  // Standard TSL 3.1 UDP packet (18 bytes) for P2P
  if (len >= 18) {
    byte ctrl = packetBuffer[1];
    bool redTally = (ctrl & REDTALLY) != 0;
    bool greenTally = (ctrl & GREENTALLY) != 0;

    char textBuf[17];
    memcpy(textBuf, packetBuffer + 2, 16);
    textBuf[16] = '\0';
    String senderName = String(textBuf);
    senderName.trim();

    if (isP2PMode()) {
      if (isPresenter()) {
        if (redTally) {
          actualType = "\"program\""; actualColor = "#FF0000";
        } else if (greenTally) {
          actualType = "\"preview\""; actualColor = "#00FF00";
        } else {
          actualType = ""; actualColor = "";
        }
        if (senderName.length() > 0 && (pairedTargetName.length() == 0 || pairedTargetName == "Unassigned")) {
          pairedTargetName = senderName;
        }
        renderScreen();
      } else if (isTP()) {
        presenterCueActive = greenTally;
        if (senderName.length() > 0 && (pairedTargetName.length() == 0 || pairedTargetName == "Unassigned")) {
          pairedTargetName = senderName;
        }
        renderScreen();
      }
    }
  }
}

// ==========================================
// rtpMIDI / AppleMIDI & MTC Timecode Parser
// ==========================================
void processRTPMidiPacket(uint8_t* buf, int len, IPAddress remoteIP, uint16_t remotePort) {
  if (len >= 4 && buf[0] == 0xFF && buf[1] == 0xFF) {
    if (buf[2] == 'I' && buf[3] == 'N') {
      uint8_t okResp[16];
      okResp[0] = 0xFF; okResp[1] = 0xFF;
      okResp[2] = 'O'; okResp[3] = 'K';
      memcpy(okResp + 4, buf + 4, 8);
      uint32_t localSSRC = 0x4F4C4D58; // "OLMX" SSRC
      memcpy(okResp + 12, &localSSRC, 4);
      udp.beginPacket(remoteIP, remotePort);
      udp.write(okResp, 16);
      udp.endPacket();
      logger(String("[rtpMIDI] AppleMIDI session accepted from ") + remoteIP.toString(), "info");
      return;
    } else if (buf[2] == 'C' && buf[3] == 'K') {
      udp.beginPacket(remoteIP, remotePort);
      udp.write(buf, len);
      udp.endPacket();
      return;
    }
  }

  int targetCh = (rtpmidi_channel == 0) ? -1 : (rtpmidi_channel - 1);

  for (int i = 0; i < len; i++) {
    uint8_t b = buf[i];
    if ((b & 0x80) != 0 && b < 0xF0) {
      uint8_t cmd = b & 0xF0;
      uint8_t ch = b & 0x0F;

      if (targetCh == -1 || ch == targetCh) {
        if (cmd == 0x90 && i + 2 < len) {
          int note = buf[i + 1];
          int vel  = buf[i + 2];
          bool on = (vel > 0);
          if (rtpmidi_trigger_type == 0) {
            if (note == rtpmidi_num_red)       midi_active_red = on;
            if (note == rtpmidi_num_flash_red) midi_active_flash_red = on;
            if (note == rtpmidi_num_green)     midi_active_green = on;
            if (note == rtpmidi_num_yellow)    midi_active_yellow = on;
            if (note == rtpmidi_num_blue)      midi_active_blue = on;
            if (note == rtpmidi_num_white)     midi_active_white = on;
          }
          i += 2;
        } else if (cmd == 0x80 && i + 2 < len) {
          int note = buf[i + 1];
          if (rtpmidi_trigger_type == 0) {
            if (note == rtpmidi_num_red)       midi_active_red = false;
            if (note == rtpmidi_num_flash_red) midi_active_flash_red = false;
            if (note == rtpmidi_num_green)     midi_active_green = false;
            if (note == rtpmidi_num_yellow)    midi_active_yellow = false;
            if (note == rtpmidi_num_blue)      midi_active_blue = false;
            if (note == rtpmidi_num_white)     midi_active_white = false;
          }
          i += 2;
        } else if (cmd == 0xB0 && i + 2 < len) {
          int ccNum = buf[i + 1];
          int ccVal = buf[i + 2];
          bool on = (ccVal >= 64);
          if (rtpmidi_trigger_type == 1) {
            if (ccNum == rtpmidi_num_red)       midi_active_red = on;
            if (ccNum == rtpmidi_num_flash_red) midi_active_flash_red = on;
            if (ccNum == rtpmidi_num_green)     midi_active_green = on;
            if (ccNum == rtpmidi_num_yellow)    midi_active_yellow = on;
            if (ccNum == rtpmidi_num_blue)      midi_active_blue = on;
            if (ccNum == rtpmidi_num_white)     midi_active_white = on;
          }
          i += 2;
        } else if (cmd == 0xC0 && i + 1 < len) {
          int pcNum = buf[i + 1];
          if (rtpmidi_trigger_type == 2) {
            midi_active_red       = (pcNum == rtpmidi_num_red);
            midi_active_flash_red = (pcNum == rtpmidi_num_flash_red);
            midi_active_green     = (pcNum == rtpmidi_num_green);
            midi_active_yellow    = (pcNum == rtpmidi_num_yellow);
            midi_active_blue      = (pcNum == rtpmidi_num_blue);
            midi_active_white     = (pcNum == rtpmidi_num_white);
          }
          i += 1;
        }
      }
    } else if (b == 0xF1 && i + 1 < len) {
      // MTC Quarter-Frame Parser
      uint8_t qData = buf[i + 1];
      uint8_t piece = (qData >> 4) & 0x07;
      uint8_t val = qData & 0x0F;
      mtc_qframe_pieces[piece] = val;
      if (piece == 7) {
        int frames  = mtc_qframe_pieces[0] | (mtc_qframe_pieces[1] << 4);
        int seconds = mtc_qframe_pieces[2] | (mtc_qframe_pieces[3] << 4);
        int minutes = mtc_qframe_pieces[4] | (mtc_qframe_pieces[5] << 4);
        int hours   = mtc_qframe_pieces[6] | ((mtc_qframe_pieces[7] & 0x01) << 4);
        mtc_fps_type = (mtc_qframe_pieces[7] >> 1) & 0x03;
        char tcBuf[16];
        snprintf(tcBuf, sizeof(tcBuf), "%02d:%02d:%02d:%02d", hours, minutes, seconds, frames);
        mtc_timecode_str = String(tcBuf);
        lastMTCTime = millis();
        if (mtc_reader_enabled && currentScreen == 0) renderClockTick();
      }
      i += 1;
    } else if (b == 0xF0 && i + 8 < len && buf[i+1] == 0x7F && buf[i+3] == 0x01 && buf[i+4] == 0x01) {
      // MTC Full-Frame SysEx Parser
      int hours   = buf[i+5] & 0x1F;
      mtc_fps_type = (buf[i+5] >> 5) & 0x03;
      int minutes = buf[i+6];
      int seconds = buf[i+7];
      int frames  = buf[i+8];
      char tcBuf[16];
      snprintf(tcBuf, sizeof(tcBuf), "%02d:%02d:%02d:%02d", hours, minutes, seconds, frames);
      mtc_timecode_str = String(tcBuf);
      lastMTCTime = millis();
      if (mtc_reader_enabled && currentScreen == 0) renderClockTick();
      i += 8;
    }
  }
  evaluateRTPMidiState();
}

void evaluateRTPMidiState() {
  if (midi_active_red)            { actualType = "\"program\"";  actualColor = "#FF0000"; }
  else if (midi_active_flash_red) { actualType = "\"flashred\""; actualColor = "#FF0000"; }
  else if (midi_active_green)     { actualType = "\"preview\"";  actualColor = "#00FF00"; }
  else if (midi_active_yellow)    { actualType = "\"yellow\"";   actualColor = "#FFFF00"; }
  else if (midi_active_blue)      { actualType = "\"blue\"";     actualColor = "#0088FF"; }
  else if (midi_active_white)     { actualType = "\"white\"";    actualColor = "#FFFFFF"; }
  else                            { actualType = "";             actualColor = ""; }
  renderScreen();
}

// ==========================================
// OSC (Open Sound Control) Parser
// ==========================================
void processOSCPacket(uint8_t* buf, int len) {
  if (len < 4) return;
  String addr = String((char*)buf);
  int addrLen = addr.length();
  int tagOffset = (addrLen + 4) & ~0x03;

  if (tagOffset < len && buf[tagOffset] == ',') {
    char typeTag = (char)buf[tagOffset + 1];
    int argOffset = tagOffset + 4;

    if (addr == osc_prefix + "/text" || addr == osc_prefix + "/message" || addr.endsWith("/text") || addr.endsWith("/message")) {
      if (typeTag == 's' && argOffset < len) {
        osc_custom_message = String((char*)(buf + argOffset));
        logger(String("[OSC] Custom message: ") + osc_custom_message, "info");
        renderScreen();
        return;
      }
    }

    float val = 0.0f;
    if (typeTag == 'f' && argOffset + 4 <= len) {
      uint32_t rawVal = ((uint32_t)buf[argOffset] << 24) | ((uint32_t)buf[argOffset+1] << 16) | ((uint32_t)buf[argOffset+2] << 8) | buf[argOffset+3];
      memcpy(&val, &rawVal, 4);
    } else if (typeTag == 'i' && argOffset + 4 <= len) {
      int32_t rawVal = ((int32_t)buf[argOffset] << 24) | ((int32_t)buf[argOffset+1] << 16) | ((int32_t)buf[argOffset+2] << 8) | buf[argOffset+3];
      val = (float)rawVal;
    } else if (typeTag == 'T') {
      val = 1.0f;
    } else if (typeTag == 'F') {
      val = 0.0f;
    }

    bool on = (val > 0.0f);
    if (addr == osc_prefix + "/red" || addr.endsWith("/red")) osc_active_red = on;
    else if (addr == osc_prefix + "/flashred" || addr.endsWith("/flashred") || addr.endsWith("/flash")) osc_active_flash_red = on;
    else if (addr == osc_prefix + "/green" || addr.endsWith("/green")) osc_active_green = on;
    else if (addr == osc_prefix + "/yellow" || addr.endsWith("/yellow")) osc_active_yellow = on;
    else if (addr == osc_prefix + "/blue" || addr.endsWith("/blue")) osc_active_blue = on;
    else if (addr == osc_prefix + "/white" || addr.endsWith("/white")) osc_active_white = on;

    evaluateOSCState();
  }
}

void evaluateOSCState() {
  if (osc_active_red)            { actualType = "\"program\"";  actualColor = "#FF0000"; }
  else if (osc_active_flash_red) { actualType = "\"flashred\""; actualColor = "#FF0000"; }
  else if (osc_active_green)     { actualType = "\"preview\"";  actualColor = "#00FF00"; }
  else if (osc_active_yellow)    { actualType = "\"yellow\"";   actualColor = "#FFFF00"; }
  else if (osc_active_blue)      { actualType = "\"blue\"";     actualColor = "#0088FF"; }
  else if (osc_active_white)     { actualType = "\"white\"";    actualColor = "#FFFFFF"; }
  else                           { actualType = "";             actualColor = ""; }
  renderScreen();
}

// ==========================================
// TSL 3.1 & TSL 5.0 Dedicated Listeners
// ==========================================
void processTSL31Packet(uint8_t* buf, int len) {
  if (len < 18) return;
  uint8_t addr = buf[0] & 0x7F;
  uint8_t ctrl = buf[1];

  if (tsl31_address == 0 || addr == tsl31_address) {
    char textBuf[17];
    memcpy(textBuf, buf + 2, 16);
    textBuf[16] = '\0';
    String lbl = String(textBuf);
    lbl.trim();
    if (lbl.length() > 0) tsl31_name = lbl;

    bool red = (ctrl & REDTALLY) != 0;
    bool green = (ctrl & GREENTALLY) != 0;
    if (red && green) { actualType = "\"aux\"";     actualColor = "#FFA500"; }
    else if (red)     { actualType = "\"program\""; actualColor = "#FF0000"; }
    else if (green)   { actualType = "\"preview\""; actualColor = "#00FF00"; }
    else              { actualType = "";            actualColor = ""; }
    renderScreen();
  }
}

void processTSL50Packet(uint8_t* buf, int len) {
  if (len < 12) return;
  uint16_t screen  = buf[4] | (buf[5] << 8);
  uint16_t index   = buf[6] | (buf[7] << 8);
  uint16_t ctrl    = buf[8] | (buf[9] << 8);
  uint16_t textLen = buf[10] | (buf[11] << 8);

  if ((tsl50_screen == 0 || screen == tsl50_screen) && (tsl50_index == 0 || index == tsl50_index)) {
    if (textLen > 0 && len >= 12 + textLen) {
      char tBuf[64];
      int copyLen = textLen < 63 ? textLen : 63;
      memcpy(tBuf, buf + 12, copyLen);
      tBuf[copyLen] = '\0';
      String lbl = String(tBuf);
      lbl.trim();
      if (lbl.length() > 0) tsl50_name = lbl;
    }

    uint8_t t1 = ctrl & 0x03;
    uint8_t t2 = (ctrl >> 2) & 0x03;
    uint8_t t3 = (ctrl >> 4) & 0x03;
    uint8_t t4 = (ctrl >> 6) & 0x03;

    if (t1 == 1)      { actualType = "\"program\""; actualColor = "#FF0000"; }
    else if (t2 == 1) { actualType = "\"preview\""; actualColor = "#00FF00"; }
    else if (t3 == 1) { actualType = "\"aux\"";     actualColor = "#FFA500"; }
    else if (t4 == 1) { actualType = "\"blue\"";    actualColor = "#0088FF"; }
    else              { actualType = "";            actualColor = ""; }
    renderScreen();
  }
}

// ==========================================
// OSC Cue Light for iOS (RSMCK Protocol)
// ==========================================
void processOSCCueLightPacket(uint8_t* buf, int len, IPAddress remoteIP, uint16_t remotePort) {
  osccue_last_sender_ip = remoteIP;
  osccue_last_sender_port = remotePort;

  String oscAddr = "";
  int idx = 0;
  while (idx < len && buf[idx] != 0) oscAddr += (char)buf[idx++];
  idx = (idx + 4) & ~0x03;

  String argString = "";
  if (idx < len && buf[idx] == ',') {
    String typeTags = "";
    while (idx < len && buf[idx] != 0) typeTags += (char)buf[idx++];
    idx = (idx + 4) & ~0x03;
    if (typeTags.indexOf('s') >= 0 && idx < len) {
      while (idx < len && buf[idx] != 0) argString += (char)buf[idx++];
    }
  }

  if (oscAddr.startsWith("/cuelight/")) {
    String sub = oscAddr.substring(10);
    int slashIdx = sub.indexOf('/');
    if (slashIdx > 0) {
      String station = sub.substring(0, slashIdx);
      String cmd = sub.substring(slashIdx + 1);
      cmd.toLowerCase();

      bool match = (station == "*" || station.equalsIgnoreCase(osccue_station_id) ||
                    (station.indexOf(osccue_station_id) >= 0));

      if (match) {
        if (cmd == "standby_ack") {
          osccue_state = "standby_ack";
          osccue_ack_done = false;
          if (argString.length() > 0) osccue_message = argString;
        } else if (cmd == "standby") {
          osccue_state = "standby";
          osccue_ack_done = true;
          if (argString.length() > 0) osccue_message = argString;
          sendOSCCueLightState("standby");
        } else if (cmd == "go") {
          osccue_state = "go";
          if (argString.length() > 0) osccue_message = argString;
          sendOSCCueLightState("go");
        } else if (cmd == "off") {
          osccue_state = "off";
          osccue_message = "";
          sendOSCCueLightState("off");
        } else if (cmd == "banner" && argString.length() > 0) {
          osccue_banner = argString;
        }
        renderScreen();
      }
    }
  }
}

void sendOSCCueLightState(String stateName) {
  if (!networkConnected) return;
  String addr = "/cuelight/state/" + osccue_station_id + "/" + stateName;
  int addrLen = addr.length();
  int pad = (4 - (addrLen % 4)) % 4;
  if (pad == 0) pad = 4;
  int totalLen = addrLen + pad + 4;
  uint8_t oscBuf[128];
  if (totalLen > (int)sizeof(oscBuf)) return;
  memset(oscBuf, 0, totalLen);
  memcpy(oscBuf, addr.c_str(), addrLen);
  oscBuf[addrLen + pad] = ',';

  udp.beginPacket(osccue_last_sender_ip, osccue_last_sender_port);
  udp.write(oscBuf, totalLen);
  udp.endPacket();
  logger("[OSC CueLight] Sent state reply: " + addr, "info");
}

// ==========================================
// Promptside Theatrical Cue Light Parser (promptside.co)
// ==========================================
void processPromptsidePacket(uint8_t* buf, int len, IPAddress remoteIP, uint16_t remotePort) {
  promptside_desk_ip = remoteIP;
  promptside_desk_port = remotePort;

  String oscAddr = "";
  int idx = 0;
  while (idx < len && buf[idx] != 0) oscAddr += (char)buf[idx++];
  idx = (idx + 4) & ~0x03;

  String argString = "";
  int argInt = 0;
  if (idx < len && buf[idx] == ',') {
    String typeTags = "";
    while (idx < len && buf[idx] != 0) typeTags += (char)buf[idx++];
    idx = (idx + 4) & ~0x03;
    if (typeTags.indexOf('s') >= 0 && idx < len) {
      while (idx < len && buf[idx] != 0) argString += (char)buf[idx++];
    } else if (typeTags.indexOf('i') >= 0 && idx + 4 <= len) {
      argInt = (int)((buf[idx] << 24) | (buf[idx+1] << 16) | (buf[idx+2] << 8) | buf[idx+3]);
    }
  }

  if (oscAddr.startsWith("/promptside")) {
    String sub = oscAddr.substring(11);
    if (sub.startsWith("/")) sub = sub.substring(1);

    String targetChan = promptside_channel;
    String cmd = "";
    if (sub.startsWith("channel/")) {
      String rest = sub.substring(8);
      int slash = rest.indexOf('/');
      if (slash > 0) { targetChan = rest.substring(0, slash); cmd = rest.substring(slash + 1); }
    } else {
      int slash = sub.indexOf('/');
      if (slash > 0) { targetChan = sub.substring(0, slash); cmd = sub.substring(slash + 1); }
      else cmd = sub;
    }
    cmd.toLowerCase();

    bool matchesChannel = (targetChan == "*" || targetChan.equalsIgnoreCase(promptside_channel) ||
                          targetChan == String(promptside_channel.toInt()) ||
                          (argString.length() > 0 && argString.equalsIgnoreCase(promptside_channel)) ||
                          (argInt > 0 && argInt == promptside_channel.toInt()));

    if (matchesChannel || cmd == "all_off" || cmd == "blackout") {
      if (cmd == "standby" || cmd == "standby_ack" || cmd == "warn") {
        promptside_state = "standby_ack";
        promptside_ack_done = false;
        if (argString.length() > 0) promptside_cue_text = argString;
      } else if (cmd == "ack" || cmd == "acknowledged") {
        promptside_state = "standby_ack";
        promptside_ack_done = true;
      } else if (cmd == "go") {
        promptside_state = "go";
        promptside_ack_done = false;
        if (argString.length() > 0) promptside_cue_text = argString;
      } else if (cmd == "off" || cmd == "all_off" || cmd == "clear" || cmd == "blackout") {
        promptside_state = "off";
        promptside_ack_done = false;
        promptside_cue_text = "";
      } else if ((cmd == "text" || cmd == "note") && argString.length() > 0) {
        promptside_cue_text = argString;
      }
      renderScreen();
    }
  }
}

void sendPromptsideAck() {
  if (!networkConnected) return;
  String addr = "/promptside/channel/" + promptside_channel + "/ack";
  int addrLen = addr.length();
  int pad = (4 - (addrLen % 4)) % 4;
  if (pad == 0) pad = 4;
  int totalLen = addrLen + pad + 8;
  uint8_t oscBuf[128];
  if (totalLen > (int)sizeof(oscBuf)) return;
  memset(oscBuf, 0, totalLen);
  memcpy(oscBuf, addr.c_str(), addrLen);
  oscBuf[addrLen + pad] = ',';
  oscBuf[addrLen + pad + 1] = 'i';
  oscBuf[addrLen + pad + 7] = 1;

  udp.beginPacket(promptside_desk_ip, promptside_desk_port);
  udp.write(oscBuf, totalLen);
  udp.endPacket();
  logger("[Promptside] Sent ACK response: " + addr, "info");
}

// ==========================================
// MIDI Show Control (MSC) over rtpMIDI Parser (RP-002)
// ==========================================
void processMSCRTPMidiPacket(uint8_t* buf, int len, IPAddress remoteIP, uint16_t remotePort) {
  if (len >= 4 && buf[0] == 0xFF && buf[1] == 0xFF) {
    if (buf[2] == 'I' && buf[3] == 'N') {
      uint8_t okResp[16];
      okResp[0] = 0xFF; okResp[1] = 0xFF;
      okResp[2] = 'O'; okResp[3] = 'K';
      memcpy(okResp + 4, buf + 4, 8);
      uint32_t localSSRC = 0x4D534331;
      memcpy(okResp + 12, &localSSRC, 4);
      udp.beginPacket(remoteIP, remotePort);
      udp.write(okResp, 16);
      udp.endPacket();
      logger(String("[MSC rtpMIDI] AppleMIDI session accepted from ") + remoteIP.toString(), "info");
      return;
    } else if (buf[2] == 'C' && buf[3] == 'K') {
      udp.beginPacket(remoteIP, remotePort);
      udp.write(buf, len);
      udp.endPacket();
      return;
    }
  }

  for (int i = 0; i < len - 5; i++) {
    if (buf[i] == 0xF0 && buf[i+1] == 0x7F) {
      uint8_t devId = buf[i+2];
      uint8_t subId1 = buf[i+3];
      uint8_t cmdFormat = buf[i+4];
      uint8_t cmd = buf[i+5];

      if (subId1 == 0x02) {
        bool devMatch = (msc_device_id == 0x7F || devId == 0x7F || devId == msc_device_id);
        bool fmtMatch = (msc_cmd_format == 0x7F || cmdFormat == 0x7F || cmdFormat == 0x08 || cmdFormat == msc_cmd_format);

        if (devMatch && fmtMatch) {
          String cueNum = "";
          int cueIdx = i + 6;
          while (cueIdx < len && buf[cueIdx] != 0x00 && buf[cueIdx] != 0xF7) {
            if (buf[cueIdx] >= 32 && buf[cueIdx] <= 126) cueNum += (char)buf[cueIdx];
            cueIdx++;
          }
          cueNum.trim();
          if (cueNum.length() > 0) msc_current_cue = cueNum;

          if (cmd == 0x01) {
            msc_state = "go"; msc_last_command = "GO"; actualType = "\"program\""; actualColor = "#00FF00";
          } else if (cmd == 0x02) {
            msc_state = "standby"; msc_last_command = "STOP"; actualType = "\"standby\""; actualColor = "#FF0000";
          } else if (cmd == 0x03) {
            msc_state = "go"; msc_last_command = "RESUME"; actualType = "\"program\""; actualColor = "#00FF00";
          } else if (cmd == 0x04) {
            msc_state = "go"; msc_last_command = "TIMED_GO"; actualType = "\"program\""; actualColor = "#00FF00";
          } else if (cmd == 0x08) {
            msc_state = "off"; msc_last_command = "ALL_OFF"; actualType = ""; actualColor = "";
          } else if (cmd == 0x0A) {
            msc_state = "off"; msc_last_command = "RESET"; actualType = ""; actualColor = "";
          } else if (cmd == 0x0B) {
            msc_state = "standby"; msc_last_command = "STANDBY+"; actualType = "\"flashred\""; actualColor = "#FF0000";
          } else if (cmd == 0x0C) {
            msc_state = "off"; msc_last_command = "STANDBY-"; actualType = ""; actualColor = "";
          }
          renderScreen();
          return;
        }
      }
    }
  }
}

// ==========================================
// Double-Buffered 240x280 Screen Rendering Engine
// ==========================================
void drawTopBannerWidget(LovyanGFX* g, int originX, int originY, int boxW, int boxH, uint16_t surroundBg, bool isStandaloneSprite) {
  // Fill rounded-corner outer margin with surrounding bgColor when drawing into standalone headerCanvas
  if (isStandaloneSprite) {
    g->fillScreen(surroundBg);
  }
  g->fillRoundRect(originX, originY, boxW, boxH, 8, TFT_BLACK);
  g->drawRoundRect(originX, originY, boxW, boxH, 8, mtc_reader_enabled ? TFT_CYAN : (isPromptside() ? TFT_MAGENTA : TFT_DARKGRAY));

  if (mtc_reader_enabled) {
    g->setTextDatum(middle_left);
    g->setTextSize(2);
    g->setTextColor(TFT_CYAN, TFT_BLACK);
    g->drawString(mtc_timecode_str, originX + 8, originY + 19);
  } else if (isPromptside()) {
    g->setTextDatum(middle_left);
    g->setTextSize(1);
    g->setTextColor(TFT_MAGENTA, TFT_BLACK);
    g->drawString(promptside_wing_label.substring(0, 18), originX + 8, originY + 19);
  } else if (isOSCCueLight()) {
    g->setTextDatum(middle_left);
    g->setTextSize(1);
    g->setTextColor(TFT_CYAN, TFT_BLACK);
    g->drawString(osccue_banner.substring(0, 18), originX + 8, originY + 19);
  } else {
    time_t now;
    time(&now);
    struct tm timeinfo;
    char timeStr[12] = "--:--:--";
    if (now > 100000) {
      localtime_r(&now, &timeinfo);
      strftime(timeStr, sizeof(timeStr), "%H:%M:%S", &timeinfo);
    } else {
      unsigned long totalSecs = millis() / 1000;
      snprintf(timeStr, sizeof(timeStr), "%02lu:%02lu:%02lu", (totalSecs / 3600) % 24, (totalSecs / 60) % 60, totalSecs % 60);
    }
    g->setTextDatum(middle_left);
    g->setTextSize(2);
    g->setTextColor(TFT_WHITE, TFT_BLACK);
    g->drawString(timeStr, originX + 8, originY + 19);
  }

  // Top-Right Battery Readout (% + Voltage + Charging Indicator)
  uint16_t batColor = battery.isLow ? TFT_RED : (battery.isCharging ? TFT_YELLOW : TFT_GREEN);
  g->setTextDatum(top_right);
  g->setTextSize(1);
  g->setTextColor(batColor, TFT_BLACK);
  String pctStr = String(battery.isCharging ? "+" : "") + String(battery.percentage) + "%";
  g->drawString(pctStr, originX + boxW - 8, originY + 5);
  g->setTextColor(TFT_LIGHTGREY, TFT_BLACK);
  g->drawString(String(battery.voltage, 2) + "V", originX + boxW - 8, originY + 18);
}

void computeTallyVisualState(uint16_t& bgColor, uint16_t& textColor, String& statusLabel) {
  bgColor = TFT_BLACK;
  textColor = TFT_WHITE;
  statusLabel = "STANDBY";
  bool flashPhase = (millis() / 400) % 2 == 0;

  if (isP2PMode() && p2p_disconnected_state) {
    bgColor = flashPhase ? TFT_YELLOW : TFT_BLACK;
    textColor = flashPhase ? TFT_BLACK : TFT_YELLOW;
    statusLabel = "DISCONNECTED";
  } else if (isPromptside()) {
    if (promptside_state == "standby_ack") {
      if (!promptside_ack_done) {
        bgColor = flashPhase ? TFT_RED : TFT_BLACK;
        textColor = flashPhase ? TFT_WHITE : TFT_RED;
        statusLabel = "STANDBY (ACK)";
      } else {
        bgColor = TFT_RED; textColor = TFT_WHITE; statusLabel = "ACKNOWLEDGED";
      }
    } else if (promptside_state == "go") {
      bgColor = TFT_GREEN; textColor = TFT_BLACK; statusLabel = "GO!";
    } else {
      bgColor = TFT_BLACK; textColor = TFT_WHITE; statusLabel = "OFF";
    }
  } else if (isMSCRTPMidi()) {
    if (msc_state == "go") {
      bgColor = TFT_GREEN; textColor = TFT_BLACK;
      statusLabel = String("GO ") + (msc_current_cue.length() > 0 ? msc_current_cue : "");
    } else if (msc_state == "standby") {
      if (actualType == "\"flashred\"") {
        bgColor = flashPhase ? TFT_RED : TFT_BLACK;
        textColor = flashPhase ? TFT_WHITE : TFT_RED;
        statusLabel = String("STANDBY+ ") + (msc_current_cue.length() > 0 ? msc_current_cue : "");
      } else {
        bgColor = TFT_RED; textColor = TFT_WHITE;
        statusLabel = String("STANDBY ") + (msc_current_cue.length() > 0 ? msc_current_cue : "");
      }
    } else {
      bgColor = TFT_BLACK; textColor = TFT_WHITE; statusLabel = "MSC OFF";
    }
  } else if (isOSCCueLight()) {
    if (osccue_state == "standby_ack") {
      if (!osccue_ack_done) {
        bgColor = flashPhase ? TFT_RED : TFT_BLACK;
        textColor = flashPhase ? TFT_WHITE : TFT_RED;
        statusLabel = "STANDBY (ACK)";
      } else {
        bgColor = TFT_RED; textColor = TFT_WHITE; statusLabel = "ACKNOWLEDGED";
      }
    } else if (osccue_state == "standby") {
      bgColor = TFT_RED; textColor = TFT_WHITE; statusLabel = "STANDBY";
    } else if (osccue_state == "go") {
      bgColor = TFT_GREEN; textColor = TFT_BLACK; statusLabel = "GO!";
    } else {
      bgColor = TFT_BLACK; textColor = TFT_WHITE; statusLabel = "OFF";
    }
  } else if (isTSL31Listener()) {
    if (actualType == "\"program\"")      { bgColor = TFT_RED;    textColor = TFT_WHITE; statusLabel = "PROGRAM"; }
    else if (actualType == "\"preview\"") { bgColor = TFT_GREEN;  textColor = TFT_BLACK; statusLabel = "PREVIEW"; }
    else if (actualType == "\"aux\"")     { bgColor = TFT_ORANGE; textColor = TFT_BLACK; statusLabel = "AUX"; }
    else                                  { bgColor = TFT_BLACK;  textColor = TFT_WHITE; statusLabel = "STANDBY"; }
  } else if (isTSL50Listener()) {
    if (actualType == "\"program\"")      { bgColor = TFT_RED;    textColor = TFT_WHITE; statusLabel = "PROGRAM"; }
    else if (actualType == "\"preview\"") { bgColor = TFT_GREEN;  textColor = TFT_BLACK; statusLabel = "PREVIEW"; }
    else if (actualType == "\"aux\"")     { bgColor = TFT_ORANGE; textColor = TFT_BLACK; statusLabel = "AUX"; }
    else if (actualType == "\"blue\"")    { bgColor = TFT_BLUE;   textColor = TFT_WHITE; statusLabel = "BLUE"; }
    else                                  { bgColor = TFT_BLACK;  textColor = TFT_WHITE; statusLabel = "STANDBY"; }
  } else if (isETCCueSystem()) {
    if (actualType == "\"standby\"") {
      if (!cuesystem_ack_active) {
        bgColor = flashPhase ? TFT_RED : TFT_BLACK;
        textColor = flashPhase ? TFT_WHITE : TFT_RED;
        statusLabel = "STANDBY";
      } else {
        bgColor = TFT_RED; textColor = TFT_WHITE; statusLabel = "ACKNOWLEDGED";
      }
    } else if (actualType == "\"program\"") {
      bgColor = TFT_GREEN; textColor = TFT_BLACK; statusLabel = "GO";
    } else {
      bgColor = TFT_BLACK; textColor = TFT_WHITE; statusLabel = "CUE OFF";
    }
  } else if (actualType == "\"flashred\"") {
    bgColor = flashPhase ? TFT_RED : TFT_BLACK;
    textColor = flashPhase ? TFT_WHITE : TFT_RED;
    statusLabel = "FLASH RED";
  } else if (actualType == "\"program\"") {
    bgColor = TFT_RED; textColor = TFT_WHITE;
    statusLabel = isNMOSIS07() ? "ON-AIR" : (isRTPMidi() || isOSC() ? "RED" : "PROGRAM");
  } else if (actualType == "\"preview\"") {
    bgColor = TFT_GREEN; textColor = TFT_BLACK;
    statusLabel = (isRTPMidi() || isOSC()) ? "GREEN" : "PREVIEW";
  } else if (actualType == "\"yellow\"") {
    bgColor = TFT_YELLOW; textColor = TFT_BLACK; statusLabel = "YELLOW";
  } else if (actualType == "\"blue\"") {
    bgColor = TFT_BLUE; textColor = TFT_WHITE; statusLabel = "BLUE";
  } else if (actualType == "\"white\"") {
    bgColor = TFT_WHITE; textColor = TFT_BLACK; statusLabel = "WHITE";
  } else if (actualType == "\"aux\"") {
    bgColor = TFT_ORANGE; textColor = TFT_BLACK; statusLabel = "AUX";
  } else if (actualColor.length() > 0 && actualColor != "invalid") {
    String hexstring = actualColor;
    hexstring.replace("#", "");
    long number = (long)strtol(hexstring.c_str(), NULL, 16);
    int r = (number >> 16) & 0xFF;
    int gr = (number >> 8) & 0xFF;
    int b = number & 0xFF;
    bgColor = lcd.color565(r, gr, b);
    textColor = (r + gr + b > 380) ? TFT_BLACK : TFT_WHITE;
    statusLabel = actualType;
    statusLabel.replace("\"", "");
    statusLabel.toUpperCase();
  }
}

void renderClockTick() {
  readBatteryState();
  uint16_t bgColor, textColor;
  String statusLabel;
  computeTallyVisualState(bgColor, textColor, statusLabel);

  // If background, screen, or mode state changed, perform a full render
  if (!screenHasRenderedOnce || currentScreen != lastRenderedScreen || bgColor != lastRenderedBgColor || statusLabel != lastRenderedStatus) {
    renderScreen();
    return;
  }

  if (currentScreen == 0) {
    int W = lcd.width();
    int H = lcd.height();

    // Update ONLY the 17 KB top banner (clock / MTC + battery %) -> zero full-screen SPI flicker!
    if (headerBufferEnabled) {
      drawTopBannerWidget(&headerCanvas, 0, 0, W - 16, 38, bgColor, true);
      headerCanvas.pushSprite(8, 8);
    } else {
      lcd.startWrite();
      drawTopBannerWidget(&lcd, 8, 8, W - 16, 38, bgColor, false);
      lcd.endWrite();
    }

    // Update middle battery power pill ONLY when charging/PoE/low-battery status changes
    if (battery.status != lastRenderedBatteryStatus ||
        battery.isPoE != lastRenderedBatteryPoE ||
        battery.isLow != lastRenderedBatteryLow) {
      lastRenderedBatteryStatus = battery.status;
      lastRenderedBatteryPoE = battery.isPoE;
      lastRenderedBatteryLow = battery.isLow;
      int centerY = H / 2 - 22;
      lcd.startWrite();
      lcd.setTextSize(1);
      lcd.fillRoundRect(16, centerY + 68, W - 32, 20, 10, TFT_BLACK);
      lcd.setTextDatum(middle_center);
      lcd.setTextColor(battery.isLow ? TFT_RED : TFT_CYAN, TFT_BLACK);
      lcd.drawString((battery.isPoE ? "PoE 802.3af | " : "LiPo | ") + battery.status, W / 2, centerY + 78);
      lcd.endWrite();
    }
  } else {
    // Diagnostics screen: only redraw atomically if sprite buffered (avoids 1 Hz direct fillScreen blink)
    if (doubleBufferEnabled) {
      renderScreen();
    }
  }
}

void renderScreen() {
  readBatteryState();

  uint16_t bgColor, textColor;
  String statusLabel;
  computeTallyVisualState(bgColor, textColor, statusLabel);

  bool backgroundChanged = (!screenHasRenderedOnce || currentScreen != lastRenderedScreen || bgColor != lastRenderedBgColor);

  auto renderContent = [&](LovyanGFX* g, bool clearFullBg) {
    int W = g->width();
    int H = g->height();
    if (clearFullBg) {
      g->fillScreen(bgColor);
    }

    if (currentScreen == 0) {
      // ----------------------------------------
      // Screen 0: Main Tally & Cue Display (240x280)
      // ----------------------------------------
      drawTopBannerWidget(g, 8, 8, W - 16, 38, bgColor, false);

      // Center Label / Station / Cue Text
      String displayName = DeviceName;
      if (isP2PMode() && p2p_disconnected_state) {
        displayName = "PEER LOST";
      } else if (isPromptside()) {
        displayName = promptside_cue_text.length() > 0 ? promptside_cue_text : (promptside_state == "go" ? "GO!" : (promptside_state == "standby_ack" ? "STANDBY" : (String("CH ") + promptside_channel)));
      } else if (isMSCRTPMidi()) {
        displayName = msc_current_cue.length() > 0 ? (String("CUE ") + msc_current_cue) : "MSC CUE";
      } else if (isOSC() && osc_custom_message.length() > 0) {
        displayName = osc_custom_message;
      } else if (isTSL31Listener()) {
        displayName = tsl31_name;
      } else if (isTSL50Listener()) {
        displayName = tsl50_name;
      } else if (isOSCCueLight()) {
        displayName = osccue_message.length() > 0 ? osccue_message : (osccue_state == "go" ? "GO!" : (osccue_state.startsWith("standby") ? "STANDBY" : "OFF"));
      }

      int centerY = H / 2 - 22;
      if (!clearFullBg) {
        g->fillRect(0, 52, W, centerY + 62 - 52, bgColor);
      }
      g->setTextSize(3);
      g->setTextColor(textColor, bgColor);
      int textWidth = g->textWidth(displayName.c_str());
      if (textWidth > W - 20) {
        int scrollRange = textWidth + 80;
        int offset = (millis() / 30) % scrollRange;
        g->setTextDatum(middle_left);
        g->drawString(displayName, (W - 10) - offset, centerY);
      } else {
        g->setTextDatum(middle_center);
        g->drawString(displayName, W / 2, centerY);
      }

      // Status Badge
      g->setTextDatum(middle_center);
      g->setTextSize(2);
      g->drawRoundRect(24, centerY + 30, W - 48, 30, 6, textColor);
      g->drawString(statusLabel, W / 2, centerY + 45);

      // Battery Power Status Pill
      g->setTextSize(1);
      g->fillRoundRect(16, centerY + 68, W - 32, 20, 10, TFT_BLACK);
      g->setTextColor(battery.isLow ? TFT_RED : TFT_CYAN, TFT_BLACK);
      g->drawString((battery.isPoE ? "PoE 802.3af | " : "LiPo | ") + battery.status, W / 2, centerY + 78);

      // Bottom Telemetry & Touch Guidance
      if (!clearFullBg) {
        g->fillRect(0, H - 58, W, 36, bgColor);
      }
      g->drawLine(10, H - 56, W - 10, H - 56, textColor);
      g->setTextDatum(top_left);
      g->setTextColor(textColor, bgColor);
      g->setCursor(12, H - 50);
      g->print("[" + operatingMode + "] ");
      if (isPromptside()) g->print("Ch:" + promptside_channel + (promptside_ack_done ? " ACKED" : ""));
      else if (isETCCueSystem()) g->print("Ch:" + String(cuesystem_channel) + (cuesystem_ack_active ? " ACKED" : ""));
      else if (isMSCRTPMidi()) g->print("Cmd:" + msc_last_command);
      else if (isP2PMode()) g->print(p2p_disconnected_state ? ">>> PEER LOST <<<" : ("Grp:" + pairingGroup));
      else g->print(socket.isConnected() ? "TA:Online" : (ch1state ? "CUE:ACTIVE" : "TA:Wait"));

      g->setCursor(12, H - 36);
      if (isTP() && presenterCueActive) {
        g->setTextColor(TFT_YELLOW, TFT_RED);
        g->print(">>> PRESENTER CUE ACTIVE! <<<");
      } else {
        g->print("IP: " + getNetworkIPStr() + (useDHCP ? " (DHCP)" : " (Static)"));
      }

      g->fillRoundRect(8, H - 22, W - 16, 16, 4, TFT_BLACK);
      g->setTextColor(TFT_LIGHTGREY, TFT_BLACK);
      g->setTextDatum(middle_center);
      g->drawString("1-Tap: Button Action  |  2-Tap: Diag", W / 2, H - 14);
    } else {
      // ----------------------------------------
      // Screen 1: Diagnostics & Battery Telemetry (Follows Tally Background)
      // ----------------------------------------
      bool isLightBg = (bgColor == TFT_WHITE || bgColor == TFT_YELLOW || bgColor == TFT_GREEN || bgColor == TFT_ORANGE);
      uint16_t dTextColor = isLightBg ? TFT_BLACK : TFT_WHITE;

      g->fillRoundRect(8, 6, W - 16, 24, 5, TFT_BLACK);
      g->setTextDatum(middle_center);
      g->setTextColor(TFT_CYAN, TFT_BLACK);
      g->setTextSize(1);
      g->drawString("OLIMEX ESP32-PoE2 DIAGNOSTICS (" + statusLabel + ")", W / 2, 18);

      // Battery Box
      g->fillRoundRect(8, 34, W - 16, 54, 6, TFT_BLACK);
      g->drawRoundRect(8, 34, W - 16, 54, 6, battery.isLow ? TFT_RED : TFT_DARKGRAY);
      g->setTextDatum(top_left);
      g->setTextColor(TFT_YELLOW, TFT_BLACK);
      g->setCursor(14, 40);
      g->printf("BATTERY (GPIO 35): %.2fV  [%d%%]", battery.voltage, battery.percentage);
      g->setTextColor(battery.isLow ? TFT_RED : TFT_GREEN, TFT_BLACK);
      g->setCursor(14, 54);
      g->print("Status: " + battery.status);
      g->setTextColor(TFT_CYAN, TFT_BLACK);
      g->setCursor(14, 68);
      g->printf("Rail: %s | CPU: %d MHz %s", battery.isPoE ? "PoE 802.3af" : "LiPo/USB", cpu_freq_mhz, screen_dimmed ? "[DIM]" : "[ECO]");

      // Network & Protocol Telemetry
      if (!clearFullBg) {
        g->fillRect(0, 92, W, H - 116, bgColor);
      }
      g->setTextColor(dTextColor, bgColor);
      int y = 96;
      String bufDesc = doubleBufferEnabled ? (String(doubleBufferColorDepth) + "-bit DMA") : "Direct";
      g->setCursor(10, y);      g->println("Net:  " + getNetworkModeStr()); y += 15;
      g->setCursor(10, y);      g->println("IP:   " + getNetworkIPStr() + (useDHCP ? " (DHCP)" : " (Static)")); y += 15;
      g->setCursor(10, y);      g->println("Mode: " + operatingMode + " | Port: " + String(getActiveListenPort())); y += 15;
      g->setCursor(10, y);      g->println("LCD:  ST7789V2 " + String(W) + "x" + String(H) + " (" + bufDesc + ")"); y += 15;
      g->setCursor(10, y);      g->println("Touch: CST816T I2C (0x15) | Rot: " + String(currentRotation * 90) + "d"); y += 15;

      if (mtc_reader_enabled) {
        g->setCursor(10, y); g->println("MTC:  " + mtc_timecode_str); y += 15;
      } else {
        g->setCursor(10, y); g->println("TZ:   " + timezone_name); y += 15;
      }

      if (env_sensor_enabled) {
        g->setCursor(10, y);
        g->printf("ENV:  %.1fC  %.0f%%RH  %.0fhPa\n", env_temperature, env_humidity, env_pressure);
        y += 15;
      }

      if (isP2PMode()) {
        g->setCursor(10, y);
        g->println(p2p_disconnected_state ? "Peer: DISCONNECTED (>4 missed)" : ("Peer: " + (pairedTargetIP.length() > 0 ? pairedTargetIP : "Broadcast")));
        y += 15;
      } else if (usesTallyArbiter()) {
        g->setCursor(10, y);
        g->println(String("TA:   ") + tallyarbiter_host + ":" + tallyarbiter_port + (socket.isConnected() ? " [OK]" : " [Wait]"));
        y += 15;
      }

      g->setCursor(10, y);
      g->printf("Heap: %u KB | Bright: %d%%\n", (unsigned int)(esp_get_free_heap_size() / 1024), brightnessLevels[brightnessIndex] * 100 / 255);

      g->fillRoundRect(8, H - 22, W - 16, 16, 4, TFT_BLACK);
      g->setTextColor(TFT_CYAN, TFT_BLACK);
      g->setTextDatum(middle_center);
      g->drawString("Double-Tap Screen to Return", W / 2, H - 14);
    }
  };

  if (doubleBufferEnabled) {
    renderContent(&canvas, true);
    canvas.pushSprite(0, 0);
  } else {
    lcd.startWrite();
    renderContent(&lcd, backgroundChanged);
    lcd.endWrite();
  }

  screenHasRenderedOnce = true;
  lastRenderedScreen = currentScreen;
  lastRenderedBgColor = bgColor;
  lastRenderedTextColor = textColor;
  lastRenderedStatus = statusLabel;
  lastRenderedBatteryStatus = battery.status;
  lastRenderedBatteryPoE = battery.isPoE;
  lastRenderedBatteryLow = battery.isLow;
}

void evaluateMode() {
  tallyStateChanged = true;
  if (xPortGetCoreID() == 1) renderScreen();
}

void showSettings()   { currentScreen = 1; renderScreen(); }
void showDeviceInfo() { currentScreen = 0; renderScreen(); }

// ==========================================
// Power & Thermal Management Functions
// ==========================================
void wakeDisplayFromDim() {
  last_user_or_tally_act = millis();
  if (screen_dimmed) {
    screen_dimmed = false;
    lcd.setBrightness(brightnessLevels[brightnessIndex]);
    logger("[Power] Display woke from dim", "info-quiet");
    renderScreen();
  }
}

void applyPowerManagementConfig() {
  if (cpu_freq_mhz != 80 && cpu_freq_mhz != 160 && cpu_freq_mhz != 240) cpu_freq_mhz = 80;
  setCpuFrequencyMhz(cpu_freq_mhz);
  if (esp_bt_controller_get_status() == ESP_BT_CONTROLLER_STATUS_ENABLED) {
    btStop();
    esp_bt_controller_disable();
  }
  logger(String("[Power] CPU @ ") + String(getCpuFrequencyMhz()) + " MHz (APB: " + String(getApbFrequency() / 1000000) + " MHz). BT OFF.", "info");
}

void updateBrightness() {
  wakeDisplayFromDim();
  brightnessIndex = (brightnessIndex + 1) % (sizeof(brightnessLevels) / sizeof(brightnessLevels[0]));
  lcd.setBrightness(brightnessLevels[brightnessIndex]);
  logger(String("[Display] Brightness set to ") + String(brightnessLevels[brightnessIndex] * 100 / 255) + "%", "info");
  renderScreen();
}

// ==========================================
// Embedded AsyncWebServer for Configuration
// ==========================================
void setupWebServer() {
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    readBatteryState();
    String html = F("<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                    "<title>Olimex ESP32-PoE2 Tally & Cue Controller</title><style>"
                    "body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0f172a;color:#f1f5f9;padding:16px;max-width:660px;margin:auto}"
                    ".card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 4px 6px rgba(0,0,0,0.3)}"
                    "h1{font-size:20px;margin:0 0 4px 0;color:#38bdf8}h2{font-size:15px;color:#94a3b8;margin:0 0 14px 0;text-transform:uppercase;letter-spacing:0.05em}"
                    ".badge{display:inline-block;padding:3px 8px;border-radius:9999px;font-size:11px;font-weight:700;margin-right:4px}"
                    ".badge-blue{background:#0284c7;color:#fff}.badge-green{background:#16a34a;color:#fff}.badge-purple{background:#7c3aed;color:#fff}.badge-amber{background:#d97706;color:#fff}.badge-red{background:#dc2626;color:#fff}.badge-cyan{background:#0891b2;color:#fff}"
                    "label{display:block;margin-top:12px;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.03em}"
                    "input,select{width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #475569;color:#f8fafc;padding:10px;border-radius:6px;margin-top:4px;font-size:14px}"
                    "input:focus,select:focus{outline:none;border-color:#38bdf8}"
                    "button{background:#0284c7;color:white;font-weight:600;padding:11px 14px;border:none;border-radius:6px;cursor:pointer;font-size:14px}"
                    "button:hover{background:#0369a1}"
                    ".btn-scan{background:#059669;width:100%;margin-top:10px}.btn-scan:hover{background:#047857}"
                    ".btn-save{width:100%;margin-top:20px;background:#2563eb}.btn-save:hover{background:#1d4ed8}"
                    ".peer-item{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:10px;margin-top:8px;display:flex;justify-content:space-between;align-items:center}"
                    ".peer-info{font-size:13px}.peer-name{font-weight:700;color:#e2e8f0}.peer-sub{font-size:11px;color:#94a3b8}"
                    ".btn-pair{padding:6px 12px;font-size:12px;background:#7c3aed;border-radius:4px}.btn-pair:hover{background:#6d28d9}"
                    ".grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}"
                    ".grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}"
                    ".section-box{background:#172033;border:1px solid #334155;border-radius:8px;padding:14px;margin-top:14px}"
                    ".hint{font-size:12px;color:#94a3b8;margin-top:4px}"
                    "</style></head><body>"
                    "<div class='card'>"
                    "<h1>Olimex ESP32-PoE2 Tally &amp; Cue</h1>"
                    "<h2>Waveshare 1.69&quot; Touch LCD • LAN8720A PoE • LiPo ADC</h2>"
                    "<p style='margin:4px 0;'>Device: <strong>");
    html += DeviceName;
    html += F("</strong> (");
    html += listenerDeviceName;
    html += F(")</p><p style='margin:4px 0;'>Current Mode: <span class='badge badge-cyan'>");
    html += operatingMode;
    html += F("</span></p><p style='margin:4px 0;'>Network: <strong>");
    html += getNetworkModeStr();
    html += F(" (");
    html += useDHCP ? "DHCP" : "Static IP";
    html += F(")</strong> | IP: <strong>");
    html += getNetworkIPStr();
    html += F("</strong> | Buffer: <strong>");
    html += doubleBufferEnabled ? (String(doubleBufferColorDepth) + "-bit DMA OK") : (headerBufferEnabled ? "Header Sprite" : "Direct");
    html += F("</strong></p><p style='margin:4px 0;'>Battery (GPIO 35): <strong>");
    html += String(battery.voltage, 2) + "V (" + String(battery.percentage) + "%) — " + battery.status;
    html += F("</strong></p><p style='margin:4px 0;'>Power: <strong>CPU ");
    html += String(cpu_freq_mhz) + " MHz</strong> | Radios: <strong>";
    html += wifiDisabledForEth ? "<span class='badge badge-blue'>RF OFF (PoE)</span>" : "<span class='badge badge-purple'>Wi-Fi Active</span>";
    html += F("</strong> | Touch: <strong>CST816T (1-Tap=Action, 2-Tap=Diag)</strong></p>"
              "<p style='margin:8px 0 0 0;'><a href='/manual' target='_blank' style='color:#38bdf8;text-decoration:none;font-weight:600;font-size:13px;'>&#128214; View Full HTML User Manual &amp; Documentation &rarr;</a></p>"
              "</div><div class='card'>"
              "<form action='/save' method='POST'>"
              "<h2>Operating Mode &amp; Role</h2>"
              "<label>Device Mode</label>"
              "<select name='mode' id='mode-select' onchange='updateModeUI()'>"
              "<option value='TP'"); if (operatingMode == "TP") html += F(" selected"); html += F(">TP (Technical Producer with Tally Arbiter)</option>");
    html += F("<option value='Presenter'"); if (operatingMode == "Presenter") html += F(" selected"); html += F(">Presenter (with Tally Arbiter)</option>");
    html += F("<option value='TP_P2P'"); if (operatingMode == "TP_P2P") html += F(" selected"); html += F(">TP no Tally Arbiter (P2P Master)</option>");
    html += F("<option value='Presenter_P2P'"); if (operatingMode == "Presenter_P2P") html += F(" selected"); html += F(">Presenter no Tally Arbiter (P2P Slave)</option>");
    html += F("<option value='ETC_CueSystem'"); if (operatingMode == "ETC_CueSystem") html += F(" selected"); html += F(">ETC CueSystem (Stage Cue Light Outstation)</option>");
    html += F("<option value='NMOS_IS07'"); if (operatingMode == "NMOS_IS07") html += F(" selected"); html += F(">NMOS IS-07 Event &amp; Tally (SMPTE ST 2110)</option>");
    html += F("<option value='Promptside'"); if (operatingMode == "Promptside") html += F(" selected"); html += F(">Promptside (Theatrical Stage Cue Light - promptside.co)</option>");
    html += F("<option value='MSC_RTP_MIDI'"); if (operatingMode == "MSC_RTP_MIDI") html += F(" selected"); html += F(">MIDI Show Control (MSC over rtpMIDI - RP-002)</option>");
    html += F("<option value='RTP_MIDI'"); if (operatingMode == "RTP_MIDI") html += F(" selected"); html += F(">rtpMIDI / AppleMIDI Outstation</option>");
    html += F("<option value='OSC'"); if (operatingMode == "OSC") html += F(" selected"); html += F(">OSC (Open Sound Control) Outstation</option>");
    html += F("<option value='TSL_31'"); if (operatingMode == "TSL_31") html += F(" selected"); html += F(">TSL 3.1 Listener (UDP / TCP with centered name)</option>");
    html += F("<option value='TSL_50'"); if (operatingMode == "TSL_50") html += F(" selected"); html += F(">TSL 5.0 Listener (UDP / TCP with centered name)</option>");
    html += F("<option value='OSC_CueLight'"); if (operatingMode == "OSC_CueLight") html += F(" selected"); html += F(">OSC Cue Light (RSMCK iOS Protocol - Port 53000)</option>");
    html += F("</select>"
              "<div class='section-box'>"
              "<h2>Timezone, Orientation &amp; Peripherals</h2>"
              "<div class='grid-2'>"
              "<div><label>Timezone (NTP Clock)</label><select name='timezone_name' id='tz-select' onchange='toggleCustomTZ()'>"
              "<option value='Europe/London'"); if (timezone_name == "Europe/London") html += F(" selected"); html += F(">Europe/London (GMT/BST)</option>"
              "<option value='UTC'"); if (timezone_name == "UTC") html += F(" selected"); html += F(">UTC / GMT</option>"
              "<option value='Europe/Paris'"); if (timezone_name == "Europe/Paris") html += F(" selected"); html += F(">Europe/Paris (CET/CEST)</option>"
              "<option value='America/New_York'"); if (timezone_name == "America/New_York") html += F(" selected"); html += F(">America/New_York</option>"
              "<option value='America/Chicago'"); if (timezone_name == "America/Chicago") html += F(" selected"); html += F(">America/Chicago</option>"
              "<option value='America/Denver'"); if (timezone_name == "America/Denver") html += F(" selected"); html += F(">America/Denver</option>"
              "<option value='America/Los_Angeles'"); if (timezone_name == "America/Los_Angeles") html += F(" selected"); html += F(">America/Los_Angeles</option>"
              "<option value='Asia/Tokyo'"); if (timezone_name == "Asia/Tokyo") html += F(" selected"); html += F(">Asia/Tokyo</option>"
              "<option value='Australia/Sydney'"); if (timezone_name == "Australia/Sydney") html += F(" selected"); html += F(">Australia/Sydney</option>"
              "<option value='Custom'"); if (timezone_name == "Custom") html += F(" selected"); html += F(">Custom POSIX String</option></select></div>"
              "<div><label>Custom POSIX Timezone</label><input type='text' id='tz-custom' name='custom_tz_posix' value='");
    html += custom_tz_posix;
    html += F("'></div></div>"
              "<div class='grid-3' style='margin-top:10px;'>"
              "<div><label>MTC Reader (rtpMIDI)</label><select name='mtc_reader'>"
              "<option value='0'"); if (!mtc_reader_enabled) html += F(" selected"); html += F(">Disabled</option>"
              "<option value='1'"); if (mtc_reader_enabled) html += F(" selected"); html += F(">Enabled</option></select></div>"
              "<div><label>External I2C ENV Sensor</label><select name='env_sensor'>"
              "<option value='0'"); if (!env_sensor_enabled) html += F(" selected"); html += F(">Disabled</option>"
              "<option value='1'"); if (env_sensor_enabled) html += F(" selected"); html += F(">Enabled (GPIO 33/32)</option></select></div>"
              "<div><label>LCD Rotation</label><select name='rotation'>"
              "<option value='0'"); if (currentRotation == 0) html += F(" selected"); html += F(">0 deg (Portrait)</option>"
              "<option value='1'"); if (currentRotation == 1) html += F(" selected"); html += F(">90 deg (Landscape)</option>"
              "<option value='2'"); if (currentRotation == 2) html += F(" selected"); html += F(">180 deg (Inverted)</option>"
              "<option value='3'"); if (currentRotation == 3) html += F(" selected"); html += F(">270 deg (Landscape)</option></select></div></div>"
              "</div>"
              "<div class='section-box'>"
              "<h2>Network IP Configuration</h2>"
              "<label>IP Assignment Mode</label><select name='ip_dhcp' id='ip_dhcp' onchange='toggleIPFields()'>"
              "<option value='1'"); if (useDHCP) html += F(" selected"); html += F(">DHCP (Automatic)</option>"
              "<option value='0'"); if (!useDHCP) html += F(" selected"); html += F(">Static IP (Manual)</option></select>"
              "<div id='static-ip-fields' style='display:"); html += useDHCP ? "none" : "block"; html += F(";'>"
              "<div class='grid-2'>"
              "<div><label>Static IP</label><input type='text' name='static_ip' value='"); html += static_ip; html += F("'></div>"
              "<div><label>Subnet Mask</label><input type='text' name='static_mask' value='"); html += static_mask; html += F("'></div></div>"
              "<div class='grid-2'>"
              "<div><label>Gateway</label><input type='text' name='static_gw' value='"); html += static_gw; html += F("'></div>"
              "<div><label>Primary DNS</label><input type='text' name='static_dns' value='"); html += static_dns; html += F("'></div></div></div></div>"
              "<div class='section-box'>"
              "<h2>Power &amp; Thermal Management</h2>"
              "<div class='grid-2'>"
              "<div><label>CPU Clock</label><select name='cpu_freq'>"
              "<option value='80'"); if (cpu_freq_mhz == 80) html += F(" selected"); html += F(">80 MHz (Eco - Recommended)</option>"
              "<option value='160'"); if (cpu_freq_mhz == 160) html += F(" selected"); html += F(">160 MHz (Balanced)</option>"
              "<option value='240'"); if (cpu_freq_mhz == 240) html += F(" selected"); html += F(">240 MHz (Max)</option></select></div>"
              "<div><label>Display Auto-Dimming</label><select name='dim_timeout'>"
              "<option value='0'"); if (screen_dim_timeout_sec == 0) html += F(" selected"); html += F(">Disabled</option>"
              "<option value='30'"); if (screen_dim_timeout_sec == 30) html += F(" selected"); html += F(">30s Idle</option>"
              "<option value='60'"); if (screen_dim_timeout_sec == 60) html += F(" selected"); html += F(">60s Idle (Recommended)</option>"
              "<option value='180'"); if (screen_dim_timeout_sec == 180) html += F(" selected"); html += F(">180s Idle</option></select></div></div></div>"
              "<div id='sec-ta' class='section-box'><h2>Tally Arbiter Settings</h2>"
              "<div class='grid-2'><div><label>Host / IP</label><input type='text' name='host' value='"); html += tallyarbiter_host; html += F("'></div>"
              "<div><label>Socket.IO Port</label><input type='text' name='port' value='"); html += tallyarbiter_port; html += F("'></div></div>"
              "<div class='grid-2'><div><label>Listener Name</label><input type='text' name='devicename' value='"); html += listenerDeviceName; html += F("'></div>"
              "<div><label>TSL Return Port</label><input type='number' name='tslport' value='"); html += tallyarbiter_TSLport; html += F("'></div></div></div>"
              "<div id='sec-p2p' class='section-box'><h2>Standalone P2P Settings</h2>"
              "<div class='grid-2'><div><label>Pairing Group</label><input type='text' name='group' value='"); html += pairingGroup; html += F("'></div>"
              "<div><label>TSL 3.1 UDP Port</label><input type='text' name='tslport_p2p' value='"); html += tallyarbiter_TSLport; html += F("'></div></div>"
              "<div class='grid-2'><div><label>Paired Peer IP</label><input type='text' id='peerip' name='pairedip' value='"); html += pairedTargetIP; html += F("'></div>"
              "<div><label>Paired Peer Name</label><input type='text' id='peername' name='pairedname' value='"); html += pairedTargetName; html += F("'></div></div></div>"
              "<div id='sec-promptside' class='section-box'><h2>Promptside Theatrical Cue Light</h2>"
              "<div class='grid-3'><div><label>UDP Port</label><input type='number' name='prompt_port' value='"); html += String(promptside_port); html += F("'></div>"
              "<div><label>Channel / ID</label><input type='text' name='prompt_chan' value='"); html += promptside_channel; html += F("'></div>"
              "<div><label>Wing Label</label><input type='text' name='prompt_wing' value='"); html += promptside_wing_label; html += F("'></div></div></div>"
              "<div id='sec-msc' class='section-box'><h2>MIDI Show Control (MSC RP-002)</h2>"
              "<div class='grid-3'><div><label>RTP-MIDI Port</label><input type='number' name='msc_port' value='"); html += String(msc_rtpmidi_port); html += F("'></div>"
              "<div><label>Device ID</label><input type='number' name='msc_dev' min='0' max='127' value='"); html += String(msc_device_id); html += F("'></div>"
              "<div><label>Format</label><input type='number' name='msc_fmt' min='0' max='127' value='"); html += String(msc_cmd_format); html += F("'></div></div></div>"
              "<div id='sec-cuesystem' class='section-box'><h2>ETC CueSystem Configuration</h2>"
              "<div class='grid-2'><div><label>Hub Host</label><input type='text' name='cue_host' value='"); html += cuesystem_host; html += F("'></div>"
              "<div><label>UDP Port</label><input type='number' name='cue_port' value='"); html += String(cuesystem_port); html += F("'></div></div>"
              "<label>Cue Channel (1-32)</label><input type='number' name='cue_channel' min='1' max='32' value='"); html += String(cuesystem_channel); html += F("'></div>"
              "<div id='sec-nmos' class='section-box'><h2>AMWA NMOS IS-07 Event &amp; Tally</h2>"
              "<label>Discovery Mode</label><select name='nmos_autodisc'><option value='1'"); if (nmos_auto_discover) html += F(" selected"); html += F(">DNS-SD Auto</option>"
              "<option value='0'"); if (!nmos_auto_discover) html += F(" selected"); html += F(">Manual Host</option></select>"
              "<div class='grid-2'><div><label>Registry Host</label><input type='text' name='nmos_host' value='"); html += nmos_registry_host; html += F("'></div>"
              "<div><label>Registry Port</label><input type='number' name='nmos_port' value='"); html += String(nmos_registry_port); html += F("'></div></div>"
              "<label>Source UUID</label><input type='text' name='nmos_source' value='"); html += nmos_source_id; html += F("'>"
              "<div class='grid-3'><div><label>Program Topic</label><input type='text' name='nmos_prg_topic' value='"); html += nmos_program_topic; html += F("'></div>"
              "<div><label>Preview Topic</label><input type='text' name='nmos_pvw_topic' value='"); html += nmos_preview_topic; html += F("'></div>"
              "<div><label>Aux Topic</label><input type='text' name='nmos_aux_topic' value='"); html += nmos_aux_topic; html += F("'></div></div></div>"
              "<div id='sec-rtpmidi' class='section-box'><h2>rtpMIDI / AppleMIDI Configuration</h2>"
              "<div class='grid-3'><div><label>UDP Port</label><input type='number' name='midi_port' value='"); html += String(rtpmidi_port); html += F("'></div>"
              "<div><label>Channel (0=Omni)</label><input type='number' name='midi_chan' min='0' max='16' value='"); html += String(rtpmidi_channel); html += F("'></div>"
              "<div><label>Trigger</label><select name='midi_trig'><option value='0'"); if (rtpmidi_trigger_type == 0) html += F(" selected"); html += F(">Note</option>"
              "<option value='1'"); if (rtpmidi_trigger_type == 1) html += F(" selected"); html += F(">CC</option>"
              "<option value='2'"); if (rtpmidi_trigger_type == 2) html += F(" selected"); html += F(">PC</option></select></div></div>"
              "<div class='grid-3'><div><label>Red</label><input type='number' name='midi_red' value='"); html += String(rtpmidi_num_red); html += F("'></div>"
              "<div><label>Flash Red</label><input type='number' name='midi_flash' value='"); html += String(rtpmidi_num_flash_red); html += F("'></div>"
              "<div><label>Green</label><input type='number' name='midi_green' value='"); html += String(rtpmidi_num_green); html += F("'></div>"
              "<div><label>Yellow</label><input type='number' name='midi_yellow' value='"); html += String(rtpmidi_num_yellow); html += F("'></div>"
              "<div><label>Blue</label><input type='number' name='midi_blue' value='"); html += String(rtpmidi_num_blue); html += F("'></div>"
              "<div><label>White</label><input type='number' name='midi_white' value='"); html += String(rtpmidi_num_white); html += F("'></div></div></div>"
              "<div id='sec-midibtn' class='section-box'><h2>MIDI Button Return Feedback</h2>"
              "<div class='grid-3'><div><label>Action Type</label><select name='midi_btn_type'>"
              "<option value='0'"); if (midi_btn_type == 0) html += F(" selected"); html += F(">None</option>"
              "<option value='1'"); if (midi_btn_type == 1) html += F(" selected"); html += F(">Note Momentary</option>"
              "<option value='2'"); if (midi_btn_type == 2) html += F(" selected"); html += F(">Note Toggle</option>"
              "<option value='3'"); if (midi_btn_type == 3) html += F(" selected"); html += F(">CC Momentary</option>"
              "<option value='4'"); if (midi_btn_type == 4) html += F(" selected"); html += F(">CC Toggle</option>"
              "<option value='5'"); if (midi_btn_type == 5) html += F(" selected"); html += F(">Program Change</option></select></div>"
              "<div><label>Channel</label><input type='number' name='midi_btn_chan' min='1' max='16' value='"); html += String(midi_btn_channel); html += F("'></div>"
              "<div><label>Number</label><input type='number' name='midi_btn_num' min='0' max='127' value='"); html += String(midi_btn_number); html += F("'></div></div>"
              "<div class='grid-2'><div><label>Press Val</label><input type='number' name='midi_btn_press' min='0' max='127' value='"); html += String(midi_btn_val_press); html += F("'></div>"
              "<div><label>Release Val</label><input type='number' name='midi_btn_release' min='0' max='127' value='"); html += String(midi_btn_val_release); html += F("'></div></div></div>"
              "<div id='sec-osc' class='section-box'><h2>OSC Configuration</h2>"
              "<div class='grid-2'><div><label>OSC UDP Port</label><input type='number' name='osc_port' value='"); html += String(osc_port); html += F("'></div>"
              "<div><label>Prefix</label><input type='text' name='osc_prefix' value='"); html += osc_prefix; html += F("'></div></div>"
              "<label>Custom Text</label><input type='text' name='osc_msg' value='"); html += osc_custom_message; html += F("'></div>"
              "<div id='sec-tsl31' class='section-box'><h2>TSL 3.1 Listener</h2>"
              "<div class='grid-3'><div><label>Port</label><input type='number' name='tsl31_port' value='"); html += String(tsl31_port); html += F("'></div>"
              "<div><label>Transport</label><select name='tsl31_trans'><option value='UDP'"); if (tsl31_transport == "UDP") html += F(" selected"); html += F(">UDP</option>"
              "<option value='TCP'"); if (tsl31_transport == "TCP") html += F(" selected"); html += F(">TCP</option></select></div>"
              "<div><label>Address (0=All)</label><input type='number' name='tsl31_addr' min='0' max='127' value='"); html += String(tsl31_address); html += F("'></div></div></div>"
              "<div id='sec-tsl50' class='section-box'><h2>TSL 5.0 Listener</h2>"
              "<div class='grid-2'><div><label>Port</label><input type='number' name='tsl50_port' value='"); html += String(tsl50_port); html += F("'></div>"
              "<div><label>Transport</label><select name='tsl50_trans'><option value='UDP'"); if (tsl50_transport == "UDP") html += F(" selected"); html += F(">UDP</option>"
              "<option value='TCP'"); if (tsl50_transport == "TCP") html += F(" selected"); html += F(">TCP</option></select></div></div>"
              "<div class='grid-2'><div><label>Screen Index</label><input type='number' name='tsl50_screen' value='"); html += String(tsl50_screen); html += F("'></div>"
              "<div><label>Display Index</label><input type='number' name='tsl50_idx' value='"); html += String(tsl50_index); html += F("'></div></div></div>"
              "<div id='sec-osccue' class='section-box'><h2>OSC Cue Light (RSMCK iOS)</h2>"
              "<div class='grid-2'><div><label>UDP Port</label><input type='number' name='osccue_port' value='"); html += String(osccue_port); html += F("'></div>"
              "<div><label>Station ID</label><input type='text' name='osccue_station' value='"); html += osccue_station_id; html += F("'></div></div>"
              "<label>Banner Text</label><input type='text' name='osccue_banner' value='"); html += osccue_banner; html += F("'></div>"
              "<button type='submit' class='btn-save'>Save Settings &amp; Apply</button></form></div>"
              "<div id='sec-p2p-scan' class='card'><h2>Zero-Conf P2P Discovery (mDNS)</h2>"
              "<button type='button' class='btn-scan' onclick='scanPeers()'>Scan for Local CueLX / TSL Peers</button>"
              "<div id='peers-list' style='margin-top:12px;'></div></div>"
              "<script>"
              "function toggleIPFields(){document.getElementById('static-ip-fields').style.display=document.getElementById('ip_dhcp').value==='1'?'none':'block';}"
              "function toggleCustomTZ(){document.getElementById('tz-custom').style.display=document.getElementById('tz-select').value==='Custom'?'block':'none';}"
              "function updateModeUI(){var m=document.getElementById('mode-select').value;"
              "document.getElementById('sec-ta').style.display=(m==='TP'||m==='Presenter')?'block':'none';"
              "document.getElementById('sec-p2p').style.display=(m==='TP_P2P'||m==='Presenter_P2P')?'block':'none';"
              "document.getElementById('sec-p2p-scan').style.display=(m==='TP_P2P'||m==='Presenter_P2P')?'block':'none';"
              "document.getElementById('sec-promptside').style.display=(m==='Promptside')?'block':'none';"
              "document.getElementById('sec-msc').style.display=(m==='MSC_RTP_MIDI')?'block':'none';"
              "document.getElementById('sec-cuesystem').style.display=(m==='ETC_CueSystem')?'block':'none';"
              "document.getElementById('sec-nmos').style.display=(m==='NMOS_IS07')?'block':'none';"
              "document.getElementById('sec-rtpmidi').style.display=(m==='RTP_MIDI')?'block':'none';"
              "document.getElementById('sec-midibtn').style.display=(m==='RTP_MIDI'||m==='MSC_RTP_MIDI')?'block':'none';"
              "document.getElementById('sec-osc').style.display=(m==='OSC')?'block':'none';"
              "document.getElementById('sec-tsl31').style.display=(m==='TSL_31')?'block':'none';"
              "document.getElementById('sec-tsl50').style.display=(m==='TSL_50')?'block':'none';"
              "document.getElementById('sec-osccue').style.display=(m==='OSC_CueLight')?'block':'none';}"
              "updateModeUI();toggleCustomTZ();"
              "async function scanPeers(){const l=document.getElementById('peers-list');l.innerHTML='Scanning...';"
              "try{const r=await fetch('/api/discover');const p=await r.json();if(!p||!p.length){l.innerHTML='No peers found.';return;}"
              "l.innerHTML=p.map(x=>`<div class='peer-item'><div class='peer-info'><div class='peer-name'>${x.name||x.hostname}</div><div class='peer-sub'>${x.ip}:${x.port} (${x.group})</div></div><button type='button' class='btn-pair' onclick=\"pairPeer('${x.ip}','${x.name||x.hostname}','${x.group||''}')\">Pair</button></div>`).join('');}catch(e){l.innerHTML=e.message;}}"
              "async function pairPeer(ip,n,g){document.getElementById('peerip').value=ip;document.getElementById('peername').value=n;const f=new FormData();f.append('ip',ip);f.append('name',n);if(g)f.append('group',g);await fetch('/api/pair',{method:'POST',body:f});}"
              "</script></body></html>");
    request->send(200, "text/html", html);
  });

  // REST API: GET /api/battery
  server.on("/api/battery", HTTP_GET, [](AsyncWebServerRequest *request) {
    readBatteryState();
    JSONVar obj;
    obj["voltage"] = battery.voltage;
    obj["percentage"] = battery.percentage;
    obj["status"] = battery.status;
    obj["is_poe"] = battery.isPoE;
    obj["is_charging"] = battery.isCharging;
    obj["is_low"] = battery.isLow;
    request->send(200, "application/json", JSON.stringify(obj));
  });

  // REST API: GET /api/status
  server.on("/api/status", HTTP_GET, [](AsyncWebServerRequest *request) {
    readBatteryState();
    JSONVar obj;
    obj["device"] = "Olimex ESP32-PoE2";
    obj["display"] = "Waveshare 1.69inch ST7789V2 (240x280)";
    obj["touch"] = "CST816T I2C (0x15)";
    obj["mode"] = operatingMode;
    obj["screen"] = currentScreen;
    obj["ip"] = getNetworkIPStr();
    obj["battery_voltage"] = battery.voltage;
    obj["battery_percentage"] = battery.percentage;
    obj["battery_status"] = battery.status;
    request->send(200, "application/json", JSON.stringify(obj));
  });

  // REST API: GET /api/config
  server.on("/api/config", HTTP_GET, [](AsyncWebServerRequest *request) {
    readBatteryState();
    JSONVar obj;
    obj["operatingMode"] = operatingMode;
    obj["useDHCP"] = useDHCP;
    obj["staticIP"] = static_ip;
    obj["staticMask"] = static_mask;
    obj["staticGW"] = static_gw;
    obj["staticDNS"] = static_dns;
    obj["rotation"] = (int)(currentRotation * 90);
    obj["batteryVoltage"] = battery.voltage;
    obj["batteryPercent"] = battery.percentage;
    obj["batteryStatus"] = battery.status;
    obj["batteryCharging"] = battery.isCharging;
    obj["isPoE"] = battery.isPoE;
    obj["cuesystemHost"] = cuesystem_host;
    obj["cuesystemPort"] = cuesystem_port;
    obj["cuesystemChannel"] = cuesystem_channel;
    obj["cuesystemAckActive"] = cuesystem_ack_active;
    obj["nmosAutoDisc"] = nmos_auto_discover;
    obj["nmosHost"] = nmos_registry_host;
    obj["nmosPort"] = nmos_registry_port;
    obj["nmosSource"] = nmos_source_id;
    obj["nmosPrgTopic"] = nmos_program_topic;
    obj["nmosPvwTopic"] = nmos_preview_topic;
    obj["nmosAuxTopic"] = nmos_aux_topic;
    obj["nmosOnAir"] = nmos_is_on_air;
    obj["tsl31Port"] = tsl31_port;
    obj["tsl31Transport"] = tsl31_transport;
    obj["tsl31Address"] = tsl31_address;
    obj["tsl31Name"] = tsl31_name;
    obj["tsl50Port"] = tsl50_port;
    obj["tsl50Transport"] = tsl50_transport;
    obj["tsl50Screen"] = tsl50_screen;
    obj["tsl50Index"] = tsl50_index;
    obj["tsl50Name"] = tsl50_name;
    obj["oscCuePort"] = osccue_port;
    obj["oscCueStation"] = osccue_station_id;
    obj["oscCueBanner"] = osccue_banner;
    obj["oscCueState"] = osccue_state;
    obj["timezone"] = timezone_name;
    obj["mtcReader"] = mtc_reader_enabled;
    obj["mtcTimecode"] = mtc_timecode_str;
    obj["envEnabled"] = env_sensor_enabled;
    obj["envTemp"] = env_temperature;
    obj["envHum"] = env_humidity;
    obj["envPress"] = env_pressure;
    obj["promptPort"] = promptside_port;
    obj["promptChannel"] = promptside_channel;
    obj["promptWing"] = promptside_wing_label;
    obj["promptState"] = promptside_state;
    obj["mscPort"] = msc_rtpmidi_port;
    obj["mscDevId"] = msc_device_id;
    obj["mscCurrentCue"] = msc_current_cue;
    obj["mscState"] = msc_state;
    obj["p2pDisconnected"] = p2p_disconnected_state;
    obj["p2pMissed"] = p2p_missed_heartbeats;
    obj["wifiDisabledForEth"] = wifiDisabledForEth;
    obj["deviceName"] = DeviceName;
    obj["doubleBuffer"] = doubleBufferEnabled;
    obj["actualType"] = actualType;
    obj["actualColor"] = actualColor;
    obj["mode"] = isEthernetActive() ? "ETH" : "WIFI";
    obj["ip"] = getNetworkIPStr();
    request->send(200, "application/json", JSON.stringify(obj));
  });

  // REST API: GET /api/env
  server.on("/api/env", HTTP_GET, [](AsyncWebServerRequest *request) {
    readEnvSensor();
    JSONVar obj;
    obj["enabled"] = env_sensor_enabled;
    obj["detected"] = env_sensor_detected;
    obj["temperature"] = env_temperature;
    obj["humidity"] = env_humidity;
    obj["pressure"] = env_pressure;
    obj["unit_temp"] = "C";
    obj["unit_press"] = "hPa";
    request->send(200, "application/json", JSON.stringify(obj));
  });

  // REST API: GET /api/power
  server.on("/api/power", HTTP_GET, [](AsyncWebServerRequest *request) {
    readBatteryState();
    float est_watts = 0.45f;
    if (cpu_freq_mhz == 160) est_watts += 0.22f;
    else if (cpu_freq_mhz == 240) est_watts += 0.48f;
    if (!wifiDisabledForEth) est_watts += 0.32f;
    if (!screen_dimmed) est_watts += 0.14f;

    String json = "{";
    json += "\"cpu_freq_mhz\":" + String(getCpuFrequencyMhz()) + ",";
    json += "\"apb_freq_hz\":" + String(getApbFrequency()) + ",";
    json += "\"screen_dim_timeout_sec\":" + String(screen_dim_timeout_sec) + ",";
    json += "\"screen_dimmed\":" + String(screen_dimmed ? "true" : "false") + ",";
    json += "\"wifi_radio_off\":" + String(wifiDisabledForEth ? "true" : "false") + ",";
    json += "\"battery_voltage\":" + String(battery.voltage, 2) + ",";
    json += "\"battery_percentage\":" + String(battery.percentage) + ",";
    json += "\"battery_status\":\"" + battery.status + "\",";
    json += "\"estimated_power_watts\":" + String(est_watts, 2);
    json += "}";
    request->send(200, "application/json", json);
  });

  // Embedded HTML User Manual
  server.on("/manual", HTTP_GET, [](AsyncWebServerRequest *request) {
    String mHtml = F("<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                     "<title>Olimex ESP32-PoE2 Tally &amp; Cue User Manual</title><style>"
                     "body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#0b1120;color:#e2e8f0;padding:24px;line-height:1.6;max-width:960px;margin:auto}"
                     "h1{color:#38bdf8;font-size:24px;border-bottom:1px solid #1e293b;padding-bottom:12px}"
                     "h2{color:#f8fafc;font-size:18px;margin-top:24px;border-bottom:1px solid #334155;padding-bottom:6px}"
                     ".card{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:18px;margin-bottom:16px}"
                     "code{background:#0f172a;border:1px solid #334155;color:#38bdf8;padding:2px 6px;border-radius:4px;font-size:12px;font-family:monospace}"
                     "</style></head><body>"
                     "<h1>Olimex ESP32-PoE2 + Waveshare 1.69&quot; Touch LCD Manual</h1>"
                     "<div class='card'><h2>CST816T Touch &amp; Battery Readout</h2>"
                     "<ul><li><strong>Single Tap:</strong> Button click equivalent (TSL Return, ETC ACK, Promptside ACK, OSC Cue Light ACK, NMOS toggle, MIDI button message).</li>"
                     "<li><strong>Double Tap (&lt;350ms):</strong> Toggles Screen 0 (Main Tally/Cue) and Screen 1 (Diagnostics Page with matching tally background).</li>"
                     "<li><strong>Long Press (&gt;1.2s):</strong> Cycles backlight brightness (25%, 50%, 75%, 100%).</li>"
                     "<li><strong>Battery ADC (GPIO 35):</strong> Monitors LiPo voltage (2:1 divider), charge %, and MCP73831 status on both screens and <code>/api/battery</code>.</li></ul></div>"
                     "<div class='card'><h2>13 Supported Operating Modes</h2>"
                     "<p>TP, Presenter, TP_P2P (250ms heartbeat), Presenter_P2P (250ms heartbeat), ETC_CueSystem, NMOS_IS07, Promptside, MSC_RTP_MIDI, RTP_MIDI, OSC, TSL_31, TSL_50, OSC_CueLight.</p>"
                     "</div><p><a href='/' style='color:#38bdf8;'>&larr; Return to Dashboard</a></p></body></html>");
    request->send(200, "text/html", mHtml);
  });

  // REST API: GET /api/discover
  server.on("/api/discover", HTTP_GET, [](AsyncWebServerRequest *request) {
    int n = MDNS.queryService("cuelx-tally", "udp");
    JSONVar arr;
    for (int i = 0; i < n; ++i) {
      if (MDNS.address(i).toString() == getNetworkIPStr()) continue;
      JSONVar p;
      p["hostname"] = MDNS.hostname(i);
      p["ip"] = MDNS.address(i).toString();
      p["port"] = (int)MDNS.port(i);
      #if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 2)
      if (MDNS.hasTxt(i, "role"))  p["role"]  = MDNS.txt(i, "role");
      if (MDNS.hasTxt(i, "group")) p["group"] = MDNS.txt(i, "group");
      if (MDNS.hasTxt(i, "name"))  p["name"]  = MDNS.txt(i, "name");
      if (MDNS.hasTxt(i, "mode"))  p["mode"]  = MDNS.txt(i, "mode");
      #else
      p["role"] = isPresenter() ? "tp" : "presenter";
      p["group"] = pairingGroup;
      p["name"] = MDNS.hostname(i);
      #endif
      arr[arr.length()] = p;
    }
    request->send(200, "application/json", JSON.stringify(arr));
  });

  // REST API: POST /api/pair
  server.on("/api/pair", HTTP_POST, [](AsyncWebServerRequest *request) {
    if (request->hasParam("ip", true)) pairedTargetIP = request->getParam("ip", true)->value();
    if (request->hasParam("name", true)) pairedTargetName = request->getParam("name", true)->value();
    if (request->hasParam("group", true)) pairingGroup = request->getParam("group", true)->value();

    preferences.begin("tally-arbiter", false);
    preferences.putString("pairIP", pairedTargetIP);
    preferences.putString("pairName", pairedTargetName);
    preferences.putString("pairGroup", pairingGroup);
    preferences.end();

    renderScreen();
    JSONVar res;
    res["success"] = true;
    res["pairedTargetIP"] = pairedTargetIP;
    res["pairedTargetName"] = pairedTargetName;
    res["pairingGroup"] = pairingGroup;
    request->send(200, "application/json", JSON.stringify(res));
  });

  // Form Save Handler
  server.on("/save", HTTP_POST, [](AsyncWebServerRequest *request) {
    if (request->hasParam("mode", true)) operatingMode = request->getParam("mode", true)->value();
    if (request->hasParam("timezone_name", true)) timezone_name = request->getParam("timezone_name", true)->value();
    if (request->hasParam("custom_tz_posix", true)) custom_tz_posix = request->getParam("custom_tz_posix", true)->value();
    if (request->hasParam("mtc_reader", true)) mtc_reader_enabled = (request->getParam("mtc_reader", true)->value() == "1");
    if (request->hasParam("env_sensor", true)) env_sensor_enabled = (request->getParam("env_sensor", true)->value() == "1");
    if (request->hasParam("rotation", true)) {
      currentRotation = (uint8_t)(request->getParam("rotation", true)->value().toInt() % 4);
      lcd.setRotation(currentRotation);
      initDoubleBuffer();
    }

    if (request->hasParam("prompt_port", true)) promptside_port = request->getParam("prompt_port", true)->value().toInt();
    if (request->hasParam("prompt_chan", true)) promptside_channel = request->getParam("prompt_chan", true)->value();
    if (request->hasParam("prompt_wing", true)) promptside_wing_label = request->getParam("prompt_wing", true)->value();

    if (request->hasParam("msc_port", true)) msc_rtpmidi_port = request->getParam("msc_port", true)->value().toInt();
    if (request->hasParam("msc_dev", true)) msc_device_id = request->getParam("msc_dev", true)->value().toInt();
    if (request->hasParam("msc_fmt", true)) msc_cmd_format = request->getParam("msc_fmt", true)->value().toInt();

    if (request->hasParam("midi_btn_type", true)) midi_btn_type = request->getParam("midi_btn_type", true)->value().toInt();
    if (request->hasParam("midi_btn_chan", true)) midi_btn_channel = request->getParam("midi_btn_chan", true)->value().toInt();
    if (request->hasParam("midi_btn_num", true)) midi_btn_number = request->getParam("midi_btn_num", true)->value().toInt();
    if (request->hasParam("midi_btn_press", true)) midi_btn_val_press = request->getParam("midi_btn_press", true)->value().toInt();
    if (request->hasParam("midi_btn_release", true)) midi_btn_val_release = request->getParam("midi_btn_release", true)->value().toInt();

    if (request->hasParam("ip_dhcp", true)) useDHCP = (request->getParam("ip_dhcp", true)->value() == "1");
    if (request->hasParam("static_ip", true)) static_ip = request->getParam("static_ip", true)->value();
    if (request->hasParam("static_mask", true)) static_mask = request->getParam("static_mask", true)->value();
    if (request->hasParam("static_gw", true)) static_gw = request->getParam("static_gw", true)->value();
    if (request->hasParam("static_dns", true)) static_dns = request->getParam("static_dns", true)->value();

    if (request->hasParam("cue_host", true)) cuesystem_host = request->getParam("cue_host", true)->value();
    if (request->hasParam("cue_port", true)) cuesystem_port = request->getParam("cue_port", true)->value().toInt();
    if (request->hasParam("cue_channel", true)) cuesystem_channel = request->getParam("cue_channel", true)->value().toInt();

    if (request->hasParam("nmos_autodisc", true)) nmos_auto_discover = (request->getParam("nmos_autodisc", true)->value() == "1");
    if (request->hasParam("nmos_host", true)) nmos_registry_host = request->getParam("nmos_host", true)->value();
    if (request->hasParam("nmos_port", true)) nmos_registry_port = request->getParam("nmos_port", true)->value().toInt();
    if (request->hasParam("nmos_source", true)) nmos_source_id = request->getParam("nmos_source", true)->value();
    if (request->hasParam("nmos_prg_topic", true)) nmos_program_topic = request->getParam("nmos_prg_topic", true)->value();
    if (request->hasParam("nmos_pvw_topic", true)) nmos_preview_topic = request->getParam("nmos_pvw_topic", true)->value();
    if (request->hasParam("nmos_aux_topic", true)) nmos_aux_topic = request->getParam("nmos_aux_topic", true)->value();

    if (request->hasParam("tsl31_port", true)) tsl31_port = request->getParam("tsl31_port", true)->value().toInt();
    if (request->hasParam("tsl31_trans", true)) tsl31_transport = request->getParam("tsl31_trans", true)->value();
    if (request->hasParam("tsl31_addr", true)) tsl31_address = request->getParam("tsl31_addr", true)->value().toInt();

    if (request->hasParam("tsl50_port", true)) tsl50_port = request->getParam("tsl50_port", true)->value().toInt();
    if (request->hasParam("tsl50_trans", true)) tsl50_transport = request->getParam("tsl50_trans", true)->value();
    if (request->hasParam("tsl50_screen", true)) tsl50_screen = request->getParam("tsl50_screen", true)->value().toInt();
    if (request->hasParam("tsl50_idx", true)) tsl50_index = request->getParam("tsl50_idx", true)->value().toInt();

    if (request->hasParam("osccue_port", true)) osccue_port = request->getParam("osccue_port", true)->value().toInt();
    if (request->hasParam("osccue_station", true)) osccue_station_id = request->getParam("osccue_station", true)->value();
    if (request->hasParam("osccue_banner", true)) osccue_banner = request->getParam("osccue_banner", true)->value();

    if (request->hasParam("midi_port", true)) rtpmidi_port = request->getParam("midi_port", true)->value().toInt();
    if (request->hasParam("midi_chan", true)) rtpmidi_channel = request->getParam("midi_chan", true)->value().toInt();
    if (request->hasParam("midi_trig", true)) rtpmidi_trigger_type = request->getParam("midi_trig", true)->value().toInt();
    if (request->hasParam("midi_red", true)) rtpmidi_num_red = request->getParam("midi_red", true)->value().toInt();
    if (request->hasParam("midi_flash", true)) rtpmidi_num_flash_red = request->getParam("midi_flash", true)->value().toInt();
    if (request->hasParam("midi_green", true)) rtpmidi_num_green = request->getParam("midi_green", true)->value().toInt();
    if (request->hasParam("midi_yellow", true)) rtpmidi_num_yellow = request->getParam("midi_yellow", true)->value().toInt();
    if (request->hasParam("midi_blue", true)) rtpmidi_num_blue = request->getParam("midi_blue", true)->value().toInt();
    if (request->hasParam("midi_white", true)) rtpmidi_num_white = request->getParam("midi_white", true)->value().toInt();

    if (request->hasParam("osc_port", true)) osc_port = request->getParam("osc_port", true)->value().toInt();
    if (request->hasParam("osc_prefix", true)) osc_prefix = request->getParam("osc_prefix", true)->value();
    if (request->hasParam("osc_msg", true)) osc_custom_message = request->getParam("osc_msg", true)->value();

    if (request->hasParam("group", true)) pairingGroup = request->getParam("group", true)->value();
    if (request->hasParam("pairedip", true)) pairedTargetIP = request->getParam("pairedip", true)->value();
    if (request->hasParam("pairedname", true)) pairedTargetName = request->getParam("pairedname", true)->value();
    if (request->hasParam("host", true)) request->getParam("host", true)->value().toCharArray(tallyarbiter_host, 40);
    if (request->hasParam("port", true)) request->getParam("port", true)->value().toCharArray(tallyarbiter_port, 6);
    if (request->hasParam("tslport", true)) request->getParam("tslport", true)->value().toCharArray(tallyarbiter_TSLport, 6);
    else if (request->hasParam("tslport_p2p", true)) request->getParam("tslport_p2p", true)->value().toCharArray(tallyarbiter_TSLport, 6);
    if (request->hasParam("devicename", true)) listenerDeviceName = request->getParam("devicename", true)->value();

    if (request->hasParam("cpu_freq", true)) cpu_freq_mhz = request->getParam("cpu_freq", true)->value().toInt();
    if (request->hasParam("dim_timeout", true)) screen_dim_timeout_sec = request->getParam("dim_timeout", true)->value().toInt();

    preferences.begin("tally-arbiter", false);
    preferences.putString("opMode", operatingMode);
    preferences.putString("tzName", timezone_name);
    preferences.putString("tzPosix", custom_tz_posix);
    preferences.putBool("mtcReader", mtc_reader_enabled);
    preferences.putBool("envSensor", env_sensor_enabled);
    preferences.putUChar("rotation", currentRotation);
    preferences.putInt("promptPort", promptside_port);
    preferences.putString("promptChan", promptside_channel);
    preferences.putString("promptWing", promptside_wing_label);
    preferences.putInt("mscPort", msc_rtpmidi_port);
    preferences.putInt("mscDev", msc_device_id);
    preferences.putInt("mscFmt", msc_cmd_format);
    preferences.putInt("mBtnType", midi_btn_type);
    preferences.putInt("mBtnChan", midi_btn_channel);
    preferences.putInt("mBtnNum", midi_btn_number);
    preferences.putInt("mBtnPress", midi_btn_val_press);
    preferences.putInt("mBtnRel", midi_btn_val_release);
    preferences.putBool("useDHCP", useDHCP);
    preferences.putString("staticIP", static_ip);
    preferences.putString("staticMask", static_mask);
    preferences.putString("staticGW", static_gw);
    preferences.putString("staticDNS", static_dns);
    preferences.putString("cueHost", cuesystem_host);
    preferences.putInt("cuePort", cuesystem_port);
    preferences.putInt("cueChan", cuesystem_channel);
    preferences.putBool("nmosAutoDisc", nmos_auto_discover);
    preferences.putString("nmosHost", nmos_registry_host);
    preferences.putInt("nmosPort", nmos_registry_port);
    preferences.putString("nmosSrc", nmos_source_id);
    preferences.putString("nmosPrg", nmos_program_topic);
    preferences.putString("nmosPvw", nmos_preview_topic);
    preferences.putString("nmosAux", nmos_aux_topic);
    preferences.putInt("tsl31Port", tsl31_port);
    preferences.putString("tsl31Trans", tsl31_transport);
    preferences.putInt("tsl31Addr", tsl31_address);
    preferences.putInt("tsl50Port", tsl50_port);
    preferences.putString("tsl50Trans", tsl50_transport);
    preferences.putInt("tsl50Screen", tsl50_screen);
    preferences.putInt("tsl50Idx", tsl50_index);
    preferences.putInt("oscCuePort", osccue_port);
    preferences.putString("oscCueStation", osccue_station_id);
    preferences.putString("oscCueBanner", osccue_banner);
    preferences.putInt("midiPort", rtpmidi_port);
    preferences.putInt("midiChan", rtpmidi_channel);
    preferences.putInt("midiTrig", rtpmidi_trigger_type);
    preferences.putInt("midiRed", rtpmidi_num_red);
    preferences.putInt("midiFlash", rtpmidi_num_flash_red);
    preferences.putInt("midiGreen", rtpmidi_num_green);
    preferences.putInt("midiYellow", rtpmidi_num_yellow);
    preferences.putInt("midiBlue", rtpmidi_num_blue);
    preferences.putInt("midiWhite", rtpmidi_num_white);
    preferences.putInt("oscPort", osc_port);
    preferences.putString("oscPrefix", osc_prefix);
    preferences.putString("oscMsg", osc_custom_message);
    preferences.putString("pairGroup", pairingGroup);
    preferences.putString("pairIP", pairedTargetIP);
    preferences.putString("pairName", pairedTargetName);
    preferences.putString("taHost", tallyarbiter_host);
    preferences.putString("taPort", tallyarbiter_port);
    preferences.putString("taTSLPort", tallyarbiter_TSLport);
    preferences.putString("taListenerName", listenerDeviceName);
    preferences.putInt("cpuFreq", cpu_freq_mhz);
    preferences.putInt("dimTimeout", screen_dim_timeout_sec);
    preferences.end();

    applyNetworkIPConfig();
    applyTimezoneConfig();
    applyPowerManagementConfig();

    if (operatingMode == "TSL_31" && tsl31_transport == "TCP") setupTSLTcpServer(tsl31_port);
    else if (operatingMode == "TSL_50" && tsl50_transport == "TCP") setupTSLTcpServer(tsl50_port);
    else if (tslTcpServer != nullptr) {
      tslTcpServer->end();
      delete tslTcpServer;
      tslTcpServer = nullptr;
    }

    if (networkConnected) {
      udp.stop();
      udp.begin(getActiveListenPort());
      if (isNMOSIS07() && nmos_auto_discover) discoverNMOSRegistrationServer();
    }

    MDNS.addServiceTxt("cuelx-tally", "udp", "mode", operatingMode.c_str());
    MDNS.addServiceTxt("cuelx-tally", "udp", "group", pairingGroup.c_str());
    MDNS.addServiceTxt("cuelx-tally", "udp", "name", listenerDeviceName.c_str());

    if (usesTallyArbiter()) connectToServer();
    else disconnectFromServer();

    request->send(200, "text/html", "<html><body style='background:#0f172a;color:#f1f5f9;font-family:sans-serif;padding:30px;'>"
                                    "<h2>Configuration Saved!</h2>"
                                    "<p>Mode: <strong>" + operatingMode + "</strong></p>"
                                    "<p>IP Mode: <strong>" + (useDHCP ? String("DHCP") : (String("Static: ") + static_ip)) + "</strong></p>"
                                    "<a href='/' style='color:#38bdf8;text-decoration:none;font-weight:600;'>Return to Dashboard</a></body></html>");
    renderScreen();
  });

  server.begin();
  logger("[WebServer] AsyncWebServer started on port 80", "info");
}

// ==========================================
// Setup
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(100);

  logger("=======================================================", "info");
  logger("  Olimex ESP32-PoE2 Tally & Cue Light System", "info");
  logger("  Display: Waveshare 1.69\" ST7789V2 (240x280)", "info");
  logger("  Touch:   CST816T I2C (1-Tap=Action, 2-Tap=Diag)", "info");
  logger("  Power:   MCP73831 Charger + GPIO 35 Battery ADC", "info");
  logger("=======================================================", "info");

  // Load Preferences first so rotation/brightness/power apply cleanly
  preferences.begin("tally-arbiter", false);
  if (preferences.getString("deviceid").length() > 0)       DeviceId = preferences.getString("deviceid");
  if (preferences.getString("devicename").length() > 0)     DeviceName = preferences.getString("devicename");
  if (preferences.getString("opMode").length() > 0)         operatingMode = preferences.getString("opMode");
  if (preferences.isKey("useDHCP"))                         useDHCP = preferences.getBool("useDHCP", true);
  if (preferences.getString("staticIP").length() > 0)       static_ip = preferences.getString("staticIP");
  if (preferences.getString("staticMask").length() > 0)     static_mask = preferences.getString("staticMask");
  if (preferences.getString("staticGW").length() > 0)       static_gw = preferences.getString("staticGW");
  if (preferences.getString("staticDNS").length() > 0)      static_dns = preferences.getString("staticDNS");
  if (preferences.isKey("rotation"))                        currentRotation = preferences.getUChar("rotation", 0) % 4;
  if (preferences.getString("cueHost").length() > 0)        cuesystem_host = preferences.getString("cueHost");
  if (preferences.isKey("cuePort"))                         cuesystem_port = preferences.getInt("cuePort", 4000);
  if (preferences.isKey("cueChan"))                         cuesystem_channel = preferences.getInt("cueChan", 1);
  if (preferences.isKey("nmosAutoDisc"))                    nmos_auto_discover = preferences.getBool("nmosAutoDisc", true);
  if (preferences.getString("nmosHost").length() > 0)       nmos_registry_host = preferences.getString("nmosHost");
  if (preferences.isKey("nmosPort"))                        nmos_registry_port = preferences.getInt("nmosPort", 8235);
  if (preferences.getString("nmosSrc").length() > 0)        nmos_source_id = preferences.getString("nmosSrc");
  if (preferences.getString("nmosPrg").length() > 0)        nmos_program_topic = preferences.getString("nmosPrg");
  if (preferences.getString("nmosPvw").length() > 0)        nmos_preview_topic = preferences.getString("nmosPvw");
  if (preferences.getString("nmosAux").length() > 0)        nmos_aux_topic = preferences.getString("nmosAux");
  if (preferences.isKey("tsl31Port"))                       tsl31_port = preferences.getInt("tsl31Port", 8910);
  if (preferences.getString("tsl31Trans").length() > 0)     tsl31_transport = preferences.getString("tsl31Trans");
  if (preferences.isKey("tsl31Addr"))                       tsl31_address = preferences.getInt("tsl31Addr", 0);
  if (preferences.isKey("tsl50Port"))                       tsl50_port = preferences.getInt("tsl50Port", 8900);
  if (preferences.getString("tsl50Trans").length() > 0)     tsl50_transport = preferences.getString("tsl50Trans");
  if (preferences.isKey("tsl50Screen"))                     tsl50_screen = preferences.getInt("tsl50Screen", 0);
  if (preferences.isKey("tsl50Idx"))                        tsl50_index = preferences.getInt("tsl50Idx", 0);
  if (preferences.isKey("oscCuePort"))                      osccue_port = preferences.getInt("oscCuePort", 53000);
  if (preferences.getString("oscCueStation").length() > 0)  osccue_station_id = preferences.getString("oscCueStation");
  if (preferences.getString("oscCueBanner").length() > 0)   osccue_banner = preferences.getString("oscCueBanner");
  if (preferences.isKey("midiPort"))                        rtpmidi_port = preferences.getInt("midiPort", 5004);
  if (preferences.isKey("midiChan"))                        rtpmidi_channel = preferences.getInt("midiChan", 1);
  if (preferences.isKey("midiTrig"))                        rtpmidi_trigger_type = preferences.getInt("midiTrig", 0);
  if (preferences.isKey("midiRed"))                         rtpmidi_num_red = preferences.getInt("midiRed", 60);
  if (preferences.isKey("midiFlash"))                       rtpmidi_num_flash_red = preferences.getInt("midiFlash", 61);
  if (preferences.isKey("midiGreen"))                       rtpmidi_num_green = preferences.getInt("midiGreen", 62);
  if (preferences.isKey("midiYellow"))                      rtpmidi_num_yellow = preferences.getInt("midiYellow", 63);
  if (preferences.isKey("midiBlue"))                        rtpmidi_num_blue = preferences.getInt("midiBlue", 64);
  if (preferences.isKey("midiWhite"))                       rtpmidi_num_white = preferences.getInt("midiWhite", 65);
  if (preferences.isKey("oscPort"))                         osc_port = preferences.getInt("oscPort", 8000);
  if (preferences.getString("oscPrefix").length() > 0)      osc_prefix = preferences.getString("oscPrefix");
  if (preferences.getString("oscMsg").length() > 0)         osc_custom_message = preferences.getString("oscMsg");
  if (preferences.getString("pairGroup").length() > 0)      pairingGroup = preferences.getString("pairGroup");
  if (preferences.getString("pairIP").length() > 0)         pairedTargetIP = preferences.getString("pairIP");
  if (preferences.getString("pairName").length() > 0)       pairedTargetName = preferences.getString("pairName");
  if (preferences.getString("taHost").length() > 0)         preferences.getString("taHost").toCharArray(tallyarbiter_host, 40);
  if (preferences.getString("taPort").length() > 0)         preferences.getString("taPort").toCharArray(tallyarbiter_port, 6);
  if (preferences.getString("taTSLPort").length() > 0)      preferences.getString("taTSLPort").toCharArray(tallyarbiter_TSLport, 6);
  if (preferences.getString("taListenerName").length() > 0) listenerDeviceName = preferences.getString("taListenerName");
  if (preferences.getString("tzName").length() > 0)         timezone_name = preferences.getString("tzName");
  if (preferences.getString("tzPosix").length() > 0)        custom_tz_posix = preferences.getString("tzPosix");
  if (preferences.isKey("mtcReader"))                       mtc_reader_enabled = preferences.getBool("mtcReader", false);
  if (preferences.isKey("envSensor"))                       env_sensor_enabled = preferences.getBool("envSensor", false);
  if (preferences.isKey("promptPort"))                      promptside_port = preferences.getInt("promptPort", 8000);
  if (preferences.getString("promptChan").length() > 0)     promptside_channel = preferences.getString("promptChan");
  if (preferences.getString("promptWing").length() > 0)     promptside_wing_label = preferences.getString("promptWing");
  if (preferences.isKey("mscPort"))                         msc_rtpmidi_port = preferences.getInt("mscPort", 5004);
  if (preferences.isKey("mscDev"))                          msc_device_id = preferences.getInt("mscDev", 0x7F);
  if (preferences.isKey("mscFmt"))                          msc_cmd_format = preferences.getInt("mscFmt", 0x7F);
  if (preferences.isKey("mBtnType"))                        midi_btn_type = preferences.getInt("mBtnType", 1);
  if (preferences.isKey("mBtnChan"))                        midi_btn_channel = preferences.getInt("mBtnChan", 1);
  if (preferences.isKey("mBtnNum"))                         midi_btn_number = preferences.getInt("mBtnNum", 60);
  if (preferences.isKey("mBtnPress"))                       midi_btn_val_press = preferences.getInt("mBtnPress", 127);
  if (preferences.isKey("mBtnRel"))                         midi_btn_val_release = preferences.getInt("mBtnRel", 0);
  if (preferences.isKey("cpuFreq"))                         cpu_freq_mhz = preferences.getInt("cpuFreq", 80);
  if (preferences.isKey("dimTimeout"))                      screen_dim_timeout_sec = preferences.getInt("dimTimeout", 60);
  preferences.end();

  // Initialize Waveshare 1.69" LCD & allocate 134.4 KB Double Buffer BEFORE network stacks
  lcd.init();
  lcd.setRotation(currentRotation);
  lcd.setBrightness(brightnessLevels[brightnessIndex]);
  initDoubleBuffer();

  // Boot Splash
  if (doubleBufferEnabled) {
    canvas.fillScreen(TFT_BLACK);
    canvas.setTextColor(TFT_WHITE, TFT_BLACK);
    canvas.setTextDatum(middle_center);
    canvas.setTextSize(2);
    canvas.drawString("OLIMEX PoE2", canvas.width() / 2, canvas.height() / 2 - 20);
    canvas.setTextColor(TFT_CYAN, TFT_BLACK);
    canvas.drawString("Tally & Cue LX", canvas.width() / 2, canvas.height() / 2 + 10);
    canvas.pushSprite(0, 0);
  } else {
    lcd.fillScreen(TFT_BLACK);
  }

  initBatteryADC();
  initCST816TTouch();
  applyTimezoneConfig();
  applyPowerManagementConfig();

  // Create unique listener name using MAC
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char macSuffix[10];
  snprintf(macSuffix, sizeof(macSuffix), "%02X%02X%02X", mac[3], mac[4], mac[5]);
  if (!listenerDeviceName.endsWith(macSuffix)) listenerDeviceName += macSuffix;

  if (operatingMode == "TSL_31" && tsl31_transport == "TCP") setupTSLTcpServer(tsl31_port);
  else if (operatingMode == "TSL_50" && tsl50_transport == "TCP") setupTSLTcpServer(tsl50_port);

  // Setup Ethernet Event Handlers BEFORE ETH.begin()
  WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
    switch (event) {
      case ARDUINO_EVENT_ETH_START:
        logger("[ETH] LAN8720A RMII driver started", "info");
        ETH.setHostname(listenerDeviceName.c_str());
        break;
      case ARDUINO_EVENT_ETH_CONNECTED:
        logger("[ETH] Cable connected (Link UP)", "info");
        break;
      case ARDUINO_EVENT_ETH_GOT_IP:
        logger(String("[ETH] IP Assigned: ") + ETH.localIP().toString(), "info");
        networkConnected = true;
        battery.isPoE = true;
        udp.begin(getActiveListenPort());
        if (isNMOSIS07() && nmos_auto_discover) discoverNMOSRegistrationServer();
        if (usesTallyArbiter()) connectToServer();
        renderScreen();
        break;
      case ARDUINO_EVENT_ETH_LOST_IP:
      case ARDUINO_EVENT_ETH_DISCONNECTED:
        logger("[ETH] Cable disconnected", "info");
        battery.isPoE = false;
        if (WiFi.status() != WL_CONNECTED) {
          networkConnected = false;
          disconnectFromServer();
        }
        renderScreen();
        break;
      case ARDUINO_EVENT_ETH_STOP:
        if (WiFi.status() != WL_CONNECTED) networkConnected = false;
        break;
      default:
        break;
    }
  });

  // Initialize Olimex LAN8720A RMII Ethernet
  logger("[ETH] Initializing Olimex LAN8720A RMII (ADDR=0, MDC=23, MDIO=18, PWR=12, CLK=GPIO0_IN)...", "info");
  applyNetworkIPConfig();
  if (!ETH.begin(ETH_PHY_TYPE, ETH_PHY_ADDR, ETH_PHY_MDC, ETH_PHY_MDIO, ETH_PHY_POWER, ETH_CLK_MODE)) {
    logger("[ETH] ERROR: ETH.begin returned false!", "error");
  }

  // Setup MycilaESPConnect for Wi-Fi / Captive Portal Fallback
  espConnect.listen([](Mycila::ESPConnect::State previous, Mycila::ESPConnect::State current) {
    if (current == Mycila::ESPConnect::State::NETWORK_CONNECTED) {
      networkConnected = true;
      udp.begin(getActiveListenPort());
      if (isNMOSIS07() && nmos_auto_discover) discoverNMOSRegistrationServer();
      if (usesTallyArbiter()) connectToServer();
      renderScreen();
    } else if (current == Mycila::ESPConnect::State::NETWORK_DISCONNECTED && !isEthernetActive()) {
      networkConnected = false;
      disconnectFromServer();
      renderScreen();
    }
  });

  setupWebServer();

  espConnect.setBlocking(false);
  espConnect.begin(listenerDeviceName.c_str(), listenerDeviceName.c_str());

  ArduinoOTA.setHostname(listenerDeviceName.c_str());
  ArduinoOTA.setPassword("tallyarbiter");
  ArduinoOTA.begin();

  if (MDNS.begin(mdnsdotlocalurl.c_str())) {
    MDNS.addService("CueLX", "tcp", 80);
    MDNS.addService("http", "tcp", 80);
    uint16_t mDnsPort = getActiveListenPort();
    MDNS.addService("cuelx-tally", "udp", mDnsPort);
    MDNS.addServiceTxt("cuelx-tally", "udp", "mode", operatingMode.c_str());
    MDNS.addServiceTxt("cuelx-tally", "udp", "group", pairingGroup.c_str());
    MDNS.addServiceTxt("cuelx-tally", "udp", "name", listenerDeviceName.c_str());
  }

  last_user_or_tally_act = millis();
  renderScreen();

  // Start Socket.IO background task pinned to Core 0 (PRO_CPU)
  xTaskCreatePinnedToCore(socketTask, "socketTask", 8192, NULL, 1, &socketTaskHandle, 0);
}

// ==========================================
// Main Loop (Core 1: Touch, LCD, Battery, UDP)
// ==========================================
void loop() {
  espConnect.loop();
  ArduinoOTA.handle();
  processTouchEvents();

  // Ethernet Precedence check every 500ms
  static unsigned long lastEthPrecedenceCheck = 0;
  if (millis() - lastEthPrecedenceCheck >= 500) {
    lastEthPrecedenceCheck = millis();
    checkEthernetWifiPrecedence();
  }

  // Power & Thermal Management: Auto-dim display when idle in Standby/Off
  if (screen_dim_timeout_sec > 0) {
    bool isLiveOnAir = (actualType == "\"program\"" || actualType == "\"preview\"" ||
                        cuesystem_ack_active || promptside_state == "go" || msc_state == "go" ||
                        midi_active_red || osc_active_red || nmos_program_active || osccue_state == "go");
    if (isLiveOnAir) {
      last_user_or_tally_act = millis();
      if (screen_dimmed) wakeDisplayFromDim();
    } else if (!screen_dimmed && (millis() - last_user_or_tally_act >= (unsigned long)screen_dim_timeout_sec * 1000)) {
      screen_dimmed = true;
      lcd.setBrightness(25);
      logger("[Power] Idle timeout reached; display dimmed to 10%", "info");
    }
  }

  processIncomingTSL();
  handleP2PHeartbeatCheck();
  readEnvSensor();

  // Handle Tally Arbiter flash request
  if (flashRequested) {
    flashRequested = false;
    wakeDisplayFromDim();
    for (int i = 0; i < 3; i++) {
      if (doubleBufferEnabled) {
        canvas.fillScreen(TFT_WHITE); canvas.pushSprite(0, 0); delay(100);
        canvas.fillScreen(TFT_BLACK); canvas.pushSprite(0, 0); delay(100);
      } else {
        lcd.fillScreen(TFT_WHITE); delay(100);
        lcd.fillScreen(TFT_BLACK); delay(100);
      }
    }
    renderScreen();
  }

  // Smooth Flashing & Text Ticker
  static unsigned long lastFlashTickerTime = 0;
  bool isFlashing = (isETCCueSystem() && actualType == "\"standby\"" && !cuesystem_ack_active) ||
                    (actualType == "\"flashred\"") ||
                    (isOSCCueLight() && osccue_state == "standby_ack" && !osccue_ack_done) ||
                    (isPromptside() && promptside_state == "standby_ack" && !promptside_ack_done) ||
                    (isP2PMode() && p2p_disconnected_state);
  bool isTicker = (isOSC() && osc_custom_message.length() > 10) ||
                  ((isTSL31Listener() || isTSL50Listener()) && (isTSL31Listener() ? tsl31_name : tsl50_name).length() > 10) ||
                  (isPromptside() && promptside_cue_text.length() > 10);

  if (isFlashing && millis() - lastFlashTickerTime >= 200) {
    lastFlashTickerTime = millis();
    renderScreen();
  } else if (isTicker && millis() - lastFlashTickerTime >= 35) {
    lastFlashTickerTime = millis();
    renderScreen();
  }

  // Smooth 1-Second Clock & Battery Refresh Rollover Detection
  time_t currentEpoch;
  time(&currentEpoch);
  static time_t lastEpoch = 0;
  static unsigned long lastUptimeSecond = 0;
  unsigned long currentUptimeSecond = millis() / 1000;

  bool secondChanged = false;
  if (currentEpoch > 100000) {
    if (currentEpoch != lastEpoch) { lastEpoch = currentEpoch; secondChanged = true; }
  } else if (currentUptimeSecond != lastUptimeSecond) {
    lastUptimeSecond = currentUptimeSecond; secondChanged = true;
  }

  // Periodic TP state refresh ONLY in standalone P2P mode (never in Tally Arbiter mode,
  // where a blind 0x30 packet from TP would overwrite Presenter's active Preview tally)
  static unsigned long lastTPBroadcast = 0;
  if (millis() - lastTPBroadcast >= 2000) {
    lastTPBroadcast = millis();
    if (networkConnected && isP2PMode() && isTP()) sendtally(1, ch1state);
  }

  if (tallyStateChanged) {
    tallyStateChanged = false;
    renderScreen();
  } else if (secondChanged) {
    renderClockTick();
  }

  vTaskDelay(pdMS_TO_TICKS((isFlashing || isTicker) ? 1 : 2));
}

// ==========================================
// Tally Arbiter Socket.IO Client Logic (Core 0)
// ==========================================
void socketTask(void *pvParameters) {
  for (;;) {
    if (networkConnected && usesTallyArbiter()) socket.loop();
    vTaskDelay(pdMS_TO_TICKS(5));
  }
}

void ws_emit(String event, const char *payload) {
  if (payload) socket.sendEVENT("[\"" + event + "\"," + payload + "]");
  else socket.sendEVENT("[\"" + event + "\"]");
}

void connectToServer() {
  if (!networkConnected) return;
  socket.onEvent(socket_event);
  socket.setReconnectInterval(5000);
  socket.begin(tallyarbiter_host, atol(tallyarbiter_port));
}

void disconnectFromServer() {
  if (socket.isConnected()) socket.disconnect();
}

void socket_event(socketIOmessageType_t type, uint8_t *payload, size_t length) {
  String eventMsg = "", eventType = "", eventContent = "";
  switch (type) {
    case sIOtype_CONNECT: socket_Connected((char *)payload, length); break;
    case sIOtype_DISCONNECT: tallyStateChanged = true; break;
    case sIOtype_EVENT:
      eventMsg = (char *)payload;
      eventType = eventMsg.substring(2, eventMsg.indexOf("\"", 2));
      eventContent = eventMsg.substring(eventType.length() + 4);
      eventContent.remove(eventContent.length() - 1);
      if (eventType == "bus_options") BusOptions = JSON.parse(eventContent);
      if (eventType == "reassign") socket_Reassign(eventContent);
      if (eventType == "flash") socket_Flash();
      if (eventType == "messaging") socket_Messaging(eventContent);
      if (eventType == "deviceId") {
        DeviceId = eventContent.substring(1, eventContent.length() - 1);
        SetDeviceName();
        showDeviceInfo();
      }
      if (eventType == "devices") {
        Devices = JSON.parse(eventContent);
        SetDeviceName();
      }
      if (eventType == "device_states") {
        DeviceStates = JSON.parse(eventContent);
        processTallyData();
      }
      break;
    default: break;
  }
}

void socket_Connected(const char *payload, size_t length) {
  String deviceObj = "{\"deviceId\": \"" + DeviceId + "\", \"listenerType\": \"" + listenerDeviceName + "\", \"canBeReassigned\": true, \"canBeFlashed\": true, \"supportsChat\": true }";
  ws_emit("listenerclient_connect", deviceObj.c_str());
  tallyStateChanged = true;
}

void socket_Flash() { flashRequested = true; }

void socket_Reassign(String payload) {
  int commaIndex = payload.indexOf(',');
  String oldDeviceId = payload.substring(0, commaIndex);
  String newDeviceId = payload.substring(commaIndex + 1);
  newDeviceId = newDeviceId.substring(0, newDeviceId.indexOf(','));
  oldDeviceId.replace("\"", "");
  newDeviceId.replace("\"", "");
  String reassignObj = "{\"oldDeviceId\": \"" + oldDeviceId + "\", \"newDeviceId\": \"" + newDeviceId + "\"}";
  ws_emit("listener_reassign_object", reassignObj.c_str());
  ws_emit("devices");
  DeviceId = newDeviceId;
  preferences.begin("tally-arbiter", false);
  preferences.putString("deviceid", newDeviceId);
  preferences.end();
  SetDeviceName();
}

void socket_Messaging(String payload) {
  int typeQuoteIndex = payload.indexOf(',');
  String messageType = payload.substring(0, typeQuoteIndex);
  messageType.replace("\"", "");
  int messageQuoteIndex = payload.lastIndexOf(',');
  String message = payload.substring(messageQuoteIndex + 1);
  message.replace("\"", "");
  LastMessage = messageType + ": " + message;
  evaluateMode();
}

void processTallyData() {
  bool typeChanged = false;
  bool hasProgram = false;
  bool hasPreview = false;
  String bestType = "";
  String bestColor = "";
  int bestPriority = -1;

  for (int i = 0; i < DeviceStates.length(); i++) {
    if (DeviceStates[i]["sources"].length() > 0) {
      String busId = JSON.stringify(DeviceStates[i]["busId"]);
      String bType = getBusTypeById(busId);
      String bColor = getBusColorById(busId);
      int bPriority = getBusPriorityById(busId);

      if (bType == "\"program\"") hasProgram = true;
      else if (bType == "\"preview\"") hasPreview = true;

      if (!typeChanged || bType == "\"program\"" ||
          (bestType != "\"program\"" && (bPriority > bestPriority || (bPriority == bestPriority && bType == "\"preview\"")))) {
        bestType = bType;
        bestColor = bColor;
        bestPriority = bPriority;
      }
      typeChanged = true;
    }
  }
  if (!typeChanged) {
    actualType = "";
    actualColor = "";
    actualPriority = 0;
  } else {
    actualType = bestType;
    actualColor = bestColor;
    actualPriority = bestPriority;
  }

  // Keep local ch1state synced with Tally Arbiter server state
  // (e.g., if TP activates Program, Presenter's ch1state resets cleanly to false)
  if (usesTallyArbiter()) {
    if (isTP()) ch1state = hasProgram;
    else if (isPresenter()) ch1state = hasPreview;
  }

  evaluateMode();
}

String getBusTypeById(String busId) {
  for (int i = 0; i < BusOptions.length(); i++) {
    if (JSON.stringify(BusOptions[i]["id"]) == busId) return JSON.stringify(BusOptions[i]["type"]);
  }
  return "invalid";
}

String getBusColorById(String busId) {
  for (int i = 0; i < BusOptions.length(); i++) {
    if (JSON.stringify(BusOptions[i]["id"]) == busId) return JSON.stringify(BusOptions[i]["color"]);
  }
  return "invalid";
}

int getBusPriorityById(String busId) {
  for (int i = 0; i < BusOptions.length(); i++) {
    if (JSON.stringify(BusOptions[i]["id"]) == busId) return (int)JSON.stringify(BusOptions[i]["priority"]).toInt();
  }
  return 0;
}

void SetDeviceName() {
  for (int i = 0; i < Devices.length(); i++) {
    if (JSON.stringify(Devices[i]["id"]) == "\"" + DeviceId + "\"") {
      String strDevice = JSON.stringify(Devices[i]["name"]);
      DeviceName = strDevice.substring(1, strDevice.length() - 1);
      break;
    }
  }
  preferences.begin("tally-arbiter", false);
  preferences.putString("devicename", DeviceName);
  preferences.end();
  evaluateMode();
}

void logger(String strLog, String strType) {
  Serial.println(strLog);
}
