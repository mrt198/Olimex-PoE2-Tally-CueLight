# Olimex ESP32-PoE2 with Waveshare 1.69" Touch LCD Module Tally & Cue System

Broadcast tally and theatrical cue light firmware adapted specifically for the **Olimex ESP32-PoE2** board paired with the **Waveshare 1.69inch Touch LCD Module** (ST7789V2 240×280 IPS display with CST816T capacitive touch).

---

## 🌟 Key Adaptations for Olimex ESP32-PoE2 & Waveshare 1.69" Touch

### 1. Touch Gesture Navigation (Replacing Mechanical Button)
The Waveshare 1.69" module features an onboard **CST816T capacitive touch controller** connected over I2C (`SDA: GPIO 33`, `SCL: GPIO 32`, `INT: GPIO 34`, `RST: GPIO 4` shared with LCD RST):
* **Single Tap on Screen:** Exact equivalent of clicking the physical button.
  * In **TP Mode:** Toggles Channel 1 Program TSL return cue (`sendtally(1, state)`).
  * In **Presenter Mode:** Toggles Channel 1 Preview TSL return cue (`0x31`).
  * In **ETC CueSystem Mode:** Acknowledges Standby call (`CS,<ch>,ACK\n`), turning flashing red into solid red.
  * In **NMOS IS-07 Mode:** Toggles On-Air tally state.
  * In **Promptside / OSC Cue Light Mode:** Transmits stage acknowledgment packet.
* **Double Tap on Screen:** Instantly switches between **Screen 0 (Main Tally / Cue Display)** and **Screen 1 (Network & Diagnostics Page)**.
* **Long Press (>1.2s):** Cycles display backlight brightness ($25\% \to 50\% \to 75\% \to 100\%$).

### 2. LiPo Battery Charge Level & Status Readout
The Olimex ESP32-PoE2 includes an onboard **Microchip MCP73831 LiPo battery charger** and JST battery connector:
* **ADC Battery Voltage Sensing:** Connected to **GPIO 35 (ADC1_CH7)** through a built-in 2:1 precision resistor divider.
* **Voltage Calculation:** $V_{\text{bat}} = V_{\text{ADC}} \times 2.0$.
* **Charge Percentage (%):** Calculated using a calibrated 4-segment LiPo discharge curve ($3.20\text{V} = 0\%$ to $4.20\text{V} = 100\%$).
* **Power Source & Status Readout:**
  * **PoE Active (Charging):** Displayed with ⚡ bolt when powered by IEEE 802.3af PoE and battery is charging.
  * **PoE Powered (Full):** Indicated when PoE is active and battery reaches $\ge 4.15\text{V}$.
  * **LiPo Discharging:** Live battery voltage (e.g. `3.92V`) and charge level (e.g. `78%`) when running untethered.
  * **Low Battery Alert:** Visual warning triggered when battery drops below $3.40\text{V}$ ($\le 15\%$).
* **Dual-Screen Presence:** Displayed continuously on Screen 0's top status header and in the Screen 1 diagnostics dashboard.
* **REST API:** Live battery telemetry available at `/api/battery` and `/api/status`.

### 3. Native LAN8720A RMII Ethernet (Hardware MAC)
* Uses native ESP32 RMII EMAC connected to the onboard **Microchip LAN8720A** PHY transceiver with **IEEE 802.3af PoE**.
* Operates at full 10/100 Mbps wire speed with sub-millisecond UDP latency.
* **Pinout:**
  * MDC: `GPIO 23`
  * MDIO: `GPIO 18`
  * Power: `GPIO 12`
  * 50 MHz Clock: `GPIO 0` (`ETH_CLOCK_GPIO0_IN`)
  * PHY Address: `0`

### 4. Double-Buffered 240×280 IPS Display (Zero Flicker)
* **Screen:** 1.69" 240×280 pixel IPS LCD with ST7789V2 controller.
* **Buffer Size:** $240 \times 280 \times 2\text{ bytes} = 134{,}400\text{ bytes } (\approx 134\text{ KB})$.
* Composed completely in off-screen RAM and blitted to the display via SPI DMA burst for 100% flicker-free transitions.
* **SPI Pinout:** MOSI: `GPIO 13`, SCLK: `GPIO 14`, CS: `GPIO 15`, DC: `GPIO 2`, RST: `GPIO 4`, BL: `GPIO 5` (GPIO 21 is reserved for `EMAC_TX_EN`).

---

## 🛠️ Pinout Mapping Table

| Subsystem | Signal | Olimex ESP32-PoE2 GPIO | Notes |
| :--- | :--- | :--- | :--- |
| **Ethernet** | MDC | **GPIO 23** | LAN8720A Management Data Clock |
| **Ethernet** | MDIO | **GPIO 18** | LAN8720A Management Data I/O |
| **Ethernet** | Power | **GPIO 12** | LAN8720A Power Enable |
| **Ethernet** | Clock (50MHz) | **GPIO 0** | External 50MHz oscillator input |
| **Ethernet** | RMII Data / TX_EN | **GPIO 19, 21, 22, 25, 26, 27** | Internal EMAC (Reserved — do not reuse) |
| **Display SPI** | MOSI / SDA | **GPIO 13** | ST7789V2 SPI Data Out |
| **Display SPI** | SCLK / SCK | **GPIO 14** | ST7789V2 SPI Clock |
| **Display SPI** | CS | **GPIO 15** | ST7789V2 Chip Select |
| **Display SPI** | DC / RS | **GPIO 2** | ST7789V2 Data / Command |
| **Display SPI** | RST | **GPIO 4** | ST7789V2 Hardware Reset (Shared with Touch RST) |
| **Display PWM** | BL (Backlight) | **GPIO 5** | PWM Brightness Control (0-255) |
| **Touch I2C** | SDA | **GPIO 33** | CST816T Capacitive Touch Data |
| **Touch I2C** | SCL | **GPIO 32** | CST816T Capacitive Touch Clock |
| **Touch INT** | INT | **GPIO 34** | CST816T Interrupt (Active LOW) |
| **Touch RST** | RST | **GPIO 4** | Shared Reset with LCD_RST (or wire to ESP_EN / `-1`) |
| **Battery ADC** | V_BAT_SENSE | **GPIO 35** | ADC1_CH7 via 2:1 divider ($V_{\text{bat}} = V_{\text{adc}} \times 2$) |
| **Power** | 5V / 3.3V / GND | Header | Powered via 802.3af PoE, USB, or LiPo |
| **External ENV I2C** | SDA / SCL (Optional) | **GPIO 33 / GPIO 32** | Shared I2C bus for SHT30 (`0x44`) + BMP280 (`0x76`) |

---

## 🎯 14 Supported Operating Modes & Global Features

1. **TP (TA)** — Technical Producer with Tally Arbiter (Single Tap sends TSL 3.1 Program `0x32`)
2. **Presenter (TA)** — Presenter with Tally Arbiter (Single Tap sends TSL 3.1 Preview `0x31`)
3. **TP_P2P** — Standalone P2P Master (250ms `CXPING`/`CXPONG` heartbeat, >4 missed triggers Yellow `DISCONNECTED` alarm)
4. **Presenter_P2P** — Standalone P2P Slave (250ms heartbeat + `PEER LOST` fault alarm)
5. **ETC_CueSystem** — Flashing Red Standby → Single Tap ACK (`CS,<ch>,ACK\n`) → Solid Red → Green GO
6. **NMOS_IS07** — AMWA NMOS IS-07 Event & Tally (`_nmos-registration._tcp` DNS-SD + Program/Preview/Aux)
7. **Promptside** — Promptside Theatrical Cue Light (UDP 8000, wing banner, cue notes, `/ack 1`)
8. **MSC_RTP_MIDI** — MIDI Show Control RP-002 over AppleMIDI (UDP 5004, GO/STOP/STANDBY+ with cue numbers)
9. **RTP_MIDI** — AppleMIDI 6-color outstation with priority & configurable MIDI Button Return Feedback (Note/CC/PC)
10. **OSC** — Open Sound Control (UDP 8000, 6 colors + horizontal scrolling text ticker)
11. **TSL_31** — TSL UMD v3.1 dedicated listener (UDP/TCP, centered source name)
12. **TSL_50** — TSL UMD v5.0 dedicated listener (UDP/TCP, 4 tally bits + UTF-8 name)
13. **OSC_CueLight** — RSMCK OSC Cue Light for iOS (UDP 53000, persistent banner + `/ack`)
14. **vMix** — vMix Live Production Tally (TCP API port 8099 `SUBSCRIBE TALLY`, Program Red / Preview Green + optional `PreviewInput`/`ActiveInput` tap trigger)

**Global Features:**
* **POSIX Timezone SNTP Clock** (automatic DST rules) & **MTC Timecode Reader** (`0xF1` Quarter-Frame & SysEx Full-Frame `HH:MM:SS:FF`)
* **Power & Thermal Eco Management** (80/160/240 MHz CPU scaling, FreeRTOS `waiti` yield, 10% display auto-dimming with instant cue/touch wake, Wi-Fi/BT radio shutdown on PoE link)
* **REST Telemetry APIs:** `/api/battery`, `/api/status`, `/api/config`, `/api/env`, `/api/power`, `/api/discover`, `/api/pair`, and `/manual`

---

## 🚀 Building & Flashing (ESP32 Arduino Core 3.x)

### Using PlatformIO:
```bash
pio run -e esp32-poe -t upload
pio device monitor -b 115200
```

### Required Libraries:
* `LovyanGFX` (v1.1.16+)
* `MycilaESPConnect` (v10.6.3+, with `-D ESPCONNECT_ETH_SUPPORT`)
* `ESPAsyncWebServer` & `AsyncTCP` (Mathieu Carbou / ESP32Async v3.6.0+ for ESP32 Core 3.x / mbedTLS 3.x)
* `WebSockets` (`SocketIOclient`), `Arduino_JSON`, `ArduinoJson`
