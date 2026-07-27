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
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { C } from './constants.js';
import { initInput, input, setPointerLockGate } from './input.js';
import { ship, stepShip } from './ship.js';
import { altitudeAboveFloor } from './gravity.js';
import { updateOrigin, originOffset, snapshotShiftables, restoreShiftables } from './origin.js';
import { camera, updateCamera, snapCamera, resizeCamera, dashBlend } from './camera.js';
import { initTuning } from './tuning.js';
import { initStarfield, updateStarfield } from './starfield.js';
import { initNebula, updateNebula } from './nebula.js';
import { initDeepNebula, updateDeepNebula, deepNebulae } from './deepnebula.js';
import { initPaintingNebulae, paintingNebulae } from './paintingnebula.js';
import { cockpitScene, CockpitOverlayPass } from './cockpit.js';
import {
  initCockpit3d,
  updateCockpit3d,
  cockpitRig,
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
  walkPendingReset,
  walkBearing,
  walkObjective,
  walkDebug,
  enterStationWalk,
  walkLoaded,
  enterCottageWalk,
  cottageActive,
} from './walkLazy.js';
import { initJournal, journalState } from './journal.js';
import { initInventory, inventoryState } from './inventory.js';
import { CITIES, citiesForWorld, padLocalDir } from '../world/cityRegistry.js';
import { initSun, sunAltitude, sun } from './sun.js';
import { initStations, updateStations, nearestDockableStation } from './stations.js';
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
import { settings, onSettingsChange } from './settings.js';
import {
  initSettingsPanel,
  showPauseOverlay,
  hidePauseOverlay,
} from './settingsPanel.js';
import { initCompass, updateCompass } from './compass.js';
import { initControls, updateControls, setObjective } from './controls.js';
import { initTouchControls, updateTouchControls } from './touchControls.js';
import { initCapture, capturePendingPhoto, updateCapture, updateRecordingFrame, requestPhoto, toggleRecording, isGalleryOpen } from './capture.js';
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
initStations(scene);

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
initJournal();
initInventory();
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

// Ambient occlusion — the contact darkening where surfaces meet, which is what
// separates "boxes in a room" from "a place". Only ever enabled on an isolated
// story world (src/isolate.js), where the paused universe pays for it; it is a
// full extra scene pass for normals and the flight sim cannot afford one.
// Placed AFTER skyfog so skyfog still reads the RenderPass's fresh depth
// texture (GTAOPass owns its own depth/normal targets, so it needs nothing from
// the composer's). Radius is metres — these are rooms, not landscapes.
const aoPass = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
aoPass.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.4, thickness: 0.4, scale: 1.0, samples: 16 });
aoPass.enabled = false;
composer.addPass(aoPass);

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
    // ship-interior walk (C); the on-foot planet walk (G) is `walk` below
    interior: {
      playerState,
      isStanding: () => standing,
      blend: () => standBlend,
      stand: () => { if (phase === 'fly' && !input.warp) standing = true; },
      sit: () => { standing = false; },
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
    // Nearest dockable station's distance (to the whole station) + its berth,
    // for verifying the dock gate.
    dockInfo() {
      const dock = nearestDockableStation(ship.position);
      return dock
        ? { dist: dock.dist, name: dock.station.name, berth: dock.berth.clone() }
        : null;
    },
    // The gallery station's world position, for verifying freeze/undock.
    galleryPos() {
      const dock = nearestDockableStation(ship.position);
      return dock ? dock.station.group.position.clone() : null;
    },
    // Teleport to the gallery berth and dock, for headless verification.
    dockHere() {
      const dock = nearestDockableStation(ship.position);
      if (!dock) return null;
      ship.position.copy(dock.berth);
      ship.velocity.set(0, 0, 0);
      if (enterStationWalk(dock.station)) {
        heat = 0;
        phase = 'walk';
        accumulator = 0;
        return dock.station.name;
      }
      return null;
    },
    get station() {
      return walkDebug()?.walkSite?.().station;
    },
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
// Out-of-seat sub-mode within 'fly' (interior.js): the ship coasts on
// attitude hold while the pilot walks the corridor. Not a phase — heat,
// capture, nav, and the accumulator must all keep running.
let standing = false;
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
  landState = null;
  landedPlanet = null;
  _padLocalDir.set(0, 0, 0);
  cancelAutopilot();
  closeCredits();
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

// Photosensitivity / vestibular comfort: damp the camera shake and
// turbulence for users who asked the OS for reduced motion. (The flashing
// heat UI is handled in CSS via the same media query.)
const MOTION_SCALE = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  .matches
  ? 0.25
  : 1;

const hintEl = document.getElementById('hint');

function resetToStart() {
  // Safety net for every path that bypasses both liftoff and boarding: the
  // collapse/respawn reset, the menu launch, debug.launch(), and the actuality
  // finale's game reset. A stranded pause would hand the flight sim an invisible
  // solar system. Both stages, and a no-op when neither is held.
  releaseIsolation(renderer, aoPass, camera, bloomPass);
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
  closeRadioPopup();
  closeVehicleMenu();
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
    input.toggleBoard = false;
    input.photo = input.record = false;
    input.mouseX = input.mouseY = 0;
  }
  // "click to steer" hint only makes sense with the sim live and unpaused
  hintEl.classList.toggle('off', paused || (phase !== 'fly' && phase !== 'walk'));

  // On-foot touch sticks (no-op on desktop). Runs before the walk step below so
  // the look travel it injects is consumed by the same stepWalk tick a mouse
  // delta would have fed. Flight needs nothing here — the 3D dashboard already
  // owns touch — so the sticks hide outside the walk phase.
  updateTouchControls(delta, phase, paused);

  if (phase === 'fly') {
    // C: stand up out of the seat / sit back down at it. Standing is
    // blocked at warp (nobody walks at 10,000 u/s); sitting requires being
    // back at the chair. Consumed once per frame at the bottom of the loop.
    if (input.toggleInterior && !autopilotActive()) {
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
    // flight — dock at a berth (unchanged, checked first), else start the
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
        const dock = nearestDockableStation(ship.position);
        if (
          dock &&
          dock.dist < C.STATION_DOCK_RANGE &&
          ship.velocity.length() < C.WALK_LAND_SPEED &&
          enterStationWalk(dock.station) // false until the walk chunk lands
        ) {
          heat = 0;
          phase = 'walk';
          accumulator = 0;
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
    if (flash >= 1 && enterHeaven()) {
      phase = 'walk';
      flashFade = C.ASCEND_FADE;
      warpT = 0;
      accumulator = 0;
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
    if (input.record) toggleRecording();
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
    updateInterior(ship);
    updateInteriorCamera(ship, delta, standBlend, standBlend >= 0.2 && phase === 'fly');
  }
  // hull-stress shake: time-hashed jitter, ramping in past half heat
  const shake =
    Math.max(heat - 0.5, 0) * 2 + (phase === 'explode' || phase === 'ascend' ? 1.5 : 0);
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
  // hides; standing in the ship swaps the cockpit for the interior.
  const dash = dashBlend();
  if (phase === 'walk') {
    cockpitRig.visible = false;
    cockpitPass.enabled = false;
    interiorPass.enabled = false;
    closeRadioPopup(); // a flight dialog has no business over the walk HUD
    // "E — TALK" while an alien/creature is in range (dialogue hints are on
    // the dialogue panel itself). Reuses the interior prompt element.
    setPrompt(walkPromptText());
  } else {
    interiorPass.enabled = standBlend > 0.001;
    cockpitPass.enabled = !interiorPass.enabled;
    cockpitRig.visible = true; // the camera zoom handles the full-window view
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
        // seated: landing prompts first, then the dock offer when the gallery
        // berth is in range and the approach is slow (mirrors the G gates)
        const dock = nearestDockableStation(ship.position);
        const canDock =
          dock &&
          dock.dist < C.STATION_DOCK_RANGE &&
          ship.velocity.length() < C.WALK_LAND_SPEED;
        let prompt = null;
        if (landState === 'landed') prompt = 'G — STEP OUT · W — LIFT OFF';
        else if (landState === 'auto') prompt = 'AUTO-LANDING · G — ABORT';
        else if (canDock) prompt = 'G — DOCK';
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
    updateStarfield(camera, renderer.getPixelRatio());
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
  aberrationPass.uniforms.uStrength.value = (C.CA_STRENGTH * 8.0) / window.innerHeight;

  if (phase === 'walk') walkPreRender(renderer); // world modules draw to their RTs
  composer.render();
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
