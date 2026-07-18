// Lazy facade over walk.js (audit fix). The on-foot subsystem — walk.js
// plus the six world/ modules it pulls in — is only needed after a landing,
// but a static import chained it all into the boot bundle. This facade
// keeps main.js/controls.js imports synchronous while the real module loads
// as a separate chunk shortly after boot (landing needs minutes of flying,
// so the chunk is always ready long before G can trigger).
//
// Every wrapper no-ops safely until the module arrives: nearestTerraFloor
// returns null (reads as "can't land here yet"), prompts return null, and
// the walk-phase functions can only be reached after enterWalk — which
// itself requires the module.

let mod = null;
let pendingScene = null;

function load() {
  if (mod) return;
  import('./walk.js').then((m) => {
    mod = m;
    m.initWalk(pendingScene);
  });
}

export function initWalk(scene) {
  pendingScene = scene;
  // start fetching once boot has settled; rIC where available
  if (window.requestIdleCallback) window.requestIdleCallback(load, { timeout: 3000 });
  else setTimeout(load, 1500);
}

export const walkLoaded = () => !!mod;

export const nearestTerraFloor = (pos) => (mod ? mod.nearestTerraFloor(pos) : null);
export const enterWalk = (planet) => mod && mod.enterWalk(planet);
export const exitWalk = (camera) => mod && mod.exitWalk(camera);
export const stepWalk = (dt) => mod && mod.stepWalk(dt);
export const updateWalkCamera = (camera, delta) => mod && mod.updateWalkCamera(camera, delta);
export const updateWalkVisuals = (delta, t) => mod && mod.updateWalkVisuals(delta, t);
export const toggleWalkView = () => mod && mod.toggleWalkView();
export const nearParkedShip = () => (mod ? mod.nearParkedShip() : false);
export const promptReturnToShip = () => mod && mod.promptReturnToShip();
export const walkInteract = () => mod && mod.walkInteract();
export const walkPromptText = () => (mod ? mod.walkPromptText() : null);
export const shipBearing = () => (mod ? mod.shipBearing() : null);
export const currentGravityScale = () => (mod ? mod.currentGravityScale() : 1);

// Live objects for the dev-only debug handle; null until the chunk lands.
export const walkDebug = () => (mod ? { walk: mod.walk, walkSite: mod.walkSite } : null);
