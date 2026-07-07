/**
 * On-foot player: WASD movement relative to the camera, sprint, jump,
 * terrain/bridge-following, and circle collision against tree trunks and
 * ruin walls. Visuals + animation live in character.js; this file is purely
 * the controller.
 */

import * as THREE from 'three';
import { groundHeightUnder, WORLD_RADIUS, CAMP } from '../world/terrain.js';
import { createCharacter, CharacterAnimator } from './character.js';

const WALK_SPEED = 5.2;
const SPRINT_SPEED = 9.6;
const ACCEL = 34;
const GRAVITY = 26;
const JUMP_SPEED = 8.6;
const RADIUS = 0.45;          // collision radius
const MAX_CLIMB_SLOPE = 1.7;  // rise/run above which a step is blocked

export class Player {
  /**
   * @param {object} world  { treeGrid, colliders } for collision queries
   * @param {FootprintPool} prints
   */
  constructor(scene, input, followCam, world, prints) {
    this.input = input;
    this.cam = followCam;
    this.world = world;
    this.prints = prints;

    const character = createCharacter();
    this.mesh = character.group;
    this.rig = character.rig;
    this.animator = new CharacterAnimator(character.rig);
    scene.add(this.mesh);

    this.pos = new THREE.Vector3(CAMP.x + 4, 0, CAMP.z + 8);
    this.pos.y = groundHeightUnder(this.pos.x, this.pos.z, 100);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.grounded = true;
    this.active = true; // false while riding
    this.visualYaw = 0;
    this._yawRate = 0;
    this._strideDist = 0;
    this._strideSide = 1;
  }

  /** Push (x, z) out of tree trunks and ruin colliders (also used by horses). */
  resolveCollisions(p, radius = RADIUS) {
    this.world.treeGrid.nearby(p.x, p.z, (t) => {
      const dx = p.x - t.x;
      const dz = p.z - t.z;
      const d = Math.hypot(dx, dz);
      const min = t.r + radius;
      if (d < min && d > 1e-5) {
        p.x = t.x + (dx / d) * min;
        p.z = t.z + (dz / d) * min;
      }
    });
    for (const c of this.world.colliders) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + radius;
      if (d < min && d > 1e-5) {
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
      }
    }
    // Soft world boundary — the blizzard beyond the peaks turns you back
    const r = Math.hypot(p.x, p.z);
    if (r > WORLD_RADIUS) {
      p.x *= WORLD_RADIUS / r;
      p.z *= WORLD_RADIUS / r;
    }
  }

  update(dt, elapsed) {
    if (!this.active) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;

    const input = this.input;
    // Movement input in camera space
    let ix = 0;
    let iz = 0;
    if (input.action('forward')) iz += 1;
    if (input.action('back')) iz -= 1;
    if (input.action('left')) ix -= 1;
    if (input.action('right')) ix += 1;

    const fwd = this.cam.forwardXZ(new THREE.Vector3());
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3()
      .addScaledVector(fwd, iz)
      .addScaledVector(right, ix);
    if (wish.lengthSq() > 0) wish.normalize();

    const sprinting = input.action('sprint');
    const targetSpeed = sprinting ? SPRINT_SPEED : WALK_SPEED;
    wish.multiplyScalar(targetSpeed);

    // Accelerate toward the wish velocity (also acts as friction when idle)
    const k = 1 - Math.exp(-dt * (ACCEL / targetSpeed));
    this.vel.x += (wish.x - this.vel.x) * k;
    this.vel.z += (wish.z - this.vel.z) * k;

    // Jumping / gravity
    if (this.grounded && input.actionPressed('jump')) {
      this.vy = JUMP_SPEED;
      this.grounded = false;
    }
    this.vy -= GRAVITY * dt;

    // Horizontal move, blocked on too-steep climbs (mountain walls)
    const step = new THREE.Vector3(this.vel.x * dt, 0, this.vel.z * dt);
    const stepLen = Math.hypot(step.x, step.z);
    if (stepLen > 1e-6) {
      const here = groundHeightUnder(this.pos.x, this.pos.z, this.pos.y);
      const there = groundHeightUnder(this.pos.x + step.x, this.pos.z + step.z, this.pos.y + 0.6);
      if ((there - here) / stepLen > MAX_CLIMB_SLOPE) {
        step.set(0, 0, 0);
        this.vel.multiplyScalar(0.3);
      }
    }
    this.pos.x += step.x;
    this.pos.z += step.z;
    this.pos.y += this.vy * dt;

    this.resolveCollisions(this.pos);

    // Land on the ground: terrain, the ice sheet, or a bridge deck.
    // Walking off an edge (bridge side, ledge) correctly drops grounded.
    const ground = groundHeightUnder(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y <= ground) {
      this.pos.y = ground;
      this.vy = 0;
      this.grounded = true;
    } else if (this.pos.y > ground + 0.08) {
      this.grounded = false;
    }

    // Face the direction of travel; track the turn rate for torso banking
    const speed = Math.hypot(this.vel.x, this.vel.z);
    let yawRate = 0;
    if (speed > 0.6) {
      const targetYaw = Math.atan2(this.vel.x, this.vel.z);
      let d = targetYaw - this.visualYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d)); // shortest arc
      const turn = d * Math.min(1, dt * 11);
      this.visualYaw += turn;
      yawRate = dt > 1e-5 ? turn / dt : 0;
    }
    this._yawRate += (yawRate - this._yawRate) * Math.min(1, dt * 8);

    // Footprints — stamped every stride length, alternating left/right
    if (this.grounded && speed > 0.8) {
      this._strideDist += speed * dt;
      const stride = sprinting ? 1.5 : 1.0;
      if (this._strideDist > stride) {
        this._strideDist = 0;
        this._strideSide *= -1;
        const side = this._strideSide * 0.16;
        this.prints.stamp(
          this.pos.x + Math.cos(this.visualYaw) * side,
          ground,
          this.pos.z - Math.sin(this.visualYaw) * side,
          this.visualYaw,
        );
      }
    }

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.visualYaw, 0);

    this.animator.update(dt, elapsed, {
      speed,
      grounded: this.grounded,
      turnRate: this._yawRate,
    });
  }
}
