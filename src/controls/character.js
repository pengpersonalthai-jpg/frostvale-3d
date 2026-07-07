/**
 * The wanderer: an articulated humanoid built from primitives with natural
 * proportions (~1.8 m tall, 4-heads torso/legs split) and a procedural
 * animation set — idle (breathing, weight shift, glances), walk, run, jump
 * with landing recovery, and lean-into-turns. No rigged assets: every joint
 * is a THREE.Group pivot, so the whole outfit stays procedural and tiny.
 *
 * Outfit: fitted indigo winter coat with a fur collar and flared hem,
 * leather belt with a brass buckle, crimson scarf with a fluttering tail,
 * gloves, and fur-cuffed boots. The hood is up — it's cold out.
 *
 * The character faces its local +Z. `createCharacter()` returns the group
 * plus a named `rig` of joints; `CharacterAnimator` drives on-foot motion
 * and `applySeatedPose` poses the same rig in a saddle (used by the horse).
 */

import * as THREE from 'three';

const HIPS_Y = 0.96; // hip joint height — legs below, spine above

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts });
}

export function createCharacter() {
  const mats = {
    coat: std(0x333c66),
    coatDark: std(0x272e4e),      // sleeves, hood, hem
    fur: std(0xb9bfcc, { roughness: 1 }),
    pants: std(0x2b303f),
    boot: std(0x38291b),
    glove: std(0x241c14),
    skin: std(0xd9c2a7, { roughness: 0.7 }),
    scarf: std(0x8e2f2c, { roughness: 0.95 }),
    belt: std(0x33251a),
    buckle: std(0xb98a3d, { roughness: 0.35, metalness: 0.6 }),
  };
  const cast = (m) => { m.castShadow = true; return m; };

  const group = new THREE.Group();
  const rig = {};

  // ---- Hips: everything hangs off this (bob is applied here) ----
  const hips = new THREE.Group();
  hips.position.y = HIPS_Y;
  group.add(hips);
  rig.hips = hips;
  rig.hipsBaseY = HIPS_Y;

  // ---- Legs ----
  function buildLeg(side) {
    const thigh = new THREE.Group();
    thigh.position.set(side * 0.105, -0.02, 0);
    hips.add(thigh);

    const thighMesh = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.28, 4, 8), mats.pants));
    thighMesh.position.y = -0.2;
    thigh.add(thighMesh);

    const knee = new THREE.Group();
    knee.position.y = -0.42;
    thigh.add(knee);

    const shinMesh = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.26, 4, 8), mats.pants));
    shinMesh.position.y = -0.19;
    knee.add(shinMesh);

    // Boot with a fur cuff, toe pointing +Z
    const cuff = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.08, 0.09, 8), mats.fur));
    cuff.position.y = -0.34;
    knee.add(cuff);
    const boot = cast(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.25), mats.boot));
    boot.position.set(0, -0.435, 0.045);
    knee.add(boot);

    return { thigh, knee };
  }
  const legL = buildLeg(1);
  const legR = buildLeg(-1);
  rig.thighL = legL.thigh; rig.kneeL = legL.knee;
  rig.thighR = legR.thigh; rig.kneeR = legR.knee;

  // ---- Spine / torso ----
  const spine = new THREE.Group();
  spine.position.y = 0.06;
  hips.add(spine);
  rig.spine = spine;

  // Coat body: gently tapered waist → chest
  const torso = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.14, 0.34, 10), mats.coat));
  torso.position.y = 0.24;
  spine.add(torso);

  // Flared coat hem over the hips
  const hem = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.225, 0.24, 10, 1, true), mats.coatDark));
  hem.position.y = 0.0;
  hem.material.side = THREE.DoubleSide;
  spine.add(hem);

  // Chest mass + shoulder line
  const chest = cast(new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), mats.coat));
  chest.scale.set(1, 0.85, 0.72);
  chest.position.y = 0.44;
  spine.add(chest);
  rig.chest = chest;

  const shoulders = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), mats.coat));
  shoulders.rotation.z = Math.PI / 2;
  shoulders.position.y = 0.52;
  spine.add(shoulders);

  // Belt + buckle
  const belt = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.06, 10), mats.belt));
  belt.position.y = 0.09;
  spine.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), mats.buckle);
  buckle.position.set(0, 0.09, 0.165);
  spine.add(buckle);

  // Fur collar + scarf with a hanging tail (animated)
  const collar = cast(new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.05, 8, 14), mats.fur));
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.57;
  spine.add(collar);

  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mats.scarf);
  knot.position.set(0.04, 0.53, 0.13);
  spine.add(knot);
  const scarfTail = new THREE.Group();
  scarfTail.position.set(0.05, 0.52, 0.13);
  spine.add(scarfTail);
  const tailMesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.26, 0.025), mats.scarf);
  tailMesh.position.y = -0.13;
  scarfTail.add(tailMesh);
  rig.scarfTail = scarfTail;

  // ---- Arms ----
  function buildArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.215, 0.52, 0);
    spine.add(shoulder);

    const upper = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, 4, 8), mats.coatDark));
    upper.position.y = -0.15;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    shoulder.add(elbow);

    const forearm = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.18, 4, 8), mats.coatDark));
    forearm.position.y = -0.13;
    elbow.add(forearm);

    const hand = cast(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mats.glove));
    hand.scale.set(0.85, 1.1, 0.9);
    hand.position.y = -0.27;
    elbow.add(hand);

    return { shoulder, elbow };
  }
  const armL = buildArm(1);
  const armR = buildArm(-1);
  rig.shoulderL = armL.shoulder; rig.elbowL = armL.elbow;
  rig.shoulderR = armR.shoulder; rig.elbowR = armR.elbow;
  // Resting: arms hang with a slight outward angle
  rig.shoulderL.rotation.z = 0.08;
  rig.shoulderR.rotation.z = -0.08;

  // ---- Neck & head ----
  const neck = new THREE.Group();
  neck.position.y = 0.58;
  spine.add(neck);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8), mats.skin);
  neckMesh.position.y = 0.05;
  neck.add(neckMesh);

  const head = new THREE.Group();
  head.position.y = 0.1;
  neck.add(head);
  rig.head = head;

  const skull = cast(new THREE.Mesh(new THREE.SphereGeometry(0.112, 14, 12), mats.skin));
  skull.scale.set(0.95, 1.08, 1.0);
  skull.position.y = 0.09;
  head.add(skull);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.045, 6), mats.skin);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.075, 0.11);
  head.add(nose);

  // Hood (up): a swept-back open cone over the crown, plus a rim tucked
  // around the top/back of the head — tilted well back so from the front it
  // reads as the hood's edge shadowing the brow, not a halo.
  const hood = cast(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 9, 1, true), mats.coatDark));
  hood.material.side = THREE.DoubleSide;
  hood.position.set(0, 0.17, -0.07);
  hood.rotation.x = -0.55;
  head.add(hood);
  const rim = cast(new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.034, 8, 14), mats.coatDark));
  rim.position.set(0, 0.12, 0.02);
  rim.rotation.x = -0.5;
  head.add(rim);

  return { group, rig };
}

// ---- Animation --------------------------------------------------------------

export class CharacterAnimator {
  constructor(rig) {
    this.rig = rig;
    this.phase = 0;
    this.air = 0;
    this.land = 0;
    this._glanceT = 2 + Math.random() * 4;
    this._glanceYaw = 0;
  }

  /**
   * @param {object} s  { speed, grounded, turnRate } — turnRate in rad/s,
   *                    used to bank the torso into turns.
   */
  update(dt, t, s) {
    const R = this.rig;
    const speed = s.speed ?? 0;
    const move = Math.min(speed / 5.0, 1) * (1 - this.air);
    const run = THREE.MathUtils.smoothstep(speed, 5.6, 9.0);

    // Step cadence rises with speed (~2 steps/s walking, ~3 running)
    if (speed > 0.3) this.phase += dt * (1.5 + Math.min(speed, 10) * 0.17) * Math.PI * 2;
    const p = this.phase;

    // Airborne blend + a brief crouch on landing
    if (this.air > 0.5 && s.grounded) this.land = 0.22;
    this.land = Math.max(0, this.land - dt);
    this.air += ((s.grounded ? 0 : 1) - this.air) * Math.min(1, dt * 9);
    const air = this.air;
    const landC = this.land > 0 ? Math.sin((this.land / 0.22) * Math.PI) : 0;

    // ---- Legs: opposite-phase swings; knees fold on the recovery stroke ----
    const legAmp = (0.5 + 0.42 * run) * move;
    const sL = Math.sin(p);
    const sR = Math.sin(p + Math.PI);
    R.thighL.rotation.x = -sL * legAmp - air * 0.55 + landC * 0.3;
    R.thighR.rotation.x = -sR * legAmp + air * 0.3 + landC * 0.3;
    R.kneeL.rotation.x = Math.max(0, Math.sin(p + 1.15)) * legAmp * 1.5 + air * 0.95 + landC * 0.55;
    R.kneeR.rotation.x = Math.max(0, Math.sin(p + Math.PI + 1.15)) * legAmp * 1.5 + air * 0.45 + landC * 0.55;

    // ---- Arms: counter-swing; elbows bend more as the pace picks up ----
    const armAmp = (0.35 + 0.5 * run) * move;
    R.shoulderL.rotation.x = sL * armAmp - air * 0.3;
    R.shoulderR.rotation.x = sR * armAmp - air * 0.3;
    R.shoulderL.rotation.z = 0.08 + run * 0.14 + air * 0.3;
    R.shoulderR.rotation.z = -0.08 - run * 0.14 - air * 0.3;
    const elbowBase = 0.25 + run * 0.85 + air * 0.35;
    R.elbowL.rotation.x = -(elbowBase + Math.max(0, sL) * armAmp * 0.5);
    R.elbowR.rotation.x = -(elbowBase + Math.max(0, sR) * armAmp * 0.5);

    // ---- Torso: forward lean with pace, bank into turns, idle sway ----
    const lean = move * 0.05 + run * 0.13 + landC * 0.16 + air * 0.06;
    const bank = THREE.MathUtils.clamp(-(s.turnRate ?? 0) * 0.05, -0.16, 0.16) * (0.25 + 0.75 * move);
    R.spine.rotation.x = lean;
    R.spine.rotation.z = bank + Math.sin(t * 0.55) * 0.015 * (1 - move);

    // Vertical bob (double-beat: one dip per step)
    const bob = Math.abs(Math.sin(p)) * (0.035 + 0.03 * run) * move;
    R.hips.position.y = R.hipsBaseY + bob - landC * 0.09 - air * 0.02;

    // ---- Head: stabilise against lean; idle glances around the vale ----
    this._glanceT -= dt;
    if (this._glanceT <= 0) {
      this._glanceYaw = (Math.random() - 0.5) * 0.9;
      this._glanceT = 2.5 + Math.random() * 5;
    }
    const glance = speed < 0.5 ? this._glanceYaw : 0;
    R.head.rotation.y += (glance - R.head.rotation.y) * Math.min(1, dt * 3);
    R.head.rotation.x = -lean * 0.7;

    // Idle breathing
    const breathe = 1 + Math.sin(t * 1.6) * 0.02 * (1 - move);
    R.chest.scale.set(breathe, 0.85 * breathe, 0.72);

    // Scarf tail streams back with speed, flutters in the wind
    R.scarfTail.rotation.x = -0.12 - move * 0.7 - air * 0.45
      + Math.sin(p) * 0.1 * move + Math.sin(t * 2.3) * 0.06;
  }
}

/**
 * Poses the rig in a saddle. Called every frame while mounted (instead of
 * CharacterAnimator.update): legs astride, hands forward on the reins,
 * leaning into the gallop and rocking gently with the stride.
 */
export function applySeatedPose(rig, { gallop = 0, phase = 0, move = 0 } = {}) {
  rig.thighL.rotation.set(-1.25 + gallop * 0.12, 0, -0.28);
  rig.thighR.rotation.set(-1.25 + gallop * 0.12, 0, 0.28);
  rig.kneeL.rotation.x = rig.kneeR.rotation.x = 1.45 - gallop * 0.15;
  rig.shoulderL.rotation.set(-0.5 - gallop * 0.3, 0, 0.12);
  rig.shoulderR.rotation.set(-0.5 - gallop * 0.3, 0, -0.12);
  rig.elbowL.rotation.x = rig.elbowR.rotation.x = -0.7;
  rig.spine.rotation.x = 0.08 + gallop * 0.3 + Math.sin(phase) * 0.05 * move;
  rig.spine.rotation.z = 0;
  rig.head.rotation.x = -(0.08 + gallop * 0.3) * 0.6;
  rig.head.rotation.y = 0;
  rig.hips.position.y = rig.hipsBaseY + Math.abs(Math.sin(phase)) * 0.02 * gallop;
  rig.scarfTail.rotation.x = -0.15 - gallop * 0.9 + Math.sin(phase) * 0.15 * move;
}
