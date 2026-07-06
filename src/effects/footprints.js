/**
 * Footprint / hoofprint decals in the snow.
 *
 * One InstancedMesh (single draw call) acts as a ring buffer of print quads.
 * Per-instance birth times go in an instanced attribute so the fade-out is
 * computed in the shader — the CPU only writes a matrix when a print is
 * stamped, never per frame.
 */

import * as THREE from 'three';

const MAX_PRINTS = 128;
const LIFETIME = 16; // seconds before a print is fully buried by snow

export class FootprintPool {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);

    const births = new Float32Array(MAX_PRINTS).fill(-1e9);
    geo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(births, 1));
    this.births = geo.attributes.aBirth;

    this.uniforms = { uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aBirth;
        uniform float uTime;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          vUv = uv;
          vFade = 1.0 - clamp((uTime - aBirth) / ${LIFETIME.toFixed(1)}, 0.0, 1.0);
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vFade;
        void main() {
          // Soft oval depression, slightly blue like compacted snow
          vec2 d = (vUv - 0.5) * vec2(2.6, 2.0);
          float mask = smoothstep(1.0, 0.45, length(d));
          gl_FragColor = vec4(vec3(0.42, 0.5, 0.68), mask * vFade * 0.42);
        }
      `,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_PRINTS);
    this.mesh.frustumCulled = false;
    // Park all instances underground until they're stamped
    const hidden = new THREE.Matrix4().makeTranslation(0, -1000, 0);
    for (let i = 0; i < MAX_PRINTS; i++) this.mesh.setMatrixAt(i, hidden);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.cursor = 0;
    this.now = 0;
    this._dummy = new THREE.Object3D();
    scene.add(this.mesh);
  }

  /** Stamp a print at (x, z) on ground height y, facing `yaw`. */
  stamp(x, y, z, yaw, width = 0.24, length = 0.4) {
    const d = this._dummy;
    d.position.set(x, y + 0.03, z);
    d.rotation.set(0, yaw, 0);
    d.scale.set(width, 1, length);
    d.updateMatrix();
    this.mesh.setMatrixAt(this.cursor, d.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.births.setX(this.cursor, this.now);
    this.births.needsUpdate = true;
    this.cursor = (this.cursor + 1) % MAX_PRINTS;
  }

  update(t) {
    this.now = t;
    this.uniforms.uTime.value = t;
  }
}
