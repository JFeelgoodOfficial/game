// The chapter past the horizon (GDD 5.7.7): its host.
//
// It builds the chapter's places the first time each is wanted and maps the
// chapter's doors (`hz:*`) to them, as src/homebase.js does for the light
// ship's rooms. What the places are and what happens in them is the chapter's
// own (the SEALED files it reads); nothing of that is in this file.
//
// ctx: { scene, camera, chapter, hideFleet(), openSpace() -> the door onto the
// home base's bridge }

import { createDeck } from '../world/SEALED-horizon-deck.js';
import { createHall } from '../world/SEALED-horizon-hall.js';
import { createHelm } from '../world/SEALED-horizon-helm.js';
import { createHull } from '../world/SEALED-horizon-hull.js';
import { createKeel } from '../world/SEALED-horizon-keel.js';
import { effectsOf, auditLines } from '../world/SEALED-horizon-ship.js';

// door -> [the place, how it is made, the render look (src/isolate.js)]
const DOORS = {
  'hz:deck': ['deck', createDeck, 'dive'],
  'hz:hall': ['hall', createHall, 'lightship'],
  'hz:helm': ['helm', createHelm, 'dive'],
  'hz:hull': ['hull', createHull, 'dive'],
  'hz:keel': ['keel', createKeel, 'dive'],
};
// the door a game come back to at each stage goes in by
const RESUME = {
  hz_bell1: 'hz:deck', hz_bell2: 'hz:deck', hz_bell3: 'hz:deck',
  hz_bell4: 'hz:hall',
  hz_bell5: 'hz:helm', hz_bell6: 'hz:helm',
  hz_bell7: 'hz:hull', hz_bell8: 'hz:hull',
  hz_bell9: 'hz:keel', hz_bell10: 'hz:keel',
};

export function createHorizon(ctx) {
  const { chapter } = ctx;
  const sites = {};
  // what one place leaves for the next within a sitting (never saved)
  const memo = {};
  const inner = { ...ctx, memo };
  function get(name, make) {
    if (!sites[name]) sites[name] = make(inner);
    return sites[name];
  }
  const current = () => Object.values(sites).find((s) => s.inside()) || null;
  return {
    // a door key -> { site, spawn, yaw, look } | null
    hop(key) {
      const d = DOORS[key];
      if (!d) return null;
      const site = get(d[0], d[1]);
      return { site, spawn: site.spawn, yaw: site.spawnYaw, look: d[2] };
    },
    // a door of the chapter's has just been walked through (asking clears it)
    door() {
      const s = current();
      if (!s || !s.portal) return null;
      const to = s.portal;
      s.portal = null;
      return to;
    },
    // the door a game come back to in the middle of the chapter goes in by
    resumeKey: () => RESUME[chapter.stage()] || null,
    // what the chapter left on the home base, applied blindly by src/homebase.js
    effects: () => effectsOf(chapter),
    update() {},
    onReset() {
      for (const k of Object.keys(memo)) delete memo[k];
    },
    state: () => ({ built: Object.keys(sites), inside: Object.keys(sites).find((k) => sites[k].inside()) || null, stage: chapter.stage(), hz: chapter.hz.state(), resume: RESUME[chapter.stage()] || null }),

    // --- dev (__debug.tenretni.hz()) ---
    go: (stage) => chapter.go(stage),
    // send the pilot through one of the chapter's doors from the place being walked
    hopTo(key) {
      const s = current();
      if (!s || !(DOORS[key] || key === 'hz:back')) return false;
      s.portal = key;
      return true;
    },
    site: () => (current() ? current().info() : null),
    seek: (u) => (current() ? current().seek(u) : false),
    skip: () => (current() ? current().skip() : false),
    crew: (ids) => chapter.setCrewDebug(ids),
    // every scene's lines as the crew aboard would be shown them (a test of the writing's cover)
    audit: () => auditLines(chapter),
    // a place's own handles, by name
    dbg(name, ...args) {
      const s = current();
      return s && s.dbg[name] ? s.dbg[name](...args) : null;
    },
  };
}
