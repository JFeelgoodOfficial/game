// Tenretni: the governor's secret. Lazy facade over tenretni.js.
//
// Baron Rynva, once he has fitted the aft patio, offers a secret (src/mineWalk.js
// secretOffer). A yes sets the journal stage 'tenretni' to 'armed', and from
// then on choosing terra in NAV ends differently: the ship is taken to a fixed
// viewpoint with its stern to open space — sun on the left, terra on the right
// — and held there. When the pilot walks out onto the patio a wormhole opens,
// the machine-world Tenretni comes through, drains terra's oceans down a
// tunnel, leaves a city in the planet's side and goes home. Stage 'done':
// terra is dry for good, cannot be landed on, and the wormhole stays.
//
// The whole event is one module with four shaders, wanted by almost nobody at
// boot, so it loads as its own chunk the first frame the stage reads 'armed'
// or 'done'. This facade is what the boot bundle imports. Until the chunk
// lands every call is a safe no-op, and an armed warp that arrives early is
// simply remembered and handed over.
//
//   engageWarp(body)   NAV's one way to start a trip (holonav.js, navmenu.js)
//   tenretniHolding()  the event owns the ship: game.js skips stepShip
//   stepTenretniHold   ...and calls this each physics tick instead
//   updateTenretni     once a frame, in space
//   tenretniFx         shake and flash the event asks game.js for
//
// The story it starts runs a long way past that: the worldship, the war, the
// ending, and through the wormhole to the far side (src/farside.js). All of it
// is in the one chunk.

import { startAutoWarp } from './autopilot.js';
import { questStage } from './journal.js';

export const SECRET = 'tenretni';

// Read and cleared by game.js every frame: `kick` is a one-off trauma
// impulse, `flash` a one-off white flash, `rumble` a continuous shake level.
export const tenretniFx = { kick: 0, flash: 0, rumble: 0 };

let mod = null;
let loading = false;
let failed = 0;
let retryAt = 0;
let deps = null; // { scene, planets, ship, camera }
let arrived = false; // an armed warp reached terra before/after the chunk did

function load() {
  if (mod || loading || !deps) return;
  if (failed && performance.now() < retryAt) return;
  loading = true;
  import('./tenretni.js')
    .then((m) => {
      m.init(deps, tenretniFx);
      mod = m;
      loading = false;
    })
    .catch((err) => {
      loading = false;
      failed++;
      retryAt = performance.now() + Math.min(2000 * 2 ** (failed - 1), 30000);
      console.warn(`[tenretni] chunk load failed (attempt ${failed})`, err);
    });
}

export function initTenretni(d) {
  deps = d;
}

// NAV engage. An armed secret turns the trip to terra into the event's
// arrival; every other trip is the plain auto-warp.
export function engageWarp(body) {
  if (body && body.id === 'terra' && questStage(SECRET) === 'armed') {
    startAutoWarp(body, () => {
      arrived = true;
    });
  } else startAutoWarp(body);
}

export const tenretniHolding = () => (mod ? mod.holding() : false);
export const stepTenretniHold = (dt) => mod && mod.stepHold(dt);

// Per frame, while the space sim runs. `onDeck`: the pilot is standing on the
// patio. `flying`: fly phase and not paused (toasts and sound only then).
export function updateTenretni(delta, t, onDeck, flying, aboard) {
  if (!mod) {
    const st = questStage(SECRET);
    if (st === 'armed' || st === 'done' || st === 'ship') load();
    return;
  }
  if (arrived) {
    arrived = false;
    mod.arrive();
  }
  mod.update(delta, t, onDeck, flying, aboard);
}

// World reset (death, the actuality loop): drop an event in progress. The
// stage stays 'armed', so the trip can be made again.
export function resetTenretni() {
  arrived = false;
  tenretniFx.kick = tenretniFx.flash = tenretniFx.rumble = 0;
  if (mod) mod.abort();
}

// The worldship's capital (world/capital.js), once terra has become a ship:
// game.js docks on it as it docks at the Sky City. Null until then.
export const capitalDock = () => (mod ? mod.capitalSite() : null);
// While the worldship is under way, its velocity (for the starfield's streaks).
export const tenretniSailVelocity = () => (mod ? mod.sailVelocity() : null);

// The holodeck: which programs exist and which are unlocked, and putting an
// assimilated world back for the length of a session (see mod.holoWorld).
export const holoPrograms = () => (mod ? mod.programs() : []);
export const holoWorld = (id, on) => (mod ? mod.holoWorld(id, on) : null);

// The war fleets (src/fleets.js): the nearest ship to dock with, its walkable
// deck, and keeping a ship from being lost while the pilot is on it.
export const nearestVessel = (pos) => (mod ? mod.nearestVessel(pos) : null);
export const vesselSite = (ship) => (mod ? mod.vesselSite(ship) : null);
export const holdVessel = (id) => mod && mod.holdVessel(id);
export const placeFleets = (t) => mod && mod.placeFleets(t);
// The ending's last act: the pilot has flown the fleet into the wormhole.
export const wormholeCapture = (pos) => (mod ? mod.wormholeCapture(pos) : false);
// ...and what is through it (src/farside.js). farGate: 'ready' | 'failed',
// asked while game.js holds the collapse; enterFar: the pilot is through.
export const farGate = () => (mod ? mod.farGate() : 'failed');
export const enterFar = () => mod && mod.enterFar();

// dev/verification handle (__debug.tenretni)
export const tenretniDebug = () => ({
  loaded: !!mod,
  load,
  arrive: () => { arrived = true; },
  start: () => mod && mod.debugStart(),
  seek: (s) => mod && mod.debugSeek(s),
  sail: (name) => mod && mod.debugSail(name),
  eat: (u) => mod && mod.debugEat(u),
  clock: (sec) => mod && mod.debugClock(sec),
  fleets: () => mod && mod.debugFleets(),
  comms: () => (mod ? mod.commState() : {}),
  setComms: (on) => mod && mod.debugComms(on),
  end: () => mod && mod.debugEnd(),
  far: () => mod && mod.debugFar(),
  story: () => mod && mod.debugStory(),
  state: () => (mod ? mod.state() : { loaded: false, stage: questStage(SECRET) }),
});
