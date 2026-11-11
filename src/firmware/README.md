# Olimex ESP32-PoE2 with Waveshare 1.69" Touch LCD Module Tally & Cue System

Broadcast tally and theatrical cue light firmware adapted specifically for the **Olimex ESP32-PoE2** board paired with the **Waveshare 1.69inch Touch LCD Module** (ST7789V2 240×280 IPS display with CST816T capacitive touch).

---

## 🌟 Key Adaptations for Olimex ESP32-PoE2 & Waveshare 1.69" Touch

### 1. Touch Gesture Navigation (Replacing Mechanical Button)
The Waveshare 1.69" module features an onboard **CST816T capacitive touch controller** connected over I2C (`SDA: GPIO 33`, `SCL: GPIO 32`, `INT: GPIO 34`, `RST: GPIO 5`):
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
* **SPI Pinout:** MOSI: `GPIO 13`, SCLK: `GPIO 14`, CS: `GPIO 15`, DC: `GPIO 2`, RST: `GPIO 4`, BL: `GPIO 21`.

---

## 🛠️ Pinout Mapping Table

| Subsystem | Signal | Olimex ESP32-PoE2 GPIO | Notes |
| :--- | :--- | :--- | :--- |
| **Ethernet** | MDC | **GPIO 23** | LAN8720A Management Data Clock |
| **Ethernet** | MDIO | **GPIO 18** | LAN8720A Management Data I/O |
| **Ethernet** | Power | **GPIO 12** | LAN8720A Power Enable |
| **Ethernet** | Clock (50MHz) | **GPIO 0** | External 50MHz oscillator input |
| **Display SPI** | MOSI / SDA | **GPIO 13** | ST7789V2 SPI Data Out |
| **Display SPI** | SCLK / SCK | **GPIO 14** | ST7789V2 SPI Clock |
| **Display SPI** | CS | **GPIO 15** | ST7789V2 Chip Select |
| **Display SPI** | DC / RS | **GPIO 2** | ST7789V2 Data / Command |
| **Display SPI** | RST | **GPIO 4** | ST7789V2 Hardware Reset |
| **Display PWM** | BL (Backlight) | **GPIO 21** | PWM Brightness Control (0-255) |
| **Touch I2C** | SDA | **GPIO 33** | CST816T Capacitive Touch Data |
| **Touch I2C** | SCL | **GPIO 32** | CST816T Capacitive Touch Clock |
| **Touch INT** | INT | **GPIO 34** | CST816T Interrupt (Active LOW) |
| **Touch RST** | RST | **GPIO 5** | CST816T Hardware Reset |
| **Battery ADC** | V_BAT_SENSE | **GPIO 35** | ADC1_CH7 via 2:1 divider ($V_{\text{bat}} = V_{\text{adc}} \times 2$) |
| **Power** | 5V / 3.3V / GND | Header | Powered via 802.3af PoE, USB, or LiPo |

---

## 🚀 Building & Flashing

### Using PlatformIO:
```bash
pio run -e esp32-poe -t upload
pio device monitor -b 115200
```
