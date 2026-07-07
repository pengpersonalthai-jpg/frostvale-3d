/**
 * Hand-placed ruins that anchor the zone:
 *   - Aldwyn's Watch  — a ruined stone watchtower on a hillock, lantern lit
 *   - The Sundered Span — a broken bridge over the frozen river
 *   - Last Ember Camp — the spawn campsite (tents, fire ring, crates)
 *
 * All geometry is procedural primitives; no external assets. Each landmark
 * also registers circle colliders so the player/horse can't walk through
 * walls. Fire/lantern light animation lives in effects/fire.js.
 */

import * as THREE from 'three';
import {
  terrainHeight, groundHeight, TOWER, BRIDGE, CAMP, TUNNEL, BRIDGES,
} from './terrain.js';

// Shared weathered-stone material (flat shading reads as rough-cut masonry)
const stoneMat = new THREE.MeshStandardMaterial({
  color: 0x6b7484, roughness: 0.95, flatShading: true,
});
const darkStoneMat = new THREE.MeshStandardMaterial({
  color: 0x4a5160, roughness: 1, flatShading: true,
});
const woodMat = new THREE.MeshStandardMaterial({
  color: 0x4c3a28, roughness: 0.9, flatShading: true,
});
const canvasMat = new THREE.MeshStandardMaterial({
  color: 0x8a7a60, roughness: 1, side: THREE.DoubleSide,
});

function shadow(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---- Aldwyn's Watch ---------------------------------------------------------

function buildTower(colliders) {
  const g = new THREE.Group();
  const base = terrainHeight(TOWER.x, TOWER.z);
  g.position.set(TOWER.x, base, TOWER.z);

  // Main shaft — slightly tapered, sunk into the hill
  const shaft = shadow(new THREE.Mesh(
    new THREE.CylinderGeometry(4.6, 5.4, 17, 12, 1, false), stoneMat,
  ));
  shaft.position.y = 7.5;
  g.add(shaft);

  // Skirt of rough foundation stone blending into the terrain
  const skirt = shadow(new THREE.Mesh(
    new THREE.CylinderGeometry(6.2, 7.4, 3.2, 12), darkStoneMat,
  ));
  skirt.position.y = 0.6;
  g.add(skirt);

  // Ruined crenellations: a broken ring of merlons, several missing
  for (let i = 0; i < 12; i++) {
    if (i === 2 || i === 3 || i === 7 || i === 8 || i === 9) continue; // collapsed
    const a = (i / 12) * Math.PI * 2;
    const h = 1.2 + ((i * 37) % 10) / 10 * 1.4; // deterministic ragged heights
    const merlon = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.6, h, 1.1), stoneMat));
    merlon.position.set(Math.cos(a) * 4.3, 16 + h / 2, Math.sin(a) * 4.3);
    merlon.rotation.y = -a;
    g.add(merlon);
  }

  // Doorway (dark inset facing the camp, roughly north-west)
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 3.6, 0.8),
    new THREE.MeshBasicMaterial({ color: 0x04060a }),
  );
  const doorAngle = Math.atan2(CAMP.z - TOWER.z, CAMP.x - TOWER.x);
  door.position.set(Math.cos(doorAngle) * 5.0, 1.9, Math.sin(doorAngle) * 5.0);
  door.rotation.y = -doorAngle + Math.PI / 2;
  g.add(door);

  // Warm window slit near the top — someone (or something) keeps a lantern lit
  const winMat = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: 0xffb45e, emissiveIntensity: 2.6,
  });
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.5, 0.3), winMat);
  win.position.set(Math.cos(doorAngle) * 4.75, 13.5, Math.sin(doorAngle) * 4.75);
  win.rotation.y = -doorAngle + Math.PI / 2;
  g.add(win);

  // Rubble around the base
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.4;
    const r = 6.5 + ((i * 53) % 7) * 0.5;
    const s = 0.5 + ((i * 29) % 10) / 10 * 1.1;
    const rock = shadow(new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), darkStoneMat));
    const rx = TOWER.x + Math.cos(a) * r;
    const rz = TOWER.z + Math.sin(a) * r;
    rock.position.set(Math.cos(a) * r, terrainHeight(rx, rz) - base + s * 0.3, Math.sin(a) * r);
    rock.rotation.set(i, i * 2.1, i * 0.7);
    g.add(rock);
  }

  colliders.push({ x: TOWER.x, z: TOWER.z, r: 6.0 });
  return { group: g, lanternPos: new THREE.Vector3(TOWER.x + Math.cos(doorAngle) * 5.5, base + 13.5, TOWER.z + Math.sin(doorAngle) * 5.5) };
}

// ---- The Sundered Span ------------------------------------------------------

function buildBridge(colliders) {
  const g = new THREE.Group();
  const cx = BRIDGE.x;
  const cz = BRIDGE.z;

  // The bridge crosses the river east–west. Two ramps rise from the banks
  // and stop short of each other — the middle span collapsed long ago.
  const westBankX = cx - 16;
  const eastBankX = cx + 16;

  for (const side of [-1, 1]) {
    const bankX = side < 0 ? westBankX : eastBankX;
    const bankY = groundHeight(bankX, cz);
    const deckY = 2.6; // deck height above the ice

    // Abutment on the bank
    const abut = shadow(new THREE.Mesh(new THREE.BoxGeometry(4, 3.4, 6.4), stoneMat));
    abut.position.set(bankX, bankY + 0.8, cz);
    g.add(abut);
    colliders.push({ x: bankX, z: cz, r: 3.4 });

    // Sloped deck reaching toward the middle, ending jagged
    const deckLen = 9;
    const deck = shadow(new THREE.Mesh(new THREE.BoxGeometry(deckLen, 0.9, 4.6), stoneMat));
    const deckX = bankX - side * (2 + deckLen / 2);
    deck.position.set(deckX, bankY + deckY, cz);
    deck.rotation.z = side * 0.09;
    g.add(deck);

    // Support pier dropping to the frozen riverbed
    const pier = shadow(new THREE.Mesh(new THREE.BoxGeometry(2.6, 9, 3.6), darkStoneMat));
    pier.position.set(bankX - side * 6.5, bankY + deckY - 4.6, cz);
    g.add(pier);
    colliders.push({ x: bankX - side * 6.5, z: cz, r: 2.2 });

    // Jagged broken edge: a few tumbled blocks below the gap
    for (let i = 0; i < 4; i++) {
      const s = 0.6 + ((i * 31) % 10) / 10 * 0.9;
      const block = shadow(new THREE.Mesh(new THREE.BoxGeometry(s, s, s), stoneMat));
      block.position.set(
        cx - side * (2 + i * 1.6),
        0.4 + s / 2 + (i % 2) * 0.4,
        cz + ((i * 13) % 5) - 2,
      );
      block.rotation.set(i * 0.8, i * 1.3, i * 0.5);
      g.add(block);
    }
  }

  return g;
}

// ---- Intact crossable bridges -------------------------------------------------
// Meshes for the bridges defined in terrain.js (whose deckAt() already makes
// them walkable). Built as short deck segments following the arch, with low
// parapets and piers down to the ice.

function buildCrossableBridge(b, colliders) {
  const g = new THREE.Group();
  const SEGS = 12;
  const segLen = (b.halfLen * 2) / SEGS;

  for (let i = 0; i < SEGS; i++) {
    const u0 = -1 + (i + 0.5) * (2 / SEGS);
    const x = b.xc + u0 * b.halfLen;
    const y = b.deckAt(x, b.z);
    // Deck slab, tilted to follow the arch slope
    const slope = Math.atan2(
      b.deckAt(Math.min(b.xc + b.halfLen, x + 1), b.z) - b.deckAt(Math.max(b.xc - b.halfLen, x - 1), b.z),
      2,
    );
    const slab = shadow(new THREE.Mesh(
      new THREE.BoxGeometry(segLen + 0.12, 0.55, b.width), stoneMat,
    ));
    slab.position.set(x, y - 0.28, b.z);
    slab.rotation.z = -slope;
    g.add(slab);

    // Low parapets on both sides
    for (const side of [-1, 1]) {
      const parapet = shadow(new THREE.Mesh(
        new THREE.BoxGeometry(segLen + 0.1, 0.5, 0.3), darkStoneMat,
      ));
      parapet.position.set(x, y + 0.22, b.z + side * (b.width / 2 - 0.18));
      parapet.rotation.z = -slope;
      g.add(parapet);
    }
  }

  // Piers dropping to the frozen river
  for (const u of [-0.45, 0.45]) {
    const px = b.xc + u * b.halfLen;
    const top = b.deckAt(px, b.z) - 0.4;
    const pier = shadow(new THREE.Mesh(new THREE.BoxGeometry(2.4, top, 3.2), darkStoneMat));
    pier.position.set(px, top / 2, b.z);
    g.add(pier);
  }

  // End pillars (with colliders so you're funnelled onto the deck)
  for (const ue of [-1, 1]) {
    const ex = b.xc + ue * b.halfLen;
    const ey = b.deckAt(ex, b.z);
    for (const side of [-1, 1]) {
      const pillar = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.8), stoneMat));
      pillar.position.set(ex, ey + 0.6, b.z + side * (b.width / 2 + 0.25));
      g.add(pillar);
      colliders.push({ x: ex, z: b.z + side * (b.width / 2 + 0.25), r: 0.6 });
    }
  }

  return g;
}

// ---- The Hollow Gate ------------------------------------------------------------
// A ruined arched gallery on the trail between the camp and the tower — a
// short "tunnel" you (and your horse) can ride through. Terrain under it is
// flattened by terrain.js; walls get collider rows so you pass through the
// bore, not the masonry.

function buildHollowGate(colliders) {
  const g = new THREE.Group();
  const { x, z, yaw, length, radius, floorY } = TUNNEL;
  g.position.set(x, floorY, z);
  g.rotation.y = yaw;

  // Vault: half-cylinder shell, axis along the local Z (travel direction)
  const vaultGeo = new THREE.CylinderGeometry(radius, radius, length, 14, 1, true, 0, Math.PI);
  vaultGeo.rotateZ(Math.PI / 2);  // axis Y → X, open side down
  vaultGeo.rotateY(Math.PI / 2);  // axis X → Z
  const vault = shadow(new THREE.Mesh(vaultGeo, stoneMat));
  vault.material = stoneMat.clone();
  vault.material.side = THREE.DoubleSide; // visible from inside the bore
  vault.position.y = 1.1;                 // arch springs from the side walls
  g.add(vault);

  // Side walls the vault rests on
  for (const side of [-1, 1]) {
    const wall = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, length), stoneMat));
    wall.position.set(side * (radius - 0.15), 0.65, 0);
    g.add(wall);
  }

  // Entrance arches (broken ring look) + rubble on the roofline
  for (const end of [-1, 1]) {
    const ring = shadow(new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.4, 8, 14, Math.PI), darkStoneMat,
    ));
    ring.position.set(0, 1.1, end * (length / 2));
    g.add(ring);
  }
  for (let i = 0; i < 6; i++) {
    const s = 0.5 + ((i * 37) % 10) / 10 * 0.8;
    const rock = shadow(new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), darkStoneMat));
    rock.position.set(
      ((i * 29) % 10) / 10 * 3 - 1.5,
      radius + 0.9 + ((i * 13) % 4) * 0.15,
      ((i * 53) % 10) / 10 * length - length / 2,
    );
    rock.rotation.set(i, i * 2.1, i * 0.7);
    g.add(rock);
  }

  // Collider rows along both walls (world space)
  const sa = Math.sin(yaw);
  const ca = Math.cos(yaw);
  for (let i = -3; i <= 3; i++) {
    const along = (i / 3) * (length / 2);
    for (const side of [-1, 1]) {
      const wx = x + sa * along + ca * side * (radius - 0.15);
      const wz = z + ca * along - sa * side * (radius - 0.15);
      colliders.push({ x: wx, z: wz, r: 1.0 });
    }
  }

  return g;
}

// ---- Last Ember Camp ---------------------------------------------------------

function buildCamp(colliders) {
  const g = new THREE.Group();
  const base = terrainHeight(CAMP.x, CAMP.z);
  g.position.set(CAMP.x, base, CAMP.z);

  // Fire ring of stones (the fire itself is added by effects/fire.js)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const stone = shadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), darkStoneMat));
    stone.position.set(Math.cos(a) * 1.1, 0.18, Math.sin(a) * 1.1);
    stone.rotation.set(i, i * 1.7, 0);
    g.add(stone);
  }
  // Charred logs
  for (let i = 0; i < 3; i++) {
    const log = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.3, 6), woodMat));
    log.rotation.set(Math.PI / 2 - 0.5, (i / 3) * Math.PI * 2, 0);
    log.position.set(0, 0.3, 0);
    g.add(log);
  }

  // Two weather-beaten tents (cones with a dark entrance)
  const tentSpots = [
    { x: 4.5, z: -3.5, rot: 2.4 },
    { x: -1.5, z: -5.5, rot: 1.1 },
  ];
  for (const t of tentSpots) {
    const tent = shadow(new THREE.Mesh(new THREE.ConeGeometry(2.1, 2.6, 7, 1, true), canvasMat));
    tent.position.set(t.x, 1.25, t.z);
    tent.rotation.y = t.rot;
    g.add(tent);
    const opening = new THREE.Mesh(
      new THREE.CircleGeometry(0.75, 12),
      new THREE.MeshBasicMaterial({ color: 0x05070c, side: THREE.DoubleSide }),
    );
    // Face the opening toward the fire
    const toFire = Math.atan2(-t.z, -t.x);
    opening.position.set(t.x + Math.cos(toFire) * 1.45, 0.8, t.z + Math.sin(toFire) * 1.45);
    opening.rotation.y = -toFire + Math.PI / 2;
    g.add(opening);
    colliders.push({ x: CAMP.x + t.x, z: CAMP.z + t.z, r: 1.9 });
  }

  // Log bench + supply crates
  const bench = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.6, 7), woodMat));
  bench.rotation.z = Math.PI / 2;
  bench.rotation.y = 0.4;
  bench.position.set(-2.4, 0.3, 1.8);
  g.add(bench);

  for (let i = 0; i < 3; i++) {
    const s = 0.7 + (i % 2) * 0.25;
    const crate = shadow(new THREE.Mesh(new THREE.BoxGeometry(s, s, s), woodMat));
    crate.position.set(3.2 + i * 0.9, s / 2, 3.4 - (i % 2) * 0.8);
    crate.rotation.y = i * 0.6;
    g.add(crate);
  }
  colliders.push({ x: CAMP.x + 3.8, z: CAMP.z + 3.2, r: 1.4 });

  return { group: g, firePos: new THREE.Vector3(CAMP.x, base + 0.35, CAMP.z) };
}

// ---- Public API ---------------------------------------------------------------

export function createRuins() {
  const group = new THREE.Group();
  group.name = 'ruins';
  const colliders = []; // [{x, z, r}] — consumed by player/horse movement

  const tower = buildTower(colliders);
  group.add(tower.group);

  group.add(buildBridge(colliders)); // the Sundered Span (broken, scenic)

  // The two intact, crossable bridges + the Hollow Gate gallery
  for (const b of BRIDGES) group.add(buildCrossableBridge(b, colliders));
  group.add(buildHollowGate(colliders));

  const camp = buildCamp(colliders);
  group.add(camp.group);

  return {
    group,
    colliders,
    firePos: camp.firePos,
    lanternPos: tower.lanternPos,
  };
}
