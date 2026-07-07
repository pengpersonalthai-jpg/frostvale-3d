/**
 * Procedural horse: built entirely from primitives (capsule barrel, jointed
 * cylinder legs, boxy head) and animated procedurally.
 *
 * Design trade-off (documented in the README): instead of a rigged GLTF
 * with skeletal clips, each joint is a THREE.Group pivot driven by phase-
 * offset sine waves. A trot uses diagonal leg pairs; the gallop regroups
 * the legs front/back, adds body bounce + rock, and extends the neck.
 * It reads convincingly at gameplay camera distance and keeps the project
 * 100% asset-free.
 *
 * The horse faces its local +Z axis.
 */

import * as THREE from 'three';
import { createCharacter, applySeatedPose } from '../controls/character.js';

export const HORSE_PALETTES = {
  boreal: { coat: 0x9aa3b2, mane: 0x565d6b, name: 'Boreal' },   // frost grey
  ember: { coat: 0x5b3b24, mane: 0x241812, name: 'Ember' },     // bay
  vesper: { coat: 0x2b2624, mane: 0x131110, name: 'Vesper' },   // black
};

/** Jointed quadruped leg — also reused by the deer in world/animals.js. */
export function limb(mat, pivotPos, upperLen, lowerLen, thickness = 1) {
  const pivot = new THREE.Group();
  pivot.position.copy(pivotPos);

  const upper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09 * thickness, 0.07 * thickness, upperLen, 6), mat,
  );
  upper.position.y = -upperLen / 2;
  upper.castShadow = true;
  pivot.add(upper);

  const knee = new THREE.Group();
  knee.position.y = -upperLen;
  pivot.add(knee);

  const lower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06 * thickness, 0.05 * thickness, lowerLen, 6), mat,
  );
  lower.position.y = -lowerLen / 2;
  lower.castShadow = true;
  knee.add(lower);

  const hoof = new THREE.Mesh(
    new THREE.BoxGeometry(0.13 * thickness, 0.1, 0.16 * thickness),
    new THREE.MeshStandardMaterial({ color: 0x171412, roughness: 0.7 }),
  );
  hoof.position.y = -lowerLen - 0.04;
  knee.add(hoof);

  return { pivot, knee };
}

export function createHorse(paletteKey = 'boreal') {
  const palette = HORSE_PALETTES[paletteKey];
  const coatMat = new THREE.MeshStandardMaterial({ color: palette.coat, roughness: 0.85 });
  const maneMat = new THREE.MeshStandardMaterial({ color: palette.mane, roughness: 0.95 });
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x53341f, roughness: 0.8 });
  const blanketMat = new THREE.MeshStandardMaterial({ color: 0x7a2c34, roughness: 1 });

  const root = new THREE.Group();
  root.name = `horse-${palette.name}`;
  const body = new THREE.Group(); // separated so gallop bounce doesn't move the root
  root.add(body);

  // ---- Torso ----
  const barrel = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.95, 4, 10), coatMat);
  barrel.rotation.x = Math.PI / 2; // capsule axis (Y) → along Z
  barrel.position.set(0, 1.3, 0);
  barrel.castShadow = true;
  body.add(barrel);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), coatMat);
  chest.position.set(0, 1.28, 0.6);
  chest.castShadow = true;
  body.add(chest);

  const rump = new THREE.Mesh(new THREE.SphereGeometry(0.44, 10, 8), coatMat);
  rump.position.set(0, 1.34, -0.55);
  rump.scale.set(1, 0.95, 1.1);
  rump.castShadow = true;
  body.add(rump);

  // ---- Neck & head ----
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, 1.42, 0.66);
  body.add(neckPivot);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.24, 0.8, 8), coatMat);
  neck.position.y = 0.38;
  neck.castShadow = true;
  neckPivot.add(neck);

  // Mane: flattened boxes along the back of the neck
  for (let i = 0; i < 4; i++) {
    const tuft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.16), maneMat);
    tuft.position.set(0, 0.12 + i * 0.19, -0.16 - i * 0.015);
    neckPivot.add(tuft);
  }

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.78, 0.05);
  neckPivot.add(headPivot);

  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.34), coatMat);
  skull.castShadow = true;
  headPivot.add(skull);

  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.26), coatMat);
  muzzle.position.set(0, -0.05, 0.27);
  headPivot.add(muzzle);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), maneMat);
    ear.position.set(side * 0.09, 0.2, -0.05);
    ear.rotation.z = -side * 0.25;
    headPivot.add(ear);
  }
  const forelock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.08), maneMat);
  forelock.position.set(0, 0.16, 0.1);
  headPivot.add(forelock);

  // ---- Legs (pivots at the shoulder/hip) ----
  const legY = 1.18;
  const legs = {
    FL: limb(coatMat, new THREE.Vector3(0.26, legY, 0.52), 0.62, 0.52),
    FR: limb(coatMat, new THREE.Vector3(-0.26, legY, 0.52), 0.62, 0.52),
    HL: limb(coatMat, new THREE.Vector3(0.28, legY, -0.55), 0.62, 0.52),
    HR: limb(coatMat, new THREE.Vector3(-0.28, legY, -0.55), 0.62, 0.52),
  };
  for (const key of Object.keys(legs)) body.add(legs[key].pivot);

  // ---- Tail ----
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 1.5, -0.85);
  body.add(tailPivot);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.75, 6), maneMat);
  tail.position.y = -0.32;
  tail.rotation.x = Math.PI; // hang down
  tailPivot.add(tail);
  tailPivot.rotation.x = 0.35;

  // ---- Tack (saddle + blanket) ----
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, 0.7), blanketMat);
  blanket.position.set(0, 1.62, 0.02);
  body.add(blanket);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.13, 0.5), leatherMat);
  saddle.position.set(0, 1.7, 0.02);
  body.add(saddle);
  const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.1), leatherMat);
  pommel.position.set(0, 1.78, 0.24);
  body.add(pommel);

  // ---- Rider (visible only while mounted) ----
  // The on-foot character mesh is hidden during riding; this instance of the
  // same articulated character sits in the saddle (posed each frame by
  // applySeatedPose) so the horse never gallops around eerily riderless.
  const riderChar = createCharacter();
  const rider = riderChar.group;
  // Root is at the feet; raise it so the seated hips land on the saddle
  rider.position.set(0, 0.82, -0.02);
  rider.scale.setScalar(0.97);
  rider.visible = false;
  body.add(rider);

  const parts = { body, barrel, neckPivot, headPivot, legs, tailPivot, rider, riderRig: riderChar.rig };
  const animator = new HorseAnimator(parts);

  // Where a rider sits, in the horse's local space
  const saddleOffset = new THREE.Vector3(0, 1.55, 0.02);

  return { root, parts, animator, saddleOffset, rider, name: palette.name };
}

// ---- Procedural gait animation ------------------------------------------------

const NECK_BASE = 0.62;   // resting neck tilt (up & forward)
const HEAD_BASE = -0.5;   // head tilt relative to neck

export class HorseAnimator {
  constructor(parts) {
    this.parts = parts;
    this.phase = 0;
    this.grazeWeight = 0;
    this._grazeTimer = 3 + Math.random() * 5;
    this._grazing = false;
    this._idleSeed = Math.random() * 100;
  }

  /**
   * @param {number} dt      frame delta (s)
   * @param {number} t       elapsed time (s)
   * @param {number} speed   current ground speed (units/s)
   * @param {boolean} ridden whether a player sits in the saddle
   */
  update(dt, t, speed, ridden) {
    const { body, barrel, neckPivot, headPivot, legs, tailPivot } = this.parts;

    // Stride frequency rises with speed (clamped so the gallop stays readable)
    const hz = Math.min(0.9 + speed * 0.13, 2.6);
    this.phase += dt * hz * Math.PI * 2;
    const p = this.phase;

    const moveAmp = Math.min(speed / 6.5, 1);          // 0 → full trot
    const gallop = THREE.MathUtils.smoothstep(speed, 8.5, 13); // 0 → full gallop

    // Leg phase offsets: diagonal pairs for trot, front/back grouping at gallop
    const trotOff = { FL: 0, HR: 0, FR: Math.PI, HL: Math.PI };
    const gallopOff = { FL: 0, FR: 0.45, HL: Math.PI, HR: Math.PI + 0.45 };
    const amp = (0.5 + 0.4 * gallop) * moveAmp;

    for (const key of ['FL', 'FR', 'HL', 'HR']) {
      const off = trotOff[key] * (1 - gallop) + gallopOff[key] * gallop;
      const swing = Math.sin(p + off);
      legs[key].pivot.rotation.x = swing * amp * 0.75;
      // Fold the lower leg while it swings forward (recovery phase)
      const fold = Math.max(0, Math.sin(p + off + 1.3));
      legs[key].knee.rotation.x = fold * amp * 1.0;
    }

    // Gallop suspension: the whole body bounces and rocks
    body.position.y = Math.abs(Math.sin(p)) * 0.1 * gallop;
    body.rotation.x = Math.sin(p + 0.7) * 0.07 * gallop + Math.sin(p) * 0.02 * moveAmp * (1 - gallop);

    // ---- Idle behaviours (grazing, breathing) ----
    if (speed < 0.3 && !ridden) {
      this._grazeTimer -= dt;
      if (this._grazeTimer <= 0) {
        this._grazing = !this._grazing;
        this._grazeTimer = this._grazing ? 2.5 + Math.random() * 3 : 4 + Math.random() * 8;
      }
    } else {
      this._grazing = false;
    }
    const targetGraze = this._grazing ? 1 : 0;
    this.grazeWeight += (targetGraze - this.grazeWeight) * Math.min(1, dt * 2.2);

    // Breathing — barely visible barrel swell when standing
    const breathe = 1 + Math.sin(t * 1.7 + this._idleSeed) * 0.015 * (1 - moveAmp);
    barrel.scale.set(breathe, breathe, 1);

    // ---- Neck & head ----
    // walk: gentle bob | gallop: neck stretches with the stride | idle: graze dips
    const neckBob = Math.sin(p) * (0.05 * moveAmp * (1 - gallop) + 0.12 * gallop);
    neckPivot.rotation.x =
      NECK_BASE + neckBob + this.grazeWeight * 1.25 - gallop * 0.22;
    headPivot.rotation.x = HEAD_BASE - this.grazeWeight * 0.35 + gallop * 0.15;

    // ---- Tail ----
    const stream = gallop * 0.5; // tail streams out at speed
    tailPivot.rotation.x = 0.35 + stream;
    tailPivot.rotation.z = Math.sin(t * 1.9 + this._idleSeed) * (0.18 - 0.1 * moveAmp);

    // ---- Rider ---- posed astride, leaning into the gallop
    if (this.parts.rider && this.parts.rider.visible) {
      applySeatedPose(this.parts.riderRig, { gallop, phase: p, move: moveAmp });
    }
  }
}
