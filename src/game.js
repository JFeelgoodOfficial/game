// Loop, composer, resize (GDD 2.2). Fixed-timestep physics decoupled from
// render rate (GDD 2.1): the accumulator runs 60hz ticks regardless of
// display refresh. Zero allocation inside the frame loop — everything the
// loop touches is preallocated at module scope.
//
// Composer chain (GDD 4.4, 4.5):
//   world render -> skyfog (depth-aware) -> lensing -> cockpit overlay ->
//   interior overlay -> bloom -> aberration -> collapse -> out
// Skyfog runs FIRST so it can read the scene's fresh depth buffer (aerial
// perspective — solid geometry only hazes with distance) and so the cockpit
// overlays never get washed. The cockpit is composited AFTER lensing so the
// interior never warps, and BEFORE bloom with a threshold high enough that
// only stars, the accretion disk, and the photon ring glow.

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
import { initDeepNebula, updateDeepNebula, deepNebula } from './deepnebula.js';
import { cockpitScene, updateCockpit, cockpitGroup, CockpitOverlayPass } from './cockpit.js';
import { initCockpitFrame, updateCockpitFrame } from './cockpitFrame.js';
import {
  interiorScene,
  initInterior,
  updateInterior,
  updateInteriorCamera,
  nearSeat,
  nearPlaque,
  resetPlayer,
  playerState,
  setPrompt,
} from './interior.js';
import { initBlackHole, updateBlackHole, blackhole } from './blackhole.js';
import {
  initPlanets,
  updatePlanets,
  startPlanetBake,
  atmosphereAt,
  planets,
  SUN,
} from './planet.js';
import {
  initWalk,
  nearestTerraFloor,
  enterWalk,
  exitWalk,
  stepWalk,
  updateWalkCamera,
  updateWalkVisuals,
  toggleWalkView,
  nearParkedShip,
  promptReturnToShip,
  walkInteract,
  walkPromptText,
  shipBearing,
  walkDebug,
} from './walkLazy.js';
import { initJournal, journalState } from './journal.js';
import { initSun, sunAltitude } from './sun.js';
import { initStations, updateStations } from './stations.js';
import { initMenu, showMenu, hideMenu, updateHeatUI, setWarpButtonVisible } from './menu.js';
import { startMusic, nextTrack, prevTrack, currentTitle, pauseMusic, resumeMusic } from './music.js';
import { initRadio, updateRadio } from './radio.js';
import { initNav, updateNav, navState, showNavToast } from './nav.js';
import { settings, onSettingsChange } from './settings.js';
import {
  initSettingsPanel,
  showPauseOverlay,
  hidePauseOverlay,
} from './settingsPanel.js';
import { initCompass, updateCompass } from './compass.js';
import { initControls, updateControls } from './controls.js';
import { initCapture, capturePendingPhoto, updateCapture, requestPhoto, toggleRecording, isGalleryOpen } from './capture.js';
import { initCredits, openCredits, closeCredits, isCreditsOpen } from './credits.js';
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

// The on-foot astronaut (hidden until a disembark) lives in the world scene.
initWalk(scene);

// --- phase 2 environment ---
initNebula(scene, renderer); // renderer: one-time cubemap bake of the sky
initStarfield(scene);
initSun(scene);
initBlackHole(scene);
initDeepNebula(scene); // second nebula — a flyable field out past the black hole
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
initCompass();
initControls();
initCapture(renderer);
initCredits();
initJournal();
initSettingsPanel();

// --- composer (GDD 4.4) ---
const composer = new EffectComposer(renderer);
// Scene depth for the skyfog pass. Both ping-pong targets carry a depth
// texture: the number of swap passes enabled varies per frame, so which
// target the RenderPass draws into alternates. Attached post-construction —
// passing a prebuilt target would share one texture between the clones.
// Resize is automatic: the renderer re-syncs a target's depth texture to its
// size when the target reallocates.
{
  const dbs = renderer.getDrawingBufferSize(new THREE.Vector2());
  composer.renderTarget1.depthTexture = new THREE.DepthTexture(dbs.x, dbs.y);
  composer.renderTarget2.depthTexture = new THREE.DepthTexture(dbs.x, dbs.y);
}
composer.addPass(new RenderPass(scene, camera));

// Atmospheric entry: washes the WORLD toward sky colour as the ship descends
// into a planet's air — depth-aware, so near geometry (buildings, the
// astronaut) stays crisp while far terrain fades into the sky. Runs first
// after the render so readBuffer is always the target the scene just drew
// into, with its depth texture fresh; the cockpit/interior overlays land
// later and stay un-hazed. Disabled above the atmosphere (zero cost).
class SkyfogPass extends ShaderPass {
  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}
const skyfogPass = new SkyfogPass({
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uAtmo: { value: 0 },
    uDay: { value: 0 },
    uSkyDay: { value: new THREE.Color(C.SKY_COLOR) },
    uDensity: { value: C.SKY_DENSITY },
    uUpView: { value: new THREE.Vector3(0, 1, 0) },
    uAspect: { value: window.innerWidth / window.innerHeight },
    uTanHalf: { value: Math.tan((C.FOV * Math.PI) / 360) },
    uNear: { value: 0.1 },
    uFar: { value: 1e6 },
    uHazeDist: { value: C.SKY_HAZE_DIST },
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

function onResize() {
  resizeCamera();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  lensPass.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
}
window.addEventListener('resize', onResize);

// Quality setting: LOW caps the render at 1x pixel ratio and drops bloom —
// the two biggest fixed costs a weaker GPU can shed without changing the
// scene itself. (The planet shader also reads settings.quality; planet.js.)
let appliedQuality = null;
function applyQuality() {
  if (settings.quality === appliedQuality) return; // change events fire for any setting
  appliedQuality = settings.quality;
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, settings.quality === 'low' ? 1 : 2)
  );
  bloomPass.enabled = settings.quality !== 'low';
  onResize(); // repropagate sizes at the new ratio
}
applyQuality();
onSettingsChange(applyQuality);

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
    deepNebula,
    originOffset,
    paused: false,
    warpInfo: () => ({ phase, warp, heat }),
    // ship-interior walk (C); the on-foot planet walk (G) is `walk` below
    interior: {
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
    // On-foot walk mode, for headless verification. Lazy chunk: null until
    // walkLazy.js finishes loading it (~2s after boot).
    get walk() {
      return walkDebug()?.walk;
    },
    walkHere() {
      const floor = nearestTerraFloor(ship.position);
      if (floor) {
        enterWalk(floor.planet);
        heat = 0;
        phase = 'walk';
        accumulator = 0;
        setWarpButtonVisible(false);
      }
      return floor;
    },
    walkStep(n = 1) {
      for (let i = 0; i < n; i++) {
        stepWalk(DT);
        updateOrigin(ship);
      }
    },
    walkExit() {
      if (phase === 'walk') {
        exitWalk(camera);
        snapCamera(ship);
        phase = 'fly';
        accumulator = 0;
        setWarpButtonVisible(true);
      }
    },
    // Landing-site entities, walker body + interior player — for headless
    // verification (teleports, ground checks).
    get walkSite() {
      return walkDebug()?.walkSite;
    },
    ship,
    player: playerState,
    // Quest/codex record (interaction system), for headless verification.
    journal: journalState,
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
let promptTimer = 0; // shows "C — STAND" briefly after each launch

// Backspace — real pause (audit fix: Escape only dropped pointer lock while
// physics kept running, with no on-screen cue). Freezes the accumulator and
// heat by zeroing delta; the scene keeps rendering under the overlay. (P/R
// are the in-game camera, so pause takes Backspace.)
let paused = false;
function setPaused(v) {
  if (v === paused) return;
  paused = v;
  if (paused) {
    showPauseOverlay(() => setPaused(false));
    pauseMusic();
  } else {
    hidePauseOverlay();
    resumeMusic();
  }
}

// Photosensitivity / vestibular comfort: damp the camera shake and
// turbulence for users who asked the OS for reduced motion. (The flashing
// heat UI is handled in CSS via the same media query.)
const MOTION_SCALE = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  .matches
  ? 0.25
  : 1;

const hintEl = document.getElementById('hint');

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
  closeCredits();
  promptTimer = 6; // remind the pilot the corridor exists
  resetPlayer();
  input.toggleInterior = false;
  // snap the lagging camera to the ship so it doesn't slerp from the horizon
  snapCamera(ship);
}

initMenu(() => {
  resetToStart();
  accumulator = 0;
  phase = 'fly';
  setPaused(false);
  hideMenu();
  startMusic(); // user's track, from the LAUNCH click gesture
  renderer.domElement.requestPointerLock?.();
  // One-time first-launch nudge: Terra sits dead ahead of the spawn point,
  // but the nav chart is deliberately blank until bodies are discovered —
  // give a brand-new pilot a single bearing without marking the map.
  try {
    if (!localStorage.getItem('nova7.introSeen')) {
      localStorage.setItem('nova7.introSeen', '1');
      // delayed past the near-spawn discovery toast (Meridian Ring logs
      // within the first second and would overwrite this immediately)
      setTimeout(() => showNavToast('UNIDENTIFIED CONTACT — DEAD AHEAD · HOLD W', 8), 4500);
    }
  } catch {
    // no storage — skip the nudge rather than repeat it forever
  }
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

  // Backspace — pause toggle, only meaningful with a live simulation to freeze
  if (input.togglePause) {
    input.togglePause = false;
    if (phase === 'fly' || phase === 'walk') setPaused(!paused);
  }
  if (paused) {
    delta = 0;
    // swallow anything typed/moved under the overlay so it can't fire on resume
    input.toggleWalk = input.toggleInterior = input.toggleView = input.interact = false;
    input.photo = input.record = false;
    input.mouseX = input.mouseY = 0;
  }
  // "click to steer" hint only makes sense with the sim live and unpaused
  hintEl.classList.toggle('off', paused || (phase !== 'fly' && phase !== 'walk'));

  let flashAmt = 0;
  if (phase === 'fly') {
    // C: stand up out of the seat / sit back down at it. Standing is
    // blocked at warp (nobody walks at 10,000 u/s); sitting requires being
    // back at the chair. Consumed once per frame at the bottom of the loop.
    if (input.toggleInterior) {
      if (!standing && !input.warp) standing = true;
      else if (standing && nearSeat()) {
        standing = false;
        closeCredits(); // never leave the plaque popup up in the pilot seat
      }
    }
    // E while standing: read the corridor plaque / close its popup again.
    // (Handled here because input.interact is consumed right after the
    // phase blocks, before the UI section below runs.)
    if (standing && input.interact) {
      if (isCreditsOpen()) closeCredits();
      else if (standBlend > 0.5 && nearPlaque()) openCredits();
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
    // Heat only accrues while piloted (audit fix): standing in the corridor
    // disengages thrust, so a burn that starts while out of the seat used to
    // be nearly unrecoverable — walk back, blend down, then pull up, against
    // a 6-second fuse. Out of the seat the heat holds instead of climbing.
    if (nearSun) {
      if (piloted) heat += (delta / heatTotal) * C.SUN_BURN_MULT;
      deathReason = 'INCINERATED — FLEW INTO THE SUN';
    } else if (overFloor < C.HEAT_ALTITUDE) {
      if (piloted) heat += delta / heatTotal;
      deathReason = 'RE-ENTRY FAILURE — HULL DESTROYED';
    } else {
      heat -= delta / C.HEAT_COOL;
    }
    heat = Math.min(Math.max(heat, 0), 1);
    if (heat >= 1) {
      phase = 'explode';
      warpT = 0;
    }
    // Disembark onto a rocky planet (G) when flying low and slow enough.
    // Only from the pilot seat — sit back down before stepping outside.
    if (input.toggleWalk && !standing && standBlend < 0.05) {
      const floor = nearestTerraFloor(ship.position);
      if (
        floor &&
        floor.altitude < C.WALK_LAND_ALTITUDE &&
        ship.velocity.length() < C.WALK_LAND_SPEED
      ) {
        enterWalk(floor.planet);
        heat = 0;
        phase = 'walk';
        accumulator = 0;
        setWarpButtonVisible(false); // no warping on foot
      }
    }
  } else if (phase === 'walk') {
    // On foot: fixed-timestep walker, same 60hz loop shape as flight.
    accumulator += delta;
    while (accumulator >= DT) {
      stepWalk(DT);
      accumulator -= DT;
    }
    // T — switch first/third person (persists as the preference).
    if (input.toggleView) toggleWalkView();
    // Astronaut pose/animation + dressing sway ride the render rate.
    updateWalkVisuals(delta, now / 1000);
    // E — talk to the focused citizen/creature, or advance the open dialogue.
    if (input.interact) walkInteract();
    if (input.toggleWalk) {
      if (nearParkedShip()) {
        // Board the ship and hand control back to flight.
        exitWalk(camera);
        snapCamera(ship); // resync the camera-lag state exitWalk set directly
        phase = 'fly';
        accumulator = 0;
        setWarpButtonVisible(true);
      } else {
        // You walked here — the ship didn't. Go back for it.
        promptReturnToShip();
      }
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
  // Camera: P photo / R record, active in gameplay unless the gallery is open.
  if ((phase === 'fly' || phase === 'walk') && !isGalleryOpen()) {
    if (input.photo) requestPhoto();
    if (input.record) toggleRecording();
  }
  // Consume the edge-triggered toggles exactly once per frame, in any phase.
  input.toggleWalk = false;
  input.toggleInterior = false;
  input.toggleView = false;
  input.interact = false;
  input.photo = false;
  input.record = false;
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
  if (phase === 'walk') {
    // On foot on a planet — the walker owns the camera (walk.js).
    updateWalkCamera(camera, delta);
  } else {
    updateCamera(ship);
    // interior rides the ship; the walk camera blends over the seated pose
    // (shake and turbulence below still add on top — the corridor rattles too)
    updateInterior(ship);
    updateInteriorCamera(ship, delta, standBlend, standBlend >= 0.2 && phase === 'fly');
  }
  // hull-stress shake: time-hashed jitter, ramping in past half heat
  const shake = Math.max(heat - 0.5, 0) * 2 + (phase === 'explode' ? 1.5 : 0);
  if (shake > 0 && !paused) {
    const s = shake * 0.02 * MOTION_SCALE;
    camera.position.x += Math.sin(now * 0.093) * s;
    camera.position.y += Math.sin(now * 0.127 + 2.1) * s;
    camera.position.z += Math.sin(now * 0.071 + 4.4) * s;
  }
  updateCockpit(ship);
  // The instrument cockpit is the resting view; boost/warp fades it out for
  // the clear window (inverted at the user's request). The dashboard
  // consoles (radio, NAV) ride the same fade — they live on the dash. On
  // foot on a planet the whole ship overlay hides; standing in the ship
  // swaps the seated canopy for the interior overlay.
  let frameBlend;
  if (phase === 'walk') {
    frameBlend = updateCockpitFrame(ship, delta, false); // fade the frame image out
    cockpitGroup.visible = false;
    cockpitPass.enabled = false;
    interiorPass.enabled = false;
    updateRadio(frameBlend, false);
    // "E — TALK" while an alien/creature is in range (dialogue hints are on
    // the dialogue panel itself). Reuses the interior prompt element.
    setPrompt(walkPromptText());
  } else {
    frameBlend = updateCockpitFrame(ship, delta, phase !== 'menu', standBlend);
    interiorPass.enabled = standBlend > 0.001;
    cockpitPass.enabled = !interiorPass.enabled;
    cockpitGroup.visible = frameBlend < 0.3;
    updateRadio(frameBlend, phase === 'fly');
    // the C prompt: a launch reminder while seated, "SIT" back at the chair;
    // standing, "E — READ" in front of the plaque (E handled in the fly block)
    if (phase === 'fly') {
      if (standing) {
        setPrompt(
          standBlend > 0.5 && nearSeat()
            ? 'C — SIT'
            : standBlend > 0.5 && nearPlaque() && !isCreditsOpen()
              ? 'E — READ'
              : null
        );
      } else {
        setPrompt(promptTimer > 0 ? 'C — STAND UP' : null);
        if (promptTimer > 0) promptTimer -= delta;
      }
    } else {
      setPrompt(null);
    }
  }
  updateStarfield(camera, renderer.getPixelRatio());
  updateNebula(camera);
  updateDeepNebula(renderer, camera);
  updatePlanets(now / 1000, camera.position);
  updateStations(now / 1000, ship.position);
  // nav AFTER the stations are placed: a reset snaps orbiting stations back
  // to their snapshot spot for one frame, and a discovery check reading that
  // stale position would log everything sitting at the spawn point
  updateNav(ship, delta, phase === 'fly', frameBlend);
  updateCompass(phase === 'walk' ? shipBearing() : null);
  updateControls(phase, frameBlend);
  updateCapture(phase, frameBlend, delta);
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert(); // fresh for projection
  updateBlackHole(camera, lensPass.uniforms, now / 1000);

  // atmospheric entry: fade the frame to the sky of whichever planet's air
  // the ship is deepest inside
  atmosphereAt(camera.position, _atmo);
  // turbulence: the air buffets the ship, harder when deeper and faster
  if (_atmo.atmo > 0.01 && phase === 'fly' && !paused) {
    const speedFrac = Math.min(ship.velocity.length() / 300, 1);
    const b = _atmo.atmo * _atmo.atmo * speedFrac * C.TURBULENCE * MOTION_SCALE;
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
    su.uNear.value = camera.near;
    su.uFar.value = camera.far;
    su.uHazeDist.value = C.SKY_HAZE_DIST; // live-tunable, like uDensity
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
  // Photo grab must be in this task — the canvas has no preserveDrawingBuffer.
  capturePendingPhoto();
}
requestAnimationFrame(frame);
// Bake terra vertex displacement into the geometry in background time
// slices (see planet.js) — the GPU displacement path covers until each
// planet swaps over.
startPlanetBake();
