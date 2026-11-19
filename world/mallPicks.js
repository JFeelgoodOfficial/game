// The six pieces Maribel sets out for the pilot (the Crown errand,
// src/crownErrand.js): one in a shop on each of five departments, each on a
// lit ring. Walk up, press E, confirm, and it is yours: the one free thing
// from the WaveMall, which then stands in the suite in Meridian Crown
// (world/city.js home tower). They are only out while she has the shops open.
//
// One small interaction module per floor that holds a piece, in that floor's
// own frame (the same frame its crowd lives in: walk.js scans both alike).

import * as THREE from 'three';
import { DECOR } from '../src/inventory.js';

// level, side (+1/-1 = which wall of shops), bay centre z, and the shop it is in.
export const PICKS = [
  { id: 'sofa', level: 0, sx: 1, ez: 0, color: 0x7a5cff },
  { id: 'rug', level: 0, sx: -1, ez: 60, color: 0xff5ca8 },
  { id: 'plant', level: 1, sx: 1, ez: -60, color: 0x5cff9a },
  { id: 'floorLamp', level: 2, sx: -1, ez: 0, color: 0xffd45c },
  { id: 'wallArt', level: 3, sx: 1, ez: 60, color: 0x5cd0ff },
  { id: 'telescope', level: 6, sx: -1, ez: -60, color: 0xff9a5c },
];
const PICK_X = 22.5; // just inside the storefront line (18.5), on the carpet
const SPEAKER = { name: 'WaveMall Flagship', species: 'Complimentary Selection', cityId: 'wavemall prime' };

// Small box-built showpieces: [w, h, d, x, y, z, glow?]
const SHAPES = {
  sofa: [[2.6, 0.5, 1.1, 0, 0.55, 0], [2.6, 0.7, 0.3, 0, 1.1, -0.4], [0.3, 0.4, 1.1, -1.15, 0.95, 0], [0.3, 0.4, 1.1, 1.15, 0.95, 0]],
  rug: [[2.8, 0.08, 1.8, 0, 0.5, 0], [2.4, 0.1, 1.4, 0, 0.52, 0, 1]],
  plant: [[0.7, 0.6, 0.7, 0, 0.6, 0], [0.5, 1.2, 0.5, 0, 1.5, 0, 1], [1.0, 0.3, 0.3, 0, 1.6, 0, 1], [0.3, 0.3, 1.0, 0, 1.9, 0, 1]],
  floorLamp: [[0.6, 0.08, 0.6, 0, 0.34, 0], [0.12, 1.9, 0.12, 0, 1.3, 0], [0.6, 0.5, 0.6, 0, 2.45, 0, 1]],
  wallArt: [[1.6, 1.9, 0.12, 0, 1.5, 0], [1.3, 1.6, 0.14, 0, 1.5, 0.01, 1]],
  telescope: [[0.14, 1.3, 0.14, 0, 0.95, 0], [0.7, 0.06, 0.7, 0, 0.33, 0], [1.5, 0.28, 0.28, 0, 1.7, 0], [0.08, 0.3, 0.3, 0.78, 1.7, 0, 1]],
};

/**
 * @param floors  wavemall.floors ({ level, group, invQuat, floorY })
 * @param hooks   { open(): boolean, take(id): boolean }
 * @returns { modules: [{ hostGroup, hostInvQuat, nearestInteractable, interact, endInteract, onOutcome }], update(t), dispose(), spots }
 */
export function createMallPicks(floors, hooks) {
  const owned = [];
  const own = (x) => { owned.push(x); return x; };
  const box = own(new THREE.BoxGeometry(1, 1, 1));
  const ringGeo = own(new THREE.RingGeometry(1.9, 2.25, 40));
  const body = own(new THREE.MeshStandardMaterial({ color: 0x8a80b8, emissive: 0x2a2440, roughness: 0.6, metalness: 0.2 }));
  const pieces = [];
  const byFloor = new Map();

  for (const p of PICKS) {
    const f = floors.find((q) => q.level === p.level);
    if (!f) continue;
    const g = new THREE.Group();
    const x = p.sx * PICK_X, z = p.ez + 7;
    g.position.set(x, f.floorY, z);
    g.rotation.y = p.sx > 0 ? -Math.PI / 2 : Math.PI / 2; // face the promenade
    const glow = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color).multiplyScalar(1.6) }));
    const ring = new THREE.Mesh(ringGeo, own(new THREE.MeshBasicMaterial({
      color: new THREE.Color(p.color).multiplyScalar(1.8), side: THREE.DoubleSide, transparent: true, opacity: 0.9,
    })));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    const plinth = new THREE.Mesh(box, body);
    plinth.scale.set(3.2, 0.3, 2.2);
    plinth.position.y = 0.15;
    const spin = new THREE.Group();
    for (const [w, h, d, bx, by2, bz, lit] of SHAPES[p.id]) {
      const m = new THREE.Mesh(box, lit ? glow : body);
      m.scale.set(w, h, d);
      m.position.set(bx, by2, bz);
      spin.add(m);
    }
    g.add(ring, plinth, spin);
    f.group.add(g);
    const piece = {
      ...p, group: g, ring, spin, floor: f,
      pos: new THREE.Vector2(x, z), y: f.floorY,
      prompt: `E — TAKE THE ${DECOR[p.id].name.toUpperCase()}`,
    };
    pieces.push(piece);
    if (!byFloor.has(f)) byFloor.set(f, []);
    byFloor.get(f).push(piece);
  }

  const modules = [...byFloor.entries()].map(([f, list]) => ({
    hostGroup: f.group,
    hostInvQuat: f.invQuat,
    nearestInteractable(playerLocal, maxDist) {
      if (!hooks.open()) return null;
      let best = null, bestD2 = maxDist * maxDist;
      for (const e of list) {
        if (Math.abs(e.y - playerLocal.y) > 4) continue;
        const dx = e.pos.x - playerLocal.x, dz = e.pos.y - playerLocal.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { best = e; bestD2 = d2; }
      }
      return best;
    },
    interact(e) {
      const name = DECOR[e.id].name;
      return {
        speaker: SPEAKER,
        lines: [`The ${name}. Compliments of the Flagship, on the Crown’s account.`, 'One piece per pilot. Is this the one?'],
        offer: {
          kind: 'choice',
          prompt: `TAKE THE ${name.toUpperCase()}?`,
          options: [
            { label: 'This one.', outcomeTag: `menu:pick:${e.id}:yes` },
            { label: 'Keep looking.', outcomeTag: 'menu:pick:none:no' },
          ],
        },
      };
    },
    endInteract() {},
    onOutcome(tag) {
      const m = /^menu:pick:(\w+):yes$/.exec(tag ?? '');
      if (!m || !hooks.take(m[1])) return null;
      return { speaker: SPEAKER, lines: ['It is on a courier to Meridian Crown already. Maribel is waiting for you on the ground floor.'] };
    },
  }));

  return {
    modules,
    spots: pieces.map((p) => ({ id: p.id, level: p.level, x: p.pos.x, y: p.y, z: p.pos.y })),
    update(t) {
      const open = hooks.open();
      for (const p of pieces) {
        p.group.visible = open;
        if (!open) continue;
        p.spin.rotation.y = t * 0.5;
        p.ring.material.opacity = 0.6 + 0.3 * Math.sin(t * 3);
      }
    },
    dispose() {
      for (const p of pieces) p.floor.group.remove(p.group);
      for (const o of owned) o.dispose();
    },
  };
}
