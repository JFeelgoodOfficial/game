// The war fleets (src/fleets.js): what Rustia, Saturnia and Wavemall Prime put
// into space when the worldship started eating planets.
//
// Three warship classes and one freighter pattern in three liveries. A class
// is built ONCE into two merged geometries — a lit hull and an unlit glow —
// and every ship of that class is two meshes sharing them, so a fleet costs
// its draw calls and nothing else. Ship-local frame: +Z is the bow, +Y up,
// units are world units (a warship is about 700 long: these are capital
// ships, a planet's radius is 800–2600).
//
//   Rustia        iron wedges with the ember ore's light in their seams
//   Saturnia      pale, slender, ringed in halos
//   Wavemall      stacked blocks with the lights of a dance floor
//
// Each class also says where things are on it, for the stages that board a
// ship: `pad` (top-deck landing pad), `gun` (the lance's pivot), `radius`
// (bounding sphere, for hit tests and stand-off distances).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
function tint(geo, hex, gain = 1) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.set(hex);
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r * gain;
    col[i * 3 + 1] = _c.g * gain;
    col[i * 3 + 2] = _c.b * gain;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
const box = (w, h, d, x, y, z, hex, gain) => tint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex, gain);
// a cylinder lying along Z: radius `rBow` at +Z end, `rStern` at -Z end
const tube = (rBow, rStern, len, x, y, z, seg, hex, gain) =>
  tint(new THREE.CylinderGeometry(rBow, rStern, len, seg).rotateX(Math.PI / 2).translate(x, y, z), hex, gain);
// a ring around the Z axis
const halo = (r, t, x, y, z, hex, gain) => tint(new THREE.TorusGeometry(r, t, 8, 56).translate(x, y, z), hex, gain);
const ball = (r, x, y, z, hex, gain) => tint(new THREE.SphereGeometry(r, 16, 10).translate(x, y, z), hex, gain);

function finish(lit, glow, extra) {
  const out = {
    lit: mergeGeometries(lit, false),
    glow: mergeGeometries(glow, false),
    ...extra,
  };
  for (const g of lit) g.dispose();
  for (const g of glow) g.dispose();
  out.lit.computeBoundingSphere();
  return out;
}

// --- Rustia: the Emberwright class ---
function rustiaWarship() {
  const IRON = 0x1d1715, PLATE = 0x2e231d, RUST = 0x4a2a1c;
  const EMBER = 0xff6a1e, HOT = 0xffc070;
  const lit = [], glow = [];
  lit.push(tube(26, 96, 560, 0, 0, 0, 6, IRON)); // the wedge
  lit.push(tube(60, 100, 150, 0, 0, -330, 6, PLATE)); // engine block
  // armour: overlapping plates down each flank
  for (let i = 0; i < 6; i++) {
    const z = -200 + i * 78, w = 86 - i * 9;
    for (const s of [-1, 1]) lit.push(box(10, 40, 70, s * w, 4, z, i % 2 ? PLATE : RUST));
  }
  // citadel and bridge
  lit.push(box(70, 46, 130, 0, 92, -150, PLATE));
  lit.push(box(44, 26, 60, 0, 128, -170, IRON));
  lit.push(box(120, 8, 150, 0, 70, -80, RUST)); // flight deck
  // keel fin, and the lance slung under the bow
  lit.push(box(8, 60, 220, 0, -70, -120, IRON));
  lit.push(tube(7, 11, 230, 0, -34, 240, 10, PLATE));
  // seams: the ore's light, running the length of the hull
  for (const s of [-1, 1]) {
    glow.push(box(3, 3, 420, s * 58, 30, -30, EMBER, 1.3));
    glow.push(box(3, 3, 300, s * 74, -18, -90, EMBER, 1.1));
    for (let i = 0; i < 6; i++) glow.push(box(2, 34, 3, s * (92 - i * 9), 4, -164 + i * 78, EMBER, 1.2));
  }
  glow.push(box(6, 3, 380, 0, 50, 40, HOT, 1.4)); // molten spine
  glow.push(box(36, 5, 2, 0, 132, -139, HOT, 1.2)); // bridge windows
  // furnaces
  for (const [x, y] of [[-48, 10], [48, 10], [0, -38]]) {
    lit.push(tube(40, 34, 70, x, y, -420, 12, IRON));
    glow.push(tube(31, 31, 4, x, y, -456, 12, EMBER, 1.6));
    glow.push(tube(16, 16, 5, x, y, -458, 12, HOT, 1.8));
  }
  glow.push(halo(98, 2.2, 0, 0, -262, EMBER, 1.2));
  return finish(lit, glow, {
    radius: 380, pad: new THREE.Vector3(0, 74, -80), padR: 46,
    gun: new THREE.Vector3(0, -34, 300), bridge: new THREE.Vector3(0, 141, -170),
  });
}

// --- Saturnia: the Halo class ---
function saturniaWarship() {
  const IVORY = 0xeae3d0, PEARL = 0xcfc8b6, GOLD = 0xc9a24a;
  const LIGHT = 0xfff0c0, STAR = 0xffffff, SKY = 0xbfe4ff;
  const lit = [], glow = [];
  lit.push(tube(10, 40, 640, 0, 0, 0, 20, IVORY)); // the spindle
  lit.push(tube(40, 26, 110, 0, 0, -370, 20, PEARL));
  lit.push(box(150, 6, 170, 0, 30, -60, PEARL)); // the terrace (flight deck)
  lit.push(box(34, 30, 70, 0, 50, -150, IVORY)); // the lantern (bridge)
  // sails: three fins round the stern
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const g = new THREE.BoxGeometry(4, 150, 190).translate(0, 100, -250).rotateZ(a - Math.PI / 2);
    lit.push(tint(g, IVORY));
    const e = new THREE.BoxGeometry(5, 2.5, 190).translate(0, 176, -250).rotateZ(a - Math.PI / 2);
    glow.push(tint(e, LIGHT, 1.3));
  }
  // the halos, and the gilded collars they hang from
  const rings = [[168, -150], [128, 20], [84, 170]];
  for (const [r, z] of rings) {
    glow.push(halo(r, 3.4, 0, 0, z, LIGHT, 1.35));
    glow.push(halo(r - 9, 1.2, 0, 0, z, STAR, 1.1));
    lit.push(tube(46 - (z + 150) * 0.07, 48 - (z + 150) * 0.07, 14, 0, 0, z, 20, GOLD));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const sp = new THREE.BoxGeometry(2, r - 30, 2).translate(0, (r + 30) / 2, z).rotateZ(a);
      lit.push(tint(sp, GOLD));
    }
  }
  glow.push(ball(15, 0, 0, 330, STAR, 1.8)); // the prow star
  glow.push(box(26, 4, 2, 0, 54, -114, SKY, 1.3));
  lit.push(tube(6, 9, 210, 0, -30, 200, 10, GOLD)); // the lance
  glow.push(tube(22, 22, 4, 0, 0, -427, 20, SKY, 1.6));
  glow.push(tube(10, 10, 5, 0, 0, -429, 20, STAR, 1.8));
  return finish(lit, glow, {
    radius: 400, pad: new THREE.Vector3(0, 33, -40), padR: 46,
    gun: new THREE.Vector3(0, -30, 260), bridge: new THREE.Vector3(0, 65, -150),
  });
}

// --- Wavemall Prime: the Discotheque class ---
function wavemallWarship() {
  const DARK = 0x1a1226, PLUM = 0x34204c, CHROME = 0x9aa0b4;
  const PINK = 0xff3fb4, CYAN = 0x3ff4ff, GOLD = 0xffe14a;
  const lit = [], glow = [];
  // stacked blocks, each a floor of the mall
  const blocks = [
    [230, 130, 300, 0, 0, -120, PLUM], [180, 100, 240, 20, 16, 130, DARK],
    [120, 70, 150, -10, 40, 300, PLUM], [150, 60, 180, -30, 96, -160, DARK],
    [90, 50, 110, 60, -70, -40, DARK],
  ];
  for (const [w, h, d, x, y, z, c] of blocks) lit.push(box(w, h, d, x, y, z, c));
  lit.push(box(170, 6, 200, 20, 69, 130, CHROME)); // roof terrace (flight deck)
  lit.push(box(60, 34, 60, -30, 143, -200, CHROME)); // the booth (bridge)
  // dance-floor panels on the flanks: a grid of lit squares
  const cols = [PINK, CYAN, GOLD];
  let n = 0;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 3; j++) {
        if ((i * 7 + j * 3 + (s > 0 ? 1 : 0)) % 4 === 0) continue;
        glow.push(box(2, 26, 26, s * 116.5, -40 + j * 36, -250 + i * 32, cols[n++ % 3], 1.15));
      }
    }
    for (let i = 0; i < 6; i++) glow.push(box(2, 20, 28, 20 + s * 91.5, -14 + (i % 2) * 30, 30 + i * 36, cols[n++ % 3], 1.1));
  }
  // marquee round the bow block, and the mirror ball
  for (const y of [8, 72]) {
    glow.push(box(124, 3, 3, -10, y, 376, PINK, 1.4));
    glow.push(box(3, 3, 152, 51, y, 300, CYAN, 1.3));
    glow.push(box(3, 3, 152, -71, y, 300, CYAN, 1.3));
  }
  lit.push(box(3, 34, 3, -30, 160, -120, CHROME)); // its mast
  glow.push(ball(34, -30, 176, -120, 0xffffff, 1.25));
  glow.push(box(50, 6, 2, -30, 148, -169, GOLD, 1.3));
  lit.push(tube(8, 12, 220, 0, -50, 330, 10, CHROME)); // the lance
  for (const x of [-70, 0, 70]) {
    lit.push(box(50, 50, 40, x, -10, -290, DARK));
    glow.push(box(38, 38, 3, x, -10, -311, PINK, 1.6));
  }
  return finish(lit, glow, {
    radius: 420, pad: new THREE.Vector3(20, 72, 130), padR: 46,
    gun: new THREE.Vector3(0, -50, 400), bridge: new THREE.Vector3(-30, 160, -200),
  });
}

// --- freighters: one pattern, three liveries ---
function freighter(hull, trim, crates, light) {
  const lit = [], glow = [];
  lit.push(box(36, 36, 440, 0, 0, 0, hull)); // spine
  lit.push(box(96, 60, 80, 0, 14, 230, trim)); // forward house
  lit.push(box(110, 70, 90, 0, 0, -250, hull)); // engine block
  for (let i = 0; i < 6; i++) {
    for (const s of [-1, 1]) {
      for (const y of [-26, 26]) {
        lit.push(box(52, 46, 54, s * 46, y, -170 + i * 62, crates[(i + (s > 0 ? 1 : 0) + (y > 0 ? 1 : 0)) % crates.length]));
      }
    }
  }
  glow.push(box(70, 5, 2, 0, 30, 271, light, 1.3));
  for (const s of [-1, 1]) glow.push(box(2, 2, 420, s * 19, 19, 0, light, 1.1));
  for (const x of [-30, 30]) glow.push(tube(18, 18, 4, x, 0, -297, 12, light, 1.6));
  return finish(lit, glow, {
    radius: 300, pad: new THREE.Vector3(0, 46, 230), padR: 40,
    gun: null, bridge: new THREE.Vector3(0, 46, 250),
  });
}

// The classes, built on first use. `faction` is the planet's name.
let built = null;
export function shipClasses() {
  if (built) return built;
  built = {
    rustia: {
      label: 'RUSTIA', warship: rustiaWarship(),
      freighter: freighter(0x241b18, 0x3a2a22, [0x5a2f1c, 0x3a2620, 0x6b3a1e], 0xff6a1e),
      names: ['Emberwright', 'Last Seam', 'Cage and Lamp'], hauler: ['Ore Tithe', 'Redline Mule'],
    },
    saturnia: {
      label: 'SATURNIA', warship: saturniaWarship(),
      freighter: freighter(0xd8d1bd, 0xc9a24a, [0xeae3d0, 0xbfb59a, 0xd9c489], 0xfff0c0),
      names: ['Halo of Morning', 'Quiet Thunder', 'Ninth Bell'], hauler: ['Gilded Tide', 'Cloud Alms'],
    },
    'wavemall prime': {
      label: 'WAVEMALL', warship: wavemallWarship(),
      freighter: freighter(0x221733, 0x9aa0b4, [0xff3fb4, 0x3ff4ff, 0xffe14a, 0x6a3fb4], 0xff3fb4),
      names: ['Saturday Forever', 'Food Court Admiral', 'Buy One Get One'], hauler: ['Clearance Event', 'Loss Leader'],
    },
  };
  return built;
}

// One ship of a class: two meshes on a group. Materials are per faction and
// shared (the fleet module owns them, so it can cycle Wavemall's lights).
export function buildShip(cls, litMat, glowMat) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(cls.lit, litMat));
  group.add(new THREE.Mesh(cls.glow, glowMat));
  return group;
}

// ---------------------------------------------------------------------------
// Boarding: the walkable part of a ship
// ---------------------------------------------------------------------------
//
// Built the first time a pilot steps out on a given ship, onto that ship's
// group: the pad on its flight deck, a gangway out to starboard, and a bridge
// wing hung off the side — an open platform under a frame, with the captain,
// two of the crew, a row of desks, and (on a warship) the gunnery console.
// The same kit on every hull, in the faction's own materials.
//
// Returns the `site` src/capitalWalk.js walks (see that file for the shape).
// `people(seed)` makes a figure: { group, update(dt, t, talking) }.
// `story`: { captain(ship), crew(ship, i), choice(tag), targets(), onHit(id) }.

const ZERO = new THREE.Vector3();

export function buildDeck(ship, mats, people, story, sunDir) {
  const cls = ship.cls;
  const P = cls.pad, R = cls.padR;
  const y = P.y;
  const SNAP = 1.2;
  const surfaces = [];
  const colliders = [];
  const lit = [], glow = [];
  const DECK = 0x2a2c30, TRIM = 0x55585f;
  const LIGHT = ship.faction === 'rustia' ? 0xff6a1e : ship.faction === 'saturnia' ? 0xfff0c0 : 0xff3fb4;

  // pad
  lit.push(tint(new THREE.CylinderGeometry(R + 4, R + 4, 2, 40).translate(P.x, y - 1, P.z), DECK));
  glow.push(tint(new THREE.TorusGeometry(R - 2, 0.25, 6, 64).rotateX(Math.PI / 2).translate(P.x, y + 0.1, P.z), LIGHT, 1.1));
  surfaces.push({ kind: 'disc', cx: P.x, cz: P.z, r: R + 4, y });
  // gangway to starboard
  const gx0 = P.x + R, gx1 = gx0 + 46;
  lit.push(box(gx1 - gx0 + 8, 1.6, 10, (gx0 + gx1) / 2, y - 0.8, P.z, TRIM));
  for (const s of [-1, 1]) glow.push(box(gx1 - gx0, 0.12, 0.25, (gx0 + gx1) / 2, y + 0.08, P.z + s * 4.6, LIGHT, 1.1));
  surfaces.push({ kind: 'rect', cx: (gx0 + gx1) / 2, cz: P.z, ux: 1, uz: 0, hl: (gx1 - gx0) / 2 + 4, hw: 5, yA: y, yB: y });
  // bridge wing
  const bx = gx1 + 17, HL = 17, HW = 14;
  lit.push(box(HL * 2, 2.4, HW * 2, bx, y - 1.2, P.z, DECK));
  lit.push(box(6, 30, 6, bx, y - 17, P.z, TRIM)); // strut down to the hull
  surfaces.push({ kind: 'rect', cx: bx, cz: P.z, ux: 1, uz: 0, hl: HL, hw: HW, yA: y, yB: y });
  // frame: four posts and a roof ring, so it reads as a room
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      lit.push(box(0.7, 9, 0.7, bx + sx * (HL - 0.6), y + 4.5, P.z + sz * (HW - 0.6), TRIM));
      colliders.push({ x: bx + sx * (HL - 0.6), z: P.z + sz * (HW - 0.6), r: 0.6, top: Infinity });
    }
  }
  glow.push(box(HL * 2, 0.3, 0.3, bx, y + 9, P.z - HW + 0.6, LIGHT, 1.0));
  glow.push(box(HL * 2, 0.3, 0.3, bx, y + 9, P.z + HW - 0.6, LIGHT, 1.0));
  glow.push(box(0.3, 0.3, HW * 2, bx + HL - 0.6, y + 9, P.z, LIGHT, 1.0));
  // desks along the outboard edge
  const desks = [];
  for (let i = 0; i < 3; i++) {
    const dz = P.z + (i - 1) * 8;
    const dx = bx + HL - 3;
    lit.push(box(2, 1.2, 5, dx, y + 0.6, dz, TRIM));
    glow.push(box(1.4, 0.08, 4.2, dx, y + 1.24, dz, LIGHT, 1.0));
    colliders.push({ x: dx, z: dz, r: 2.0, top: y + 1.2 + SNAP + 0.2 });
    desks.push({ x: dx - 2.6, z: dz });
  }
  // gunnery console, forward edge (warships only)
  const consoles = [];
  if (cls.gun) {
    const cx = bx - 4, cz = P.z + HW - 2.5;
    lit.push(box(5, 1.3, 1.6, cx, y + 0.65, cz, TRIM));
    glow.push(box(4.4, 0.08, 1.1, cx, y + 1.34, cz, 0xff5a3a, 1.2));
    colliders.push({ x: cx, z: cz, r: 1.9, top: y + 1.3 + SNAP + 0.2 });
    consoles.push({ x: cx, y, z: cz - 2.4, r: 2.8, prompt: 'E — MAN THE LANCE', gun: true, gunYaw: 0, use: () => null });
  }

  const g = new THREE.Group();
  const litMesh = new THREE.Mesh(mergeGeometries(lit, false), mats.lit);
  const glowMesh = new THREE.Mesh(mergeGeometries(glow, false), mats.glow);
  for (const q of lit) q.dispose();
  for (const q of glow) q.dispose();
  g.add(litMesh, glowMesh);
  ship.group.add(g);

  // people: the captain mid-wing facing the gangway, two at the desks
  const figures = [];
  const npcs = [];
  const place = (seed, x, z, face, talk) => {
    const f = people(seed);
    f.group.position.set(x, y + (f.lift || 0), z);
    f.group.rotation.y = face;
    g.add(f.group);
    figures.push(f);
    colliders.push({ x, z, r: 0.6, top: Infinity });
    npcs.push({ x, y, z, talk });
  };
  const seed = ship.id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  place(seed, bx - 5, P.z - 3, -Math.PI / 2, () => story.captain(ship));
  place(seed + 11, desks[0].x, desks[0].z, Math.PI / 2, () => story.crew(ship, 0));
  place(seed + 23, desks[2].x, desks[2].z, Math.PI / 2, () => story.crew(ship, 1));

  function floorYAt(x, z, feetY) {
    let best = -Infinity;
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      const dx = x - s.cx, dz = z - s.cz;
      if (s.kind === 'disc') {
        if (dx * dx + dz * dz > s.r * s.r) continue;
      } else if (Math.abs(dx * s.ux + dz * s.uz) > s.hl || Math.abs(-dx * s.uz + dz * s.ux) > s.hw) continue;
      const fy = s.kind === 'disc' ? s.y : s.yA;
      if (fy <= feetY + SNAP && fy > best) best = fy;
    }
    return best;
  }

  return {
    group: ship.group,
    planet: { group: { position: ZERO }, sunDir },
    pad: P.clone(),
    padR: R,
    spawn: new THREE.Vector3(P.x + 13, y, P.z - 13),
    surfaces,
    colliders,
    floorYAt,
    snap: SNAP,
    npcs,
    consoles,
    onChoice: (tag) => story.choice(tag, ship),
    setWalker() {},
    gun: cls.gun ? { pivot: cls.gun, targets: () => story.targets(ship), onHit: (id) => story.onHit(id) } : null,
    update(dt, t) {
      for (const f of figures) f.update(dt, t);
    },
    places: { pad: [P.x + 10, y, P.z - 9], bridge: [bx - 8, y, P.z - 3], gun: consoles[0] ? [consoles[0].x, y, consoles[0].z] : null },
  };
}
