/**
 * Mount system: horse placement, the E-to-mount interaction, and the
 * riding controller.
 *
 * Discovery aids: a soft amber marker floats over the nearest horse from
 * ~14 units away, and the "Press E to mount" prompt appears within
 * MOUNT_RANGE. Interaction uses the layout-independent "interact" action.
 *
 * Riding deliberately does NOT feel like strafe-movement:
 *  - W builds speed with acceleration; releasing it coasts down.
 *  - A/D steer the horse's heading; the turn rate tightens at low speed
 *    and widens at a gallop (a real turning radius).
 *  - Shift gallops; S brakes, then backs up slowly.
 * The camera switches to a taller, further "mounted" profile, and a small
 * FOV boost kicks in at gallop speed.
 */

import * as THREE from 'three';
import { createHorse } from './horse.js';
import { groundHeightUnder, terrainHeight, CAMP } from '../world/terrain.js';

const MOUNT_RANGE = 4.5;
const MARKER_RANGE = 14;
const WALK_MAX = 7.0;
const GALLOP_MAX = 16.5;
const REVERSE_MAX = 2.2;
const ACCEL = 7.5;         // units/s²
const BRAKE = 14;
const MAX_CLIMB_SLOPE = 1.35; // horses refuse steeper ground than the player

export class MountSystem {
  constructor(scene, input, followCam, player, ui, prints) {
    this.input = input;
    this.cam = followCam;
    this.player = player;
    this.ui = ui;
    this.prints = prints;

    this.riding = null; // the horse currently ridden
    this.speed = 0;
    this._strideDist = 0;
    this._strideSide = 1;

    // Three horses graze in the meadow beside Last Ember Camp
    const spots = [
      { key: 'boreal', x: CAMP.x + 14, z: CAMP.z + 12, yaw: 2.1 },
      { key: 'ember', x: CAMP.x + 20, z: CAMP.z + 2, yaw: -0.7 },
      { key: 'vesper', x: CAMP.x + 10, z: CAMP.z - 8, yaw: 3.6 },
    ];
    this.horses = spots.map((s) => {
      const horse = createHorse(s.key);
      horse.yaw = s.yaw;
      horse.pos = new THREE.Vector3(s.x, terrainHeight(s.x, s.z), s.z);
      horse.root.position.copy(horse.pos);
      horse.root.rotation.y = s.yaw;
      scene.add(horse.root);
      return horse;
    });

    // Floating "you can ride me" marker — bright enough to catch the bloom
    this.marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18, 0),
      new THREE.MeshBasicMaterial({ color: 0xffc069 }),
    );
    this.marker.visible = false;
    scene.add(this.marker);
  }

  get isRiding() {
    return this.riding !== null;
  }

  nearestHorse(maxDist = MOUNT_RANGE) {
    let best = null;
    let bestD = maxDist;
    for (const h of this.horses) {
      const d = h.pos.distanceTo(this.player.pos);
      if (d < bestD) {
        best = h;
        bestD = d;
      }
    }
    return best;
  }

  mount(horse) {
    this.riding = horse;
    this.speed = 0;
    horse.rider.visible = true;      // seat the rider figure in the saddle
    this.player.active = false;      // hides the on-foot mesh, skips its update
    this.cam.mode = 'mounted';
    this.ui.setMode('mounted');
    this.ui.hidePrompt();
    this.marker.visible = false;
  }

  dismount() {
    const horse = this.riding;
    this.riding = null;
    this.speed = 0;
    horse.rider.visible = false;
    // Step off to the horse's left side
    const side = new THREE.Vector3(
      Math.cos(horse.yaw) * 1.5, 0, -Math.sin(horse.yaw) * 1.5,
    );
    const p = this.player.pos;
    p.copy(horse.pos).add(side);
    p.y = groundHeightUnder(p.x, p.z, horse.pos.y + 1);
    this.player.resolveCollisions(p);
    p.y = groundHeightUnder(p.x, p.z, p.y + 1);
    this.player.vel.set(0, 0, 0);
    this.player.vy = 0;
    this.player.active = true;
    this.cam.mode = 'foot';
    this.ui.setMode('foot');
  }

  update(dt, t) {
    const input = this.input;

    if (!this.riding) {
      // Idle-animate every horse; offer the marker + mount prompt when close
      for (const h of this.horses) h.animator.update(dt, t, 0, false);

      const nearby = this.nearestHorse(MARKER_RANGE);
      if (nearby) {
        this.marker.visible = true;
        this.marker.position.copy(nearby.pos);
        this.marker.position.y += 2.75 + Math.sin(t * 2.2) * 0.12;
        this.marker.rotation.y = t * 1.8;
      } else {
        this.marker.visible = false;
      }

      const near = this.nearestHorse(MOUNT_RANGE);
      if (near) {
        this.ui.showPrompt(`Mount ${near.name}`);
        if (input.actionPressed('interact')) this.mount(near);
      } else {
        this.ui.hidePrompt();
      }
      return { fovBoost: 0 };
    }

    // ---- Riding ----
    const horse = this.riding;

    if (input.actionPressed('interact')) {
      this.dismount();
      for (const h of this.horses) h.animator.update(dt, t, 0, false);
      return { fovBoost: 0 };
    }

    // Throttle: W forward (Shift gallops), S brake/reverse
    const galloping = input.action('sprint');
    let target = 0;
    if (input.action('forward')) target = galloping ? GALLOP_MAX : WALK_MAX;
    else if (input.action('back')) target = this.speed > 0.5 ? 0 : -REVERSE_MAX;

    const rate = Math.abs(target) < Math.abs(this.speed) ? BRAKE : ACCEL;
    const delta = target - this.speed;
    this.speed += Math.sign(delta) * Math.min(Math.abs(delta), rate * dt);

    // Steering: tighter when slow, wide arcs at full gallop; reversing flips it
    let steer = 0;
    if (input.action('left')) steer += 1;
    if (input.action('right')) steer -= 1;
    const speedFrac = Math.min(Math.abs(this.speed) / GALLOP_MAX, 1);
    const turnRate = Math.abs(this.speed) < 0.3
      ? 1.1 // shuffle in place
      : 2.3 * (1 - 0.6 * speedFrac);
    horse.yaw += steer * turnRate * dt * (this.speed < -0.1 ? -1 : 1);

    // Advance along the heading, refusing over-steep ground
    const fwd = new THREE.Vector3(Math.sin(horse.yaw), 0, Math.cos(horse.yaw));
    const step = fwd.clone().multiplyScalar(this.speed * dt);
    const stepLen = step.length();
    if (stepLen > 1e-6) {
      const here = groundHeightUnder(horse.pos.x, horse.pos.z, horse.pos.y);
      const there = groundHeightUnder(horse.pos.x + step.x, horse.pos.z + step.z, horse.pos.y + 0.8);
      if ((there - here) / stepLen > MAX_CLIMB_SLOPE) {
        step.set(0, 0, 0);
        this.speed *= 0.4; // balk at the slope
      }
    }
    horse.pos.x += step.x;
    horse.pos.z += step.z;

    // Reuse the player's collision solver with a horse-sized radius
    this.player.resolveCollisions(horse.pos, 0.9);

    // Terrain/bridge following: smooth vertical tracking + slope pitch
    const groundY = groundHeightUnder(horse.pos.x, horse.pos.z, horse.pos.y + 0.5);
    horse.pos.y += (groundY - horse.pos.y) * Math.min(1, dt * 10);

    const ahead = groundHeightUnder(horse.pos.x + fwd.x * 1.2, horse.pos.z + fwd.z * 1.2, horse.pos.y + 0.8);
    const behind = groundHeightUnder(horse.pos.x - fwd.x * 1.2, horse.pos.z - fwd.z * 1.2, horse.pos.y + 0.8);
    const slopePitch = Math.atan2(ahead - behind, 2.4) * 0.55;

    horse.root.position.copy(horse.pos);
    horse.root.rotation.set(-slopePitch, horse.yaw, 0, 'YXZ');

    // Animate this horse with its real speed; idle-animate the others
    horse.animator.update(dt, t, Math.abs(this.speed), true);
    for (const h of this.horses) {
      if (h !== horse) h.animator.update(dt, t, 0, false);
    }

    // Keep the player's logical position glued to the saddle (camera target)
    this.player.pos.copy(horse.pos);
    this.player.pos.y += 1.0;

    // Hoofprints at speed
    if (Math.abs(this.speed) > 1.5) {
      this._strideDist += Math.abs(this.speed) * dt;
      const stride = 1.4 + speedFrac * 1.2;
      if (this._strideDist > stride) {
        this._strideDist = 0;
        this._strideSide *= -1;
        const side = this._strideSide * 0.3;
        this.prints.stamp(
          horse.pos.x + Math.cos(horse.yaw) * side,
          groundY,
          horse.pos.z - Math.sin(horse.yaw) * side,
          horse.yaw,
          0.3, 0.34,
        );
      }
    }

    // Prompt while stationary so new players discover dismount
    if (Math.abs(this.speed) < 0.5) this.ui.showPrompt(`Dismount ${horse.name}`);
    else this.ui.hidePrompt();

    return { fovBoost: THREE.MathUtils.smoothstep(this.speed, 10, GALLOP_MAX) * 7 };
  }
}
