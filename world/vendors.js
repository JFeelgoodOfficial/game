// Named vendor NPCs for the permanent cities (world/cityRegistry.js): each
// city fields 2-4 vendors from the fixed roster — Farmer, Gardener, Artisan,
// Merchant, Caretaker, Scholar, Tourist Guide, Apprentice, Elite/Patron,
// Entertainer — standing at registry spots (plaza rims, lobby counters, the
// landing pad, the tower balcony). They implement the interaction contract
// (world/interaction.js) and speak STATIC hand-authored branching dialogue
// trees (world/vendor-dialogue.js) — Greeting -> choices -> responses with
// nested follow-up menus. No generated dialogue: dynamic game state enters
// only through {{placeholder}} substitution in fill().
//
// Frame: the vendors group is a child of city.group, so every position here
// is the city's flat local x/z space — the same frame the crowd and
// _playerLocal use in walk.js. Entities store pos as a Vector2(x, z) plus a
// cached y, matching walk.js entityDistSq's Vector2 branch.
//
// Menu flow: interact() serves the greeting plus the root menu. Each option
// carries outcomeTag 'menu:<cityId>:<vendorIdx>:<node>:<option>'; walk.js
// applyOffer skips journaling 'menu:' tags and forwards onOutcome()'s
// returned payload to dialogue.js, which swaps it in place — the panel stays
// open until a branch with next: null (every node's goodbye) runs out of
// lines.

import * as THREE from 'three';
import { buildRig, poseRig } from './aliens.js';
import { VENDOR_TREES, ROLE_TITLES, ROLE_DEFAULT_VARS } from './vendor-dialogue.js';

const FACE_DIST = 6; // vendors turn to face the player inside this range
const TURN_RATE = 6; // rad/s-ish damp toward the player bearing

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Hovering role sigil: the role's initial glyph in the city's neon color, so
// vendors read as somebody at a glance among the ambient citizens.
function makeSigil(role, colorHex) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const css = `#${(colorHex ?? 0xd4408f).toString(16).padStart(6, '0')}`;
  ctx.strokeStyle = css;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = css;
  ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((ROLE_TITLES[role] ?? '?').charAt(0).toUpperCase(), 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, opacity: 0.85, depthWrite: false,
  }));
  sprite.scale.setScalar(0.55);
  return sprite;
}

export function createVendors(planet, cityDef, city, opts = {}) {
  const group = new THREE.Group();
  group.name = 'Vendors';

  // Sigils tint to the city's neon primary (opts.neon, from the style the
  // city was built with); fall back to the classic magenta.
  const neon = opts.neon ?? 0xd4408f;

  // --- spot resolution: registry spot key -> city-local {x, z, y} ----------
  function resolveSpot(spec, idx) {
    const plazaMatch = /^plaza(\d+)$/.exec(spec ?? '');
    if (plazaMatch) {
      const p = city.plazaCenters[Number(plazaMatch[1]) % city.plazaCenters.length];
      if (p) {
        // Stand on the plaza rim, at a bearing stable per vendor.
        const a = (hashStr(cityDef.id + ':' + idx) % 628) / 100;
        const x = p.x + Math.cos(a) * p.r * 0.55;
        const z = p.z + Math.sin(a) * p.r * 0.55;
        return { x, z, y: city.groundLocalYAt(x, z), face: Math.atan2(p.x - x, p.z - z) };
      }
    }
    const lobbyMatch = /^lobby(\d+)$/.exec(spec ?? '');
    if (lobbyMatch) {
      const l = (city.lobbies ?? [])[Number(lobbyMatch[1]) % Math.max(1, (city.lobbies ?? []).length)];
      if (l) return { x: l.x + 1.4, z: l.z + 1.0, y: l.floorY, face: Math.PI };
    }
    if (spec === 'tower' && city.balconySpot) {
      const b = city.balconySpot;
      return { x: b.x + 0.8, z: b.z + 0.8, y: b.y, face: 0 };
    }
    if (spec === 'pad' && city.padLocal) {
      // Beside the pad, on the townward side — greeting arrivals.
      const p = city.padLocal;
      const len = Math.hypot(p.x, p.z) || 1;
      const x = p.x * (1 - 16 / len) + (p.z / len) * 5;
      const z = p.z * (1 - 16 / len) - (p.x / len) * 5;
      return { x, z, y: city.groundLocalYAt(x, z), face: Math.atan2(p.x - x, p.z - z) };
    }
    // Fallback: first plaza center rim.
    const p = city.plazaCenters[0] ?? { x: 0, z: 0, r: 10 };
    const x = p.x + p.r * 0.5;
    const z = p.z;
    return { x, z, y: city.groundLocalYAt(x, z), face: Math.atan2(p.x - x, p.z - z) };
  }

  // --- build the vendor entities -------------------------------------------
  const vendors = [];
  const defs = cityDef.vendors ?? [];
  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const spot = resolveSpot(def.spot, i);
    const rig = buildRig(hashStr(cityDef.id + ':' + def.name), cityDef.id);
    rig.group.position.set(spot.x, spot.y + rig.params.groundOffset, spot.z);
    rig.group.rotation.y = spot.face;
    group.add(rig.group);

    const sigil = makeSigil(def.role, neon);
    sigil.position.set(spot.x, spot.y + rig.params.height + 0.55, spot.z);
    group.add(sigil);

    // Seeded once per city+vendor, so a vendor's stock line is stable across
    // visits — permanence extends to the small talk.
    const rng = mulberry32((cityDef.seed ^ hashStr(def.name)) >>> 0);
    vendors.push({
      idx: i,
      name: def.name,
      role: def.role,
      vars: def.vars ?? {},
      pos: new THREE.Vector2(spot.x, spot.z),
      y: spot.y,
      face: spot.face,
      heading: spot.face,
      rig,
      sigil,
      mode: 'idle',
      t: (i * 1.7) % 10,
      stock: 3 + Math.floor(rng() * 22),
    });
  }

  // --- {{placeholder}} substitution ----------------------------------------
  let daypart = 'daylight'; // refreshed each update from sunDot
  function fill(str, v) {
    return String(str).replace(/\{\{(\w+)\}\}/g, (m, key) => {
      const ctx = {
        cityName: cityDef.name,
        worldName: planet.cfg.name,
        vendorName: v.name,
        wonderName: cityDef.wonder?.title ?? 'the wonder',
        stock: v.stock,
        daypart,
        ...(ROLE_DEFAULT_VARS[v.role] ?? {}),
        ...v.vars,
      };
      if (ctx[key] === undefined) {
        if (import.meta.env?.DEV) console.warn(`vendors.js: unfilled {{${key}}} for ${v.role}`);
        return m;
      }
      return String(ctx[key]);
    });
  }

  function treeFor(v) {
    const role = VENDOR_TREES[v.role];
    if (!role) return null;
    return role[cityDef.voice] ?? role.default ?? null;
  }

  function speakerFor(v) {
    return {
      name: v.name,
      species: ROLE_TITLES[v.role] ?? 'Vendor',
      cityId: cityDef.name,
    };
  }

  function menuFor(v, nodeKey) {
    const tree = treeFor(v);
    const node = tree?.nodes?.[nodeKey];
    if (!node) return undefined;
    return {
      kind: 'choice',
      prompt: fill(node.prompt, v),
      options: node.options.map((o, i) => ({
        label: fill(o.label, v),
        outcomeTag: `menu:${cityDef.id}:${v.idx}:${nodeKey}:${i}`,
      })),
    };
  }

  // --- interaction contract (world/interaction.js) --------------------------
  function nearestInteractable(playerPos, maxDist = 3.2) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const v of vendors) {
      const dx = v.pos.x - playerPos.x;
      const dz = v.pos.y - playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; best = v; }
    }
    return best;
  }

  function interact(v) {
    if (!v) return null;
    const tree = treeFor(v);
    if (!tree) return null;
    v.mode = 'talk';
    return {
      speaker: speakerFor(v),
      lines: tree.greeting.map((l) => fill(l, v)),
      offer: menuFor(v, 'root'),
    };
  }

  // walk.js applyOffer forwards choice outcomes here and returns our payload
  // to dialogue.js — the branching engine for the static trees.
  function onOutcome(tag) {
    const m = /^menu:([^:]+):(\d+):([^:]+):(\d+)$/.exec(tag ?? '');
    if (!m || m[1] !== cityDef.id) return null;
    const v = vendors[Number(m[2])];
    const tree = treeFor(v);
    const node = tree?.nodes?.[m[3]];
    const opt = node?.options?.[Number(m[4])];
    if (!v || !opt) return null;
    return {
      speaker: speakerFor(v),
      lines: (opt.lines ?? []).map((l) => fill(l, v)),
      offer: opt.next ? menuFor(v, opt.next) : undefined,
    };
  }

  function endInteract(v) {
    // Safe to call twice or with a stale/foreign entity (contract).
    if (v && v.mode === 'talk') v.mode = 'idle';
  }

  // --- per-frame -------------------------------------------------------------
  const _toPlayer = new THREE.Vector2();
  function update(dt, playerLocal, sunDot) {
    const night = THREE.MathUtils.clamp(1 - Math.max(sunDot ?? 0, 0), 0, 1);
    daypart = (sunDot ?? 0) > 0.35 ? 'midday' : (sunDot ?? 0) > 0.05 ? 'dusk' : 'the lantern hours';
    const eyeEm = 0.6 + night * 1.2;
    const trimEm = 0.25 + night * 0.9;
    for (const v of vendors) {
      v.t += dt;
      _toPlayer.set(playerLocal.x - v.pos.x, playerLocal.z - v.pos.y);
      const near = _toPlayer.lengthSq() < FACE_DIST * FACE_DIST;
      const want = near ? Math.atan2(_toPlayer.x, _toPlayer.y) : v.face;
      // Shortest-arc damp toward the target heading.
      let d = want - v.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      v.heading += d * Math.min(1, TURN_RATE * dt);
      v.rig.group.rotation.y = v.heading;
      poseRig(v.rig, dt, v.t, v.mode === 'talk' ? 'talk' : 'idle', 0);
      v.rig.materials.eyeMat.emissiveIntensity = eyeEm;
      v.rig.materials.clothMat.emissiveIntensity = trimEm;
      v.sigil.position.y = v.y + v.rig.params.height + 0.55 + Math.sin(v.t * 1.3) * 0.06;
      v.sigil.material.opacity = 0.55 + night * 0.35;
    }
  }

  function dispose() {
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
    group.clear();
  }

  return {
    group,
    update,
    dispose,
    nearestInteractable,
    interact,
    endInteract,
    onOutcome,
    vendors, // for headless verification (count, roles, nodes)
  };
}
