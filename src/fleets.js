// The war (src/tenretni.js starts it; same lazy chunk): once the worldship has
// eaten its first planet, the three peoples it has not reached yet — Rustia,
// Saturnia, Wavemall Prime — put fleets into space.
//
//   warships   three per planet, on guard orbits round it
//   freighters two on each of the three routes between the planets, shuttling
//   dogfights  round the warships of whichever planet the worldship is at,
//              or is heading for next: the swarm got there first
//
// Nothing here is simulated. A ship's place is a function of the clock and of
// where its planet is this frame (planets ride the floating origin and, by the
// end, get eaten), so there is no state to drift. A warship is lost when the
// siege of its planet reaches it or when someone shoots it (`lost`); a
// freighter is lost with either end of its route.
//
// Ships are on the navigation chart (kind 'ship', the FLEETS list) and the
// autopilot will fly to one. world/warships.js builds the hulls.

import * as THREE from 'three';
import { addNavBody, setNavHidden } from './nav.js';
import { shipClasses, buildShip } from '../world/warships.js';

const FACTIONS = ['rustia', 'saturnia', 'wavemall prime'];
const NAV_COLOR = { rustia: '#ff8a4a', saturnia: '#fff0c0', 'wavemall prime': '#ff5fc4' };
const ROUTE_TIME = 260; // seconds, one way
const SWARM = 700; // points in one warship's dogfight
const TRACERS = 36;

const FIGHT_VERT = `
attribute vec4 aSeed;
uniform float uTime;
uniform float uR;
varying float vA;
vec3 rotAxis(vec3 v, vec3 k, float a) {
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
void main() {
  vec3 d = normalize(position);
  vec3 ax = normalize(cross(d, vec3(aSeed.x - 0.5, aSeed.y - 0.5, aSeed.z - 0.5)) + 1e-4);
  d = rotAxis(d, ax, uTime * (0.25 + 0.9 * aSeed.w) + aSeed.x * 6.28);
  float r = uR * (0.55 + 1.2 * aSeed.y + 0.25 * sin(uTime * (0.6 + aSeed.z) + aSeed.w * 9.0));
  vec4 mv = modelViewMatrix * vec4(d * r, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(2600.0 / max(-mv.z, 1.0) * (0.6 + aSeed.z), 1.3, 5.0);
  vA = 0.6 + 0.4 * sin(uTime * 7.0 + aSeed.w * 40.0);
}`;
const FIGHT_FRAG = `
varying float vA;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = dot(q, q);
  if (d > 1.0) discard;
  gl_FragColor = vec4(vec3(0.25, 1.0, 0.5) * exp(-d * 3.0) * vA * 1.3, 1.0);
}`;
// tracers: each segment is alive for a slice of a repeating second
const TRACE_VERT = `
attribute float aSeed;
uniform float uTime;
varying float vA;
void main() {
  float ph = fract(uTime * (0.7 + aSeed) + aSeed * 13.0);
  vA = step(ph, 0.16) * (1.0 - ph / 0.16);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const TRACE_FRAG = `
varying float vA;
uniform vec3 uColor;
void main() {
  if (vA <= 0.0) discard;
  gl_FragColor = vec4(uColor * vA * 1.6, 1.0);
}`;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ctx: { scene, find(name) -> world, explode(pos, scale), lost: Set<string>,
//        onLost(id) — a ship has just been destroyed (save it) }
export function createFleets(ctx) {
  const classes = shipClasses();
  const ships = [];
  const mats = {};
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _d = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const UP = new THREE.Vector3(0, 1, 0);
  const r = rng(77);

  for (const f of FACTIONS) {
    mats[f] = {
      lit: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0a0a0c }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    };
    mats[f].glow.color.setScalar(1.15);
  }

  const add = (ship) => {
    ship.group = buildShip(ship.cls, mats[ship.faction].lit, mats[ship.faction].glow);
    ship.group.visible = false;
    ship.alive = !ctx.lost.has(ship.id);
    ship.fight = null;
    ship.label = `${classes[ship.faction].label} · ${ship.name.toUpperCase()}`;
    ctx.scene.add(ship.group);
    ships.push(ship);
    if (ship.alive) {
      addNavBody({
        id: ship.id, label: ship.label, pos: ship.group.position, dot: 3,
        radius: ship.cls.radius, logDist: ship.cls.radius * 2.4, color: NAV_COLOR[ship.faction], kind: 'ship',
      });
    }
  };

  FACTIONS.forEach((f, fi) => {
    const c = classes[f];
    for (let i = 0; i < 3; i++) {
      add({
        id: `${f}:w${i}`, name: c.names[i], faction: f, kind: 'warship', cls: c.warship,
        orbit: { k: 2.0 + i * 0.55, rate: 0.012 - i * 0.002, phase: (i / 3) * 6.283 + fi, incl: (i - 1) * 0.35 },
      });
    }
    const to = FACTIONS[(fi + 1) % 3];
    for (let i = 0; i < 2; i++) {
      add({
        id: `${f}:f${i}`, name: c.hauler[i], faction: f, kind: 'freighter', cls: c.freighter,
        route: { a: f, b: to, phase: i * 0.5 + r() * 0.1, side: i ? 1 : -1 },
      });
    }
  });

  // --- dogfight dressing, built for a warship the first time it is besieged ---
  function buildFight(ship) {
    const R = ship.cls.radius;
    const g = new THREE.Group();
    const n = SWARM;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const z = r() * 2 - 1, th = r() * 6.283, k = Math.sqrt(1 - z * z);
      pos.set([k * Math.cos(th), k * Math.sin(th), z], i * 3);
      seed.set([r(), r(), r(), r()], i * 4);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const uTime = { value: 0 };
    const pts = new THREE.Points(pg, new THREE.ShaderMaterial({
      vertexShader: FIGHT_VERT, fragmentShader: FIGHT_FRAG,
      uniforms: { uTime, uR: { value: R } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    pts.frustumCulled = false;
    g.add(pts);
    // the ship's guns answering: short bright lines from the hull outward
    const lp = new Float32Array(TRACERS * 6), ls = new Float32Array(TRACERS * 2);
    for (let i = 0; i < TRACERS; i++) {
      const z = r() * 2 - 1, th = r() * 6.283, k = Math.sqrt(1 - z * z);
      const d = [k * Math.cos(th), k * Math.sin(th) * 0.6, z];
      const r0 = R * 0.2, r1 = R * (0.9 + r() * 0.9);
      lp.set([d[0] * r0, d[1] * r0, d[2] * r0 * 2, d[0] * r1, d[1] * r1, d[2] * r1], i * 6);
      const sd = r();
      ls[i * 2] = ls[i * 2 + 1] = sd;
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    lg.setAttribute('aSeed', new THREE.BufferAttribute(ls, 1));
    const lines = new THREE.LineSegments(lg, new THREE.ShaderMaterial({
      vertexShader: TRACE_VERT, fragmentShader: TRACE_FRAG,
      uniforms: { uTime, uColor: { value: new THREE.Color(NAV_COLOR[ship.faction]) } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    lines.frustumCulled = false;
    g.add(lines);
    ship.group.add(g);
    ship.fight = { group: g, uTime };
  }

  function lose(ship, boom = true) {
    if (!ship.alive) return;
    ship.alive = false;
    ship.group.visible = false;
    setNavHidden(ship.group.position, true);
    if (boom) ctx.explode(ship.group.position, ship.cls.radius * 0.8);
  }

  // Where a freighter's route ends at a world: off its flank, toward the other end.
  function routeEnd(world, other, side, out) {
    out.subVectors(other.group.position, world.group.position).normalize();
    _d.crossVectors(out, UP).normalize();
    return out
      .multiplyScalar((world.baseRadius ?? world.radius) * 2.6)
      .addScaledVector(_d, side * 700)
      .add(world.group.position);
  }

  const ease = (x) => x * x * (3 - 2 * x);

  return {
    ships,
    // `siege`: { name, k } — the planet under attack and how far the attack has
    // got (0 the swarm has arrived .. 1 the planet is gone), or null.
    update(dt, t, siege) {
      // Wavemall's lights turn through the colours
      mats['wavemall prime'].glow.color.setHSL((t * 0.08) % 1, 0.45, 0.62).multiplyScalar(1.9);
      for (const s of ships) {
        if (!s.alive) continue;
        if (s.kind === 'warship') {
          const p = ctx.find(s.faction);
          if (!p || p.removed) {
            lose(s);
            continue;
          }
          const o = s.orbit;
          const R = (p.baseRadius ?? p.radius) * o.k + 300;
          const a = o.phase + t * o.rate;
          const ci = Math.cos(o.incl), si = Math.sin(o.incl);
          _a.set(Math.cos(a) * R, Math.sin(a) * R * si, Math.sin(a) * R * ci);
          _d.set(-Math.sin(a), Math.cos(a) * si, Math.cos(a) * ci); // along the orbit
          s.group.position.copy(p.group.position).add(_a);
          s.group.quaternion.setFromRotationMatrix(_m.lookAt(s.group.position, _b.copy(s.group.position).sub(_d), UP));
          s.group.visible = true;
          // the siege takes them one at a time
          const mine = !!siege && siege.name === s.faction;
          if (mine && !s.fight) buildFight(s);
          if (s.fight) {
            s.fight.group.visible = mine;
            s.fight.uTime.value = t;
          }
          if (mine && siege.k > (Number(s.id.slice(-1)) + 1) / 3.6) {
            lose(s);
            ctx.onLost(s.id);
          }
        } else {
          const A = ctx.find(s.route.a), B = ctx.find(s.route.b);
          if (!A || !B || A.removed || B.removed) {
            lose(s, !!siege);
            continue;
          }
          // there and back, easing in and out of each end
          const ph = (t / ROUTE_TIME + s.route.phase) % 2;
          const back = ph > 1;
          const k = ease(back ? 2 - ph : ph);
          routeEnd(A, B, s.route.side, _a);
          routeEnd(B, A, -s.route.side, _b);
          _d.subVectors(_b, _a).normalize();
          if (back) _d.negate();
          s.group.position.lerpVectors(_a, _b, k);
          s.group.quaternion.setFromRotationMatrix(_m.lookAt(s.group.position, _b.copy(s.group.position).sub(_d), UP));
          s.group.visible = true;
        }
      }
    },
    // Destroy one by id (the guns, stage 4). Returns true if it was alive.
    destroy(id) {
      const s = ships.find((x) => x.id === id);
      if (!s || !s.alive) return false;
      lose(s);
      ctx.onLost(id);
      return true;
    },
    // Everything goes (the worldship has left, or the system has ended).
    clear() {
      for (const s of ships) lose(s, false);
    },
    alive: (faction, kind = 'warship') => ships.filter((s) => s.alive && s.kind === kind && (!faction || s.faction === faction)),
    state: () => ships.map((s) => ({ id: s.id, alive: s.alive, kind: s.kind, pos: s.group.position.toArray().map(Math.round) })),
  };
}
