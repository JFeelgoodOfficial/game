// ---------------------------------------------------------------------------
// The Reach's riser: a glass tube from the moon pool to the seabed, the lift
// that runs inside it, and what stands at the bottom — a pressure habitat
// over a bore sunk into the planet, with the charge seated in it.
//
// Everything here is ANCHOR-frame (static; +Y up, y = 0 the still sea), not
// hull-frame: two hundred units of pipe cannot swing with a pitching ship, so
// the hull slides on the riser's head the way a drillship rides its slip
// joint. Only the lift's top station follows the deck (setTopY), so the
// platform is flush with the plating when you step on and off.
//
// The governor's second errand (world/cityRegistry.js `charge`) sends you
// down. The lift stays locked until she has asked. At the bottom the console
// says ARM. It does not arm.
//
// Sea life: schools, jellyfish and one very large thing that circles the tube
// are all animated in their vertex shaders from per-instance attributes —
// nothing per frame on the CPU but one uniform.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { questStage } from '../src/journal.js';

export const CHARGE_QUEST = 'neptunia-charge'; // undefined | 'go' | 'blown'

export const TUBE = {
  R: 7, // glass radius
  CAB_R: 6.5,
  SPEED: 9, // u/s
  HAB_H: 6, // habitat ceiling height
};

export function createReachTube(kit) {
  const { anchor, H, PAINT, tint, boxG, cylG, beamG, makeStructure, mulberry32, deckMat, bulkMat, glowMat, seabedYAt } = kit;
  const rng = mulberry32(0x7ab3c1);
  const AX = H.POOL.x, AZ = H.POOL.z;
  // Habitat floor: a little proud of the seabed under the riser.
  const habY = Math.ceil(seabedYAt(AX, AZ) + 2);
  const ceilY = habY + TUBE.HAB_H;

  const group = new THREE.Group();
  group.name = 'reachTube';
  anchor.add(group);

  const solid = [], deck = [], glow = [], glass = [];
  const surfaces = [], walls = [];
  const S = (list, g, color) => { list.push(tint(g, color)); return g; };
  const wall = (x0, x1, z0, z1, y0, y1) => {
    const w = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1 };
    walls.push(w);
    return w;
  };

  // ======================= THE RISER =======================================
  const tubeTop = 8.5, tubeBot = ceilY;
  {
    const len = tubeTop - tubeBot;
    const g = new THREE.CylinderGeometry(TUBE.R, TUBE.R, len, 36, 1, true);
    g.translate(AX, (tubeTop + tubeBot) / 2, AZ);
    S(glass, g, 0xa8dcf0);
    // ring frames every 12 u, with a lamp pair on each
    for (let y = tubeTop - 6, k = 0; y > tubeBot + 2; y -= 12, k++) {
      const ring = new THREE.TorusGeometry(TUBE.R + 0.12, 0.28, 6, 36);
      ring.rotateX(Math.PI / 2); ring.translate(AX, y, AZ);
      S(solid, ring, PAINT.houseDark);
      for (const a of [k * 0.9, k * 0.9 + Math.PI]) {
        S(glow, boxG(0.3, 0.3, 0.3, AX + Math.cos(a) * (TUBE.R + 0.3), y, AZ + Math.sin(a) * (TUBE.R + 0.3)), k % 5 === 0 ? PAINT.amber : PAINT.cyan);
      }
    }
    // six rails the lift runs on
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.2;
      S(solid, boxG(0.22, len, 0.22, AX + Math.cos(a) * (TUBE.R - 0.25), (tubeTop + tubeBot) / 2, AZ + Math.sin(a) * (TUBE.R - 0.25)), PAINT.trim);
    }
    // the shaft's collider: a ring of boxes, from the habitat roof to under the keel
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const cx = AX + Math.cos(a) * (TUBE.R + 1.3), cz = AZ + Math.sin(a) * (TUBE.R + 1.3);
      wall(cx - 1.7, cx + 1.7, cz - 1.7, cz + 1.7, ceilY, 7);
    }
  }

  // ======================= THE HABITAT ======================================
  // hall (the lift lands in it) -> corridor -> the charge chamber
  const HALL = { x0: -12, x1: 12, z0: AZ - 12, z1: AZ + 12 };
  const COR = { x0: -3, x1: 3, z0: AZ + 12, z1: AZ + 26 };
  const CH = { x0: -13, x1: 13, z0: AZ + 26, z1: AZ + 54 };
  const CHARGE = { x: 0, z: AZ + 42 };
  const CONSOLE = { x: 0, z: AZ + 35 };
  {
    const floor = (r, color = PAINT.deck) => {
      S(deck, boxG(r.x1 - r.x0, 0.5, r.z1 - r.z0, (r.x0 + r.x1) / 2, habY - 0.25, (r.z0 + r.z1) / 2), color);
      surfaces.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y: habY });
    };
    floor(HALL); floor(COR, PAINT.deckDark); floor(CH);
    // glazed wall: steel sill and head, glass between, a mullion every 3 u
    const TH = 0.6;
    const glazed = (axis, at, a0, a1, gaps = []) => {
      let from = a0;
      const run = (s0, s1) => {
        if (s1 - s0 < 0.1) return;
        const mid = (s0 + s1) / 2, len = s1 - s0;
        const put = (list, hgt, yc, thick, color) => S(list, axis === 'x'
          ? boxG(len, hgt, thick, mid, yc, at) : boxG(thick, hgt, len, at, yc, mid), color);
        put(solid, 1.1, habY + 0.55, TH, PAINT.houseDark);
        put(solid, 0.9, ceilY - 0.45, TH, PAINT.houseDark);
        put(glass, TUBE.HAB_H - 2.0, habY + 1.1 + (TUBE.HAB_H - 2.0) / 2, 0.08, 0xa8dcf0);
        const n = Math.max(1, Math.round(len / 3));
        for (let i = 0; i <= n; i++) {
          const a = s0 + (len * i) / n;
          S(solid, axis === 'x' ? boxG(0.3, TUBE.HAB_H, TH, a, habY + TUBE.HAB_H / 2, at) : boxG(TH, TUBE.HAB_H, 0.3, at, habY + TUBE.HAB_H / 2, a), PAINT.trim);
        }
        if (axis === 'x') wall(s0, s1, at - TH / 2, at + TH / 2, habY, ceilY);
        else wall(at - TH / 2, at + TH / 2, s0, s1, habY, ceilY);
      };
      for (const g of gaps.slice().sort((p, q) => p.c - q.c)) {
        run(from, g.c - g.w / 2);
        // door frame
        for (const s of [-1, 1]) {
          const a = g.c + s * (g.w / 2 + 0.15);
          S(solid, axis === 'x' ? boxG(0.3, 3.2, TH + 0.3, a, habY + 1.6, at) : boxG(TH + 0.3, 3.2, 0.3, at, habY + 1.6, a), PAINT.crane);
        }
        S(solid, axis === 'x' ? boxG(g.w, TUBE.HAB_H - 3.2, TH, g.c, habY + 3.2 + (TUBE.HAB_H - 3.2) / 2, at) : boxG(TH, TUBE.HAB_H - 3.2, g.w, at, habY + 3.2 + (TUBE.HAB_H - 3.2) / 2, g.c), PAINT.houseDark);
        from = g.c + g.w / 2;
      }
      run(from, a1);
    };
    const door = { c: 0, w: 4 };
    glazed('x', HALL.z0, HALL.x0, HALL.x1);
    glazed('x', HALL.z1, HALL.x0, HALL.x1, [door]);
    glazed('z', HALL.x0, HALL.z0, HALL.z1);
    glazed('z', HALL.x1, HALL.z0, HALL.z1);
    glazed('z', COR.x0, COR.z0, COR.z1);
    glazed('z', COR.x1, COR.z0, COR.z1);
    glazed('x', CH.z0, CH.x0, CH.x1, [door]);
    glazed('x', CH.z1, CH.x0, CH.x1);
    glazed('z', CH.x0, CH.z0, CH.z1);
    glazed('z', CH.x1, CH.z0, CH.z1);
    // roofs: steel with glass lights; the hall roof is pierced by the riser
    const roof = (r, hole) => {
      const w = r.x1 - r.x0, d = r.z1 - r.z0, xc = (r.x0 + r.x1) / 2, zc = (r.z0 + r.z1) / 2;
      if (!hole) { S(solid, boxG(w + 1, 0.5, d + 1, xc, ceilY + 0.25, zc), PAINT.houseDark); return; }
      const e = TUBE.R + 0.6;
      S(solid, boxG(w + 1, 0.5, (d / 2 - e) + 0.5, xc, ceilY + 0.25, r.z0 + (d / 2 - e) / 2 - 0.25), PAINT.houseDark);
      S(solid, boxG(w + 1, 0.5, (d / 2 - e) + 0.5, xc, ceilY + 0.25, r.z1 - (d / 2 - e) / 2 + 0.25), PAINT.houseDark);
      S(solid, boxG(w / 2 - e + 0.5, 0.5, e * 2, r.x0 + (w / 2 - e) / 2 - 0.25, ceilY + 0.25, zc), PAINT.houseDark);
      S(solid, boxG(w / 2 - e + 0.5, 0.5, e * 2, r.x1 - (w / 2 - e) / 2 + 0.25, ceilY + 0.25, zc), PAINT.houseDark);
      const collar = new THREE.CylinderGeometry(TUBE.R + 0.7, TUBE.R + 0.7, 1.4, 36, 1, true); collar.translate(AX, ceilY + 0.6, AZ);
      S(solid, collar, PAINT.crane);
    };
    roof(HALL, true); roof(COR); roof(CH);
    // ceiling light strips
    for (const z of [HALL.z0 + 3, HALL.z1 - 3]) S(glow, boxG(16, 0.12, 0.5, 0, ceilY - 0.1, z), PAINT.flood);
    for (let z = COR.z0 + 2; z < COR.z1; z += 4) S(glow, boxG(0.5, 0.12, 2, 0, ceilY - 0.1, z), PAINT.amber);
    for (const x of [-8, 8]) S(glow, boxG(0.5, 0.12, 20, x, ceilY - 0.1, (CH.z0 + CH.z1) / 2), PAINT.red);
    // legs and ballast outside
    for (const r of [HALL, CH]) {
      for (const sx of [r.x0 - 0.6, r.x1 + 0.6]) for (const sz of [r.z0 - 0.6, r.z1 + 0.6]) {
        S(solid, beamG(sx, habY, sz, sx + Math.sign(sx) * 2.5, habY - 5, sz + Math.sign(sz - (r.z0 + r.z1) / 2) * 2.5, 0.7), PAINT.houseDark);
      }
      for (const sx of [r.x0 - 2.6, r.x1 + 2.6]) {
        const tk = new THREE.CapsuleGeometry(1.5, r.z1 - r.z0 - 8, 4, 10); tk.rotateX(Math.PI / 2); tk.translate(sx, habY + 1.2, (r.z0 + r.z1) / 2);
        S(solid, tk, PAINT.orange);
      }
    }
    // outside floods, pointed at the seabed
    for (const [fx, fz] of [[-13.5, AZ - 13], [13.5, AZ - 13], [-14.5, CH.z1 + 1], [14.5, CH.z1 + 1], [-13.5, AZ + 13], [13.5, AZ + 13]]) {
      S(glow, boxG(0.7, 0.7, 0.7, fx, ceilY + 0.9, fz), PAINT.flood);
    }
    // hall furniture: lockers, a bench, the lift call post
    S(solid, boxG(1.2, 2.4, 6, HALL.x0 + 1.4, habY + 1.2, AZ - 6), PAINT.pipe);
    wall(HALL.x0 + 0.6, HALL.x0 + 2.1, AZ - 9, AZ - 3, habY, habY + 2.4);
    S(solid, boxG(1.2, 0.6, 5, HALL.x1 - 1.4, habY + 0.3, AZ - 6), PAINT.houseDark);
    wall(HALL.x1 - 2.1, HALL.x1 - 0.6, AZ - 8.5, AZ - 3.5, habY, habY + 0.6);
    for (const sx of [-1, 1]) {
      const cyl = new THREE.CylinderGeometry(0.7, 0.7, 2.2, 10); cyl.translate(sx * 9, habY + 1.1, AZ + 9.5);
      S(solid, cyl, PAINT.crane); // air bottles
    }

    // ---- the charge: a bore through the floor, the device seated in it ----
    {
      const cx = CHARGE.x, cz = CHARGE.z;
      const collar = new THREE.CylinderGeometry(4.4, 4.8, 0.9, 28, 1, false); collar.translate(cx, habY + 0.45, cz);
      S(solid, collar, PAINT.crane);
      const body = new THREE.CylinderGeometry(2.4, 2.4, 9, 20); body.translate(cx, habY + 0.4, cz);
      S(solid, body, PAINT.trim);
      const cap = new THREE.SphereGeometry(2.4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); cap.translate(cx, habY + 4.9, cz);
      S(solid, cap, PAINT.hullRed);
      for (const by of [1.4, 2.6, 3.8]) {
        const band = new THREE.TorusGeometry(2.46, 0.12, 6, 28); band.rotateX(Math.PI / 2); band.translate(cx, habY + by, cz);
        S(glow, band, PAINT.red);
      }
      // clamps and umbilicals to the console
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        S(solid, beamG(cx + Math.cos(a) * 4.2, habY + 0.9, cz + Math.sin(a) * 4.2, cx + Math.cos(a) * 2.4, habY + 3.2, cz + Math.sin(a) * 2.4, 0.45), PAINT.crane);
      }
      for (const dx of [-0.5, 0, 0.5]) S(solid, beamG(CONSOLE.x + dx, habY + 0.15, CONSOLE.z + 0.6, cx + dx * 2, habY + 0.9, cz - 4.2, 0.14, true), PAINT.rope);
      wall(cx - 3.6, cx + 3.6, cz - 3.6, cz + 3.6, habY, habY + 6);
      // console: a lectern with a screen and one large button
      S(solid, boxG(3.4, 1.1, 1.3, CONSOLE.x, habY + 0.55, CONSOLE.z), PAINT.houseDark);
      S(solid, boxG(3.4, 0.9, 0.3, CONSOLE.x, habY + 1.5, CONSOLE.z + 0.45), PAINT.trim);
      S(glow, boxG(2.6, 0.6, 0.06, CONSOLE.x, habY + 1.55, CONSOLE.z + 0.28), PAINT.amber);
      wall(CONSOLE.x - 1.7, CONSOLE.x + 1.7, CONSOLE.z - 0.65, CONSOLE.z + 0.65, habY, habY + 1.6);
      // warning chevrons round the bore are laid as glow strips (the deck
      // shader's paint is keyed to the weather decks)
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        S(glow, boxG(0.9, 0.05, 0.3, cx + Math.cos(a) * 5.6, habY + 0.03, cz + Math.sin(a) * 5.6, -a), i % 2 ? PAINT.amber : PAINT.red);
      }
      // crates of spares along the wall
      for (const [bx, bz, s] of [[-10.5, CH.z1 - 2.5, 2.2], [-8, CH.z1 - 2.2, 1.6], [10.5, CH.z0 + 2.5, 2.2], [10.6, CH.z1 - 3, 1.8]]) {
        S(solid, boxG(s, s, s, bx, habY + s / 2, bz), PAINT.pot);
        wall(bx - s / 2, bx + s / 2, bz - s / 2, bz + s / 2, habY, habY + s);
      }
    }
  }

  // ======================= MERGE (static) ==================================
  const merged = (list, mat) => {
    const geos = list.map((g) => {
      const n = g.index ? g.toNonIndexed() : g;
      if (n.attributes.uv) n.deleteAttribute('uv');
      if (!n.attributes.normal) n.computeVertexNormals();
      return n;
    });
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    list.forEach((g) => g.dispose());
    return m;
  };
  const glassMat = new THREE.MeshStandardMaterial({
    vertexColors: true, transparent: true, opacity: 0.13, roughness: 0.04, metalness: 0.7, depthWrite: false, side: THREE.DoubleSide,
  });
  const glassMesh = merged(glass, glassMat);
  glassMesh.renderOrder = 3;
  group.add(merged(solid, bulkMat), merged(deck, deckMat), merged(glow, glowMat), glassMesh);

  // the arm button: its own mesh, so it can pulse
  const buttonMat = new THREE.MeshBasicMaterial({ color: 0xff2a18 });
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.22, 16), buttonMat);
  button.position.set(CONSOLE.x, habY + 1.2, CONSOLE.z - 0.15);
  group.add(button);

  // lights at the bottom (only lit when someone is down there to see them)
  const hallLight = new THREE.PointLight(0xfff0d8, 300, 90, 1.4);
  hallLight.position.set(AX, ceilY - 1, AZ - 5);
  const chargeLight = new THREE.PointLight(0xff7a5a, 170, 80, 1.5);
  chargeLight.position.set(CHARGE.x, ceilY - 1, CHARGE.z - 4);
  group.add(hallLight, chargeLight);

  // ======================= THE LIFT ========================================
  const cab = new THREE.Group();
  {
    const cg = [], cgl = [];
    const disc = new THREE.CylinderGeometry(TUBE.CAB_R, TUBE.CAB_R, 0.4, 36); disc.translate(0, -0.2, 0);
    cg.push(tint(disc, PAINT.deckDark));
    // rail round the rim, open toward -Z (aft: the deck gate) and +Z (the hall door)
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      if (Math.abs(Math.sin(a)) > 0.88) continue;
      cg.push(tint(boxG(0.12, 1.15, 0.12, Math.cos(a) * (TUBE.CAB_R - 0.35), 0.57, Math.sin(a) * (TUBE.CAB_R - 0.35)), PAINT.crane));
    }
    for (const sx of [1, -1]) {
      const arc = new THREE.TorusGeometry(TUBE.CAB_R - 0.35, 0.07, 5, 20, Math.PI * 0.68);
      arc.rotateX(Math.PI / 2); arc.rotateY(sx > 0 ? -Math.PI * 0.34 : Math.PI * 0.66); arc.translate(0, 1.15, 0);
      cg.push(tint(arc, PAINT.crane));
    }
    // control post
    cg.push(tint(boxG(0.5, 1.3, 0.5, 4.6, 0.65, 0), PAINT.houseDark));
    cgl.push(tint(boxG(0.36, 0.3, 0.06, 4.6, 1.15, -0.28), PAINT.amber));
    const ringL = new THREE.TorusGeometry(TUBE.CAB_R - 0.9, 0.07, 5, 40); ringL.rotateX(Math.PI / 2); ringL.translate(0, 0.03, 0);
    cgl.push(tint(ringL, PAINT.cyan));
    const strip = (list) => list.map((g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); return n; });
    cab.add(new THREE.Mesh(mergeGeometries(strip(cg), false), bulkMat));
    cab.add(new THREE.Mesh(mergeGeometries(strip(cgl), false), glowMat));
    const cabLight = new THREE.PointLight(0xbfe8ff, 160, 45, 1.6);
    cabLight.position.set(0, 3.5, 0);
    cab.add(cabLight);
    cab.userData.light = cabLight;
  }
  cab.position.set(AX, H.MAIN, AZ);
  group.add(cab);

  const half = TUBE.CAB_R * 0.72; // square inscribed in the platform
  const cabSlab = { x0: AX - half, x1: AX + half, z0: AZ - half, z1: AZ + half, y: H.MAIN };
  surfaces.push(cabSlab);
  // With the lift away the moon pool is an open shaft: a gate bars the gap.
  const gate = wall(AX - 2.6, AX + 2.6, AZ - TUBE.R - 1.6, AZ - TUBE.R - 0.4, 0, 0);

  const state = { mode: 'top', cabY: H.MAIN, topY: H.MAIN };
  const structure = makeStructure(surfaces, walls);

  function placeCab() {
    cabSlab.y = state.cabY;
    cab.position.y = state.cabY;
    const away = state.mode !== 'top';
    gate.y0 = away ? state.topY - 3 : 0;
    gate.y1 = away ? state.topY + 2.4 : 0;
  }

  // The deck heaves under the lift's top station; follow it while parked there
  // (and for the first of the travel), so the platform is flush with the plating.
  function setTopY(y) {
    state.topY = y;
    if (state.mode === 'top') { state.cabY = y; placeCab(); }
  }

  function step(dt) {
    if (state.mode === 'down' || state.mode === 'up') {
      const dir = state.mode === 'down' ? -1 : 1;
      const end = dir < 0 ? habY : state.topY;
      const start = dir < 0 ? state.topY : habY;
      // ease out of and into the stations
      const d0 = Math.abs(state.cabY - start), d1 = Math.abs(end - state.cabY);
      const v = Math.max(1.5, TUBE.SPEED * Math.min(1, (d0 + 0.6) / 6, (d1 + 0.4) / 8));
      state.cabY += dir * v * dt;
      if ((dir < 0 && state.cabY <= end) || (dir > 0 && state.cabY >= end)) {
        state.cabY = end;
        state.mode = dir < 0 ? 'bottom' : 'top';
      }
      placeCab();
    }
  }

  // ======================= INTERACTION =====================================
  const ents = {
    cab: { kind: 'cab', pos: new THREE.Vector2(AX, AZ), y: H.MAIN, reach: 5.2, prompt: '' },
    callTop: { kind: 'callTop', pos: new THREE.Vector2(AX, AZ - TUBE.R - 2.2), y: H.MAIN, reach: 3.2, prompt: '' },
    callBot: { kind: 'callBot', pos: new THREE.Vector2(AX + 4.5, AZ + 9), y: habY, reach: 3.4, prompt: '' },
    arm: { kind: 'arm', pos: new THREE.Vector2(CONSOLE.x, CONSOLE.z - 1.4), y: habY, reach: 3.0, prompt: '' },
  };
  const LOCKED = {
    speaker: { name: 'RISER CONTROL', species: 'Indigo Reach', cityId: 'Indigo Reach' },
    lines: ['LIFT SEALED — BY ORDER OF THE GOVERNOR.', 'Descent requires her authority. Ask on the bridge.'],
  };
  let detonated = false;
  const extras = [];
  const unlocked = () => questStage(CHARGE_QUEST) === 'go';

  const module = {
    state,
    get cabY() { return state.cabY; },
    cabSpot: { x: AX, z: AZ },
    nearestInteractable(p /* anchor-local */, _maxDist) {
      ents.cab.y = state.cabY;
      ents.callTop.y = state.topY;
      let best = null, bestD2 = Infinity;
      // other fixtures the ship hangs on this module (addEntity): hull-frame,
      // close enough to anchor-frame for a three-unit reach
      for (let i = 0; i < extras.length; i++) {
        const e = extras[i];
        if (Math.abs(e.y - p.y) > 2.5 || !e.prompt) continue;
        const dx = e.pos.x - p.x, dz = e.pos.y - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < e.reach * e.reach && d2 < bestD2) { best = e; bestD2 = d2; }
      }
      if (best) return best;
      for (const k in ents) {
        const e = ents[k];
        if (Math.abs(e.y - p.y) > 2.5) continue;
        const dx = e.pos.x - p.x, dz = e.pos.y - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > e.reach * e.reach || d2 >= bestD2) continue;
        if (e.kind === 'callTop' && state.mode === 'top') continue;
        if (e.kind === 'callBot' && state.mode === 'bottom') continue;
        best = e; bestD2 = d2;
      }
      if (!best) return null;
      if (best.kind === 'cab') {
        best.prompt = state.mode === 'top' ? (unlocked() ? 'E — DESCEND TO THE SEABED' : 'E — LIFT (SEALED)')
          : state.mode === 'bottom' ? 'E — RETURN TO THE SHIP' : 'LIFT MOVING';
      } else if (best.kind === 'arm') {
        best.prompt = detonated ? '' : 'E — ARM THE CHARGE';
      } else {
        best.prompt = state.mode === 'top' || state.mode === 'bottom' ? 'E — CALL THE LIFT' : 'LIFT MOVING';
      }
      return best;
    },
    interact(e) {
      if (e.use) return e.use();
      if (e.kind === 'cab') {
        if (state.mode === 'top') {
          if (!unlocked()) return LOCKED;
          state.mode = 'down';
        } else if (state.mode === 'bottom') state.mode = 'up';
        placeCab();
      } else if (e.kind === 'callTop') {
        if (state.mode === 'bottom') state.mode = 'up';
      } else if (e.kind === 'callBot') {
        if (state.mode === 'top') state.mode = 'down';
        placeCab();
      } else if (e.kind === 'arm' && !detonated) {
        detonated = true; // game.js takes it from here (consumeDetonation)
      }
      return null;
    },
    endInteract() {},
    step,
  };

  // In the riser or the habitat you are far below the sea but standing in air.
  function isDry(p) {
    if (p.y > 12 || p.y < habY - 1.5) return false;
    const dx = p.x - AX, dz = p.z - AZ;
    if (dx * dx + dz * dz < (TUBE.R + 0.5) * (TUBE.R + 0.5)) return true;
    if (p.y > ceilY + 0.5) return false;
    const inside = (r) => p.x > r.x0 - 0.4 && p.x < r.x1 + 0.4 && p.z > r.z0 - 0.4 && p.z < r.z1 + 0.4;
    return inside(HALL) || inside(COR) || inside(CH);
  }

  // ======================= SEA LIFE ========================================
  const life = new THREE.Group();
  life.name = 'reachLife';
  group.add(life);
  const uTime = { value: 0 };
  const depthSpan = -habY - 12; // creatures live between y = -8 and the habitat roof

  // --- schools: fish that ring the tube, each school its own depth and lane ---
  {
    const fish = new THREE.ConeGeometry(0.22, 1.1, 5);
    fish.rotateX(Math.PI / 2); // nose +Z
    const tail = new THREE.ConeGeometry(0.26, 0.42, 3); tail.rotateX(-Math.PI / 2); tail.translate(0, 0, -0.68); tail.scale(0.25, 1, 1);
    const geo = mergeGeometries([fish.toNonIndexed(), tail.toNonIndexed()], false);
    const SCHOOLS = 9, PER = 46, n = SCHOOLS * PER;
    const aA = new Float32Array(n * 4), aB = new Float32Array(n * 4), col = new Float32Array(n * 3);
    const hues = [0x6fe8ff, 0xff7ad8, 0xffc86a, 0x8cffb0, 0xb89cff, 0xff9a5a];
    const c = new THREE.Color();
    for (let s = 0; s < SCHOOLS; s++) {
      const r0 = 13 + rng() * 34, y0 = -10 - (s + rng() * 0.8) / SCHOOLS * depthSpan;
      const speed = (0.1 + rng() * 0.16) * (rng() < 0.5 ? 1 : -1), ph0 = rng() * 6.28;
      const hue = hues[s % hues.length];
      for (let i = 0; i < PER; i++) {
        const k = (s * PER + i);
        // orbit radius, height, phase, angular speed
        aA[k * 4] = r0 + (rng() - 0.5) * 7; aA[k * 4 + 1] = y0 + (rng() - 0.5) * 6;
        aA[k * 4 + 2] = ph0 + (rng() - 0.5) * 0.9; aA[k * 4 + 3] = speed * (0.92 + rng() * 0.16);
        // wobble phase, wobble amount, size, tail beat
        aB[k * 4] = rng() * 6.28; aB[k * 4 + 1] = 0.6 + rng() * 1.6; aB[k * 4 + 2] = 0.7 + rng() * 1.3; aB[k * 4 + 3] = 5 + rng() * 5;
        c.set(hue).multiplyScalar(0.7 + rng() * 0.6);
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      }
    }
    const g = new THREE.InstancedBufferGeometry().copy(geo);
    g.instanceCount = n;
    g.setAttribute('aOrbit', new THREE.InstancedBufferAttribute(aA, 4));
    g.setAttribute('aSwim', new THREE.InstancedBufferAttribute(aB, 4));
    g.setAttribute('aTint', new THREE.InstancedBufferAttribute(col, 3));
    const mat = new THREE.MeshBasicMaterial();
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.uniforms.uAxis = { value: new THREE.Vector2(AX, AZ) };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aOrbit;\nattribute vec4 aSwim;\nattribute vec3 aTint;\nuniform float uTime;\nuniform vec2 uAxis;\nvarying vec3 vTint;')
        .replace('#include <begin_vertex>', `
  float ang = aOrbit.z + uTime * aOrbit.w;
  float dirS = sign(aOrbit.w);
  vec3 lp = position * aSwim.z;
  lp.x += sin(uTime * aSwim.w + position.z * 3.0 + aSwim.x) * 0.12 * smoothstep(0.3, -0.7, position.z); // tail beat
  // heading: tangent to the ring
  float hx = -sin(ang) * dirS, hz = cos(ang) * dirS;
  vec3 transformed = vec3(lp.x * hz + lp.z * hx, lp.y, -lp.x * hx + lp.z * hz);
  float rr = aOrbit.x + sin(uTime * 0.31 + aSwim.x) * aSwim.y;
  transformed += vec3(uAxis.x + cos(ang) * rr, aOrbit.y + sin(uTime * 0.47 + aSwim.x * 1.7) * aSwim.y * 0.6, uAxis.y + sin(ang) * rr);
  vTint = aTint;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTint;')
        .replace('#include <color_fragment>', 'diffuseColor.rgb = vTint;');
    };
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    life.add(mesh);
  }

  // --- jellyfish: lit bells that pulse and drift up and down the water column ---
  {
    const bell = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const parts = [bell.toNonIndexed()];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const t = new THREE.CylinderGeometry(0.035, 0.012, 3.4, 4, 4);
      t.translate(Math.cos(a) * 0.6, -1.5, Math.sin(a) * 0.6);
      parts.push(t.toNonIndexed());
    }
    const geo = mergeGeometries(parts, false);
    const n = 70;
    const aA = new Float32Array(n * 4), aB = new Float32Array(n * 4), col = new Float32Array(n * 3);
    const hues = [0x9a7cff, 0xff6ad0, 0x5af0ff, 0xffb070, 0xb0ffe0];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.28, r = 10 + Math.pow(rng(), 0.7) * 55;
      aA[i * 4] = AX + Math.cos(a) * r; aA[i * 4 + 1] = -12 - rng() * depthSpan; aA[i * 4 + 2] = AZ + Math.sin(a) * r;
      aA[i * 4 + 3] = 0.8 + rng() * 2.4; // size
      aB[i * 4] = rng() * 6.28; aB[i * 4 + 1] = 0.5 + rng() * 0.7; aB[i * 4 + 2] = 2 + rng() * 5; aB[i * 4 + 3] = rng();
      c.set(hues[i % hues.length]).multiplyScalar(0.8 + rng() * 0.5);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const g = new THREE.InstancedBufferGeometry().copy(geo);
    g.instanceCount = n;
    g.setAttribute('aPos', new THREE.InstancedBufferAttribute(aA, 4));
    g.setAttribute('aPulse', new THREE.InstancedBufferAttribute(aB, 4));
    g.setAttribute('aTint', new THREE.InstancedBufferAttribute(col, 3));
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aPos;\nattribute vec4 aPulse;\nattribute vec3 aTint;\nuniform float uTime;\nvarying vec3 vTint;\nvarying float vBell;')
        .replace('#include <begin_vertex>', `
  float beat = sin(uTime * aPulse.y + aPulse.x);
  vec3 lp = position;
  float isBell = step(-0.2, position.y);
  // the bell squeezes; the tentacles trail and sway after it
  lp.xz *= mix(1.0, 1.0 - 0.22 * beat, isBell);
  lp.y *= mix(1.0, 1.0 + 0.16 * beat, isBell);
  float trail = (1.0 - isBell) * -position.y;
  lp.x += sin(uTime * 0.9 + aPulse.x + position.y * 1.3) * 0.16 * trail;
  lp.z += cos(uTime * 0.7 + aPulse.x * 1.3 + position.y * 1.1) * 0.16 * trail;
  vec3 transformed = lp * aPos.w + aPos.xyz;
  transformed.y += sin(uTime * 0.11 + aPulse.x) * aPulse.z + beat * 0.3;
  transformed.x += sin(uTime * 0.05 + aPulse.x * 2.0) * 3.0;
  vTint = aTint;
  vBell = isBell * (0.55 + 0.45 * beat) + (1.0 - isBell) * 0.5;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTint;\nvarying float vBell;')
        .replace('#include <color_fragment>', 'diffuseColor.rgb = vTint * (0.5 + vBell);');
    };
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    life.add(mesh);
  }

  // --- the big one: something whale-long that keeps a slow circle round the riser ---
  const whale = new THREE.Group();
  {
    const parts = [], lights = [];
    const body = new THREE.CapsuleGeometry(3.6, 26, 6, 14); body.rotateX(Math.PI / 2); body.scale(1, 0.8, 1);
    parts.push(tint(body, 0x1d2a4a));
    const head = new THREE.SphereGeometry(4.2, 14, 10); head.scale(1, 0.78, 1.25); head.translate(0, -0.2, 15);
    parts.push(tint(head, 0x22305a));
    const tailA = new THREE.ConeGeometry(2.6, 14, 8); tailA.rotateX(-Math.PI / 2); tailA.scale(1, 0.7, 1); tailA.translate(0, 0, -22);
    parts.push(tint(tailA, 0x1a2644));
    for (const s of [1, -1]) {
      const fluke = new THREE.ConeGeometry(2.4, 7, 4); fluke.rotateZ(s * Math.PI / 2); fluke.scale(1, 0.12, 1.3); fluke.translate(s * 3.6, 0, -29);
      parts.push(tint(fluke, 0x1a2644));
      const fin = new THREE.ConeGeometry(1.8, 9, 4); fin.rotateZ(s * (Math.PI / 2 + 0.5)); fin.scale(1, 0.14, 1.2); fin.translate(s * 6.2, -2.2, 8);
      parts.push(tint(fin, 0x1a2644));
      // a line of cold lights down each flank
      for (let i = 0; i < 11; i++) lights.push(tint(boxG(0.28, 0.28, 0.9, s * (3.5 - Math.abs(i - 5) * 0.12), 0.4, -14 + i * 2.8), i % 3 ? 0x6fe8ff : 0xff7ad8));
    }
    const strip = (list) => list.map((g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); return n; });
    whale.add(new THREE.Mesh(mergeGeometries(strip(parts), false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, emissive: 0x0a1630, emissiveIntensity: 0.9 })));
    whale.add(new THREE.Mesh(mergeGeometries(strip(lights), false), glowMat));
  }
  life.add(whale);

  // --- the seabed garden round the habitat: kelp, coral, anemone lamps ---
  {
    const blade = new THREE.PlaneGeometry(0.9, 1, 1, 6); blade.translate(0, 0.5, 0);
    const n = 320;
    const aA = new Float32Array(n * 4), aB = new Float32Array(n * 4);
    let k = 0;
    for (let i = 0; i < n * 3 && k < n; i++) {
      const a = rng() * 6.28, r = 16 + rng() * 70;
      const x = AX + Math.cos(a) * r, z = AZ + 20 + Math.sin(a) * r;
      if (x > -17 && x < 17 && z > AZ - 16 && z < AZ + 58) continue; // not through the habitat
      aA[k * 4] = x; aA[k * 4 + 1] = seabedYAt(x, z) - 0.3; aA[k * 4 + 2] = z; aA[k * 4 + 3] = 6 + rng() * 20; // height
      aB[k * 4] = rng() * 6.28; aB[k * 4 + 1] = rng() * 3.14; aB[k * 4 + 2] = 0.6 + rng() * 0.9; aB[k * 4 + 3] = rng();
      k++;
    }
    const g = new THREE.InstancedBufferGeometry().copy(blade);
    g.instanceCount = k;
    g.setAttribute('aRoot', new THREE.InstancedBufferAttribute(aA, 4));
    g.setAttribute('aSway', new THREE.InstancedBufferAttribute(aB, 4));
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aRoot;\nattribute vec4 aSway;\nuniform float uTime;\nvarying float vH;\nvarying float vK;')
        .replace('#include <begin_vertex>', `
  float hgt = position.y;
  float c = cos(aSway.y), s = sin(aSway.y);
  vec3 lp = vec3(position.x * aSway.z * (1.0 - 0.6 * hgt), hgt * aRoot.w, 0.0);
  float bend = hgt * hgt * aRoot.w * 0.18;
  lp.x += sin(uTime * 0.6 + aSway.x + hgt * 2.6) * bend;
  lp.z += cos(uTime * 0.45 + aSway.x * 1.4 + hgt * 2.1) * bend;
  vec3 transformed = vec3(lp.x * c + lp.z * s, lp.y, -lp.x * s + lp.z * c) + aRoot.xyz;
  vH = hgt; vK = aSway.w;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vH;\nvarying float vK;')
        .replace('#include <color_fragment>', 'diffuseColor.rgb = mix(vec3(0.02, 0.10, 0.09), mix(vec3(0.10, 0.55, 0.42), vec3(0.45, 0.25, 0.75), vK), vH * vH);');
    };
    const kelp = new THREE.Mesh(g, mat);
    kelp.frustumCulled = false;
    life.add(kelp);

    const blob = new THREE.IcosahedronGeometry(1, 1);
    const cn = 150;
    const coral = new THREE.InstancedMesh(blob, new THREE.MeshBasicMaterial(), cn);
    const o = new THREE.Object3D(), cc = new THREE.Color();
    const hues = [0xff5ab0, 0x5af0ff, 0xffb050, 0x9a6aff, 0x60ffa0];
    for (let i = 0; i < cn; i++) {
      let x, z;
      do {
        const a = rng() * 6.28, r = 15 + rng() * 60;
        x = AX + Math.cos(a) * r; z = AZ + 20 + Math.sin(a) * r;
      } while (x > -17 && x < 17 && z > AZ - 16 && z < AZ + 58);
      const s = 0.5 + rng() * 2.2;
      o.position.set(x, seabedYAt(x, z) + s * 0.35, z);
      o.scale.set(s, s * (0.5 + rng() * 0.9), s);
      o.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      o.updateMatrix();
      coral.setMatrixAt(i, o.matrix);
      coral.setColorAt(i, cc.set(hues[i % hues.length]).multiplyScalar(0.25 + rng() * 0.55));
    }
    coral.instanceMatrix.needsUpdate = true;
    coral.instanceColor.needsUpdate = true;
    coral.frustumCulled = false;
    life.add(coral);
  }

  placeCab();

  const _cam = new THREE.Vector3();
  function update(dt, t, camWorld) {
    uTime.value = t;
    _cam.copy(camWorld);
    anchor.worldToLocal(_cam);
    const near = _cam.lengthSq() < 520 * 520;
    life.visible = near && _cam.y < 40;
    const deep = _cam.y < habY + 60;
    hallLight.visible = deep;
    chargeLight.visible = deep;
    cab.userData.light.visible = near;
    if (life.visible) {
      const a = t * 0.07;
      const r = 62 + Math.sin(t * 0.021) * 14;
      whale.position.set(AX + Math.cos(a) * r, habY + 70 + Math.sin(t * 0.05) * 22, AZ + Math.sin(a) * r);
      whale.rotation.set(Math.sin(t * 0.3) * 0.04, -a, Math.sin(t * 0.17) * 0.05);
    }
    // the button breathes
    const p = 0.6 + 0.4 * Math.sin(t * 3.2);
    buttonMat.color.setRGB(1.7 * p, 0.14 * p, 0.08 * p);
  }

  return {
    group, structure, module, state, isDry, update, setTopY, habY, ceilY,
    axis: { x: AX, z: AZ },
    spots: { cab: { x: AX, z: AZ }, hall: { x: AX + 6, z: AZ + 6 }, console: { x: CONSOLE.x, z: CONSOLE.z - 1.6 }, charge: CHARGE },
    addEntity(e) { extras.push(e); },
    consumeDetonation() {
      if (!detonated) return false;
      detonated = false;
      return true;
    },
    reset() { state.mode = 'top'; state.cabY = state.topY; placeCab(); detonated = false; },
  };
}
