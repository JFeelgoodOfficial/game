// Loop, renderer, resize (GDD 2.2). Fixed-timestep physics decoupled from
// render rate (GDD 2.1): the accumulator runs 60hz ticks regardless of
// display refresh. Zero allocation inside the frame loop — everything the
// loop touches is preallocated at module scope.

import * as THREE from 'three';
import { C } from './constants.js';
import { initInput, input } from './input.js';
import { ship, stepShip } from './ship.js';
import { addBody } from './gravity.js';
import { addShiftable, updateOrigin, originOffset } from './origin.js';
import { camera, updateCamera, resizeCamera } from './camera.js';
import { initTuning } from './tuning.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// --- Phase 1 test scene: a single test mass (GDD 3.5) ---
// A wireframe sphere: reads clearly against black with no lighting system,
// and the moving wire grid is the only parallax reference Phase 1 needs.
// Its mesh position vector is shared with its gravity body, so one origin
// registration covers both.
const testMass = new THREE.Mesh(
  new THREE.SphereGeometry(C.TEST_MASS_RADIUS, 48, 32),
  new THREE.MeshBasicMaterial({ color: 0x88aaff, wireframe: true })
);
testMass.position.set(0, 0, -C.START_DISTANCE);
scene.add(testMass);
addBody({ position: testMass.position, mass: C.TEST_MASS, radius: C.TEST_MASS_RADIUS });
addShiftable(testMass);

initInput(renderer.domElement);
initTuning();

window.addEventListener('resize', () => {
  resizeCamera();
  renderer.setSize(window.innerWidth, window.innerHeight);
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
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
