/**
 * Procedural terrain for Frostvale.
 *
 * The valley is defined by an *analytic* height function (terrainHeight)
 * rather than a stored heightmap. The same function both displaces the
 * terrain mesh and answers gameplay queries ("how high is the ground under
 * the horse right now?"), so characters follow the terrain exactly with no
 * raycasting — cheap and perfectly stable.
 *
 * Layout (all landmarks are original / invented):
 *   - A bowl-shaped vale ringed by the jagged "Skyshard Peaks".
 *   - The frozen river "Palefrost Run" meanders north–south.
 *   - It pools into "Mirrormere", a frozen lake west of the spawn.
 *   - "Aldwyn's Watch", a ruined tower, crowns a hillock to the south-east.
 *   - "The Sundered Span", a broken bridge, crosses the river to the south.
 *   - "Last Ember Camp" (spawn) sits in a clearing east of the river.
 */

import * as THREE from 'three';
import { makeNoise2D, fbm, ridged } from './noise.js';

// ---- World constants -------------------------------------------------------

export const WORLD_RADIUS = 545; // soft gameplay boundary (units ~ metres)
export const ICE_LEVEL = 0;      // world Y of the frozen water surface

const TERRAIN_SIZE = 1400;       // mesh extent — larger than playable area so
                                 // the mountain ring reads as a horizon
const TERRAIN_SEGMENTS = 300;    // 301² verts ≈ 90k — fine for one static mesh

// Landmark anchors (used by ruins.js, forest.js, main.js)
export const LAKE = { x: -30, z: -140, name: 'Mirrormere' };
export const CAMP = { x: 70, z: 30, name: 'Last Ember Camp' };
export const TOWER = { x: 170, z: -210, name: "Aldwyn's Watch" };
export const BRIDGE = { x: 0, z: 150, name: 'The Sundered Span' }; // x set below

const baseNoise = makeNoise2D(20260706);
const detailNoise = makeNoise2D(911);

/** Centreline of the frozen river (x as a function of z). */
export function riverCenterX(z) {
  return 55 * Math.sin(z * 0.0042) + 22 * Math.sin(z * 0.011 + 1.7);
}
BRIDGE.x = riverCenterX(BRIDGE.z);

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
const lerp = (a, b, t) => a + (b - a) * t;

// ---- The height function ---------------------------------------------------

export function terrainHeight(x, z) {
  const r = Math.hypot(x, z) / 600;          // 0 at centre → ~1 at mesh edge
  const m = smoothstep(0.5, 0.98, r);        // mountain-ring mask

  // Water masks: damp the rolling hills near the river/lake so the frozen
  // beds are guaranteed to dip below ICE_LEVEL (otherwise a lucky noise
  // crest could poke through the ice sheet).
  const dRiver = Math.abs(x - riverCenterX(z));
  const dLake = Math.hypot(x - LAKE.x, z - LAKE.z);
  const wet = Math.min(1, Math.exp(-((dRiver / 30) ** 2)) + Math.exp(-((dLake / 80) ** 2)));

  // Valley floor: gentle snow drifts that grow rougher toward the peaks
  let h = 6 + fbm(baseNoise, x * 0.008, z * 0.008, 4) * (4.5 + 26 * m) * (1 - 0.72 * wet);

  // Mountain ring with ridged crests
  const ridge = ridged(baseNoise, x * 0.0045 + 40, z * 0.0045 - 17, 5);
  h += m * m * 170 + ridge * ridge * 90 * m;

  // Carve the river and the lake basin (both fade out inside the mountains)
  h -= 8.5 * Math.exp(-((dRiver / 24) ** 2)) * (1 - m);
  h -= 10 * Math.exp(-((dLake / 85) ** 2)) * (1 - m);

  // Hillock + flattened crown for the ruined watchtower
  const dTower = Math.hypot(x - TOWER.x, z - TOWER.z);
  h += 13 * Math.exp(-((dTower / 40) ** 2));
  h = lerp(h, 18.5, Math.exp(-((dTower / 11) ** 2)));

  // Flatten the campsite clearing (the spawn area)
  const dCamp = Math.hypot(x - CAMP.x, z - CAMP.z);
  h = lerp(h, 5.6, Math.exp(-((dCamp / 14) ** 2)));

  // Fine surface detail, suppressed on the smooth river ice banks
  h += detailNoise(x * 0.09, z * 0.09) * 0.5 * (1 - 0.8 * wet);

  return h;
}

/** Walkable ground height: terrain, or the ice sheet where terrain dips under it. */
export function groundHeight(x, z) {
  return Math.max(terrainHeight(x, z), ICE_LEVEL);
}

/** True if (x, z) stands on frozen water rather than snow. */
export function isOnIce(x, z) {
  return terrainHeight(x, z) < ICE_LEVEL;
}

/** Approximate ground normal via central differences (writes into `target`). */
export function groundNormal(x, z, target = new THREE.Vector3()) {
  const e = 1.2;
  const hL = groundHeight(x - e, z);
  const hR = groundHeight(x + e, z);
  const hD = groundHeight(x, z - e);
  const hU = groundHeight(x, z + e);
  return target.set(hL - hR, 2 * e, hD - hU).normalize();
}

// ---- The terrain mesh ------------------------------------------------------

const SNOW = new THREE.Color(0.84, 0.88, 0.97);
const SNOW_SHADE = new THREE.Color(0.70, 0.76, 0.90); // hollows / drift shadows
const ROCK = new THREE.Color(0.26, 0.28, 0.35);

export function createTerrain() {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  // Vertex colours: snow on gentle slopes, exposed rock on steep faces,
  // with a cool blue shade in low hollows. Baking this into vertex colours
  // costs nothing per-frame (vs. a splat-map shader).
  const normal = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const ny = normal.getY(i);
    const h = pos.getY(i);
    const snowAmount = smoothstep(0.55, 0.78, ny);   // steep → rock
    c.copy(ROCK).lerp(SNOW, snowAmount);
    // Slight blue tint near the ice line for a "wind-scoured" look
    const hollow = smoothstep(4, 0.5, h);
    c.lerp(SNOW_SHADE, hollow * snowAmount * 0.6);
    // Subtle large-scale mottling so the snow field isn't flat white
    const mottle = 0.94 + 0.06 * (baseNoise(pos.getX(i) * 0.02, pos.getZ(i) * 0.02) * 0.5 + 0.5);
    colors[i * 3 + 0] = c.r * mottle;
    colors[i * 3 + 1] = c.g * mottle;
    colors[i * 3 + 2] = c.b * mottle;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.0,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
