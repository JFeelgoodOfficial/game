// The chapters, as places the light ship goes (GDD 5.7.8).
//
// One entry per chapter. A chapter is a star system (or some other place) with
// its own stage machine, its own dialogue file and its own save record; the
// light ship (src/homebase.js) is the same in all of them. src/voyage.js keeps
// which one the ship is in, mounts it, and saves each one's record under its
// id in `fgsf.voyage`.
//
//   id        the key everything is saved under. Never renamed.
//   label     what the chart calls it
//   sealed    its story has not been played yet: nothing here may give it away
//   needs()   whether the chart offers it yet (default: always, once in open space)
//   star      { dir: [x, y, z] toward it, color: 0xRRGGBB } or null for none
//   nebula    how much of the old sky's nebula shows there (0..1)
//   fleet     whether the three war fleets are in company there
//   base      [x, y, z], absolute: where the light ship keeps station
//   create(ctx) -> the system itself, built the first time the ship is there:
//     { docks:   [{ id, label, pos: [x, y, z] absolute, site, radius, approach, welcome, dockLabel, color }]
//       planets: [planet configs for src/planet.js buildPlanet, each with `pos`]
//       hop(key) -> { site, spawn, yaw, look, out } for its own doors (`<id>:*`)
//       door()   -> a door of its own that has just been walked through
//       update(dt, t, cam), talk(captainId) -> lines | null
//       serialize() -> its record (undefined while empty), restore(raw), state() }
//     ctx: { scene, camera, chapter, voyage, sunDir, save(), crewTalk(captain),
//            season (src/season.js), fixed (src/fixedEvents.js) }
//
// To add a chapter: see GDD 5.7.8, "Adding a chapter". world/example-system.js
// is the smallest one there can be.

import { createExampleSystem } from '../world/example-system.js';
import { EXAMPLE } from '../world/example-dialogue.js';
import { HORIZON_PLACE } from '../world/SEALED-horizon-place.js';
import { createAftermath } from '../world/SEALED-aftermath.js';
import { createDuskSystem } from '../world/dusk-system.js';
import { DUSK } from '../world/dusk-dialogue.js';
import { createIceSystem } from '../world/ice-system.js';
import { ICE } from '../world/ice-dialogue.js';
import { createConcourseSystem, concourseWaiting } from '../world/concourse-system.js';
import { CONC } from '../world/concourse-dialogue.js';
import { createFuturesSystem } from '../world/futures-system.js';
import { FUT } from '../world/futures-dialogue.js';
import { createSwarmSystem } from '../world/swarm-system.js';
import { SWARM } from '../world/swarm-dialogue.js';
import { createChoirSystem } from '../world/choir-system.js';
import { CHOIR } from '../world/choir-dialogue.js';
import { ENGINE_PLACE } from '../world/SEALED-engine-place.js';

export const SYSTEMS = [
  // Chapter one (GDD 5.7.7): where the light ship is when that chapter lets it
  // go. What it is called and what is there are the chapter's to say.
  {
    id: 'horizon', sealed: true,
    label: HORIZON_PLACE.label, star: HORIZON_PLACE.star, nebula: HORIZON_PLACE.nebula, fleet: HORIZON_PLACE.fleet,
    base: [0, 0, 0],
    // (chapter one of the voyage is played here, aboard: world/SEALED-aftermath.js)
    create: HORIZON_PLACE.create || createAftermath,
  },
  // The example: not story. A relay to dock at and a bare world to land on.
  {
    id: EXAMPLE.id, sealed: false, example: true,
    label: EXAMPLE.label, star: { dir: [-0.55, 0.32, -0.77], color: 0xffd9a0 }, nebula: 0.35, fleet: false,
    base: [0, 0, 0],
    create: createExampleSystem,
  },
  // Season 1, chapter 2 (GDD 5.7.9): a red dwarf on the horizon of a world
  // that never turns its face. The star is along +X, and the camp's own up is
  // +Y, so it sits on the camp's horizon (world/dusk-system.js leans it).
  // No `needs`: chapter 1 of the season is not built yet, so it is charted
  // from the moment the ship is in open space.
  {
    id: DUSK.id, sealed: false,
    label: DUSK.label, star: { dir: [1, 0, 0], color: 0xff5a36 }, nebula: 0.25, fleet: false,
    base: [0, 0, 0],
    create: createDuskSystem,
  },
  // Season 1, chapter 3 (GDD 5.7.9): a rogue planet. No star: the only light
  // is what the freighter brought. No `needs`: the season's standalone
  // chapters can be flown in any order.
  {
    id: ICE.id, sealed: false,
    label: ICE.label, star: null, nebula: 0.12, fleet: false,
    base: [0, 0, 0],
    create: createIceSystem,
  },
  // Season 1, chapters 4 and 5 (GDD 5.7.9): the free port, at the L4 point of
  // a binary. The star here is the larger one; the smaller is a neutron star,
  // drawn by the port itself. Two chapters are played in this one place.
  {
    id: CONC.id, sealed: false,
    label: CONC.label, star: { dir: [0.6, 0.3, 0.74], color: 0xffe2b8 }, nebula: 0.3, fleet: false,
    base: [0, 0, 0],
    create: createConcourseSystem,
    // a chapter here open and not yet played, from the save alone (src/voyage.js debriefNext)
    waiting: concourseWaiting,
  },
  // Season 1, chapter 6 (GDD 5.7.9): a world that sold its future. One warm
  // star, always the same afternoon.
  {
    id: FUT.id, sealed: false,
    label: FUT.label, star: { dir: [0.35, 0.72, 0.6], color: 0xfff0d0 }, nebula: 0.28, fleet: false,
    base: [0, 0, 0],
    create: createFuturesSystem,
  },
  // Season 1, chapter 8 (GDD 5.7.9): a dim star, half a swarm of mirrors round
  // it, and the yard where the other half is still being built. No `needs`:
  // the season's standalone chapters can be flown in any order.
  {
    id: SWARM.id, sealed: false,
    label: SWARM.label, star: { dir: [0.35, 0.45, -0.82], color: 0xff9a4a }, nebula: 0.2, fleet: false,
    base: [0, 0, 0],
    create: createSwarmSystem,
  },
  // Season 1, chapter 7 (GDD 5.7.9): a millisecond pulsar and the white dwarf
  // beside it. The chart's star is the dwarf; the pulsar is drawn by the hall,
  // through its rose. No `needs`: a standalone chapter.
  {
    id: CHOIR.id, sealed: false,
    label: CHOIR.label, star: { dir: [0.5, 0.4, 0.77], color: 0xdfe8ff }, nebula: 0.22, fleet: false,
    base: [0, 0, 0],
    create: createChoirSystem,
  },
  // Season 1, chapters 12 and 13 (GDD 5.7.9; sealed). What it is called and
  // what is there are the chapters' own to say. It is charted once chapter
  // 11's fixed event has happened.
  {
    id: 'engine', sealed: true,
    label: ENGINE_PLACE.label, star: ENGINE_PLACE.star, nebula: ENGINE_PLACE.nebula, fleet: ENGINE_PLACE.fleet,
    base: [0, 0, 0],
    needs: (chapter, voyage) => voyage.fixed.resolved('refugees'),
    create: ENGINE_PLACE.create,
  },
];

export const systemById = (id) => SYSTEMS.find((s) => s.id === id) || null;
export const FIRST_SYSTEM = SYSTEMS[0].id;
