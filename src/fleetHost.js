// The fleets of the three worlds, from the first minute of the game.
//
// They used to be built by the Tenretni story (src/tenretni.js) the moment the
// worldship had eaten its first world, and until then there was nothing in the
// sky but planets. Now they are here from the start, and they are at war with
// each other: Rustia, Saturnia and Wavemall Prime, out between their worlds.
// When Tenretni comes through they break off and go home to guard orbits, and
// the story takes them over from there (adoptFleets).
//
// This file is small and always loaded; the hulls and the dialogue are a lazy
// chunk of their own, so the title screen does not pay for them.

import * as THREE from 'three';
import { questStage } from './journal.js';
import { sun } from './sun.js';

export const fleetLost = new Set(); // ships destroyed for good (the story saves it)

const TENRETNI = 'tenretni';
const LABELS = { rustia: 'Rustia', saturnia: 'Saturnia', 'wavemall prime': 'Wavemall Prime' };
const sunDir = new THREE.Vector3(0, 1, 0);
// the fight keeps this far from the sun (its group is not built yet when this file loads)
const avoid = { get pos() { return sun.group.position; }, r: 14000 };
let deps = null; // { scene, planets, camera }
let fleets = null, explosions = null;
let loading = false, failed = 0, retryAt = 0, wait = 2.5;
let gone = false; // the worldship left and took the war with it: no fleets at all
let hooks = null; // the story, once it has them: { story, onLost, kick, sunDir, refuge }
let VOICE = null, CAPTAINS = null;

// What is said on a flagship while the three worlds are still at war.
const prewar = {
  captain(ship) {
    const c = CAPTAINS[ship.faction];
    const st = questStage(TENRETNI);
    return {
      speaker: { name: `${c.title} ${c.names[0]}`, species: LABELS[ship.faction], cityId: ship.name },
      // (the war stops the day Tenretni is seen; the calling comes later, src/tenretni.js)
      lines: (st === 'done' || st === 'ship' ? VOICE[ship.faction].truce : VOICE[ship.faction].war).slice(),
    };
  },
  crew(ship, i) {
    return { speaker: { name: 'Crew', species: LABELS[ship.faction], cityId: ship.name }, lines: [VOICE[ship.faction].warCrew[i % 2]] };
  },
  choice: () => null,
  targets: () => [], // nobody lets a visitor on the lance in the middle of a war
  onHit() {},
};
const story = {};
for (const k of Object.keys(prewar)) story[k] = (...a) => ((hooks && hooks.story) || prewar)[k](...a);

const find = (name) => deps.planets.find((p) => p.cfg.name === name) || null;

function build(mods) {
  const [F, E, D] = mods;
  VOICE = D.VOICE;
  CAPTAINS = D.CAPTAINS;
  explosions = E.createExplosions(deps.scene);
  fleets = F.createFleets({
    scene: deps.scene,
    find,
    explode: (pos, scale) => {
      explosions.fire(pos, scale);
      if (hooks && hooks.kick) hooks.kick(pos);
    },
    lost: fleetLost,
    onLost: (id) => {
      fleetLost.add(id);
      if (hooks && hooks.onLost) hooks.onLost(id);
    },
    story,
    sunDir,
    avoid,
    refuge: () => (hooks && hooks.refuge ? hooks.refuge() : null),
  });
  if (gone) fleets.clear();
}

export function initFleetHost(d) {
  deps = d;
}

// Every frame of the space sim. Once the story has adopted the fleets it steps
// them itself (their sieges and losses are its to decide).
export function stepFleetHost(dt, t, flying) {
  if (!deps) return;
  if (!fleets) {
    if (loading || !flying) return;
    if ((wait -= dt) > 0) return;
    if (failed && performance.now() < retryAt) return;
    loading = true;
    Promise.all([import('./fleets.js'), import('./explosion.js'), import('../world/fleet-dialogue.js')])
      .then((m) => {
        loading = false;
        build(m);
      })
      .catch((err) => {
        loading = false;
        failed++;
        retryAt = performance.now() + Math.min(2000 * 2 ** (failed - 1), 30000);
        console.warn(`[fleets] chunk load failed (attempt ${failed})`, err);
      });
    return;
  }
  // at war with each other until the thing has come through and been seen
  const st = questStage(TENRETNI);
  fleets.war(st !== 'done' && st !== 'ship');
  if (hooks && hooks.sunDir) sunDir.copy(hooks.sunDir);
  else sunDir.copy(sun.group.position).sub(deps.camera.position).normalize();
  if (!hooks) {
    fleets.update(dt, t, null);
    explosions.update(dt, deps.camera);
  }
}

// The story takes the fleets over (src/tenretni.js startWar). `mods`: the
// three modules build() wants, which the story's chunk already holds.
export function adoptFleets(h, mods) {
  if (!deps) return null;
  if (!fleets) build(mods); // (a save loaded straight into the war: the story has the modules in hand)
  hooks = h;
  fleets.syncLost();
  return { fleets, explosions };
}
// The worldship has left by the way it came: there is no war, and no fleets.
export function fleetsGone() {
  gone = true;
  if (fleets) fleets.clear();
}

export const hostFleets = () => fleets;
export const hostPlace = (t) => fleets && fleets.place(t);
export const hostNearest = (pos) => (fleets && !gone ? fleets.nearest(pos) : null);
export const hostSite = (ship) => (fleets ? fleets.site(ship) : null);
export const hostHold = (id) => fleets && fleets.hold(id);
