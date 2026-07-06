/**
 * Falling snow + ground frost glints.
 *
 * The snowfall is fully GPU-driven: particle base positions are static
 * attributes and the vertex shader wraps them into a box that follows the
 * camera (mod-space trick). The CPU only updates two uniforms per frame,
 * so 4000 flakes cost essentially nothing.
 */

import * as THREE from 'three';
import { groundHeight } from '../world/terrain.js';

export function createSnowfall() {
  const COUNT = 4000;
  const BOX = new THREE.Vector3(220, 120, 220);

  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  const size = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = Math.random() * BOX.x;
    pos[i * 3 + 1] = Math.random() * BOX.y;
    pos[i * 3 + 2] = Math.random() * BOX.z;
    seed[i] = Math.random();
    size[i] = 0.6 + Math.random() * 1.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  // The particles wrap around the camera, so cull nothing:
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const uniforms = {
    uTime: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      attribute float aSize;
      uniform float uTime;
      uniform vec3 uCamPos;
      varying float vAlpha;
      const vec3 BOX = vec3(${BOX.x.toFixed(1)}, ${BOX.y.toFixed(1)}, ${BOX.z.toFixed(1)});
      void main() {
        vec3 p = position;
        // Fall + lazy sideways drift, speed varies per flake
        p.y -= uTime * (7.0 + aSeed * 8.0);
        p.x += sin(uTime * (0.4 + aSeed * 0.5) + aSeed * 43.0) * 7.0 + uTime * 1.5;
        p.z += cos(uTime * (0.3 + aSeed * 0.4) + aSeed * 17.0) * 5.0;
        // Wrap into a camera-centred box (GLSL mod handles negatives)
        vec3 rel = mod(p - uCamPos, BOX);
        vec3 world = uCamPos + rel - BOX * 0.5;
        vec4 mv = viewMatrix * vec4(world, 1.0);
        float dist = max(-mv.z, 0.1);
        gl_PointSize = aSize * (160.0 / dist);
        // Fade flakes that are extremely close so they don't flash the screen
        vAlpha = smoothstep(1.0, 6.0, dist) * 0.9;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.12, d) * vAlpha;
        gl_FragColor = vec4(vec3(0.82, 0.88, 1.0), a);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'snowfall';

  function update(t, cameraPos) {
    uniforms.uTime.value = t;
    uniforms.uCamPos.value.copy(cameraPos);
  }

  return { points, update };
}

/**
 * Frost glints: tiny additive sparkles lying on the snow surface around the
 * central valley. They twinkle in and out — with bloom they read as
 * moonlight catching ice crystals in the snowpack.
 */
export function createSnowGlints() {
  const COUNT = 900;
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  let placed = 0;
  let guard = 0;
  while (placed < COUNT && guard++ < 20000) {
    const x = (Math.random() - 0.5) * 700;
    const z = (Math.random() - 0.5) * 700;
    const h = groundHeight(x, z);
    pos[placed * 3] = x;
    pos[placed * 3 + 1] = h + 0.06;
    pos[placed * 3 + 2] = z;
    seed[placed] = Math.random();
    placed++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

  const uniforms = { uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      varying float vA;
      void main() {
        // Each glint flashes briefly on its own cycle
        float cycle = fract(uTime * (0.05 + aSeed * 0.12) + aSeed * 9.0);
        vA = smoothstep(0.0, 0.1, cycle) * smoothstep(0.25, 0.12, cycle);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float dist = max(-mv.z, 0.1);
        gl_PointSize = (2.0 + aSeed * 3.0) * (60.0 / dist) * vA;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d) * vA;
        gl_FragColor = vec4(vec3(1.3, 1.5, 1.8), a);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.name = 'glints';

  function update(t) { uniforms.uTime.value = t; }
  return { points, update };
}
