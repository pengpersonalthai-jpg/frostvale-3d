/**
 * Scattered set-dressing: boulders (with snow caps), snow-buried bushes,
 * and glowing ice crystals ("Starfall Shards") along the Mirrormere shore.
 *
 * Everything here is instanced — three InstancedMeshes total for hundreds
 * of objects.
 */

import * as THREE from 'three';
import { makeNoise2D } from './noise.js';
import { terrainHeight, groundNormal, LAKE, CAMP, TUNNEL } from './terrain.js';

const rng = makeNoise2D(31337);
const rand = (i, salt) => rng(i * 0.937 + salt, salt * 1.71) * 0.5 + 0.5;

export function createScatter() {
  const group = new THREE.Group();
  group.name = 'scatter';

  const dummy = new THREE.Object3D();
  const n = new THREE.Vector3();

  // ---- Boulders + snow caps ------------------------------------------------
  const ROCKS = 340;
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x39404e, roughness: 0.95, flatShading: true,
  });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
  rocks.castShadow = true;

  const capGeo = new THREE.SphereGeometry(0.85, 8, 5);
  capGeo.scale(1, 0.38, 1);
  const capMat = new THREE.MeshStandardMaterial({ color: 0xdde6f4, roughness: 1 });
  const caps = new THREE.InstancedMesh(capGeo, capMat, ROCKS);

  const capLocal = new THREE.Matrix4().makeTranslation(0, 0.62, 0);
  const m = new THREE.Matrix4();

  let placedRocks = 0;
  for (let i = 0; i < 4000 && placedRocks < ROCKS; i++) {
    const x = (rand(i, 3) - 0.5) * 1050;
    const z = (rand(i, 7) - 0.5) * 1050;
    const h = terrainHeight(x, z);
    if (h < 0.8) continue; // not on the ice
    groundNormal(x, z, n);
    if (n.y < 0.45) continue;
    if (Math.hypot(x - CAMP.x, z - CAMP.z) < 14) continue;

    if (Math.hypot(x - TUNNEL.x, z - TUNNEL.z) < 13) continue; // keep the bore clear

    const s = 0.5 + rand(i, 11) * 2.4;
    dummy.position.set(x, h - s * 0.25, z);
    dummy.rotation.set(rand(i, 13) * 0.5, rand(i, 17) * Math.PI * 2, rand(i, 19) * 0.5);
    dummy.scale.set(s, s * (0.55 + rand(i, 23) * 0.5), s);
    dummy.updateMatrix();
    rocks.setMatrixAt(placedRocks, dummy.matrix);
    // Snow cap rides on top of the same transform
    m.multiplyMatrices(dummy.matrix, capLocal);
    caps.setMatrixAt(placedRocks, m);
    placedRocks++;
  }
  rocks.count = caps.count = placedRocks;
  group.add(rocks, caps);

  // ---- Snow-buried bushes ---------------------------------------------------
  const BUSHES = 260;
  const bushGeo = new THREE.IcosahedronGeometry(1, 1);
  bushGeo.scale(1, 0.55, 1);
  const bushMat = new THREE.MeshStandardMaterial({
    color: 0xaebccf, roughness: 1, flatShading: true,
  });
  const bushes = new THREE.InstancedMesh(bushGeo, bushMat, BUSHES);

  let placedBushes = 0;
  for (let i = 0; i < 4000 && placedBushes < BUSHES; i++) {
    const x = (rand(i, 31) - 0.5) * 900;
    const z = (rand(i, 37) - 0.5) * 900;
    const h = terrainHeight(x, z);
    if (h < 1.2) continue;
    groundNormal(x, z, n);
    if (n.y < 0.7) continue;

    const s = 0.5 + rand(i, 41) * 1.1;
    dummy.position.set(x, h + s * 0.15, z);
    dummy.rotation.y = rand(i, 43) * Math.PI * 2;
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    bushes.setMatrixAt(placedBushes, dummy.matrix);
    placedBushes++;
  }
  bushes.count = placedBushes;
  group.add(bushes);

  // ---- Starfall Shards: glowing crystals near the lake shore -----------------
  // Emissive intensity > bloom threshold, so these get a soft cyan halo.
  const SHARDS = 46;
  const shardGeo = new THREE.OctahedronGeometry(0.5, 0);
  shardGeo.scale(0.55, 2.2, 0.55);
  const shardMat = new THREE.MeshStandardMaterial({
    color: 0x0e2233,
    emissive: 0x4fc8ff,
    emissiveIntensity: 1.7,
    roughness: 0.25,
    metalness: 0.1,
  });
  const shards = new THREE.InstancedMesh(shardGeo, shardMat, SHARDS);

  let placedShards = 0;
  // Clusters around the Mirrormere shoreline
  for (let cluster = 0; cluster < 11 && placedShards < SHARDS; cluster++) {
    const ang = (cluster / 11) * Math.PI * 2 + rand(cluster, 51) * 0.6;
    const shoreR = 62 + rand(cluster, 53) * 26;
    const cx = LAKE.x + Math.cos(ang) * shoreR;
    const cz = LAKE.z + Math.sin(ang) * shoreR * 0.9;
    const count = 3 + Math.floor(rand(cluster, 57) * 3);
    for (let k = 0; k < count && placedShards < SHARDS; k++) {
      const x = cx + (rand(cluster * 10 + k, 61) - 0.5) * 4;
      const z = cz + (rand(cluster * 10 + k, 67) - 0.5) * 4;
      const h = terrainHeight(x, z);
      if (h < 0.2) continue;
      const s = 0.5 + rand(cluster * 10 + k, 71) * 1.3;
      dummy.position.set(x, h + s * 0.7, z);
      dummy.rotation.set(
        (rand(k, 73) - 0.5) * 0.7,
        rand(k, 79) * Math.PI,
        (rand(k, 83) - 0.5) * 0.7,
      );
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      shards.setMatrixAt(placedShards, dummy.matrix);
      placedShards++;
    }
  }
  shards.count = placedShards;
  group.add(shards);

  // One cold point light at the largest cluster sells the glow on the snow
  const shardLight = new THREE.PointLight(0x55ccff, 14, 30, 2);
  const lx = LAKE.x + 66;
  const lz = LAKE.z + 6;
  shardLight.position.set(lx, terrainHeight(lx, lz) + 2.2, lz);
  group.add(shardLight);

  /** Called each frame: makes the shards shimmer gently. */
  function update(t) {
    shardMat.emissiveIntensity = 1.55 + Math.sin(t * 1.7) * 0.35;
    shardLight.intensity = 13 + Math.sin(t * 2.3) * 3;
  }

  return { group, update };
}
