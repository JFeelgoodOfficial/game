// The voyage: where the light ship is, where it has been, and who is out in
// the freighter (GDD 5.7.8).
//
// Once the chapter of GDD 5.7.7 has let the ship go (`chapter.open()`), the
// megaworld is behind it for good and the ship is in "a system": one entry of
// src/systems.js, mounted here. Mounting is what src/farside.js does for the
// megaworld, kept small: the old system is already hidden (src/tenretni.js
// hideOldSystem), the megaworld is stowed, and the system's star, its docks
// and its planets are laid out in the ABSOLUTE frame (the frame world resets
// return to, src/origin.js) and re-placed from it every frame, because
// nothing built after boot is in the reset's snapshot.
//
// Saved in its own key, `fgsf.voyage`, and only once there is something to
// keep:
//
//   { v: 1, at, visited: [ids], crew: [captain ids out on the trip],
//     chapters: { <id>: that chapter's own record } }
//
// "Landed somewhere" is not saved: a game come back to is aboard the light
// ship with the freighter in its bay, as every reset already returns to a start.

import * as THREE from 'three';
import { C } from './constants.js';
import { ship } from './ship.js';
import { sun } from './sun.js';
import { originOffset, addShiftable } from './origin.js';
import { setNebulaDim } from './nebula.js';
import { setFarFieldExtra, isolated } from './isolate.js';
import { addNavBody, setNavHidden } from './nav.js';
import { SYSTEMS, systemById, FIRST_SYSTEM } from './systems.js';
import { CAPTAINS } from '../world/chapter-dialogue.js';

const KEY = 'fgsf.voyage';
const _v = new THREE.Vector3();
const _bodies = [];

// ctx: { scene, camera, chapter, base: () => the bay's site (src/homebase.js),
//        fleets: () => the war fleets or null, addPlanet(cfg, pos) -> planet | null }
export function createVoyage(ctx) {
  const { chapter } = ctx;
  let at = FIRST_SYSTEM;
  const visited = [];
  let crew = []; // captains out on the trip (a subset of those alive)
  let crewV = 0; // bumped whenever that changes
  const records = {}; // chapters' records as loaded, until each is built
  const built = {}; // id -> { sys, inst, docks, planets, root }
  let mounted = null;
  let applied = false;
  const sunDir = new THREE.Vector3(0, 1, 0); // live: toward the current system's star

  // --- the save ---
  function save() {
    const chapters = {};
    for (const s of SYSTEMS) {
      const rec = built[s.id]?.inst?.serialize ? built[s.id].inst.serialize() : records[s.id];
      if (rec !== undefined && rec !== null) chapters[s.id] = rec;
    }
    const empty = at === FIRST_SYSTEM && visited.length <= 1 && !crew.length && !Object.keys(chapters).length;
    try {
      if (empty && !localStorage.getItem(KEY)) return;
      localStorage.setItem(KEY, JSON.stringify({
        v: 1, at, visited: visited.slice(), crew: crew.length ? crew.slice() : undefined,
        chapters: Object.keys(chapters).length ? chapters : undefined,
      }));
    } catch { /* storage full or blocked: the voyage still goes on for this session */ }
  }
  (function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!raw || typeof raw !== 'object') return;
      if (systemById(raw.at)) at = raw.at;
      if (Array.isArray(raw.visited)) for (const s of SYSTEMS) if (raw.visited.includes(s.id)) visited.push(s.id);
      if (Array.isArray(raw.crew)) crew = CAPTAINS.filter((c) => raw.crew.includes(c.id)).map((c) => c.id);
      if (raw.chapters && typeof raw.chapters === 'object') for (const s of SYSTEMS) if (raw.chapters[s.id] !== undefined) records[s.id] = raw.chapters[s.id];
    } catch { /* unreadable: a voyage that has not left yet */ }
  })();

  // --- a system's star: a disc and a glow, a long way off in its direction ---
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const star = new THREE.Mesh(new THREE.SphereGeometry(C.BASE_STAR_DIST * 0.02, 24, 16), starMat);
  const glowMat = new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, map: glowTexture() });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(C.BASE_STAR_DIST * 0.34);
  const starRoot = new THREE.Group();
  starRoot.add(star, glow);
  starRoot.visible = false;
  star.frustumCulled = glow.frustumCulled = false;
  ctx.scene.add(starRoot);
  setFarFieldExtra(starRoot);
  function glowTexture() {
    const n = 64, data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const r = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2);
      const a = Math.max(0, 1 - r);
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * a * a * a);
    }
    const tex = new THREE.DataTexture(data, n, n);
    tex.needsUpdate = true;
    return tex;
  }

  // --- building and mounting a system ---
  function build(sys) {
    if (built[sys.id]) return built[sys.id];
    const b = { sys, inst: null, docks: [], planets: [] };
    built[sys.id] = b;
    if (sys.create) {
      try {
        b.inst = sys.create({ scene: ctx.scene, camera: ctx.camera, chapter, voyage: api, sunDir, save, crewTalk: ctx.crewTalk });
      } catch (err) {
        console.warn(`[voyage] ${sys.id} could not be built`, err);
      }
    }
    const inst = b.inst;
    if (inst && inst.restore && records[sys.id] !== undefined) inst.restore(records[sys.id]);
    for (const d of (inst && inst.docks) || []) {
      const abs = new THREE.Vector3().fromArray(d.pos);
      d.site.group.visible = false;
      if (!d.site.group.parent) ctx.scene.add(d.site.group);
      setFarFieldExtra(d.site.group);
      addShiftable(d.site.group); // (rebased with everything else; place() puts it back after a reset)
      const nav = { id: `${sys.id}:${d.id}`, label: d.label, pos: d.site.group.position, dot: 6, radius: 60, logDist: d.radius * C.ATMO_SHELL + 600, color: d.color || '#9fe8ff', station: true, kind: 'station' };
      b.docks.push({ ...d, abs, nav });
    }
    for (const cfg of (inst && inst.planets) || []) {
      const p = ctx.addPlanet ? ctx.addPlanet(cfg) : null;
      if (!p) continue;
      const nav = { id: cfg.name, label: (cfg.label || cfg.name).toUpperCase(), pos: p.group.position, dot: 5, radius: p.radius, logDist: p.radius * 4, color: cfg.navColor || '#a9f7ff', kind: 'planet' };
      b.planets.push({ p, abs: new THREE.Vector3().fromArray(cfg.pos), nav });
    }
    return b;
  }
  function show(b, on) {
    for (const d of b.docks) {
      // (mounted from the bridge, under the pause: nothing of space is shown until the pause is let go)
      d.site.group.visible = on && !isolated.active;
      d.site.group.userData.away = !on;
      if (on) {
        addNavBody(d.nav);
        setNavHidden(d.nav.pos, false);
      } else setNavHidden(d.nav.pos, true);
    }
    for (const { p, nav } of b.planets) {
      ctx.showPlanet(p, on);
      p.group.userData.away = !on;
      if (isolated.active) p.group.visible = false;
      if (on) {
        addNavBody(nav);
        setNavHidden(nav.pos, false);
        // lit by this system's star, not the one it was built under
        p.sunBase.copy(sunDir);
        p.sunDir.copy(sunDir);
      } else setNavHidden(nav.pos, true);
    }
  }
  function place() {
    const base = ctx.base();
    if (base && mounted) {
      const bp = mounted.sys.base;
      base.group.position.set(bp[0] - originOffset.x, bp[1] - originOffset.y, bp[2] - originOffset.z);
    }
    if (!mounted) return;
    for (const d of mounted.docks) d.site.group.position.set(d.abs.x - originOffset.x, d.abs.y - originOffset.y, d.abs.z - originOffset.z);
    for (const { p, abs } of mounted.planets) p.group.position.set(abs.x - originOffset.x, abs.y - originOffset.y, abs.z - originOffset.z);
  }
  function mount(id) {
    const sys = systemById(id) || SYSTEMS[0];
    if (mounted && mounted.sys !== sys) show(mounted, false);
    mounted = build(sys);
    at = sys.id;
    if (!visited.includes(at)) visited.push(at);
    if (sys.star) {
      sunDir.fromArray(sys.star.dir).normalize();
      starMat.color.set(sys.star.color).multiplyScalar(3.2);
      glowMat.color.set(sys.star.color);
      starRoot.visible = true;
    } else {
      sunDir.set(0.2, 0.9, 0.3).normalize();
      starRoot.visible = false;
    }
    starRoot.userData.away = !starRoot.visible;
    // out here there is one star and no sky to fill the shadows: a little is given back, so a figure's dark side can be seen
    if (sun.ambient && !isolated.active) {
      sun.ambient.color.set(0x8a96b8);
      sun.ambient.intensity = Math.max(sun.ambient.intensity, 0.85);
    }
    starRoot.position.copy(ctx.camera.position).addScaledVector(sunDir, C.BASE_STAR_DIST);
    if (isolated.active) starRoot.visible = false;
    show(mounted, true);
    setNebulaDim(sys.nebula ?? 0.2);
    const F = ctx.fleets();
    if (F) {
      F.show(!!sys.fleet);
      if (sys.fleet) F.follow(ship, null, 1, { snap: true });
    }
    place();
  }

  const api = {
    open: () => chapter.open(),
    at: () => at,
    system: () => systemById(at),
    visited: () => visited.slice(),
    sunDir,
    save,
    // The ship in open space as it stands: a load, a world reset, the moment
    // the chapter lets it go. Idempotent.
    apply() {
      applied = true;
      const base = ctx.base();
      if (base) {
        base.group.visible = !isolated.active; // (let go from inside a paused room, it is shown when the pause is)
        base.group.userData.away = false;
        setFarFieldExtra(base.group);
        if (!base.group.userData.shift) {
          base.group.userData.shift = true;
          addShiftable(base.group);
          // home is on the chart from anywhere in a system
          addNavBody({ id: 'lightship', label: 'THE LIGHT SHIP', pos: base.group.position, dot: 7, radius: 260, logDist: 2400, color: '#bfe6ff', station: true, kind: 'station' });
        }
      }
      mount(at);
      save();
    },
    applied: () => applied,
    place, // (a door about to lead out into the world: everything where it belongs first)
    crewVersion: () => crewV,
    update(dt, t, cam) {
      if (!applied || !mounted) return;
      place();
      if (!starRoot.userData.away) starRoot.position.copy(cam).addScaledVector(sunDir, C.BASE_STAR_DIST);
      if (sun.light) sun.light.position.copy(sunDir);
      const base = ctx.base();
      if (base) base.update(dt, t, cam);
      for (const d of mounted.docks) if (d.site.update) d.site.update(dt, t, cam);
      if (mounted.inst && mounted.inst.update) mounted.inst.update(dt, t, cam);
    },
    // Where the chart can send the ship from here: everything charted but here.
    courses: () => SYSTEMS.filter((s) => s.id !== at && (!s.needs || s.needs(chapter, api))).map((s) => ({ id: s.id, label: s.label })),
    // The ship arrives somewhere else (the bridge's passage calls this at its
    // middle, world/basebridge.js). The freighter rides in the bay.
    travel(id) {
      const sys = systemById(id);
      if (!sys || !applied || sys.id === at) return false;
      mount(sys.id);
      save();
      return true;
    },
    // --- who is out on the trip ---
    crew: () => crew.filter((id) => !chapter.lost(id)),
    along: (id) => crew.includes(id) && !chapter.lost(id),
    setCrew(ids) {
      crew = CAPTAINS.filter((c) => ids.includes(c.id) && !chapter.lost(c.id)).map((c) => c.id);
      crewV++;
      save();
      return crew.slice();
    },
    toggleCrew(id) {
      if (chapter.lost(id) || !CAPTAINS.some((c) => c.id === id)) return false;
      crew = crew.includes(id) ? crew.filter((x) => x !== id) : CAPTAINS.filter((c) => c.id === id || crew.includes(c.id)).map((c) => c.id);
      crewV++;
      save();
      return true;
    },
    // --- for src/game.js: the docks of the current system ---
    // the nearest dock to `pos` (scene frame), or null
    nearestDock(pos) {
      if (!applied || !mounted) return null;
      let best = null, bd = Infinity;
      for (const d of mounted.docks) {
        const r = _v.copy(d.site.group.position).distanceToSquared(pos);
        if (r < bd) {
          bd = r;
          best = d;
        }
      }
      return best;
    },
    dock: (id) => (mounted ? mounted.docks.find((d) => d.id === id) || null : null),
    // everything in the system worth a point of light from the bridge:
    // [{ pos (scene frame, live), color, k }]
    bodies() {
      _bodies.length = 0;
      if (!mounted) return _bodies;
      for (const d of mounted.docks) _bodies.push({ pos: d.site.group.position, color: d.color || '#9fe8ff', k: 0.7 });
      for (const { p } of mounted.planets) _bodies.push({ pos: p.group.position, color: p.cfg.navColor || '#d8b890', k: 1.2 });
      return _bodies;
    },
    // --- the current system's own doors, and what its people say ---
    hop: (key) => (mounted && mounted.inst && mounted.inst.hop ? mounted.inst.hop(key) : null),
    door: () => (mounted && mounted.inst && mounted.inst.door ? mounted.inst.door() : null),
    talk: (captainId) => (mounted && mounted.inst && mounted.inst.talk ? mounted.inst.talk(captainId) : null),
    instance: (id = at) => built[id]?.inst || null,
    state: () => ({
      open: chapter.open(), applied, at, visited: visited.slice(), crew: api.crew(),
      systems: SYSTEMS.map((s) => ({ id: s.id, label: s.sealed ? null : s.label, sealed: !!s.sealed, built: !!built[s.id] })),
      docks: mounted ? mounted.docks.map((d) => ({ id: d.id, pos: d.site.group.position.toArray().map(Math.round) })) : [],
      planets: mounted ? mounted.planets.map(({ p }) => ({ name: p.cfg.name, pos: p.group.position.toArray().map(Math.round), removed: !!p.removed })) : [],
      star: !starRoot.userData.away, record: mounted && mounted.inst && mounted.inst.state ? mounted.inst.state() : null,
    }),
  };
  return api;
}
