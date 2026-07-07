/**
 * The Palewood — a dense instanced pine forest.
 *
 * Performance notes:
 *  - Every tree (trunk + foliage tiers + snow caps) is merged into ONE
 *    geometry with vertex colours, drawn as a single THREE.InstancedMesh.
 *    ~2400 trees therefore cost exactly one draw call.
 *  - Wind sway is done on the GPU by patching the standard material's vertex
 *    shader (onBeforeCompile), so the CPU never touches tree transforms
 *    after placement.
 *  - Tree positions are also written into a coarse spatial hash grid used
 *    for cheap circle collision (player/horse can't walk through trunks).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise2D, fbm } from './noise.js';
import {
  terrainHeight, groundNormal, riverCenterX, CAMP, TOWER, BRIDGE, LAKE,
  TUNNEL, BRIDGES,
} from './terrain.js';

const TREE_COUNT = 2400;
const CELL = 10; // collision grid cell size

// Shared time uniform, ticked from the main loop
export const forestUniforms = { uTime: { value: 0 } };

function paintColor(geo, color) {
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** One merged pine: trunk, 4 foliage tiers, snow on each tier. */
function buildPineGeometry() {
  const parts = [];
  const trunkColor = new THREE.Color(0x372a20);
  const needleColor = new THREE.Color(0x14231c); // deep blue-green spruce
  const snowColor = new THREE.Color(0xdbe4f2);

  const trunk = new THREE.CylinderGeometry(0.14, 0.32, 2.6, 6);
  trunk.translate(0, 1.3, 0);
  parts.push(paintColor(trunk, trunkColor));

  // Stacked cones, each with a thin snow cone resting on its upper third
  const tiers = [
    { r: 2.5, h: 2.9, y: 1.5 },
    { r: 2.0, h: 2.6, y: 3.3 },
    { r: 1.5, h: 2.3, y: 5.0 },
    { r: 0.95, h: 2.0, y: 6.6 },
  ];
  for (const t of tiers) {
    const cone = new THREE.ConeGeometry(t.r, t.h, 7);
    cone.translate(0, t.y + t.h / 2, 0);
    parts.push(paintColor(cone, needleColor));

    const snow = new THREE.ConeGeometry(t.r * 0.72, t.h * 0.45, 7);
    snow.translate(0, t.y + t.h * 0.72, 0);
    parts.push(paintColor(snow, snowColor));
  }

  return mergeGeometries(parts);
}

/** Injects GPU wind sway into a standard material (works with instancing). */
export function addWindSway(material, strength = 1.0) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = forestUniforms.uTime;
    shader.vertexShader =
      'uniform float uTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        {
          // Per-instance phase from the instance's world offset so the
          // forest doesn't sway in lockstep.
          float phase = 0.0;
          #ifdef USE_INSTANCING
            phase = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
          #endif
          // Only the upper canopy moves; trunks stay planted.
          float bend = smoothstep(1.5, 8.5, position.y) * ${strength.toFixed(2)};
          float sway = sin(uTime * 1.15 + phase) * 0.5 + sin(uTime * 2.3 + phase * 1.7) * 0.25;
          transformed.x += sway * 0.14 * bend;
          transformed.z += cos(uTime * 0.9 + phase) * 0.09 * bend;
        }
        `,
      );
  };
}

/** Spatial hash of tree trunks for collision: Map<"cx,cz", [{x,z,r}]>. */
export class TreeGrid {
  constructor() { this.map = new Map(); }
  add(x, z, r) {
    const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    if (!this.map.has(key)) this.map.set(key, []);
    this.map.get(key).push({ x, z, r });
  }
  /** Iterate trunks near (x, z) — the 3×3 neighbourhood of cells. */
  nearby(x, z, cb) {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const cell = this.map.get(`${cx + i},${cz + j}`);
        if (cell) for (const t of cell) cb(t);
      }
    }
  }
}

export function createForest() {
  const geo = buildPineGeometry();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    flatShading: true,
  });
  addWindSway(mat, 1.0);

  const mesh = new THREE.InstancedMesh(geo, mat, TREE_COUNT);
  mesh.castShadow = true;
  mesh.name = 'palewood';

  const grid = new TreeGrid();
  const densityNoise = makeNoise2D(4242);
  const rng = makeNoise2D(777); // reused as a cheap deterministic RNG
  const dummy = new THREE.Object3D();
  const n = new THREE.Vector3();

  let placed = 0;
  let attempt = 0;
  while (placed < TREE_COUNT && attempt < 60000) {
    attempt++;
    // Deterministic pseudo-random candidate position
    const a = rng(attempt * 0.731, 1.3) * Math.PI * 4;
    const rad = (rng(attempt * 0.417, 9.1) * 0.5 + 0.5) * 520;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;

    const h = terrainHeight(x, z);
    if (h < 1.4) continue;                       // no trees on ice or banks
    if (Math.hypot(x, z) > 520) continue;
    groundNormal(x, z, n);
    if (n.y < 0.62) continue;                    // too steep (rock faces)
    // Forest grows in noise-driven clumps with open meadows between
    if (fbm(densityNoise, x * 0.004, z * 0.004, 3) < -0.28) continue;
    // Keep landmark clearings open
    if (Math.hypot(x - CAMP.x, z - CAMP.z) < 24) continue;
    if (Math.hypot(x - TOWER.x, z - TOWER.z) < 20) continue;
    if (Math.hypot(x - BRIDGE.x, z - BRIDGE.z) < 16) continue;
    if (Math.abs(x - riverCenterX(z)) < 18) continue;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < 68) continue;
    if (Math.hypot(x - TUNNEL.x, z - TUNNEL.z) < 16) continue;
    let onBridge = false;
    for (const b of BRIDGES) {
      if (Math.abs(z - b.z) < 8 && Math.abs(x - b.xc) < b.halfLen + 5) onBridge = true;
    }
    if (onBridge) continue;

    const s = 0.7 + (rng(attempt * 1.19, 4.7) * 0.5 + 0.5) * 0.75;
    dummy.position.set(x, h - 0.15, z); // sink slightly into snow
    dummy.rotation.y = rng(attempt * 2.03, 2.2) * Math.PI;
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    grid.add(x, z, 0.5 * s);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;

  return { mesh, grid };
}
