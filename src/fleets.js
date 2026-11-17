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
import { shipClasses, buildShip, buildDeck } from '../world/warships.js';
import { buildRig, poseRig } from '../world/aliens.js';

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
//        onLost(id) — a ship has just been destroyed (save it),
//        story — what captains and crews say (see world/warships.js buildDeck),
//        sunDir — a live unit vector toward the sun, for the parked ship's lighting }
export function createFleets(ctx) {
  const classes = shipClasses();
  const ships = [];
  const mats = {};
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _d = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  const r = rng(77);

  for (const f of FACTIONS) {
    mats[f] = {
      lit: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0a0a0c }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    };
    mats[f].glow.color.setScalar(1.15);
    // What a boarded deck is lit and glazed with. `deck` is the glow's twin
    // but never animated: Wavemall's hull turns through the colours, and a
    // room that did the same read as the floor flickering underfoot.
    // `room` is the hull's plate with enough of its own light to read indoors,
    // on the side of the ship the sun is not on.
    mats[f].room = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x24262c });
    mats[f].deck = new THREE.MeshBasicMaterial({ vertexColors: true });
    mats[f].deck.color.setScalar(1.15);
    mats[f].glass = new THREE.MeshBasicMaterial({
      color: 0x9fd0e8, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide,
    });
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

  let held = null; // id of the ship the pilot is docked on or walking: it cannot be lost
  // The ending (src/endgame.js) calls the warships to a ring round a point:
  // `k` 0 on their orbits .. 1 on the ring; `adrift` once their worlds are
  // gone and the ring is all the home they have.
  const muster = { on: false, center: null, r: 0, k: 0, adrift: false };
  // The last of the ending: every ship left forms on the pilot and goes where
  // the pilot goes. `leader`: { position, quaternion } read live; `mouth`: the
  // wormhole's position (live) and `mouthR`, where the formation closes up to
  // go through together.
  // `snap`: take station at once (a load into the far side, where the ships
  // were last seen a system away). `floorY`: a live { y } the hulls never go
  // under (the megaworld's canopy, src/farside.js), or null.
  const follow = { on: false, leader: null, mouth: null, mouthR: 1, first: true, snap: false, floorY: null };
  let cheer = 0; // 0..1, lights pulsing along every hull
  const _f = new THREE.Vector3();
  const _r = new THREE.Vector3();
  const _u = new THREE.Vector3();
  let lastT = 0;

  // one of the crew: an alien rig (world/aliens.js) standing at its post
  const people = (seed) => {
    const rig = buildRig(seed, 'fleet');
    return {
      group: rig.group,
      lift: rig.params.groundOffset || 0,
      update(dt, t) {
        poseRig(rig, dt, t, 'idle', 0);
      },
    };
  };

  function lose(ship, boom = true) {
    if (!ship.alive || ship.id === held) return;
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

  // Where the bow points: `_d` is the heading.
  const aim = (s) => s.group.quaternion.setFromRotationMatrix(_m.lookAt(s.group.position, _b.copy(s.group.position).sub(_d), UP));

  // Pose only: where every ship is at clock time `t`, from where its planet is
  // right now. game.js calls this at the top of the frame and again after a
  // floating-origin rebase, so the walker, the camera and the hull all read
  // the same pose inside one frame. (It used to be set at the END of the frame,
  // after the camera: a deck one frame ahead of the eye standing on it.)
  function place(t) {
    let slot = 0;
    const dt = Math.min(Math.max(t - lastT, 0), 0.1);
    lastT = t;
    if (follow.on) {
      // a chevron in the leader's own frame: the first pairs a little ahead and
      // out to either side, where they show through the canopy, the rest
      // stepping back and outward behind
      const L = follow.leader;
      _f.set(0, 0, -1).applyQuaternion(L.quaternion);
      _r.set(1, 0, 0).applyQuaternion(L.quaternion);
      _u.set(0, 1, 0).applyQuaternion(L.quaternion);
      // (no mouth: nothing to close up for, the formation flies open)
      const near = follow.mouth ? L.position.distanceTo(follow.mouth) : Infinity;
      const close = follow.mouth
        ? 1 - 0.8 * Math.min(Math.max(1 - (near - follow.mouthR) / (follow.mouthR * 2.5), 0), 1)
        : 1;
      const floor = follow.floorY ? follow.floorY.y : -Infinity;
      const k = 1 - Math.exp(-0.55 * dt);
      for (const s of ships) {
        if (!s.alive) continue;
        const row = (slot >> 1) + 1, side = slot & 1 ? 1 : -1;
        slot++;
        _a.copy(L.position)
          .addScaledVector(_r, side * (650 + row * 520) * close)
          .addScaledVector(_u, (((slot * 37) % 5) - 2) * 110 * close)
          .addScaledVector(_f, (1500 - row * 700) * close);
        // Held as an offset FROM the leader and eased toward its slot, so the
        // formation keeps station at any speed (warp included) and rides a
        // floating-origin rebase, which moves the leader and nothing here.
        _a.sub(L.position);
        if (!s.rel) s.rel = new THREE.Vector3();
        if (follow.first && follow.snap) s.rel.copy(_a);
        else if (follow.first) s.rel.subVectors(s.group.position, L.position); // from wherever it was
        else s.rel.lerp(_a, k);
        s.group.position.copy(L.position).add(s.rel);
        // a slot that falls under the ground rides along the top of it instead
        if (s.group.position.y < floor + s.cls.radius) s.group.position.y = floor + s.cls.radius;
        s.group.visible = true;
        _d.copy(_f);
        _m.lookAt(s.group.position, _b.copy(s.group.position).sub(_d), _u);
        _q.setFromRotationMatrix(_m);
        s.group.quaternion.slerp(_q, follow.first ? (follow.snap ? 1 : 0) : Math.min(k * 2, 1));
      }
      follow.first = false;
      return;
    }
    for (const s of ships) {
      if (!s.alive) continue;
      if (muster.adrift) {
        // no worlds left: warships keep the ring, freighters lie where they were
        if (s.kind === 'warship') {
          const a = (slot++ / 9) * 6.283 + t * 0.004;
          s.group.position.set(Math.cos(a) * muster.r, Math.sin(a * 3) * muster.r * 0.2, Math.sin(a) * muster.r).add(muster.center);
          _d.subVectors(muster.center, s.group.position).normalize();
          aim(s);
        }
        s.group.visible = true;
        continue;
      }
      if (s.kind === 'warship') {
        const p = ctx.find(s.faction);
        if (!p || p.removed) continue; // update() loses it
        const o = s.orbit;
        const R = (p.baseRadius ?? p.radius) * o.k + 300;
        const a = o.phase + t * o.rate;
        const ci = Math.cos(o.incl), si = Math.sin(o.incl);
        _a.set(Math.cos(a) * R, Math.sin(a) * R * si, Math.sin(a) * R * ci);
        _d.set(-Math.sin(a), Math.cos(a) * si, Math.cos(a) * ci); // along the orbit
        s.group.position.copy(p.group.position).add(_a);
        aim(s);
        if (muster.on) {
          // called in: from the orbit to a place on the ring, bow to the centre
          const ra = (slot++ / 9) * 6.283;
          _b.set(Math.cos(ra) * muster.r, Math.sin(ra * 3) * muster.r * 0.2, Math.sin(ra) * muster.r).add(muster.center);
          s.group.position.lerp(_b, muster.k);
          if (muster.k > 0.5) {
            _d.subVectors(muster.center, s.group.position).normalize();
            aim(s);
          }
        }
        s.group.visible = true;
      } else {
        const A = ctx.find(s.route.a), B = ctx.find(s.route.b);
        if (!A || !B || A.removed || B.removed) continue;
        // there and back, easing in and out of each end
        const ph = (t / ROUTE_TIME + s.route.phase) % 2;
        const back = ph > 1;
        const k = ease(back ? 2 - ph : ph);
        routeEnd(A, B, s.route.side, _a);
        routeEnd(B, A, -s.route.side, _b);
        _d.subVectors(_b, _a).normalize();
        if (back) _d.negate();
        s.group.position.lerpVectors(_a, _b, k);
        aim(s);
        s.group.visible = true;
      }
    }
  }

  return {
    ships,
    place,
    // Everything that is not a pose: lights, the crew, dogfights, losses.
    // `siege`: { name, k } — the planet under attack and how far the attack has
    // got (0 the swarm has arrived .. 1 the planet is gone), or null.
    update(dt, t, siege) {
      // Wavemall's lights turn through the colours
      mats['wavemall prime'].glow.color.setHSL((t * 0.08) % 1, 0.45, 0.62).multiplyScalar(1.9);
      // cheering: every hull's lights beat together, each fleet to its own time
      if (cheer > 0) {
        mats.rustia.glow.color.setScalar(1.15 + cheer * 1.6 * (0.5 + 0.5 * Math.sin(t * 9)));
        mats.saturnia.glow.color.setScalar(1.15 + cheer * 1.6 * (0.5 + 0.5 * Math.sin(t * 7 + 2)));
        mats['wavemall prime'].glow.color.multiplyScalar(1 + cheer * (0.5 + 0.5 * Math.sin(t * 11 + 4)));
      }
      for (const s of ships) {
        if (!s.alive) continue;
        if (s.site && s.id === held) s.site.update(dt, t);
        if (muster.adrift) continue;
        if (s.kind === 'warship') {
          const p = ctx.find(s.faction);
          if (!p || p.removed) {
            lose(s);
            continue;
          }
          // the siege takes them one at a time
          const mine = !!siege && siege.name === s.faction;
          if (mine && !s.fight) buildFight(s);
          if (s.fight) {
            // not round the ship the pilot is standing on: tracers start
            // inside the hull and strobe across the deck
            s.fight.group.visible = mine && s.id !== held;
            s.fight.uTime.value = t;
          }
          if (mine && siege.k > (Number(s.id.slice(-1)) + 1) / 3.6) {
            lose(s);
            ctx.onLost(s.id);
          }
        } else {
          const A = ctx.find(s.route.a), B = ctx.find(s.route.b);
          if (!A || !B || A.removed || B.removed) lose(s, !!siege);
        }
      }
    },
    // The walkable deck of a ship (world/warships.js), built on first boarding.
    site(ship) {
      if (!ship.site) ship.site = buildDeck(ship, mats[ship.faction], people, ctx.story, ctx.sunDir);
      return ship.site;
    },
    // The nearest ship that is still there, for docking.
    nearest(pos) {
      let best = null, bd = Infinity;
      for (const s of ships) {
        if (!s.alive || !s.group.visible) continue;
        const d = s.group.position.distanceToSquared(pos);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      return best;
    },
    hold(id) {
      held = id;
    },
    muster(center, r, k, adrift) {
      muster.on = true;
      muster.center = center;
      muster.r = r;
      muster.k = k;
      muster.adrift = adrift;
    },
    // The ending's last act (src/endgame.js): form on `leader` and stay there.
    // `mouth` null: no wormhole ahead, the formation stays open. `opts`:
    // { snap, floorY } (see `follow` above).
    follow(leader, mouth, mouthR, opts) {
      follow.on = true;
      follow.first = true;
      follow.leader = leader;
      follow.mouth = mouth || null;
      follow.mouthR = mouthR || 1;
      follow.snap = !!(opts && opts.snap);
      follow.floorY = (opts && opts.floorY) || null;
    },
    following: () => follow.on,
    // 0..1: how hard every hull's lights are beating
    cheer(k) {
      cheer = k;
      if (k <= 0) {
        mats.rustia.glow.color.setScalar(1.15);
        mats.saturnia.glow.color.setScalar(1.15);
      }
    },
    // Destroy one by id (the guns). Returns true if it was alive.
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
