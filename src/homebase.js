// The light ship as a home base (GDD 5.7.8): its rooms, the lifts between
// them, and what is done aboard between chapters.
//
// Three places are walked. The bay (world/basevessel.js) is in the world,
// under the hull, with the pilot's freighter on its pad; the bridge
// (world/basebridge.js) and the archive (world/lightship.js, the room the
// megaworld chapter walked, with a holodeck by its aft door) are walked under
// the universe's pause, like every room the far side has. The far side builds
// those rooms for its own story and retires them when that story has done with
// them (src/farside.js); these are the home base's own, built the first time
// each is walked into and kept.
//
// It knows the story only through `chapter` (who is aboard) and `voyage`
// (where the ship is, who is out on a trip).
//
// Doors are hop keys, `base:*`, resolved by hop(); src/game.js whites out and
// stands the walker in the place it names:
//
//   base:bay       down to the bay (out of the pause)
//   base:bridge    the bridge, off the lift     base:bridge-aft  ...from the archive
//   base:archive   the archive, from the bridge base:archive-up  ...off the lift from the bay
//   base:holo      the archive, at the holodeck (a program has ended)
//   base:helm      the bridge, at the helm (a chapter has let the ship go)
//   base:deck      the crew deck, from the bridge   base:bridge-deck ...and back
//                  (quarters for the pilot and each captain, the dining lounge,
//                  the medical bay: world/basedeck.js)

import { createBaseVessel } from '../world/basevessel.js';
import { createBaseBridge } from '../world/basebridge.js';
import { createBaseDeck } from '../world/basedeck.js';
import { createLightShip } from '../world/lightship.js';
import { createLightCity } from '../world/lightcity.js';
import { CAPTAINS } from '../world/chapter-dialogue.js';
import { BASE, CREW_TALK } from '../world/base-dialogue.js';
import { openHoloPanel } from './holoPanel.js';
import * as THREE from 'three';

const PROGRAM_AT = new THREE.Vector3(0, 0, -14);

// ctx: { scene, camera, chapter, voyage(): src/voyage.js, hideFleet(),
//        startHolo(id, back), catalog(): the holodeck's rows, shuttleHome(): the
//        freighter is in the bay, effects(): what the chapter past the horizon
//        left aboard (src/horizon.js), applied as it stands }
export function createHomebase(ctx) {
  const { chapter } = ctx;
  const voyage = () => ctx.voyage();
  let bay = null, bridge = null, archive = null, deck = null;
  let city = null, cityBroken = false; // the City of Light, as a holodeck program
  const fx = () => (ctx.effects && ctx.effects()) || null;
  const talkTurn = {}; // which of a captain's lines is next

  // --- the trip's roster: a panel of the captains who are left ---
  function roster() {
    const crew = chapter.crew();
    const rows = crew.length
      ? crew.map((c) => ({ id: c.id, label: c.name.toUpperCase(), note: voyage().along(c.id) ? BASE.rosterAlong : BASE.rosterStay, unlocked: true }))
      : [{ id: 'none', label: BASE.rosterNone, note: '', unlocked: false, show: true, lockedNote: ' ' }];
    openHoloPanel(rows, (id) => {
      voyage().toggleCrew(id);
      if (bridge) bridge.muster();
      if (bay) bay.muster();
      roster(); // shown again, as it now stands (X closes it)
    }, { title: BASE.rosterTitle, sub: BASE.rosterSub, foot: BASE.rosterFoot });
  }
  function holodeck() {
    openHoloPanel(ctx.catalog(), (id) => {
      voyage().holo(id); // (a chapter may be waiting for one to be walked: src/voyage.js)
      ctx.startHolo(id, 'base:holo');
    }, { title: BASE.holoTitle, sub: BASE.holoSub, locked: BASE.holoLocked });
  }

  // --- what a captain on the bridge says ---
  function talk(c) {
    const own = CREW_TALK[c.id];
    const here = voyage().talk(c.id) || [];
    const left = fx()?.talk?.[c.id] || [];
    const pool = [...left, ...here, ...own.any];
    const i = (talkTurn[c.id] = ((talkTurn[c.id] ?? -1) + 1) % pool.length);
    return { speaker: { name: c.name, species: c.species, cityId: 'The light ship' }, lines: [pool[i]], cine: true };
  }
  // --- the chart ---
  function chart() {
    const v = voyage();
    const here = v.system();
    // (a chapter may have the helm: `voyage().aboard('helm')` -> { refuse() -> lines | null: nothing is charted yet;
    //  before() -> lines said ahead of the chart's own }. With none, the chart is as it was.)
    const g = v.aboard('helm');
    const no = g && g.refuse ? g.refuse() : null;
    if (no) return { speaker: BASE.chartSpeaker, lines: no };
    const lines = [...(g && g.before ? g.before() : []), BASE.chartHere.replace('{here}', here.label)];
    if (!ctx.shuttleHome()) return { speaker: BASE.chartSpeaker, lines: [...lines, BASE.chartNeedShuttle] };
    const courses = v.courses();
    if (!courses.length) return { speaker: BASE.chartSpeaker, lines: [...lines, BASE.chartNowhere] };
    return {
      speaker: BASE.chartSpeaker, lines,
      offer: { kind: 'choice', prompt: BASE.chartPrompt, options: [...courses.map((s) => ({ label: s.label, outcomeTag: `base:go:${s.id}` })), { label: BASE.chartStay, outcomeTag: 'base:stay' }] },
    };
  }
  function choose(tag) {
    const m = /^base:go:(.+)$/.exec(tag || '');
    if (!m) return null;
    const to = voyage().courses().find((s) => s.id === m[1]);
    return to ? { travel: to.id, label: to.label } : null;
  }

  // --- the rooms ---
  function getBay() {
    if (!bay) {
      bay = createBaseVessel({ sunDir: voyage().sunDir, roster, crew: () => voyage().crew(), crewTalk: (c) => crewTalk(c, 'trip') });
      bay.setMarks(fx()?.marks);
    }
    if (!bay.group.parent) ctx.scene.add(bay.group);
    return bay;
  }
  const _sky = { star: null, starCol: new THREE.Color(), bodies: [] };
  const _pool = Array.from({ length: 8 }, () => ({ dir: new THREE.Vector3(), col: new THREE.Color(), k: 1 }));
  function sky() {
    const v = voyage();
    const sys = v.system();
    _sky.star = sys.star ? v.sunDir : null;
    if (sys.star) _sky.starCol.set(sys.star.color);
    _sky.bodies.length = 0;
    const st = v.bodies();
    const b = getBay().group.position;
    for (let i = 0; i < st.length && i < _pool.length; i++) {
      const o = _pool[i];
      o.dir.copy(st[i].pos).sub(b);
      if (o.dir.lengthSq() < 1) continue;
      o.dir.normalize();
      o.col.set(st[i].color);
      o.k = st[i].k;
      _sky.bodies.push(o);
    }
    return _sky;
  }
  function getBridge() {
    if (!bridge) {
      bridge = createBaseBridge({
        scene: ctx.scene, chapter, hideFleet: ctx.hideFleet, sky,
        aboard: (id) => !chapter.lost(id) && !voyage().along(id),
        figures: () => fx()?.figures || [],
        talk, chart, choose,
        arrive: (id) => voyage().travel(id),
        debrief: () => voyage().debrief(),
        debriefed: (key) => voyage().debriefed(key),
      });
    }
    return bridge;
  }
  function getDeck() {
    if (!deck) deck = createBaseDeck({ scene: ctx.scene, chapter, hideFleet: ctx.hideFleet, sky, aboard: (id) => !chapter.lost(id) && !voyage().along(id), guest: () => voyage().aboard('deck') });
    return deck;
  }
  function getArchive() {
    if (!archive) {
      archive = createLightShip({
        scene: ctx.scene, hideFleet: ctx.hideFleet, chapter,
        base: { fore: 'base:bridge-aft', aft: 'base:bay', forePrompt: BASE.archiveFore, aftPrompt: BASE.toBay, leaveHint: BASE.toBay.replace('E — ', ''), holoPrompt: BASE.holodeck, holodeck, guest: () => voyage().aboard('archive') },
      });
    }
    return archive;
  }

  const crewTalk = (c, kind) => ({ speaker: { name: c.name, species: c.species, cityId: kind === 'ride' ? 'The freighter' : 'The light ship' }, lines: CREW_TALK[c.id][kind] || CREW_TALK[c.id].any.slice(0, 1) });
  return {
    bay: () => (bay ? bay : null),
    // A place of the megaworld's as a holodeck program: the City of Light as
    // the archive kept it, with no story in it (the same city world/lightcity.js
    // builds for the far side, told nothing of the chapter). { site, spawn, yaw, look } | null.
    program(id) {
      if (id !== 'lightcity' || cityBroken) return null;
      if (!city) {
        try {
          city = createLightCity({ scene: ctx.scene, camera: ctx.camera, hideFleet: ctx.hideFleet, chapter: null, greet: () => BASE.programGreet });
        } catch (err) {
          cityBroken = true;
          console.warn('[homebase] the City of Light could not be built as a program', err);
          return null;
        }
      }
      // (stood on the balcony, clear of the door it would otherwise arrive through)
      return { site: city, spawn: PROGRAM_AT, yaw: Math.PI, look: 'lightcity' };
    },
    getBay,
    // A door key -> where it leads: { site, spawn, yaw, look, out }. `look` is a
    // render preset (src/isolate.js); `out` leaves the pause for the world.
    hop(key) {
      if (!chapter.open()) return null;
      switch (key) {
        case 'base:bay': { const s = getBay(); voyage().place(); return { site: s, spawn: s.fromLift, yaw: s.fromLiftYaw, out: true }; }
        case 'base:bridge': { const s = getBridge(); return { site: s, spawn: s.spawn, yaw: s.spawnYaw, look: 'dive' }; }
        case 'base:bridge-aft': { const s = getBridge(); return { site: s, spawn: s.fromAft, yaw: s.fromAftYaw, look: 'dive' }; }
        case 'base:helm': { const s = getBridge(); return { site: s, spawn: s.atHelm, yaw: s.atHelmYaw, look: 'dive' }; }
        case 'base:bridge-deck': { const s = getBridge(); return { site: s, spawn: s.fromDeck, yaw: s.fromDeckYaw, look: 'dive' }; }
        case 'base:deck': { const s = getDeck(); return { site: s, spawn: s.spawn, yaw: s.spawnYaw, look: 'dive' }; }
        case 'base:archive': { const s = getArchive(); return { site: s, spawn: s.fromBridge, yaw: s.fromBridgeYaw, look: 'lightship' }; }
        case 'base:archive-up': { const s = getArchive(); return { site: s, spawn: s.spawn, yaw: s.spawnYaw, look: 'lightship' }; }
        case 'base:holo': { const s = getArchive(); return { site: s, spawn: s.atHolo, yaw: s.atHoloYaw, look: 'lightship' }; }
        default: return null;
      }
    },
    // A door aboard has just been walked through (asking clears it).
    door() {
      // (a door walked through inside a program leads nowhere: only G ends it)
      if (city && city.inside() && city.portal) city.portal = null;
      for (const s of [bridge, archive, bay, deck]) {
        if (!s || !s.inside() || !s.portal) continue;
        let to = s.portal;
        s.portal = null;
        if (s === bay && to === 'base:archive') to = 'base:archive-up';
        return to;
      }
      return null;
    },
    roster,
    holodeck,
    crewTalk,
    state: () => ({
      built: { bay: !!bay, bridge: !!bridge, archive: !!archive, deck: !!deck },
      inside: bridge && bridge.inside() ? 'bridge' : archive && archive.inside() ? 'archive' : bay && bay.inside() ? 'bay' : deck && deck.inside() ? 'deck' : null,
      bay: bay ? bay.info() : null, bridge: bridge ? bridge.info() : null, archive: archive ? archive.info() : null, deck: deck ? deck.info() : null,
      bridgeSeek: (x) => bridge && bridge.seek(x),
      places: { bay: bay ? bay.places : null, bridge: bridge ? bridge.places : null, archive: archive ? archive.places : null, deck: deck ? deck.places : null },
      crew: CAPTAINS.map((c) => ({ id: c.id, lost: chapter.lost(c.id), along: voyage().along(c.id) })),
    }),
  };
}
