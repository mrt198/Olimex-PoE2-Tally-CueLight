export type ScreenOrientation = 'portrait' | 'landscape';

export type BatteryPresetId = '103450_2000' | '103665_2500' | '803860_2000';

export interface BatteryPreset {
  id: BatteryPresetId;
  label: string;
  capacityMah: number;
  voltageNominal: number;
  widthMm: number;   // X span inside cradle
  lengthMm: number;  // Z span inside cradle
  thicknessMm: number;
  connector: string;
  notes: string;
}

export const BATTERY_PRESETS: Record<BatteryPresetId, BatteryPreset> = {
  '103450_2000': {
    id: '103450_2000',
    label: '103450 (2000 mAh · 3.7V)',
    capacityMah: 2000,
    voltageNominal: 3.7,
    widthMm: 34.0,
    lengthMm: 50.0,
    thicknessMm: 10.0,
    connector: 'JST-PH 2.0mm 2-pin',
    notes: 'Compact drop-in pouch cell; generous clearance around wires & M3 standoffs.'
  },
  '103665_2500': {
    id: '103665_2500',
    label: '103665 / 953662 (2500 mAh · 3.7V)',
    capacityMah: 2500,
    voltageNominal: 3.7,
    widthMm: 36.0,
    lengthMm: 62.0,
    thicknessMm: 9.8,
    connector: 'JST-PH 2.0mm 2-pin',
    notes: 'High-capacity cell filling the 43×68mm cradle for extended 10h+ wireless shifts.'
  },
  '803860_2000': {
    id: '803860_2000',
    label: '803860 (2000 mAh · 3.7V)',
    capacityMah: 2000,
    voltageNominal: 3.7,
    widthMm: 38.0,
    lengthMm: 60.0,
    thicknessMm: 8.2,
    connector: 'JST-PH 2.0mm 2-pin',
    notes: 'Slim 8.2mm profile leaves extra airflow gap beneath the ESP32-PoE2 PCB.'
  }
};

export type ShellFinishId = 'obsidian' | 'slate' | 'signal_white' | 'smoke';

export interface ShellFinish {
  id: ShellFinishId;
  label: string;
  color: number;
  roughness: number;
  metalness: number;
  transparent?: boolean;
  opacity?: number;
}

export const SHELL_FINISHES: Record<ShellFinishId, ShellFinish> = {
  obsidian: {
    id: 'obsidian',
    label: 'Matte Obsidian PETG',
    color: 0x1e2128,
    roughness: 0.62,
    metalness: 0.05
  },
  slate: {
    id: 'slate',
    label: 'Studio Slate ASA',
    color: 0x3b4454,
    roughness: 0.56,
    metalness: 0.06
  },
  signal_white: {
    id: 'signal_white',
    label: 'Signal White PLA+',
    color: 0xe6e9ef,
    roughness: 0.48,
    metalness: 0.02
  },
  smoke: {
    id: 'smoke',
    label: 'Translucent Smoke',
    color: 0x2f3b4c,
    roughness: 0.25,
    metalness: 0.05,
    transparent: true,
    opacity: 0.65
  }
};

export interface EnclosureParams {
  slantDeg: number; // Default 15 degrees
  orientation: ScreenOrientation;
  batteryPreset: BatteryPresetId;
  finish: ShellFinishId;
  wallMm: number; // Default 2.4mm
  floorMm: number; // Default 2.4mm
  clearanceMm: number; // Default 0.35mm FDM tolerance
}

export const DEFAULT_ENCLOSURE_PARAMS: EnclosureParams = {
  slantDeg: 15,
  orientation: 'portrait',
  batteryPreset: '103450_2000',
  finish: 'obsidian',
  wallMm: 2.4,
  floorMm: 2.4,
  clearanceMm: 0.35
};

/**
 * Exact KiCad PCB coordinates derived from OLIMEX/ESP32-POE2 Rev_B.kicad_pcb
 * Units: millimeters (mm). Origin of enclosure X-Z is centered on outer box footprint.
 * -Z is REAR (RJ45 + USB-C + MicroSD edge), +Z is FRONT (WROVER antenna edge).
 */
export const HARDWARE_SPECS = {
  olimex: {
    width: 60.0,
    length: 90.0,
    pcbThickness: 1.6,
    cornerRadius: 2.0,
    // 4x M3 NPTH Mounting Holes (52.0 x 50.0 mm pitch)
    // Relative to rear edge (Z = pcbRearZ): MH1/MH4 at +29mm, MH2/MH3 at +79mm
    mountHoleX: 26.0, // +/- 26mm from centerline (84 & 136 in KiCad centered at 110)
    mountHoleRearOffset: 29.0, // 170 - 141 = 29mm from rear edge
    mountHoleFrontOffset: 79.0, // 170 - 91 = 79mm from rear edge (11mm from front)
    // Rear edge connectors (Y_kicad = 170 edge)
    rj45: { xOffset: 0.0, width: 16.0, height: 13.6, depth: 21.0 },
    usbc: { xOffset: 23.0, width: 9.0, height: 3.3, depth: 7.4 }, // KiCad X=133 -> +23mm
    microSd: { xOffset: -20.5, width: 13.0, height: 2.1, depth: 14.0 }, // KiCad X=89.5 -> -20.5mm
    batJst: { xOffset: 24.5, frontOffset: 19.0 }, // DW02S JST-PH 2.0mm
    wrover: { width: 18.0, length: 31.4, height: 3.3 }
  },
  waveshare169: {
    moduleWidth: 33.13,
    moduleHeight: 41.13,
    pcbThickness: 1.6,
    glassThickness: 1.6,
    activeWidth: 27.97,
    activeHeight: 32.63,
    cornerRadius: 5.0
  }
} as const;

export interface ComputedEnclosureMetrics {
  outerWidth: number;
  outerDepth: number;
  frontHeight: number;
  rearHeight: number;
  splitHeight: number;
  pcbBottomY: number;
  pcbTopY: number;
  pcbRearZ: number;
  pcbFrontZ: number;
  batteryBayWidth: number;
  batteryBayLength: number;
  batteryBayHeight: number;
  lcdWindowW: number;
  lcdWindowH: number;
  lcdPocketW: number;
  lcdPocketH: number;
  lcdCenterZ: number;
  minLcdToPcbClearance: number;
  avgCurrentMa: number;
  estimatedRuntimeHours: number;
  chargeTimeHours: number;
}

export function computeEnclosureMetrics(
  params: EnclosureParams,
  cpuFreqMhz = 80,
  brightnessLevel = 1,
  wifiActive = true
): ComputedEnclosureMetrics {
  const { wallMm, floorMm, clearanceMm, slantDeg, orientation, batteryPreset } = params;
  const bat = BATTERY_PRESETS[batteryPreset];

  const innerWidth = HARDWARE_SPECS.olimex.width + 3.2; // 63.2mm (1.6mm/side clearance)
  const outerWidth = Number((innerWidth + 2 * wallMm).toFixed(2)); // 68.0mm

  // Rear PCB edge sits 0.2mm behind inner rear wall so RJ45 & USB-C seat flush with outer rear wall
  const rearGap = 0.2;
  const frontBossSpace = 8.6; // Leaves 8.6mm in front of PCB antenna for 2x M3 shell screws
  const innerDepth = rearGap + HARDWARE_SPECS.olimex.length + frontBossSpace; // 98.8mm
  const outerDepth = Number((innerDepth + 2 * wallMm).toFixed(2)); // 103.6mm (~104mm)

  const pcbRearZ = -outerDepth / 2 + wallMm + rearGap;
  const pcbFrontZ = pcbRearZ + HARDWARE_SPECS.olimex.length;

  const batteryBayHeight = Math.max(12.0, bat.thicknessMm + 2.0); // 12.0mm min
  const batteryBayWidth = 43.2; // Clear between +/-26mm M3 standoff bosses (outer R=3.6 -> 44.8mm gap)
  const batteryBayLength = 66.0;

  const pcbBottomY = floorMm + batteryBayHeight; // 14.4mm
  const pcbTopY = pcbBottomY + HARDWARE_SPECS.olimex.pcbThickness; // 16.0mm
  const splitHeight = pcbTopY; // Parting line right at top of PCB so RJ45 & USB-C sit in clean top U-slots

  const slantRad = (slantDeg * Math.PI) / 180;
  // Minimum front roof height above PCB + WROVER + LCD pocket + wiring clearance
  const frontHeight = 27.5;
  const rearHeight = Number((frontHeight + outerDepth * Math.tan(slantRad)).toFixed(2));

  const isPortrait = orientation === 'portrait';
  const lcdWindowW = (isPortrait ? HARDWARE_SPECS.waveshare169.activeWidth : HARDWARE_SPECS.waveshare169.activeHeight) + 0.6;
  const lcdWindowH = (isPortrait ? HARDWARE_SPECS.waveshare169.activeHeight : HARDWARE_SPECS.waveshare169.activeWidth) + 0.6;
  const lcdPocketW = (isPortrait ? HARDWARE_SPECS.waveshare169.moduleWidth : HARDWARE_SPECS.waveshare169.moduleHeight) + clearanceMm * 2;
  const lcdPocketH = (isPortrait ? HARDWARE_SPECS.waveshare169.moduleHeight : HARDWARE_SPECS.waveshare169.moduleWidth) + clearanceMm * 2;

  // Center the LCD slightly forward-of-center on the desk face, clear of rear RJ45 stack
  const lcdCenterZ = 4.0;
  const roofAtLcdFront = frontHeight + (outerDepth / 2 - (lcdCenterZ + lcdPocketH * 0.5 * Math.cos(slantRad))) * Math.tan(slantRad);
  const lcdStackBelowRoof = 2.6 + 3.2; // 2.6mm faceplate + 3.2mm module/connector clearance
  const wroverTopY = pcbTopY + HARDWARE_SPECS.olimex.wrover.height;
  const minLcdToPcbClearance = Number((roofAtLcdFront - lcdStackBelowRoof - wroverTopY).toFixed(1));

  // Real-world power budget estimation (mA @ 3.7V LiPo):
  // ESP32 @ 80MHz WiFi idle/UDP = ~92mA (@160MHz ~112mA, @240MHz ~135mA)
  const cpuCurrent = cpuFreqMhz <= 80 ? 52 : cpuFreqMhz <= 160 ? 68 : 88;
  const radioCurrent = wifiActive ? 48 : 12; // WiFi modem-sleep avg vs off
  const ethPhyStandby = 18; // LAN8720A powered down / idle
  const brightnessMap = [22, 34, 48, 66]; // Backlight PWM 25/50/75/100% + ST7789V2 logic
  const lcdCurrent = brightnessMap[Math.min(3, Math.max(0, brightnessLevel))] ?? 34;
  // Auto-dimming reduces LCD backlight duty cycle significantly during long standby stretches
  const effectiveLcdCurrent = lcdCurrent * 0.72;
  const avgCurrentMa = Math.round(cpuCurrent + radioCurrent + ethPhyStandby + effectiveLcdCurrent);

  const usableCapacityMah = bat.capacityMah * 0.88; // 88% usable between 4.2V and 3.35V cutoff
  const estimatedRuntimeHours = Number((usableCapacityMah / avgCurrentMa).toFixed(1));
  const chargeTimeHours = Number(((bat.capacityMah / 500) * 1.15).toFixed(1)); // MCP73831 500mA CC/CV

  return {
    outerWidth,
    outerDepth,
    frontHeight,
    rearHeight,
    splitHeight,
    pcbBottomY,
    pcbTopY,
    pcbRearZ,
    pcbFrontZ,
    batteryBayWidth,
    batteryBayLength,
    batteryBayHeight,
    lcdWindowW,
    lcdWindowH,
    lcdPocketW,
    lcdPocketH,
    lcdCenterZ,
    minLcdToPcbClearance,
    avgCurrentMa,
    estimatedRuntimeHours,
    chargeTimeHours
  };
}
