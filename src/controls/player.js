/**
 * On-foot player: a cloaked wanderer with WASD movement relative to the
 * camera, sprint, jump, terrain-following, and simple circle collision
 * against tree trunks and ruin walls.
 *
 * The character is a hooded figure whose cloak hides the legs — a deliberate
 * trade-off that keeps the silhouette convincing without skeletal animation.
 */

import * as THREE from 'three';
import { groundHeight, WORLD_RADIUS, CAMP } from '../world/terrain.js';

const WALK_SPEED = 5.2;
const SPRINT_SPEED = 9.6;
const ACCEL = 34;
const GRAVITY = 26;
const JUMP_SPEED = 8.6;
const RADIUS = 0.45;          // collision radius
const MAX_CLIMB_SLOPE = 1.7;  // rise/run above which a step is blocked

function buildWanderer() {
  const g = new THREE.Group();
  const cloakMat = new THREE.MeshStandardMaterial({ color: 0x2c3352, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd8c6b2, roughness: 0.8 });
  const scarfMat = new THREE.MeshStandardMaterial({ color: 0x8c3232, roughness: 0.9 });

  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.5, 8), cloakMat);
  cloak.position.y = 0.75;
  cloak.castShadow = true;
  g.add(cloak);

  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), cloakMat);
  shoulders.position.y = 1.42;
  shoulders.scale.set(1.15, 0.8, 0.9);
  shoulders.castShadow = true;
  g.add(shoulders);

  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.07, 6, 12), scarfMat);
  scarf.position.y = 1.56;
  scarf.rotation.x = Math.PI / 2;
  g.add(scarf);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skinMat);
  head.position.y = 1.72;
  head.castShadow = true;
  g.add(head);

  // Hood: an open cone tipped back over the head
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 8, 1, true), cloakMat);
  hood.position.set(0, 1.82, -0.04);
  hood.rotation.x = -0.35;
  g.add(hood);

  return g;
}

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

    this.mesh = buildWanderer();
    scene.add(this.mesh);

    this.pos = new THREE.Vector3(CAMP.x + 4, 0, CAMP.z + 8);
    this.pos.y = groundHeight(this.pos.x, this.pos.z);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.grounded = true;
    this.active = true; // false while riding
    this.visualYaw = 0;
    this._strideDist = 0;
    this._strideSide = 1;
    this._bobT = 0;
  }

  /** Push (x, z) out of tree trunks and ruin colliders; returns corrected pos. */
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
    if (input.isDown('KeyW')) iz += 1;
    if (input.isDown('KeyS')) iz -= 1;
    if (input.isDown('KeyA')) ix -= 1;
    if (input.isDown('KeyD')) ix += 1;

    const fwd = this.cam.forwardXZ(new THREE.Vector3());
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3()
      .addScaledVector(fwd, iz)
      .addScaledVector(right, ix);
    if (wish.lengthSq() > 0) wish.normalize();

    const sprinting = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const targetSpeed = sprinting ? SPRINT_SPEED : WALK_SPEED;
    wish.multiplyScalar(targetSpeed);

    // Accelerate toward the wish velocity (also acts as friction when idle)
    const k = 1 - Math.exp(-dt * (ACCEL / targetSpeed));
    this.vel.x += (wish.x - this.vel.x) * k;
    this.vel.z += (wish.z - this.vel.z) * k;

    // Jumping / gravity
    if (this.grounded && input.wasPressed('Space')) {
      this.vy = JUMP_SPEED;
      this.grounded = false;
    }
    this.vy -= GRAVITY * dt;

    // Horizontal move, blocked on too-steep climbs (mountain walls)
    const step = new THREE.Vector3(this.vel.x * dt, 0, this.vel.z * dt);
    const stepLen = Math.hypot(step.x, step.z);
    if (stepLen > 1e-6) {
      const here = groundHeight(this.pos.x, this.pos.z);
      const there = groundHeight(this.pos.x + step.x, this.pos.z + step.z);
      if ((there - here) / stepLen > MAX_CLIMB_SLOPE) {
        step.set(0, 0, 0);
        this.vel.multiplyScalar(0.3);
      }
    }
    this.pos.x += step.x;
    this.pos.z += step.z;
    this.pos.y += this.vy * dt;

    this.resolveCollisions(this.pos);

    // Land on the ground (terrain or ice sheet)
    const ground = groundHeight(this.pos.x, this.pos.z);
    if (this.pos.y <= ground) {
      this.pos.y = ground;
      this.vy = 0;
      this.grounded = true;
    }

    // Face the direction of travel
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed > 0.6) {
      const targetYaw = Math.atan2(this.vel.x, this.vel.z);
      let d = targetYaw - this.visualYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d)); // shortest arc
      this.visualYaw += d * Math.min(1, dt * 11);
    }

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

    // Simple locomotion feel: bob while moving, lean into sprints
    this._bobT += dt * (4 + speed * 1.2);
    const bob = this.grounded ? Math.abs(Math.sin(this._bobT)) * 0.05 * Math.min(1, speed / 4) : 0;
    const lean = this.grounded ? Math.min(0.14, speed * 0.012) : 0.05;

    this.mesh.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    this.mesh.rotation.set(0, this.visualYaw, 0);
    this.mesh.rotateX(lean);

    // Gentle idle sway so the character never looks frozen (pun intended)
    if (speed < 0.5) {
      this.mesh.rotation.z = Math.sin(elapsed * 1.1) * 0.015;
    }
  }
}
