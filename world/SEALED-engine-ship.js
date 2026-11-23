// SEALED: the owner has not played this yet. Do not open.
//
// Season 1, chapters 12 and 13 (plans/season-1-arc.md: The Engine, The
// Unforecast), as one system the light ship goes to: its two stage machines,
// its record, its doors, and what its three places share (the pair of black
// holes as they are drawn, and the vessel as it is flown).
//
// The places: world/SEALED-engine-dock.js (the gantry: a dock, in the world),
// world/SEALED-engine-reach.js (chapter 12: the vessel along the engine's
// oldest part), world/SEALED-engine-core.js (chapter 13: the lines, the waves,
// the core, the run). The words are world/SEALED-engine-words.js.
//
// Chapter 12's stages (`a`), forward only:
//   en_0   the ship is here
//   en_1   the gantry has been stood on, and the pair seen
//   en_2   the vessel is in, along the inner face
//   en_3   all six bands have been read
//   en_4   every band at once: where the rival came from
//   en_5   back on the gantry (the debrief follows, key `engine`)
// Chapter 13's (`b`; it opens once chapter 12 has been talked over):
//   ex_0   not begun
//   ex_1   the merger's forecast has been shown
//   ex_2   through the three lines (Marrow's part: the gap in a pattern)
//   ex_3   in to the core between the waves (Vask's part: the count)
//   ex_4   the choice has been made, and not yet lived through (never saved)
//   ex_5   the pair has merged; the fixed event is resolved
//   ex_6   back on the gantry (the debrief follows, key `unforecast`)
//
// Record keys: `a`, `b` (the stages), `k1` (chapter 12: one bit per band
// read, in the lamp's order), `k2` (chapter 13: how many lines are behind the
// vessel, 0..3, so a game come back to is not sent through them again).
//
// Season facts written: `ch13.core` ('destroyed' | 'fed') and `ch13.ione`:
//   she is aboard only if `ch9.ione` is 'stayed'. Then, by the choice and by
//   how she crossed (`defection.how`):
//     fed, trusts        'aboard'   (she stays to see what her people do)
//     fed, wary          'gone'     (she stays with the engine, to teach it)
//     destroyed, trusts  'aboard'   (she stays, and says little)
//     destroyed, wary    'lost'     (she goes back for her people; not seen again)
//   and 'gone' if she was never aboard.
// The fixed event `merger` is resolved 'blind' (destroyed) or 'curious' (fed).
//
// The science. Real: two black holes in a close orbit lose energy as
// gravitational waves, so the orbit shrinks and speeds up (the chirp), ends in
// a merger, and the last few per cent of the mass leaves as waves in a
// fraction of a second; a passing wave stretches space one way and squeezes it
// the other, across its direction of travel. Stretched, twice, as the arc
// says: (1) holes of a star's mass spend only seconds in their final orbits;
// for a finale of minutes these would have to be very large, and their
// earlier, sixteen-second orbit days away, as here, is licence. (2) A wave
// strong enough to be felt in the body, or seen to bend a deck, means standing
// where the pair's ordinary tides would already have pulled the ship apart.
//
// The legend of the EN_* numbers in src/constants.js:
//   EN_V1, EN_V2   the vessel's thrust (u/s^2) and drag (1/s)
//   EN_L1          the lamp's power here; EN_L2 seconds a band is held; EN_L3 how near
//   EN_P1          seconds between waves in chapter 12; EN_P2 how far the picture is strained;
//   EN_P3          how hard a wave shoves the vessel (u/s^2)
//   EN_S1..EN_S5   scene lengths: the gantry, the way in, every band, the fleet, the merger
//   EN_G1          a gap's radius; EN_G2 how far apart the lines are; EN_G3 the vessel's pace through them
//   EN_W1          seconds to the first wave in chapter 13; EN_W2 each gap is this much of the last;
//   EN_W3          a strut's lee, radius; EN_W4 how far apart the struts are
//   EN_C1          seconds the act at the core takes; EN_C2 seconds to the merger after it;
//   EN_C3          how far out is clear; EN_C4 how hard the last waves shove

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { ship } from '../src/ship.js';
import { input, moveAxes } from '../src/input.js';
import { cWalk } from '../src/capitalWalk.js';
import { lamp, LAMP_U, nextBand, toggleLamp, stepLamp, resetLamp } from '../src/lamp.js';
import { BEAM_VERT, BEAM_FRAG } from './submersible.js';
import { tint, box, mergedMesh } from './capital.js';
import { bandClick } from './entryzero-audio.js';
import { createEngineDock } from './SEALED-engine-dock.js';
import { createEngineReach } from './SEALED-engine-reach.js';
import { createEngineCore } from './SEALED-engine-core.js';
import { ENW } from './SEALED-engine-words.js';

export const EN_A = ['en_0', 'en_1', 'en_2', 'en_3', 'en_4', 'en_5'];
export const EN_B = ['ex_0', 'ex_1', 'ex_2', 'ex_3', 'ex_4', 'ex_5', 'ex_6'];
export const EN_KEY = 'ch13.core';

// --- the pair, as it is drawn: two black discs, each ringed with the light bent round it, and what is falling in ---
const HOLE_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const HOLE_FRAG = /* glsl */ `
  uniform float uGlow;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    // black, but for the rim: light from behind it, bent right round
    float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 5.0);
    gl_FragColor = vec4(vec3(1.0, 0.82, 0.6) * rim * (1.6 + uGlow * 3.0), 1.0);
  }
`;
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
// o: { r: each hole's radius, sep: how far apart they stand, engine: draw the machine round them }
export function buildBinary(o) {
  const group = new THREE.Group();
  const u = { uGlow: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: HOLE_VERT, fragmentShader: HOLE_FRAG, fog: false });
  const geo = new THREE.SphereGeometry(o.r, 32, 20);
  const a = new THREE.Mesh(geo, mat), b = new THREE.Mesh(geo, mat);
  b.scale.setScalar(0.8);
  const tex = glowTexture();
  const halo = (col, s) => {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ color: col, map: tex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.scale.setScalar(s);
    return m;
  };
  const ha = halo(0xffb070, o.r * 5), hb = halo(0xffb070, o.r * 4), flash = halo(0xffffff, o.r * 2);
  flash.material.opacity = 0;
  // what they share: a disc of gas round both, seen nearly edge on
  const disc = new THREE.Mesh(new THREE.RingGeometry(o.sep * 0.9, o.sep * 2.6, 96, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.42, 0.16), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  group.add(disc, ha, hb, a, b, flash);
  if (o.engine) {
    // the machine: a ring far outside the disc, ribbed, and lit along its inner face
    const R = o.sep * 4.2;
    group.add(new THREE.Mesh(new THREE.TorusGeometry(R, o.r * 0.5, 8, 120).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.23, 0.28), fog: false })));
    const lights = new THREE.Mesh(new THREE.TorusGeometry(R - o.r * 0.52, o.r * 0.05, 4, 120).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.1, 1.4), fog: false }));
    group.add(lights);
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(o.r * 0.14, o.r * 0.14, R * 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 0.17, 0.21), fog: false }));
      const an = (i / 12) * Math.PI * 2;
      s.position.set(Math.cos(an) * R * 0.76, 0, Math.sin(an) * R * 0.76);
      s.rotation.y = -an + Math.PI / 2;
      group.add(s);
    }
  }
  const base = new THREE.Vector3(1, 1, 1);
  return {
    group,
    // ph: where they are in their turn; sep01: how much of their distance is left (1..0); h: the strain just now (-1..1 times EN_P2); merged: 0..1
    pose(ph, sep01, h, merged = 0) {
      const s = o.sep * Math.max(0.02, sep01) * (1 - merged);
      a.position.set(Math.cos(ph) * s * 0.45, 0, Math.sin(ph) * s * 0.45);
      b.position.set(-Math.cos(ph) * s * 0.55, 0, -Math.sin(ph) * s * 0.55);
      a.scale.setScalar(1 + 0.3 * merged);
      b.visible = hb.visible = merged < 1;
      ha.position.copy(a.position);
      hb.position.copy(b.position);
      disc.material.opacity = 0.22 * (1 - merged) + 0.05;
      flash.material.opacity = merged > 0 && merged < 1 ? Math.sin(merged * Math.PI) : 0;
      flash.scale.setScalar(o.r * (2 + 26 * merged));
      u.uGlow.value = 0.3 * Math.abs(h) + (merged > 0 && merged < 1 ? Math.sin(merged * Math.PI) : 0);
      // a wave going through: one way longer, the other shorter (it is the picture that is strained, not the count)
      group.scale.set(base.x * (1 + h), base.y * (1 - h), base.z);
    },
    setScale(k) {
      base.setScalar(k);
    },
  };
}

// --- the vessel, as it is flown (Entry Zero's, in the dark between) ---
// site: the place it is flown in, for the walker's look. Returns the hull and one step of it.
export function createVessel(group) {
  const at = new THREE.Vector3(), vel = new THREE.Vector3();
  const hull = new THREE.Group();
  hull.rotation.order = 'YXZ';
  const frame = [];
  for (const [x, y] of [[-1.5, 1.05], [1.5, 1.05], [-1.5, -1.05], [1.5, -1.05]]) frame.push(tint(box(0.07, 0.07, 1.6, x, y, 1.5), 0x0b1116));
  frame.push(tint(box(3.07, 0.07, 0.07, 0, 1.05, 2.3), 0x0b1116), tint(box(3.07, 0.07, 0.07, 0, -1.05, 2.3), 0x0b1116), tint(box(0.07, 2.17, 0.07, -1.5, 0, 2.3), 0x0b1116), tint(box(0.07, 2.17, 0.07, 1.5, 0, 2.3), 0x0b1116));
  hull.add(mergedMesh(frame, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  const LAMP_AT = new THREE.Vector3(-1.05, -0.8, 1.7);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(Math.tan(C.EZ_LAMP_CONE), 1, 28, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms: LAMP_U, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
  );
  beam.position.copy(LAMP_AT);
  beam.frustumCulled = false;
  beam.renderOrder = 7;
  hull.add(beam);
  group.add(hull);
  const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _w = new THREE.Vector3();
  let baseYaw = 0, lastChanged = -1, lastBand = -1;
  const v = {
    at, vel, hull, beam, yaw: 0, pitch: 0, avY: 0, avX: 0, push: 0,
    // boarded: the lamp as it is here, the walker's look taken as the helm
    board(power, all) {
      baseYaw = cWalk.yaw;
      cWalk.pitch = 0;
      vel.set(0, 0, 0);
      v.avY = v.avX = 0;
      resetLamp(true);
      lamp.medium = 'void';
      lamp.power = power;
      lamp.canAll = !!all;
      lamp.lineBeam = false;
      lastChanged = lamp.changed;
      lastBand = lamp.band;
      input.bandPrev = input.lampToggle = false;
    },
    // one frame of the controls: `free` false while the vessel is carried or the pilot is being talked to
    helm(free) {
      const dYaw = cWalk.yaw - baseYaw, dPitch = cWalk.pitch;
      cWalk.yaw = baseYaw;
      cWalk.pitch = 0;
      if (free) {
        v.avY += dYaw * C.EZ_SUB_TURN;
        v.avX += dPitch * C.EZ_SUB_TURN;
        if (input.bandPrev) nextBand(-1);
        if (input.lampToggle) toggleLamp();
      }
      input.bandPrev = input.lampToggle = false;
      const axes = moveAxes();
      const stick = input.moveX !== 0 || input.moveY !== 0;
      const lift = free ? (input.brake ? 1 : 0) - (input.sink || (input.sprint && !stick) ? 1 : 0) : 0;
      v.push += (Math.min(1, Math.hypot(free ? axes.fwd : 0, free ? axes.strafe : 0, lift)) - v.push) * 0.1;
      return { fwd: free ? axes.fwd : 0, strafe: free ? axes.strafe : 0, lift };
    },
    // one step: thrust, whatever else is pushing (`ext`, u/s^2), drag
    step(h, k, ext) {
      v.yaw += v.avY * h;
      v.pitch = Math.min(Math.max(v.pitch + v.avX * h, -C.EZ_SUB_PITCH), C.EZ_SUB_PITCH);
      const damp = Math.exp(-C.EZ_SUB_TURN_DAMP * h);
      v.avY *= damp;
      v.avX *= damp;
      const cp = Math.cos(v.pitch);
      _f.set(Math.sin(v.yaw) * cp, Math.sin(v.pitch), Math.cos(v.yaw) * cp);
      _r.set(-Math.cos(v.yaw), 0, Math.sin(v.yaw));
      _w.set(0, 0, 0).addScaledVector(_f, k.fwd).addScaledVector(_r, k.strafe);
      _w.y += k.lift;
      const n = _w.length();
      if (n > 1) _w.multiplyScalar(1 / n);
      vel.addScaledVector(_w, C.EN_V1 * h);
      if (ext) vel.addScaledVector(ext, h);
      vel.multiplyScalar(Math.exp(-C.EN_V2 * h));
      at.addScaledVector(vel, h);
    },
    // the hull and the lamp on it, where the vessel now is
    place(all) {
      hull.position.copy(at);
      hull.rotation.set(-v.pitch, v.yaw, 0);
      lamp.pos.copy(LAMP_AT).applyQuaternion(hull.quaternion).add(at);
      const cp = Math.cos(v.pitch);
      lamp.dir.set(Math.sin(v.yaw) * cp, Math.sin(v.pitch), Math.cos(v.yaw) * cp);
      lamp.energy = 1;
      stepLamp(0, !!all);
      beam.scale.setScalar(Math.min(lamp.reach, 900) * 0.75);
      if (lamp.changed !== lastChanged) {
        lastChanged = lamp.changed;
        if (lamp.band !== lastBand) bandClick((lastBand = lamp.band));
      }
    },
    look(p) {
      const dx = p.x - at.x, dy = p.y - at.y, dz = p.z - at.z;
      v.yaw = Math.atan2(dx, dz);
      v.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
    camera(pos, target) {
      pos.copy(at);
      const cp = Math.cos(v.pitch);
      target.set(at.x + Math.sin(v.yaw) * cp * 10, at.y + Math.sin(v.pitch) * 10, at.z + Math.cos(v.yaw) * cp * 10);
      return true;
    },
  };
  return v;
}

// A wave going through, once a turn: -1..1 for a short while at the start of each period, 0 between.
export const strain = (t, P) => {
  const x = (((t % P) + P) % P) / P, w = Math.min(0.5, 1.6 / P);
  return x < w ? Math.sin((x / w) * Math.PI * 2) * Math.sin((x / w) * Math.PI) : 0;
};
// seconds until the next one
export const untilWave = (t, P) => P - (((t % P) + P) % P);

const _c = new THREE.Vector3();

// ctx: { scene, camera, chapter, voyage, sunDir, save(), crewTalk(captain), season, fixed }
export function createEngineSystem(ctx) {
  const { season, fixed } = ctx;
  let a = 'en_0', b = 'ex_0', k1 = 0, k2 = 0;
  const ia = (s) => EN_A.indexOf(s), ib = (s) => EN_B.indexOf(s);
  const S = {
    a: () => a,
    b: () => b,
    reachedA: (s) => ia(a) >= ia(s),
    reachedB: (s) => ib(b) >= ib(s),
    advA(to) {
      if (ia(to) <= ia(a)) return false;
      a = to;
      ctx.save();
      return true;
    },
    advB(to) {
      if (ib(to) <= ib(b)) return false;
      b = to;
      ctx.save();
      return true;
    },
    // (only ever back to before the choice: one that was not lived through)
    revertB(to) {
      if (ib(to) >= ib(b)) return false;
      b = to;
      ctx.save();
      return true;
    },
    open13: () => a === 'en_5' && !!season.get('debrief.engine'),
    k1: () => k1,
    read(i) {
      k1 |= 1 << i;
      ctx.save();
      return k1;
    },
    k2: () => k2,
    passed(n) {
      k2 = Math.max(k2, n);
      ctx.save();
    },
    // is she aboard (chapter 9), and how did she cross
    envoy: () => (season.get('ch9.ione') === 'stayed' ? fixed.outcome('defection')?.how || 'trusts' : null),
    // what the choice makes of her
    ione(core) {
      const how = S.envoy();
      if (!how) return 'gone';
      if (how === 'trusts') return 'aboard';
      return core === 'fed' ? 'gone' : 'lost';
    },
  };
  const dock = createEngineDock(ctx, S);
  const made = {};
  const get = (name, make) => {
    if (made[name] === undefined) {
      try {
        made[name] = make(ctx, S);
      } catch (err) {
        made[name] = null;
        console.warn(`[voyage] ${name} could not be built`, err);
      }
    }
    return made[name];
  };
  const below = (s) => (s ? { site: s, spawn: s.spawn, yaw: s.spawnYaw, look: 'dive' } : null);

  return {
    docks: [{ id: 'gantry', label: ENW.dock.label, pos: [-16000, 6000, -34000], site: dock, radius: 800, hover: 200, approach: ENW.dock.approach, welcome: ENW.dock.welcome, dockLabel: ENW.dock.dockLabel, color: '#ffb070' }],
    planets: [],
    hop(key) {
      if (key === 'en:reach') return below(get('reach', createEngineReach));
      if (key === 'en:core') return below(get('core', createEngineCore));
      if (key === 'en:back') {
        // lost: back to where the season says (the core's asking, or the start of the part that was being flown)
        const s = get('core', createEngineCore);
        if (!s) return null;
        s.revive();
        return below(s);
      }
      if (key === 'en:dock') {
        ctx.voyage.place();
        return { site: dock, spawn: dock.fromVessel, yaw: 0, out: true };
      }
      return null;
    },
    door() {
      for (const s of [dock, made.reach, made.core]) {
        if (!s || !s.inside() || !s.portal) continue;
        const to = s.portal;
        s.portal = null;
        return to;
      }
      return null;
    },
    update() {
      // nothing is flown through the pair: inside the dock's reach the landing has the helm, and outside it this does
      if (dock.inside() || (made.reach && made.reach.inside()) || (made.core && made.core.inside())) return;
      _c.copy(dock.group.position).add(dock.pair.centre);
      const d = ship.position.distanceTo(_c), min = dock.pair.keep;
      if (d < min && d > 1) {
        const out = ship.position.clone().sub(_c).multiplyScalar(1 / d);
        ship.position.copy(_c).addScaledVector(out, min);
        const vin = ship.velocity.dot(out);
        if (vin < 0) ship.velocity.addScaledVector(out, -vin);
      }
    },
    talk: (captainId) => (b === 'ex_6' ? null : a === 'en_5' ? ENW.talk13[captainId] || null : ENW.talk12[captainId] || null),
    debrief() {
      if (a === 'en_5' && !season.get('debrief.engine')) {
        const D = ENW.debrief12;
        return { key: 'engine', title: D.title, complete: D.complete, lines: [D.open, ...D.body, D.close], nextCourse: D.nextCourse, nextNone: D.nextNone };
      }
      if (b === 'ex_6' && !season.get('debrief.unforecast')) {
        const D = ENW.debrief13;
        const core = season.get(EN_KEY) === 'fed' ? 'fed' : 'destroyed';
        const fate = season.get('ch13.ione');
        const io = !S.envoy() ? D.ione.none : fate === 'aboard' ? (core === 'fed' ? D.ione.aboardFed : D.ione.aboardDestroyed) : fate === 'lost' ? D.ione.lost : D.ione.gone;
        return { key: 'unforecast', title: D.title, complete: D.complete, lines: [D.open, ...D.body, ...D[core], io, ...D.tail, D.close], nextCourse: D.nextCourse, nextNone: D.nextNone };
      }
      return null;
    },
    serialize() {
      if (a === 'en_0' && b === 'ex_0' && !k1 && !k2) return undefined;
      const rec = { a };
      if (b !== 'ex_0') rec.b = b === 'ex_4' ? 'ex_3' : b; // (a choice not lived through is not saved)
      if (k1) rec.k1 = k1;
      if (k2) rec.k2 = k2;
      return rec;
    },
    restore(raw) {
      if (!raw || typeof raw !== 'object') return;
      if (EN_A.includes(raw.a)) a = raw.a;
      if (EN_B.includes(raw.b)) b = raw.b === 'ex_4' ? 'ex_3' : raw.b;
      if (Number.isFinite(raw.k1)) k1 = raw.k1 & 63;
      if (Number.isFinite(raw.k2)) k2 = Math.max(0, Math.min(3, Math.floor(raw.k2)));
      if (season.pending()?.key === EN_KEY && season.get(EN_KEY) != null) season.die();
    },
    state: () => ({
      a, b, k1, k2, open13: S.open13(), core: season.get(EN_KEY), ione: season.get('ch13.ione'), pending: season.pending(), merger: fixed.outcome('merger'),
      dock: dock.info(), reach: made.reach ? made.reach.info() : null, coreSite: made.core ? made.core.info() : null,
      places: { dock: dock.places, reach: made.reach ? made.reach.places : null, core: made.core ? made.core.places : null },
    }),
    // --- dev (through __debug.tenretni.voyage().instance('engine')) ---
    go12(s) {
      if (!EN_A.includes(s)) return false;
      a = s;
      k1 = ia(s) >= ia('en_3') ? 63 : 0;
      if (s !== 'en_5') {
        b = 'ex_0';
        k2 = 0;
        season.set('debrief.engine', null);
      }
      ctx.save();
      return true;
    },
    // `opt`: 'destroyed' | 'fed' for ex_5 and ex_6
    go13(s, opt) {
      if (!EN_B.includes(s) || s === 'ex_4') return false;
      a = 'en_5';
      k1 = 63;
      season.set('debrief.engine', true);
      if (season.pending()?.key === EN_KEY) season.survive(EN_KEY);
      if (ib(s) >= ib('ex_5')) {
        const core = opt === 'fed' ? 'fed' : opt === 'destroyed' ? 'destroyed' : season.get(EN_KEY) || 'destroyed';
        season.decide(EN_KEY, core);
        season.set('ch13.ione', S.ione(core));
        fixed.resolve('merger', core === 'fed' ? 'curious' : 'blind', { core });
      } else {
        season.set(EN_KEY, null);
        season.set('ch13.ione', null);
        season.clearEvent('merger');
        if (ib(s) >= ib('ex_1')) fixed.forecast('merger');
      }
      if (s !== 'ex_6') season.set('debrief.unforecast', null);
      b = s;
      k2 = ib(s) >= ib('ex_2') ? 3 : 0;
      if (made.core) made.core.settle();
      ctx.save();
      return true;
    },
    site: () => [dock, made.reach, made.core].find((s) => s && s.inside()) || null,
    skip() {
      const s = [dock, made.reach, made.core].find((x) => x && x.inside());
      return s && s.dbg.skip ? s.dbg.skip() : false;
    },
    dbg(name, ...args) {
      const s = [dock, made.reach, made.core].find((x) => x && x.inside());
      return s && s.dbg[name] ? s.dbg[name](...args) : null;
    },
    S,
  };
}
