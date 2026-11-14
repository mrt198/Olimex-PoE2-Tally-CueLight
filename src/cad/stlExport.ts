import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

const exporter = new STLExporter();

/**
 * Exports a Three.js Object3D (Group or Mesh) to a binary .STL file download.
 * Units in scene are millimeters (1 Three.js unit = 1 mm), which matches Cura / PrusaSlicer / Bambu Studio.
 */
export function downloadObjectAsSTL(
  object: THREE.Object3D,
  filename: string,
  options?: { rotateXDeg?: number; flattenOnGround?: boolean }
): void {
  const exportGroup = object.clone(true);
  exportGroup.position.set(0, 0, 0);
  exportGroup.rotation.set(0, 0, 0);
  exportGroup.scale.set(1, 1, 1);

  if (options?.rotateXDeg) {
    exportGroup.rotation.x = THREE.MathUtils.degToRad(options.rotateXDeg);
  }
  exportGroup.updateMatrixWorld(true);

  if (options?.flattenOnGround !== false) {
    const box = new THREE.Box3().setFromObject(exportGroup);
    if (isFinite(box.min.y)) {
      exportGroup.position.y -= box.min.y;
      exportGroup.updateMatrixWorld(true);
    }
  }

  // Convert Three.js Y-up to standard 3D-printing Z-up (+90 deg around X)
  // so imported STLs sit flat on the slicer build plate immediately.
  const zUpWrapper = new THREE.Group();
  exportGroup.rotation.x += Math.PI / 2;
  exportGroup.updateMatrixWorld(true);
  zUpWrapper.add(exportGroup);
  zUpWrapper.updateMatrixWorld(true);

  const result = exporter.parse(zUpWrapper, { binary: true });
  const buffer = result instanceof DataView
    ? result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength)
    : result;

  const blob = new Blob([buffer as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.stl') ? filename : `${filename}.stl`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
