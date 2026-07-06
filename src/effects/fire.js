/**
 * Flickering fire light + rising flame particles + a soft glow sprite.
 * Used for the campfire; a particle-less variant lights the tower lantern.
 */

import * as THREE from 'three';
import { makeNoise2D } from '../world/noise.js';

const flickerNoise = makeNoise2D(555);

/** Radial-gradient sprite texture generated on a canvas (no asset files). */
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 190, 110, 0.85)');
  grad.addColorStop(0.4, 'rgba(255, 140, 50, 0.28)');
  grad.addColorStop(1, 'rgba(255, 100, 20, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
let glowTexture = null;

export function createFire(position, {
  particles = true,
  lightIntensity = 34,
  lightDistance = 46,
  color = 0xff9a3c,
  scale = 1,
} = {}) {
  const group = new THREE.Group();
  group.position.copy(position);

  const light = new THREE.PointLight(color, lightIntensity, lightDistance, 2);
  light.position.y = 0.9 * scale;
  group.add(light);

  // Soft glow sprite — cheap volumetric-ish halo, boosted by bloom
  if (!glowTexture) glowTexture = makeGlowTexture();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  }));
  glow.scale.setScalar(5 * scale);
  glow.position.y = 0.8 * scale;
  group.add(glow);

  // Bright ember bed so bloom has a hot core to bite on
  const embers = new THREE.Mesh(
    new THREE.CircleGeometry(0.55 * scale, 10),
    new THREE.MeshBasicMaterial({ color: 0xffc069 }),
  );
  embers.rotation.x = -Math.PI / 2;
  embers.position.y = 0.12 * scale;
  if (particles) group.add(embers);

  // Flame particles: life cycle handled entirely in the shader via fract()
  let flameUniforms = null;
  if (particles) {
    const COUNT = 70;
    const seeds = new Float32Array(COUNT);
    const positions = new Float32Array(COUNT * 3); // dummy, real pos in shader
    for (let i = 0; i < COUNT; i++) seeds[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 4 * scale);

    flameUniforms = { uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: flameUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        varying float vLife;
        void main() {
          // 0 → 1 life cycle, offset per particle
          float life = fract(uTime * (0.55 + aSeed * 0.6) + aSeed * 11.0);
          vLife = life;
          float ang = aSeed * 40.0;
          float wobble = (1.0 - life) * 0.3;
          vec3 p = vec3(
            sin(ang + life * 7.0) * wobble,
            0.25 + life * 2.0,
            cos(ang * 1.3 + life * 6.0) * wobble
          );
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float dist = max(-mv.z, 0.1);
          gl_PointSize = (1.0 - life * 0.7) * (300.0 / dist);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vLife;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.1, d) * (1.0 - vLife) * 0.85;
          // yellow core → orange → deep red as the particle rises
          vec3 col = mix(vec3(1.0, 0.85, 0.35), vec3(0.85, 0.25, 0.05), smoothstep(0.0, 0.75, vLife));
          gl_FragColor = vec4(col * 1.8, a);
        }
      `,
    });
    const flames = new THREE.Points(geo, mat);
    flames.scale.setScalar(scale);
    group.add(flames);
  }

  const baseIntensity = lightIntensity;
  function update(t) {
    // Two noise octaves make the flicker feel organic, not sinusoidal
    const n = flickerNoise(t * 3.1, 0.5) * 0.6 + flickerNoise(t * 9.7, 7.7) * 0.4;
    light.intensity = baseIntensity * (0.82 + 0.25 * n);
    glow.material.opacity = 0.75 + 0.2 * n;
    if (flameUniforms) flameUniforms.uTime.value = t;
  }

  return { group, update, light };
}
