import React, { useState, useEffect } from 'react';
import { 
  Network, 
  Zap, 
  Radio, 
  Sun, 
  Layers, 
  ArrowRightLeft, 
  Info, 
  Server, 
  Sliders, 
  Theater, 
  Tv, 
  Music, 
  Volume2, 
  RotateCw,
  Compass,
  MessageSquare,
  Cpu,
  Clock,
  Battery,
  BatteryCharging,
  BatteryMedium,
  BatteryLow,
  BatteryWarning,
  Touchpad,
  Hand,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

export interface SimulatorState {
  tallyState: 'program' | 'preview' | 'aux' | 'standby';
  deviceName: string;
  deviceId: string;
  isCueActive: boolean;
  currentScreen: 0 | 1; // 0 = Tally, 1 = Diagnostics
  networkMode: 'ETH' | 'WIFI';
  ethernetCableConnected: boolean;
  brightnessLevel: number; // 0..3 (25%, 50%, 75%, 100%)
  doubleBufferEnabled: boolean;
  taHost: string;
  taPort: string;
  tslPort: string;
  flashActive: boolean;
  operatingMode: 'TP' | 'Presenter' | 'TP_P2P' | 'Presenter_P2P' | 'ETC_CueSystem' | 'NMOS_IS07' | 'RTP_MIDI' | 'OSC' | 'TSL_31' | 'TSL_50' | 'OSC_CueLight' | 'Promptside' | 'MSC_RTP_MIDI';
  pairingGroup: string;
  pairedTargetIP: string;
  pairedTargetName: string;
  presenterCueActive: boolean;
  // Network IP Configuration (DHCP vs Static IP)
  useDHCP: boolean;
  staticIP: string;
  staticMask: string;
  staticGW: string;
  staticDNS: string;
  wifiDisabledForEth: boolean;

  // Olimex ESP32-PoE2 Battery & Power System
  batteryVoltage: number; // Volts (3.0V - 4.25V)
  batteryPercent: number; // 0 - 100%
  batteryStatus: 'PoE Powered (Full)' | 'PoE Active (Charging)' | 'LiPo Discharging' | 'LOW BATTERY ALERT!';
  powerSource: 'poe' | 'usb' | 'battery';
  batteryCharging: boolean;

  // Power & Thermal Management
  cpuFrequency: 80 | 160 | 240;
  screenDimTimeout: number; // 0 (Never), 30s, 60s, 180s
  isScreenDimmed: boolean;
  // Timezone & Clock Configuration
  timezone: string;
  customTZPosix: string;
  // MTC (MIDI Time Code) Reader
  mtcReaderEnabled: boolean;
  mtcTimecode: string;
  // AtomENV Sensor
  envSensorEnabled: boolean;
  envTemperature: number;
  envHumidity: number;
  envPressure: number;
  // Promptside Theatrical Cue System
  promptsidePort: number;
  promptsideChannel: number;
  promptsideWingLabel: string;
  promptsideCueText: string;
  promptsideState: 'off' | 'standby_ack' | 'standby' | 'go';
  promptsideAckDone: boolean;
  // MIDI Show Control (MSC) over rtpMIDI
  mscPort: number;
  mscDeviceId: number;
  mscCmdFormat: number;
  mscCurrentCue: string;
  mscLastCommand: string;
  mscState: 'off' | 'standby' | 'standby+' | 'go';
  // MIDI Button Return Feedback Action
  midiBtnType: number; // 0: None, 1: Note Mom, 2: Note Tog, 3: CC Mom, 4: CC Tog, 5: PC
  midiBtnChannel: number;
  midiBtnNumber: number;
  midiBtnPress: number;
  midiBtnRelease: number;
  // P2P Heartbeat & Disconnect Alarm
  p2pDisconnected: boolean;
  p2pMissed: number;
  // NMOS Auto Discovery
  nmosAutoDiscover: boolean;
  // TSL 3.1 Dedicated Listener
  tsl31Port: number;
  tsl31Transport: 'UDP' | 'TCP';
  tsl31Address: number;
  tsl31Name: string;
  // TSL 5.0 Dedicated Listener
  tsl50Port: number;
  tsl50Transport: 'UDP' | 'TCP';
  tsl50Screen: number;
  tsl50Index: number;
  tsl50Name: string;
  // OSC Cue Light for iOS
  oscCuePort: number;
  oscCueStation: string;
  oscCueBanner: string;
  oscCueMessage: string;
  oscCueState: 'off' | 'standby_ack' | 'standby' | 'go';
  oscCueAckDone: boolean;
  // ETC CueSystem configuration & state
  cueHost: string;
  cuePort: number;
  cueChannel: number;
  cueAckActive: boolean;
  cueState: 'standby' | 'go' | 'off';
  // AMWA NMOS IS-07 Event & Tally configuration & state
  nmosHost: string;
  nmosPort: number;
  nmosSource: string;
  nmosTopic: string;
  nmosProgramTopic: string;
  nmosPreviewTopic: string;
  nmosAuxTopic: string;
  nmosOnAir: boolean; // Program (Red)
  nmosPreview: boolean; // Preview (Green)
  nmosAux: boolean; // Aux (Amber)
  // rtpMIDI / AppleMIDI Configuration & State
  rtpMidiPort: number;
  rtpMidiChannel: number; // 0 = Omni, 1-16
  rtpMidiTriggerType: number; // 0 = Note On/Off, 1 = CC, 2 = PC
  rtpMidiNumRed: number;
  rtpMidiNumFlashRed: number;
  rtpMidiNumGreen: number;
  rtpMidiNumYellow: number;
  rtpMidiNumBlue: number;
  rtpMidiNumWhite: number;
  rtpMidiState: {
    red: boolean;
    flashRed: boolean;
    green: boolean;
    yellow: boolean;
    blue: boolean;
    white: boolean;
  };
  // OSC Configuration & State
  oscPort: number;
  oscPrefix: string;
  oscCustomMessage: string;
  oscState: {
    red: boolean;
    flashRed: boolean;
    green: boolean;
    yellow: boolean;
    blue: boolean;
    white: boolean;
  };
  // IMU 6-Axis Screen Auto-Rotation
  imuRotation: 0 | 90 | 180 | 270;
}

interface AtomSimulatorProps {
  state: SimulatorState;
  setState: React.Dispatch<React.SetStateAction<SimulatorState>>;
  onSendTslPacket: (channel: number, live: boolean) => void;
  lastTslPacket: {
    hex: string;
    decoded: string;
    timestamp: string;
    channel: number;
    live: boolean;
  } | null;
}

export const AtomSimulator: React.FC<AtomSimulatorProps> = ({
  state,
  setState,
  onSendTslPacket,
  lastTslPacket
}) => {
  const [clickCount, setClickCount] = useState(0);
  const [clickTimer, setClickTimer] = useState<NodeJS.Timeout | null>(null);
  const [isPressing, setIsPressing] = useState(false);
  const [pressStartTime, setPressStartTime] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('10:42:15');
  const [flashTick, setFlashTick] = useState(false);

  // Visual touch feedback ripple and feedback text
  const [touchFeedback, setTouchFeedback] = useState<{
    x: number;
    y: number;
    action: string;
    key: number;
  } | null>(null);

  // Live clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      setCurrentTime(`${h}:${m}:${s}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // 400ms periodic tick for flashing states
  useEffect(() => {
    const flashInterval = setInterval(() => {
      setFlashTick(prev => !prev);
    }, 400);
    return () => clearInterval(flashInterval);
  }, []);

  const brightnessPercents = [25, 50, 75, 100];

  // Helper to resolve the active color & label based on mode and priorities
  const resolveActiveColor = () => {
    if (state.flashActive) {
      return { bg: 'bg-white', text: 'text-black', isDark: false, label: 'FLASH' };
    }

    // P2P Standalone Disconnect Alarm
    if ((state.operatingMode === 'TP_P2P' || state.operatingMode === 'Presenter_P2P') && state.p2pDisconnected) {
      return flashTick
        ? { bg: 'bg-yellow-400', text: 'text-black', isDark: false, label: 'DISCONNECTED' }
        : { bg: 'bg-neutral-950', text: 'text-yellow-400', isDark: true, label: 'DISCONNECTED' };
    }

    // ETC CueSystem Mode:
    if (state.operatingMode === 'ETC_CueSystem') {
      if (state.cueState === 'standby') {
        if (!state.cueAckActive) {
          // Unacknowledged: Flashing Red!
          return flashTick
            ? { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'STANDBY' }
            : { bg: 'bg-neutral-950', text: 'text-red-500', isDark: true, label: 'STANDBY' };
        } else {
          // Acknowledged: Solid Red!
          return { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'ACKNOWLEDGED' };
        }
      }
      if (state.cueState === 'go') {
        return { bg: 'bg-emerald-500', text: 'text-black', isDark: false, label: 'GO!' };
      }
      return { bg: 'bg-neutral-950', text: 'text-white', isDark: true, label: 'STANDBY' };
    }

    // NMOS IS-07 Mode
    if (state.operatingMode === 'NMOS_IS07') {
      if (state.nmosOnAir) {
        return { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'ON AIR (PRG)' };
      }
      if (state.nmosPreview) {
        return { bg: 'bg-emerald-500', text: 'text-black', isDark: false, label: 'PREVIEW' };
      }
      if (state.nmosAux) {
        return { bg: 'bg-amber-500', text: 'text-black', isDark: false, label: 'AUX' };
      }
      return { bg: 'bg-neutral-950', text: 'text-white', isDark: true, label: 'OFF AIR' };
    }

    // rtpMIDI Mode
    if (state.operatingMode === 'RTP_MIDI') {
      const s = state.rtpMidiState;
      if (s.red) return { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'RED' };
      if (s.flashRed) {
        return flashTick
          ? { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'FLASH RED' }
          : { bg: 'bg-neutral-950', text: 'text-red-500', isDark: true, label: 'FLASH RED' };
      }
      if (s.green) return { bg: 'bg-emerald-500', text: 'text-black', isDark: false, label: 'GREEN' };
      if (s.yellow) return { bg: 'bg-yellow-400', text: 'text-black', isDark: false, label: 'YELLOW' };
      if (s.blue) return { bg: 'bg-blue-600', text: 'text-white', isDark: true, label: 'BLUE' };
      if (s.white) return { bg: 'bg-white', text: 'text-black', isDark: false, label: 'WHITE' };
      return { bg: 'bg-neutral-950', text: 'text-white', isDark: true, label: 'OFF' };
    }

    // OSC Mode
    if (state.operatingMode === 'OSC') {
      const s = state.oscState;
      if (s.red) return { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'RED' };
      if (s.flashRed) {
        return flashTick
          ? { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'FLASH RED' }
          : { bg: 'bg-neutral-950', text: 'text-red-500', isDark: true, label: 'FLASH RED' };
      }
      if (s.green) return { bg: 'bg-emerald-500', text: 'text-black', isDark: false, label: 'GREEN' };
      if (s.yellow) return { bg: 'bg-yellow-400', text: 'text-black', isDark: false, label: 'YELLOW' };
      if (s.blue) return { bg: 'bg-blue-600', text: 'text-white', isDark: true, label: 'BLUE' };
      if (s.white) return { bg: 'bg-white', text: 'text-black', isDark: false, label: 'WHITE' };
      return { bg: 'bg-neutral-950', text: 'text-white', isDark: true, label: 'OFF' };
    }

    // OSC Cue Light for iOS
    if (state.operatingMode === 'OSC_CueLight') {
      if (state.oscCueState === 'standby_ack') {
        if (!state.oscCueAckDone) {
          return flashTick
            ? { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'STANDBY (ACK)' }
            : { bg: 'bg-neutral-950', text: 'text-red-500', isDark: true, label: 'STANDBY (ACK)' };
        } else {
          return { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'STANDBY' };
        }
      }
      if (state.oscCueState === 'standby') {
        return { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'STANDBY' };
      }
      if (state.oscCueState === 'go') {
        return { bg: 'bg-emerald-500', text: 'text-black', isDark: false, label: 'GO!' };
      }
      return { bg: 'bg-neutral-950', text: 'text-white', isDark: true, label: 'OFF' };
    }

    // Promptside Mode
    if (state.operatingMode === 'Promptside') {
      if (state.promptsideState === 'standby_ack') {
        if (!state.promptsideAckDone) {
          return flashTick
            ? { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'STANDBY (ACK)' }
            : { bg: 'bg-neutral-950', text: 'text-red-500', isDark: true, label: 'STANDBY (ACK)' };
        } else {
          return { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'STANDBY (ACKED)' };
        }
      }
      if (state.promptsideState === 'standby') {
        return { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'STANDBY' };
      }
      if (state.promptsideState === 'go') {
        return { bg: 'bg-emerald-500', text: 'text-black', isDark: false, label: 'GO!' };
      }
      return { bg: 'bg-neutral-950', text: 'text-white', isDark: true, label: 'OFF' };
    }

    // MSC rtpMIDI
    if (state.operatingMode === 'MSC_RTP_MIDI') {
      if (state.mscState === 'go') {
        return { bg: 'bg-emerald-500', text: 'text-black', isDark: false, label: 'GO!' };
      }
      if (state.mscState === 'standby+') {
        return flashTick
          ? { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'STANDBY+' }
          : { bg: 'bg-neutral-950', text: 'text-red-500', isDark: true, label: 'STANDBY+' };
      }
      if (state.mscState === 'standby') {
        return { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'STOP / STBY' };
      }
      return { bg: 'bg-neutral-950', text: 'text-white', isDark: true, label: 'OFF' };
    }

    // Standard TSL / Tally Arbiter / P2P Modes
    switch (state.tallyState) {
      case 'program':
        return { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'PROGRAM' };
      case 'preview':
        return { bg: 'bg-emerald-500', text: 'text-black', isDark: false, label: 'PREVIEW' };
      case 'aux':
        return { bg: 'bg-amber-500', text: 'text-black', isDark: false, label: 'AUX' };
      case 'standby':
      default:
        return { bg: 'bg-neutral-950', text: 'text-white', isDark: true, label: 'STANDBY' };
    }
  };

  const activeColor = resolveActiveColor();

  // Screen background color (Screen 1 Diagnostics also follows tally state background)
  const getScreenBgColor = () => {
    return `${activeColor.bg} ${activeColor.text}`;
  };

  const getStatusLabel = () => activeColor.label;

  // Execute primary button action (triggered on Single Tap)
  const executeButtonAction = () => {
    setState(prev => {
      if (prev.operatingMode === 'Promptside') {
        onSendTslPacket(prev.promptsideChannel, true);
        return { ...prev, promptsideAckDone: true };
      }
      if (prev.operatingMode === 'ETC_CueSystem') {
        const nextAck = !prev.cueAckActive;
        return { ...prev, cueAckActive: nextAck };
      }
      if (prev.operatingMode === 'OSC_CueLight') {
        onSendTslPacket(parseInt(prev.oscCueStation) || 1, true);
        return { ...prev, oscCueAckDone: true };
      }
      if (prev.operatingMode === 'NMOS_IS07') {
        const nextLive = !prev.nmosOnAir;
        return { ...prev, nmosOnAir: nextLive };
      }
      if (prev.operatingMode === 'RTP_MIDI' || prev.operatingMode === 'MSC_RTP_MIDI') {
        onSendTslPacket(prev.midiBtnNumber, true);
        const nextCue = !prev.isCueActive;
        return { ...prev, isCueActive: nextCue };
      }
      const nextCue = !prev.isCueActive;
      onSendTslPacket(1, nextCue);
      return { ...prev, isCueActive: nextCue };
    });
  };

  // Handle touch events on the 1.69" screen (Single Tap = Button Click, Double Tap = Diag, Hold = Brightness)
  const handleScreenMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsPressing(true);
    setPressStartTime(Date.now());
    if (state.isScreenDimmed) {
      setState(prev => ({ ...prev, isScreenDimmed: false }));
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check for double tap
    if (clickTimer) {
      clearTimeout(clickTimer);
      setClickTimer(null);
      // Double Tap Action: Switch Screen to Diagnostics
      setState(prev => ({
        ...prev,
        currentScreen: prev.currentScreen === 0 ? 1 : 0
      }));
      setTouchFeedback({
        x,
        y,
        action: '👆👆 Double Tap: Diagnostics Page',
        key: Date.now()
      });
      setClickCount(0);
    } else {
      setClickCount(1);
      const timer = setTimeout(() => {
        // Single Tap Action: Button Click equivalent
        executeButtonAction();
        setTouchFeedback({
          x,
          y,
          action: '👆 Single Tap: Button Click',
          key: Date.now()
        });
        setClickTimer(null);
        setClickCount(0);
      }, 280);
      setClickTimer(timer);
    }
  };

  const handleScreenMouseUp = () => {
    setIsPressing(false);
    if (!pressStartTime) return;
    const duration = Date.now() - pressStartTime;
    setPressStartTime(null);

    // Hold gesture (>1.2s): Cycle Brightness
    if (duration > 1200) {
      if (clickTimer) {
        clearTimeout(clickTimer);
        setClickTimer(null);
      }
      setState(prev => ({
        ...prev,
        brightnessLevel: (prev.brightnessLevel + 1) % 4
      }));
      setTouchFeedback({
        x: 120,
        y: 140,
        action: `⏱️ Long Press: Brightness ${brightnessPercents[(state.brightnessLevel + 1) % 4]}%`,
        key: Date.now()
      });
    }
  };

  // Helper for power source changes
  const setPowerPreset = (source: 'poe' | 'usb' | 'battery', voltage: number) => {
    let pct = 100;
    if (voltage >= 4.20) pct = 100;
    else if (voltage <= 3.20) pct = 0;
    else {
      pct = Math.round(((voltage - 3.20) / (4.20 - 3.20)) * 100);
    }

    let status: SimulatorState['batteryStatus'] = 'PoE Powered (Full)';
    let isCharging = false;
    let ethConnected = state.ethernetCableConnected;

    if (source === 'poe') {
      ethConnected = true;
      if (pct >= 98) {
        status = 'PoE Powered (Full)';
        isCharging = false;
      } else {
        status = 'PoE Active (Charging)';
        isCharging = true;
      }
    } else if (source === 'usb') {
      ethConnected = false;
      status = (pct >= 98) ? 'PoE Powered (Full)' : 'PoE Active (Charging)';
      isCharging = (pct < 98);
    } else {
      ethConnected = false;
      isCharging = false;
      if (voltage < 3.40) {
        status = 'LOW BATTERY ALERT!';
      } else {
        status = 'LiPo Discharging';
      }
    }

    setState(prev => ({
      ...prev,
      powerSource: source,
      batteryVoltage: voltage,
      batteryPercent: pct,
      batteryStatus: status,
      batteryCharging: isCharging,
      ethernetCableConnected: ethConnected,
      networkMode: ethConnected ? 'ETH' : 'WIFI'
    }));
  };

  const displayedIP = state.useDHCP 
    ? (state.networkMode === 'ETH' ? '192.168.1.185' : '192.168.1.92') 
    : state.staticIP;

  // Determine displayed name on screen
  const getDisplayName = () => {
    if ((state.operatingMode === 'TP_P2P' || state.operatingMode === 'Presenter_P2P') && state.p2pDisconnected) {
      return 'PEER LOST';
    }
    if (state.operatingMode === 'Promptside') {
      return state.promptsideCueText || (state.promptsideState === 'go' ? 'GO!' : state.promptsideState.startsWith('standby') ? 'STANDBY' : 'OFF');
    }
    if (state.operatingMode === 'MSC_RTP_MIDI') {
      return state.mscCurrentCue ? `CUE ${state.mscCurrentCue}` : (state.mscState === 'go' ? 'GO!' : state.mscState === 'standby+' ? 'STANDBY+' : state.mscState === 'standby' ? 'STOP' : 'STANDBY');
    }
    if (state.operatingMode === 'TSL_31') {
      return state.tsl31Name || 'CAM 1';
    }
    if (state.operatingMode === 'TSL_50') {
      return state.tsl50Name || 'STUDIO A';
    }
    if (state.operatingMode === 'OSC_CueLight') {
      return state.oscCueMessage || (state.oscCueState === 'go' ? 'GO!' : state.oscCueState.startsWith('standby') ? 'STANDBY' : 'OFF');
    }
    if (state.operatingMode === 'OSC' && state.oscCustomMessage.trim().length > 0) {
      return state.oscCustomMessage.trim();
    }
    if (state.operatingMode === 'ETC_CueSystem') {
      return `CUE CH ${state.cueChannel}`;
    }
    if (state.operatingMode === 'RTP_MIDI') {
      return `MIDI CH ${state.rtpMidiChannel === 0 ? 'OMNI' : state.rtpMidiChannel}`;
    }
    if (state.operatingMode === 'NMOS_IS07') {
      return state.nmosSource.slice(-12).toUpperCase();
    }
    return state.deviceName || 'UNASSIGNED';
  };

  const displayName = getDisplayName();
  const isTextLong = displayName.length > 10;

  // Helper for battery icon rendering
  const renderBatteryIcon = (percent: number, isCharging: boolean, isLow: boolean) => {
    if (isCharging) {
      return <BatteryCharging className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />;
    }
    if (isLow || percent <= 15) {
      return <BatteryWarning className="w-3.5 h-3.5 text-red-400 animate-bounce" />;
    }
    if (percent <= 35) {
      return <BatteryLow className="w-3.5 h-3.5 text-amber-400" />;
    }
    if (percent <= 75) {
      return <BatteryMedium className="w-3.5 h-3.5 text-emerald-400" />;
    }
    return <Battery className="w-3.5 h-3.5 text-emerald-400" />;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Visual Hardware Unit */}
      <div className="lg:col-span-5 flex flex-col items-center">
        <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          {/* Subtle glow behind device based on active tally color */}
          <div 
            className={`absolute -top-12 -left-12 w-48 h-48 rounded-full blur-3xl opacity-35 pointer-events-none transition-colors duration-500 ${
              activeColor.bg === 'bg-red-600' ? 'bg-red-500' :
              activeColor.bg === 'bg-emerald-500' ? 'bg-emerald-500' :
              activeColor.bg === 'bg-yellow-400' || activeColor.bg === 'bg-amber-500' ? 'bg-yellow-500' :
              activeColor.bg === 'bg-blue-600' ? 'bg-blue-500' :
              activeColor.bg === 'bg-white' ? 'bg-neutral-200' : 'bg-neutral-800'
            }`}
          />

          <div className="flex items-center justify-between mb-4 border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono font-medium text-neutral-300">Olimex ESP32-PoE2</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-cyan-400 border border-neutral-700 flex items-center gap-1">
                <Touchpad className="w-3 h-3" />
                <span>CST816T Touch</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                240×280
              </span>
            </div>
          </div>

          {/* Olimex ESP32-PoE2 Board and Mounted Waveshare 1.69" Touch Screen */}
          <div className="flex flex-col items-center my-2">
            <div 
              className="relative transition-transform duration-300 ease-out select-none"
              style={{
                transform: `rotate(${state.imuRotation}deg)`
              }}
            >
              {/* Olimex PCB Body (Red/Black Industrial PCB with silk screen) */}
              <div 
                className="w-72 rounded-3xl bg-gradient-to-b from-neutral-850 to-neutral-900 border-4 border-neutral-700 shadow-2xl p-4 flex flex-col items-center relative select-none"
                style={{
                  boxShadow: '0 25px 35px -10px rgba(0,0,0,0.85), inset 0 1px 2px rgba(255,255,255,0.1)'
                }}
              >
                {/* Board Label Header */}
                <div className="w-full flex justify-between items-center px-2 mb-2 text-[8.5px] font-mono tracking-wider text-neutral-400 uppercase">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-600 inline-block" />
                    <span>OLIMEX ESP32-PoE2</span>
                  </span>
                  <span>WAVESHARE 1.69&quot; TOUCH</span>
                </div>

                {/* Waveshare 1.69" Touch LCD Screen (240x280 aspect ratio with curved corners) */}
                <div
                  role="button"
                  tabIndex={0}
                  onMouseDown={handleScreenMouseDown}
                  onMouseUp={handleScreenMouseUp}
                  className={`w-52 h-60 rounded-2xl overflow-hidden border-2 border-neutral-950 shadow-inner flex flex-col cursor-pointer transition-all duration-150 transform relative select-none ${
                    isPressing ? 'scale-[0.98]' : 'scale-100 hover:scale-[1.01]'
                  } ${getScreenBgColor()}`}
                  style={{
                    opacity: state.isScreenDimmed ? 0.32 : ((brightnessPercents[state.brightnessLevel] / 100) * 0.4 + 0.6),
                    transition: 'opacity 0.25s ease'
                  }}
                  title="Touch Screen: Single Tap = Button Click, Double Tap = Diagnostics Page, Hold = Brightness"
                >
                  {/* Visual Touch Ripple */}
                  {touchFeedback && (
                    <div 
                      key={touchFeedback.key}
                      className="absolute rounded-full bg-white/40 pointer-events-none animate-ping z-40"
                      style={{
                        left: touchFeedback.x - 16,
                        top: touchFeedback.y - 16,
                        width: 32,
                        height: 32
                      }}
                    />
                  )}

                  {/* Dimmed Overlay */}
                  {state.isScreenDimmed && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-none z-30">
                      <span className="px-2.5 py-1 rounded bg-black/90 border border-amber-500/80 text-amber-300 text-[10px] font-bold tracking-wider font-mono shadow-lg animate-pulse">
                        DIMMED [ECO 10%]
                      </span>
                    </div>
                  )}

                  {state.currentScreen === 0 ? (
                    // Screen 0: Main Tally & Cue View with Top Header Battery Readout
                    <div className="w-full h-full p-2.5 flex flex-col justify-between text-left font-mono">
                      {/* Top Header Bar: Clock + Battery Charge Level & Status Readout */}
                      <div className="w-full bg-black/85 text-white border border-neutral-700/80 rounded-lg py-1 px-2 shadow-md flex items-center justify-between">
                        {/* Left: Clock / Timecode */}
                        <div className="flex items-center gap-1.5">
                          {state.mtcReaderEnabled ? (
                            <div className="text-[10px] font-mono font-bold tracking-widest text-amber-400 flex items-center gap-1">
                              <span className="text-[7.5px] px-1 py-0.2 bg-amber-950 text-amber-300 rounded border border-amber-800">MTC</span>
                              <span>{state.mtcTimecode || '00:00:00:00'}</span>
                            </div>
                          ) : (
                            <div className="text-[11px] font-mono font-bold tracking-widest text-white flex items-center gap-1">
                              <Clock className="w-3 h-3 text-neutral-400" />
                              <span>{currentTime}</span>
                            </div>
                          )}
                        </div>

                        {/* Right: Integrated Battery Readout & Status */}
                        <div className="flex items-center gap-1.5" title={`Battery: ${state.batteryVoltage.toFixed(2)}V (${state.batteryPercent}%) - ${state.batteryStatus}`}>
                          {renderBatteryIcon(state.batteryPercent, state.batteryCharging, state.batteryVoltage < 3.40)}
                          <div className="flex flex-col text-right leading-none">
                            <span className={`text-[10px] font-bold ${state.batteryPercent <= 15 ? 'text-red-400 font-extrabold animate-pulse' : 'text-emerald-400'}`}>
                              {state.batteryCharging ? '⚡' : ''}{state.batteryPercent}%
                            </span>
                            <span className="text-[7.5px] text-neutral-400 font-normal">
                              {state.batteryVoltage.toFixed(2)}V
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Main Device / Station / Cue Text Center */}
                      <div className="text-center py-1 my-auto w-full overflow-hidden">
                        {(state.operatingMode === 'TSL_31' || state.operatingMode === 'TSL_50') ? (
                          <div className="my-1">
                            <div className="text-lg font-black tracking-widest uppercase leading-tight truncate px-1 drop-shadow-md text-center">
                              {displayName}
                            </div>
                            <div className="text-[9px] font-mono opacity-80 mt-0.5">
                              {state.operatingMode === 'TSL_31' ? `TSL 3.1 [Addr ${state.tsl31Address || 'All'}]` : `TSL 5.0 [Idx ${state.tsl50Index || 'All'}]`}
                            </div>
                          </div>
                        ) : isTextLong ? (
                          <div className="w-full overflow-hidden whitespace-nowrap py-1">
                            <div className="inline-block animate-marquee font-black text-base uppercase tracking-wider drop-shadow-sm px-1">
                              {displayName} &nbsp; &bull; &nbsp; {displayName}
                            </div>
                          </div>
                        ) : (
                          <div className="text-base font-black tracking-wider uppercase leading-tight truncate px-1 drop-shadow-sm">
                            {displayName}
                          </div>
                        )}

                        {/* Status Label Badge */}
                        <div className="inline-block mt-1 px-3 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-current/40 bg-current/15 shadow-sm">
                          {getStatusLabel()}
                        </div>

                        {/* Mode-Specific Status Chips */}
                        {state.operatingMode === 'ETC_CueSystem' && state.cueAckActive && (
                          <div className="mt-1 text-[8.5px] font-bold uppercase tracking-wider bg-black text-emerald-400 border border-emerald-500 rounded px-1.5 py-0.5 animate-pulse">
                            [ACKNOWLEDGED]
                          </div>
                        )}
                        {state.operatingMode === 'OSC_CueLight' && state.oscCueState === 'standby_ack' && state.oscCueAckDone && (
                          <div className="mt-1 text-[8.5px] font-bold uppercase tracking-wider bg-black text-emerald-400 border border-emerald-500 rounded px-1.5 py-0.5">
                            [ACKNOWLEDGED]
                          </div>
                        )}
                        {state.operatingMode === 'Promptside' && state.promptsideState === 'standby_ack' && state.promptsideAckDone && (
                          <div className="mt-1 text-[8.5px] font-bold uppercase tracking-wider bg-black text-emerald-400 border border-emerald-500 rounded px-1.5 py-0.5">
                            [ACKNOWLEDGED]
                          </div>
                        )}

                        {/* Power Source Badge */}
                        <div className="mt-1.5 flex items-center justify-center">
                          <span className={`text-[8px] font-mono px-2 py-0.5 rounded-full border ${
                            state.powerSource === 'poe' 
                              ? 'bg-blue-950/80 text-blue-300 border-blue-700/60'
                              : state.powerSource === 'usb'
                              ? 'bg-purple-950/80 text-purple-300 border-purple-700/60'
                              : 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                          }`}>
                            {state.powerSource === 'poe' ? 'PoE 802.3af' : state.powerSource === 'usb' ? 'USB 5V' : 'LiPo Battery'} • {state.batteryStatus}
                          </span>
                        </div>
                      </div>

                      {/* Bottom Status & Touch Interaction Helper */}
                      <div className="border-t border-current/30 pt-1 text-[9px] flex flex-col gap-0.5">
                        <div className="flex justify-between items-center font-bold">
                          <span>
                            {state.operatingMode === 'TP' && '[TP (TA)]'}
                            {state.operatingMode === 'Presenter' && '[PRES (TA)]'}
                            {state.operatingMode === 'TP_P2P' && '[P2P TP]'}
                            {state.operatingMode === 'Presenter_P2P' && '[P2P PRES]'}
                            {state.operatingMode === 'ETC_CueSystem' && '[ETC CUE]'}
                            {state.operatingMode === 'NMOS_IS07' && '[NMOS-07]'}
                            {state.operatingMode === 'RTP_MIDI' && '[rtpMIDI]'}
                            {state.operatingMode === 'OSC' && '[OSC UDP]'}
                            {state.operatingMode === 'TSL_31' && `[TSL3.1 ${state.tsl31Transport}]`}
                            {state.operatingMode === 'TSL_50' && `[TSL5.0 ${state.tsl50Transport}]`}
                            {state.operatingMode === 'OSC_CueLight' && '[OSC CUE-LX]'}
                            {state.operatingMode === 'Promptside' && '[PROMPTSIDE]'}
                            {state.operatingMode === 'MSC_RTP_MIDI' && '[MSC rtpMIDI]'}
                          </span>
                          <span className="opacity-90 font-normal">
                            IP: {displayedIP}
                          </span>
                        </div>

                        {/* Touch Gesture Guidance Bar */}
                        <div className="bg-black/50 rounded py-0.5 px-1.5 flex justify-between items-center text-[8px] text-neutral-300 border border-white/10">
                          <span>👆 Tap: Button Action</span>
                          <span className="text-cyan-300 font-bold">👆👆 Double: Diag</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Screen 1: Network & Diagnostics (Follows Tally State Background)
                    <div className="w-full h-full p-2.5 text-left font-mono text-[9px] leading-tight flex flex-col justify-between">
                      <div>
                        {/* High-contrast header banner */}
                        <div className={`font-black border-b pb-0.5 text-[9.5px] flex items-center justify-between ${
                          activeColor.isDark ? 'text-cyan-300 border-white/30' : 'text-neutral-900 border-black/30'
                        }`}>
                          <span>OLIMEX PoE2 DIAG</span>
                          <span className="text-[8px] px-1 py-0.2 rounded bg-black/40 text-white font-mono">
                            {getStatusLabel()}
                          </span>
                        </div>

                        <div className={`mt-1 space-y-0.5 text-[8.5px] font-medium ${
                          activeColor.isDark ? 'text-neutral-100' : 'text-neutral-900 font-semibold'
                        }`}>
                          {/* Battery & Power Section */}
                          <div className="bg-black/40 rounded p-1 border border-white/10 my-0.5 text-[8px]">
                            <div className="text-amber-300 font-bold flex items-center justify-between">
                              <span>⚡ BATTERY & POWER:</span>
                              <span>{state.powerSource.toUpperCase()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Voltage (GPIO35):</span>
                              <span className="font-bold text-white">{state.batteryVoltage.toFixed(2)} V</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Charge Level:</span>
                              <span className="font-bold text-emerald-400">{state.batteryPercent}%</span>
                            </div>
                            <div className="flex justify-between truncate">
                              <span>Status:</span>
                              <span className="font-bold text-cyan-300 truncate">{state.batteryStatus}</span>
                            </div>
                          </div>

                          <div>Ethernet: <span className="font-bold">LAN8720A RMII (10/100M)</span></div>
                          <div>IP: <span className="font-bold">{displayedIP}</span> ({state.useDHCP ? 'DHCP' : 'Static'})</div>
                          <div>Mode: <span className="font-bold underline">{state.operatingMode}</span></div>
                          <div>Touch: <span className="font-bold text-cyan-300">CST816T (I2C 0x15)</span></div>
                          <div>Gestures: <span className="font-bold">1-Tap=Btn | 2-Tap=Diag</span></div>
                          <div>Display: <span className="font-bold">ST7789V2 240×280 (134KB DMA)</span></div>

                          {state.operatingMode === 'Promptside' ? (
                            <div>Promptside: <span>Ch {state.promptsideChannel} ({state.promptsideState})</span></div>
                          ) : state.operatingMode === 'ETC_CueSystem' ? (
                            <div>ETC Hub: <span>{state.cueHost}:{state.cuePort} (Ch {state.cueChannel})</span></div>
                          ) : state.operatingMode === 'NMOS_IS07' ? (
                            <div>NMOS: <span>PRG: {state.nmosOnAir ? 'ON' : 'off'} | PVW: {state.nmosPreview ? 'ON' : 'off'}</span></div>
                          ) : state.operatingMode === 'TSL_31' ? (
                            <div>TSL 3.1: <span>Port {state.tsl31Port} (Addr: {state.tsl31Address || 'All'})</span></div>
                          ) : state.operatingMode === 'TSL_50' ? (
                            <div>TSL 5.0: <span>Port {state.tsl50Port} (Idx: {state.tsl50Index || 'All'})</span></div>
                          ) : (
                            <div>TA Server: <span>{state.taHost}:{state.taPort}</span></div>
                          )}
                        </div>
                      </div>

                      <div className={`border-t pt-1 flex justify-between text-[8px] ${
                        activeColor.isDark ? 'border-white/20 text-neutral-300' : 'border-black/20 text-neutral-800'
                      }`}>
                        <span>Bright: {brightnessPercents[state.brightnessLevel]}%</span>
                        <span className="font-bold text-cyan-300">Double-Tap Screen ↻</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Touch Feedback Banner */}
                {touchFeedback && (
                  <div className="mt-2 px-3 py-1 bg-cyan-950/90 text-cyan-300 border border-cyan-500 rounded-full text-[9px] font-mono font-bold animate-pulse text-center">
                    {touchFeedback.action}
                  </div>
                )}

                {/* Olimex PCB Bottom Section: RJ45 MagJack + Battery Connector + LAN8720A */}
                <div className="w-full mt-3 pt-3 border-t border-neutral-700/80 flex items-center justify-between px-2 text-[9px] font-mono">
                  {/* RJ45 Ethernet Socket */}
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-7 bg-neutral-950 border border-neutral-600 rounded-sm flex items-center justify-between px-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${state.ethernetCableConnected ? 'bg-amber-400 animate-ping' : 'bg-neutral-700'}`} title="Ethernet Activity" />
                      <span className="text-[7px] text-neutral-500 font-bold">PoE</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${state.ethernetCableConnected ? 'bg-emerald-400' : 'bg-neutral-700'}`} title="Ethernet Link 100M" />
                    </div>
                    <div className="flex flex-col text-[8px] text-neutral-400">
                      <span className="text-white font-bold">LAN8720A</span>
                      <span>RMII 50MHz</span>
                    </div>
                  </div>

                  {/* LiPo Battery JST Connector & Charger */}
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col text-right text-[8px]">
                      <span className="text-white font-bold">MCP73831</span>
                      <span className={state.batteryCharging ? 'text-amber-400 font-bold' : 'text-neutral-400'}>
                        {state.batteryCharging ? 'CHG ON' : 'STBY'}
                      </span>
                    </div>
                    <div className="w-6 h-6 bg-red-950/80 border border-red-700 rounded flex items-center justify-center text-red-400" title="LiPo 3.7V JST Connector">
                      <Zap className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Hardware Touch Gesture Test Buttons */}
          <div className="mt-3 bg-neutral-950 rounded-xl p-3 border border-neutral-800 text-xs font-mono">
            <div className="flex items-center justify-between mb-2">
              <span className="text-neutral-300 font-semibold flex items-center gap-1.5">
                <Hand className="w-3.5 h-3.5 text-cyan-400" />
                <span>Simulate Touch Gestures:</span>
              </span>
              <span className="text-[10px] text-neutral-400">Tap screen or click buttons:</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  executeButtonAction();
                  setTouchFeedback({ x: 104, y: 120, action: '👆 Single Tap: Button Click', key: Date.now() });
                }}
                className="py-1.5 px-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 rounded-lg text-[10.5px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>👆 Single Tap</span>
                <span className="text-cyan-400">(Action)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setState(prev => ({ ...prev, currentScreen: prev.currentScreen === 0 ? 1 : 0 }));
                  setTouchFeedback({ x: 104, y: 120, action: '👆👆 Double Tap: Diagnostics Page', key: Date.now() });
                }}
                className="py-1.5 px-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 rounded-lg text-[10.5px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>👆👆 Double Tap</span>
                <span className="text-amber-400">(Diag)</span>
              </button>
            </div>
          </div>

          {/* Quick Hardware Action Tips */}
          <div className="mt-3 bg-neutral-950/60 rounded-xl p-3 border border-neutral-800 text-xs font-mono text-neutral-400 space-y-1">
            <div className="text-neutral-300 font-semibold mb-1 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-400" />
              <span>Waveshare 1.69&quot; Touch &amp; Power Gestures:</span>
            </div>
            <div className="flex justify-between">
              <span>• Single Tap:</span>
              <span className="text-white">
                {state.operatingMode === 'ETC_CueSystem' ? 'Send Performer ACK' :
                 state.operatingMode === 'NMOS_IS07' ? 'Toggle IS-07 PRG' : 'Toggle Cue Return'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>• Double Tap:</span>
              <span className="text-white">Switch Screen (Tally / Diag)</span>
            </div>
            <div className="flex justify-between">
              <span>• Long Press (&gt;1.2s):</span>
              <span className="text-white">Brightness ({brightnessPercents[state.brightnessLevel]}%)</span>
            </div>
            <div className="flex justify-between">
              <span>• Battery ADC:</span>
              <span className="text-emerald-400">GPIO 35 (2:1 Resistor Divider)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Simulator Control Board */}
      <div className="lg:col-span-7 space-y-6">
        {/* NEW: Olimex Battery & Power Supply Control Panel */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
              <BatteryCharging className="w-4 h-4 text-emerald-400" />
              <span>Battery &amp; Power Source Management</span>
            </h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-neutral-800 text-emerald-300 border border-neutral-700">
              {state.batteryVoltage.toFixed(2)}V ({state.batteryPercent}%)
            </span>
          </div>

          {/* Power Source Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
            <button
              type="button"
              onClick={() => setPowerPreset('poe', 4.15)}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.powerSource === 'poe'
                  ? 'bg-blue-950/60 text-white border-blue-500 shadow-md shadow-blue-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-blue-400 flex items-center gap-1">
                <Network className="w-3.5 h-3.5" />
                <span>PoE (802.3af)</span>
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5">LAN8720A Active + Charger</p>
            </button>

            <button
              type="button"
              onClick={() => setPowerPreset('usb', 4.05)}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.powerSource === 'usb'
                  ? 'bg-purple-950/60 text-white border-purple-500 shadow-md shadow-purple-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-purple-400 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                <span>USB-C / 5V Rail</span>
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5">USB Powered + Charging</p>
            </button>

            <button
              type="button"
              onClick={() => setPowerPreset('battery', 3.82)}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.powerSource === 'battery'
                  ? 'bg-amber-950/60 text-white border-amber-500 shadow-md shadow-amber-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-amber-400 flex items-center gap-1">
                <Battery className="w-3.5 h-3.5" />
                <span>LiPo Battery Only</span>
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5">Untethered Discharging</p>
            </button>
          </div>

          {/* Battery Voltage Slider & Presets */}
          <div className="bg-neutral-950 rounded-xl p-4 border border-neutral-800 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="text-neutral-300 font-semibold">Simulate Battery Voltage (GPIO 35 ADC):</span>
              <span className="text-emerald-400 font-bold">{state.batteryVoltage.toFixed(2)} V &nbsp;({state.batteryPercent}%)</span>
            </div>

            <input
              type="range"
              min="3.20"
              max="4.25"
              step="0.01"
              value={state.batteryVoltage}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setPowerPreset(state.powerSource, v);
              }}
              className="w-full accent-emerald-500 cursor-pointer"
            />

            <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
              {[
                { label: 'Full 100% (4.20V)', v: 4.20 },
                { label: 'Good 78% (3.95V)', v: 3.95 },
                { label: 'Medium 45% (3.78V)', v: 3.78 },
                { label: 'Low Alert 12% (3.38V)', v: 3.38 },
              ].map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setPowerPreset(state.powerSource, preset.v)}
                  className="px-2.5 py-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-[10px] text-neutral-300 cursor-pointer transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="p-2.5 bg-neutral-900/80 rounded-lg border border-neutral-800 flex items-center justify-between text-[11px]">
              <span className="text-neutral-400">Current Battery Telemetry:</span>
              <span className={`font-bold ${state.batteryPercent <= 15 ? 'text-red-400' : 'text-cyan-300'}`}>
                {state.batteryStatus}
              </span>
            </div>
          </div>
        </div>

        {/* Operating Mode Selector */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
              <span>Operating Mode Selection</span>
            </h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-neutral-800 text-neutral-300 border border-neutral-700">
              {state.operatingMode}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'TP', presenterCueActive: false }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'TP'
                  ? 'bg-blue-950/60 text-white border-blue-500 shadow-md shadow-blue-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-blue-400">TP (TA)</div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">Tally Arbiter Program return</p>
            </button>

            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'Presenter', presenterCueActive: false }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'Presenter'
                  ? 'bg-emerald-950/60 text-white border-emerald-500 shadow-md shadow-emerald-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-emerald-400">Presenter (TA)</div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">Tally Arbiter Preview cue</p>
            </button>

            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'TP_P2P' }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'TP_P2P'
                  ? 'bg-purple-950/60 text-white border-purple-500 shadow-md shadow-purple-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-purple-400">P2P TP Master</div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">Zero-server standalone</p>
            </button>

            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'Presenter_P2P' }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'Presenter_P2P'
                  ? 'bg-amber-950/60 text-white border-amber-500 shadow-md shadow-amber-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-amber-400">P2P Presenter</div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">Zero-server slave</p>
            </button>

            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'ETC_CueSystem' }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'ETC_CueSystem'
                  ? 'bg-red-950/60 text-white border-red-500 shadow-md shadow-red-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-red-400">ETC CueSystem</div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">Flash Standby &amp; Solid Ack</p>
            </button>

            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'NMOS_IS07' }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'NMOS_IS07'
                  ? 'bg-cyan-950/60 text-white border-cyan-500 shadow-md shadow-cyan-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-cyan-400">NMOS IS-07</div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">PRG, PVW &amp; AUX Endpoints</p>
            </button>

            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'RTP_MIDI' }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'RTP_MIDI'
                  ? 'bg-indigo-950/60 text-white border-indigo-500 shadow-md shadow-indigo-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-indigo-400 flex items-center gap-1">
                <Music className="w-3.5 h-3.5" />
                <span>rtpMIDI</span>
              </div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">6 Colors with Priority</p>
            </button>

            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'OSC' }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'OSC'
                  ? 'bg-teal-950/60 text-white border-teal-500 shadow-md shadow-teal-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-teal-400 flex items-center gap-1">
                <Volume2 className="w-3.5 h-3.5" />
                <span>OSC Mode</span>
              </div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">Scrolling Text Ticker</p>
            </button>

            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'TSL_31' }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'TSL_31'
                  ? 'bg-blue-950/60 text-white border-blue-400 shadow-md shadow-blue-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-blue-400 flex items-center gap-1">
                <Radio className="w-3.5 h-3.5" />
                <span>TSL 3.1 Listener</span>
              </div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">UDP/TCP, Centered Name</p>
            </button>

            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'TSL_50' }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'TSL_50'
                  ? 'bg-violet-950/60 text-white border-violet-400 shadow-md shadow-violet-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-violet-400 flex items-center gap-1">
                <Radio className="w-3.5 h-3.5" />
                <span>TSL 5.0 Listener</span>
              </div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">UDP/TCP 4-Tally Binary</p>
            </button>

            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'OSC_CueLight', oscCueAckDone: false }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'OSC_CueLight'
                  ? 'bg-rose-950/60 text-white border-rose-500 shadow-md shadow-rose-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-rose-400 flex items-center gap-1">
                <Theater className="w-3.5 h-3.5" />
                <span>OSC Cue Light</span>
              </div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">RSMCK iOS Protocol</p>
            </button>

            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'Promptside', promptsideAckDone: false }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'Promptside'
                  ? 'bg-cyan-950/60 text-white border-cyan-400 shadow-md shadow-cyan-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-cyan-400 flex items-center gap-1">
                <Radio className="w-3.5 h-3.5" />
                <span>Promptside</span>
              </div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">Theatrical Wing System</p>
            </button>

            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'MSC_RTP_MIDI' }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'MSC_RTP_MIDI'
                  ? 'bg-amber-950/60 text-white border-amber-400 shadow-md shadow-amber-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-amber-400 flex items-center gap-1">
                <Music className="w-3.5 h-3.5" />
                <span>MSC rtpMIDI</span>
              </div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">MIDI Show Control</p>
            </button>
          </div>
        </div>

        {/* Live Incoming Tally & Packet Monitor */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
              <Radio className="w-4 h-4 text-purple-400" />
              <span>Simulate Studio Video Mixer / Cue Hub Events</span>
            </h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-neutral-800 text-neutral-400 border border-neutral-700">
              Live State: {getStatusLabel()}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => {
                setState(prev => ({
                  ...prev,
                  tallyState: 'program',
                  cueState: 'go',
                  nmosOnAir: true,
                  nmosPreview: false,
                  promptsideState: 'go',
                  oscCueState: 'go'
                }));
              }}
              className="py-2.5 px-3 rounded-xl bg-red-950/70 hover:bg-red-900/80 text-red-200 border border-red-700/80 font-mono text-xs font-bold transition-all shadow-md shadow-red-950/40 cursor-pointer"
            >
              ● PROGRAM (Red)
            </button>

            <button
              type="button"
              onClick={() => {
                setState(prev => ({
                  ...prev,
                  tallyState: 'preview',
                  cueState: 'standby',
                  cueAckActive: true,
                  nmosOnAir: false,
                  nmosPreview: true,
                  promptsideState: 'standby',
                  oscCueState: 'standby'
                }));
              }}
              className="py-2.5 px-3 rounded-xl bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-200 border border-emerald-700/80 font-mono text-xs font-bold transition-all shadow-md shadow-emerald-950/40 cursor-pointer"
            >
              ● PREVIEW (Green)
            </button>

            <button
              type="button"
              onClick={() => {
                setState(prev => ({
                  ...prev,
                  tallyState: 'aux',
                  nmosOnAir: false,
                  nmosPreview: false,
                  nmosAux: true
                }));
              }}
              className="py-2.5 px-3 rounded-xl bg-amber-950/70 hover:bg-amber-900/80 text-amber-200 border border-amber-700/80 font-mono text-xs font-bold transition-all shadow-md shadow-amber-950/40 cursor-pointer"
            >
              ● AUX (Amber)
            </button>

            <button
              type="button"
              onClick={() => {
                setState(prev => ({
                  ...prev,
                  tallyState: 'standby',
                  cueState: 'standby',
                  cueAckActive: false,
                  nmosOnAir: false,
                  nmosPreview: false,
                  nmosAux: false,
                  promptsideState: 'standby_ack',
                  promptsideAckDone: false,
                  oscCueState: 'standby_ack',
                  oscCueAckDone: false
                }));
              }}
              className="py-2.5 px-3 rounded-xl bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border border-neutral-700 font-mono text-xs font-bold transition-all cursor-pointer"
            >
              FLASH STANDBY
            </button>
          </div>

          {/* Last Transmitted UDP Packet Log */}
          {lastTslPacket && (
            <div className="mt-4 bg-neutral-950 rounded-xl p-3 border border-neutral-800 font-mono text-xs">
              <div className="text-[11px] text-neutral-400 mb-1 flex items-center justify-between">
                <span>Last Outgoing UDP Packet:</span>
                <span className="text-neutral-500">{lastTslPacket.timestamp}</span>
              </div>
              <div className="text-cyan-400 font-bold break-all">{lastTslPacket.hex}</div>
              <div className="text-neutral-400 text-[10.5px] mt-0.5">{lastTslPacket.decoded}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
