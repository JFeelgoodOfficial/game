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
import { altitudeAboveFloor } from './gravity.js';
import { updateOrigin, originOffset, snapshotShiftables, restoreShiftables } from './origin.js';
import { camera, updateCamera, snapCamera, resizeCamera } from './camera.js';
import { initTuning } from './tuning.js';
import { initStarfield, updateStarfield } from './starfield.js';
import { initNebula, updateNebula } from './nebula.js';
import { cockpitScene, updateCockpit, cockpitGroup, CockpitOverlayPass } from './cockpit.js';
import { initCockpitFrame, updateCockpitFrame } from './cockpitFrame.js';
import {
  interiorScene,
  initInterior,
  updateInterior,
  updateWalkCamera,
  nearSeat,
  resetPlayer,
  playerState,
  setPrompt,
} from './interior.js';
import { initBlackHole, updateBlackHole, blackhole } from './blackhole.js';
import { initPlanets, updatePlanets, atmosphereAt, planets, SUN } from './planet.js';
import { initSun, sunAltitude } from './sun.js';
import { initStations, updateStations } from './stations.js';
import { initMenu, showMenu, hideMenu, updateHeatUI } from './menu.js';
import { startMusic, nextTrack, prevTrack, currentTitle } from './music.js';
import { initRadio, updateRadio } from './radio.js';
import { initNav, updateNav, navState } from './nav.js';
import lensingFrag from './shaders/lensing.frag?raw';
import aberrationFrag from './shaders/aberration.frag?raw';
import collapseFrag from './shaders/collapse.frag?raw';
import skyfogFrag from './shaders/skyfog.frag?raw';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// --- the planetary system (terra + gas giants; gravity/floor registered
// inside initPlanets) ---
initPlanets(scene);

// --- phase 2 environment ---
initNebula(scene);
initStarfield(scene);
initSun(scene);
initBlackHole(scene);
initStations(scene);

// Initial layout of everything origin-registered (planets, sun, stations,
// black hole), snapshotted so resets restore it exactly.
snapshotShiftables();

initInput(renderer.domElement);
initTuning();
initCockpitFrame();
initInterior();
initRadio();
initNav();

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

const cockpitPass = new CockpitOverlayPass(cockpitScene, camera);
composer.addPass(cockpitPass);

// The walkable interior rides the same overlay trick, right after the
// cockpit: disabled (zero cost) while seated, swapped in while standing.
const interiorPass = new CockpitOverlayPass(interiorScene, camera);
interiorPass.enabled = false;
composer.addPass(interiorPass);

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

// Atmospheric entry: washes the frame toward sky colour as the ship descends
// into the planet's air. Disabled above the atmosphere (zero cost).
const skyfogPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uAtmo: { value: 0 },
    uDay: { value: 0 },
    uSkyDay: { value: new THREE.Color(C.SKY_COLOR) },
    uDensity: { value: C.SKY_DENSITY },
    uUpView: { value: new THREE.Vector3(0, 1, 0) },
    uAspect: { value: window.innerWidth / window.innerHeight },
    uTanHalf: { value: Math.tan((C.FOV * Math.PI) / 360) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: skyfogFrag,
});
skyfogPass.enabled = false;
composer.addPass(skyfogPass);

// Horizon collapse: stretches the whole composited frame (cockpit included)
// when the ship falls into the black hole. Disabled — zero cost — until it
// fires (see the reset state machine below).
const collapsePass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uProgress: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: collapseFrag,
});
collapsePass.enabled = false;
composer.addPass(collapsePass);

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
    planets,
    blackhole,
    originOffset,
    paused: false,
    warpInfo: () => ({ phase, warp, heat }),
    walk: {
      playerState,
      isStanding: () => standing,
      blend: () => standBlend,
      stand: () => { if (phase === 'fly' && !input.warp) standing = true; },
      sit: () => { standing = false; },
    },
    radio: { nextTrack, prevTrack, currentTitle },
    navState,
    launch: () => {
      resetToStart();
      accumulator = 0;
      phase = 'fly';
      hideMenu();
      startMusic();
    },
    // Run n physics ticks synchronously (origin maintenance included).
    // Honors the out-of-seat state like the real loop does.
    step(n = 1) {
      for (let i = 0; i < n; i++) {
        stepShip(DT, standBlend < 0.2);
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
const _up = new THREE.Vector3(); // scratch: planet→camera ("up"), for atmosphere
const _invQuat = new THREE.Quaternion();
const _atmo = { p: null, atmo: 0, altitude: 0, upX: 0, upY: 0, upZ: 0 };
let last = performance.now();
let accumulator = 0;

// --- game state machine ---
// 'menu' (start or ship-lost) -> 'fly'.
// From fly: cross the black hole horizon -> 'collapse' (stretch) -> reset ->
// 'respawn' (unwind) -> 'fly' (the loop, beyond GDD 4.5); or hull heat hits
// 1 -> 'explode' (flash + shake) -> menu (death, overriding GDD 1.2 at the
// user's request). Physics is frozen in every state but 'fly'.
let phase = 'menu';
let warpT = 0;
let warp = 0; // collapse pass progress, 0..1
let heat = 0; // hull heat, 0..1
let deathReason = ''; // set when the burn wins; shown on the menu
// Out-of-seat sub-mode within 'fly' (interior.js): the ship coasts on
// attitude hold while the pilot walks the corridor. Not a phase — heat,
// capture, nav, and the accumulator must all keep running.
let standing = false;
let standBlend = 0; // seat <-> stand camera blend, 0..1
let promptTimer = 0; // shows "G — STAND" briefly after each launch

function resetToStart() {
  ship.position.set(0, 0, 0);
  ship.velocity.set(0, 0, 0);
  ship.quaternion.identity();
  ship.angularVelocity.set(0, 0, 0);
  ship.properAccel.set(0, 0, 0);
  restoreShiftables(); // planets, sun, stations, black hole + origin offset
  heat = 0;
  standing = false;
  standBlend = 0;
  promptTimer = 6; // remind the pilot the corridor exists
  resetPlayer();
  input.interactPressed = false;
  // snap the lagging camera to the ship so it doesn't slerp from the horizon
  snapCamera(ship);
}

initMenu(() => {
  resetToStart();
  accumulator = 0;
  phase = 'fly';
  hideMenu();
  startMusic(); // user's track, from the LAUNCH click gesture
  renderer.domElement.requestPointerLock?.();
});

function frame(now) {
  requestAnimationFrame(frame);
  let delta = (now - last) / 1000;
  last = now;
  if (delta > MAX_FRAME_DELTA) delta = MAX_FRAME_DELTA;
  if (debug) {
    debug.recordFrame(delta);
    if (debug.paused) delta = 0;
  }

  let flashAmt = 0;
  if (phase === 'fly') {
    // G: stand up out of the seat / sit back down at it. Standing is
    // blocked at warp (nobody walks at 10,000 u/s); sitting requires being
    // back at the chair.
    if (input.interactPressed) {
      input.interactPressed = false;
      if (!standing && !input.warp) standing = true;
      else if (standing && nearSeat()) standing = false;
    }
    standBlend = Math.min(
      Math.max(standBlend + ((standing ? 1 : -1) * delta) / C.STAND_TIME, 0),
      1
    );
    // Controls disengage early in the rise; the walk controller owns the
    // mouse from the same threshold, so it has exactly one consumer.
    const piloted = standBlend < 0.2;
    accumulator += delta;
    while (accumulator >= DT) {
      stepShip(DT, piloted);
      accumulator -= DT;
    }
    if (ship.position.distanceTo(blackhole.group.position) < C.HORIZON_CAPTURE) {
      phase = 'collapse';
      warpT = 0;
    }
    // hull heat: builds while pressed against a planet's floor, and much
    // faster near the sun; cools when clear (user mechanic — death overrides
    // GDD 1.2 by request). Timeline: 3s warning, then a 3s cockpit countdown,
    // then the hull fails.
    const overFloor = altitudeAboveFloor(ship.position);
    const nearSun = sunAltitude(ship.position) < C.SUN_RADIUS * 0.5;
    const heatTotal = C.HEAT_WARN_TIME + C.HEAT_COUNTDOWN;
    if (nearSun) {
      heat += (delta / heatTotal) * C.SUN_BURN_MULT;
      deathReason = 'INCINERATED — FLEW INTO THE SUN';
    } else if (overFloor < C.HEAT_ALTITUDE) {
      heat += delta / heatTotal;
      deathReason = 'RE-ENTRY FAILURE — HULL DESTROYED';
    } else {
      heat -= delta / C.HEAT_COOL;
    }
    heat = Math.min(Math.max(heat, 0), 1);
    if (heat >= 1) {
      phase = 'explode';
      warpT = 0;
    }
  } else if (phase === 'collapse') {
    warpT += delta;
    warp = Math.min(warpT / C.COLLAPSE_TIME, 1);
    if (warpT >= C.COLLAPSE_TIME) {
      resetToStart();
      phase = 'respawn';
      warpT = 0;
      accumulator = 0;
    }
  } else if (phase === 'respawn') {
    // unwind the stretch to reveal the fresh start
    warpT += delta;
    warp = 1 - Math.min(warpT / C.RESPAWN_TIME, 1);
    if (warpT >= C.RESPAWN_TIME) {
      phase = 'fly';
      warp = 0;
    }
  } else if (phase === 'explode') {
    warpT += delta;
    flashAmt = Math.min(warpT / (C.EXPLODE_TIME * 0.35), 1);
    if (warpT >= C.EXPLODE_TIME) {
      phase = 'menu';
      showMenu('dead', deathReason);
    }
  }
  // menu phase: nothing to advance; the scene idles as a backdrop.
  collapsePass.enabled = warp > 0.001;
  collapsePass.uniforms.uProgress.value = warp;
  // heat 0..0.5 = warning banner; 0.5..1 = the flashing cockpit countdown
  const heatShown = phase === 'menu' ? 0 : heat;
  const countdownLeft =
    phase === 'fly' && heat >= 0.5
      ? (1 - heat) * (C.HEAT_WARN_TIME + C.HEAT_COUNTDOWN)
      : phase === 'explode'
        ? 0.4 // hold "1" through the flash
        : null;
  updateHeatUI(heatShown, C.CRACK_AT, flashAmt, countdownLeft);

  updateOrigin(ship);
  updateCamera(ship);
  // interior rides the ship; the walk camera blends over the seated pose
  // (shake and turbulence below still add on top — the corridor rattles too)
  updateInterior(ship);
  updateWalkCamera(ship, delta, standBlend, standBlend >= 0.2 && phase === 'fly');
  // hull-stress shake: time-hashed jitter, ramping in past half heat
  const shake = Math.max(heat - 0.5, 0) * 2 + (phase === 'explode' ? 1.5 : 0);
  if (shake > 0) {
    const s = shake * 0.02;
    camera.position.x += Math.sin(now * 0.093) * s;
    camera.position.y += Math.sin(now * 0.127 + 2.1) * s;
    camera.position.z += Math.sin(now * 0.071 + 4.4) * s;
  }
  updateCockpit(ship);
  // The instrument cockpit is the resting view; boost/warp fades it out for
  // the clear window (inverted at the user's request). The dashboard
  // consoles (radio, NAV) ride the same fade — they live on the dash.
  const frameBlend = updateCockpitFrame(ship, delta, phase !== 'menu', standBlend);
  // standing swaps the seated canopy overlay for the interior overlay
  interiorPass.enabled = standBlend > 0.001;
  cockpitPass.enabled = !interiorPass.enabled;
  cockpitGroup.visible = frameBlend < 0.3;
  updateRadio(frameBlend, phase === 'fly');
  // the G prompt: a launch reminder while seated, "SIT" back at the chair
  if (phase === 'fly') {
    if (standing) {
      setPrompt(standBlend > 0.5 && nearSeat() ? 'G — SIT' : null);
    } else {
      setPrompt(promptTimer > 0 ? 'G — STAND UP' : null);
      if (promptTimer > 0) promptTimer -= delta;
    }
  } else {
    setPrompt(null);
  }
  updateStarfield(camera, renderer.getPixelRatio());
  updateNebula(camera);
  updatePlanets(now / 1000);
  updateStations(now / 1000);
  // nav AFTER the stations are placed: a reset snaps orbiting stations back
  // to their snapshot spot for one frame, and a discovery check reading that
  // stale position would log everything sitting at the spawn point
  updateNav(ship, delta, phase === 'fly', frameBlend);
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert(); // fresh for projection
  updateBlackHole(camera, lensPass.uniforms, now / 1000);

  // atmospheric entry: fade the frame to the sky of whichever planet's air
  // the ship is deepest inside
  atmosphereAt(camera.position, _atmo);
  // turbulence: the air buffets the ship, harder when deeper and faster
  if (_atmo.atmo > 0.01 && phase === 'fly') {
    const speedFrac = Math.min(ship.velocity.length() / 300, 1);
    const b = _atmo.atmo * _atmo.atmo * speedFrac * C.TURBULENCE;
    camera.position.x += Math.sin(now * 0.031) * Math.sin(now * 0.007) * b;
    camera.position.y += Math.sin(now * 0.043 + 1.7) * Math.sin(now * 0.011) * b;
    camera.position.z += Math.sin(now * 0.023 + 3.9) * b * 0.6;
  }
  skyfogPass.enabled = _atmo.atmo > 0.001;
  if (skyfogPass.enabled) {
    _up.set(_atmo.upX, _atmo.upY, _atmo.upZ).normalize();
    const su = skyfogPass.uniforms;
    su.uAtmo.value = _atmo.atmo;
    su.uDay.value = Math.min(Math.max(_up.dot(SUN) * 0.5 + 0.5, 0), 1);
    su.uSkyDay.value.set(_atmo.p.cfg.skyColor());
    su.uDensity.value = C.SKY_DENSITY;
    // planet-up expressed in view space, for horizon-weighted haze
    _invQuat.copy(camera.quaternion).invert();
    su.uUpView.value.copy(_up).applyQuaternion(_invQuat);
    su.uAspect.value = camera.aspect;
    su.uTanHalf.value = Math.tan((camera.fov * Math.PI) / 360);
  }

  // live panel bindings (GDD 2.3): cheap scalar copies each frame
  bloomPass.threshold = C.BLOOM_THRESHOLD;
  bloomPass.strength = C.BLOOM_STRENGTH;
  bloomPass.radius = C.BLOOM_RADIUS;
  aberrationPass.uniforms.uStrength.value = (C.CA_STRENGTH * 8.0) / window.innerHeight;

  composer.render();
}
requestAnimationFrame(frame);
