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
import { initInput, input, setPointerLockGate } from './input.js';
import { ship, stepShip } from './ship.js';
import { altitudeAboveFloor } from './gravity.js';
import { updateOrigin, originOffset, snapshotShiftables, restoreShiftables } from './origin.js';
import { camera, updateCamera, snapCamera, resizeCamera, dashBlend } from './camera.js';
import { initTuning } from './tuning.js';
import { initStarfield, warpAmount, updateStarfield } from './starfield.js';
import { initNebula, updateNebula } from './nebula.js';
import { initDeepNebula, updateDeepNebula, deepNebulae } from './deepnebula.js';
import {
  initPaintingNebulae,
  startPaintingNebulaBuild,
  paintingNebulae,
} from './paintingnebula.js';
import { cockpitScene, CockpitOverlayPass } from './cockpit.js';
import {
  initCockpit3d,
  updateCockpit3d,
  cockpitRig,
  setCockpitStanding,
  cockpitShell,
  cockpitPointerGate,
  cockpitDebug,
} from './cockpit3d.js';
import { initHolonav, updateHolonav, isHoloOpen, holonavDebug } from './holonav.js';
import { navMenuDebug } from './navmenu.js';
import { startAutoWarp, stepAutopilot, autopilotActive, cancelAutopilot } from './autopilot.js';
import {
  interiorScene,
  initInterior,
  loadInteriorPictures,
  openGallery,
  nearPainting,
  interiorInfo,
  placePlayer,
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
  isIsolatingWorld,
  isolated,
  acquireUniverse,
  releaseUniverse,
  acquireSurface,
  releaseSurface,
  releaseAll as releaseIsolation,
} from './isolate.js';
import {
  initPlanets,
  updatePlanets,
  startPlanetBake,
  atmosphereAt,
  planets,
  setPlanetSpinFrozen,
  SUN,
} from './planet.js';
import { initCityFlatten } from './cityflatten.js';
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
  walkPreRender,
  walkPostRender,
  walkPendingReset,
  walkBearing,
  walkObjective,
  walkCombatActive,
  walkDebug,
  walkLoaded,
  ensureWalkLoaded,
  enterCottageWalk,
  cottageActive,
} from './walkLazy.js';
import { initJournal, journalState } from './journal.js';
import { initInventory, inventoryState } from './inventory.js';
import { CITIES, citiesForWorld, padLocalDir } from '../world/cityRegistry.js';
import { initSun, updateSun, sunAltitude, sun } from './sun.js';
import { initStations, updateStations, stations } from './stations.js';
import { initMenu, showMenu, hideMenu, updateHeatUI } from './menu.js';
import {
  startMusic,
  nextTrack,
  prevTrack,
  currentTitle,
  pauseMusic,
  resumeMusic,
  playTrackAt,
  isMusicPlaying,
  trackTitles,
} from './music.js';
import { initRadioPopup, openRadioPopup, closeRadioPopup, isRadioPopupOpen } from './radioPopup.js';
import { initVehicleMenu, toggleVehicleMenu, closeVehicleMenu } from './vehicleMenu.js';
import {
  initNav, updateNav, navState, showNavToast, hideNavToast, getBodies,
} from './nav.js';
import { settings, saveSettings } from './settings.js';
import { Q, initQuality, onQualityChange, governFrame, qualityReport } from './quality.js';
import {
  initSettingsPanel,
  showPauseOverlay,
  hidePauseOverlay,
} from './settingsPanel.js';
import { initCompass, updateCompass } from './compass.js';
import { initControls, updateControls, setObjective } from './controls.js';
import { initTouchControls, updateTouchControls } from './touchControls.js';
import { initCapture, capturePendingPhoto, updateCapture, updateRecordingFrame, requestPhoto, toggleRecording, isGalleryOpen, isRecording } from './capture.js';
import { MOTION_SCALE } from './motion.js';
import { initSfx, updateSfx, sfxState } from './sfx.js';
import { initCoach, updateCoach, coachState } from './coach.js';
import { initCredits, openCredits, closeCredits, isCreditsOpen } from './credits.js';
import { initArtView, openArtView, closeArtView, isArtViewOpen } from './artView.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import lensingFrag from './shaders/lensing.frag?raw';
import aberrationFrag from './shaders/aberration.frag?raw';
import collapseFrag from './shaders/collapse.frag?raw';
import skyfogFrag from './shaders/skyfog.frag?raw';

// No antialias: every frame is drawn into the EffectComposer's own render
// targets and the canvas only ever receives OutputPass's fullscreen quad, so
// multisampling the default framebuffer smooths nothing and costs a
// multisampled backbuffer plus a resolve per frame.
const renderer = new THREE.WebGLRenderer({ antialias: false });
initQuality(renderer); // picks the tier (and so the pixel ratio) before anything is sized
renderer.setPixelRatio(Q.basePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

// Losing the GL context used to be invisible and terminal: the canvas freezes
// on its last frame while the DOM overlays stay painted, so a loss during a
// heavy build — the cottage's 16k tufts, canvas textures and PMREM bake, all in
// one frame — read as the screen simply stopping on full amber. Phones under
// memory pressure are where this happens. We don't try to restore (that means
// re-uploading every texture and geometry); we just stop pretending nothing
// happened and give the player the one thing that does fix it.
let contextLost = false;
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault(); // keeps the canvas alive rather than tearing it down
  contextLost = true;
  console.error('[gl] context lost');
  updateHeatUI(0, C.CRACK_AT, 0, null); // drop any flash/vignette still on screen
  showMenu('dead', 'GRAPHICS CONTEXT LOST — RELOAD TO CONTINUE');
});

const scene = new THREE.Scene();

// --- the planetary system (terra + gas giants; gravity/floor registered
// inside initPlanets) ---
initPlanets(scene);
// Level the terrain under every registry town. Must run before
// startPlanetBake() below, so the town discs bake into the mesh flat.
initCityFlatten(planets);

// The on-foot astronaut (hidden until a disembark) lives in the world scene.
initWalk(scene);

// --- phase 2 environment ---
initNebula(scene, renderer); // renderer: one-time cubemap bake of the sky
initStarfield(scene);
initSun(scene);
initBlackHole(scene);
initDeepNebula(scene); // second nebula — a flyable field out past the black hole
initPaintingNebulae(scene); // the artgallery paintings, as outer-shell nebulae
initStations(scene, renderer);

// Initial layout of everything origin-registered (planets, sun, stations,
// black hole), snapshotted so resets restore it exactly.
snapshotShiftables();

initInput(renderer.domElement);
initTuning();
initCockpit3d(renderer.domElement);
initInterior();
initRadioPopup();
initVehicleMenu();
initNav();
initHolonav(cockpitShell);
setPointerLockGate(cockpitPointerGate);
initCompass();
initControls();
initTouchControls();
initCapture(renderer);
initCredits();
initArtView();
initSfx();
initJournal();
initInventory();
initSettingsPanel();
initCoach();

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
    uSunView: { value: new THREE.Vector3(0, 1, 0) },
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

// Ambient occlusion — the contact darkening where surfaces meet, which is what
// separates "boxes in a room" from "a place". Only ever enabled on an isolated
// story world (src/isolate.js), where the paused universe pays for it; it is a
// full extra scene pass for normals and the flight sim cannot afford one.
// Placed AFTER skyfog so skyfog still reads the RenderPass's fresh depth
// texture (GTAOPass owns its own depth/normal targets, so it needs nothing from
// the composer's). Radius is metres — these are rooms, not landscapes.
// The pass itself (plus its GTAO/denoise shaders and SimplexNoise) is a
// chunk of its own, fetched the first time AO is switched on rather than
// shipped to every visitor of a game that spends most of its time in space
// with AO off. This stand-in carries the only part of the interface anyone
// uses — `enabled` — so isolate.js and the debug hooks need no changes; the
// real pass takes over the flag as soon as it lands.
const aoPass = {
  pass: null,
  loading: null,
  _enabled: false,
  get enabled() {
    return this._enabled;
  },
  set enabled(v) {
    this._enabled = !!v;
    if (this.pass) this.pass.enabled = this._enabled;
    else if (this._enabled) this.load();
  },
  load() {
    if (this.loading) return this.loading;
    this.loading = import('three/addons/postprocessing/GTAOPass.js')
      .then(({ GTAOPass }) => {
        const p = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
        p.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.4, thickness: 0.4, scale: 1.0, samples: 16 });
        p.enabled = this._enabled; // AO may have been switched on while this loaded
        // Slot it exactly where it used to sit: after skyfog, before lensing.
        // insertPass also sizes it to the composer's current buffer.
        composer.insertPass(p, composer.passes.indexOf(lensPass));
        this.pass = p;
      })
      .catch((err) => {
        // No AO is a look, not a failure — the world still renders. Clearing
        // `loading` lets the next landing try again.
        console.warn('[ao] pass failed to load', err);
        this.loading = null;
      });
    return this.loading;
  },
};

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

// The walkable interior rides the overlay trick: disabled (zero cost) while
// seated. It draws BEFORE the cockpit so the real dashboard rig sits inside
// the flight deck — while standing, the cockpit pass keeps the interior's
// depth instead of clearing it, and the two occlude each other properly.
const interiorPass = new CockpitOverlayPass(interiorScene, camera);
interiorPass.enabled = false;
composer.addPass(interiorPass);

const cockpitPass = new CockpitOverlayPass(cockpitScene, camera);
composer.addPass(cockpitPass);

// Half-resolution internal targets: bloom is a blur, so this is visually
// indistinguishable and ~4x cheaper — the fps budget (GDD 2.1) goes to the
// scene, not the glow.
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
  C.BLOOM_STRENGTH,
  C.BLOOM_RADIUS,
  C.BLOOM_THRESHOLD
);
// UnrealBloomPass cuts each blur kernel off at under one sigma, so the falloff
// ends on a cliff and a small, very bright source — a star, the sun from across
// the system — blooms as a visible SQUARE. Same taps, same cost: reweight them
// as a gaussian tapered to zero at the last tap, so the footprint is round.
for (const m of bloomPass.separableBlurMaterials) {
  const k = m.uniforms.gaussianCoefficients.value;
  const R = k.length;
  const sigma = R / 1.6;
  for (let i = 0; i < R; i++) {
    const taper = 1 - (i / R) * (i / R);
    k[i] = Math.exp((-0.5 * i * i) / (sigma * sigma)) * taper * taper;
  }
}
// composer.addPass/setSize push the full size into every pass — keep bloom
// at half by intercepting.
const bloomSetSize = bloomPass.setSize.bind(bloomPass);
bloomPass.setSize = (w, h) => bloomSetSize(w / 2, h / 2);
composer.addPass(bloomPass);

const aberrationPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0 },
    uWarp: { value: 0 },
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

// Antialiasing, on the finished display-referred image. It has to sit after
// tone mapping: the scene is HDR emissives on black, and smoothing those edges
// in linear light leaves a step the tone curve then stretches back into a
// stair. MEDIUM gets FXAA, one fullscreen pass; HIGH and ULTRA get SMAA, which
// keeps thin struts and ring edges that FXAA softens. SMAA is three passes plus
// two lookup textures, so it is its own chunk, fetched only by the tiers that
// use it — FXAA stands in until it lands.
const fxaaPass = new ShaderPass(FXAAShader);
fxaaPass.setSize = (w, h) => fxaaPass.uniforms.resolution.value.set(1 / w, 1 / h);
composer.addPass(fxaaPass);
const smaa = {
  pass: null,
  loading: null,
  load() {
    if (this.loading) return;
    this.loading = import('three/addons/postprocessing/SMAAPass.js')
      .then(({ SMAAPass }) => {
        const p = new SMAAPass(1, 1);
        composer.addPass(p); // sizes it to the composer's current buffer
        this.pass = p;
        applyAA();
      })
      .catch((err) => {
        console.warn('[aa] SMAA failed to load', err); // FXAA keeps covering
        this.loading = null;
      });
  },
};
function applyAA() {
  const wantSmaa = Q.aa === 'smaa';
  if (wantSmaa && !smaa.pass) smaa.load();
  if (smaa.pass) smaa.pass.enabled = wantSmaa;
  fxaaPass.enabled = Q.aa === 'fxaa' || (wantSmaa && !smaa.pass);
}

function onResize() {
  resizeCamera();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  lensPass.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
}
window.addEventListener('resize', onResize);

// Quality: the tier sets the canvas pixel ratio and which passes exist; the
// frame governor then trims the composer's INTERNAL resolution under it
// (src/quality.js). The canvas itself never resizes for the governor — only
// the render targets do, and OutputPass stretches the result back up — so a
// step is a target reallocation, not a layout change. (The planet shader and
// the world modules read settings.quality themselves.)
let appliedBase = -1;
function applyQuality() {
  bloomPass.enabled = Q.bloom;
  applyAA();
  if (Q.basePixelRatio !== appliedBase) {
    appliedBase = Q.basePixelRatio;
    renderer.setPixelRatio(Q.basePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  composer.setPixelRatio(Q.pixelRatio); // resizes every pass at the new scale
}
applyQuality();
onQualityChange(applyQuality);

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
    sun,
    blackhole,
    stationList: stations,
    deepNebulae,
    paintingNebulae,
    originOffset,
    paused: false,
    warpInfo: () => ({ phase, warp, heat }),
    // Renderer/scene/composer handles, so a headless run can assert that a trip
    // to an isolated world puts every piece of global state back (src/isolate.js
    // restores nine of them, and the cottage restores three more of its own).
    THREE,
    renderer,
    scene,
    bloom: bloomPass,
    ao: aoPass,
    get sunLight() {
      return sun.light ? sun.light.intensity : -1;
    },
    get sunAmbient() {
      return sun.ambient ? sun.ambient.intensity : -1;
    },
    get planetsVisible() {
      return planets.filter((p) => p.group.visible).length;
    },
    get menuShown() {
      const m = document.getElementById('menu');
      return !!m && !m.classList.contains('hidden');
    },
    // Park inside the sun's burn radius with the throttle shut. The heat does
    // the rest — this is the real path, not a phase poke.
    sunDive() {
      ship.position.copy(sun.group.position).addScaledVector(SUN, -C.SUN_RADIUS * 0.4);
      ship.velocity.set(0, 0, 0);
      ship.angularVelocity.set(0, 0, 0);
      heat = 0.9; // skip the six-second fuse; the last tenth is the real test
    },
    sfx: { state: () => sfxState() },
    // ship-interior walk (C); the on-foot planet walk (G) is `walk` below
    interior: {
      playerState,
      isStanding: () => standing,
      blend: () => standBlend,
      stand: () => {
        if (phase === 'fly' && !input.warp) {
          standing = true;
          loadInteriorPictures();
          openGallery();
        }
      },
      sit: () => { standing = false; },
      info: () => interiorInfo(),
      place: (x, z, yaw) => placePlayer(x, z, yaw),
      nearPainting: () => nearPainting()?.title ?? null,
      passes: () => ({ interior: interiorPass.enabled, cockpit: cockpitPass.enabled, clearDepth: cockpitPass.clearDepth }),
    },
    radio: {
      nextTrack,
      prevTrack,
      currentTitle,
      open: openRadioPopup,
      close: closeRadioPopup,
      isOpen: isRadioPopupOpen,
      playTrackAt,
      isMusicPlaying,
      trackTitles,
    },
    navState,
    cockpit: cockpitDebug(),
    holo: holonavDebug(),
    navMenu: navMenuDebug(),
    autopilot: {
      active: autopilotActive,
      start: (id) => startAutoWarp(getBodies().find((b) => b.id === id)),
      cancel: cancelAutopilot,
    },
    launch: () => {
      resetToStart();
      accumulator = 0;
      phase = 'fly';
      hideMenu();
      startMusic();
      loadOwnerArt(); // same post-launch art fetch the real LAUNCH button does
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
    // NMS-style landing sub-state, for headless verification.
    get landState() {
      return landState;
    },
    // Registry cities for a world: site + pad directions in world space at
    // this instant, for headless auto-land verification.
    cityInfo(worldName) {
      const p = planets.find((pl) => pl.cfg.name === worldName);
      if (!p) return null;
      const rotY = p.surface?.rotation?.y ?? 0;
      return citiesForWorld(worldName).map((def) => {
        const pad = padLocalDir(p, def, new THREE.Vector3());
        return {
          id: def.id,
          name: def.name,
          siteWorldDir: def.site.clone().applyAxisAngle(_yAxis, rotY),
          padWorldDir: pad.applyAxisAngle(_yAxis, rotY),
        };
      });
    },
    cityCount: CITIES.length,
    walkHere() {
      const floor = nearestTerraFloor(ship.position);
      if (floor) {
        // Clear the landing sub-state exactly as the real G step-out does. Left
        // set, it survives the walk and the subsequent walkExit, and the next
        // frame of free flight finds a stale 'landed' and pins the ship to a pad
        // it already left.
        landState = null;
        landedPlanet = null;
        _padLocalDir.set(0, 0, 0);
        beginWalk(floor.planet);
        heat = 0;
        phase = 'walk';
        accumulator = 0;
      }
      return floor;
    },
    walkStep(n = 1) {
      for (let i = 0; i < n; i++) {
        stepWalk(DT);
        updateOrigin(ship);
      }
    },
    // Run n render-rate updates of the on-foot world synchronously (the
    // warzone's monsters, weapons and waves advance here, not in stepWalk).
    // Each frame also runs the physics ticks that fit in it, as the real loop does.
    walkFrames(n = 1, dt = 1 / 30) {
      debugClock += 0;
      for (let i = 0; i < n; i++) {
        debugClock += dt;
        stepWalk(DT);
        stepWalk(DT);
        updateOrigin(ship);
        updateWalkVisuals(dt, performance.now() / 1000 + debugClock);
      }
    },
    // Drop straight into the cottage, skipping the six-second sun burn. The
    // real entry is 'ascend' (fly into the star); this is the same call it
    // makes, minus the flash.
    heaven() {
      if (!enterHeaven()) return false;
      phase = 'walk';
      accumulator = 0;
      return true;
    },
    // And back out again, the way the pad does it.
    leaveHeaven() {
      if (!cottageActive()) return false;
      endWalk();
      resetToStart();
      phase = 'fly';
      accumulator = 0;
      return true;
    },
    get phase() {
      return phase;
    },
    get flash() {
      return flash;
    },
    // The bottom-center prompt line as the player sees it ('G — BOARD').
    promptText: () => walkPromptText(),
    walkExit() {
      if (phase === 'walk') {
        endWalk();
        snapCamera(ship);
        phase = 'fly';
        accumulator = 0;
      }
    },
    // Landing-site entities, walker body + interior player — for headless
    // verification (teleports, ground checks).
    get walkSite() {
      return walkDebug()?.walkSite;
    },
    // Quest vehicles, for headless verification and the selector menu.
    get deployVehicle() {
      return walkDebug()?.deployVehicle;
    },
    get stowVehicle() {
      return walkDebug()?.stowVehicle;
    },
    get vehicleState() {
      return walkDebug()?.vehicleState;
    },
    ship,
    player: playerState,
    // Quest/codex record (interaction system), for headless verification.
    journal: journalState,
    inventory: inventoryState,
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
    // Tier and governor, for headless checks. `set` pins a tier the way the
    // settings panel does; `auto` hands control back; `feed` pushes synthetic
    // frame times (ms) through the governor without waiting on real frames.
    quality: {
      report: qualityReport,
      set(tier) {
        settings.qualityMode = 'manual';
        settings.quality = tier;
        saveSettings();
      },
      auto() {
        settings.qualityMode = 'auto';
        saveSettings();
      },
      feed(ms, n = 1) {
        for (let i = 0; i < n; i++) governFrame(ms / 1000, true);
        return qualityReport();
      },
      buffer() {
        return { w: composer.renderTarget1.width, h: composer.renderTarget1.height, canvasW: renderer.domElement.width };
      },
    },
    // Fixed camera set-ups for before/after screenshots. Puts the ship `dist`
    // away from a body along `dir` (a mix of sunward and sideways), looking at
    // it, at rest. Names: sun, station, or any planet name; `side` 0 looks at
    // the lit face, 1 puts the terminator centre-frame, 2 the night side.
    pose(name, distR = 3, side = 0) {
      let target, radius;
      if (name === 'sun') {
        target = sun.group.position;
        radius = C.SUN_RADIUS;
      } else if (name === 'station') {
        target = stations[0].group.position;
        radius = 150;
      } else {
        const p = planets.find((q) => q.cfg.name === name);
        target = p.group.position;
        radius = p.radius;
      }
      const toSun = new THREE.Vector3().subVectors(sun.group.position, target).normalize();
      if (name === 'sun') toSun.copy(target).normalize().negate();
      const sideways = new THREE.Vector3().crossVectors(toSun, new THREE.Vector3(0, 1, 0)).normalize();
      const a = (side * Math.PI) / 2;
      const dir = toSun.multiplyScalar(Math.cos(a)).addScaledVector(sideways, Math.sin(a) || 0.25).normalize();
      ship.position.copy(target).addScaledVector(dir, radius * distR);
      ship.velocity.set(0, 0, 0);
      ship.angularVelocity.set(0, 0, 0);
      ship.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(ship.position, target, new THREE.Vector3(0, 1, 0)));
    },
    coach: coachState,
    hideCockpit: false, // screenshots of the world without the dashboard
    setAO(v) {
      aoPass.enabled = !!v;
    },
    setExposure(v) {
      renderer.toneMappingExposure = v;
    },
    renderState() {
      const c = new THREE.Color();
      renderer.getClearColor(c);
      return {
        clear: '#' + c.getHexString(),
        clearAlpha: renderer.getClearAlpha(),
        background: scene.background ? String(scene.background) : null,
        passes: composer.passes.map((p) => p.constructor.name + ':' + (p.enabled ? 1 : 0)),
      };
    },
    // Isolated-world pause, for headless verification: which of the two stages
    // are held (universe freeze / surface render mode), which planet is exempt,
    // and did the space furniture actually go away.
    isolation() {
      return {
        active: isolated.active,
        surface: isolated.surface,
        keep: (isolated.keep ?? isolated.surfaceKeep)?.cfg?.name ?? null,
        ao: aoPass.enabled,
        shadows: renderer.shadowMap.enabled,
        far: camera.far,
        visiblePlanets: planets.filter((p) => p.group.visible).map((p) => p.cfg.name),
      };
    },
  };
  window.__debug = debug;
  window.__THREE = THREE; // headless probes build raycasters/vectors against it
  window.__scene = scene;
  window.__camera = camera;
  window.__renderer = renderer; // renderer.info is how headless checks for leaks
}

// True once every terra planet has swapped to its baked mesh. Latches, so the
// per-frame cost after boot is one boolean test.
let allBaked = false;
function terrainBaked() {
  if (allBaked) return true;
  for (let i = 0; i < planets.length; i++) {
    if (planets[i].cfg.type === 'terra' && !planets[i].baked) return false;
  }
  return (allBaked = true);
}

const _coach = { flying: false, turning: false, navOpen: false, landed: false };
const _menuQ = new THREE.Quaternion();
let trauma = 0; // camera shake impulse, 0..1, decays every frame
let wasWarping = false;

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
//
// EXCEPT at the sun. Burning up AT THE STAR goes to 'ascend' instead: the same
// flash, but it fades up on the cottage (world/cottage.js) rather than the
// death menu, and 'walk' takes over with the third walker driving. Boarding the
// ship on the cottage's pad goes to 'depart', which flashes white again and
// hands the player back to 'fly' in front of Terra. Re-entry burn at a planet
// still goes to 'explode' and still ends the run — only the sun opens the door.
let phase = 'menu';
let warpT = 0;
let warp = 0; // collapse pass progress, 0..1
let heat = 0; // hull heat, 0..1
let deathReason = ''; // set when the burn wins; shown on the menu
let burnedBySun = false; // which burn is killing us — the sun's is the doorway
// The white-out. Module-level, NOT frame-local, because the whole trick of both
// cottage transitions is that the phase change happens while this sits at 1:
// the heavy world build and the world reset both hide under it. `flashFade` is
// the seconds the current transition wants for its fade-out (0 = hold).
let flash = 0;
let flashFade = 0;
// Sun-death watchdog: how long 'ascend' has been sitting at full white waiting
// for the cottage, and whether building it threw outright.
let ascendWait = 0;
let ascendBroken = false;
// Out-of-seat sub-mode within 'fly' (interior.js): the ship coasts on
// attitude hold while the pilot walks the corridor. Not a phase — heat,
// capture, nav, and the accumulator must all keep running.
let standing = false;
let debugClock = 0; // extra seconds fed to __debug.walkFrames
const _sfx = { active: false, thrust: 0, boost: false, warp: false, atmo: 0, speed: 0, heat: 0, standing: false };
let standBlend = 0; // seat <-> stand camera blend, 0..1

// NMS-style landing sub-mode within 'fly' (not a phase — heat UI, nav,
// capture, skyfog all keep running): null = free flight, 'auto' = assisted
// G auto-land arc, 'landed' = parked on the surface (G steps out, W lifts).
// Every disembark/board routes through this pair so the isolated-world pause
// (src/isolate.js) can never be left half-applied — there are five transition
// sites, including the debug hooks and the hyper-holo-grid's game reset, and a
// stranded pause would leave the flight sim with an invisible solar system.
function beginWalk(planet) {
  enterWalk(planet);
  if (isIsolatingWorld(planet.cfg.name)) {
    // Both stages, both idempotent. The universe stage has normally already been
    // taken at touchdown, but debug.walkHere() drops straight into a walk with
    // landState never set, so this cannot assume it.
    acquireUniverse(planet);
    acquireSurface(planet, renderer, aoPass, camera, bloomPass);
  }
}
function endWalk() {
  // Both stages. Boarding is not a return to the pad: exitWalk lifts the ship to
  // WALK_LAND_ALTITUDE with the nose radially out, so the player is back in free
  // flight and needs the whole solar system back. (Landing and lifting off again
  // without ever stepping out releases the universe stage in stepLanded instead.)
  // Before exitWalk: restores visibility for the reset snapshot.
  releaseIsolation(renderer, aoPass, camera, bloomPass);
  closeVehicleMenu(); // the selector is an on-foot dialog
  exitWalk(camera);
}

// The cottage, on the far side of the sun. Called from 'ascend' with the screen
// already fully white — which is the point: building that world costs one long
// frame (16 k instanced tufts, two canvas textures, a PMREM bake) and nobody
// sees it happen. Returns false if the lazy walk chunk hasn't landed yet, and
// the caller holds the white until it has.
//
// A null keep in acquireUniverse hides EVERY planet, not all-but-one: this
// world is nowhere near any of them. acquireSurface takes the preset NAME for
// the same reason — there is no planet to look a preset up from.
function enterHeaven() {
  if (!walkLoaded()) return false;
  heat = 0;
  standing = false;
  standBlend = 0;
  thawLandedPlanet();
  landState = null;
  landedPlanet = null;
  _padLocalDir.set(0, 0, 0);
  cancelAutopilot();
  closeCredits();
  closeArtView();
  setCockpitStanding(false);
  closeRadioPopup();
  closeVehicleMenu();
  // Whatever the flight sim was saying, it stops saying it here — a contact-
  // logged banner from the dive has no business hanging over the garden.
  hideNavToast();
  acquireUniverse(null);
  if (!enterCottageWalk({ renderer })) {
    releaseIsolation(renderer, aoPass, camera, bloomPass);
    return false;
  }
  acquireSurface('cottage', renderer, aoPass, camera, bloomPass);
  return true;
}

let landState = null;
let landedPlanet = null; // planets[] entry under the skids
let autoT = 0; // auto-land arc progress 0..1
let settleT = 0; // touchdown upright-settle progress 0..1
const _landTargetDir = new THREE.Vector3(); // planet-center -> pad, world dir
const _landStartOff = new THREE.Vector3(); // arc start, offset from planet center (rebase-safe)
const _landStartQuat = new THREE.Quaternion();
const _landUprightQuat = new THREE.Quaternion();
const _lv0 = new THREE.Vector3();
const _lv1 = new THREE.Vector3();
const _lv2 = new THREE.Vector3();
const _lm = new THREE.Matrix4();
const _prevPos = new THREE.Vector3();
// Pad-targeted auto-land (world/cityRegistry.js): everything pad-related is
// stored SURFACE-LOCAL because the planet spins during the arc — a stored
// world-space target would drift off a permanent pad by hundreds of units
// over a long approach. Length 0 = free landing (no registry pad).
const _padLocalDir = new THREE.Vector3();
const _landStartLocalDir = new THREE.Vector3();
const _landArcAxisLocal = new THREE.Vector3(); // great-circle rotation axis
const _landArcQuat = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);
let landArcAng = 0; // start -> pad great-circle angle (rad)
let autoLandDuration = C.AUTOLAND_TIME;

// Upright landing pose: +Y radial, nose (-Z) along the current nose projected
// onto the tangent plane.
function landingUpright(up, quatOut) {
  _lv0.set(0, 0, -1).applyQuaternion(ship.quaternion);
  _lv0.addScaledVector(up, -_lv0.dot(up));
  if (_lv0.lengthSq() < 1e-6) _lv0.crossVectors(up, _lv1.set(1, 0.01, 0));
  _lv0.normalize(); // tangent nose
  _lv2.copy(_lv0).multiplyScalar(-1); // back (+Z)
  _lv1.crossVectors(up, _lv2).normalize(); // right (X = Y x Z)
  _lm.makeBasis(_lv1, up, _lv2);
  quatOut.setFromRotationMatrix(_lm);
}

// G at low altitude: on worlds with registry cities, arc to the CLOSEST
// city landing pad (great-circle distance at the trigger moment, ties
// broken by approach heading). On worlds without cities (the story-world
// total conversions, future planets), keep the original behavior: pick the
// flattest cell of a 5x5 tangent grid under the ship. Spawn-time
// allocation only.
function beginAutoLand(floor) {
  const p = floor.planet;
  landedPlanet = p;
  _padLocalDir.set(0, 0, 0);
  landArcAng = 0;
  autoLandDuration = C.AUTOLAND_TIME;
  const up = _lv0.subVectors(ship.position, p.body.position).normalize().clone();
  const cities = citiesForWorld(p.cfg.name);
  if (cities.length) {
    const rotY = p.surface?.rotation?.y ?? 0;
    const shipLocal = up.clone().applyAxisAngle(_yAxis, -rotY);
    // Approach heading (tangent-plane velocity), for near-tie breaking.
    const heading = ship.velocity.clone().addScaledVector(up, -ship.velocity.dot(up));
    if (heading.lengthSq() > 1e-6) heading.normalize();
    let best = null;
    let bestAng = Infinity;
    let bestAlong = -Infinity;
    const cand = new THREE.Vector3();
    const depart = new THREE.Vector3();
    for (const def of cities) {
      padLocalDir(p, def, cand);
      const ang = cand.angleTo(shipLocal);
      // Departure tangent toward this pad, in world space, for the tie-break.
      depart.copy(cand).applyAxisAngle(_yAxis, rotY);
      depart.addScaledVector(up, -depart.dot(up));
      const along = depart.lengthSq() > 1e-6 ? depart.normalize().dot(heading) : 0;
      if (ang < bestAng - 0.02 || (Math.abs(ang - bestAng) <= 0.02 && along > bestAlong)) {
        if (ang < bestAng) bestAng = ang;
        bestAlong = along;
        best = best ? best.copy(cand) : cand.clone();
      }
    }
    _padLocalDir.copy(best);
    _landStartLocalDir.copy(shipLocal);
    landArcAng = bestAng;
    // Great-circle rotation axis start -> pad (surface-local, constant).
    _landArcAxisLocal.crossVectors(shipLocal, _padLocalDir);
    if (_landArcAxisLocal.lengthSq() < 1e-8) _landArcAxisLocal.set(0, 1, 0);
    _landArcAxisLocal.normalize();
    // A distant pad gets a longer arc instead of a faster one.
    autoLandDuration = THREE.MathUtils.clamp(
      C.AUTOLAND_TIME + (landArcAng * p.radius) / C.AUTOLAND_CRUISE,
      C.AUTOLAND_TIME, C.AUTOLAND_MAX_TIME
    );
    _landTargetDir.copy(_padLocalDir).applyAxisAngle(_yAxis, rotY);
  } else {
    const ref = Math.abs(up.y) < 0.94
      ? _lv1.set(0, 1, 0)
      : _lv1.set(1, 0, 0);
    const t1 = _lv1.crossVectors(up, ref).normalize().clone();
    const t2 = _lv2.crossVectors(up, t1).normalize().clone();
    const R = p.radius;
    let bestRough = Infinity;
    const d = new THREE.Vector3();
    const probe = new THREE.Vector3();
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        d.copy(up).addScaledVector(t1, (i * 20) / R).addScaledVector(t2, (j * 20) / R).normalize();
        const h = p.body.groundAt(d);
        const e = 4 / R;
        const hx = p.body.groundAt(probe.copy(d).addScaledVector(t1, e).normalize());
        const hz = p.body.groundAt(probe.copy(d).addScaledVector(t2, e).normalize());
        const rough = Math.abs(hx - h) + Math.abs(hz - h);
        if (rough < bestRough) {
          bestRough = rough;
          _landTargetDir.copy(d);
        }
      }
    }
  }
  _landStartOff.subVectors(ship.position, p.body.position);
  _landStartQuat.copy(ship.quaternion);
  landingUpright(_landTargetDir, _landUprightQuat);
  autoT = 0;
  landState = 'auto';
}

function stepAutoLand(dt) {
  const p = landedPlanet;
  autoT = Math.min(autoT + dt / autoLandDuration, 1);
  const k = autoT * autoT * (3 - 2 * autoT); // smoothstep ease
  if (_padLocalDir.lengthSq() > 0.5) {
    // Pad arc: slerp the SURFACE-LOCAL direction along the great circle from
    // the trigger point to the pad, re-rotated by the live spin each step so
    // the ship tracks the pad while the planet turns under it.
    const rotY = p.surface?.rotation?.y ?? 0;
    _landArcQuat.setFromAxisAngle(_landArcAxisLocal, landArcAng * k);
    _lv2.copy(_landStartLocalDir).applyQuaternion(_landArcQuat)
      .applyAxisAngle(_yAxis, rotY); // current world dir along the arc
    _landTargetDir.copy(_padLocalDir).applyAxisAngle(_yAxis, rotY); // live pad
    const padR = p.radius + p.body.groundAt(_landTargetDir) + C.TOUCHDOWN_CLEARANCE;
    const startR = _landStartOff.length();
    // Radius eases start -> pad with a cruise hump on long arcs, and never
    // dips below the terrain under the arc (wyattmattoe ridges reach 280).
    let r = THREE.MathUtils.lerp(startR, padR, k);
    r += Math.sin(Math.PI * k) * Math.min(landArcAng * p.radius * 0.12, 140);
    const minR = p.radius + p.body.groundAt(_lv2) + 6;
    if (r < minR) r = minR;
    _prevPos.copy(ship.position);
    ship.position.copy(p.body.position).addScaledVector(_lv2, r);
    ship.velocity.copy(ship.position).sub(_prevPos).divideScalar(dt);
    // Touch down facing along the approach: nose (-Z) on the great-circle
    // travel tangent at the pad, +Y radial. Recomputed per step so the pose
    // tracks the spinning pad.
    _lv0.crossVectors(_landArcAxisLocal, _padLocalDir)
      .applyAxisAngle(_yAxis, rotY).normalize(); // travel tangent at pad
    _lv2.copy(_lv0).multiplyScalar(-1); // back (+Z)
    _lv1.crossVectors(_landTargetDir, _lv2).normalize(); // right (X = Y x Z)
    _lm.makeBasis(_lv1, _landTargetDir, _lv2);
    _landUprightQuat.setFromRotationMatrix(_lm);
    ship.quaternion.slerpQuaternions(_landStartQuat, _landUprightQuat, k);
    ship.angularVelocity.set(0, 0, 0);
  } else {
    // Free landing (no registry pad): the original straight-line arc.
    // Live pad target: clearance above the local ground (sea-clamped, so open
    // water is a water landing).
    const padR = p.radius + p.body.groundAt(_landTargetDir) + C.TOUCHDOWN_CLEARANCE;
    _lv0.copy(p.body.position).addScaledVector(_landTargetDir, padR); // pad
    _lv1.copy(p.body.position).add(_landStartOff); // arc start (rebase-safe)
    _prevPos.copy(ship.position);
    ship.position.lerpVectors(_lv1, _lv0, k);
    // Velocity mirrors the finite difference so camera drift/skyfog stay sane.
    ship.velocity.copy(ship.position).sub(_prevPos).divideScalar(dt);
    ship.quaternion.slerpQuaternions(_landStartQuat, _landUprightQuat, k);
    ship.angularVelocity.set(0, 0, 0);
  }
  if (autoT >= 1) {
    landState = 'landed';
    settleT = 1; // the arc already finished upright
    ship.velocity.set(0, 0, 0);
    touchdownIsolate(p);
  }
}

// Parked on the surface: pinned to the pad (the planet spins under the sky),
// easing upright after a manual touchdown. W/Space lifts off. On a registry
// pad the pin direction comes from the SURFACE-LOCAL pad dir re-rotated by
// the live spin, so the parked ship co-rotates and stays over the pad — the
// old radial-from-position pin drifts relative to a fixed pad.
function stepLanded(dt, piloted) {
  const p = landedPlanet;
  if (_padLocalDir.lengthSq() > 0.5) {
    _lv0.copy(_padLocalDir).applyAxisAngle(_yAxis, p.surface?.rotation?.y ?? 0);
  } else {
    _lv0.subVectors(ship.position, p.body.position).normalize();
  }
  const padR = p.radius + p.body.groundAt(_lv0) + C.TOUCHDOWN_CLEARANCE;
  ship.position.copy(p.body.position).addScaledVector(_lv0, padR);
  ship.velocity.set(0, 0, 0);
  ship.angularVelocity.set(0, 0, 0);
  ship.properAccel.set(0, 0, 0);
  if (settleT < 1) {
    settleT = Math.min(settleT + dt / 0.6, 1);
    const k = settleT * settleT * (3 - 2 * settleT);
    ship.quaternion.slerpQuaternions(_landStartQuat, _landUprightQuat, k);
  }
  if (piloted && (input.forward || input.brake)) {
    thawLandedPlanet(); // the day resumes the moment the skids leave
    landState = null;
    landedPlanet = null;
    _padLocalDir.set(0, 0, 0);
    // Lifting off without ever having stepped out: the universe stage was taken
    // at touchdown and nothing else will hand it back. (Stepping out and later
    // boarding routes through endWalk instead, which releases both stages.)
    releaseUniverse();
    ship.velocity.copy(_lv0).multiplyScalar(C.TAKEOFF_KICK);
  }
}

// Manual touchdown: skimming the ground slow enough simply sets the ship
// down; arriving with too much sink bounces off the air cushion — never a
// crash (GDD: feelgood).
function checkTouchdown() {
  const floor = nearestTerraFloor(ship.position);
  if (!floor || floor.altitude > C.TOUCHDOWN_CLEARANCE + 3) return;
  const p = floor.planet;
  _lv0.subVectors(ship.position, p.body.position).normalize();
  const vIn = -ship.velocity.dot(_lv0);
  if (vIn > C.TOUCHDOWN_MAX_SINK) {
    ship.velocity.addScaledVector(_lv0, vIn); // strip the inward component
    ship.velocity.multiplyScalar(0.7); // bleed tangential speed
    ship.velocity.addScaledVector(_lv0, vIn * C.LAND_BOUNCE); // bounce out
  } else if (ship.velocity.length() < 6) {
    landedPlanet = p;
    landState = 'landed';
    settleT = 0;
    _padLocalDir.set(0, 0, 0); // manual touchdown: land anywhere, no pad pin
    _landStartQuat.copy(ship.quaternion);
    landingUpright(_lv0, _landUprightQuat);
    touchdownIsolate(p);
  }
}

// The universe stops the instant the skids touch, not when the player steps out.
// Only the far field goes dark here — the sky the player is looking at through
// the canopy is untouched until they disembark and a world module takes it over
// (see the two-stage note in src/isolate.js).
function touchdownIsolate(p) {
  if (isIsolatingWorld(p.cfg.name)) acquireUniverse(p);
  // ...and the planet under the skids stops turning with it. Walk mode has
  // always frozen the spin (the ground can't slide underfoot while you stand
  // on it), but the window between touchdown and stepping out was still a
  // live day: the terminator crept, the sky wheeled, and a pad-pinned ship
  // rode the rotation. Freezing here makes "the world holds still while you
  // are on it" true for the whole visit rather than most of it. The freeze is
  // a latch (src/planet.js) — resuming re-anchors the phase, so neither edge
  // snaps, and the virtual day keeps advancing the sun for the light.
  setPlanetSpinFrozen(p, true);
}

// Undo the touchdown freeze. Stepping out doesn't need this (enterWalk
// re-freezes the same planet, idempotently); liftoff and the hard resets do.
function thawLandedPlanet() {
  if (landedPlanet) setPlanetSpinFrozen(landedPlanet, false);
}

// Backspace — real pause (audit fix: Escape only dropped pointer lock while
// physics kept running, with no on-screen cue). Freezes the accumulator and
// heat by zeroing delta; the scene keeps rendering under the overlay. (P/R
// are the in-game camera, so pause takes Backspace.)
let paused = false;
function setPaused(v) {
  if (v === paused) return;
  paused = v;
  if (paused) {
    closeRadioPopup(); // settings opened from the overlay must not stack under it
    showPauseOverlay(() => setPaused(false));
    pauseMusic();
  } else {
    hidePauseOverlay();
    resumeMusic();
  }
}


const hintEl = document.getElementById('hint');

function resetToStart() {
  // Safety net for every path that bypasses both liftoff and boarding: the
  // collapse/respawn reset, the menu launch, debug.launch(), and the actuality
  // finale's game reset. A stranded pause would hand the flight sim an invisible
  // solar system. Both stages, and a no-op when neither is held.
  releaseIsolation(renderer, aoPass, camera, bloomPass);
  thawLandedPlanet(); // a reset from the pad must not strand a frozen day
  ship.position.set(0, 0, 0);
  ship.velocity.set(0, 0, 0);
  ship.quaternion.identity();
  ship.angularVelocity.set(0, 0, 0);
  ship.properAccel.set(0, 0, 0);
  restoreShiftables(); // planets, sun, stations, black hole + origin offset
  cancelAutopilot();
  heat = 0;
  burnedBySun = false;
  flash = 0;
  flashFade = 0;
  landState = null;
  landedPlanet = null;
  _padLocalDir.set(0, 0, 0);
  standing = false;
  standBlend = 0;
  closeCredits();
  closeArtView();
  setCockpitStanding(false);
  closeRadioPopup();
  closeVehicleMenu();
  resetPlayer();
  input.toggleInterior = false;
  // snap the lagging camera to the ship so it doesn't slerp from the horizon
  snapCamera(ship);
}

// Artwork the game shows but does not need to be playable: the paintings
// behind the outer-shell nebulae, and the photographs in the ship's corridor.
// Both used to load during module eval — two dozen full-size images between
// the player and the LAUNCH button — and now wait for the first idle moment
// of an actual flight. Idempotent on both sides, so every launch path can
// call it.
function loadOwnerArt() {
  const go = () => {
    startPaintingNebulaBuild();
    loadInteriorPictures();
  };
  if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 4000 });
  else setTimeout(go, 1500);
}

initMenu(() => {
  resetToStart();
  accumulator = 0;
  phase = 'fly';
  setPaused(false);
  hideMenu();
  startMusic(); // user's track, from the LAUNCH click gesture
  loadOwnerArt();
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
  if (contextLost) return; // don't re-arm: every draw into a lost context throws
  requestAnimationFrame(frame);
  let delta = (now - last) / 1000;
  last = now;
  const rawDelta = delta;
  if (delta > MAX_FRAME_DELTA) delta = MAX_FRAME_DELTA;
  // Feed the governor the true frame time. Not while paused or recording, and
  // not until every planet has swapped to baked terrain: the bake runs in
  // main-thread slices that would read as a slow GPU.
  governFrame(rawDelta, !paused && !isRecording() && terrainBaked());
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
    input.toggleBoard = false;
    input.photo = input.record = false;
    input.mouseX = input.mouseY = 0;
  }
  // "click to steer" hint only makes sense with the sim live and unpaused
  hintEl.classList.toggle('off', paused || (phase !== 'fly' && phase !== 'walk'));

  // Re-arm the on-foot chunk if its fetch failed. No-op once it is in; without
  // this a single failed load was permanent, and everything gated on it —
  // landing, docking, the sun's cottage — stayed broken until a reload.
  ensureWalkLoaded();

  // AO is only ever used on foot in a story world, so the moment the on-foot
  // chunk is in, quietly fetch the AO pass too — it is small, and having it
  // ready means the first landing darkens its corners on frame one instead of
  // popping a second later.
  if (walkLoaded() && !aoPass.loading) aoPass.load();

  // On-foot touch sticks (no-op on desktop). Runs before the walk step below so
  // the look travel it injects is consumed by the same stepWalk tick a mouse
  // delta would have fed. Flight needs nothing here — the 3D dashboard already
  // owns touch — so the sticks hide outside the walk phase.
  updateTouchControls(delta, phase, paused, standing);

  // Title screen: the view behind the menu pans slowly side to side instead
  // of sitting dead still. Launch resets the ship, so nothing carries over.
  if (phase === 'menu') {
    _menuQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, C.MENU_PAN_RATE * Math.cos(now * 0.0001) * rawDelta * MOTION_SCALE);
    ship.quaternion.multiply(_menuQ);
  }

  if (phase === 'fly') {
    // C: stand up out of the seat / sit back down at it. Standing is
    // blocked at warp (nobody walks at 10,000 u/s); sitting requires being
    // back at the chair. Consumed once per frame at the bottom of the loop.
    if (input.toggleInterior && !autopilotActive()) {
      if (!standing && !input.warp) {
        standing = true;
        loadInteriorPictures(); // no-op after the post-launch idle load
        openGallery(); // first stand-up fetches the collection
      }
      else if (standing && nearSeat()) {
        standing = false;
        closeCredits(); // never leave a popup up in the pilot seat
        closeArtView();
      }
    }
    // E while standing: read the plaque, look closer at a canvas, or close
    // whichever popup is up.
    // (Handled here because input.interact is consumed right after the
    // phase blocks, before the UI section below runs.)
    if (standing && input.interact) {
      if (isCreditsOpen()) closeCredits();
      else if (isArtViewOpen()) closeArtView();
      else if (standBlend > 0.5 && nearPlaque()) openCredits();
      else if (standBlend > 0.5) {
        const art = nearPainting();
        if (art) openArtView(art.file, art.title);
      }
    }
    setCockpitStanding(standing);
    standBlend = Math.min(
      Math.max(standBlend + ((standing ? 1 : -1) * delta) / C.STAND_TIME, 0),
      1
    );
    // Controls disengage early in the rise; the walk controller owns the
    // mouse from the same threshold, so it has exactly one consumer.
    const piloted = standBlend < 0.2;
    accumulator += delta;
    while (accumulator >= DT) {
      if (landState === 'auto') stepAutoLand(DT);
      else if (landState === 'landed') stepLanded(DT, piloted);
      else {
        // nav auto-warp drives the ship (turn + warp) before the normal step;
        // it suppresses player input, so stepShip flies the plotted course
        if (autopilotActive()) stepAutopilot(DT, heat);
        stepShip(DT, piloted);
        if (piloted && !autopilotActive()) checkTouchdown();
      }
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
      burnedBySun = true;
    } else if (
      overFloor < C.HEAT_ALTITUDE &&
      ship.velocity.length() > C.LAND_REGIME_SPEED
    ) {
      // Heat is a speed problem now: slow low flight is the landing regime
      // (hover, touch down, lift off); fast re-entry still burns.
      if (piloted) heat += delta / heatTotal;
      deathReason = 'RE-ENTRY FAILURE — HULL DESTROYED';
      burnedBySun = false;
    } else {
      heat -= delta / C.HEAT_COOL;
      if (heat <= 0) burnedBySun = false;
    }
    heat = Math.min(Math.max(heat, 0), 1);
    if (heat >= 1) {
      // The star is the one death that isn't one — same flash, different door.
      phase = burnedBySun ? 'ascend' : 'explode';
      warpT = 0;
    }
    // G: landed — step out onto the surface. Auto-landing — abort. In free
    // flight — start the
    // assisted auto-land toward the flattest nearby ground. Only from the
    // pilot seat — sit back down before stepping outside.
    if (input.toggleWalk && !standing && standBlend < 0.05 && !autopilotActive()) {
      if (landState === 'landed') {
        const floor = nearestTerraFloor(ship.position);
        if (floor) {
          landState = null;
          landedPlanet = null;
          _padLocalDir.set(0, 0, 0);
          beginWalk(floor.planet);
          heat = 0;
          phase = 'walk';
          accumulator = 0;
        }
      } else if (landState === 'auto') {
        // Wave off: hand control back with a gentle outward drift.
        landState = null;
        _lv0.subVectors(ship.position, landedPlanet.body.position).normalize();
        ship.velocity.copy(_lv0).multiplyScalar(C.TAKEOFF_KICK);
        landedPlanet = null;
        _padLocalDir.set(0, 0, 0);
      } else {
        const floor = nearestTerraFloor(ship.position);
        if (
          floor &&
          floor.altitude < C.AUTOLAND_ALTITUDE &&
          ship.velocity.length() < C.AUTOLAND_SPEED
        ) {
          beginAutoLand(floor);
        }
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
    // The actuality hyper-holo-grid finale loops the whole game back to start
    // (0 = repeat program): board off, reset to the spawn, resume flight.
    if (walkPendingReset()) {
      endWalk();
      resetToStart();
      snapCamera(ship);
      phase = 'fly';
      accumulator = 0;
    } else {
      // E — talk to the focused citizen/creature, or advance the open dialogue.
      if (input.interact) walkInteract();
      if (input.toggleWalk) {
        if (nearParkedShip()) {
          if (cottageActive()) {
            // Leaving the cottage is a transition, not a liftoff: flash white
            // first, and do the teardown + reset under it ('depart' below).
            phase = 'depart';
            warpT = 0;
          } else {
            // Board the ship and hand control back to flight.
            endWalk();
            snapCamera(ship); // resync the camera-lag state exitWalk set directly
            phase = 'fly';
            accumulator = 0;
          }
        } else {
          // You walked here — the ship didn't. Go back for it.
          promptReturnToShip();
        }
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
    flash = Math.min(warpT / (C.EXPLODE_TIME * 0.35), 1);
    if (warpT >= C.EXPLODE_TIME) {
      phase = 'menu';
      showMenu('dead', deathReason);
    }
  } else if (phase === 'ascend') {
    // The hull failed at the star. Identical ramp to 'explode' — same curve,
    // same shake — right up to full white. Then, instead of the death menu,
    // the cottage is built underneath and 'walk' takes over; the white fades
    // off it slowly. If the lazy walk chunk somehow isn't in yet, hold at 1
    // and keep trying: a beat too long on white beats dropping into nowhere.
    warpT += delta;
    flash = Math.min(warpT / C.ASCEND_FLASH, 1);
    if (flash >= 1) {
      // enterHeaven() is a predicate re-polled every frame, not a timer: false
      // until the lazy walk chunk has landed. Two things made that never
      // happen — a chunk fetch that failed (now retried, see walkLazy.js) and
      // a throw inside the heavy cottage build. Either one pinned the screen at
      // full amber with no way out: 'ascend' consumes no input, and Backspace
      // only pauses in 'fly'/'walk'. So bound the wait and always leave a door.
      ascendWait += delta;
      let arrived = false;
      try {
        arrived = enterHeaven();
      } catch (err) {
        console.error('[ascend] cottage build failed', err);
        ascendBroken = true;
      }
      if (arrived) {
        phase = 'walk';
        flashFade = C.ASCEND_FADE;
        warpT = 0;
        accumulator = 0;
        ascendWait = 0;
      } else if (ascendBroken || ascendWait >= C.ASCEND_GIVE_UP) {
        // Give back the death menu rather than a screen that never resolves.
        // enterHeaven may have hidden the universe on its way out, so put it
        // back before the menu uses it as a backdrop. Say what actually went
        // wrong: with the walk chunk dead nothing can land either, and a
        // reload is the only thing that re-fetches it.
        releaseIsolation(renderer, aoPass, camera, bloomPass);
        phase = 'menu';
        showMenu('dead', 'THE FAR SIDE DIDN\'T LOAD — RELOAD TO TRY AGAIN');
        flash = 0;
        flashFade = 0;
        ascendWait = 0;
        ascendBroken = false;
      }
    }
  } else if (phase === 'depart') {
    // Boarding on the pad. White out, tear the world down and reset behind it,
    // then fade up on Terra dead ahead — the same view the game opened on.
    warpT += delta;
    flash = Math.min(warpT / C.DEPART_FLASH, 1);
    if (flash >= 1) {
      endWalk(); // releaseIsolation + exitWalk -> the cottage's own teardown
      resetToStart(); // ship to the origin, Terra 3500 u dead ahead
      flash = 1; // resetToStart cleared it, but we are still under the white
      flashFade = C.DEPART_FADE;
      phase = 'fly';
      warpT = 0;
      accumulator = 0;
    }
  }
  // Every other phase: let whatever the last transition left on screen fade.
  if (phase !== 'explode' && phase !== 'ascend' && phase !== 'depart' && flash > 0) {
    flash = flashFade > 0 ? Math.max(0, flash - delta / flashFade) : 0;
    if (flash === 0) flashFade = 0;
  }
  // menu phase: nothing to advance; the scene idles as a backdrop.
  // Camera: P photo / R record, active in gameplay unless the gallery is open.
  if ((phase === 'fly' || phase === 'walk') && !isGalleryOpen()) {
    if (input.photo) requestPhoto();
    if (input.record && !(phase === 'walk' && walkCombatActive())) toggleRecording();
  }
  // I opens the vehicle selector, on foot only (flight ignores the press).
  if (input.toggleVehicles) {
    input.toggleVehicles = false;
    if (phase === 'walk') toggleVehicleMenu();
  }
  // Consume the edge-triggered toggles exactly once per frame, in any phase.
  // (stepWalk consumes toggleBoard earlier in the frame when it applies —
  // zeroing here just keeps a B pressed in flight from firing on landing.)
  input.toggleWalk = false;
  input.toggleInterior = false;
  input.toggleView = false;
  input.toggleBoard = false;
  input.interact = false;
  input.photo = false;
  input.record = false;
  input.reload = false; // walk.js consumes it first when a warzone is live
  input.weaponSlot = 0; // likewise
  input.weaponCycle = 0;
  collapsePass.enabled = warp > 0.001;
  collapsePass.uniforms.uProgress.value = warp;
  // heat 0..0.5 = warning banner; 0.5..1 = the flashing cockpit countdown.
  // Nothing about the burn survives into the cottage: no vignette, no cracks,
  // no countdown. The place is supposed to be quiet.
  const heatShown = phase === 'menu' || phase === 'walk' || phase === 'depart' ? 0 : heat;
  const countdownLeft =
    phase === 'fly' && heat >= 0.5
      ? (1 - heat) * (C.HEAT_WARN_TIME + C.HEAT_COUNTDOWN)
      : phase === 'explode' || phase === 'ascend'
        ? 0.4 // hold "1" through the flash
        : null;
  updateHeatUI(heatShown, C.CRACK_AT, flash, countdownLeft);

  updateOrigin(ship);
  if (phase === 'walk') {
    // On foot on a planet — the walker owns the camera (walk.js).
    updateWalkCamera(camera, delta);
  } else {
    updateCamera(ship);
    // interior rides the ship; the walk camera blends over the seated pose
    // (shake and turbulence below still add on top — the corridor rattles too)
    updateInterior(ship, delta, standBlend > 0.001 && phase === 'fly');
    updateInteriorCamera(ship, delta, standBlend, standBlend >= 0.2 && phase === 'fly');
  }
  // hull-stress shake: time-hashed jitter, ramping in past half heat
  // Trauma: a kick when warp engages or drops out, squared so it dies away
  // smoothly. It adds to the hull-stress term and shares its jitter.
  if (input.warp !== wasWarping) {
    wasWarping = input.warp;
    if (phase === 'fly') trauma = Math.min(trauma + C.WARP_KICK, 1);
  }
  trauma = Math.max(trauma - C.TRAUMA_DECAY * delta, 0);
  const shake =
    Math.max(heat - 0.5, 0) * 2 + (phase === 'explode' || phase === 'ascend' ? 1.5 : 0) + trauma * trauma * 3;
  if (shake > 0 && !paused) {
    const s = shake * 0.02 * MOTION_SCALE;
    camera.position.x += Math.sin(now * 0.093) * s;
    camera.position.y += Math.sin(now * 0.127 + 2.1) * s;
    camera.position.z += Math.sin(now * 0.071 + 4.4) * s;
  }
  updateCockpit3d(ship, delta, phase);
  // The 3D cockpit is the resting view; boost/warp lean the camera forward so
  // the dashboard sinks out of frame for the clear window. dashBlend() (1 at
  // rest, 0 at full-window) drives the DOM dash panels (capture) the way the
  // frame image's blend used to. On foot on a planet the whole ship overlay
  // hides; standing in the ship draws the interior around the cockpit.
  const dash = dashBlend();
  if (phase === 'walk') {
    cockpitRig.visible = false;
    cockpitPass.enabled = false;
    cockpitPass.clearDepth = true;
    interiorPass.enabled = false;
    closeRadioPopup(); // a flight dialog has no business over the walk HUD
    // "E — TALK" while an alien/creature is in range (dialogue hints are on
    // the dialogue panel itself). Reuses the interior prompt element.
    setPrompt(walkPromptText());
  } else {
    interiorPass.enabled = standBlend > 0.001;
    cockpitPass.enabled = !(debug && debug.hideCockpit);
    cockpitPass.clearDepth = !interiorPass.enabled;
    cockpitRig.visible = true; // the camera zoom handles the full-window view
    // the C prompt: a launch reminder while seated, "SIT" back at the chair;
    // standing, "E — READ" in front of the plaque (E handled in the fly block)
    if (phase === 'fly') {
      if (standing) {
        let prompt = null;
        if (standBlend > 0.5 && !isCreditsOpen() && !isArtViewOpen()) {
          if (nearSeat()) prompt = 'C — SIT';
          else if (nearPlaque()) prompt = 'E — READ';
          else {
            const art = nearPainting();
            if (art) prompt = art.prompt || (art.prompt = `${art.title.toUpperCase()} · E — VIEW`);
          }
        }
        setPrompt(prompt);
      } else {
        // seated: landing prompts
        let prompt = null;
        if (landState === 'landed') prompt = 'G — STEP OUT · W — LIFT OFF';
        else if (landState === 'auto') prompt = 'AUTO-LANDING · G — ABORT';
        else {
          const floor = nearestTerraFloor(ship.position);
          if (
            floor &&
            floor.altitude < C.AUTOLAND_ALTITUDE &&
            ship.velocity.length() < C.AUTOLAND_SPEED
          )
            prompt = 'G — LAND';
        }
        // No "C — STAND UP" reminder: the dash C button already shows it.
        setPrompt(prompt);
      }
    } else {
      setPrompt(null);
    }
  }
  // Isolated world: the space sim is switched off (src/isolate.js) and the whole
  // frame goes to the one place the player is standing. Only the planet under
  // their feet keeps updating — it still has to spin.
  if (isolated.active) {
    // A null keep means the cottage: nowhere near a planet, so there is not
    // even one left to spin. Skip the pass entirely.
    if (isolated.keep) updatePlanets(now / 1000, camera.position, isolated.keep);
  } else {
    updateStarfield(camera, Q.pixelRatio, ship.velocity);
    updateSun(now / 1000);
    updateNebula(camera);
    updateDeepNebula(renderer, camera);
    updatePlanets(now / 1000, camera.position);
    updateStations(now / 1000, ship.position);
  }
  // nav AFTER the stations are placed: a reset snaps orbiting stations back
  // to their snapshot spot for one frame, and a discovery check reading that
  // stale position would log everything sitting at the spawn point
  updateNav(ship, delta, phase === 'fly');
  // hologram AFTER updateStations so orbiting stations plot at their live spot;
  // usable only when the pilot is seated, flying, and not already auto-warping
  const holoActive =
    phase === 'fly' && !paused && !standing && landState === null && !autopilotActive();
  updateHolonav(ship, delta, holoActive);
  // First-flight coaching. "Turning" is read off the ship, not the mouse, so
  // it counts touch drags and does not care when input deltas are consumed.
  _coach.flying = phase === 'fly' && !paused && !standing;
  _coach.turning = ship.angularVelocity.lengthSq() > 0.0025;
  _coach.navOpen = isHoloOpen();
  _coach.landed = landState === 'landed';
  updateCoach(delta, _coach);
  updateCompass(phase === 'walk' ? walkBearing() : null);
  updateControls(phase);
  setObjective(phase === 'walk' ? walkObjective() : null);
  updateCapture(phase, dash, delta);
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert(); // fresh for projection
  // The last universe system: the disc animation and the lensing uniforms. Not
  // free even with the horizon hidden, and nothing on a story world reads it.
  // Switch the lens off explicitly rather than leaving the last frame's screen
  // position frozen in the uniforms while the player walks away from it.
  if (isolated.active) lensPass.uniforms.uEnabled.value = 0;
  else updateBlackHole(camera, lensPass.uniforms, now / 1000);

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
  // Isolated worlds author their own sky and their own aerial perspective
  // (per-zone fog), so the flight sim's atmospheric-entry wash is switched off
  // there rather than fighting it. Gated on the SURFACE stage, not the universe
  // freeze: between touchdown and stepping out there is no world sky yet, and
  // this haze is the only thing drawing one through the canopy.
  // flight sound: engine with thrust, the warp drive, air and hull heat
  _sfx.active = phase === 'fly' && !paused;
  _sfx.thrust = input.forward ? 1 : input.reverse ? 0.5 : 0;
  _sfx.boost = input.forward;
  _sfx.warp = input.warp && !standing && landState === null;
  _sfx.atmo = _atmo.atmo;
  _sfx.speed = Math.min(ship.velocity.length() / C.SOFT_CAP_SPEED, 1);
  _sfx.heat = heat;
  _sfx.standing = standing;
  if (standing || landState !== null) _sfx.thrust = 0;
  updateSfx(delta, _sfx);
  skyfogPass.enabled = _atmo.atmo > 0.001 && !isolated.surface;
  if (skyfogPass.enabled) {
    _up.set(_atmo.upX, _atmo.upY, _atmo.upZ).normalize();
    const su = skyfogPass.uniforms;
    su.uAtmo.value = _atmo.atmo;
    su.uDay.value = Math.min(Math.max(_up.dot(_atmo.p.sunDir ?? SUN) * 0.5 + 0.5, 0), 1);
    su.uSkyDay.value.set(_atmo.p.cfg.skyColor());
    su.uDensity.value = C.SKY_DENSITY;
    su.uNear.value = camera.near;
    su.uFar.value = camera.far;
    su.uHazeDist.value = C.SKY_HAZE_DIST; // live-tunable, like uDensity
    // planet-up expressed in view space, for horizon-weighted haze
    _invQuat.copy(camera.quaternion).invert();
    su.uUpView.value.copy(_up).applyQuaternion(_invQuat);
    su.uSunView.value.copy(_atmo.p.sunDir ?? SUN).applyQuaternion(_invQuat);
    su.uAspect.value = camera.aspect;
    su.uTanHalf.value = Math.tan((camera.fov * Math.PI) / 360);
  }
  // Underwater dive grading now lives in world/planetsky.js setUnderwater():
  // every divable world holds the isolation surface stage while walked, which
  // disables skyfogPass above — the old uniform hijack here could never fire.

  // live panel bindings (GDD 2.3): cheap scalar copies each frame. Skipped once
  // a world module owns the sky, which brings its own bloom calibration
  // (src/isolate.js) — the space threshold assumes a black sky and would white
  // out a daylit one. Still live while parked in the seat, where the sky is
  // still the flight sim's.
  if (!isolated.surface) {
    bloomPass.threshold = C.BLOOM_THRESHOLD;
    bloomPass.strength = C.BLOOM_STRENGTH;
  }
  bloomPass.radius = C.BLOOM_RADIUS;
  // Warp widens the colour split and adds the radial smear. Off on an isolated
  // world, where the starfield (and so warpAmount) is not being updated.
  const warpFx = isolated.active ? 0 : warpAmount();
  aberrationPass.uniforms.uStrength.value =
    (C.CA_STRENGTH * 8.0 * (1 + C.WARP_CA_BOOST * warpFx * MOTION_SCALE)) / window.innerHeight;
  aberrationPass.uniforms.uWarp.value = C.WARP_SMEAR * warpFx * MOTION_SCALE;

  if (phase === 'walk') walkPreRender(renderer); // world modules draw to their RTs
  composer.render();
  // The warzone rifle draws over the finished frame (its own scene, depth
  // cleared) — after the post chain, before the photo/recording grabs.
  if (phase === 'walk') walkPostRender(renderer);
  // Photo grab must be in this task — the canvas has no preserveDrawingBuffer.
  capturePendingPhoto();
  // Same constraint: composite the video frame while the backbuffer is intact.
  updateRecordingFrame(now);
}
requestAnimationFrame(frame);
// Bake terra vertex displacement into the geometry in background time
// slices (see planet.js) — the GPU displacement path covers until each
// planet swaps over.
startPlanetBake();
