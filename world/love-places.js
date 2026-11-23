// The Forecast of Love: its two places of its own (GDD 5.7.9; Season 1,
// chapter 9).
//
//   the hill    A holodeck program: the ski hill on Wyattmattoe, as the archive
//               kept it, at dusk. A hut and a rail at the top, one long run
//               down between flagged gates, a flat at the bottom. It is a small
//               site of its own and not the whole Wyattmattoe program (the
//               planet, its town and its lifts): the chapter wants one slope
//               and one other person on it, and nothing that can go wrong.
//               The run is steered (A / D), with her beside; gates are counted
//               and nothing depends on them. E skips it.
//   the patio   The freighter's aft patio, in the light ship's bay, at night:
//               a small deck, a rail, a table, the port's lights a long way
//               off. Where she is asked for nothing, or for what she knows.
//
// Both are sites for the platform walker (src/capitalWalk.js), walked under
// the pause (look `dive`), reached by the doors `love:hill` and `love:patio`.
// `L` is the chapter (world/love.js): its stages, and what is decided.
//
// She is the same figure who sits in the port's bar (world/concourse-hub.js:
// the same seed). The pilot is the walker's own, as everywhere.

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { sun } from '../src/sun.js';
import { moveAxes } from '../src/input.js';
import { cWalk } from '../src/capitalWalk.js';
import { chapterHud } from '../src/chapterHud.js';
import { isDialogueOpen } from '../src/dialogue.js';
import { mulberry32 } from '../src/noise2.js';
import { chime } from '../src/sfx.js';
import { tint, box, cyl, mergedMesh } from './capital.js';
import { buildRig, poseRig } from './aliens.js';
import { measureRig, standRig } from './rigGround.js';
import { createSceneClock, crewSay } from './sceneClock.js';
import { setWeather, hush } from './entryzero-audio.js';
import { LOVE } from './love-dialogue.js';

const ZERO = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
export const ENVOY_SEED = 0x10e7e; // (world/concourse-hub.js: the figure in the bar)
export const envoyRig = () => measureRig(buildRig(ENVOY_SEED, 'concourse'));

function skyDome(top, low, r) {
  const g = new THREE.SphereGeometry(r, 24, 14);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const a = new THREE.Color(top), b = new THREE.Color(low), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const k = Math.pow(Math.min(1, Math.max(0, p.getY(i) / r)), 0.55);
    c.copy(b).lerp(a, k);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
}
function glowTexture() {
  const n = 64, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2);
    const a = Math.max(0, 1 - r);
    const i = (y * n + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = Math.round(255 * a * a);
  }
  const tex = new THREE.DataTexture(data, n, n);
  tex.needsUpdate = true;
  return tex;
}
const captureLight = (scene) => ({
  fog: scene.fog, lightPos: sun.light.position.clone(), lightColor: sun.light.color.clone(), lightI: sun.light.intensity,
  ambColor: sun.ambient.color.clone(), ambI: sun.ambient.intensity,
});
function restoreLight(scene, prev) {
  scene.fog = prev.fog;
  sun.light.position.copy(prev.lightPos);
  sun.light.color.copy(prev.lightColor);
  sun.light.intensity = prev.lightI;
  sun.ambient.color.copy(prev.ambColor);
  sun.ambient.intensity = prev.ambI;
}

// --- the hill ---------------------------------------------------------------
export function createLoveHill(ctx, L) {
  const { chapter } = ctx;
  const group = new THREE.Group();
  group.visible = false;
  ctx.scene.add(group);
  const LEN = C.LOVE_RUN_LEN, SLOPE = 0.27, HW = 30;
  const yB = -LEN * SLOPE;
  const hillY = (z) => (z > 0 ? 0 : z > -LEN ? z * SLOPE : yB);
  const GATES = [0.14, 0.28, 0.42, 0.56, 0.7, 0.86].map((s, i) => ({ s, x: (i % 2 ? -1 : 1) * (8 + (i * 5) % 9), done: false }));
  const EDGE = [3.5, 3], BOTTOM = [5, -LEN - 24], HUT = [-14, 26];
  {
    const lit = [], glow = [];
    const rng = mulberry32(0x5c1);
    // the snow: one long sheet, a flat at each end
    const g = new THREE.PlaneGeometry(150, LEN + 150, 14, 60).rotateX(-Math.PI / 2).translate(0, 0, -LEN / 2 - 15);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, hillY(p.getZ(i)) + (Math.abs(p.getX(i)) > HW ? (Math.abs(p.getX(i)) - HW) * 0.22 : 0));
    g.computeVertexNormals();
    lit.push(tint(g, 0xe6eefa));
    // the hut at the top, the rail, the lift's last pylon
    lit.push(tint(box(9, 5, 7, HUT[0], 2.5, HUT[1]), 0x6a4a3a), tint(box(10.4, 0.5, 8.4, HUT[0], 5.2, HUT[1]).rotateZ(0), 0xf2f6fc));
    glow.push(tint(box(1.6, 1.4, 0.12, HUT[0] + 1, 2.4, HUT[1] - 3.56), 0xffd08a, 1.4));
    for (const s of [-1, 1]) lit.push(tint(box(0.2, 1.1, 30, s * 22, 0.55, 18), 0x6a4a3a));
    for (let i = 0; i < 9; i++) {
      const z = 30 - i * (LEN + 40) / 8;
      lit.push(tint(cyl(0.35, 0.5, 11, -40, hillY(z) + 5.5 + 2.2, z, 8), 0x4a525e), tint(box(5, 0.3, 0.5, -40, hillY(z) + 12.8, z), 0x4a525e));
    }
    // pines either side, thicker as it goes down
    for (let i = 0; i < 150; i++) {
      const z = 30 - rng() * (LEN + 90), side = rng() < 0.5 ? -1 : 1, x = side * (HW + 3 + rng() * rng() * 46);
      if (side < 0 && Math.abs(x + 40) < 4) continue;
      const h = 7 + rng() * 9, y = hillY(z) + (Math.abs(x) - HW) * 0.22;
      lit.push(tint(new THREE.ConeGeometry(h * 0.28, h, 7).translate(x, y + h / 2 + 1, z), 0x2f5a48));
      lit.push(tint(new THREE.ConeGeometry(h * 0.2, h * 0.5, 7).translate(x, y + h + 0.6, z), 0xdfeaf4));
    }
    // the gates: two poles and a flag each, one colour then the other
    for (const [i, gt] of GATES.entries()) {
      const z = -gt.s * LEN;
      for (const s of [-1, 1]) {
        lit.push(tint(cyl(0.09, 0.09, 3, gt.x + s * 5, hillY(z) + 1.5, z, 6), 0x3a4048));
        glow.push(tint(box(1.3, 0.8, 0.06, gt.x + s * 5 - s * 0.7, hillY(z) + 2.5, z), i % 2 ? 0x4aa8ff : 0xff5a4a, 1.2));
      }
    }
    // mountains, a long way off
    for (let i = 0; i < 9; i++) {
      const a = -2.6 + i * 0.26 + rng() * 0.1, r = 900 + rng() * 300, h = 260 + rng() * 260;
      lit.push(tint(new THREE.ConeGeometry(h * 0.9, h, 6).rotateY(rng() * 3).translate(Math.sin(a) * r, yB + h / 2 - 60, Math.cos(a) * r - LEN / 2), 0x8a9ab8));
    }
    group.add(mergedMesh(lit.map((x) => (x.index ? x.toNonIndexed() : x)), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1a2030 })));
    group.add(mergedMesh(glow, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  }
  const sky = skyDome(0x1c2a5a, 0xf2a888, 2400);
  sky.frustumCulled = false;
  group.add(sky);
  const dusk = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffc090, map: glowTexture(), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  dusk.position.set(260, yB + 30, -LEN - 1500);
  dusk.scale.setScalar(900);
  group.add(dusk);
  const her = envoyRig();
  group.add(her.group);

  let inside = false, prev = null, walker = null;
  let talked = false, run = null, saidRun = -1, gates = 0, panelText = null, herAt = [EDGE[0], EDGE[1]], herMoving = false;
  const later = [];
  const say = (line, sec) => crewSay(chapter, line, sec);
  const atBottom = () => L.reached('hill');
  const lines = (l, offer) => ({ speaker: LOVE.aboard, lines: l, cine: true, ...(offer ? { offer } : {}) });

  function endRun() {
    run = null;
    cWalk.pos.set(0, yB, -LEN - 14);
    cWalk.yaw = cWalk.facingYaw = Math.atan2(BOTTOM[0], BOTTOM[1] + LEN + 14);
    herAt = [BOTTOM[0], BOTTOM[1]];
    her.group.rotation.x = 0;
    L.advance('hill');
  }
  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: UP },
    noShip: true,
    exit: { x: HUT[0] + 1, z: HUT[1] - 5 },
    leaveHint: LOVE.hud.end,
    surfaces: [],
    colliders: [{ x: HUT[0], z: HUT[1], r: 6, top: Infinity }],
    floorYAt(x, z) {
      if (Math.abs(x) > HW) return -Infinity;
      if (run) return hillY(z);
      if (z > 0 && z < 33) return 0; // the top
      if (z < -LEN && z > -LEN - 60 && atBottom()) return yB; // the flat at the bottom
      return -Infinity;
    },
    snap: 1.6,
    pad: new THREE.Vector3(),
    spawn: new THREE.Vector3(0, 0, 20),
    spawnYaw: Math.PI,
    npcs: [{
      get x() { return herAt[0]; }, get y() { return hillY(herAt[1]); }, get z() { return herAt[1]; }, h: 2.6,
      talk() {
        if (atBottom()) {
          if (L.reached('told')) return lines(LOVE.toldAgain);
          L.advance('told');
          later.push(LOVE.toldCrew);
          return lines(LOVE.told);
        }
        if (talked) return lines(LOVE.topAgain);
        talked = true;
        return lines(LOVE.top);
      },
    }],
    consoles: [
      { x: EDGE[0] - 3.5, y: 0, z: 1.6, r: 3.4, prompt: LOVE.prompts.ski, off: () => !talked || atBottom() || !!run, use: () => ((run = { s: 0, x: 0 }), (saidRun = -1), (gates = 0), GATES.forEach((g) => (g.done = false)), null) },
      { x: HUT[0] + 1, y: 0, z: HUT[1] - 5, r: 2.6, prompt: LOVE.prompts.end, off: () => !!run || atBottom(), use: () => ((site.portal = 'base:holo'), null) },
      { x: -8, y: yB, z: -LEN - 30, r: 3.2, prompt: LOVE.prompts.end, off: () => !L.reached('told'), use: () => ((site.portal = 'base:holo'), null) },
    ],
    onChoice: () => null,
    portal: null,
    mark() {
      if (run) return null;
      if (!atBottom()) return talked ? { x: EDGE[0] - 3.5, z: 1.6, label: LOVE.marks.edge } : { x: herAt[0], z: herAt[1], label: LOVE.marks.her };
      return L.reached('told') ? { x: -8, z: -LEN - 30, label: 'OUT' } : { x: herAt[0], z: herAt[1], label: LOVE.marks.her };
    },
    held: () => !!run,
    act() {
      if (run) run.s = 1; // E: to the bottom (nothing is missed that she will not say again)
    },
    heldPrompt: () => (run ? LOVE.skip : ''),
    camera(pos, target) {
      if (!run) return false;
      const z = -run.s * LEN;
      pos.set(run.x * 0.75, hillY(z + 13) + 6.5, z + 13);
      target.set(run.x, hillY(z - 14) + 1.2, z - 14);
      return true;
    },
    setWalker(p) {
      walker = p || null;
    },
    onEnter() {
      if (inside) return;
      inside = true;
      site.portal = null;
      group.visible = true;
      prev = captureLight(ctx.scene);
      ctx.scene.fog = new THREE.FogExp2(0xb8c4e0, 0.0011);
      sun.light.position.set(0.5, 0.45, -0.75).normalize(); // a low sun, down the hill
      sun.light.color.setRGB(1.0, 0.82, 0.68);
      sun.light.intensity = 1.5;
      sun.ambient.color.setRGB(0.62, 0.7, 0.95);
      sun.ambient.intensity = 0.95;
      run = null;
      later.length = 0;
      panelText = null;
      talked = L.reached('hill');
      her.group.rotation.x = 0;
      if (atBottom()) {
        // come back to it after the run: at the bottom, where she is
        herAt = [BOTTOM[0], BOTTOM[1]];
        cWalk.pos.set(0, yB, -LEN - 14);
        cWalk.yaw = cWalk.facingYaw = Math.atan2(BOTTOM[0], BOTTOM[1] + LEN + 14);
      } else herAt = [EDGE[0], EDGE[1]];
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      group.visible = false;
      run = null;
      hush();
      chapterHud.clear();
      chapterHud.panel(null);
      panelText = null;
      restoreLight(ctx.scene, prev);
      prev = null;
    },
    inside: () => inside,
    tick(dt, t) {
      chapterHud.tick(dt);
      const d = Math.min(dt, 0.1);
      sky.position.set(cWalk.pos.x, cWalk.pos.y, cWalk.pos.z);
      setWeather(0, run ? 0.75 : 0.25);
      if (run) {
        // --- the run: down the fall line, steered, with her beside ---
        const axes = moveAxes();
        run.x = Math.max(-HW + 4, Math.min(HW - 4, run.x - axes.strafe * C.LOVE_STEER * d)); // (facing down the hill, right is -x)
        const before = run.s;
        run.s = Math.min(1, run.s + (C.LOVE_RUN_SPEED * d) / LEN);
        const z = -run.s * LEN;
        cWalk.pos.set(run.x, hillY(z), z);
        cWalk.yaw = cWalk.facingYaw = Math.PI - axes.strafe * 0.35;
        cWalk.vel.set(0, 0, 0);
        for (const g of GATES) {
          if (g.done || before >= g.s || run.s < g.s) continue;
          g.done = true;
          if (Math.abs(run.x - g.x) < 5) {
            gates++;
            chime(330 + gates * 40);
            chapterHud.say(LOVE.gate, 1.6);
          }
        }
        while (saidRun + 1 < LOVE.run.length && run.s >= LOVE.run[saidRun + 1][0]) chapterHud.say(`${LOVE.short} — ${LOVE.run[++saidRun][1]}`, 4.5);
        // she takes her own line: wide of the pilot's, and a little ahead
        const hz = z - 7, hx = Math.max(-HW + 3, Math.min(HW - 3, run.x + 7 * Math.sin(run.s * 23) + (run.x > 0 ? -6 : 6)));
        herAt = [hx, hz];
        her.group.rotation.set(0.22, Math.PI + 0.5 * Math.cos(run.s * 23), 0);
        herMoving = true;
        if (run.s >= 1) endRun();
      } else if (walker) {
        herMoving = false;
        const dx = walker.x - herAt[0], dz = walker.z - herAt[1];
        her.group.rotation.set(0, Math.hypot(dx, dz) < 14 ? Math.atan2(dx, dz) : Math.PI, 0);
        if (later.length && !isDialogueOpen() && chapterHud.state().line == null) say(later.shift(), 7);
      }
      her.group.position.set(herAt[0], hillY(herAt[1]), herAt[1]);
      poseRig(her, d, t, 'idle', 0);
      standRig(her, hillY(herAt[1]));
      const text = run ? `${LOVE.hud.gates}${gates} / ${GATES.length}\n${LOVE.hud.run}` : !atBottom() ? (talked ? LOVE.hud.edge : null) : L.reached('told') ? LOVE.hud.end : LOVE.hud.bottom;
      if (text !== panelText) chapterHud.panel((panelText = text));
    },
    places: { top: [0, 20], her: EDGE, ski: [EDGE[0] - 3.5, 1.6], bottom: [BOTTOM[0], BOTTOM[1]], out: [-8, -LEN - 30], yB },
    info: () => ({ inside, talked, run: run ? { s: +run.s.toFixed(3), x: +run.x.toFixed(1) } : null, gates, her: herAt.map((v) => +v.toFixed(1)), herMoving, panel: panelText }),
  };
  return site;
}

// --- the patio --------------------------------------------------------------
export function createLovePatio(ctx, L) {
  const { chapter } = ctx;
  const group = new THREE.Group();
  group.visible = false;
  ctx.scene.add(group);
  const HW = 6.5, HL = 4.6;
  const RAIL = [0.8, -3.5], DOOR = [0, 3.6];
  {
    const lit = [], glow = [];
    lit.push(tint(box(HW * 2, 0.3, HL * 2, 0, -0.15, 0), 0x5a4638));
    for (let x = -HW + 0.5; x < HW; x += 1.0) lit.push(tint(box(0.06, 0.02, HL * 2, x, 0.01, 0), 0x3a2c24)); // planking
    // the rail, on three sides; the freighter's stern wall, with its door, behind
    lit.push(tint(box(HW * 2, 0.12, 0.12, 0, 1.1, -HL), 0x3a3f4a));
    for (const s of [-1, 1]) lit.push(tint(box(0.12, 0.12, HL * 2, s * HW, 1.1, 0), 0x3a3f4a));
    for (let x = -HW; x <= HW; x += 1.3) lit.push(tint(box(0.07, 1.1, 0.07, x, 0.55, -HL), 0x3a3f4a));
    for (const s of [-1, 1]) for (let z = -HL; z <= HL; z += 1.3) lit.push(tint(box(0.07, 1.1, 0.07, s * HW, 0.55, z), 0x3a3f4a));
    lit.push(tint(box(HW * 2 + 2, 6, 0.5, 0, 3, HL + 0.25), 0x8a2a4a), tint(box(1.9, 2.5, 0.12, DOOR[0], 1.25, HL - 0.06), 0x2a1c26));
    glow.push(tint(box(1.5, 0.12, 0.1, DOOR[0], 2.65, HL - 0.1), 0xffd8a0, 1.3));
    // a table, two chairs, a lantern, two glasses
    lit.push(tint(cyl(0.9, 0.9, 0.08, -3, 0.92, 0.6, 16), 0x6a5038), tint(cyl(0.08, 0.3, 0.9, -3, 0.45, 0.6, 8), 0x3a2c24));
    for (const s of [-1, 1]) lit.push(tint(box(0.7, 0.08, 0.7, -3 + s * 1.5, 0.55, 0.6), 0x6a5038), tint(box(0.08, 0.9, 0.7, -3 + s * 1.82, 0.95, 0.6), 0x6a5038));
    glow.push(tint(cyl(0.14, 0.14, 0.3, -3, 1.12, 0.6, 8), 0xffc070, 1.6), tint(cyl(0.05, 0.04, 0.16, -3.4, 1.04, 0.3, 6), 0xdfe8f0, 0.9), tint(cyl(0.05, 0.04, 0.16, -2.6, 1.04, 0.9, 6), 0xdfe8f0, 0.9));
    group.add(mergedMesh(lit, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x120d0c })));
    group.add(mergedMesh(glow, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  }
  // the night: stars, and the port a long way astern, lit ring by ring
  const far = new THREE.Group();
  {
    const rng = mulberry32(0x9a710);
    const n = 700, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, y = rng() * 2 - 1, r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(a) * r * 900;
      pos[i * 3 + 1] = y * 900;
      pos[i * 3 + 2] = Math.sin(a) * r * 900;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    far.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 2.2, sizeAttenuation: false, fog: false })));
    const ring = [];
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2;
      ring.push(tint(box(1.6, 1.6, 1.6, Math.cos(a) * 70, Math.sin(a) * 70, 0), [0xffd9a0, 0x9fd8ff, 0xffb060][i % 3], 1.2));
    }
    const port = mergedMesh(ring, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    port.position.set(-90, 40, -620);
    port.rotation.set(0.5, 0.5, 0);
    far.add(port);
  }
  group.add(far);
  const shuttle = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xfff0d0, map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  shuttle.visible = false;
  group.add(shuttle);
  const her = envoyRig();
  her.group.position.set(RAIL[0], 0, RAIL[1]);
  group.add(her.group);

  let inside = false, prev = null, walker = null, scene = null, pending = false, panelText = null;
  const later = [];
  const say = (line, sec) => crewSay(chapter, line, sec);
  const lines = (l, offer) => ({ speaker: LOVE.aboard, lines: l, cine: true, ...(offer ? { offer } : {}) });
  // first bell: a shuttle leaves the port without her
  const stayClock = createSceneClock({
    T: C.LOVE_STAY_T, lines: LOVE.stay, say: (l) => say(l, 6),
    pose(u) {
      const k = Math.min(1, Math.max(0, (u - 5) / (C.LOVE_STAY_T - 7)));
      shuttle.visible = u > 5;
      shuttle.position.set(-90 + 520 * k * k, 40 + 130 * k, -620 - 300 * k);
      shuttle.scale.setScalar(16 * (1 - 0.6 * k));
      her.group.rotation.y = Math.PI; // watching it go
    },
    onEnd() {
      scene = null;
      chapterHud.cine(false);
      shuttle.visible = false;
      L.advance('done');
    },
  });

  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: UP },
    noShip: true,
    exit: { x: DOOR[0], z: DOOR[1] },
    leaveHint: LOVE.hud.in,
    surfaces: [],
    colliders: [{ x: -3, z: 0.6, r: 1.3, top: Infinity }],
    floorYAt: (x, z) => (Math.abs(x) < HW - 0.5 && Math.abs(z) < HL - 0.5 ? 0 : -Infinity),
    snap: 1.2,
    pad: new THREE.Vector3(),
    spawn: new THREE.Vector3(DOOR[0], 0, DOOR[1] - 1.4),
    spawnYaw: Math.PI,
    npcs: [{
      x: RAIL[0], y: 0, z: RAIL[1], h: 2.6,
      talk() {
        if (L.reached('patio')) return lines(LOVE.after[L.how() || 'trusts']);
        L.offer(); // the checkpoint, as the decision is shown
        return lines(LOVE.patio, { kind: 'choice', prompt: LOVE.choice.prompt, options: [{ label: LOVE.choice.nothing, outcomeTag: 'love:nothing' }, { label: LOVE.choice.engine, outcomeTag: 'love:engine' }] });
      },
    }],
    consoles: [{ x: DOOR[0], y: 0, z: DOOR[1], r: 1.9, prompt: LOVE.prompts.in, off: () => !!scene, use: () => ((site.portal = 'base:deck'), null) }],
    portal: null,
    onChoice(tag) {
      const how = tag === 'love:nothing' ? 'trusts' : tag === 'love:engine' ? 'wary' : null;
      if (!how || !L.decide(how)) return null;
      pending = true;
      return lines(LOVE[how]);
    },
    mark: () => (scene ? null : L.reached('patio') ? null : { x: RAIL[0], z: RAIL[1], label: LOVE.marks.her }),
    held: () => !!scene,
    act() {
      if (scene) scene.clock.skip();
    },
    heldPrompt: () => (scene ? LOVE.skip : ''),
    camera(pos, target) {
      if (!scene) return false;
      const u = Math.max(0, scene.clock.u());
      // from the door, over her shoulder, at the port
      pos.set(3.4 - u * 0.05, 2.1, 3.2 - u * 0.04);
      target.set(-2.5, 1.9, -30);
      return true;
    },
    setWalker(p) {
      walker = p || null;
    },
    onEnter() {
      if (inside) return;
      inside = true;
      site.portal = null;
      group.visible = true;
      prev = captureLight(ctx.scene);
      ctx.scene.fog = null;
      sun.light.position.set(-0.3, 0.8, 0.5).normalize(); // the lantern, and the door's light behind
      sun.light.color.setRGB(1.0, 0.8, 0.6);
      sun.light.intensity = 0.9;
      sun.ambient.color.setRGB(0.5, 0.55, 0.8);
      sun.ambient.intensity = 0.6;
      scene = null;
      later.length = 0;
      panelText = null;
      shuttle.visible = false;
      her.group.rotation.y = Math.PI;
      pending = L.stage() === 'patio'; // (left before first bell: it is watched now)
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      if (scene) {
        scene.clock.stop();
        scene = null;
      }
      group.visible = false;
      chapterHud.clear();
      chapterHud.panel(null);
      panelText = null;
      restoreLight(ctx.scene, prev);
      prev = null;
    },
    inside: () => inside,
    tick(dt, t) {
      chapterHud.tick(dt);
      const d = Math.min(dt, 0.1);
      far.position.copy(cWalk.pos);
      poseRig(her, d, t, 'idle', 0);
      standRig(her, 0);
      const shown = !!scene; // (a frame that began in a scene ends in it)
      if (scene) scene.clock.tick(d);
      if (shown || !walker) return;
      // she turns from the rail when he comes out to her
      const near = Math.hypot(walker.x - RAIL[0], walker.z - RAIL[1]) < 4.5;
      her.group.rotation.y = near ? Math.atan2(walker.x - RAIL[0], walker.z - RAIL[1]) : Math.PI;
      if (pending && !isDialogueOpen() && chapterHud.state().line == null) {
        pending = false;
        scene = { kind: 'stay', clock: stayClock };
        chapterHud.panel((panelText = null));
        chapterHud.cine(true);
        stayClock.begin();
        return;
      }
      if (later.length && !isDialogueOpen() && chapterHud.state().line == null) say(later.shift(), 7);
      const text = L.reached('done') ? LOVE.hud.done : L.reached('patio') ? null : LOVE.hud.rail;
      if (text !== panelText) chapterHud.panel((panelText = text));
    },
    places: { door: [DOOR[0], DOOR[1] - 1.4], her: [RAIL[0] + 1.6, RAIL[1] + 2.2] },
    info: () => ({ inside, scene: scene ? { kind: scene.kind, u: +scene.clock.u().toFixed(2) } : null, pending, panel: panelText }),
    dbg: { skip: () => (scene ? scene.clock.skip() : false) },
  };
  return site;
}
