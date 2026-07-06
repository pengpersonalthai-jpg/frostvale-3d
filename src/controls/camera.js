/**
 * Third-person orbit-follow camera.
 *
 * Mouse-look sets yaw/pitch of a spring arm around the target. The arm
 * length and target height ease between "on foot" and "mounted" profiles,
 * and the camera never dips below the terrain. A small FOV boost while
 * galloping sells the speed.
 */

import * as THREE from 'three';
import { groundHeight } from '../world/terrain.js';

const PROFILES = {
  foot: { dist: 5.6, height: 1.7 },
  mounted: { dist: 8.8, height: 2.5 },
};

export class FollowCamera {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;
    this.yaw = Math.PI * 0.9; // start facing across the vale toward the lake
    this.pitch = 0.28;
    this.mode = 'foot';
    this.dist = PROFILES.foot.dist;
    this.height = PROFILES.foot.height;
    this.baseFov = camera.fov;
    this.fovBoost = 0;
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._first = true;
  }

  /** Horizontal forward direction of the camera (for movement input). */
  forwardXZ(target = new THREE.Vector3()) {
    return target.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  update(dt, targetPos, { fovBoost = 0 } = {}) {
    // Mouse look
    this.yaw -= this.input.mouseDX * 0.0022;
    this.pitch += this.input.mouseDY * 0.0018;
    this.pitch = Math.max(-0.25, Math.min(1.25, this.pitch));

    // Ease the rig between profiles
    const profile = PROFILES[this.mode];
    const k = 1 - Math.exp(-dt * 5);
    this.dist += (profile.dist - this.dist) * k;
    this.height += (profile.height - this.height) * k;

    // Spring-arm position behind the target
    const cp = Math.cos(this.pitch);
    const arm = new THREE.Vector3(
      Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cp,
    ).multiplyScalar(this.dist);

    this._look.copy(targetPos);
    this._look.y += this.height;

    this._pos.copy(this._look).add(arm);
    // Keep the camera out of the snow
    const minY = groundHeight(this._pos.x, this._pos.z) + 0.45;
    if (this._pos.y < minY) this._pos.y = minY;

    if (this._first) {
      this.camera.position.copy(this._pos);
      this._first = false;
    } else {
      // Exponential smoothing — frame-rate independent damping
      this.camera.position.lerp(this._pos, 1 - Math.exp(-dt * 9));
    }
    this.camera.lookAt(this._look);

    // Speed FOV
    this.fovBoost += (fovBoost - this.fovBoost) * (1 - Math.exp(-dt * 3));
    const fov = this.baseFov + this.fovBoost;
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
