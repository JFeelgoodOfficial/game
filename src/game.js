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
import { initInput, input, setPointerLockGate, throttleAxis } from './input.js';
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
import { showViewToast } from './walkview.js';
import { initHoloPanel, openHoloPanel, closeHoloPanel, isHoloPanelOpen, holoPanelDebug } from './holoPanel.js';
import {
  initTenretni, updateTenretni, tenretniHolding, stepTenretniHold, resetTenretni,
  tenretniFx, tenretniDebug, capitalDock, tenretniSailVelocity, holoPrograms, holoWorld,
  nearestVessel, vesselSite, holdVessel, placeFleets, wormholeCapture, farGate, enterFar, farSite, farDoor,
} from './tenretniLazy.js';
import {
  interiorScene,
  initInterior,
  loadInteriorPictures,
  openGallery,
  nearPainting,
  nearTank,
  interiorInfo,
  placePlayer,
  updateInterior,
  updateInteriorCamera,
  nearSeat,
  nearPlaque,
  resetPlayer,
  playerState,
  setPrompt,
  onPatioDeck,
  nearHoloPanel,
  holoPanelSpot,
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
  drainedWorldBelow,
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
  enterSkyWalk,
  skyActive,
  skyFell,
  enterCapitalWalk,
  capitalActive,
  enterCoinWalk,
  coinActive,
  coinBeginLeave,
  coinLeft,
  cottageActive,
} from './walkLazy.js';
import { initJournal, journalState, questStage, setQuestStage } from './journal.js';
import { initInventory, inventoryState } from './inventory.js';
import { CITIES, citiesForWorld, padLocalDir } from '../world/cityRegistry.js';
import { initSun, updateSun, sunAltitude, sun } from './sun.js';
import { initStations, updateStations, stations } from './stations.js';
import { createSkyCity } from '../world/skycity.js';
import { createReachShip } from '../world/reachship.js';
import { createShatter } from '../world/shatter.js';
import { CHARGE_QUEST } from '../world/reachtube.js';
import { createCoinWorld, HEADS } from '../world/coinworld.js';
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
import { touchify } from './touchText.js';
import { initCapture, capturePendingPhoto, updateCapture, updateRecordingFrame, requestPhoto, toggleRecording, isGalleryOpen, isRecording } from './capture.js';
import { MOTION_SCALE } from './motion.js';
import { initSfx, updateSfx, sfxState } from './sfx.js';
import { initCoach, updateCoach, coachState } from './coach.js';
import { initCredits, openCredits, closeCredits, isCreditsOpen } from './credits.js';
import { initArtView, openArtView, closeArtView, isArtViewOpen } from './artView.js';
import {
  initTerrariumView, openTerrariumView, closeTerrariumView, isTerrariumViewOpen,
} from './terrariumView.js';
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
// The Sky City: the one place on the gas giant a ship can set down. Built here,
// in the boot bundle, because you see it from orbit long before you walk it.
const saturnia = planets.find((p) => p.cfg.name === 'saturnia');
const skyCity = createSkyCity(saturnia);
// Neptunia's factory ship rides real swell: a displaced sea patch at its site.
const neptunia = planets.find((p) => p.cfg.name === 'neptunia');
const reachDef = CITIES.find((c) => c.id === 'neptunia-indigo');
const reachShip = createReachShip(neptunia, reachDef);
const reachSea = reachShip.sea;
// ...and what Neptunia becomes when the governor's charge goes off. Applied at
// boot for a save in which it already has (see the initJournal call below).
const shatter = createShatter(neptunia, reachDef.site, reachShip);
// stevenlacey, the coin world: likewise seen (tumbling) long before it is landed on.
const coin = createCoinWorld(scene);

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
initTerrariumView();
initHoloPanel();
initSfx();
initJournal();
initTenretni({ scene, planets, camera, coin }); // the governor's secret; reads the journal
// A save in which the charge already went off: Neptunia stays broken.
if (questStage(CHARGE_QUEST) === 'blown') shatter.apply();
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
    // Sky City (world/skycity.js). skyApproach() drops the ship into Saturnia's
    // air shell opposite the city (side = 1) or beside it (side = 0) so the
    // capture fires on the next tick; skyDock() skips the flight entirely.
    skyCity,
    skyState: () => ({ landState, skyLanding, skyArmed: DOCKS[0].armed, dock: dock.id, autoT, phase, flash }),
    skyApproach(side = 1, speed = 300) {
      dock = DOCKS[0];
      skyPadPose();
      const d = _skyPad.clone().normalize().multiplyScalar(side ? -1 : 1);
      if (!side) d.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);
      ship.position.copy(saturnia.body.position).addScaledVector(d, skyShellRadius(DOCKS[0]) + 150);
      ship.velocity.copy(d).multiplyScalar(-speed);
      DOCKS[0].armed = true;
      landState = null;
      skyLanding = false;
    },
    skyDock() {
      setOnSkyPad(DOCKS[0]);
    },
    // The worldship's capital (src/tenretni.js): park on its pad / step out.
    capitalDock() {
      if (!capitalDock()) return false;
      setOnSkyPad(CAPITAL_DOCK);
      return true;
    },
    // The war fleets: park on / step out onto the ship with this id.
    vesselDock(id) {
      const v = tenretniDebug().fleets()?.ships.find((x) => x.id === id);
      if (!v || !v.alive) return false;
      VESSEL_DOCK.vessel = v;
      VESSEL_DOCK.planet.body.position = v.group.position;
      VESSEL_DOCK.planet.radius = v.cls.radius * 0.8;
      setOnSkyPad(VESSEL_DOCK);
      return true;
    },
    // The far side's landing (src/farside.js): fly the approach / park on the
    // pad / step out / go through a door ('city' in, 'pad' back out).
    farLanding: {
      approach() {
        if (!aimLandingDock()) return false;
        const g = farSite('pad').group;
        ship.position.copy(g.position);
        ship.position.y += 700;
        ship.position.z += 70;
        ship.velocity.set(0, -60, 0);
        return true;
      },
      dock() {
        if (!aimLandingDock()) return false;
        setOnSkyPad(LANDING_DOCK);
        return true;
      },
      stepOut() {
        if (dock !== LANDING_DOCK || !LANDING_DOCK.stepOut()) return false;
        platformDock = LANDING_DOCK;
        landState = null;
        landedPlanet = null;
        skyLanding = false;
        phase = 'walk';
        return true;
      },
      door(to) {
        if (phase !== 'walk' || doorT >= 0) return false;
        doorTo = to;
        doorT = 0;
        return true;
      },
      state: () => ({ doorT, doorTo, dock: dock.id, platform: platformDock ? platformDock.id : null, isolated: { active: isolated.active, surface: isolated.surface }, far: camera.far }),
    },
    vesselStepOut() {
      if (dock !== VESSEL_DOCK || !VESSEL_DOCK.stepOut()) return false;
      platformDock = VESSEL_DOCK;
      landState = null;
      landedPlanet = null;
      skyLanding = false;
      phase = 'walk';
      return true;
    },
    capitalStepOut() {
      platformDock = CAPITAL_DOCK;
      if (!capitalDock() || !enterCapitalWalk(capitalDock())) return false;
      landState = null;
      landedPlanet = null;
      skyLanding = false;
      phase = 'walk';
      return true;
    },
    skyStepOut() {
      if (!enterSkyWalk(skyCity)) return false;
      landState = null;
      landedPlanet = null;
      skyLanding = false;
      phase = 'walk';
      return true;
    },
    // stevenlacey (world/coinworld.js). approach(face) drops the ship just
    // outside the capture radius over that face, closing; dock(face) skips the
    // flight and parks it on the face.
    coin: {
      world: coin,
      state: () => ({ landState, coinLanding, coinFace, coinArmed, coinLiftT, autoT, phase, ...coin.state() }),
      approach(face = HEADS, speed = 200) {
        coin.release(true);
        coin.faceFrame(face, _lv0, _lv1, _lv2);
        ship.position.copy(coin.group.position).addScaledVector(_lv2, C.COIN_CAPTURE + 120);
        ship.velocity.copy(_lv2).multiplyScalar(-speed);
        coinArmed = true;
        landState = null;
        coinLanding = false;
      },
      dock(face = HEADS) {
        setOnCoinPad(face);
      },
      // straight into the 2D world on that face, skipping the flight
      enter(face = HEADS) {
        setOnCoinPad(face);
        if (!enterCoinWalk(coin, face, camera)) return false;
        landState = null;
        coinLanding = false;
        phase = 'walk';
        accumulator = 0;
        return true;
      },
    },
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
      nearTank: () => nearTank(),
      tankView: () => isTerrariumViewOpen(),
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
    tenretni: tenretniDebug(),
    holodeck: {
      active: () => (holo ? holo.id : null),
      start: (id) => startHolo(id),
      end: () => endHolo(),
      programs: () => holoPrograms(),
      panel: holoPanelDebug,
      near: () => nearHoloPanel(),
      spot: () => holoPanelSpot(),
    },
    cockpit: cockpitDebug(),
    holo: holonavDebug(),
    navMenu: navMenuDebug(),
    autopilot: {
      active: autopilotActive,
      start: (id) => startAutoWarp(getBodies().find((b) => b.id === id)),
      cancel: cancelAutopilot,
    },
    // As if the pilot had just flown into the wormhole's mouth (the ending).
    farArrive: () => {
      phase = 'collapse';
      warpT = 0;
      cycling = true;
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
    // The Indigo Reach's sea (world/seapatch.js). reachView parks the ship
    // `dist` out from the ship's site on anchor bearing `bearing` (0 = off the
    // bow, +Z), `height` above the still sea, looking at the site; `sunny`
    // turns the planet so the site sits under the sun.
    reachSea,
    reachShip,
    // The charge mission: reachCharge('go') unseals the lift, reachCharge()
    // clears it; reachPlace puts the walker at an ANCHOR-frame point (the
    // ship's static frame: +Z the bow, y = 0 the still sea); reachBlow() is the
    // arm button; shatter is the broken-planet state.
    shatter,
    // Side-on to the break: both halves in frame. az swings round the blast axis.
    shatterView(distR = 3.4, az = 0, lift = 0.25) {
      const p = neptunia, q = p.surface.getWorldQuaternion(new THREE.Quaternion());
      const d = shatter.T1.clone().multiplyScalar(Math.cos(az)).addScaledVector(shatter.T2, Math.sin(az)).addScaledVector(shatter.N, lift).normalize().applyQuaternion(q);
      const look = p.group.position.clone().addScaledVector(shatter.N.clone().applyQuaternion(q), p.radius * 0.7);
      ship.position.copy(look).addScaledVector(d, p.radius * distR);
      ship.velocity.set(0, 0, 0);
      ship.angularVelocity.set(0, 0, 0);
      ship.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(ship.position, look, new THREE.Vector3(0, 1, 0)));
      debug.paused = true;
      snapCamera(ship);
    },
    reachQuest(id, stage) { setQuestStage(id, stage); return questStage(id); },
    reachCharge(stage) { setQuestStage(CHARGE_QUEST, stage); return questStage(CHARGE_QUEST); },
    reachPlace(x, y, z) {
      const a = reachShip.anchor;
      a.updateWorldMatrix(true, false);
      ship.position.set(x, y, z).applyMatrix4(a.matrixWorld);
      ship.velocity.set(0, 0, 0);
    },
    reachBlow() { reachShip.tube.module.interact({ kind: 'arm' }); },
    reachState: () => ({ landState, skyLanding, armed: DOCKS[1].armed, dock: dock.id, autoT, phase, frozen: !!neptunia.spinFrozen }),
    // Drop the ship into Neptunia's air shell beside the Reach (side 0) or on
    // the far side of the planet (side 1), inbound: capture fires next tick.
    reachApproach(side = 0, speed = 300) {
      dock = DOCKS[1];
      skyPadPose();
      const d = _skyPad.clone().normalize().multiplyScalar(side ? -1 : 1);
      if (!side) d.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);
      ship.position.copy(neptunia.body.position).addScaledVector(d, skyShellRadius(DOCKS[1]) + 150);
      ship.velocity.copy(d).multiplyScalar(-speed);
      debug.paused = false;
      DOCKS[1].armed = true;
      landState = null;
      skyLanding = false;
    },
    // On the pad, landed, without flying it.
    reachDock() {
      debug.paused = false;
      setOnSkyPad(DOCKS[1]);
      snapCamera(ship);
    },
    // Step out onto the flight deck without flying the landing.
    reachStepOut() {
      debug.reachView(0, 30, 0, true);
      const pp = reachShip.padPose({ pad: new THREE.Vector3(), padMean: new THREE.Vector3(), up: new THREE.Vector3(), upMean: new THREE.Vector3(), quat: new THREE.Quaternion(), quatMean: new THREE.Quaternion() });
      ship.position.copy(neptunia.group.position).add(pp.padMean).addScaledVector(pp.upMean, 6);
      debug.paused = false;
      landState = null;
      landedPlanet = null;
      _padLocalDir.set(0, 0, 0);
      beginWalk(neptunia);
      heat = 0;
      phase = 'walk';
      accumulator = 0;
    },
    reachView(dist = 300, height = 60, bearing = 0, sunny = true) {
      const p = neptunia;
      if (sunny) {
        const sd = p.sunBase, s = reachDef.site;
        // rotate the site about +Y onto the sun's meridian
        const ang = Math.atan2(s.z, s.x) - Math.atan2(sd.z, sd.x);
        p.spinPhase = ang - (performance.now() / 1000) * p.cfg.spin();
        p.spinNeedsResync = false;
        for (const m of p.spinning) m.rotation.y = ang;
        p.group.updateMatrixWorld(true);
      }
      setPlanetSpinFrozen(p, true); // or the site turns away from under the pose
      const q = p.surface.getWorldQuaternion(new THREE.Quaternion()).multiply(reachSea.anchorQ);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const out = new THREE.Vector3(Math.sin(bearing), 0, Math.cos(bearing)).applyQuaternion(q);
      const anchor = p.group.position.clone().addScaledVector(up, reachSea.rw);
      ship.position.copy(anchor).addScaledVector(out, dist).addScaledVector(up, height);
      ship.velocity.set(0, 0, 0);
      ship.angularVelocity.set(0, 0, 0);
      ship.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(ship.position, anchor, up));
      debug.paused = true; // hold the pose: gravity would have it otherwise
      snapCamera(ship);
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
        // exposure / bloom / fog: who owns the look right now (flight, a
        // surface sky, or the Emberdeep) — and whether it was handed back
        exposure: renderer.toneMappingExposure,
        bloom: { threshold: bloomPass.threshold, strength: bloomPass.strength },
        fog: scene.fog ? { density: scene.fog.density ?? null, color: '#' + scene.fog.color.getHexString() } : null,
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
// The wormhole (src/tenretniLazy.js farGate/enterFar): true once the pilot is
// in its mouth and the stretch is held; 'white' while the screen whites out
// over the swap. False again on the far side.
let cycling = false;
let farT = 0; // seconds into the white
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
  skyLanding = false;
  coinLanding = false;
  _padLocalDir.set(0, 0, 0);
  cancelAutopilot();
  closeCredits();
  closeArtView();
  closeTerrariumView();
  closeHoloPanel();
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

// --- Sky City landing (world/skycity.js) -------------------------------------
// Saturnia has no ground, so none of the terrain landing applies. Instead the
// planet captures the ship: cross into its air shell and the autopilot flies
// you round to the city and sets you on the pad. It reuses landState ('auto' /
// 'landed') with skyLanding set, so prompts, heat and the camera need no new
// cases. skyArmed is the latch that stops a liftoff being re-captured on the
// spot: it only resets once the ship has climbed clear of the shell.
let skyLanding = false;
let skyArcFrac = 0.7; // share of the auto-land spent on the arc (rest: descent)
let skyFallT = -1; // >= 0 while the white is rising over a fall from the city
let chargeT = -1; // >= 0 while the white is rising from the Reach's charge
const _skyUp = new THREE.Vector3();
const _skyPad = new THREE.Vector3(); // pad rest point, offset from planet centre
const _skyHover = new THREE.Vector3(); // above the pad, offset from planet centre
const _skyStartDir = new THREE.Vector3();
const _skyAxis = new THREE.Vector3();
const _skyQuat = new THREE.Quaternion();
let skyStartR = 0;
let skyArcAng = 0;

// A pad that rides a swell has two poses: the MEAN one (_skyPad, _skyHover,
// _landUprightQuat — the approach aims at these, so the arc ends on a still
// point) and the LIVE one (_skyPadLive, _skyQuatLive — where the deck is this
// tick, which the last of the descent and the parked ship follow). For the Sky
// City the two are the same.
const _skyPadLive = new THREE.Vector3();
const _skyQuatLive = new THREE.Quaternion();
const _reachPose = {
  pad: new THREE.Vector3(), padMean: new THREE.Vector3(), up: new THREE.Vector3(), upMean: new THREE.Vector3(),
  quat: new THREE.Quaternion(), quatMean: new THREE.Quaternion(),
};
const _noseToBow = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

// The places that capture a ship and land it for you. Each dock's pose() fills
// the scratch above: where the ship rests on the pad and how it sits, as
// offsets from the planet centre (which is what survives a floating-origin
// rebase mid-arc). `armed` is the latch that stops a liftoff being re-captured
// on the spot. `freeze`: the pad rides a spinning planet, so the world is held
// still from capture to liftoff, as on any terra landing.
const DOCKS = [
  {
    id: 'sky', planet: saturnia, armed: true, freeze: false,
    approach: 'SKY CITY APPROACH CONTROL — WE HAVE YOUR HELM',
    welcome: 'SKY CITY — WELCOME ABOARD',
    label: 'AUTO-LANDING · SKY CITY',
    // +Y along the city's up, nose toward the city centre
    pose() {
      const g = skyCity.group;
      _skyUp.set(0, 1, 0).applyQuaternion(g.quaternion);
      _skyPad.copy(skyCity.pad).applyQuaternion(g.quaternion).add(g.position)
        .addScaledVector(_skyUp, C.PARK_LIFT);
      _skyHover.copy(_skyPad).addScaledVector(_skyUp, C.SKY_HOVER);
      _landUprightQuat.copy(g.quaternion);
      _skyPadLive.copy(_skyPad);
      _skyQuatLive.copy(_landUprightQuat);
    },
    stepOut: () => enterSkyWalk(skyCity),
  },
  {
    // The Indigo Reach's flight deck (world/reachship.js): same capture, same
    // arc, onto a pad that heaves with the sea.
    id: 'reach', planet: neptunia, armed: true, freeze: true,
    approach: 'INDIGO REACH FLIGHT DECK — WE HAVE YOUR HELM',
    welcome: 'INDIGO REACH — WELCOME ABOARD',
    label: 'AUTO-LANDING · INDIGO REACH',
    pose() {
      const o = reachShip.padPose(_reachPose);
      _skyUp.copy(o.upMean);
      _skyPad.copy(o.padMean).addScaledVector(_skyUp, C.PARK_LIFT);
      _skyHover.copy(_skyPad).addScaledVector(_skyUp, C.REACH_HOVER);
      _landUprightQuat.copy(o.quatMean).multiply(_noseToBow); // nose to the bow, at the house
      _skyPadLive.copy(o.pad).addScaledVector(o.up, C.PARK_LIFT);
      _skyQuatLive.copy(o.quat).multiply(_noseToBow);
    },
    // An ordinary town walk (src/walk.js adopts the ship as its city).
    stepOut: () => {
      if (!walkLoaded()) return false;
      beginWalk(neptunia);
      return true;
    },
  },
  {
    // The capital of the worldship terra becomes (src/tenretni.js,
    // world/capital.js). It does not exist until that story has run —
    // capitalDock() is null until then, and checkSkyCapture skips it. The
    // world has stopped turning by then, so nothing needs freezing; and the
    // platform rides terra's group, so the pose follows it on a voyage.
    id: 'capital', planet: planets.find((p) => p.cfg.name === 'terra'), armed: false, freeze: false,
    approach: 'TENRETNI CAPITAL — YOUR HELM IS OURS',
    welcome: 'TENRETNI CAPITAL — YOU ARE EXPECTED',
    label: 'AUTO-LANDING · TENRETNI CAPITAL',
    pose() {
      const g = capitalDock().group;
      _skyUp.set(0, 1, 0).applyQuaternion(g.quaternion);
      _skyPad.copy(capitalDock().pad).applyQuaternion(g.quaternion).add(g.position)
        .addScaledVector(_skyUp, C.PARK_LIFT);
      _skyHover.copy(_skyPad).addScaledVector(_skyUp, C.SKY_HOVER);
      _landUprightQuat.copy(g.quaternion);
      _skyPadLive.copy(_skyPad);
      _skyQuatLive.copy(_landUprightQuat);
    },
    stepOut: () => enterCapitalWalk(capitalDock()),
  },
  {
    // A warship or freighter of the war fleets (src/fleets.js). One entry
    // serves them all: `vessel` is whichever ship is nearest, re-chosen each
    // tick until one captures, and `planet` is a stand-in whose centre is that
    // ship — so the same arc-then-descend flies round a hull as round a world.
    // The ship is moving the whole time; the pose is read from it live.
    id: 'vessel', vessel: null, armed: true, freeze: false,
    planet: { body: { position: new THREE.Vector3() }, radius: 300, cfg: { name: 'vessel' } },
    get approach() { return `${this.vessel.label} — WE HAVE YOUR HELM`; },
    get welcome() { return `${this.vessel.label} — PERMISSION TO COME ABOARD`; },
    label: 'AUTO-LANDING · FLEET',
    pose() {
      const v = this.vessel;
      const g = v.group;
      vesselSite(v); // the pad, companionway and bridge exist before the skids touch
      _skyUp.set(0, 1, 0).applyQuaternion(g.quaternion);
      _skyPad.copy(v.cls.pad).applyQuaternion(g.quaternion).addScaledVector(_skyUp, C.PARK_LIFT);
      _skyHover.copy(_skyPad).addScaledVector(_skyUp, 160);
      _landUprightQuat.copy(g.quaternion);
      _skyPadLive.copy(_skyPad);
      _skyQuatLive.copy(_landUprightQuat);
    },
    stepOut() { return enterCapitalWalk(vesselSite(this.vessel)); },
  },
  {
    // The landing on the Tenretni megaworld (src/farside.js,
    // world/farlanding.js): the far side's one pad. Like a fleet ship it is
    // not on a world, so `planet` is a stand-in centred on the platform
    // itself; checkSkyCapture points it there, and skips it until the pilot
    // is on the far side (farSite('pad') is null before that).
    id: 'landing', armed: true, freeze: false,
    planet: { body: { position: new THREE.Vector3() }, radius: C.FAR_LAND_CAPTURE, cfg: { name: 'landing' } },
    approach: 'THE LANDING — IT HAS YOUR HELM',
    welcome: 'THE LANDING — A DOOR IS OPEN',
    label: 'AUTO-LANDING · THE LANDING',
    pose() {
      const s = farSite('pad');
      const g = s.group;
      _skyUp.set(0, 1, 0).applyQuaternion(g.quaternion);
      _skyPad.copy(s.pad).applyQuaternion(g.quaternion).addScaledVector(_skyUp, C.PARK_LIFT);
      _skyHover.copy(_skyPad).addScaledVector(_skyUp, C.SKY_HOVER);
      _landUprightQuat.copy(g.quaternion);
      _skyPadLive.copy(_skyPad);
      _skyQuatLive.copy(_landUprightQuat);
    },
    stepOut: () => enterCapitalWalk(farSite('pad')),
  },
];
const CAPITAL_DOCK = DOCKS[2];
const VESSEL_DOCK = DOCKS[3];
const LANDING_DOCK = DOCKS[4];
// Point the landing's stand-in at the platform. False while there is none.
function aimLandingDock() {
  const s = farSite('pad');
  if (!s) return false;
  LANDING_DOCK.planet.body.position = s.group.position; // live: it rides the origin
  return true;
}
// The door on the landing (and the one back): seconds into the white, -1 when
// nobody is in a doorway; and where it leads, 'city' | 'pad'.
// door -> [the site it leads to, where on it, facing, the render preset]
const FAR_HOPS = {
  ship: ['ship', 'spawn', 'spawnYaw', 'lightship'],
  gallery: ['city', 'fromShip', 'fromShipYaw', 'lightcity'],
  bridge: ['bridge', 'spawn', 'spawnYaw', 'dive'],
  hall: ['ship', 'fromBridge', 'fromBridgeYaw', 'lightship'],
  shuttle: ['shuttle', 'spawn', 'spawnYaw', 'dive'],
  hatch: ['bridge', 'fromShuttle', 'fromShuttleYaw', 'dive'],
};
let doorT = -1;
let doorTo = null;
let platformDock = null; // the dock whose platform the pilot is walking (capital or a ship)
let dock = DOCKS[0]; // the dock in play while skyLanding is set
let walkDock = null; // the dock the current walk stepped out of, if it will be boarded back onto its pad
function skyPadPose() {
  dock.pose();
}

function skyShellRadius(d = dock) {
  return d.planet.radius * C.ATMO_SHELL;
}

function beginSkyAutoLand(d) {
  cancelAutopilot();
  dock = d;
  // Hold the world still first: the pad pose below is then the one we fly to.
  if (d.freeze) setPlanetSpinFrozen(d.planet, true);
  skyPadPose();
  landedPlanet = d.planet;
  skyLanding = true;
  d.armed = false;
  _padLocalDir.set(0, 0, 0);
  _landStartOff.subVectors(ship.position, d.planet.body.position);
  _landStartQuat.copy(ship.quaternion);
  skyStartR = _landStartOff.length();
  _skyStartDir.copy(_landStartOff).normalize();
  _lv0.copy(_skyHover).normalize();
  skyArcAng = _skyStartDir.angleTo(_lv0);
  _skyAxis.crossVectors(_skyStartDir, _lv0);
  if (_skyAxis.lengthSq() < 1e-8) {
    // dead above or dead opposite: any axis square to the start direction
    _skyAxis.crossVectors(_skyStartDir, Math.abs(_skyStartDir.y) < 0.9 ? _yAxis : _lv1.set(1, 0, 0));
  }
  _skyAxis.normalize();
  const arcTime = THREE.MathUtils.clamp(
    2.5 + (skyArcAng * d.planet.radius) / C.SKY_ARC_SPEED, 3.5, C.AUTOLAND_MAX_TIME
  );
  autoLandDuration = arcTime + C.SKY_DESCEND_TIME;
  skyArcFrac = arcTime / autoLandDuration;
  autoT = 0;
  landState = 'auto';
  showNavToast(d.approach, 5);
}

// Two legs. The arc swings round the planet on a great circle to a point high
// over the pad (never lower than the city's own altitude, so a far-side entry
// goes around the giant rather than through it, and nothing crosses the towers
// at deck height). Then a straight vertical descent onto the pad.
function stepSkyAutoLand(dt) {
  skyPadPose(); // live: the group position rides origin rebases
  autoT = Math.min(autoT + dt / autoLandDuration, 1);
  _prevPos.copy(ship.position);
  const hoverR = _skyHover.length();
  if (autoT < skyArcFrac) {
    const u = autoT / skyArcFrac;
    const k = u * u * (3 - 2 * u);
    _skyQuat.setFromAxisAngle(_skyAxis, skyArcAng * k);
    _lv0.copy(_skyStartDir).applyQuaternion(_skyQuat);
    // climb out of the deep air quickly, then ease onto the hover radius
    const rise = Math.min(u * 4, 1);
    const r = Math.max(
      THREE.MathUtils.lerp(skyStartR, hoverR, k),
      THREE.MathUtils.lerp(skyStartR, hoverR, rise * rise * (3 - 2 * rise))
    );
    ship.position.copy(dock.planet.body.position).addScaledVector(_lv0, r);
    ship.quaternion.slerpQuaternions(_landStartQuat, _landUprightQuat, k);
  } else {
    // Down onto the LIVE pad: by the last of the descent the ship is matching
    // the deck's heave and tilt, so it meets the plating instead of a memory of it.
    const u = (autoT - skyArcFrac) / (1 - skyArcFrac);
    const k = u * u * (3 - 2 * u);
    _lv0.lerpVectors(_skyHover, _skyPadLive, k);
    ship.position.copy(dock.planet.body.position).add(_lv0);
    ship.quaternion.slerpQuaternions(_landUprightQuat, _skyQuatLive, k);
  }
  ship.velocity.copy(ship.position).sub(_prevPos).divideScalar(dt);
  ship.angularVelocity.set(0, 0, 0);
  if (autoT >= 1) {
    landState = 'landed';
    settleT = 1;
    ship.velocity.set(0, 0, 0);
    showNavToast(dock.welcome, 4);
    if (dock.freeze) touchdownIsolate(dock.planet);
  }
}

// Parked on the pad. W/Space lifts off — as a short scripted climb rather
// than a kick, because there is no ground effect up here to hold a level ship:
// handed back flat, it would sink through the towers before the player found
// the stick. So it rises clear and tips its nose to the sky first.
let skyLiftT = -1;
const SKY_LIFT_TIME = 1.8;
const SKY_LIFT_HEIGHT = 110;
const _skyPitched = new THREE.Quaternion();
const _skyPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.05);
function stepSkyLanded(dt, piloted) {
  skyPadPose();
  ship.angularVelocity.set(0, 0, 0);
  ship.properAccel.set(0, 0, 0);
  if (skyLiftT < 0) {
    ship.position.copy(dock.planet.body.position).add(_skyPadLive);
    ship.quaternion.copy(_skyQuatLive);
    ship.velocity.set(0, 0, 0);
    if (piloted && throttleAxis() > 0.3) skyLiftT = 0;
    return;
  }
  skyLiftT = Math.min(skyLiftT + dt / SKY_LIFT_TIME, 1);
  const k = skyLiftT * skyLiftT; // ease in: it gathers speed off the pad
  _prevPos.copy(ship.position);
  ship.position.copy(dock.planet.body.position).add(_skyPad)
    .addScaledVector(_skyUp, SKY_LIFT_HEIGHT * k);
  _skyPitched.copy(_landUprightQuat).multiply(_skyPitch);
  ship.quaternion.slerpQuaternions(
    _landUprightQuat, _skyPitched, skyLiftT * skyLiftT * (3 - 2 * skyLiftT)
  );
  ship.velocity.copy(ship.position).sub(_prevPos).divideScalar(dt);
  if (skyLiftT >= 1) {
    if (dock.freeze) {
      // the day resumes, and the universe comes back, as on any liftoff
      setPlanetSpinFrozen(dock.planet, false);
      releaseUniverse();
    }
    landState = null;
    landedPlanet = null;
    skyLanding = false;
    skyLiftT = -1;
  }
}

// Put the ship back on the pad, landed (boarding from a walk, debug hooks).
function setOnSkyPad(d = DOCKS[0]) {
  cancelAutopilot();
  dock = d;
  if (d.freeze) touchdownIsolate(d.planet);
  landedPlanet = d.planet;
  landState = 'landed';
  skyLanding = true;
  d.armed = false;
  settleT = 1;
  skyLiftT = -1;
  _padLocalDir.set(0, 0, 0);
  stepSkyLanded(0, false);
}

// Capture check, once per physics tick in free flight.
function checkSkyCapture() {
  for (const d of DOCKS) {
    if (d.id === 'reach' && shatter.active) continue; // there is no flight deck any more
    if (d === CAPITAL_DOCK && !capitalDock()) continue; // not built (yet)
    if (d === VESSEL_DOCK) {
      const v = nearestVessel(ship.position);
      if (!v) continue;
      d.vessel = v;
      d.planet.body.position = v.group.position; // live: the ship is under way
      d.planet.radius = v.cls.radius * 0.8;
    }
    if (d === LANDING_DOCK && !aimLandingDock()) continue; // not on the far side
    if (d.planet.removed) continue; // the worldship has eaten it
    const r = ship.position.distanceTo(d.planet.body.position);
    if (!d.armed) {
      if (r > skyShellRadius(d) + C.SKY_REARM_MARGIN) d.armed = true;
      continue;
    }
    if (r < skyShellRadius(d)) {
      beginSkyAutoLand(d);
      return;
    }
  }
}

// --- every landable world takes the helm (owner's call) -----------------------
// What the Sky City does, everywhere: cross into a world's air and the
// autopilot flies the ship round to the landing pad and sets it down
// (beginAutoLand: the town's pad where the world has a town, the flattest
// ground under the ship where it does not). No button and no speed limit; LAND
// still waves an approach off, and still starts one by hand lower down.
//
// `landArmed` on the planet is the latch: taken off when its air captures the
// ship, or whenever the ship is down on it or the pilot is walking it, and put
// back once the ship has climbed SKY_REARM_MARGIN clear of the air. So lifting
// off, or waving off, does not hand the helm straight back.
function checkPlanetCapture() {
  const floor = nearestTerraFloor(ship.position);
  if (!floor || floor.planet.removed) return;
  const p = floor.planet;
  const r = ship.position.distanceTo(p.body.position);
  const shell = p.radius * C.ATMO_SHELL;
  if (p.landArmed === false) {
    if (r > shell + C.SKY_REARM_MARGIN) p.landArmed = true;
    return;
  }
  if (r >= shell) return;
  p.landArmed = false;
  cancelAutopilot();
  input.throttle = 0;
  beginAutoLand(floor);
  showNavToast(`${p.cfg.name.toUpperCase()} — WE HAVE YOUR HELM`, 5);
}
// Down on a world, or on foot on one: its air does not re-capture on the way up.
function disarmPlanetBelow() {
  const floor = nearestTerraFloor(ship.position);
  if (!floor) return;
  const p = floor.planet;
  if (ship.position.distanceTo(p.body.position) < p.radius * C.ATMO_SHELL + C.SKY_REARM_MARGIN) p.landArmed = false;
}

// --- stevenlacey landing (world/coinworld.js) ---------------------------------
// The coin has no ground and no gravity, so like the Sky City it captures the
// ship: come inside its capture radius and the tumble runs down while the
// autopilot carries you round to the face you came in over and sets you against
// it. Same landState pair as everywhere else, with coinLanding set; coinArmed is
// the latch that stops a lift-off being re-captured on the spot.
let coinLanding = false;
let coinArmed = true;
let coinFace = HEADS;
let coinLiftT = -1;
const _coinPad = new THREE.Vector3(); // rest point, offset from the coin's centre
const _coinHover = new THREE.Vector3();
const _coinR = new THREE.Vector3();
const _coinU = new THREE.Vector3();
const _coinN = new THREE.Vector3();
const _coinAway = new THREE.Quaternion();

// Where the ship rests and how it sits: standing on the 2D world's ground line
// (its +Y along the face's up), nose along the face's right, belly-on to anyone
// looking at the face. Recomputed live — the coin is still turning during the
// first of the approach, and its group rides origin rebases.
function coinPadPose() {
  // COIN_PAD_X is a point on the coin, not on a face: the two faces' rights are
  // opposed, so the sign flips with the face and the two pads sit back to back.
  coin.faceOffset(coinFace, C.COIN_PAD_X * coinFace, C.COIN_PAD_Y, C.COIN_PAD_OFF, _coinPad);
  coin.faceFrame(coinFace, _coinR, _coinU, _coinN);
  _coinHover.copy(_coinPad).addScaledVector(_coinN, C.COIN_HOVER);
  // ship axes: X = right, Y = up, Z = back. Nose (-Z) along the face's right.
  _lv2.copy(_coinR).multiplyScalar(-1);
  _lm.makeBasis(_coinN, _coinU, _lv2);
  _landUprightQuat.setFromRotationMatrix(_lm);
}

function beginCoinAutoLand() {
  cancelAutopilot();
  coinFace = coin.faceToward(ship.position);
  coin.settle();
  coinPadPose();
  landedPlanet = null;
  coinLanding = true;
  coinArmed = false;
  coinLiftT = -1;
  _padLocalDir.set(0, 0, 0);
  _landStartOff.subVectors(ship.position, coin.group.position);
  _landStartQuat.copy(ship.quaternion);
  autoLandDuration = C.COIN_ARC_TIME + C.COIN_DESCEND_TIME;
  autoT = 0;
  landState = 'auto';
  showNavToast(
    coinFace === HEADS ? 'STEVENLACEY — IT CAME UP HEADS' : 'STEVENLACEY — IT CAME UP TAILS', 5
  );
}

// Two legs: a straight run to a point standing off the face (the start and that
// point are both on the same side of the coin, so the line between them never
// crosses it), then straight in.
function stepCoinAutoLand(dt) {
  coinPadPose();
  autoT = Math.min(autoT + dt / autoLandDuration, 1);
  const arcFrac = C.COIN_ARC_TIME / autoLandDuration;
  _prevPos.copy(ship.position);
  if (autoT < arcFrac) {
    const u = autoT / arcFrac;
    const k = u * u * (3 - 2 * u);
    _lv0.lerpVectors(_landStartOff, _coinHover, k);
    ship.position.copy(coin.group.position).add(_lv0);
    ship.quaternion.slerpQuaternions(_landStartQuat, _landUprightQuat, k);
  } else {
    const u = (autoT - arcFrac) / (1 - arcFrac);
    const k = u * u * (3 - 2 * u);
    _lv0.lerpVectors(_coinHover, _coinPad, k);
    ship.position.copy(coin.group.position).add(_lv0);
    ship.quaternion.copy(_landUprightQuat);
  }
  ship.velocity.copy(ship.position).sub(_prevPos).divideScalar(dt);
  ship.angularVelocity.set(0, 0, 0);
  if (autoT >= 1) {
    landState = 'landed';
    settleT = 1;
    ship.velocity.set(0, 0, 0);
  }
}

// Against the face. W/Space lifts off: a short scripted run straight out, the
// nose swinging to point away from the coin, then the stick is yours.
function stepCoinLanded(dt, piloted) {
  coinPadPose();
  ship.angularVelocity.set(0, 0, 0);
  ship.properAccel.set(0, 0, 0);
  if (coinLiftT < 0) {
    ship.position.copy(coin.group.position).add(_coinPad);
    ship.quaternion.copy(_landUprightQuat);
    ship.velocity.set(0, 0, 0);
    if (piloted && throttleAxis() > 0.3) coinLiftT = 0;
    return;
  }
  coinLiftT = Math.min(coinLiftT + dt / C.COIN_LIFT_TIME, 1);
  const k = coinLiftT * coinLiftT;
  _prevPos.copy(ship.position);
  ship.position.copy(coin.group.position).add(_coinPad)
    .addScaledVector(_coinN, C.COIN_LIFT_HEIGHT * k);
  // nose (-Z) out along the face normal, keeping the face's up as the ship's
  _lv2.copy(_coinN).multiplyScalar(-1);
  _lv1.crossVectors(_coinU, _lv2).normalize();
  _lm.makeBasis(_lv1, _coinU, _lv2);
  _coinAway.setFromRotationMatrix(_lm);
  ship.quaternion.slerpQuaternions(
    _landUprightQuat, _coinAway, coinLiftT * coinLiftT * (3 - 2 * coinLiftT)
  );
  ship.velocity.copy(ship.position).sub(_prevPos).divideScalar(dt);
  if (coinLiftT >= 1) {
    landState = null;
    coinLanding = false;
    coinLiftT = -1;
  }
}

// Put the ship against a face, landed (boarding from a walk, debug hooks).
function setOnCoinPad(face) {
  cancelAutopilot();
  coinFace = face;
  coin.hold();
  landedPlanet = null;
  landState = 'landed';
  coinLanding = true;
  coinArmed = false;
  settleT = 1;
  coinLiftT = -1;
  _padLocalDir.set(0, 0, 0);
  stepCoinLanded(0, false);
}

// Capture check, once per physics tick in free flight.
function checkCoinCapture() {
  if (coin.removed) return; // the worldship has eaten it
  const r = ship.position.distanceTo(coin.group.position);
  if (!coinArmed) {
    if (r > C.COIN_CAPTURE + C.COIN_REARM_MARGIN) {
      coinArmed = true;
      coin.release();
    }
    return;
  }
  if (r < C.COIN_CAPTURE) beginCoinAutoLand();
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
  if (skyLanding) return stepSkyAutoLand(dt);
  if (coinLanding) return stepCoinAutoLand(dt);
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
  if (skyLanding) return stepSkyLanded(dt, piloted);
  if (coinLanding) return stepCoinLanded(dt, piloted);
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
  if (piloted && throttleAxis() > 0.3) {
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
  if (landedPlanet && (!skyLanding || dock.freeze)) setPlanetSpinFrozen(landedPlanet, false);
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
// The prompt line as the game wrote it ("E — TALK"), before touchify() strips
// the keys. Last frame's value feeds the on-foot context button.
let hudPrompt = null;

// --- the holodeck (src/holodeck.js, src/holoPanel.js, src/tenretni.js) --------
// A program is a walk on a world the worldship has taken out of space. The
// world is put back for the length of the session (tenretniLazy holoWorld),
// the ship is moved there on paper — its real place is kept, in absolute
// coordinates, because every step of a walk can rebase the origin — and the
// ordinary walk runs. Ending it undoes all of that and stands the pilot back
// at the panel.
let holo = null;

function startHolo(id) {
  if (holo || phase !== 'fly' || !walkLoaded() || autopilotActive() || tenretniHolding()) return false;
  if (landState === 'auto' || coinLanding) return false;
  const w = holoWorld(id, true);
  if (!w) return false;
  holo = {
    id,
    x: originOffset.x + ship.position.x, y: originOffset.y + ship.position.y, z: originOffset.z + ship.position.z,
    quat: ship.quaternion.clone(),
    landState, landedPlanet, skyLanding,
  };
  closeHoloPanel();
  closeCredits();
  closeArtView();
  closeTerrariumView();
  closeRadioPopup();
  standing = false;
  standBlend = 0;
  setCockpitStanding(false);
  landState = null;
  landedPlanet = null;
  skyLanding = false;
  heat = 0;
  ship.velocity.set(0, 0, 0);
  ship.angularVelocity.set(0, 0, 0);
  let ok = true;
  if (id === 'stevenlacey') {
    setOnCoinPad(HEADS);
    ok = !!enterCoinWalk(coin, HEADS, camera);
    landState = null;
    coinLanding = false;
  } else {
    // where to set down: the town on worlds that have one (the ski hill is
    // built beside it), otherwise the daylight side
    const site = citiesForWorld(id)[0]?.site;
    if (site) _lv0.copy(site).applyAxisAngle(_yAxis, w.surface.rotation.y);
    else _lv0.copy(w.sunBase);
    ship.position.copy(w.body.position).addScaledVector(_lv0.normalize(), w.radius + 60);
    beginWalk(w);
  }
  if (!ok) {
    endHolo();
    return false;
  }
  phase = 'walk';
  accumulator = 0;
  flash = 1;
  flashFade = 1.4;
  showViewToast('HOLODECK — G — END PROGRAM', 6);
  return true;
}

// `resetting`: called from resetToStart, which puts the ship and the pilot
// where it wants them itself.
function endHolo(resetting = false) {
  if (!holo) return;
  const h = holo;
  holo = null;
  if (phase === 'walk') endWalk();
  if (h.id === 'stevenlacey') {
    coinLanding = false;
    coinLiftT = -1;
    coin.release(true);
  }
  holoWorld(h.id, false);
  if (resetting) return;
  ship.position.set(h.x - originOffset.x, h.y - originOffset.y, h.z - originOffset.z);
  ship.quaternion.copy(h.quat);
  ship.velocity.set(0, 0, 0);
  ship.angularVelocity.set(0, 0, 0);
  heat = 0;
  landState = h.landState;
  landedPlanet = h.landedPlanet;
  skyLanding = h.skyLanding;
  standing = true;
  standBlend = 1;
  setCockpitStanding(true);
  const spot = holoPanelSpot();
  if (spot) placePlayer(spot.x, spot.z, -Math.PI / 2); // facing the panel
  snapCamera(ship);
  phase = 'fly';
  accumulator = 0;
  flash = 1;
  flashFade = 1.4;
}

function resetToStart() {
  endHolo(true); // a program running when the world resets is simply over
  // A platform still being walked (the far side's landing, or the City of Light
  // through its door) is left properly: the city has borrowed the scene's light
  // and must hand it back however the pilot goes.
  if (capitalActive()) exitWalk(camera);
  // Safety net for every path that bypasses both liftoff and boarding: the
  // collapse/respawn reset, the menu launch, debug.launch(), and the actuality
  // finale's game reset. A stranded pause would hand the flight sim an invisible
  // solar system. Both stages, and a no-op when neither is held.
  releaseIsolation(renderer, aoPass, camera, bloomPass);
  thawLandedPlanet(); // a reset from the pad must not strand a frozen day
  input.throttle = 0;
  ship.position.set(0, 0, 0);
  ship.velocity.set(0, 0, 0);
  ship.quaternion.identity();
  ship.angularVelocity.set(0, 0, 0);
  ship.properAccel.set(0, 0, 0);
  restoreShiftables(); // planets, sun, stations, black hole + origin offset
  cancelAutopilot();
  resetTenretni(); // an event in progress is dropped; the secret stays armed
  heat = 0;
  burnedBySun = false;
  flash = 0;
  flashFade = 0;
  landState = null;
  landedPlanet = null;
  skyLanding = false;
  for (const d of DOCKS) d.armed = d !== CAPITAL_DOCK;
  walkDock = null;
  chargeT = -1;
  reachShip.tube.reset();
  skyFallT = -1;
  skyLiftT = -1;
  doorT = -1;
  doorTo = null;
  coinLanding = false;
  coinArmed = true;
  coinLiftT = -1;
  coin.release(true);
  _padLocalDir.set(0, 0, 0);
  standing = false;
  standBlend = 0;
  closeCredits();
  closeArtView();
  closeTerrariumView();
  closeHoloPanel();
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

// Into the seat, in front of terra (or, on a save that has been through the
// wormhole, at the arrival point over the megaworld: the reset lays out
// whichever it is). `gesture`: called from a click (LAUNCH), which is what
// lets the music start and the pointer lock.
function launchFlight(gesture = true) {
  resetToStart();
  accumulator = 0;
  phase = 'fly';
  setPaused(false);
  hideMenu();
  loadOwnerArt();
  if (!gesture) return;
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
}
initMenu(() => launchFlight(true));

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
  // The war fleets are posed first: a pilot parked on one, or walking its
  // deck, is carried by a pose the physics, the camera and the render share.
  if (!isolated.active) placeFleets(now / 1000);
  if (phase === 'walk' || landState !== null) disarmPlanetBelow();
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
  updateTouchControls(delta, phase, paused, standing, {
    prompt: hudPrompt,
    nearShip: phase === 'walk' && nearParkedShip(),
  });

  // Title screen: the view behind the menu pans slowly side to side instead
  // of sitting dead still. Launch resets the ship, so nothing carries over.
  if (phase === 'menu') {
    _menuQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, C.MENU_PAN_RATE * Math.cos(now * 0.0001) * rawDelta * MOTION_SCALE);
    ship.quaternion.multiply(_menuQ);
  }

  // A holodeck program ends on G, wherever the pilot is in it — and on the two
  // endings that would otherwise throw them out into flight (Actuality's
  // finale reset, the coin folding itself up).
  if (phase === 'walk' && holo && (input.toggleWalk || walkPendingReset() || coinLeft())) {
    input.toggleWalk = false;
    endHolo();
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
        closeTerrariumView();
        closeHoloPanel();
  closeHoloPanel();
      }
    }
    // E while standing: read the plaque, look closer at a canvas, or close
    // whichever popup is up.
    // (Handled here because input.interact is consumed right after the
    // phase blocks, before the UI section below runs.)
    if (standing && input.interact) {
      if (isCreditsOpen()) closeCredits();
      else if (isArtViewOpen()) closeArtView();
      else if (isTerrariumViewOpen()) closeTerrariumView();
      else if (isHoloPanelOpen()) closeHoloPanel();
      else if (standBlend > 0.5 && nearPlaque()) openCredits();
      else if (standBlend > 0.5) {
        const art = nearPainting();
        if (art) openArtView(art.file, art.title);
        else if (nearTank()) openTerrariumView();
        else if (nearHoloPanel()) openHoloPanel(holoPrograms(), startHolo);
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
      // Tenretni (src/tenretniLazy.js): the event parks the ship off terra
      // and holds it there — no thrust, no gravity — until it is over.
      else if (tenretniHolding()) stepTenretniHold(DT);
      else {
        // nav auto-warp drives the ship (turn + warp) before the normal step;
        // it suppresses player input, so stepShip flies the plotted course
        if (autopilotActive()) stepAutopilot(DT, heat);
        stepShip(DT, piloted);
        if (piloted && !autopilotActive()) checkTouchdown();
        if (landState === null) checkSkyCapture();
        if (landState === null && piloted && !autopilotActive()) checkPlanetCapture();
        if (landState === null) checkCoinCapture();
      }
      accumulator -= DT;
    }
    if (!blackhole.gone && ship.position.distanceTo(blackhole.group.position) < C.HORIZON_CAPTURE) {
      phase = 'collapse';
      warpT = 0;
    } else if (wormholeCapture(ship.position)) {
      // The ending's last act: the pilot has led the fleet into the wormhole.
      // The same collapse, but it comes out on the far side (src/farside.js).
      phase = 'collapse';
      warpT = 0;
      cycling = true;
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
      if (skyLanding) {
        // The Sky City. No waving off the approach — there is nowhere else to
        // go — and stepping out needs the on-foot chunk to have arrived.
        if (landState === 'landed' && skyLiftT < 0 && dock.stepOut()) {
          walkDock = dock.freeze ? dock : null;
          platformDock = dock;
          landState = null;
          landedPlanet = null;
          skyLanding = false;
          heat = 0;
          phase = 'walk';
          accumulator = 0;
        }
      } else if (coinLanding) {
        // stevenlacey. No waving off, as at the Sky City; stepping out is the
        // fold into 2D (src/coinWalk.js), which needs the on-foot chunk.
        if (landState === 'landed' && coinLiftT < 0 && enterCoinWalk(coin, coinFace, camera)) {
          landState = null;
          coinLanding = false;
          heat = 0;
          phase = 'walk';
          accumulator = 0;
        }
      } else if (landState === 'landed') {
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
        } else {
          // a drained world (Tenretni) takes no landings; say so rather than
          // leaving G dead over it
          const dry = drainedWorldBelow(ship.position, C.AUTOLAND_ALTITUDE * 2);
          if (dry) showNavToast(`${dry.cfg.name.toUpperCase()} — NO SAFE LANDING`, 4);
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
    } else if (coinLeft()) {
      // stevenlacey has folded itself back up: into the seat, still against the
      // face, W to lift off.
      const f = coinLeft();
      endWalk();
      setOnCoinPad(f);
      snapCamera(ship);
      phase = 'fly';
      accumulator = 0;
    } else if (chargeT >= 0 || reachShip.tube.consumeDetonation()) {
      // The arm button. There was never a timer: the white comes up from the
      // bore faster than a thought, and that is the end of the walker, the
      // ship and half the world. The run ends as any death does; Neptunia
      // stays the way this left it (journal quest 'blown').
      chargeT = Math.max(chargeT, 0) + delta;
      flash = Math.min(chargeT / C.CHARGE_FLASH, 1);
      if (flash >= 1) {
        chargeT = -1;
        setQuestStage(CHARGE_QUEST, 'blown');
        endWalk();
        shatter.apply();
        deathReason = 'THE CHARGE WAS NEVER ON A TIMER — NEPTUNIA IS BROKEN';
        phase = 'explode';
        warpT = C.EXPLODE_TIME * 0.35; // already at full white
        accumulator = 0;
      }
    } else if (doorT >= 0 || (doorTo = farDoor())) {
      // A door on the far side (world/farlanding.js, world/lightcity.js): the
      // walker has gone through it. White up; under the white one place is
      // put away and the other stood in; the white clears on the far side of
      // the door. Into the City of Light the universe is paused round it, as
      // it is for the cottage; back out, it is let go again.
      doorT = Math.max(doorT, 0) + delta;
      flash = Math.min(doorT / C.FAR_DOOR_FLASH, 1);
      if (flash >= 1) {
        doorT = -1;
        if (doorTo === 'city') {
          const city = farSite('city');
          if (city) {
            acquireUniverse(null);
            enterCapitalWalk(city, { spawn: city.spawn, yaw: city.spawnYaw, quiet: true });
            acquireSurface('lightcity', renderer, aoPass, camera, bloomPass);
          }
        } else if (FAR_HOPS[doorTo]) {
          // ...and between the city, the light ship in its hangar and the
          // ship's bridge (GDD 5.7.4): all inside the same pause, so only the
          // place and its look change
          const [kind, spawn, yaw, look] = FAR_HOPS[doorTo];
          const to = farSite(kind);
          if (to) {
            enterCapitalWalk(to, { spawn: to[spawn], yaw: to[yaw], quiet: true });
            releaseSurface(renderer, aoPass, camera, bloomPass);
            acquireSurface(look, renderer, aoPass, camera, bloomPass);
          }
        } else {
          const pad = farSite('pad');
          releaseIsolation(renderer, aoPass, camera, bloomPass);
          if (pad) enterCapitalWalk(pad, { spawn: pad.doorOut, yaw: pad.doorYaw, quiet: true });
        }
        doorTo = null;
        flash = 1;
        flashFade = C.FAR_DOOR_FADE;
        accumulator = 0;
      }
    } else if (skyFallT >= 0 || skyFell()) {
      // Off the edge of the Sky City. The walker is still falling under the
      // rising white; at full white the run ends and starts over, in the ship,
      // where the game began.
      skyFallT = Math.max(skyFallT, 0) + delta;
      flash = Math.min(skyFallT / C.SKY_FALL_FLASH, 1);
      if (flash >= 1) {
        endWalk();
        resetToStart(); // clears skyFallT and the flash
        flash = 1; // ...but we are still under the white
        flashFade = C.SKY_FALL_FADE;
        phase = 'fly';
        accumulator = 0;
        showNavToast('YOU FELL FROM THE SKY CITY', 5);
      }
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
          } else if (coinActive()) {
            // The world folds up first; coinLeft() above finishes the boarding.
            coinBeginLeave();
          } else if (skyActive() || capitalActive()) {
            // Back into the seat, still parked on the pad: W lifts off.
            const d = capitalActive() ? platformDock || CAPITAL_DOCK : DOCKS[0];
            endWalk();
            setOnSkyPad(d);
            snapCamera(ship);
            phase = 'fly';
            accumulator = 0;
          } else if (walkDock) {
            // The Indigo Reach: the same — back in the seat on the flight deck.
            const d = walkDock;
            walkDock = null;
            endWalk();
            setOnSkyPad(d);
            snapCamera(ship);
            phase = 'fly';
            accumulator = 0;
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
    if (cycling === true) {
      // The stretch is held; the white only rises once the far side is there
      // to be stood in. If it cannot be built the wormhole throws the ship
      // back, with the fleet, the rally and the mouth as they were: never a
      // blank screen with nothing behind it.
      if (warpT >= C.COLLAPSE_TIME) {
        if (farGate() === 'ready') {
          cycling = 'white';
          farT = 0;
        } else {
          cycling = false;
          resetToStart();
          phase = 'respawn';
          warpT = 0;
          accumulator = 0;
          showNavToast('THE WORMHOLE WOULD NOT HOLD.', 9);
        }
      }
    } else if (cycling === 'white') {
      farT += delta;
      flash = Math.min(farT / C.FAR_WHITE_IN, 1);
      if (flash >= 1) {
        // Under the white: the story moves to the far side, and the world
        // reset lays it out exactly as every later reset and load will.
        enterFar();
        resetToStart();
        ship.velocity.set(0, 0, -C.FAR_EXIT_SPEED); // still moving, out of the mouth
        flash = 1;
        flashFade = C.FAR_WHITE_OUT;
        cycling = false;
        phase = 'respawn';
        warpT = 0;
        accumulator = 0;
      }
    } else if (warpT >= C.COLLAPSE_TIME) {
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
  // Tenretni's tunnel striking terra: a white flash that fades on its own.
  if (tenretniFx.flash > 0) {
    if (phase === 'fly') {
      flash = Math.max(flash, tenretniFx.flash);
      flashFade = 1.6;
    }
    tenretniFx.flash = 0;
  }
  // Every other phase: let whatever the last transition left on screen fade.
  if (phase !== 'explode' && phase !== 'ascend' && phase !== 'depart' && cycling !== 'white' && doorT < 0 && skyFallT < 0 && flash > 0) {
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
    if (phase === 'walk' && !coinActive()) toggleVehicleMenu(); // no vehicles in 2D
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

  if (updateOrigin(ship)) {
    // a rebase moved every world; the fleets follow their worlds, and a
    // walker on a deck is re-stood on it where it now is
    if (!isolated.active) placeFleets(now / 1000);
    if (phase === 'walk' && capitalActive()) updateWalkVisuals(0, now / 1000);
  }
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
  // Tenretni's jolts land on the same trauma; its rumble is a steady term.
  if (tenretniFx.kick > 0) {
    trauma = Math.min(trauma + tenretniFx.kick, 1);
    tenretniFx.kick = 0;
  }
  trauma = Math.max(trauma - C.TRAUMA_DECAY * delta, 0);
  const shake =
    Math.max(heat - 0.5, 0) * 2 + (phase === 'explode' || phase === 'ascend' ? 1.5 : 0) + trauma * trauma * 3 +
    (phase === 'fly' ? tenretniFx.rumble : 0);
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
    hudPrompt = walkPromptText() || (holo ? 'G — END PROGRAM' : null);
    // Touch: the context button carries the keyed half of the prompt.
    setPrompt(touchify(hudPrompt, { drop: true }));
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
        if (standBlend > 0.5 && !isCreditsOpen() && !isArtViewOpen() && !isTerrariumViewOpen() && !isHoloPanelOpen()) {
          if (nearSeat()) prompt = 'C — SIT';
          else if (nearPlaque()) prompt = 'E — READ';
          else {
            const art = nearPainting();
            if (art) prompt = art.prompt || (art.prompt = `${art.title.toUpperCase()} · E — VIEW`);
            else if (nearTank()) prompt = 'THE TERRARIUM · E — LOOK CLOSER';
            else if (nearHoloPanel()) prompt = 'HOLODECK · E — CHOOSE PROGRAM';
          }
        }
        hudPrompt = prompt;
        setPrompt(touchify(prompt, { drop: true }));
      } else {
        // seated: landing prompts
        let prompt = null;
        if (landState === 'landed') {
          if (coinLanding) prompt = coinLiftT >= 0 ? null : 'G — STEP OUT · W — LIFT OFF';
          else prompt = skyLanding && skyLiftT >= 0 ? null : 'G — STEP OUT · W — LIFT OFF';
        } else if (landState === 'auto') {
          prompt = coinLanding ? 'AUTO-LANDING · STEVENLACEY'
            : skyLanding ? dock.label : 'AUTO-LANDING · G — ABORT';
        }
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
        hudPrompt = prompt;
        setPrompt(touchify(prompt, { seated: true }));
      }
    } else {
      hudPrompt = null;
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
    updateStarfield(camera, Q.pixelRatio, tenretniSailVelocity() || ship.velocity);
    updateSun(now / 1000);
    updateNebula(camera);
    updateDeepNebula(renderer, camera);
    updatePlanets(now / 1000, camera.position);
    updateStations(now / 1000, ship.position);
    skyCity.update(delta, now / 1000, camera.position);
    coin.update(delta);
    updateTenretni(
      delta, now / 1000,
      phase === 'fly' && standing && onPatioDeck(),
      phase === 'fly' && !paused,
      (skyLanding && dock === CAPITAL_DOCK) || (capitalActive() && platformDock === CAPITAL_DOCK)
    );
    // a ship the pilot is docked on or walking cannot be lost from under them
    holdVessel(
      (skyLanding && dock === VESSEL_DOCK) || (capitalActive() && platformDock === VESSEL_DOCK)
        ? VESSEL_DOCK.vessel.id
        : null
    );
  }
  // On foot (isolated) as much as in flight: the sea keeps running either way.
  reachShip.update(delta, now / 1000, camera.position);
  shatter.update(delta, now / 1000, camera.position);
  // nav AFTER the stations are placed: a reset snaps orbiting stations back
  // to their snapshot spot for one frame, and a discovery check reading that
  // stale position would log everything sitting at the spawn point
  updateNav(ship, delta, phase === 'fly');
  // hologram AFTER updateStations so orbiting stations plot at their live spot;
  // usable only when the pilot is seated, flying, and not already auto-warping
  const holoActive =
    phase === 'fly' && !paused && !standing && landState === null && !autopilotActive() &&
    !tenretniHolding();
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
  lensPass.enabled = !blackhole.gone; // (the far side has no black hole: no pass at all)

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
  const thr = throttleAxis();
  _sfx.thrust = thr > 0 ? thr : thr < 0 ? -0.5 * thr : 0;
  _sfx.boost = thr > 0.5;
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
  // stevenlacey's 2D picture is flat colour, much of it at full white, filling
  // the frame: the space bloom would put a halo on every pale pixel and the
  // colour split would fringe its lettering. Both are re-derived above every
  // frame, so there is nothing to restore afterwards.
  if (phase === 'walk' && coinActive()) {
    bloomPass.strength = C.BLOOM_STRENGTH * 0.12;
    aberrationPass.uniforms.uStrength.value *= 0.25;
  }

  if (phase === 'walk') walkPreRender(renderer, bloomPass); // world modules draw to their RTs
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
