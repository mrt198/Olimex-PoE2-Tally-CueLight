import React from 'react';
import { Cpu, Network, Layers, ShieldCheck, Zap, AlertCircle, Touchpad, BatteryCharging, Hand } from 'lucide-react';

export const HardwareSpecs: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* Olimex ESP32-PoE2 to Waveshare 1.69" Touch LCD Pinout */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">
              Olimex ESP32-PoE2 &amp; Waveshare 1.69&quot; Touch LCD Pin Assignment
            </h3>
          </div>
          <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
            ESP32 RMII + I2C Touch + ADC
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-400">
                <th className="py-2.5 px-3">Subsystem</th>
                <th className="py-2.5 px-3">Signal Name</th>
                <th className="py-2.5 px-3">Olimex GPIO</th>
                <th className="py-2.5 px-3">Build Flag / Parameter</th>
                <th className="py-2.5 px-3">Hardware Function &amp; Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 text-neutral-300">
              {/* Ethernet */}
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 font-bold text-blue-400">LAN8720A Ethernet</td>
                <td className="py-3 px-3 font-semibold text-white">MDC</td>
                <td className="py-3 px-3 font-bold text-cyan-300 bg-neutral-950/60 rounded">GPIO 23</td>
                <td className="py-3 px-3 text-purple-300">-D ETH_PHY_MDC=23</td>
                <td className="py-3 px-3 text-neutral-400">Management Data Clock for LAN8720A RMII PHY</td>
              </tr>
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 font-bold text-blue-400">LAN8720A Ethernet</td>
                <td className="py-3 px-3 font-semibold text-white">MDIO</td>
                <td className="py-3 px-3 font-bold text-cyan-300 bg-neutral-950/60 rounded">GPIO 18</td>
                <td className="py-3 px-3 text-purple-300">-D ETH_PHY_MDIO=18</td>
                <td className="py-3 px-3 text-neutral-400">Management Data Input/Output</td>
              </tr>
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 font-bold text-blue-400">LAN8720A Ethernet</td>
                <td className="py-3 px-3 font-semibold text-white">PHY POWER</td>
                <td className="py-3 px-3 font-bold text-cyan-300 bg-neutral-950/60 rounded">GPIO 12</td>
                <td className="py-3 px-3 text-purple-300">-D ETH_PHY_POWER=12</td>
                <td className="py-3 px-3 text-neutral-400">Active HIGH LAN8720 power supply regulator switch</td>
              </tr>
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 font-bold text-blue-400">LAN8720A Ethernet</td>
                <td className="py-3 px-3 font-semibold text-white">50 MHz REF_CLK</td>
                <td className="py-3 px-3 font-bold text-cyan-300 bg-neutral-950/60 rounded">GPIO 0</td>
                <td className="py-3 px-3 text-purple-300">ETH_CLOCK_GPIO0_IN</td>
                <td className="py-3 px-3 text-neutral-400">External crystal oscillator 50MHz clock input</td>
              </tr>

              {/* Waveshare 1.69" LCD SPI */}
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 font-bold text-emerald-400">ST7789V2 LCD (SPI)</td>
                <td className="py-3 px-3 font-semibold text-white">MOSI (SDA)</td>
                <td className="py-3 px-3 font-bold text-emerald-300 bg-neutral-950/60 rounded">GPIO 13</td>
                <td className="py-3 px-3 text-purple-300">-D PIN_LCD_MOSI=13</td>
                <td className="py-3 px-3 text-neutral-400">SPI Data Out to Waveshare 240x280 display</td>
              </tr>
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 font-bold text-emerald-400">ST7789V2 LCD (SPI)</td>
                <td className="py-3 px-3 font-semibold text-white">SCLK (SCK)</td>
                <td className="py-3 px-3 font-bold text-emerald-300 bg-neutral-950/60 rounded">GPIO 14</td>
                <td className="py-3 px-3 text-purple-300">-D PIN_LCD_SCLK=14</td>
                <td className="py-3 px-3 text-neutral-400">SPI High-Speed Clock (up to 40 MHz)</td>
              </tr>
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 font-bold text-emerald-400">ST7789V2 LCD (SPI)</td>
                <td className="py-3 px-3 font-semibold text-white">CS (Chip Select)</td>
                <td className="py-3 px-3 font-bold text-emerald-300 bg-neutral-950/60 rounded">GPIO 15</td>
                <td className="py-3 px-3 text-purple-300">-D PIN_LCD_CS=15</td>
                <td className="py-3 px-3 text-neutral-400">Active LOW LCD Chip Select</td>
              </tr>
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 font-bold text-emerald-400">ST7789V2 LCD (SPI)</td>
                <td className="py-3 px-3 font-semibold text-white">DC (Data/Command)</td>
                <td className="py-3 px-3 font-bold text-emerald-300 bg-neutral-950/60 rounded">GPIO 2</td>
                <td className="py-3 px-3 text-purple-300">-D PIN_LCD_DC=2</td>
                <td className="py-3 px-3 text-neutral-400">Register select / Data command mode</td>
              </tr>
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 font-bold text-emerald-400">ST7789V2 LCD (SPI)</td>
                <td className="py-3 px-3 font-semibold text-white">RST (Reset)</td>
                <td className="py-3 px-3 font-bold text-emerald-300 bg-neutral-950/60 rounded">GPIO 4</td>
                <td className="py-3 px-3 text-purple-300">-D PIN_LCD_RST=4</td>
                <td className="py-3 px-3 text-neutral-400">Hardware display reset line</td>
              </tr>
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 font-bold text-emerald-400">ST7789V2 LCD (SPI)</td>
                <td className="py-3 px-3 font-semibold text-white">BL (Backlight PWM)</td>
                <td className="py-3 px-3 font-bold text-emerald-300 bg-neutral-950/60 rounded">GPIO 5</td>
                <td className="py-3 px-3 text-purple-300">-D PIN_LCD_BL=5</td>
                <td className="py-3 px-3 text-neutral-400">LED PWM brightness control (GPIO 21 reserved for EMAC_TX_EN)</td>
              </tr>

              {/* Waveshare CST816T Touch (I2C) */}
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 font-bold text-cyan-400">CST816T Touch (I2C)</td>
                <td className="py-3 px-3 font-semibold text-white">SDA</td>
                <td className="py-3 px-3 font-bold text-cyan-300 bg-neutral-950/60 rounded">GPIO 33</td>
                <td className="py-3 px-3 text-purple-300">-D PIN_TOUCH_SDA=33</td>
                <td className="py-3 px-3 text-neutral-400">I2C Data line for touch controller (Address 0x15)</td>
              </tr>
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 font-bold text-cyan-400">CST816T Touch (I2C)</td>
                <td className="py-3 px-3 font-semibold text-white">SCL</td>
                <td className="py-3 px-3 font-bold text-cyan-300 bg-neutral-950/60 rounded">GPIO 32</td>
                <td className="py-3 px-3 text-purple-300">-D PIN_TOUCH_SCL=32</td>
                <td className="py-3 px-3 text-neutral-400">I2C Clock line (400 kHz fast mode)</td>
              </tr>
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 font-bold text-cyan-400">CST816T Touch (I2C)</td>
                <td className="py-3 px-3 font-semibold text-white">INT (Interrupt)</td>
                <td className="py-3 px-3 font-bold text-cyan-300 bg-neutral-950/60 rounded">GPIO 34</td>
                <td className="py-3 px-3 text-purple-300">-D PIN_TOUCH_INT=34</td>
                <td className="py-3 px-3 text-neutral-400">Active LOW touch interrupt triggering event handler</td>
              </tr>
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 font-bold text-cyan-400">CST816T Touch (I2C)</td>
                <td className="py-3 px-3 font-semibold text-white">RST (Touch Reset)</td>
                <td className="py-3 px-3 font-bold text-cyan-300 bg-neutral-950/60 rounded">GPIO 4 (Shared)</td>
                <td className="py-3 px-3 text-purple-300">-D PIN_TOUCH_RST=4</td>
                <td className="py-3 px-3 text-neutral-400">Shared reset with LCD_RST (or tie to ESP_EN &amp; set -1)</td>
              </tr>

              {/* Battery Monitoring ADC */}
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 font-bold text-amber-400">LiPo Battery ADC</td>
                <td className="py-3 px-3 font-semibold text-white">V_BAT_SENSE</td>
                <td className="py-3 px-3 font-bold text-amber-300 bg-neutral-950/60 rounded">GPIO 35</td>
                <td className="py-3 px-3 text-purple-300">-D PIN_BATTERY_ADC=35</td>
                <td className="py-3 px-3 text-neutral-400">ADC1_CH7 via built-in 2:1 divider (V_bat = V_adc * 2)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 p-3 bg-blue-950/30 border border-blue-900/40 rounded-xl text-xs text-blue-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
          <span>
            <strong>Hardware Architecture Note:</strong> On the Olimex ESP32-PoE2, the Microchip LAN8720A RMII PHY permanently uses 
            <strong> GPIO 0, 12, 18, 19, 21 (EMAC_TX_EN), 22, 23, 25, 26, and 27</strong>, while WROVER PSRAM uses <strong>GPIO 16–17</strong>. 
            Backlight PWM uses <strong>GPIO 5</strong> and Touch RST shares <strong>GPIO 4</strong> with LCD RST. The battery sense pin on <strong>GPIO 35</strong> belongs to 
            <strong> ADC1</strong>, allowing reliable analog reads even while the Wi-Fi radio is active or falling back.
          </span>
        </div>
      </div>

      {/* Touch Gestures & Battery Management Architecture */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Touch Gestures Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2">
            <Hand className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">
              CST816T Capacitive Touch Gestures
            </h3>
          </div>

          <div className="space-y-3 text-xs text-neutral-300 leading-relaxed font-mono">
            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-2">
              <div className="flex items-center justify-between text-cyan-400 font-bold">
                <span>👆 Single Tap:</span>
                <span className="text-white">Physical Button Equivalent</span>
              </div>
              <p className="text-[11px] text-neutral-400">
                A single tap on the 1.69&quot; glass acts as the primary hardware button click:
                transmitting TSL 3.1 return cues, sending ETC CueSystem ACK packets, or toggling NMOS IS-07 tally state.
              </p>
            </div>

            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-2">
              <div className="flex items-center justify-between text-amber-400 font-bold">
                <span>👆👆 Double Tap (&lt;240ms):</span>
                <span className="text-white">Toggle Diagnostics Page</span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Double-tapping anywhere on screen immediately toggles between 
                <strong> Screen 0 (Main Tally/Cue)</strong> and <strong>Screen 1 (Diagnostics &amp; Battery Telemetry)</strong>.
              </p>
            </div>

            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-2">
              <div className="flex items-center justify-between text-purple-400 font-bold">
                <span>⏱️ Long Press (&gt;1.2s):</span>
                <span className="text-white">Cycle Brightness</span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Pressing and holding the screen cycles the display backlight through 25%, 50%, 75%, and 100% PWM levels.
              </p>
            </div>
          </div>
        </div>

        {/* Battery Management Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2">
            <BatteryCharging className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">
              LiPo Battery &amp; Power Architecture
            </h3>
          </div>

          <div className="space-y-3 text-xs text-neutral-300 leading-relaxed font-mono">
            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-1">
              <div className="text-white font-bold text-xs mb-1">Battery Monitoring Specs:</div>
              <div>Charger IC: <strong className="text-cyan-400">Microchip MCP73831</strong> (500mA LiPo)</div>
              <div>ADC Sense Pin: <strong className="text-amber-400">GPIO 35 (ADC1 Channel 7)</strong></div>
              <div>Divider: <strong className="text-purple-400">2:1 Precision Resistor Divider</strong></div>
              <div>Full Float Voltage: <strong className="text-emerald-400">4.20 V (100%)</strong></div>
              <div>Low Battery Threshold: <strong className="text-red-400">3.40 V (15% Warning)</strong></div>
              <div>Empty Cutoff: <strong className="text-neutral-500">3.20 V (0%)</strong></div>
            </div>

            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-1">
              <div className="text-white font-bold text-xs mb-1">Power State Detection:</div>
              <div>• <strong>PoE Active (Charging):</strong> IEEE 802.3af PoE rail active, battery charging</div>
              <div>• <strong>PoE Powered (Full):</strong> Battery float voltage &ge; 4.15V</div>
              <div>• <strong>LiPo Discharging:</strong> Untethered wireless / portable battery operation</div>
              <div>• <strong>Low Battery Alert:</strong> Live visual warning on Screen 0 &amp; Screen 1</div>
            </div>
          </div>
        </div>
      </div>

      {/* Double Buffering Math for 240x280 IPS Display */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-5 h-5 text-purple-400" />
          <h3 className="text-base font-bold text-white">
            Waveshare 1.69&quot; Display Double-Buffering Architecture
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
            <p>
              The Waveshare 1.69&quot; module features a high-density <strong>240 × 280 pixel IPS panel</strong> driven by an ST7789V2 controller.
              Writing directly to the display causes visible tearing across rapid tally transitions.
            </p>
            <p>
              To ensure <strong>100% flicker-free rendering</strong>, the entire 240×280 frame is drawn into an off-screen double-buffer
              and pushed to the display in a single atomic SPI DMA burst.
            </p>
            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 font-mono text-neutral-400 space-y-1">
              <div className="text-white font-bold text-xs mb-1">Memory Calculation:</div>
              <div>Resolution = 240 × 280 = 67,200 pixels</div>
              <div>Color Depth = 16 bits (RGB565) = 2 bytes / pixel</div>
              <div>Buffer Size = 67,200 × 2 = <strong className="text-purple-400">134,400 bytes (131.25 KB)</strong></div>
              <div>ESP32 SRAM = <strong className="text-emerald-400">520 KB Internal SRAM</strong></div>
            </div>
          </div>

          <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
            <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 font-mono">
              <div className="text-purple-400 font-bold mb-2">// Implemented in Olimex firmware:</div>
              <pre className="text-[11px] text-neutral-300 overflow-x-auto space-y-1">
{`// 134.4 KB RGB565 double-buffer in internal SRAM
uint16_t* frameBuffer = (uint16_t*)malloc(240 * 280 * 2);

void renderScreen() {
  uint16_t bgColor = getActiveTallyColor();
  // Off-screen rendering:
  drawHeaderWithBatteryAndClock(frameBuffer);
  drawTallyContent(frameBuffer);
  
  // Single atomic DMA burst to Waveshare ST7789V2:
  lcdPushDMA(frameBuffer, 240, 280);
}`}
              </pre>
            </div>
            <p className="text-[11px] text-neutral-400">
              The 134.4 KB buffer easily fits in the ESP32 internal SRAM, providing instantaneous zero-flicker updates across all tally, cue, and diagnostics pages.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
