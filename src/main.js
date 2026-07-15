// Loop, composer, resize (GDD 2.2). Fixed-timestep physics decoupled from
// render rate (GDD 2.1): the accumulator runs 60hz ticks regardless of
// display refresh. Zero allocation inside the frame loop — everything the
// loop touches is preallocated at module scope.
//
// Composer chain (GDD 4.4, 4.5):
//   world render -> lensing -> cockpit overlay -> bloom -> aberration -> out
// The cockpit is composited AFTER lensing so the interior never warps, and
// BEFORE bloom with a threshold high enough that only stars, the accretion
// disk, and the photon ring glow.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { C } from './constants.js';
import { initInput, input } from './input.js';
import { ship, stepShip } from './ship.js';
import { addBody } from './gravity.js';
import { addShiftable, updateOrigin, originOffset } from './origin.js';
import { camera, updateCamera, resizeCamera } from './camera.js';
import { initTuning } from './tuning.js';
import { initStarfield, updateStarfield } from './starfield.js';
import { initNebula, updateNebula } from './nebula.js';
import { cockpitScene, updateCockpit, CockpitOverlayPass } from './cockpit.js';
import { initBlackHole, updateBlackHole, blackhole } from './blackhole.js';
import lensingFrag from './shaders/lensing.frag?raw';
import aberrationFrag from './shaders/aberration.frag?raw';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// --- test mass (GDD 3.5) — kept from Phase 1 as the orbit/tuning target ---
const testMass = new THREE.Mesh(
  new THREE.SphereGeometry(C.TEST_MASS_RADIUS, 48, 32),
  new THREE.MeshBasicMaterial({ color: 0x88aaff, wireframe: true })
);
testMass.position.set(0, 0, -C.START_DISTANCE);
scene.add(testMass);
addBody({ position: testMass.position, mass: C.TEST_MASS, radius: C.TEST_MASS_RADIUS });
addShiftable(testMass);

// --- phase 2 environment ---
initNebula(scene);
initStarfield(scene);
initBlackHole(scene);

initInput(renderer.domElement);
initTuning();

// --- composer (GDD 4.4) ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const lensPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uBH: { value: new THREE.Vector2() },
    uRh: { value: 0 },
    uAspect: { value: window.innerWidth / window.innerHeight },
    uStrength: { value: C.LENS_STRENGTH },
    uEnabled: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: lensingFrag,
});
composer.addPass(lensPass);

composer.addPass(new CockpitOverlayPass(cockpitScene, camera));

// Half-resolution internal targets: bloom is a blur, so this is visually
// indistinguishable and ~4x cheaper — the fps budget (GDD 2.1) goes to the
// scene, not the glow.
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
  C.BLOOM_STRENGTH,
  C.BLOOM_RADIUS,
  C.BLOOM_THRESHOLD
);
// composer.addPass/setSize push the full size into every pass — keep bloom
// at half by intercepting.
const bloomSetSize = bloomPass.setSize.bind(bloomPass);
bloomPass.setSize = (w, h) => bloomSetSize(w / 2, h / 2);
composer.addPass(bloomPass);

const aberrationPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: aberrationFrag,
});
composer.addPass(aberrationPass);
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  resizeCamera();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  lensPass.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
});

// --- dev-only debug handle, for headless verification and tuning ---
// Stripped from production along with the branch that reads it.
let debug = null;
if (import.meta.env.DEV) {
  const frameTimes = new Float64Array(240);
  let frameCount = 0;
  debug = {
    ship,
    C,
    input,
    camera,
    testMass,
    blackhole,
    originOffset,
    paused: false,
    // Run n physics ticks synchronously (origin maintenance included).
    step(n = 1) {
      for (let i = 0; i < n; i++) {
        stepShip(DT);
        updateOrigin(ship);
      }
    },
    recordFrame(delta) {
      frameTimes[frameCount % frameTimes.length] = delta;
      frameCount++;
    },
    fps() {
      const n = Math.min(frameCount, frameTimes.length);
      if (n === 0) return 0;
      let sum = 0;
      for (let i = 0; i < n; i++) sum += frameTimes[i];
      return n / sum;
    },
  };
  window.__debug = debug;
}

const DT = 1 / 60;
const MAX_FRAME_DELTA = 0.1; // tab-switch guard: never spiral the accumulator
let last = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let delta = (now - last) / 1000;
  last = now;
  if (delta > MAX_FRAME_DELTA) delta = MAX_FRAME_DELTA;
  if (debug) {
    debug.recordFrame(delta);
    if (debug.paused) delta = 0;
  }
  accumulator += delta;
  while (accumulator >= DT) {
    stepShip(DT);
    accumulator -= DT;
  }
  updateOrigin(ship);
  updateCamera(ship);
  updateCockpit(ship);
  updateStarfield(camera, renderer.getPixelRatio());
  updateNebula(camera);
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert(); // fresh for projection
  updateBlackHole(camera, lensPass.uniforms, now / 1000);

  // live panel bindings (GDD 2.3): cheap scalar copies each frame
  bloomPass.threshold = C.BLOOM_THRESHOLD;
  bloomPass.strength = C.BLOOM_STRENGTH;
  bloomPass.radius = C.BLOOM_RADIUS;
  aberrationPass.uniforms.uStrength.value = (C.CA_STRENGTH * 8.0) / window.innerHeight;

  composer.render();
}
requestAnimationFrame(frame);
