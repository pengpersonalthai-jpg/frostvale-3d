/**
 * The frozen water surface (Mirrormere + Palefrost Run).
 *
 * Trick: this is ONE big plane at ICE_LEVEL spanning the whole terrain.
 * The height function only dips below ICE_LEVEL inside the carved river
 * and lake beds, so the plane is buried everywhere else — the visible ice
 * exactly matches the water bodies with zero masking work.
 *
 * The shader fakes "deep ice": dark blue depth mottling, frozen crack
 * veins, a moon specular streak, fresnel rim toward grazing angles, and
 * sparse twinkling glints that the bloom pass picks up.
 */

import * as THREE from 'three';
import { ICE_LEVEL } from './terrain.js';
import { GLSL_NOISE } from '../shaders/glslNoise.js';

export function createIce(moonDir) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uMoonDir: { value: moonDir.clone().normalize() },
    },
  ]);

  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true, // participate in scene fog like every other surface
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec3 uCamPos;
      uniform vec3 uMoonDir;
      varying vec3 vWorldPos;
      ${GLSL_NOISE}
      void main() {
        vec3 V = normalize(uCamPos - vWorldPos);

        // Depth mottling: dark "deep water" patches locked under the ice
        float depthPattern = fbm(vWorldPos.xz * 0.02);
        vec3 deep = vec3(0.012, 0.035, 0.07);
        vec3 shallow = vec3(0.07, 0.14, 0.24);
        vec3 col = mix(deep, shallow, depthPattern);

        // Frozen crack veins: thin bright lines where an fbm crosses zero
        float vein = fbm(vWorldPos.xz * 0.055 + 7.3) - 0.5;
        float crack = 1.0 - smoothstep(0.0, 0.035, abs(vein));
        col += crack * vec3(0.25, 0.38, 0.52) * 0.55;

        // Finer secondary cracks
        float vein2 = fbm(vWorldPos.xz * 0.16 + 31.7) - 0.5;
        col += (1.0 - smoothstep(0.0, 0.02, abs(vein2))) * vec3(0.12, 0.18, 0.26);

        // Fresnel: pale sheen toward grazing angles (skating-rink shine)
        float fres = pow(1.0 - max(dot(V, vec3(0.0, 1.0, 0.0)), 0.0), 3.0);
        col += fres * vec3(0.13, 0.19, 0.31);

        // Fake moon specular on the flat sheet
        vec3 H = normalize(V + normalize(uMoonDir));
        float spec = pow(max(H.y, 0.0), 380.0);
        col += spec * vec3(0.85, 0.95, 1.15);

        // Twinkling frost glints: small dots inside a fine grid, a few lit
        // at a time — bright enough to feed the bloom pass
        vec2 sp = vWorldPos.xz * 9.0;
        vec2 cell = floor(sp);
        vec2 f = fract(sp) - 0.5;
        float tw = hash21(cell);
        float lit = step(0.965, fract(tw * 7.31 + uTime * 0.1 + tw));
        float dotMask = smoothstep(0.3, 0.05, length(f));
        col += lit * dotMask * step(0.4, tw) * vec3(1.3, 1.5, 1.8);

        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = ICE_LEVEL;
  mesh.name = 'ice';

  function update(t, cameraPos) {
    uniforms.uTime.value = t;
    uniforms.uCamPos.value.copy(cameraPos);
  }

  return { mesh, update };
}
