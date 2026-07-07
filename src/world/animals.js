/**
 * Wildlife: deer grazing the forest meadows and snow hares in the brush.
 *
 * Deer reuse the horse's jointed-leg builder and gait animator (a deer is,
 * animation-wise, a slim horse with antlers), so trot/graze/flee come free.
 * Hares get a simple hop cycle. Both share a tiny state-machine AI:
 * idle → wander → (player gets close) → flee, staying near a home point
 * and pushing out of tree trunks like every other character.
 */

import * as THREE from 'three';
import { limb, HorseAnimator } from '../mount/horse.js';
import { groundHeight, terrainHeight } from './terrain.js';

// ---- Models -------------------------------------------------------------------

function createDeer() {
  const coatMat = new THREE.MeshStandardMaterial({ color: 0x6a5947, roughness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x3f3428, roughness: 0.95 });
  const antlerMat = new THREE.MeshStandardMaterial({ color: 0x9c8c74, roughness: 0.85 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const barrel = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.6, 4, 8), coatMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 1.02, 0);
  barrel.castShadow = true;
  body.add(barrel);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 7), coatMat);
  chest.position.set(0, 1.03, 0.36);
  chest.castShadow = true;
  body.add(chest);
  const rump = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 7), coatMat);
  rump.position.set(0, 1.06, -0.34);
  rump.scale.set(0.95, 0.95, 1.05);
  body.add(rump);

  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, 1.12, 0.4);
  body.add(neckPivot);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 0.55, 7), coatMat);
  neck.position.y = 0.26;
  neck.castShadow = true;
  neckPivot.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.54, 0.03);
  neckPivot.add(headPivot);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.17, 0.2), coatMat);
  headPivot.add(skull);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.16), darkMat);
  snout.position.set(0, -0.035, 0.16);
  headPivot.add(snout);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.13, 5), coatMat);
    ear.position.set(side * 0.07, 0.13, -0.03);
    ear.rotation.z = -side * 0.5;
    headPivot.add(ear);
    // Antlers: a main beam and one branch per side
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.34, 5), antlerMat);
    beam.position.set(side * 0.06, 0.24, -0.04);
    beam.rotation.set(-0.35, 0, -side * 0.45);
    headPivot.add(beam);
    const branch = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.18, 5), antlerMat);
    branch.position.set(side * 0.12, 0.28, 0.0);
    branch.rotation.set(0.3, 0, -side * 0.95);
    headPivot.add(branch);
  }

  const legY = 0.94;
  const legs = {
    FL: limb(coatMat, new THREE.Vector3(0.15, legY, 0.33), 0.5, 0.4, 0.6),
    FR: limb(coatMat, new THREE.Vector3(-0.15, legY, 0.33), 0.5, 0.4, 0.6),
    HL: limb(coatMat, new THREE.Vector3(0.16, legY, -0.35), 0.5, 0.4, 0.6),
    HR: limb(coatMat, new THREE.Vector3(-0.16, legY, -0.35), 0.5, 0.4, 0.6),
  };
  for (const key of Object.keys(legs)) body.add(legs[key].pivot);

  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 1.14, -0.5);
  body.add(tailPivot);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 5), darkMat);
  tail.position.y = -0.06;
  tail.rotation.x = Math.PI;
  tailPivot.add(tail);
  tailPivot.rotation.x = 0.5;

  // Same part layout as the horse → the horse's gait animator drives it
  const animator = new HorseAnimator({ body, barrel, neckPivot, headPivot, legs, tailPivot });
  return { root, animator };
}

function createHare() {
  const furMat = new THREE.MeshStandardMaterial({ color: 0xb9c0cc, roughness: 1 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.17;
  root.add(body);

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 7), furMat);
  torso.scale.set(0.9, 0.92, 1.3);
  torso.castShadow = true;
  body.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 7), furMat);
  head.position.set(0, 0.1, 0.16);
  body.add(head);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), furMat);
  tail.position.set(0, 0.0, -0.19);
  body.add(tail);

  const ears = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.12, 3, 6), furMat);
    ear.position.set(side * 0.045, 0.24, 0.12);
    ear.rotation.set(-0.15, 0, side * 0.18);
    body.add(ear);
    ears.push(ear);
  }

  return { root, body, ears };
}

// ---- AI -------------------------------------------------------------------------

class Critter {
  constructor(x, z, opts) {
    this.pos = new THREE.Vector3(x, groundHeight(x, z), z);
    this.home = new THREE.Vector2(x, z);
    this.yaw = Math.random() * Math.PI * 2;
    this.targetYaw = this.yaw;
    this.speed = 0;
    this.state = 'idle';
    this.timer = 1 + Math.random() * 4;
    this.opts = opts; // { walk, flee, fleeRadius, homeRadius }
  }

  update(dt, threat, treeGrid) {
    const o = this.opts;
    const dThreat = Math.hypot(this.pos.x - threat.x, this.pos.z - threat.z);

    // Spooked: bolt directly away from the player/horse
    if (dThreat < o.fleeRadius && this.state !== 'flee') {
      this.state = 'flee';
      this.timer = 2 + Math.random() * 1.5;
    }

    let targetSpeed = 0;
    if (this.state === 'flee') {
      this.targetYaw = Math.atan2(this.pos.x - threat.x, this.pos.z - threat.z);
      targetSpeed = o.flee;
      this.timer -= dt;
      if (this.timer <= 0 && dThreat > o.fleeRadius * 2) {
        this.state = 'idle';
        this.timer = 1 + Math.random() * 2;
      }
    } else if (this.state === 'wander') {
      targetSpeed = o.walk;
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'idle';
        this.timer = 2 + Math.random() * 5;
      }
    } else { // idle
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'wander';
        this.timer = 2 + Math.random() * 3;
        // Head somewhere new; drift back if straying from home
        const dHome = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.y);
        this.targetYaw = dHome > o.homeRadius
          ? Math.atan2(this.home.x - this.pos.x, this.home.y - this.pos.z)
          : Math.random() * Math.PI * 2;
      }
    }

    // Ease heading + speed
    let dYaw = this.targetYaw - this.yaw;
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    this.yaw += dYaw * Math.min(1, dt * (this.state === 'flee' ? 4 : 1.8));
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 4);

    // Move with a cheap steep-slope refusal (keeps them out of the peaks)
    if (this.speed > 0.05) {
      const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt;
      const nz = this.pos.z + Math.cos(this.yaw) * this.speed * dt;
      const climb = terrainHeight(nx, nz) - terrainHeight(this.pos.x, this.pos.z);
      if (climb / Math.max(this.speed * dt, 1e-5) < 1.2 && Math.hypot(nx, nz) < 500) {
        this.pos.x = nx;
        this.pos.z = nz;
      } else {
        this.targetYaw = this.yaw + Math.PI * (0.5 + Math.random() * 0.5);
      }
      // Don't clip through tree trunks
      treeGrid.nearby(this.pos.x, this.pos.z, (tr) => {
        const dx = this.pos.x - tr.x;
        const dz = this.pos.z - tr.z;
        const d = Math.hypot(dx, dz);
        const min = tr.r + 0.4;
        if (d < min && d > 1e-5) {
          this.pos.x = tr.x + (dx / d) * min;
          this.pos.z = tr.z + (dz / d) * min;
        }
      });
    }
    this.pos.y = groundHeight(this.pos.x, this.pos.z);
  }
}

// ---- Assembly ---------------------------------------------------------------------

const DEER_SPOTS = [
  [-140, 40], [-60, 195], [160, 90], [40, -265], [-205, -60],
];
const HARE_SPOTS = [
  [30, 95], [115, 62], [-45, -55], [140, -140], [-100, -185], [55, -40],
];

export function createAnimals(scene, treeGrid) {
  const group = new THREE.Group();
  group.name = 'wildlife';

  const deer = DEER_SPOTS.map(([x, z]) => {
    const model = createDeer();
    const ai = new Critter(x, z, { walk: 1.7, flee: 10.5, fleeRadius: 15, homeRadius: 45 });
    group.add(model.root);
    return { model, ai };
  });

  const hares = HARE_SPOTS.map(([x, z]) => {
    const model = createHare();
    const ai = new Critter(x, z, { walk: 1.4, flee: 7.5, fleeRadius: 10, homeRadius: 30 });
    model.hopPhase = Math.random() * 10;
    group.add(model.root);
    return { model, ai };
  });

  scene.add(group);

  function update(dt, t, threatPos) {
    for (const d of deer) {
      d.ai.update(dt, threatPos, treeGrid);
      d.model.root.position.copy(d.ai.pos);
      d.model.root.rotation.y = d.ai.yaw;
      d.model.animator.update(dt, t, d.ai.speed, false);
    }
    for (const h of hares) {
      h.ai.update(dt, threatPos, treeGrid);
      const m = h.model;
      const moving = Math.min(h.ai.speed / 3, 1);
      // Hop cycle: airborne arcs while moving, sitting upright when idle
      m.hopPhase += dt * (2.5 + h.ai.speed * 1.1) * Math.PI;
      const hop = Math.abs(Math.sin(m.hopPhase)) * 0.22 * moving;
      m.root.position.set(h.ai.pos.x, h.ai.pos.y + hop, h.ai.pos.z);
      m.root.rotation.y = h.ai.yaw;
      m.body.rotation.x = -Math.cos(m.hopPhase) * 0.3 * moving - 0.35 * (1 - moving);
      // Ears flop with the hop, twitch at rest
      for (let i = 0; i < 2; i++) {
        m.ears[i].rotation.x = -0.15 - hop * 1.2 + Math.sin(t * 3 + i * 2 + m.hopPhase) * 0.06 * (1 - moving);
      }
    }
  }

  return { group, update, deer, hares };
}
