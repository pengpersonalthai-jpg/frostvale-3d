/**
 * Post-processing chain: render → bloom → output (tone mapping + sRGB).
 *
 * Bloom threshold sits just above "lit snow" brightness so only genuinely
 * hot pixels glow: the moon, aurora, fire, lantern, crystals, ice sparkles.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function createPostFX(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.55, // strength — soft haze, not a smear
    0.65, // radius
    0.85, // threshold — snow stays crisp, emitters glow
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize(width, height) {
    composer.setSize(width, height);
  }

  return { composer, bloom, resize };
}
