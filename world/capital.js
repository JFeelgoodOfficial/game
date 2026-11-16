// The capital of the worldship (src/tenretni.js): what stands on the spot
// where Tenretni's tunnel struck terra, once the planet has been rebuilt into
// a vessel.
//
// A deck on top of one great pylon, high over the towers the swarm raised
// (they reach ~250 units; the deck rides at 280), so nothing about the ruined
// terrain underneath matters. Platform-local frame: +Y is radially out of the
// planet, the deck top is y = 0.
//
//                 command spire
//                  [ COMMAND ]         z = -74, raised dais, y = 3
//                      ||  ramp
//        foundry  ( P L A Z A )==[ NAVIGATION DECK ]   x = +86
//                      ||  causeway
//                   ( PAD )            z = +100
//
// Like the Sky City (world/skycity.js) it is a child of the planet's GROUP,
// not of its turning surface — the worldship has stopped turning by the time
// this is built — and it returns the same shape of object, so game.js docks a
// ship on it with the code that docks at the Sky City and src/capitalWalk.js
// walks it. Geometry is vertex-coloured primitives merged into one lit mesh
// and one glowing mesh; the nine robots are a merged body each plus a head
// that turns on its own.
//
// The robots are the inhabitants: tall, thin, green, one lit bar for eyes.
// They do not walk. Every head follows the player. What they say is not kept
// here — `story` (src/tenretni.js) answers for them, because it depends on
// where the worldship is.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DECK_ALT = 280; // deck top above the planet's datum radius
const PAD_Z = 100;
const PAD_R = 24;
const NAV_X = 86;
const CMD_Z = -74;
const CMD_Y = 3;
const SNAP = 1.2;
const ROBOT_H = 3.3;

const COL = {
  deck: 0x161b19,
  deckLight: 0x232b27,
  trim: 0x2c3a33,
  hull: 0x0f1412,
  robot: 0x35a866,
  robotDark: 0x1b5a36,
};
const GLOW = { green: 0x35ff8a, cyan: 0x5fd8ff, white: 0xd8ffe8, amber: 0xffb347 };

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
const box = (w, h, d, x, y, z, rotY = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  return g.translate(x, y, z);
};
const cyl = (rt, rb, h, x, y, z, seg = 24) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);

function mergedMesh(list, material) {
  // every primitive here is indexed with position/normal/uv/color, so they merge
  const geo = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  return new THREE.Mesh(geo, material);
}

// One robot: a body mesh and a head that turns. Feet at the group's origin.
function buildRobot(litMat, glowMat) {
  const g = new THREE.Group();
  const b = [];
  // legs: long and thin, a knee block each
  for (const s of [-1, 1]) {
    b.push(tint(box(0.16, 1.45, 0.2, s * 0.24, 0.73, 0), COL.robotDark));
    b.push(tint(box(0.24, 0.2, 0.3, s * 0.24, 0.85, 0.02), COL.robot));
    b.push(tint(box(0.26, 0.1, 0.5, s * 0.24, 0.05, 0.08), COL.robotDark));
  }
  // hips, a narrow waist, a chest that widens to the shoulders
  b.push(tint(box(0.66, 0.24, 0.34, 0, 1.56, 0), COL.robot));
  b.push(tint(box(0.26, 0.42, 0.22, 0, 1.87, 0), COL.robotDark));
  b.push(tint(cyl(0.52, 0.3, 0.72, 0, 2.42, 0, 6), COL.robot));
  b.push(tint(box(1.3, 0.16, 0.36, 0, 2.78, 0), COL.robot));
  // arms that hang to the knee, ending in three blades
  for (const s of [-1, 1]) {
    b.push(tint(box(0.13, 0.95, 0.15, s * 0.66, 2.26, 0), COL.robotDark));
    b.push(tint(box(0.11, 0.95, 0.13, s * 0.66, 1.3, 0.05), COL.robot));
    for (let k = -1; k <= 1; k++) b.push(tint(box(0.035, 0.42, 0.05, s * 0.66 + k * 0.06, 0.63, 0.08), COL.robotDark));
  }
  // neck
  b.push(tint(cyl(0.07, 0.09, 0.26, 0, 2.97, 0, 8), COL.robotDark));
  g.add(mergedMesh(b, litMat));

  // chest light
  g.add(mergedMesh([tint(box(0.2, 0.06, 0.02, 0, 2.5, 0.27), GLOW.green, 1.4)], glowMat));

  const head = new THREE.Group();
  head.position.y = 3.1;
  head.add(mergedMesh([
    tint(box(0.44, 0.34, 0.4, 0, 0.06, 0), COL.robot),
    tint(box(0.5, 0.06, 0.46, 0, 0.25, 0), COL.robotDark),
    tint(box(0.03, 0.5, 0.03, 0.17, 0.5, -0.1), COL.robotDark), // aerial
  ], litMat));
  const eye = mergedMesh([tint(box(0.36, 0.055, 0.02, 0, 0.08, 0.21), GLOW.green, 1.8)], glowMat.clone());
  head.add(eye);
  g.add(head);
  return { group: g, head, eye };
}

// `cityDir`: the strike point in terra.surface's own frame. `rotY`: the angle
// the surface is latched at. `story`: { talk(role), useConsole(), choice(tag) }.
export function createCapital(planet, cityDir, rotY, story) {
  const group = new THREE.Group();
  const dir = cityDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).normalize();
  group.position.copy(dir).multiplyScalar(planet.radius + DECK_ALT);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

  const lit = [];
  const glow = [];
  const surfaces = [];
  const colliders = [];
  const disc = (cx, cz, r, y) => surfaces.push({ kind: 'disc', cx, cz, r, y });
  // a strip from A to B, half-width hw, height yA at A and yB at B
  const strip = (ax, az, bx, bz, hw, yA, yB) => {
    const hl = Math.hypot(bx - ax, bz - az) / 2;
    surfaces.push({
      kind: 'rect', cx: (ax + bx) / 2, cz: (az + bz) / 2,
      ux: (bx - ax) / (2 * hl), uz: (bz - az) / (2 * hl), hl, hw, yA, yB,
    });
  };

  // --- the pylon and the deck's underside (never walked, seen from space) ---
  lit.push(tint(cyl(34, 70, DECK_ALT + 40, 0, -(DECK_ALT + 40) / 2 - 3, 0, 10), COL.hull));
  lit.push(tint(cyl(58, 34, 26, 0, -16, 0, 10), COL.hull));
  for (let i = 0; i < 5; i++) {
    glow.push(tint(cyl(35 + i * 6.5, 35 + i * 6.5, 1.2, 0, -40 - i * 52, 0, 10), GLOW.green, 1.3));
  }

  // --- plaza ---
  lit.push(tint(cyl(46, 46, 3, 0, -1.5, 0, 48), COL.deck));
  lit.push(tint(cyl(30, 30, 0.12, 0, 0.06, 0, 48), COL.deckLight));
  glow.push(tint(new THREE.TorusGeometry(45.2, 0.12, 6, 96).rotateX(Math.PI / 2).translate(0, 0.12, 0), GLOW.green, 1.5));
  glow.push(tint(new THREE.TorusGeometry(30, 0.08, 6, 72).rotateX(Math.PI / 2).translate(0, 0.14, 0), GLOW.green, 1.2));
  disc(0, 0, 46, 0);
  // lamp spires round the plaza, between the four ways out
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.sin(a) * 40, z = Math.cos(a) * 40;
    lit.push(tint(cyl(0.35, 0.9, 13, x, 6.5, z, 6), COL.trim));
    glow.push(tint(cyl(0.6, 0.6, 1.6, x, 13.6, z, 6), GLOW.green, 1.6));
    colliders.push({ x, z, r: 1.1, top: Infinity });
  }
  // the count: a column at the centre with a slow band of light climbing it
  lit.push(tint(cyl(1.6, 2.4, 22, 0, 11, 0, 8), COL.trim));
  colliders.push({ x: 0, z: 0, r: 2.6, top: Infinity });

  // --- causeway and landing pad (+Z) ---
  lit.push(tint(box(14, 2, PAD_Z - PAD_R - 40, 0, -1, (46 + PAD_Z - PAD_R) / 2 - 3), COL.deck));
  strip(0, 40, 0, PAD_Z - PAD_R + 4, 7, 0, 0);
  for (const s of [-1, 1]) glow.push(tint(box(0.3, 0.12, PAD_Z - PAD_R - 44, s * 6.6, 0.1, (46 + PAD_Z - PAD_R) / 2), GLOW.green, 1.4));
  lit.push(tint(cyl(PAD_R, PAD_R - 3, 3, 0, -1.5, PAD_Z, 40), COL.deckLight));
  glow.push(tint(new THREE.TorusGeometry(PAD_R - 1.2, 0.14, 6, 72).rotateX(Math.PI / 2).translate(0, 0.12, PAD_Z), GLOW.amber, 1.5));
  glow.push(tint(new THREE.TorusGeometry(9, 0.1, 6, 48).rotateX(Math.PI / 2).translate(0, 0.12, PAD_Z), GLOW.amber, 1.3));
  disc(0, PAD_Z, PAD_R, 0);

  // --- command station (-Z): a raised dais under the spire ---
  lit.push(tint(box(12, 2.2, 16, 0, 0.1, -50, 0), COL.deck));
  strip(0, -43, 0, -57, 6, 0, CMD_Y);
  lit.push(tint(cyl(19, 21, CMD_Y + 3, 0, (CMD_Y - 3) / 2, CMD_Z, 40), COL.deck));
  glow.push(tint(new THREE.TorusGeometry(18.4, 0.1, 6, 72).rotateX(Math.PI / 2).translate(0, CMD_Y + 0.12, CMD_Z), GLOW.cyan, 1.4));
  disc(0, CMD_Z, 19, CMD_Y);
  // a horseshoe of consoles facing the middle of the dais
  const cmdConsoles = [];
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + (i - 3) * 0.36;
    const x = Math.sin(a) * 13.5, z = CMD_Z + Math.cos(a) * 13.5;
    lit.push(tint(box(3.2, 1.3, 1.1, x, CMD_Y + 0.65, z, a), COL.trim));
    glow.push(tint(box(2.8, 0.08, 0.8, x, CMD_Y + 1.34, z, a), i % 2 ? GLOW.cyan : GLOW.green, 1.3));
    colliders.push({ x, z, r: 1.5, top: CMD_Y + 1.3 + SNAP + 0.2 });
    cmdConsoles.push({ x, z, a });
  }
  // the spire behind it
  lit.push(tint(cyl(3, 9, 70, 0, 32, CMD_Z - 26, 6), COL.hull));
  for (let i = 0; i < 6; i++) glow.push(tint(cyl(3.4 + (5 - i), 3.4 + (5 - i), 0.5, 0, 8 + i * 11, CMD_Z - 26, 6), GLOW.green, 1.3));
  glow.push(tint(cyl(0.5, 0.5, 26, 0, 80, CMD_Z - 26, 6), GLOW.white, 1.6));

  // --- navigation deck (+X): a balcony over open space, a chart of the system ---
  lit.push(tint(box(NAV_X - 16 - 40, 2, 12, (46 + NAV_X - 16) / 2 - 3, -1, 0), COL.deck));
  strip(40, 0, NAV_X - 12, 0, 6, 0, 0);
  lit.push(tint(cyl(17, 13, 3, NAV_X, -1.5, 0, 40), COL.deck));
  glow.push(tint(new THREE.TorusGeometry(16.4, 0.1, 6, 72).rotateX(Math.PI / 2).translate(NAV_X, 0.12, 0), GLOW.cyan, 1.5));
  disc(NAV_X, 0, 17, 0);
  // chart plinth and the console that drives it
  lit.push(tint(cyl(3.2, 3.8, 0.9, NAV_X + 3, 0.45, 0, 24), COL.trim));
  glow.push(tint(new THREE.TorusGeometry(3.3, 0.1, 6, 48).rotateX(Math.PI / 2).translate(NAV_X + 3, 0.95, 0), GLOW.cyan, 1.5));
  colliders.push({ x: NAV_X + 3, z: 0, r: 3.9, top: Infinity });
  const navConsole = { x: NAV_X - 3.6, y: 0, z: 0 };
  lit.push(tint(box(1.2, 1.25, 3.4, navConsole.x, 0.62, 0), COL.trim));
  glow.push(tint(box(0.9, 0.08, 3.0, navConsole.x, 1.3, 0), GLOW.cyan, 1.5));
  colliders.push({ x: navConsole.x, z: 0, r: 1.3, top: 1.25 + SNAP + 0.2 });

  // --- foundry (-X): skyline only, on its own arm ---
  lit.push(tint(box(40, 2.4, 10, -64, -1.2, 0), COL.hull));
  for (let i = 0; i < 5; i++) {
    const x = -72 - i * 9, z = (i % 2 ? 1 : -1) * (6 + i * 3), h = 30 + ((i * 37) % 28);
    lit.push(tint(box(7, h, 7, x, h / 2 - 2, z), COL.hull));
    glow.push(tint(box(7.2, 0.5, 7.2, x, h - 2.5, z), GLOW.green, 1.2));
    glow.push(tint(box(0.5, h * 0.7, 7.3, x - 3.4, h * 0.4, z), GLOW.green, 0.9));
  }
  colliders.push({ x: -46, z: 0, r: 4, top: Infinity }); // the arm is not a way out

  const litMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x151d19 });
  // the robots carry a little light of their own, so they read on the night side
  const robotMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0c3a1e });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  // Only just over the bloom threshold: these are long unbroken lines at the
  // walker's feet, and at the Sky City's 1.6 they flood the frame.
  glowMat.color.setScalar(0.72);
  group.add(mergedMesh(lit, litMat));
  group.add(mergedMesh(glow, glowMat));

  // --- things that move: the count band, the chart, the beacon, the robots ---
  const detail = new THREE.Group();
  group.add(detail);

  const band = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.7, 8), new THREE.MeshBasicMaterial({ color: 0x35ff8a }));
  band.material.color.multiplyScalar(1.1);
  detail.add(band);

  // the chart: a sun, and the worlds as beads on rings — the two that have water lit blue
  const chart = new THREE.Group();
  chart.position.set(NAV_X + 3, 4.4, 0);
  const bead = (r, color, size) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), new THREE.MeshBasicMaterial({ color }));
    m.material.color.multiplyScalar(1.5);
    m.position.x = r;
    const pivot = new THREE.Group();
    pivot.add(m);
    if (r > 0) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.015, 4, 64).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x1c6a55 })
      );
      chart.add(ring);
    }
    chart.add(pivot);
    return pivot;
  };
  bead(0, 0xffd27a, 0.34);
  const orbits = [
    bead(0.8, 0x35ff8a, 0.16), // this world
    bead(1.25, 0x9a7a5a, 0.1),
    bead(1.7, 0xdfe9f2, 0.13), // wyattmattoe
    bead(2.2, 0xc9a04a, 0.2),
    bead(2.75, 0x3a66ff, 0.16), // neptunia
    bead(3.2, 0xa0563a, 0.1),
  ];
  detail.add(chart);

  // pad beacon: a thin shaft of light a pilot can find from orbit
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 700, 8, 1, true).translate(0, 400, 0),
    new THREE.MeshBasicMaterial({
      color: 0xffb347, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    })
  );
  beacon.position.set(0, 0, PAD_Z);
  group.add(beacon);

  // robots: role, where, which way they face at rest
  const ROBOTS = [
    { role: 'warden', x: 0, y: CMD_Y, z: CMD_Z + 4, face: 0 },
    { role: 'navigator', x: NAV_X - 5, y: 0, z: -5.5, face: -2.2 },
    { role: 'sentry', x: -8.6, y: 0, z: 52, face: 0 },
    { role: 'sentry', x: 8.6, y: 0, z: 52, face: 0 },
    { role: 'operator', x: cmdConsoles[1].x * 0.82, y: CMD_Y, z: CMD_Z + (cmdConsoles[1].z - CMD_Z) * 0.82, face: cmdConsoles[1].a },
    { role: 'operator', x: cmdConsoles[5].x * 0.82, y: CMD_Y, z: CMD_Z + (cmdConsoles[5].z - CMD_Z) * 0.82, face: cmdConsoles[5].a },
    { role: 'counter', x: -5, y: 0, z: 4, face: 2.2 },
    { role: 'counter', x: 20, y: 0, z: -18, face: -0.8 },
    { role: 'counter', x: -22, y: 0, z: -14, face: 0.9 },
  ];
  const robots = [];
  const npcs = [];
  ROBOTS.forEach((r, i) => {
    const rig = buildRobot(robotMat, glowMat);
    rig.group.position.set(r.x, r.y, r.z);
    rig.group.rotation.y = r.face;
    if (r.role === 'warden') rig.group.scale.setScalar(1.25); // the tall one
    detail.add(rig.group);
    robots.push({ ...rig, ...r, seed: i * 1.7, look: 0 });
    colliders.push({ x: r.x, z: r.z, r: 0.75, top: Infinity });
    npcs.push({ x: r.x, y: r.y, z: r.z, role: r.role, talk: () => story.talk(r.role, i) });
  });

  const consoles = [{
    x: navConsole.x, y: 0, z: 0, r: 3.4,
    prompt: 'E — USE THE NAVIGATION CONSOLE',
    use: () => story.useConsole(),
  }];

  planet.group.add(group);

  // Highest walkable surface within reach of the feet, or -Infinity for none.
  function floorYAt(x, z, feetY) {
    let best = -Infinity;
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      let y;
      if (s.kind === 'disc') {
        const dx = x - s.cx, dz = z - s.cz;
        if (dx * dx + dz * dz > s.r * s.r) continue;
        y = s.y;
      } else {
        const dx = x - s.cx, dz = z - s.cz;
        const u = dx * s.ux + dz * s.uz;
        const v = -dx * s.uz + dz * s.ux;
        if (Math.abs(u) > s.hl || Math.abs(v) > s.hw) continue;
        y = s.yA + (s.yB - s.yA) * ((u + s.hl) / (2 * s.hl));
      }
      if (y <= feetY + SNAP && y > best) best = y;
    }
    return best;
  }

  let walker = null; // platform-local position of the player, or null
  const _w = new THREE.Vector3();

  // `sail` 0..1: how hard the world is under way (the lights run faster).
  function update(dt, t, camWorld, sail = 0) {
    const far = camWorld.distanceToSquared(_w.copy(group.position).add(planet.group.position)) > 3000 * 3000;
    detail.visible = !far;
    // the beacon is for finding the pad from orbit; up close it is only glare
    beacon.visible = camWorld.distanceToSquared(_w) > 500 * 500;
    beacon.material.opacity = 0.22 + 0.16 * Math.sin(t * 2.4);
    if (far) return;
    band.position.y = 1 + ((t * (0.35 + sail * 1.5)) % 1) * 20;
    chart.rotation.y = t * 0.15;
    for (let i = 0; i < orbits.length; i++) orbits[i].rotation.y = t * (0.5 / (i + 1)) + i * 1.3;
    for (const r of robots) {
      // rest pose: a slow lean, never quite still
      r.group.rotation.z = Math.sin(t * 0.45 + r.seed) * 0.012;
      let want = Math.sin(t * 0.21 + r.seed * 3) * 0.3;
      let lit = 1;
      if (walker) {
        // the head comes round to the player, as far as a neck goes and a bit
        const dx = walker.x - r.x, dz = walker.z - r.z;
        const d = Math.hypot(dx, dz);
        if (d < 60) {
          let a = Math.atan2(dx, dz) - r.face;
          while (a > Math.PI) a -= Math.PI * 2;
          while (a < -Math.PI) a += Math.PI * 2;
          want = Math.max(-2.4, Math.min(2.4, a));
          lit = d < 8 ? 2.4 : 1.4;
        }
      }
      r.look += (want - r.look) * Math.min(1, dt * 2.2);
      r.head.rotation.y = r.look;
      r.eye.material.color.setScalar(0.9 * lit * (0.85 + 0.15 * Math.sin(t * 7 + r.seed)));
    }
  }

  return {
    group,
    planet,
    surfaces,
    colliders,
    floorYAt,
    update,
    snap: SNAP,
    pad: new THREE.Vector3(0, 0, PAD_Z),
    padR: PAD_R,
    spawn: new THREE.Vector3(10, 0, PAD_Z - 9),
    npcs,
    consoles,
    onChoice: (tag) => story.choice(tag),
    setWalker(p) { walker = p; },
    places: {
      plaza: [0, 0, 12], command: [0, CMD_Y, CMD_Z + 8], nav: [NAV_X - 7, 0, 0], pad: [10, 0, PAD_Z - 9],
    },
    robots,
  };
}
