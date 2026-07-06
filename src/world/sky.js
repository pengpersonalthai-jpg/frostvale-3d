/**
 * Night sky: gradient dome, star field, moon disc + halo, and an animated
 * aurora ("the Veil"). All sky materials opt out of scene fog — fog on the
 * dome would flatten the whole horizon to one colour.
 */

import * as THREE from 'three';
import { GLSL_NOISE } from '../shaders/glslNoise.js';

// Direction TO the moon; the directional light in main.js matches this.
export const MOON_DIR = new THREE.Vector3(-0.45, 0.62, -0.55).normalize();

export function createSky() {
  const group = new THREE.Group();
  group.name = 'sky';
  const updaters = [];

  // ---- Gradient dome --------------------------------------------------------
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        float y = clamp(vDir.y, 0.0, 1.0);
        vec3 zenith = vec3(0.010, 0.014, 0.042);      // near-black indigo
        vec3 horizon = vec3(0.085, 0.10, 0.21);       // cold blue glow
        vec3 col = mix(horizon, zenith, pow(y, 0.55));
        // Faint violet band just above the horizon — "afterdusk"
        col += vec3(0.05, 0.02, 0.07) * exp(-pow((vDir.y - 0.06) * 9.0, 2.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2300, 32, 16), domeMat);
  group.add(dome);

  // ---- Stars ----------------------------------------------------------------
  const STAR_COUNT = 1600;
  const starPos = new Float32Array(STAR_COUNT * 3);
  const starSeed = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i++) {
    // Random points on the upper hemisphere
    const theta = Math.random() * Math.PI * 2;
    const y = Math.pow(Math.random(), 0.6); // bias toward zenith
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    starPos[i * 3] = Math.cos(theta) * r * 2200;
    starPos[i * 3 + 1] = 60 + y * 2200;
    starPos[i * 3 + 2] = Math.sin(theta) * r * 2200;
    starSeed[i] = Math.random();
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('aSeed', new THREE.BufferAttribute(starSeed, 1));
  const starMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      varying float vTwinkle;
      void main() {
        vTwinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed * 2.2) + aSeed * 40.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (1.2 + aSeed * 2.4) * vTwinkle + 1.0;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vTwinkle;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.1, d) * vTwinkle;
        gl_FragColor = vec4(vec3(0.75, 0.82, 1.0), a * 0.9);
      }
    `,
  });
  const stars = new THREE.Points(starGeo, starMat);
  group.add(stars);
  updaters.push((t) => { starMat.uniforms.uTime.value = t; });

  // ---- Moon (disc + soft halo; bloom does the rest) --------------------------
  const moonPos = MOON_DIR.clone().multiplyScalar(2000);
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(58, 40),
    new THREE.MeshBasicMaterial({ color: 0xe8effc, fog: false }),
  );
  moon.position.copy(moonPos);
  moon.lookAt(0, 0, 0);
  group.add(moon);

  const haloMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = exp(-d * 4.5) * 0.55;
        gl_FragColor = vec4(vec3(0.65, 0.75, 1.0), a);
      }
    `,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), haloMat);
  halo.position.copy(moonPos);
  halo.lookAt(0, 0, 0);
  group.add(halo);

  // ---- Aurora — "the Veil" ----------------------------------------------------
  // Two big additive ribbons high above the peaks. The fragment shader draws
  // drifting vertical curtains with a green→teal→violet ramp; vertices also
  // ripple slightly so the silhouette isn't a static rectangle.
  const auroraMat = (seedOffset) => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: { uTime: { value: 0 }, uSeed: { value: seedOffset } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uSeed;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        // Slow large-scale ripple along the ribbon
        p.y += sin(uv.x * 9.0 + uTime * 0.22 + uSeed) * 16.0;
        p.z += sin(uv.x * 5.0 + uTime * 0.13 + uSeed * 2.0) * 22.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uSeed;
      varying vec2 vUv;
      ${GLSL_NOISE}
      void main() {
        // Curtain folds drift sideways over time
        float x = vUv.x * 5.0 + uSeed;
        float folds = fbm(vec2(x * 1.6 + uTime * 0.05, uTime * 0.02 + uSeed));
        float curtain = fbm(vec2(x * 6.0 - uTime * 0.04, folds * 2.0));

        // Vertical shape: bright at the bottom edge, fading upward
        float yy = clamp(vUv.y + (folds - 0.5) * 0.35, 0.0, 1.0);
        float shape = smoothstep(0.02, 0.14, yy) * pow(1.0 - yy, 1.7);

        vec3 low = vec3(0.05, 0.85, 0.45);   // green base
        vec3 mid = vec3(0.10, 0.55, 0.65);   // teal
        vec3 high = vec3(0.42, 0.18, 0.70);  // violet crown
        vec3 col = mix(low, mid, smoothstep(0.0, 0.45, yy));
        col = mix(col, high, smoothstep(0.4, 0.95, yy));

        float a = shape * (0.25 + 0.75 * curtain) * 0.5;
        gl_FragColor = vec4(col * 1.6, a);
      }
    `,
  });

  const ribbonGeo = new THREE.PlaneGeometry(2000, 340, 96, 8);
  const ribbon1 = new THREE.Mesh(ribbonGeo, auroraMat(0));
  ribbon1.position.set(-150, 470, -750);
  ribbon1.rotation.y = 0.35;
  group.add(ribbon1);

  const ribbon2 = new THREE.Mesh(ribbonGeo, auroraMat(5.2));
  ribbon2.position.set(350, 560, -950);
  ribbon2.rotation.y = -0.2;
  ribbon2.scale.set(1.25, 1.25, 1);
  group.add(ribbon2);

  updaters.push((t) => {
    ribbon1.material.uniforms.uTime.value = t;
    ribbon2.material.uniforms.uTime.value = t;
  });

  function update(t) {
    for (const fn of updaters) fn(t);
  }

  return { group, update };
}
