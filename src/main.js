/**
 * Frostvale — entry point.
 *
 * Builds the renderer, lights, world, effects and gameplay systems, then
 * runs the frame loop. Everything in the world is procedural; there are no
 * asset downloads, so startup is instant.
 */

import * as THREE from 'three';

import {
  createTerrain, groundHeight, groundHeightUnder, BRIDGES, TUNNEL, CAMP,
} from './world/terrain.js';
import { createForest, forestUniforms } from './world/forest.js';
import { createScatter } from './world/scatter.js';
import { createAnimals } from './world/animals.js';
import { createIce } from './world/ice.js';
import { createSky, MOON_DIR } from './world/sky.js';
import { createRuins } from './world/ruins.js';

import { createSnowfall, createSnowGlints } from './effects/snow.js';
import { createFire } from './effects/fire.js';
import { FootprintPool } from './effects/footprints.js';
import { createPostFX } from './effects/postfx.js';

import { Input } from './controls/input.js';
import { FollowCamera } from './controls/camera.js';
import { Player } from './controls/player.js';
import { MountSystem } from './mount/riding.js';
import { UI } from './ui.js';

// ---- Renderer ---------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
// Cap pixel ratio at 2: 3× DPR screens pay a huge fill-rate cost for
// invisible gains, especially with post-processing in the chain.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// Exponential fog: cold blue murk that swallows the far shore of the vale
scene.fog = new THREE.FogExp2(0x0d1524, 0.0031);

const camera = new THREE.PerspectiveCamera(
  62, window.innerWidth / window.innerHeight, 0.1, 5000,
);

// ---- Lighting -----------------------------------------------------------------

// Moonlight: one cool directional light, the only shadow-caster.
const moon = new THREE.DirectionalLight(0x9db8ff, 1.35);
moon.position.copy(MOON_DIR).multiplyScalar(160);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
// Tight shadow frustum re-centred on the player every frame — far better
// texel density than one giant frustum covering the whole valley.
const SHADOW_RADIUS = 70;
moon.shadow.camera.left = -SHADOW_RADIUS;
moon.shadow.camera.right = SHADOW_RADIUS;
moon.shadow.camera.top = SHADOW_RADIUS;
moon.shadow.camera.bottom = -SHADOW_RADIUS;
moon.shadow.camera.near = 1;
moon.shadow.camera.far = 420;
moon.shadow.bias = -0.0006;
scene.add(moon);
scene.add(moon.target);

// Ambient: hemisphere = starlit sky above, snow bounce below
scene.add(new THREE.HemisphereLight(0x37436e, 0x1d2333, 0.55));

// ---- World --------------------------------------------------------------------

scene.add(createTerrain());

const ice = createIce(MOON_DIR);
scene.add(ice.mesh);

const sky = createSky();
scene.add(sky.group);

const forest = createForest();
scene.add(forest.mesh);

const scatter = createScatter();
scene.add(scatter.group);

const ruins = createRuins();
scene.add(ruins.group);

// Campfire at Last Ember Camp + the lantern high in Aldwyn's Watch
const campfire = createFire(ruins.firePos);
scene.add(campfire.group);
const lantern = createFire(ruins.lanternPos, {
  particles: false, lightIntensity: 20, lightDistance: 34, color: 0xffb45e, scale: 0.6,
});
scene.add(lantern.group);

// ---- Effects ------------------------------------------------------------------

const snow = createSnowfall();
scene.add(snow.points);
const glints = createSnowGlints();
scene.add(glints.points);

const postfx = createPostFX(renderer, scene, camera);

// ---- Gameplay -----------------------------------------------------------------

const ui = new UI();
const input = new Input(renderer.domElement);
const followCam = new FollowCamera(camera, input);
const prints = new FootprintPool(scene);

const player = new Player(
  scene, input, followCam,
  { treeGrid: forest.grid, colliders: ruins.colliders },
  prints,
);
const mounts = new MountSystem(scene, input, followCam, player, ui, prints);

// Wildlife wanders whether or not the player is looking
const animals = createAnimals(scene, forest.grid);

ui.onEnterClick(() => input.requestLock());
input.onLockChange((locked) => ui.setPlaying(locked));

// ---- Resize -------------------------------------------------------------------

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postfx.resize(window.innerWidth, window.innerHeight);
});

// ---- Frame loop ----------------------------------------------------------------

const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  // Clamp dt so a background tab doesn't teleport the player on return
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // Gameplay (skip movement while the pause overlay is up, keep ambience alive)
  let camOpts = { fovBoost: 0 };
  if (input.locked) {
    camOpts = mounts.update(dt, t);
    player.update(dt, t);
  } else {
    // Horses keep grazing behind the pause screen
    for (const h of mounts.horses) h.animator.update(dt, t, 0, false);
  }
  followCam.update(dt, player.pos, camOpts);

  // Keep the moon's shadow frustum centred on the action
  moon.target.position.set(player.pos.x, player.pos.y, player.pos.z);
  moon.position.copy(moon.target.position).addScaledVector(MOON_DIR, 160);

  // Ambient animation
  animals.update(dt, t, player.pos);
  forestUniforms.uTime.value = t;
  sky.update(t);
  ice.update(t, camera.position);
  snow.update(t, camera.position);
  glints.update(t);
  scatter.update(t);
  campfire.update(t);
  lantern.update(t + 40); // offset so the two flames don't flicker in sync
  prints.update(t);

  postfx.composer.render();
  input.endFrame();
}

// Aim the spawn camera at the campfire + horses so the mount is the first
// thing a new player sees (the lake and aurora are one mouse-turn away)
player.pos.y = groundHeight(player.pos.x, player.pos.z);
const horseMid = new THREE.Vector3();
for (const h of mounts.horses) horseMid.add(h.pos);
horseMid.divideScalar(mounts.horses.length);
followCam.yaw = Math.atan2(player.pos.x - horseMid.x, player.pos.z - horseMid.z);
frame();

// Debug/test hook (also handy in the browser console: try
// __frostvale.mounts.horses[0].pos to find the horses).
window.__frostvale = {
  player, mounts, followCam, camera, scene, renderer, animals,
  world: { groundHeight, groundHeightUnder, BRIDGES, TUNNEL },
};
