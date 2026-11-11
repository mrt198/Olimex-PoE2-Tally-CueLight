import React from 'react';
import { MIGRATION_DIFFS, MigrationDiff } from '../data/firmwareSources';
import { CheckCircle2, AlertTriangle, Layers, Cpu, Radio, Zap, Touchpad, BatteryCharging, Hand } from 'lucide-react';

export const DiffViewer: React.FC = () => {
  const getIcon = (category: string) => {
    if (category.toLowerCase().includes('touch')) {
      return <Hand className="w-4 h-4 text-cyan-400" />;
    }
    if (category.toLowerCase().includes('battery')) {
      return <BatteryCharging className="w-4 h-4 text-emerald-400" />;
    }
    if (category.toLowerCase().includes('display') || category.toLowerCase().includes('buffering')) {
      return <Layers className="w-4 h-4 text-purple-400" />;
    }
    if (category.toLowerCase().includes('ethernet')) {
      return <Radio className="w-4 h-4 text-blue-400" />;
    }
    return <Zap className="w-4 h-4 text-amber-400" />;
  };

  return (
    <div className="space-y-6">
      {/* High-Level Migration Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-2">
            <Touchpad className="w-4 h-4" />
            <span>Capacitive Touch</span>
          </div>
          <div className="text-xl font-bold text-white font-mono">CST816T I2C</div>
          <p className="text-xs text-neutral-400 mt-1">
            Single tap = button click action; double tap = toggle diagnostics page; long press = cycle brightness.
          </p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2">
            <BatteryCharging className="w-4 h-4" />
            <span>Battery Readout</span>
          </div>
          <div className="text-xl font-bold text-white font-mono">GPIO 35 ADC</div>
          <p className="text-xs text-neutral-400 mt-1">
            Real-time battery voltage, charge level percentage (0–100%), and PoE vs LiPo status readout.
          </p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-400 mb-2">
            <Layers className="w-4 h-4" />
            <span>240×280 IPS Screen</span>
          </div>
          <div className="text-xl font-bold text-white font-mono">134.4 KB DMA</div>
          <p className="text-xs text-neutral-400 mt-1">
            Zero-flicker double-buffered display rendering in ESP32 internal SRAM pushed via atomic SPI DMA.
          </p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400 mb-2">
            <Radio className="w-4 h-4" />
            <span>Native RMII PHY</span>
          </div>
          <div className="text-xl font-bold text-white font-mono">LAN8720A 100M</div>
          <p className="text-xs text-neutral-400 mt-1">
            Direct 50 MHz hardware MAC link with IEEE 802.3af PoE power delivering sub-0.5ms tally response.
          </p>
        </div>
      </div>

      {/* Side-by-Side Detailed Code Comparisons */}
      <div className="space-y-6">
        {MIGRATION_DIFFS.map((diff: MigrationDiff) => (
          <div 
            key={diff.category}
            className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl"
          >
            {/* Header */}
            <div className="p-4 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getIcon(diff.category)}
                <h3 className="text-sm font-bold text-white tracking-wide">
                  {diff.category}
                </h3>
              </div>
              <span className="text-xs text-neutral-400 font-mono flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Fully Adapted</span>
              </span>
            </div>

            {/* Side-by-side blocks */}
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-neutral-800">
              {/* Original Code */}
              <div className="p-4 bg-red-950/10">
                <div className="flex items-center justify-between text-xs font-mono font-semibold text-red-400 mb-2 pb-1 border-b border-red-900/40">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>ORIGINAL / LEGACY ARCHITECTURE</span>
                  </span>
                  <span className="text-[10px] text-neutral-500">Physical Switch / W5500 / 128x128</span>
                </div>
                <pre className="text-xs font-mono text-neutral-300 overflow-x-auto whitespace-pre p-2 bg-neutral-950/70 rounded-lg border border-neutral-800">
                  {diff.original}
                </pre>
              </div>

              {/* Adapted Code */}
              <div className="p-4 bg-emerald-950/10">
                <div className="flex items-center justify-between text-xs font-mono font-semibold text-emerald-400 mb-2 pb-1 border-b border-emerald-900/40">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>ADAPTED: OLIMEX ESP32-PoE2 + WAVESHARE 1.69&quot; TOUCH</span>
                  </span>
                  <span className="text-[10px] text-neutral-500">LAN8720A / CST816T Touch / Battery ADC</span>
                </div>
                <pre className="text-xs font-mono text-emerald-200 overflow-x-auto whitespace-pre p-2 bg-neutral-950/70 rounded-lg border border-neutral-800">
                  {diff.adapted}
                </pre>
              </div>
            </div>

            {/* Technical Explanation */}
            <div className="p-4 bg-neutral-950/40 border-t border-neutral-800 text-xs text-neutral-300">
              <span className="font-semibold text-neutral-200">Engineering Rationale: </span>
              {diff.explanation}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
