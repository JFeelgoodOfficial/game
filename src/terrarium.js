// The ship's terrarium — what you brought home from stevenlacey.
//
// A glass tank against the port wall of the stern lounge. Whatever creatures
// are in the inventory (src/inventory.js `specimens`, the catalog in
// world/coin-bestiary.js) live in it, each in the part that suits its element:
// Tide in the water, Ember on the warm rock, Moss and Shade on the floor
// between. It is there from the start, empty, with its plaque; the count on the
// plaque is the only thing that says where to go to fill it.
//
// The tank is 2D on purpose, like the world its tenants came from: the glass is
// one plane carrying a canvas texture, redrawn a few times a second and only
// while the pilot is out of the seat (src/interior.js calls update() from its
// own `active` branch), so it costs nothing in flight.
//
// The same simulation and the same drawing serve the close-up (E at the glass,
// src/terrariumView.js), which is why both are exported.

import * as THREE from 'three';
import { SPECIMENS, SPECIMEN_ORDER, ELEMENT_COLOR, drawMon } from '../world/coin-bestiary.js';
import { ownedSpecimens } from './inventory.js';
import { drawTerrariumView, isTerrariumViewOpen } from './terrariumView.js';

// The tank's own space: 512 x 256, y down. Everything below is in these units.
const TW = 512, TH = 256;
const FLOOR = 214; // top of the soil
const WATER_X1 = 150; // the water runs from the left wall to here
const ROCK_X0 = 384; // the warm rock, to the right wall
const ROCK_TOP = 166;
const REDRAW = 1 / 15; // seconds between redraws of the glass

const TANK_LEN = 2.2; // metres along the wall
const GLASS_H = TANK_LEN * (TH / TW);
const BASE_H = 0.75;
const DEPTH = 0.55;

// ---- the simulation -----------------------------------------------------------

// Where a creature of this kind may wander: a box, and whether it is held to a
// floor line (walkers) or roams the whole box (swimmers and fliers).
function zoneFor(id) {
  const el = SPECIMENS[id].element;
  if (id === 'lantern') return { x0: 300, x1: 480, y0: 60, y1: 130, free: true };
  // the Crownstag is Tide by nature but a walker by build: it keeps to the bank
  if (el === 'tide' && id !== 'crown') return { x0: 16, x1: WATER_X1 - 40, y0: 118, y1: FLOOR - 4, free: true };
  if (el === 'ember') return { x0: ROCK_X0 + 6, x1: TW - 44, y0: ROCK_TOP, y1: ROCK_TOP, free: false };
  return { x0: WATER_X1 + 8, x1: ROCK_X0 - 40, y0: FLOOR, y1: FLOOR, free: false };
}

export function makeTankState() {
  return { mons: [], key: '', t: 0 };
}

// Bring the tenants in line with the inventory. Cheap when nothing changed.
export function syncTank(state, ids) {
  const key = ids.join(',');
  if (key === state.key) return;
  state.key = key;
  const keep = new Map(state.mons.map((m) => [m.id, m]));
  state.mons = SPECIMEN_ORDER.filter((id) => ids.includes(id)).map((id, i) => {
    if (keep.has(id)) return keep.get(id);
    const z = zoneFor(id);
    const x = z.x0 + ((i * 53) % Math.max(1, z.x1 - z.x0));
    const y = z.free ? (z.y0 + z.y1) / 2 : z.y0;
    return { id, zone: z, x, y, tx: x, ty: y, dir: 1, wait: 0.5 + i * 0.3 };
  });
}

export function stepTank(state, dt) {
  state.t += dt;
  for (const m of state.mons) {
    if (m.wait > 0) {
      m.wait -= dt;
      continue;
    }
    const dx = m.tx - m.x, dy = m.ty - m.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) {
      // arrived: stand a moment, then pick somewhere else in the patch
      const z = m.zone;
      m.wait = 0.6 + Math.random() * 2.2;
      m.tx = z.x0 + Math.random() * (z.x1 - z.x0);
      m.ty = z.free ? z.y0 + Math.random() * (z.y1 - z.y0) : z.y0;
      continue;
    }
    const sp = (m.zone.free ? 26 : 16) * dt;
    m.x += (dx / d) * Math.min(sp, d);
    m.y += (dy / d) * Math.min(sp, d);
    if (Math.abs(dx) > 1) m.dir = dx > 0 ? 1 : -1;
  }
}

// Draw the tank into a w x h rectangle at the canvas origin. `labels` adds each
// tenant's name under it (the close-up).
export function drawTank(g, state, w, h, labels = false) {
  const t = state.t;
  g.save();
  g.scale(w / TW, h / TH);
  g.imageSmoothingEnabled = false;
  // back wall
  const back = g.createLinearGradient(0, 0, 0, TH);
  back.addColorStop(0, '#1c2c34');
  back.addColorStop(1, '#0e181c');
  g.fillStyle = back;
  g.fillRect(0, 0, TW, TH);
  // a lamp bar along the top
  g.fillStyle = 'rgba(255,240,200,0.10)';
  g.fillRect(0, 0, TW, 40);
  // soil
  g.fillStyle = '#4a3622';
  g.fillRect(0, FLOOR, TW, TH - FLOOR);
  g.fillStyle = '#5e4630';
  for (let i = 0; i < 40; i++) g.fillRect((i * 37) % TW, FLOOR + 6 + ((i * 13) % 30), 4, 2);
  // moss on the middle floor, and a few ferns
  g.fillStyle = '#3f8a48';
  g.fillRect(WATER_X1, FLOOR - 3, ROCK_X0 - WATER_X1, 5);
  g.fillStyle = '#58a85a';
  for (let x = WATER_X1 + 8; x < ROCK_X0 - 8; x += 22) {
    const sway = Math.round(Math.sin(t * 1.3 + x) * 1.5);
    g.fillRect(x + sway, FLOOR - 15, 2, 12);
    g.fillRect(x - 4 + sway, FLOOR - 11, 4, 2);
    g.fillRect(x + 2 + sway, FLOOR - 13, 4, 2);
  }
  // the warm rock
  g.fillStyle = '#5a4a44';
  g.fillRect(ROCK_X0, ROCK_TOP, TW - ROCK_X0, TH - ROCK_TOP);
  g.fillStyle = '#6e5a50';
  g.fillRect(ROCK_X0, ROCK_TOP, TW - ROCK_X0, 4);
  g.fillRect(ROCK_X0 - 10, ROCK_TOP + 24, 10, TH - ROCK_TOP - 24);
  const glow = 0.5 + 0.5 * Math.sin(t * 2);
  g.fillStyle = `rgba(255,${120 + Math.round(glow * 60)},50,0.85)`;
  g.fillRect(ROCK_X0 + 30, ROCK_TOP + 22, 26, 3);
  g.fillRect(ROCK_X0 + 84, ROCK_TOP + 38, 34, 3);
  g.fillRect(ROCK_X0 + 50, ROCK_TOP + 58, 18, 3);
  // the water, drawn before its tenants so they show through it
  g.fillStyle = 'rgba(63,127,208,0.42)';
  g.fillRect(0, 104, WATER_X1, TH - 104);
  g.fillStyle = '#6e5a50';
  g.fillRect(WATER_X1 - 6, 100, 8, TH - 100); // the pane that holds it
  g.fillStyle = 'rgba(159,208,244,0.8)';
  for (let x = 0; x < WATER_X1 - 8; x += 16) g.fillRect(x + ((t * 9 + x) % 10), 104, 6, 1);
  for (let i = 0; i < 6; i++) {
    const by = TH - ((t * (14 + i * 3) + i * 40) % (TH - 110));
    g.fillRect(20 + i * 28 + Math.round(Math.sin(t + i) * 2), by, 2, 2);
  }

  const frame = (t * 2.5) & 1;
  let n = 0;
  for (const m of state.mons) {
    const drop = (n++ & 1) * 10; // alternate label heights, so neighbours do not overprint
    const bob = m.zone.free ? Math.round(Math.sin(t * 2.4 + m.x * 0.05) * 2) : 0;
    drawMon(g, m.id, m.wait > 0 ? 0 : frame, Math.round(m.x), Math.round(m.y) - 32 + bob, 2, m.dir < 0);
    if (labels) {
      const s = SPECIMENS[m.id];
      g.font = "bold 9px 'Courier New', monospace";
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillStyle = '#05080c';
      g.fillText(s.name.toUpperCase(), Math.round(m.x) + 17, Math.round(m.y) + 4 + bob + drop);
      g.fillStyle = ELEMENT_COLOR[s.element];
      g.fillText(s.name.toUpperCase(), Math.round(m.x) + 16, Math.round(m.y) + 3 + bob + drop);
    }
  }
  if (!state.mons.length) {
    g.font = "bold 12px 'Courier New', monospace";
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(232,217,176,0.75)';
    g.fillText('EMPTY · THE COIN WORLD STEVENLACEY IS OUT THERE', TW / 2, 70);
  }
  // glass: a pale streak or two
  g.fillStyle = 'rgba(255,255,255,0.05)';
  g.fillRect(40, 0, 26, TH);
  g.fillRect(74, 0, 8, TH);
  g.restore();
}

// ---- the tank in the lounge -----------------------------------------------------

// o: { group, MATS, solid, F (floor y), HW (hall half-width), Z0 (lounge fore wall z), signTexture }
export function buildTerrarium(o) {
  const { group, MATS, solid, F, HW, Z0, signTexture } = o;
  const xBack = -HW + 0.02; // against the port wall
  const xFront = xBack + DEPTH;
  const zMid = Z0 + 2.3;
  const z0 = zMid - TANK_LEN / 2, z1 = zMid + TANK_LEN / 2;
  const glassY = F + BASE_H + GLASS_H / 2;

  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  // the cabinet, a lid, and a dark box behind the glass
  add(new THREE.BoxGeometry(DEPTH, BASE_H, TANK_LEN + 0.1), MATS.bench, xBack + DEPTH / 2, F + BASE_H / 2, zMid);
  add(new THREE.BoxGeometry(DEPTH + 0.04, 0.08, TANK_LEN + 0.14), MATS.trim, xBack + DEPTH / 2, F + BASE_H + GLASS_H + 0.04, zMid);
  add(new THREE.BoxGeometry(DEPTH - 0.04, GLASS_H, TANK_LEN), MATS.trim, xBack + DEPTH / 2 - 0.02, glassY, zMid);
  for (const z of [z0 - 0.02, z1 + 0.02]) {
    add(new THREE.BoxGeometry(DEPTH + 0.02, GLASS_H, 0.04), MATS.trim, xBack + DEPTH / 2, glassY, z);
  }

  const canvas = document.createElement('canvas');
  canvas.width = TW;
  canvas.height = TH;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  // 0xd2d2d2 like the lounge panel: keeps the brightest pixels under the bloom
  const glass = add(new THREE.PlaneGeometry(TANK_LEN, GLASS_H),
    new THREE.MeshBasicMaterial({ map: tex, color: 0xd2d2d2 }), xFront + 0.005, glassY, zMid);
  glass.rotation.y = Math.PI / 2; // facing +x, into the room

  // the plaque on the cabinet: redrawn with the count
  let plaque = null;
  let plaqueCount = -1;
  function setPlaque(n) {
    if (n === plaqueCount) return;
    plaqueCount = n;
    const t = signTexture([
      ['FOR STEVEN & LACEY', 26, '600 24px monospace', '#e8d9b0'],
      [`TERRARIUM · ${n} / ${SPECIMEN_ORDER.length} FROM STEVENLACEY`, 56, '15px monospace', '#c8a86a'],
    ], 640, 80);
    if (plaque) {
      plaque.material.map.dispose();
      plaque.material.map = t;
    } else {
      plaque = add(new THREE.PlaneGeometry(1.5, 0.19),
        new THREE.MeshBasicMaterial({ map: t, color: 0xd2d2d2 }), xFront + 0.005, F + BASE_H - 0.2, zMid);
      plaque.rotation.y = Math.PI / 2;
    }
  }

  solid(xBack - 0.2, xFront, z0 - 0.06, z1 + 0.06);

  const state = makeTankState();
  let since = REDRAW;

  function refresh() {
    const ids = ownedSpecimens();
    syncTank(state, ids);
    setPlaque(ids.length);
    since = REDRAW; // redraw on the next update
  }

  function update(dt) {
    stepTank(state, dt);
    since += dt;
    if (since >= REDRAW) {
      since = 0;
      drawTank(g, state, TW, TH, false);
      tex.needsUpdate = true;
    }
    if (isTerrariumViewOpen()) drawTerrariumView(state);
  }

  // Standing at the glass, looking at it. `pos` is the pilot's floor position,
  // `yaw` their heading (yaw 0 faces -z; the tank is at -x).
  function near(pos, yaw) {
    if (pos.z < z0 - 0.3 || pos.z > z1 + 0.3) return false;
    if (pos.x > xFront + 2.2) return false;
    return Math.sin(yaw) > 0.45; // view x = -sin(yaw): facing port
  }

  refresh();
  return { update, refresh, near, state, count: () => state.mons.length };
}
