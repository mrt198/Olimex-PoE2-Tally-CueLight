import * as THREE from 'three';
import {
  BATTERY_PRESETS,
  ComputedEnclosureMetrics,
  EnclosureParams,
  HARDWARE_SPECS
} from './enclosureSpec';

function createRoundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  const rad = Math.min(r, hw - 0.01, hh - 0.01);
  s.moveTo(-hw + rad, -hh);
  s.lineTo(hw - rad, -hh);
  s.absarc(hw - rad, -hh + rad, rad, -Math.PI / 2, 0, false);
  s.lineTo(hw, hh - rad);
  s.absarc(hw - rad, hh - rad, rad, 0, Math.PI / 2, false);
  s.lineTo(-hw + rad, hh);
  s.absarc(-hw + rad, hh - rad, rad, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hh + rad);
  s.absarc(-hw + rad, -hh + rad, rad, Math.PI, (Math.PI * 3) / 2, false);
  return s;
}

function createRoundedRectHolePath(
  w: number,
  h: number,
  r: number,
  cx = 0,
  cy = 0
): THREE.Path {
  const p = new THREE.Path();
  const hw = w / 2;
  const hh = h / 2;
  const rad = Math.min(r, hw - 0.01, hh - 0.01);
  // Clockwise path for clean hole winding
  p.moveTo(cx - hw + rad, cy - hh);
  p.absarc(cx - hw + rad, cy - hh + rad, rad, -Math.PI / 2, -Math.PI, true);
  p.lineTo(cx - hw, cy + hh - rad);
  p.absarc(cx - hw + rad, cy + hh - rad, rad, Math.PI, Math.PI / 2, true);
  p.lineTo(cx + hw - rad, cy + hh);
  p.absarc(cx + hw - rad, cy + hh - rad, rad, Math.PI / 2, 0, true);
  p.lineTo(cx + hw, cy - hh + rad);
  p.absarc(cx + hw - rad, cy - hh + rad, rad, 0, -Math.PI / 2, true);
  p.lineTo(cx - hw + rad, cy - hh);
  return p;
}

function createCircleHolePath(cx: number, cy: number, radius: number): THREE.Path {
  const p = new THREE.Path();
  p.absarc(cx, cy, radius, 0, Math.PI * 2, true);
  return p;
}

/**
 * Generates an extruded cylinder-with-bore (standoff / boss) along +Y from y=0 to height.
 */
function createBossGeometry(outerR: number, innerR: number, height: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
  if (innerR > 0.05) {
    shape.holes.push(createCircleHolePath(0, 0, innerR));
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 24
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/**
 * Builds a watertight, manifold swept perimeter wall with exact outer/inner rounded corners,
 * starting at Rear-Left (X = -W/2 + R, Z = -D/2) going CCW around Front to Rear-Right (X = +W/2 - R, Z = -D/2),
 * or full 360 loop when includeRearFlat is true.
 */
function createSlopedPerimeterWallGeometry(
  outerW: number,
  outerD: number,
  wall: number,
  cornerR: number,
  yBottom: number,
  getTopY: (z: number) => number,
  includeRearFlat: boolean
): THREE.BufferGeometry {
  const hw = outerW / 2;
  const hd = outerD / 2;
  const rOut = Math.min(cornerR, hw - 1, hd - 1);
  const rIn = Math.max(0.6, rOut - wall);
  const segs = 10;

  type Pt = { ox: number; oz: number; ix: number; iz: number };
  const pts: Pt[] = [];

  const pushArc = (
    cx: number,
    cz: number,
    startAng: number,
    endAng: number
  ) => {
    for (let i = 0; i <= segs; i++) {
      const a = startAng + ((endAng - startAng) * i) / segs;
      pts.push({
        ox: cx + rOut * Math.cos(a),
        oz: cz + rOut * Math.sin(a),
        ix: cx + rIn * Math.cos(a),
        iz: cz + rIn * Math.sin(a)
      });
    }
  };

  // Angle convention in (X, Z): 0 = +X, +PI/2 = +Z (front), PI = -X, 3PI/2 = -Z (rear)
  // Rear-Left corner: center (-hw + rOut, -hd + rOut), from 3PI/2 (-Z) CCW to PI (-X) -> angle decreases
  pushArc(-hw + rOut, -hd + rOut, (3 * Math.PI) / 2, Math.PI);
  // Front-Left corner: center (-hw + rOut, +hd - rOut), angle PI -> PI/2 (+Z)
  pushArc(-hw + rOut, hd - rOut, Math.PI, Math.PI / 2);
  // Front-Right corner: center (+hw - rOut, +hd - rOut), angle PI/2 -> 0 (+X)
  pushArc(hw - rOut, hd - rOut, Math.PI / 2, 0);
  // Rear-Right corner: center (+hw - rOut, -hd + rOut), angle 0 -> -PI/2 (-Z)
  pushArc(hw - rOut, -hd + rOut, 0, -Math.PI / 2);

  const n = pts.length;
  const positions: number[] = [];
  const indices: number[] = [];

  // 4 vertices per ring sample: 0: outBot, 1: outTop, 2: inTop, 3: inBot
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const topOutY = getTopY(p.oz);
    const topInY = getTopY(p.iz);
    positions.push(
      p.ox, yBottom, p.oz,
      p.ox, topOutY, p.oz,
      p.ix, topInY, p.iz,
      p.ix, yBottom, p.iz
    );
  }

  const segCount = includeRearFlat ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const a = i * 4;
    const b = ((i + 1) % n) * 4;
    // Outer face (+N_out)
    indices.push(a + 0, b + 0, b + 1, a + 0, b + 1, a + 1);
    // Top face (+Y)
    indices.push(a + 1, b + 1, b + 2, a + 1, b + 2, a + 2);
    // Inner face (-N_out)
    indices.push(a + 2, b + 2, b + 3, a + 2, b + 3, a + 3);
    // Bottom face (-Y)
    indices.push(a + 3, b + 3, b + 0, a + 3, b + 0, a + 0);
  }

  if (!includeRearFlat) {
    // End cap at start (i=0, facing +X into rear flat wall)
    indices.push(0, 1, 2, 0, 2, 3);
    // End cap at end (i=n-1, facing -X into rear flat wall)
    const last = (n - 1) * 4;
    indices.push(last + 0, last + 2, last + 1, last + 0, last + 3, last + 2);
  }

  const rawGeo = new THREE.BufferGeometry();
  rawGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  rawGeo.setIndex(indices);
  const nonIndexed = rawGeo.toNonIndexed();
  rawGeo.dispose();
  nonIndexed.computeVertexNormals();
  return nonIndexed;
}

/**
 * PART 1: Printable Bottom Base Tray (Olimex ESP32-PoE2 + 2000-2500mAh LiPo Bay)
 */
export function buildBottomTrayGroup(
  params: EnclosureParams,
  metrics: ComputedEnclosureMetrics,
  shellMaterial: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Bottom_Tray';

  const { outerWidth: W, outerDepth: D, splitHeight, pcbRearZ, pcbFrontZ, pcbBottomY } = metrics;
  const { floorMm, wallMm } = params;
  const cornerR = 4.0;
  const frontBossZ = pcbFrontZ + 4.3;
  const frontBossX = 25.0;

  // 1. Solid Floor with 2x front M3 countersunk pass-through screw holes
  const floorShape = createRoundedRectShape(W - 0.8, D - 0.8, cornerR - 0.4);
  floorShape.holes.push(createCircleHolePath(-frontBossX, -frontBossZ, 1.75));
  floorShape.holes.push(createCircleHolePath(frontBossX, -frontBossZ, 1.75));
  const floorGeo = new THREE.ExtrudeGeometry(floorShape, {
    depth: floorMm,
    bevelEnabled: true,
    bevelThickness: 0.4,
    bevelSize: 0.4,
    bevelSegments: 2,
    curveSegments: 16
  });
  floorGeo.rotateX(-Math.PI / 2);
  const floorMesh = new THREE.Mesh(floorGeo, shellMaterial);
  floorMesh.position.y = 0.4;
  floorMesh.castShadow = true;
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  // 2. Full 360° Lower Perimeter Wall (Y = floorMm - 0.1 .. splitHeight)
  const wallGeo = createSlopedPerimeterWallGeometry(
    W,
    D,
    wallMm,
    cornerR,
    floorMm - 0.1,
    () => splitHeight,
    true
  );
  const wallMesh = new THREE.Mesh(wallGeo, shellMaterial);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  // 3. Internal alignment step lip seated 0.15mm inside Top_15deg_Shell walls
  const lipGeo = createSlopedPerimeterWallGeometry(
    W - 2 * wallMm - 0.3,
    D - 2 * wallMm - 0.3,
    1.2,
    Math.max(0.8, cornerR - wallMm - 0.15),
    splitHeight - 0.1,
    () => splitHeight + 1.4,
    false
  );
  const lipMesh = new THREE.Mesh(lipGeo, shellMaterial);
  lipMesh.castShadow = true;
  group.add(lipMesh);

  // 4. 4x M3 PCB Standoffs at exact OLIMEX KiCad MH1..MH4 (52.0 x 50.0 mm pitch)
  const mhPositions: [number, number][] = [
    [-HARDWARE_SPECS.olimex.mountHoleX, pcbRearZ + HARDWARE_SPECS.olimex.mountHoleRearOffset],
    [HARDWARE_SPECS.olimex.mountHoleX, pcbRearZ + HARDWARE_SPECS.olimex.mountHoleRearOffset],
    [-HARDWARE_SPECS.olimex.mountHoleX, pcbRearZ + HARDWARE_SPECS.olimex.mountHoleFrontOffset],
    [HARDWARE_SPECS.olimex.mountHoleX, pcbRearZ + HARDWARE_SPECS.olimex.mountHoleFrontOffset]
  ];
  const standoffH = pcbBottomY - floorMm + 0.1;
  const standoffGeo = createBossGeometry(3.6, 1.45, standoffH);
  mhPositions.forEach(([sx, sz]) => {
    const boss = new THREE.Mesh(standoffGeo, shellMaterial);
    boss.position.set(sx, floorMm - 0.1, sz);
    boss.castShadow = true;
    boss.receiveShadow = true;
    group.add(boss);
  });

  // 5. 2x Front Enclosure Screw Guide Bosses (clear in front of PCB antenna)
  const frontBossGeo = createBossGeometry(3.4, 1.75, splitHeight - floorMm + 0.1);
  [-frontBossX, frontBossX].forEach((bx) => {
    const boss = new THREE.Mesh(frontBossGeo, shellMaterial);
    boss.position.set(bx, floorMm - 0.1, frontBossZ);
    boss.castShadow = true;
    group.add(boss);
  });

  // 6. Dedicated Battery Cradle Side Rails + Front/Rear Retention Stops (43.2 x 66.0 mm pocket)
  const railH = 5.5;
  const railGeo = new THREE.BoxGeometry(1.8, railH, 58.0);
  const batCenterZ = pcbRearZ + 43.0;
  [-metrics.batteryBayWidth / 2 - 0.9, metrics.batteryBayWidth / 2 + 0.9].forEach((rx) => {
    const rail = new THREE.Mesh(railGeo, shellMaterial);
    rail.position.set(rx, floorMm + railH / 2 - 0.05, batCenterZ);
    rail.castShadow = true;
    rail.receiveShadow = true;
    group.add(rail);
  });

  const endStopGeo = new THREE.BoxGeometry(28.0, 4.5, 2.0);
  [-33.5, 33.5].forEach((dz) => {
    const stop = new THREE.Mesh(endStopGeo, shellMaterial);
    stop.position.set(0, floorMm + 2.2, batCenterZ + dz);
    group.add(stop);
  });

  return group;
}

/**
 * PART 2: Printable 15-Degree Slanted Top Shell
 * - Rounded R5 LCD window oriented along the 15° slanted desk face
 * - Rear wall with U-cutouts for RJ45 Ethernet/PoE, USB-C, MicroSD, + upper thermal vents
 * - Underside LCD pocket & M2.5 retainer clip bosses
 */
export function buildTopShellGroup(
  params: EnclosureParams,
  metrics: ComputedEnclosureMetrics,
  shellMaterial: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Top_15deg_Shell';

  const {
    outerWidth: W,
    outerDepth: D,
    frontHeight,
    rearHeight,
    splitHeight,
    lcdWindowW,
    lcdWindowH,
    lcdPocketW,
    lcdPocketH,
    lcdCenterZ,
    pcbFrontZ
  } = metrics;
  const { wallMm, slantDeg } = params;
  const slantRad = THREE.MathUtils.degToRad(slantDeg);
  const tanS = Math.tan(slantRad);
  const cosS = Math.cos(slantRad);
  const cornerR = 4.0;

  // Height of outer roof plane at world Z
  const roofYAtZ = (z: number) => frontHeight + (D / 2 - z) * tanS;

  // 1. Slanted Top Faceplate via horizontal rounded rect + scaled hole -> exact Y-shear
  const plateThickness = 2.6;
  const verticalThickness = plateThickness / cosS;
  const faceShape = createRoundedRectShape(W - 0.7, D - 0.7, cornerR - 0.35);
  // Note: shape Y becomes -Z after rotateX(-PI/2), so lcdCenterZ maps to -lcdCenterZ
  const holeZProj = lcdWindowH * cosS;
  faceShape.holes.push(
    createRoundedRectHolePath(
      lcdWindowW,
      holeZProj,
      HARDWARE_SPECS.waveshare169.cornerRadius,
      0,
      -lcdCenterZ
    )
  );

  const faceGeo = new THREE.ExtrudeGeometry(faceShape, {
    depth: verticalThickness - 0.8,
    bevelEnabled: true,
    bevelThickness: 0.4,
    bevelSize: 0.35,
    bevelSegments: 2,
    curveSegments: 18
  });
  faceGeo.rotateX(-Math.PI / 2);

  // Shear vertices along Y so bottom sits on (roofYAtZ(z) - verticalThickness) and top sits on roofYAtZ(z)
  const posAttr = faceGeo.attributes.position;
  const midRoofY = (frontHeight + rearHeight) / 2;
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    posAttr.setY(i, y + midRoofY - verticalThickness + 0.4 - z * tanS);
  }
  posAttr.needsUpdate = true;
  faceGeo.computeVertexNormals();

  const faceMesh = new THREE.Mesh(faceGeo, shellMaterial);
  faceMesh.castShadow = true;
  faceMesh.receiveShadow = true;
  group.add(faceMesh);

  // 2. Underside LCD Pocket Collar & 2x M2.5 Retainer Clip Bosses (oriented flush in Rx(+slantRad))
  const pocketAnchor = new THREE.Group();
  const pocketCenterY = roofYAtZ(lcdCenterZ) - verticalThickness;
  pocketAnchor.position.set(0, pocketCenterY, lcdCenterZ);
  pocketAnchor.rotation.x = slantRad;

  const pocketShape = createRoundedRectShape(lcdPocketW + 5.6, lcdPocketH + 5.6, 3.0);
  pocketShape.holes.push(createRoundedRectHolePath(lcdPocketW, lcdPocketH, 1.8, 0, 0));
  const pocketGeo = new THREE.ExtrudeGeometry(pocketShape, {
    depth: 3.4,
    bevelEnabled: false,
    curveSegments: 12
  });
  pocketGeo.rotateX(Math.PI / 2); // Extends downward in -Y local
  const pocketMesh = new THREE.Mesh(pocketGeo, shellMaterial);
  pocketMesh.position.y = 0.2; // Overlap into underside of faceplate
  pocketAnchor.add(pocketMesh);

  // 2x M2.5 Retainer Clip Bosses flanking the LCD pocket
  const lcdBossGeo = createBossGeometry(3.2, 1.15, 4.4);
  lcdBossGeo.rotateX(Math.PI); // Point downward in -Y local
  const lcdBossX = lcdPocketW / 2 + 4.2;
  [-lcdBossX, lcdBossX].forEach((bx) => {
    const boss = new THREE.Mesh(lcdBossGeo, shellMaterial);
    boss.position.set(bx, 0.2, 0);
    pocketAnchor.add(boss);
  });
  group.add(pocketAnchor);

  // 3. Continuous Rounded Left + Front + Right Skirt Walls (Y = splitHeight .. roofYAtZ(z) - 0.5)
  const skirtGeo = createSlopedPerimeterWallGeometry(
    W,
    D,
    wallMm,
    cornerR,
    splitHeight,
    (z) => roofYAtZ(z) - 0.5,
    false
  );
  const skirtMesh = new THREE.Mesh(skirtGeo, shellMaterial);
  skirtMesh.castShadow = true;
  skirtMesh.receiveShadow = true;
  group.add(skirtMesh);

  // 4. Flat Rear Wall (X: -W/2 + cornerR - 0.2 .. +W/2 - cornerR + 0.2) with U-cutouts & cooling vents
  const rearFlatHalfW = W / 2 - cornerR + 0.2;
  const rTopY = rearHeight - 0.5;
  const rearShape = new THREE.Shape();

  // Trace bottom rim from Left (-rearFlatHalfW) to Right (+rearFlatHalfW) with clean U-notches
  // MicroSD at X=-20.5 (W=13.6, H=3.2), RJ45 at X=0 (W=16.6, H=14.4), USB-C at X=+23.0 (W=10.2, H=4.8)
  const sdX = HARDWARE_SPECS.olimex.microSd.xOffset;
  const sdHW = (HARDWARE_SPECS.olimex.microSd.width + 0.8) / 2;
  const sdTop = splitHeight + 3.2;

  const rjX = HARDWARE_SPECS.olimex.rj45.xOffset;
  const rjHW = (HARDWARE_SPECS.olimex.rj45.width + 0.8) / 2;
  const rjTop = splitHeight + 14.4;

  const usbX = HARDWARE_SPECS.olimex.usbc.xOffset;
  const usbHW = (HARDWARE_SPECS.olimex.usbc.width + 1.2) / 2;
  const usbTop = splitHeight + 4.8;

  rearShape.moveTo(-rearFlatHalfW, splitHeight);
  // MicroSD U-notch
  rearShape.lineTo(sdX - sdHW, splitHeight);
  rearShape.lineTo(sdX - sdHW, sdTop);
  rearShape.lineTo(sdX + sdHW, sdTop);
  rearShape.lineTo(sdX + sdHW, splitHeight);
  // RJ45 U-notch
  rearShape.lineTo(rjX - rjHW, splitHeight);
  rearShape.lineTo(rjX - rjHW, rjTop);
  rearShape.lineTo(rjX + rjHW, rjTop);
  rearShape.lineTo(rjX + rjHW, splitHeight);
  // USB-C U-notch
  rearShape.lineTo(usbX - usbHW, splitHeight);
  rearShape.lineTo(usbX - usbHW, usbTop);
  rearShape.lineTo(usbX + usbHW, usbTop);
  rearShape.lineTo(usbX + usbHW, splitHeight);
  // Right edge & top
  rearShape.lineTo(rearFlatHalfW, splitHeight);
  rearShape.lineTo(rearFlatHalfW, rTopY);
  rearShape.lineTo(-rearFlatHalfW, rTopY);
  rearShape.lineTo(-rearFlatHalfW, splitHeight);

  // Upper rear thermal ventilation slots (above PoE transformer & RJ45)
  const ventY1 = Math.min(rTopY - 4.5, rjTop + 9.0);
  const ventY2 = Math.min(rTopY - 8.5, rjTop + 5.0);
  if (ventY2 > rjTop + 2.5) {
    rearShape.holes.push(createRoundedRectHolePath(18.0, 2.2, 1.0, -13.0, ventY1));
    rearShape.holes.push(createRoundedRectHolePath(18.0, 2.2, 1.0, 13.0, ventY1));
    rearShape.holes.push(createRoundedRectHolePath(18.0, 2.2, 1.0, -13.0, ventY2));
    rearShape.holes.push(createRoundedRectHolePath(18.0, 2.2, 1.0, 13.0, ventY2));
  }

  const rearGeo = new THREE.ExtrudeGeometry(rearShape, {
    depth: wallMm,
    bevelEnabled: false,
    curveSegments: 8
  });
  const rearMesh = new THREE.Mesh(rearGeo, shellMaterial);
  rearMesh.position.z = -D / 2;
  rearMesh.castShadow = true;
  rearMesh.receiveShadow = true;
  group.add(rearMesh);

  // 5. 2x Front Locking M3 Screw Bosses descending from slanted roof underside to splitHeight
  const frontBossZ = pcbFrontZ + 4.3;
  const frontBossX = 25.0;
  const frontBossTopY = roofYAtZ(frontBossZ) - 1.2;
  const frontBossH = Math.max(4.0, frontBossTopY - splitHeight);
  const topBossGeo = createBossGeometry(3.4, 1.35, frontBossH);
  [-frontBossX, frontBossX].forEach((bx) => {
    const boss = new THREE.Mesh(topBossGeo, shellMaterial);
    boss.position.set(bx, splitHeight, frontBossZ);
    group.add(boss);
  });

  // 6. 2x Rear Alignment Snap Hooks engaging behind Bottom_Tray rear edge
  const hookGeo = new THREE.BoxGeometry(6.0, 3.0, 1.6);
  [-13.5, 13.5].forEach((hx) => {
    const hook = new THREE.Mesh(hookGeo, shellMaterial);
    hook.position.set(hx, splitHeight - 0.8, -D / 2 + wallMm + 0.9);
    group.add(hook);
  });

  return group;
}

/**
 * PART 3: Printable Internal LCD Retainer Clamp Bracket
 */
export function buildLcdRetainerClipGroup(
  params: EnclosureParams,
  metrics: ComputedEnclosureMetrics,
  clipMaterial: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'LCD_Retainer_Clip';

  const { lcdPocketW, lcdPocketH, lcdCenterZ, frontHeight, outerDepth } = metrics;
  const slantRad = THREE.MathUtils.degToRad(params.slantDeg);
  const tanS = Math.tan(slantRad);
  const cosS = Math.cos(slantRad);
  const roofY = frontHeight + (outerDepth / 2 - lcdCenterZ) * tanS;
  const clipY = roofY - 2.6 / cosS - 3.6;

  group.position.set(0, clipY, lcdCenterZ);
  group.rotation.x = slantRad;

  const bossX = lcdPocketW / 2 + 4.2;
  const outerW = bossX * 2 + 8.0;
  const outerH = lcdPocketH + 3.0;

  const shape = createRoundedRectShape(outerW, outerH, 3.0);
  // Central cutout for Waveshare GH1.25 connector & FPC ribbon
  shape.holes.push(createRoundedRectHolePath(lcdPocketW - 6.0, lcdPocketH - 8.0, 2.0, 0, 0));
  // 2x M2.5 mounting holes matching the top shell bosses
  shape.holes.push(createCircleHolePath(-bossX, 0, 1.45));
  shape.holes.push(createCircleHolePath(bossX, 0, 1.45));

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 2.2,
    bevelEnabled: false,
    curveSegments: 12
  });
  geo.rotateX(-Math.PI / 2);

  const mesh = new THREE.Mesh(geo, clipMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  return group;
}

/**
 * HARDWARE MODEL A: Olimex ESP32-PoE2 Board (60x90mm, RJ45, USB-C, MicroSD, WROVER, PoE)
 */
export function buildOlimexBoardGroup(metrics: ComputedEnclosureMetrics): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Olimex_ESP32_PoE2';
  const { pcbBottomY, pcbRearZ } = metrics;
  const pcbCenterZ = pcbRearZ + HARDWARE_SPECS.olimex.length / 2;

  group.position.set(0, pcbBottomY, pcbCenterZ);

  const pcbMat = new THREE.MeshStandardMaterial({ color: 0x0b5d3b, roughness: 0.42, metalness: 0.1 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.25, metalness: 0.9 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xc2c7ce, roughness: 0.28, metalness: 0.88 });
  const darkPlasticMat = new THREE.MeshStandardMaterial({ color: 0x181a1f, roughness: 0.65, metalness: 0.05 });
  const jstMat = new THREE.MeshStandardMaterial({ color: 0xe9ecf0, roughness: 0.5, metalness: 0.02 });
  const coilMat = new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.5, metalness: 0.25 });

  // Main PCB with antenna notch at front (+Z = +45) and 4x M3 holes
  const pcbShape = createRoundedRectShape(60.0, 90.0, 2.0);
  const mhRearLocalY = -(90.0 / 2 - HARDWARE_SPECS.olimex.mountHoleRearOffset); // Note: rotateX(-PI/2) flips Y -> -Z
  const mhFrontLocalY = -(90.0 / 2 - HARDWARE_SPECS.olimex.mountHoleFrontOffset);
  // Actually simpler: after rotateX(-PI/2), shape +Y becomes -Z (REAR)
  const rearY = 45.0 - HARDWARE_SPECS.olimex.mountHoleRearOffset; // +16 -> Z=-16 rel to center
  const frontY = 45.0 - HARDWARE_SPECS.olimex.mountHoleFrontOffset; // -34 -> Z=+34 rel to center
  [
    [-26, rearY],
    [26, rearY],
    [-26, frontY],
    [26, frontY]
  ].forEach(([hx, hy]) => pcbShape.holes.push(createCircleHolePath(hx, hy, 1.65)));

  const pcbGeo = new THREE.ExtrudeGeometry(pcbShape, {
    depth: HARDWARE_SPECS.olimex.pcbThickness,
    bevelEnabled: false,
    curveSegments: 10
  });
  pcbGeo.rotateX(-Math.PI / 2);
  const pcbMesh = new THREE.Mesh(pcbGeo, pcbMat);
  pcbMesh.castShadow = true;
  pcbMesh.receiveShadow = true;
  group.add(pcbMesh);

  // ENIG Gold mounting rings
  const ringGeo = createBossGeometry(3.0, 1.65, 0.08);
  [
    [-26, -rearY],
    [26, -rearY],
    [-26, -frontY],
    [26, -frontY]
  ].forEach(([hx, hz]) => {
    const r = new THREE.Mesh(ringGeo, goldMat);
    r.position.set(hx, HARDWARE_SPECS.olimex.pcbThickness, hz);
    group.add(r);
  });

  const pcbTop = HARDWARE_SPECS.olimex.pcbThickness;

  // RJ45 MagJack (X=0, Z=-45 rear edge)
  const rj45Mesh = new THREE.Mesh(new THREE.BoxGeometry(16.0, 13.6, 21.0), steelMat);
  rj45Mesh.position.set(0, pcbTop + 13.6 / 2, -45.0 + 21.0 / 2 - 1.2);
  rj45Mesh.castShadow = true;
  group.add(rj45Mesh);
  const rj45Mouth = new THREE.Mesh(new THREE.BoxGeometry(12.4, 9.8, 1.0), darkPlasticMat);
  rj45Mouth.position.set(0, pcbTop + 6.5, -45.0 - 1.3);
  group.add(rj45Mouth);

  // USB-C Port (X=+23.0, rear edge)
  const usbcMesh = new THREE.Mesh(new THREE.BoxGeometry(9.0, 3.3, 7.4), steelMat);
  usbcMesh.position.set(23.0, pcbTop + 3.3 / 2, -45.0 + 7.4 / 2 - 0.8);
  group.add(usbcMesh);

  // MicroSD Cage (X=-20.5, rear edge)
  const sdMesh = new THREE.Mesh(new THREE.BoxGeometry(13.0, 2.0, 14.0), steelMat);
  sdMesh.position.set(-20.5, pcbTop + 1.0, -45.0 + 7.0);
  group.add(sdMesh);

  // ESP32-WROVER-E Module (Front edge Z=+45, X=0)
  const wroverPcb = new THREE.Mesh(new THREE.BoxGeometry(18.0, 0.9, 31.4), darkPlasticMat);
  wroverPcb.position.set(0, pcbTop + 0.45, 45.0 - 15.7);
  group.add(wroverPcb);
  const wroverCan = new THREE.Mesh(new THREE.BoxGeometry(16.6, 2.4, 21.0), steelMat);
  wroverCan.position.set(0, pcbTop + 0.9 + 1.2, 45.0 - 19.5);
  wroverCan.castShadow = true;
  group.add(wroverCan);

  // PoE Buck Transformer & Inductors
  const poeXfmr = new THREE.Mesh(new THREE.BoxGeometry(15.0, 10.5, 15.0), coilMat);
  poeXfmr.position.set(-14.0, pcbTop + 5.25, -18.0);
  poeXfmr.castShadow = true;
  group.add(poeXfmr);

  // UEXT 10-pin & EXT 26-pin Headers
  const uext = new THREE.Mesh(new THREE.BoxGeometry(8.5, 8.2, 20.0), darkPlasticMat);
  uext.position.set(24.0, pcbTop + 4.1, 11.0);
  group.add(uext);
  const ext = new THREE.Mesh(new THREE.BoxGeometry(8.5, 8.2, 34.0), darkPlasticMat);
  ext.position.set(-24.0, pcbTop + 4.1, 9.0);
  group.add(ext);

  // BAT1 JST-PH 2.0mm White Connector (X=+24.5, frontOffset=19 -> Z=+26)
  const batJst = new THREE.Mesh(new THREE.BoxGeometry(7.5, 5.5, 6.0), jstMat);
  batJst.position.set(24.5, pcbTop + 2.75, 45.0 - 19.0);
  group.add(batJst);

  return group;
}

/**
 * HARDWARE MODEL B: 3.7V LiPo Battery Pack (2000-2500mAh) + Wire Lead in Lower Cradle
 */
export function buildBatteryPackGroup(
  params: EnclosureParams,
  metrics: ComputedEnclosureMetrics
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'LiPo_Battery_Pack';
  const preset = BATTERY_PRESETS[params.batteryPreset];
  const batCenterZ = metrics.pcbRearZ + 43.0;
  const baseY = params.floorMm + 0.4;

  group.position.set(0, baseY, batCenterZ);

  // Dynamic battery label texture
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#c4cbd4';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('Li-Polymer 3.7V', 48, 170);
    ctx.font = 'bold 48px monospace';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(`${preset.capacityMah} mAh`, 48, 240);
    ctx.font = '24px monospace';
    ctx.fillStyle = '#334155';
    ctx.fillText(`${(preset.capacityMah * 0.0037).toFixed(2)} Wh · ${preset.id.split('_')[0]}`, 48, 295);
    ctx.fillText(`Est. Runtime: ~${metrics.estimatedRuntimeHours} hrs`, 48, 340);
    ctx.fillStyle = '#b45309';
    ctx.fillRect(48, 385, 416, 10);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const pouchMat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.32,
    metalness: 0.65
  });
  const kaptonMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.35,
    metalness: 0.2
  });

  const cellGeo = new THREE.BoxGeometry(preset.widthMm, preset.thicknessMm, preset.lengthMm);
  const cellMesh = new THREE.Mesh(cellGeo, pouchMat);
  cellMesh.position.y = preset.thicknessMm / 2;
  cellMesh.castShadow = true;
  group.add(cellMesh);

  // Amber Kapton protection PCB strip at front end (+Z)
  const kapton = new THREE.Mesh(
    new THREE.BoxGeometry(preset.widthMm - 2.0, preset.thicknessMm + 0.3, 6.0),
    kaptonMat
  );
  kapton.position.set(0, preset.thicknessMm / 2, preset.lengthMm / 2 - 2.0);
  group.add(kapton);

  // Red & Black LiPo leads routing toward BAT1
  const redCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(6, preset.thicknessMm * 0.6, preset.lengthMm / 2),
    new THREE.Vector3(18, preset.thicknessMm * 0.7, preset.lengthMm / 2 + 2),
    new THREE.Vector3(24, metrics.pcbTopY - baseY + 3, 22)
  ]);
  const blackCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(3, preset.thicknessMm * 0.6, preset.lengthMm / 2),
    new THREE.Vector3(16, preset.thicknessMm * 0.7, preset.lengthMm / 2 + 3),
    new THREE.Vector3(23, metrics.pcbTopY - baseY + 3, 20)
  ]);
  group.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(redCurve, 18, 0.75, 8, false),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 })
    )
  );
  group.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(blackCurve, 18, 0.75, 8, false),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5 })
    )
  );

  return group;
}

/**
 * HARDWARE MODEL C: Waveshare 1.69" Touch LCD (33.13 x 41.13 mm) seated at 15 degrees
 */
export function buildWaveshareLcdGroup(
  params: EnclosureParams,
  metrics: ComputedEnclosureMetrics,
  screenTexture: THREE.Texture
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Waveshare_169_Touch_LCD';

  const slantRad = THREE.MathUtils.degToRad(params.slantDeg);
  const tanS = Math.tan(slantRad);
  const cosS = Math.cos(slantRad);
  const roofY = metrics.frontHeight + (metrics.outerDepth / 2 - metrics.lcdCenterZ) * tanS;
  // Seat glass face flush just inside the faceplate window
  const glassTopY = roofY - 1.1 / cosS;

  group.position.set(0, glassTopY, metrics.lcdCenterZ);
  group.rotation.x = slantRad;

  const isPortrait = params.orientation === 'portrait';
  const modW = isPortrait ? HARDWARE_SPECS.waveshare169.moduleWidth : HARDWARE_SPECS.waveshare169.moduleHeight;
  const modH = isPortrait ? HARDWARE_SPECS.waveshare169.moduleHeight : HARDWARE_SPECS.waveshare169.moduleWidth;
  const actW = isPortrait ? HARDWARE_SPECS.waveshare169.activeWidth : HARDWARE_SPECS.waveshare169.activeHeight;
  const actH = isPortrait ? HARDWARE_SPECS.waveshare169.activeHeight : HARDWARE_SPECS.waveshare169.activeWidth;

  // Blue Waveshare Carrier PCB
  const pcbMat = new THREE.MeshStandardMaterial({ color: 0x0f4c81, roughness: 0.45, metalness: 0.1 });
  const pcbGeo = new THREE.BoxGeometry(modW, 1.6, modH);
  const pcbMesh = new THREE.Mesh(pcbGeo, pcbMat);
  pcbMesh.position.y = -2.2;
  group.add(pcbMesh);

  // Dark Bezel Glass Frame (rounded R5)
  const glassShape = createRoundedRectShape(modW - 1.2, modH - 2.4, 5.0);
  const glassGeo = new THREE.ExtrudeGeometry(glassShape, {
    depth: 1.4,
    bevelEnabled: false,
    curveSegments: 16
  });
  glassGeo.rotateX(-Math.PI / 2);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a0d12,
    roughness: 0.08,
    metalness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05
  });
  const glassMesh = new THREE.Mesh(glassGeo, glassMat);
  glassMesh.position.y = -1.4;
  group.add(glassMesh);

  // Active IPS Panel Texture Plane (slightly raised above glass top to prevent Z-fighting)
  const activeShape = createRoundedRectShape(actW, actH, 4.5);
  const activeGeo = new THREE.ShapeGeometry(activeShape, 16);
  // Remap UVs to [0..1] for crisp screen texture
  const uv = activeGeo.attributes.uv;
  const pos = activeGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + actW / 2) / actW, (pos.getY(i) + actH / 2) / actH);
  }
  uv.needsUpdate = true;
  activeGeo.rotateX(-Math.PI / 2);

  const screenMat = new THREE.MeshBasicMaterial({
    map: screenTexture,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const screenMesh = new THREE.Mesh(activeGeo, screenMat);
  screenMesh.position.y = 0.06;
  group.add(screenMesh);

  // Rear GH1.25 8-pin Connector
  const connMesh = new THREE.Mesh(
    new THREE.BoxGeometry(11.0, 3.0, 4.5),
    new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.5 })
  );
  connMesh.position.set(0, -4.2, modH / 2 - 4.0);
  group.add(connMesh);

  return group;
}

/**
 * HARDWARE MODEL D: M3 & M2.5 Stainless Steel Fasteners
 */
export function buildFastenersGroup(
  params: EnclosureParams,
  metrics: ComputedEnclosureMetrics
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'M3_M25_Fasteners';

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xd1d5db,
    roughness: 0.25,
    metalness: 0.92
  });

  // 4x PCB M3 Screws on top of PCB standoffs
  const m3HeadGeo = new THREE.CylinderGeometry(2.6, 2.6, 1.8, 16);
  [
    [-HARDWARE_SPECS.olimex.mountHoleX, metrics.pcbRearZ + HARDWARE_SPECS.olimex.mountHoleRearOffset],
    [HARDWARE_SPECS.olimex.mountHoleX, metrics.pcbRearZ + HARDWARE_SPECS.olimex.mountHoleRearOffset],
    [-HARDWARE_SPECS.olimex.mountHoleX, metrics.pcbRearZ + HARDWARE_SPECS.olimex.mountHoleFrontOffset],
    [HARDWARE_SPECS.olimex.mountHoleX, metrics.pcbRearZ + HARDWARE_SPECS.olimex.mountHoleFrontOffset]
  ].forEach(([sx, sz]) => {
    const screw = new THREE.Mesh(m3HeadGeo, steelMat);
    screw.position.set(sx, metrics.pcbTopY + 0.9, sz);
    group.add(screw);
  });

  // 2x Bottom-entry M3 Enclosure Case Screws
  const caseScrewGeo = new THREE.CylinderGeometry(2.7, 1.8, 1.4, 16);
  const frontBossZ = metrics.pcbFrontZ + 4.3;
  [-25.0, 25.0].forEach((bx) => {
    const screw = new THREE.Mesh(caseScrewGeo, steelMat);
    screw.position.set(bx, 0.2, frontBossZ);
    group.add(screw);
  });

  return group;
}
