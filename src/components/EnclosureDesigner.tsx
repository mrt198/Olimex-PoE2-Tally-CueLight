import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BatteryCharging,
  Box,
  ChevronDown,
  ChevronUp,
  Compass,
  Download,
  Eye,
  Layers,
  Printer,
  RotateCcw,
  ShieldAlert,
  Sliders
} from 'lucide-react';
import { SimulatorState } from './AtomSimulator';
import {
  BATTERY_PRESETS,
  BatteryPresetId,
  computeEnclosureMetrics,
  DEFAULT_ENCLOSURE_PARAMS,
  EnclosureParams,
  HARDWARE_SPECS,
  ScreenOrientation,
  SHELL_FINISHES,
  ShellFinishId
} from '../cad/enclosureSpec';
import {
  buildBatteryPackGroup,
  buildBottomTrayGroup,
  buildFastenersGroup,
  buildLcdRetainerClipGroup,
  buildOlimexBoardGroup,
  buildTopShellGroup,
  buildWaveshareLcdGroup
} from '../cad/enclosureGeometry';
import { downloadObjectAsSTL } from '../cad/stlExport';

interface EnclosureDesignerProps {
  simState: SimulatorState;
}

type DockTab = 'view' | 'params' | 'export';

type CameraPresetId = 'desk' | 'front' | 'rear' | 'battery' | 'side';

const CAMERA_PRESETS: Record<
  CameraPresetId,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  desk: { label: 'Desk 3/4', pos: [115, 92, 130], target: [0, 22, 0] },
  front: { label: '15° Screen', pos: [0, 68, 138], target: [0, 26, 4] },
  rear: { label: 'Rear Ports', pos: [-38, 48, -142], target: [0, 24, -18] },
  battery: { label: 'Battery Bay', pos: [122, 54, -36], target: [0, 16, 0] },
  side: { label: '15° Side', pos: [152, 34, 0], target: [0, 24, 0] }
};

function createGridMatTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0e131d';
    ctx.fillRect(0, 0, size, size);

    // Subtle 10mm grid (assuming plane is 320x320mm -> 32 cells -> 32px/cell)
    const cells = 32;
    const step = size / cells;
    for (let i = 0; i <= cells; i++) {
      const p = i * step;
      const isMajor = i % 5 === 0;
      ctx.strokeStyle = isMajor ? 'rgba(148, 163, 184, 0.24)' : 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = isMajor ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }

    // Technical border scale ticks
    ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('10 mm GRID · SCALE 1:1', 28, size - 28);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.12,
      size / 2,
      size / 2,
      size * 0.48
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
    grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.25)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawTallyScreenToCanvas(
  canvas: HTMLCanvasElement,
  simState: SimulatorState,
  orientation: ScreenOrientation
) {
  const w = orientation === 'portrait' ? 240 : 280;
  const h = orientation === 'portrait' ? 280 : 240;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const isProgram = simState.tallyState === 'program';
  const isPreview =
    simState.tallyState === 'preview' ||
    ((simState.operatingMode === 'TP' || simState.operatingMode === 'TP_P2P') &&
      simState.presenterCueActive) ||
    (simState.operatingMode === 'Presenter_P2P' && simState.isCueActive);
  const isAux = simState.tallyState === 'aux';

  const bg = isProgram
    ? '#dc2626'
    : isPreview
    ? '#10b981'
    : isAux
    ? '#f59e0b'
    : '#090d14';
  const fg = isProgram || bg === '#090d14' ? '#ffffff' : '#05080d';
  const statusText = isProgram
    ? 'PROGRAM'
    : isPreview
    ? 'PREVIEW'
    : isAux
    ? 'AUX'
    : 'STANDBY';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Header strip
  ctx.fillStyle = isProgram || bg === '#090d14' ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 0, w, 34);

  ctx.fillStyle = fg;
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(simState.ethernetCableConnected ? 'PoE ETH' : 'WiFi BAT', 14, 22);

  ctx.textAlign = 'right';
  ctx.fillText(`${simState.batteryPercent}%`, w - 14, 22);

  // Device Name & Status
  ctx.textAlign = 'center';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText((simState.deviceName || 'CAM 1').slice(0, 12), w / 2, h / 2 - 12);

  ctx.font = 'bold 20px monospace';
  ctx.fillText(statusText, w / 2, h / 2 + 24);

  // Footer Mode
  ctx.font = '13px monospace';
  ctx.globalAlpha = 0.85;
  ctx.fillText(simState.operatingMode, w / 2, h - 18);
  ctx.globalAlpha = 1;
}

export const EnclosureDesigner: React.FC<EnclosureDesignerProps> = ({ simState }) => {
  const [params, setParams] = useState<EnclosureParams>(DEFAULT_ENCLOSURE_PARAMS);
  const [dockTab, setDockTab] = useState<DockTab>('view');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [explodeTarget, setExplodeTarget] = useState(0.28); // Slight initial reveal or 0
  const [xrayShell, setXrayShell] = useState(false);
  const [orientPrintFlat, setOrientPrintFlat] = useState(true);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<CameraPresetId>('desk');

  const metrics = useMemo(
    () =>
      computeEnclosureMetrics(
        params,
        simState.cpuFrequency,
        simState.brightnessLevel,
        !simState.ethernetCableConnected || simState.wifiKeepOnWithPoE
      ),
    [params, simState.cpuFrequency, simState.brightnessLevel, simState.ethernetCableConnected, simState.wifiKeepOnWithPoE]
  );

  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  // Mutable refs for Three.js lifecycle without re-mounting WebGL context
  const sceneRefs = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    assemblyRoot: THREE.Group;
    bottomTray: THREE.Group | null;
    topShell: THREE.Group | null;
    retainerClip: THREE.Group | null;
    olimexBoard: THREE.Group | null;
    batteryPack: THREE.Group | null;
    lcdModule: THREE.Group | null;
    fasteners: THREE.Group | null;
    shellMaterial: THREE.MeshPhysicalMaterial;
    clipMaterial: THREE.MeshStandardMaterial;
    screenCanvas: HTMLCanvasElement;
    screenTexture: THREE.CanvasTexture;
    requestRender: () => void;
    targetExplode: number;
    currentExplode: number;
    camTransition: {
      active: boolean;
      targetPos: THREE.Vector3;
      targetLook: THREE.Vector3;
    };
  } | null>(null);

  // 1. Initialize WebGL Scene once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const testCanvas = document.createElement('canvas');
        const gl = testCanvas.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance'
      });
    } catch {
      setWebglError('WebGL is unavailable in this browser session. CAD specifications remain interactive below.');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || 800, container.clientHeight || 560);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL context lost. Reload or switch tabs to restore the 3D viewport.');
    };
    const onContextRestored = () => {
      setWebglError(null);
      requestRender();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    const bgHex = 0x0b0f17;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.0014);

    // Studio Reflection Environment (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    pmremGenerator.dispose();

    const aspect = (container.clientWidth || 800) / Math.max(1, container.clientHeight || 560);
    const camera = new THREE.PerspectiveCamera(36, aspect, 1, 1400);
    camera.position.set(...CAMERA_PRESETS.desk.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.desk.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.minDistance = 65;
    controls.maxDistance = 360;
    controls.maxPolarAngle = Math.PI * 0.49;

    // 3-Point Warm/Cool Studio Rig
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e2, 1.85);
    keyLight.position.set(110, 175, 115);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 20;
    keyLight.shadow.camera.far = 420;
    keyLight.shadow.camera.left = -105;
    keyLight.shadow.camera.right = 105;
    keyLight.shadow.camera.top = 105;
    keyLight.shadow.camera.bottom = -105;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.04;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.95);
    rimLight.position.set(-100, 95, -120);
    scene.add(rimLight);

    // Ground Drafting Mat + Contact Shadow
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const gridTex = createGridMatTexture(maxAniso);
    const groundMat = new THREE.MeshStandardMaterial({
      map: gridTex,
      roughness: 0.86,
      metalness: 0.08
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(340, 340), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);

    const shadowTex = createContactShadowTexture();
    const contactPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(130, 165),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.72,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      })
    );
    contactPlane.rotation.x = -Math.PI / 2;
    contactPlane.position.y = -0.02;
    scene.add(contactPlane);

    const assemblyRoot = new THREE.Group();
    scene.add(assemblyRoot);

    const shellMaterial = new THREE.MeshPhysicalMaterial({
      color: SHELL_FINISHES.obsidian.color,
      roughness: SHELL_FINISHES.obsidian.roughness,
      metalness: SHELL_FINISHES.obsidian.metalness,
      clearcoat: 0.08,
      clearcoatRoughness: 0.65
    });

    const clipMaterial = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.48,
      metalness: 0.08
    });

    const screenCanvas = document.createElement('canvas');
    drawTallyScreenToCanvas(screenCanvas, simState, DEFAULT_ENCLOSURE_PARAMS.orientation);
    const screenTexture = new THREE.CanvasTexture(screenCanvas);
    screenTexture.colorSpace = THREE.SRGBColorSpace;
    screenTexture.anisotropy = maxAniso;

    // On-demand coalesced rendering loop with smooth damp transitions
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      gl.flush();
      const poll = () => {
        const status = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const requestRender = () => {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        renderDirty = false;
        const dt = Math.min(0.1, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;

        const state = sceneRefs.current;
        let needsAnotherFrame = false;

        if (state) {
          // Smooth damped exploded-view separation
          if (Math.abs(state.currentExplode - state.targetExplode) > 0.002) {
            state.currentExplode = THREE.MathUtils.damp(
              state.currentExplode,
              state.targetExplode,
              8.0,
              dt
            );
            needsAnotherFrame = true;
          } else {
            state.currentExplode = state.targetExplode;
          }

          const e = state.currentExplode;
          if (state.batteryPack) state.batteryPack.position.x = -e * 48;
          if (state.olimexBoard) {
            state.olimexBoard.position.y = (state.olimexBoard.userData.baseY ?? 14.4) + e * 22;
          }
          if (state.fasteners) state.fasteners.position.y = e * 28;
          if (state.retainerClip) {
            state.retainerClip.position.y = state.retainerClip.userData.baseY + e * 38;
          }
          if (state.lcdModule) {
            state.lcdModule.position.y = state.lcdModule.userData.baseY + e * 52;
          }
          if (state.topShell) {
            state.topShell.position.y = e * 68;
          }

          // Smooth damped camera preset transition
          if (state.camTransition.active) {
            camera.position.x = THREE.MathUtils.damp(
              camera.position.x,
              state.camTransition.targetPos.x,
              7.5,
              dt
            );
            camera.position.y = THREE.MathUtils.damp(
              camera.position.y,
              state.camTransition.targetPos.y,
              7.5,
              dt
            );
            camera.position.z = THREE.MathUtils.damp(
              camera.position.z,
              state.camTransition.targetPos.z,
              7.5,
              dt
            );
            controls.target.x = THREE.MathUtils.damp(
              controls.target.x,
              state.camTransition.targetLook.x,
              7.5,
              dt
            );
            controls.target.y = THREE.MathUtils.damp(
              controls.target.y,
              state.camTransition.targetLook.y,
              7.5,
              dt
            );
            controls.target.z = THREE.MathUtils.damp(
              controls.target.z,
              state.camTransition.targetLook.z,
              7.5,
              dt
            );
            if (
              camera.position.distanceTo(state.camTransition.targetPos) < 0.35 &&
              controls.target.distanceTo(state.camTransition.targetLook) < 0.35
            ) {
              camera.position.copy(state.camTransition.targetPos);
              controls.target.copy(state.camTransition.targetLook);
              state.camTransition.active = false;
            } else {
              needsAnotherFrame = true;
            }
          }
        }

        const didControlMove = controls.update();
        if (didControlMove && controls.enableDamping) {
          needsAnotherFrame = true;
        }

        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty || needsAnotherFrame) {
            requestRender();
          }
        };

        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    const onControlStart = () => {
      if (sceneRefs.current) {
        sceneRefs.current.camTransition.active = false;
      }
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('change', requestRender);

    sceneRefs.current = {
      renderer,
      scene,
      camera,
      controls,
      assemblyRoot,
      bottomTray: null,
      topShell: null,
      retainerClip: null,
      olimexBoard: null,
      batteryPack: null,
      lcdModule: null,
      fasteners: null,
      shellMaterial,
      clipMaterial,
      screenCanvas,
      screenTexture,
      requestRender,
      targetExplode: explodeTarget,
      currentExplode: explodeTarget,
      camTransition: {
        active: false,
        targetPos: new THREE.Vector3(...CAMERA_PRESETS.desk.pos),
        targetLook: new THREE.Vector3(...CAMERA_PRESETS.desk.target)
      }
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 560;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    const resizeObs = new ResizeObserver(handleResize);
    resizeObs.observe(container);

    requestRender();

    return () => {
      resizeObs.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      gridTex.dispose();
      shadowTex.dispose();
      screenTexture.dispose();
      envRT.dispose();
      shellMaterial.dispose();
      clipMaterial.dispose();
      renderer.dispose();
      sceneRefs.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Rebuild parametric CAD assembly whenever enclosure parameters change
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;

    const disposeGroup = (grp: THREE.Group | null) => {
      if (!grp) return;
      refs.assemblyRoot.remove(grp);
      grp.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material !== refs.shellMaterial && child.material !== refs.clipMaterial) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else if (child.material.map !== refs.screenTexture) child.material.dispose();
          }
        }
      });
    };

    disposeGroup(refs.bottomTray);
    disposeGroup(refs.topShell);
    disposeGroup(refs.retainerClip);
    disposeGroup(refs.olimexBoard);
    disposeGroup(refs.batteryPack);
    disposeGroup(refs.lcdModule);
    disposeGroup(refs.fasteners);

    const bottomTray = buildBottomTrayGroup(params, metrics, refs.shellMaterial);
    const topShell = buildTopShellGroup(params, metrics, refs.shellMaterial);
    const retainerClip = buildLcdRetainerClipGroup(params, metrics, refs.clipMaterial);
    retainerClip.userData.baseY = retainerClip.position.y;
    const olimexBoard = buildOlimexBoardGroup(metrics);
    olimexBoard.userData.baseY = metrics.pcbBottomY;
    const batteryPack = buildBatteryPackGroup(params, metrics);
    const lcdModule = buildWaveshareLcdGroup(params, metrics, refs.screenTexture);
    lcdModule.userData.baseY = lcdModule.position.y;
    const fasteners = buildFastenersGroup(params, metrics);

    refs.assemblyRoot.add(
      bottomTray,
      topShell,
      retainerClip,
      olimexBoard,
      batteryPack,
      lcdModule,
      fasteners
    );

    refs.bottomTray = bottomTray;
    refs.topShell = topShell;
    refs.retainerClip = retainerClip;
    refs.olimexBoard = olimexBoard;
    refs.batteryPack = batteryPack;
    refs.lcdModule = lcdModule;
    refs.fasteners = fasteners;

    // Apply current explode immediately on rebuild
    const e = refs.currentExplode;
    batteryPack.position.x = -e * 48;
    olimexBoard.position.y = metrics.pcbBottomY + e * 22;
    fasteners.position.y = e * 28;
    retainerClip.position.y = retainerClip.userData.baseY + e * 38;
    lcdModule.position.y = lcdModule.userData.baseY + e * 52;
    topShell.position.y = e * 68;

    refs.requestRender();
  }, [params, metrics]);

  // 3. Update shell finish & X-ray transparency
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    const finish = SHELL_FINISHES[params.finish];
    refs.shellMaterial.color.setHex(finish.color);
    refs.shellMaterial.roughness = finish.roughness;
    refs.shellMaterial.metalness = finish.metalness;
    const isTransparent = xrayShell || Boolean(finish.transparent);
    refs.shellMaterial.transparent = isTransparent;
    refs.shellMaterial.opacity = xrayShell ? 0.34 : (finish.opacity ?? 1.0);
    refs.shellMaterial.depthWrite = !isTransparent;
    refs.shellMaterial.needsUpdate = true;
    refs.requestRender();
  }, [params.finish, xrayShell]);

  // 4. Sync live Waveshare 1.69" LCD canvas texture with Simulator state
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    drawTallyScreenToCanvas(refs.screenCanvas, simState, params.orientation);
    refs.screenTexture.needsUpdate = true;
    refs.requestRender();
  }, [
    simState.tallyState,
    simState.deviceName,
    simState.batteryPercent,
    simState.ethernetCableConnected,
    simState.operatingMode,
    simState.presenterCueActive,
    simState.isCueActive,
    params.orientation
  ]);

  // 5. Update target explode separation smoothly
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    refs.targetExplode = explodeTarget;
    refs.requestRender();
  }, [explodeTarget]);

  const handleSelectCameraPreset = (presetId: CameraPresetId) => {
    setActivePreset(presetId);
    const refs = sceneRefs.current;
    if (!refs) return;
    const p = CAMERA_PRESETS[presetId];
    refs.camTransition.targetPos.set(...p.pos);
    refs.camTransition.targetLook.set(...p.target);
    refs.camTransition.active = true;
    refs.requestRender();
  };

  const handleExportPart = (part: 'top' | 'bottom' | 'clip' | 'all') => {
    const refs = sceneRefs.current;
    if (!refs) return;

    if ((part === 'top' || part === 'all') && refs.topShell) {
      downloadObjectAsSTL(refs.topShell, `Olimex_PoE2_Top_${params.slantDeg}deg_Shell.stl`, {
        rotateXDeg: orientPrintFlat ? 180 - params.slantDeg : 0,
        flattenOnGround: true
      });
    }
    if ((part === 'bottom' || part === 'all') && refs.bottomTray) {
      downloadObjectAsSTL(refs.bottomTray, 'Olimex_PoE2_Bottom_Battery_Tray.stl', {
        rotateXDeg: 0,
        flattenOnGround: true
      });
    }
    if ((part === 'clip' || part === 'all') && refs.retainerClip) {
      downloadObjectAsSTL(refs.retainerClip, 'Waveshare_169_LCD_Retainer_Clip.stl', {
        rotateXDeg: -params.slantDeg,
        flattenOnGround: true
      });
    }
  };

  const batPreset = BATTERY_PRESETS[params.batteryPreset];

  return (
    <div className="space-y-8">
      {/* Unobstructed 3D CAD Viewport with Collapsible Bottom Control Dock */}
      <div className="relative w-full h-[640px] rounded-2xl overflow-hidden border border-neutral-800 bg-[#0b0f17] shadow-2xl">
        {/* Isolated Three.js Canvas Mount */}
        <div ref={canvasMountRef} className="w-full h-full" />

        {webglError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0b0f17] p-6 text-center">
            <div className="max-w-md space-y-2">
              <p className="text-sm font-semibold text-white">{webglError}</p>
              <p className="text-xs text-neutral-400">
                All CAD dimensions, battery power calculations, and print specifications are shown below.
              </p>
            </div>
          </div>
        )}

        {/* Top-Left Minimal Spec Strip (No Pills, No Backdrop Blur, No Pulsating Dots) */}
        <div className="pointer-events-none absolute top-4 left-4 right-4 flex items-center justify-between gap-4">
          <div className="bg-[#0e131d]/90 border border-neutral-800 rounded-xl px-4 py-2.5 text-xs text-neutral-300">
            <div className="font-semibold text-white">
              Olimex ESP32-PoE2 Desk Enclosure
            </div>
            <div className="flex flex-wrap items-center gap-2 text-neutral-400 font-mono tabular-nums mt-0.5">
              <span>{metrics.outerWidth} × {metrics.outerDepth} × {metrics.rearHeight} mm</span>
              <span aria-hidden="true">·</span>
              <span>{params.slantDeg}° Screen Slant</span>
              <span aria-hidden="true">·</span>
              <span>{batPreset.capacityMah} mAh (~{metrics.estimatedRuntimeHours}h)</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleExportPart('all')}
            className="pointer-events-auto px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-xs rounded-xl transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export 3 STLs</span>
          </button>
        </div>

        {/* Collapsible Bottom Control Dock (Zero Left/Right Occlusion) */}
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 w-[min(880px,calc(100%-24px))] flex flex-col items-center">
          <button
            type="button"
            onClick={() => setDockCollapsed((c) => !c)}
            className="pointer-events-auto mb-1.5 px-3.5 py-1 bg-[#111724]/95 hover:bg-[#192234] border border-neutral-700/80 rounded-lg text-[11px] font-medium text-neutral-300 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Show Controls</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Hide Controls</span>
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div className="pointer-events-auto w-full bg-[#0f1521]/95 border border-neutral-800 rounded-2xl p-3.5 shadow-2xl space-y-3">
              {/* Dock Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-2.5">
                <div className="flex items-center gap-1 p-1 bg-neutral-950 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setDockTab('view')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      dockTab === 'view'
                        ? 'bg-neutral-800 text-white'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>View &amp; Explode</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDockTab('params')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      dockTab === 'params'
                        ? 'bg-neutral-800 text-white'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>CAD Parameters</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDockTab('export')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      dockTab === 'export'
                        ? 'bg-neutral-800 text-white'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Export STL</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs text-neutral-400">
                  <button
                    type="button"
                    onClick={() => setXrayShell((x) => !x)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      xrayShell
                        ? 'bg-cyan-950 border-cyan-700 text-cyan-200'
                        : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{xrayShell ? 'X-Ray Shell: On' : 'X-Ray Shell'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExplodeTarget(0);
                      handleSelectCameraPreset('desk');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              {/* Tab 1: View & Explode */}
              {dockTab === 'view' && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  <div className="md:col-span-5 flex items-center gap-3">
                    <Layers className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-neutral-300 font-medium">Exploded Assembly</span>
                        <span className="font-mono tabular-nums text-amber-400">
                          {Math.round(explodeTarget * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={explodeTarget}
                        onChange={(e) => setExplodeTarget(parseFloat(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-7 flex flex-wrap items-center justify-end gap-1.5">
                    {(Object.keys(CAMERA_PRESETS) as CameraPresetId[]).map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleSelectCameraPreset(id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          activePreset === id
                            ? 'bg-amber-500 text-neutral-950 font-semibold'
                            : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800 border border-neutral-800'
                        }`}
                      >
                        {CAMERA_PRESETS[id].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab 2: CAD Parameters */}
              {dockTab === 'params' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div>
                    <div className="flex justify-between text-neutral-300 mb-1">
                      <span>Screen Slant</span>
                      <span className="font-mono tabular-nums text-amber-400">{params.slantDeg}°</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={25}
                      step={1}
                      value={params.slantDeg}
                      onChange={(e) =>
                        setParams((p) => ({ ...p, slantDeg: parseInt(e.target.value, 10) }))
                      }
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-300 mb-1">Display Orientation</label>
                    <select
                      value={params.orientation}
                      onChange={(e) =>
                        setParams((p) => ({
                          ...p,
                          orientation: e.target.value as ScreenOrientation
                        }))
                      }
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200 focus:outline-none focus:border-amber-500"
                    >
                      <option value="portrait">Portrait (240×280 · Default)</option>
                      <option value="landscape">Landscape (280×240)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-neutral-300 mb-1">LiPo Battery Cell</label>
                    <select
                      value={params.batteryPreset}
                      onChange={(e) =>
                        setParams((p) => ({
                          ...p,
                          batteryPreset: e.target.value as BatteryPresetId
                        }))
                      }
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200 focus:outline-none focus:border-amber-500"
                    >
                      {Object.values(BATTERY_PRESETS).map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-neutral-300 mb-1">Filament Finish</label>
                    <select
                      value={params.finish}
                      onChange={(e) =>
                        setParams((p) => ({ ...p, finish: e.target.value as ShellFinishId }))
                      }
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200 focus:outline-none focus:border-amber-500"
                    >
                      {Object.values(SHELL_FINISHES).map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Tab 3: STL Export */}
              {dockTab === 'export' && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orientPrintFlat}
                      onChange={(e) => setOrientPrintFlat(e.target.checked)}
                      className="rounded accent-amber-500"
                    />
                    <span>
                      Auto-rotate Top Shell ({180 - params.slantDeg}°) so 15° bezel prints face-down with 0 supports
                    </span>
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleExportPart('top')}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-100 text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-400" />
                      <span>Top Shell STL</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportPart('bottom')}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-100 text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Bottom Tray STL</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportPart('clip')}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-100 text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>LCD Clip STL</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mechanical Specifications, 8h Battery Calculator, and Print Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Mechanical Alignment & Rear I/O */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Box className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-semibold text-white">
              Olimex KiCad Alignment &amp; Rear I/O
            </h3>
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Cutouts and M3 standoffs are derived from the official{' '}
            <span className="font-mono text-neutral-200">ESP32-PoE2_Rev_B.kicad_pcb</span>{' '}
            coordinates (60.0 × 90.0 mm PCB). Because Olimex places RJ45, USB-C, and MicroSD along the same
            board edge, all cables exit cleanly out the rear face.
          </p>

          <dl className="divide-y divide-neutral-800 text-xs font-mono tabular-nums">
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-neutral-400">Outer Envelope</dt>
              <dd className="text-white">{metrics.outerWidth} × {metrics.outerDepth} × {metrics.frontHeight}–{metrics.rearHeight} mm</dd>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-neutral-400">RJ45 PoE Jack (Rear Center)</dt>
              <dd className="text-cyan-300">X = 0.0 mm · 16.8 × 14.4 mm</dd>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-neutral-400">USB-C Port (Rear Right)</dt>
              <dd className="text-cyan-300">X = +{HARDWARE_SPECS.olimex.usbc.xOffset}.0 mm · 10.2 × 4.8 mm</dd>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-neutral-400">MicroSD Slot (Rear Left)</dt>
              <dd className="text-cyan-300">X = {HARDWARE_SPECS.olimex.microSd.xOffset} mm · 13.8 × 3.2 mm</dd>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-neutral-400">M3 Standoff Grid (MH1–MH4)</dt>
              <dd className="text-white">52.0 × 50.0 mm (Ø 3.3 mm)</dd>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-neutral-400">LCD-to-WROVER Clearance</dt>
              <dd className="text-emerald-400">{metrics.minLcdToPcbClearance} mm wire gap</dd>
            </div>
          </dl>

          <div className="p-3 rounded-xl bg-red-950/30 border border-red-900/50 text-xs text-red-200 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>
              <strong>Olimex PoE2 Safety:</strong> The ESP32-PoE2 is non-isolated. Always unplug PoE Ethernet before connecting USB-C to a laptop unless using a USB isolator.
            </span>
          </div>
        </div>

        {/* Card 2: 8-Hour Battery Sizing & Runtime Calculator */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <BatteryCharging className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-semibold text-white">
              8-Hour Battery Pocket &amp; Budget
            </h3>
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed">
            A dedicated <span className="font-mono text-neutral-200">{metrics.batteryBayWidth} × {metrics.batteryBayLength} × {metrics.batteryBayHeight} mm</span>{' '}
            cradle sits beneath the ESP32-PoE2 PCB between the 4× M3 standoffs, isolating thermal load from the PoE regulator and routing straight to <span className="font-mono text-neutral-200">BAT1</span>.
          </p>

          <dl className="divide-y divide-neutral-800 text-xs font-mono tabular-nums">
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-neutral-400">Selected LiPo Cell</dt>
              <dd className="text-white">{batPreset.label}</dd>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-neutral-400">Cell Dimensions</dt>
              <dd className="text-neutral-200">{batPreset.widthMm} × {batPreset.lengthMm} × {batPreset.thicknessMm} mm</dd>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-neutral-400">Avg Draw ({simState.cpuFrequency} MHz + LCD)</dt>
              <dd className="text-amber-300">~{metrics.avgCurrentMa} mA @ 3.7V</dd>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-neutral-400">Estimated Untethered Runtime</dt>
              <dd className="text-emerald-400 font-bold">~{metrics.estimatedRuntimeHours} hours</dd>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-neutral-400">Onboard MCP73831 Recharge</dt>
              <dd className="text-neutral-200">~{metrics.chargeTimeHours} hours @ 500 mA</dd>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-neutral-400">Battery Connector</dt>
              <dd className="text-neutral-200">{batPreset.connector}</dd>
            </div>
          </dl>

          <p className="text-xs text-neutral-400 leading-relaxed">
            {batPreset.notes} Verify JST-PH polarity against the Olimex <span className="font-mono text-neutral-200">BAT1</span> silkscreen (+ / -) before plugging in a third-party pouch cell.
          </p>
        </div>

        {/* Card 3: Print Settings & Hardware BOM */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-semibold text-white">
              FDM Print Guide &amp; Hardware BOM
            </h3>
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed">
            The top shell splits horizontally at the PCB seam (<span className="font-mono text-neutral-200">Y = {metrics.splitHeight} mm</span>) with rear U-notches so all three parts print flat on PEI with zero support scaffolding.
          </p>

          <dl className="divide-y divide-neutral-800 text-xs font-mono tabular-nums">
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-neutral-400">Recommended Filament</dt>
              <dd className="text-white">PETG / ASA (heat safe near PoE)</dd>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-neutral-400">Layer Height &amp; Walls</dt>
              <dd className="text-neutral-200">0.20 mm · 4–6 perimeters</dd>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-neutral-400">Infill &amp; Supports</dt>
              <dd className="text-emerald-400">20% Gyroid · 0% Supports</dd>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-neutral-400">PCB &amp; Case Fasteners</dt>
              <dd className="text-neutral-200">4× M3×6mm + 2× M3×10mm</dd>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-neutral-400">LCD Retainer Screws</dt>
              <dd className="text-neutral-200">2× M2.5×6mm pan head</dd>
            </div>
            <div className="py-2 flex justify-between gap-4">
              <dt className="text-neutral-400">Desk Feet</dt>
              <dd className="text-neutral-200">4× Ø 8 mm silicone bumpons</dd>
            </div>
          </dl>

          <div className="pt-1 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleExportPart('all')}
              className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download Print-Ready STL Set (3 Parts)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
