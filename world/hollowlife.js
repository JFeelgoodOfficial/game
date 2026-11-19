// What lives in the hollow, and what is after the vessel there (GDD 5.7.5).
//
// Everything here is seen in one band of the lamp and no other, and for a
// reason (src/lamp.js): the creature is made of something that answers there.
//
//   drifter   blue-green   makes its own light (luciferin), in the window water passes
//   painted   ultraviolet  skin pigment that fluoresces under UV
//   warm      infrared     glass-clear, and warmer than what is round it
//   line      H-alpha      a living veil of excited hydrogen: one emission line
//   boned     X-ray        soft tissue is thin to it, bone is not
//   caller    radio        never drawn; heard (world/entryzero-audio.js)
//   guard     H-alpha      at the firewall: made of what the wall is made of,
//                          which is why it lets them through
//
// A species is one InstancedMesh for every school of it in a zone, moved in
// the vertex shader from a seed each, so a frame costs one uniform write. For
// the log the CPU only needs to know where each school is and how big.
//
// The three threats want energy, not the hull:
//
//   light eaters   drawn to a lit lamp on any band but H-alpha, and drink the
//                  beam. Seen only as edges in the light they are eating.
//   heat leeches   seen only in infrared. They settle on the hull and take
//                  the cabin's warmth; they cannot hold on at speed.
//   radiation feeders   asleep, and dense enough to show on X-ray. The X-ray
//                  band wakes them; at the glass they throw it back, and the
//                  dose climbs faster. They settle when the band is left.
//
// Those are a handful of bodies stepped on the CPU, into preallocated arrays.

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { lamp, LAMP_U, LAMP_GLSL, BAND, lampLive, bandIsBeam } from '../src/lamp.js';
import { BANDS, LIFE } from './entryzero-dialogue.js';

const bandOf = (id) => BANDS.findIndex((b) => b.id === id);

// kind -> what the body is, and the shader branch that draws it
const KIND = { drifter: 0, painted: 1, warm: 2, line: 3, boned: 4, guard: 5 };
function bodyGeometry(kind) {
  if (kind === 'drifter') return new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55); // a bell
  if (kind === 'painted') return new THREE.SphereGeometry(1, 12, 8).scale(0.34, 0.5, 1.5); // long, and flat-sided
  if (kind === 'guard') return new THREE.OctahedronGeometry(1, 2).scale(0.4, 0.4, 2.2); // a spindle
  if (kind === 'line') return new THREE.TorusKnotGeometry(1, 0.26, 96, 10, 2, 3);
  if (kind === 'boned') return new THREE.SphereGeometry(1, 14, 10).scale(0.55, 0.6, 1.4);
  return new THREE.SphereGeometry(1, 12, 8); // warm: a blob
}

const LIFE_VERT = /* glsl */ `
  attribute vec3 aHome;
  attribute vec4 aSeed; // phase, how far it ranges, how fast, how big
  uniform float uTime;
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vL;
  varying float vSeed;
  void main() {
    float a = aSeed.x * 6.2832 + uTime * aSeed.z;
    float b = aSeed.x * 17.0 + uTime * aSeed.z * 0.61;
    vec3 c = aHome + aSeed.y * vec3(cos(a) * cos(b * 0.5), sin(b) * 0.55, sin(a) * cos(b * 0.5));
    // nose along the way it is going
    vec3 fwd = normalize(vec3(-sin(a), 0.25 * cos(b), cos(a)));
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
    vec3 up = cross(fwd, right);
    float beat = 1.0 + 0.14 * sin(uTime * 2.2 + aSeed.x * 40.0);
    vec3 lp = position * aSeed.w;
    lp.xy *= beat;
    lp.z /= beat;
    vW = c + right * lp.x + up * lp.y + fwd * lp.z;
    vN = normalize(right * normal.x + up * normal.y + fwd * normal.z);
    vL = position;
    vSeed = aSeed.x;
    gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
  }
`;
const LIFE_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  uniform float uTime;
  uniform int uKind;
  uniform vec3 uTint;
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vL;
  varying float vSeed;
  void main() {
    vec3 v = normalize(cameraPosition - vW);
    float face = abs(dot(normalize(vN), v));
    vec3 n = normalize(vL);
    vec3 col;
    float a;
    float seen;
    if (uKind == 0) {
      // its own light is seen wherever blue-green reaches; the bell only in the beam
      float own = lampSeen(0.0, vW), lit = lampLit(0.0, vW);
      float flash = pow(0.5 + 0.5 * sin(uTime * 1.3 + vSeed * 60.0), 6.0);
      float dots = smoothstep(0.8, 0.96, sin(n.x * 9.0 + vSeed * 9.0) * sin(n.z * 9.0) * 0.5 + 0.5);
      col = uTint * (own * (0.25 + 2.4 * flash) * (dots + 0.5 * pow(1.0 - face, 2.0)) + lit * 0.35);
      a = 1.0;
      seen = max(own, lit);
    } else if (uKind == 1) {
      seen = lampLit(1.0, vW);
      float bars = smoothstep(0.45, 0.55, abs(sin(n.z * 7.0 + vSeed * 20.0)));
      float eye = smoothstep(0.2, 0.14, distance(n, normalize(vec3(0.6, 0.2, 0.75))));
      col = mix(uTint * 0.35, vec3(0.8, 1.0, 0.2) * 1.2, bars) + vec3(1.0, 0.4, 0.9) * eye;
      a = 1.0;
    } else if (uKind == 2) {
      seen = lampSeen(2.0, vW);
      col = mix(vec3(1.0, 0.22, 0.04), vec3(1.0, 0.8, 0.45), face * face) * (0.35 + 1.1 * face);
      a = face * face;
    } else if (uKind == 3) {
      seen = lampSeen(3.0, vW);
      float rim = pow(1.0 - face, 1.8);
      float run = 0.6 + 0.4 * sin(vL.x * 6.0 + uTime * 0.8);
      col = uTint * (0.25 + 2.0 * rim) * run;
      a = 0.2 + 0.8 * rim;
    } else if (uKind == 5) {
      // the wall's own gas, with a will: bright along its edges, and a seam of it down the middle
      seen = lampSeen(3.0, vW);
      float rim = pow(1.0 - face, 1.6);
      float seam = smoothstep(0.12, 0.0, abs(n.x)) * (0.6 + 0.4 * sin(vL.z * 9.0 - uTime * 4.0));
      col = uTint * (0.35 + 1.8 * rim + 1.4 * seam);
      a = 0.3 + 0.7 * max(rim, seam);
    } else {
      seen = lampLit(4.0, vW);
      float soft = pow(1.0 - face, 1.5) * 0.45;
      float spine = smoothstep(0.1, 0.03, abs(n.x)) * step(n.y, 0.3);
      float ribs = smoothstep(0.07, 0.02, abs(fract(n.z * 4.0) - 0.5)) * step(abs(n.x), 0.75) * step(abs(n.z), 0.7);
      float skull = smoothstep(0.32, 0.26, distance(n, vec3(0.0, 0.0, 1.0)));
      float bone = min(1.0, spine + ribs + skull);
      col = uTint * (soft + 1.5 * bone * face);
      a = min(1.0, soft + bone * face);
    }
    if (seen < 0.004) discard;
    gl_FragColor = vec4(col * seen * a, 1.0);
  }
`;

// The eaters and the leeches: one instanced body each, moved from the CPU.
const PEST_VERT = /* glsl */ `
  attribute float aState; // eaters: how much it is drinking; leeches: 1 on the hull
  varying vec3 vW;
  varying vec3 vN;
  varying float vState;
  void main() {
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vState = aState;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const EATER_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  uniform float uTime;
  varying vec3 vW;
  varying vec3 vN;
  varying float vState;
  void main() {
    vec3 v = normalize(cameraPosition - vW);
    float rim = pow(1.0 - abs(dot(normalize(vN), v)), 2.0);
    // black, and only an edge of it catches the light it has come for
    float beam = lampBeam(vW) * uLampOn * uLampLit;
    vec3 col = uLampTint * rim * (0.9 * beam + 0.25 * lampRange(vW) * uLampOn);
    // ...until it is drinking, and then it is full of it
    col += uLampTint * vState * (0.5 + 0.5 * sin(uTime * 9.0 + vW.x)) * (0.4 + 1.2 * rim);
    gl_FragColor = vec4(col, 1.0);
  }
`;
const LEECH_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  uniform float uTime;
  varying vec3 vW;
  varying vec3 vN;
  varying float vState;
  void main() {
    // nothing in any light. In infrared: the warmth it has taken
    float seen = lampSeen(2.0, vW);
    if (seen < 0.004) discard;
    vec3 v = normalize(cameraPosition - vW);
    float face = abs(dot(normalize(vN), v));
    vec3 col = mix(vec3(0.7, 0.08, 0.02), vec3(1.0, 0.75, 0.3), vState) * (0.3 + 0.9 * face) * (0.8 + 0.2 * sin(uTime * 5.0 + vW.y));
    gl_FragColor = vec4(col * seen, 1.0);
  }
`;

const FEEDER_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  uniform float uTime;
  varying vec3 vW;
  varying vec3 vN;
  varying float vState;
  void main() {
    // dense: X-rays stop in it, so on that band it is a hard bright shape.
    // Awake, it gives some back, and then any beam finds its edge.
    vec3 v = normalize(cameraPosition - vW);
    float face = abs(dot(normalize(vN), v));
    float x = lampLit(4.0, vW);
    vec3 col = vec3(0.85, 0.9, 1.0) * x * (0.35 + 0.9 * face);
    col += vec3(0.6, 0.75, 1.0) * vState * pow(1.0 - face, 2.0) * (0.25 + 0.6 * lampBeam(vW) * uLampOn) * (0.7 + 0.3 * sin(uTime * 11.0 + vW.z));
    if (dot(col, vec3(1.0)) < 0.004) discard;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// k: { group, time, tier, schools: [{ kind, at: Vector3, range, size }], callers: [Vector3],
//      eaters: [Vector3] (their haunts), leeches: [Vector3], feeders: [Vector3], seed }
// Returns the zone's life: step it, ask it what the lamp is on, dispose it.
export function createLife(k) {
  const made = [];
  const groups = []; // what the log can find: { kind, band, at, radius, hold }
  const rnd = rng(k.seed);

  // --- the creatures ---
  const byKind = {};
  for (const sc of k.schools) (byKind[sc.kind] = byKind[sc.kind] || []).push(sc);
  for (const kind of Object.keys(byKind)) {
    const list = byKind[kind];
    const per = kind === 'line' ? 1 : kind === 'guard' ? Math.ceil(k.tier.school / 2) : k.tier.school; // (the veil is one animal, and a big one)
    const n = list.length * per;
    const geo = bodyGeometry(kind);
    const home = new Float32Array(n * 3), seed = new Float32Array(n * 4);
    for (let j = 0; j < list.length; j++) {
      const sc = list[j];
      for (let i = 0; i < per; i++) {
        const o = j * per + i;
        home[o * 3] = sc.at.x + (rnd() - 0.5) * sc.range * 0.5;
        home[o * 3 + 1] = sc.at.y + (rnd() - 0.5) * sc.range * 0.5;
        home[o * 3 + 2] = sc.at.z + (rnd() - 0.5) * sc.range * 0.5;
        seed[o * 4] = rnd();
        seed[o * 4 + 1] = kind === 'line' ? sc.range * 0.3 : sc.range * (0.25 + 0.5 * rnd());
        seed[o * 4 + 2] = (kind === 'line' ? 0.03 : kind === 'guard' ? 0.22 + 0.2 * rnd() : 0.08 + 0.14 * rnd()) * (rnd() < 0.5 ? -1 : 1);
        seed[o * 4 + 3] = sc.size * (kind === 'line' ? 1 : 0.6 + 0.8 * rnd());
      }
      groups.push({ kind, band: bandOf(LIFE[kind].band), at: sc.at, radius: sc.range + sc.size, hold: 0 });
    }
    geo.setAttribute('aHome', new THREE.InstancedBufferAttribute(home, 3));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    const band = bandOf(LIFE[kind].band);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...LAMP_U, uTime: k.time, uKind: { value: KIND[kind] }, uTint: { value: new THREE.Color(BANDS[band].tint) } },
      vertexShader: LIFE_VERT, fragmentShader: LIFE_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    k.group.add(mesh);
    made.push(mesh);
  }
  // the callers: a place and a size, and nothing to draw
  for (const p of k.callers) groups.push({ kind: 'caller', band: BAND.RADIO, at: p, radius: 400, hold: 0 });

  // --- the pests ---
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _t = new THREE.Vector3(), _e = new THREE.Euler();
  function pests(homes, count, geo, frag, scale) {
    if (!homes.length || !count) return null;
    const state = new Float32Array(count);
    geo.setAttribute('aState', new THREE.InstancedBufferAttribute(state, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({ uniforms: { ...LAMP_U, uTime: k.time }, vertexShader: PEST_VERT, fragmentShader: frag, fog: false });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    k.group.add(mesh);
    made.push(mesh);
    const bodies = [];
    for (let i = 0; i < count; i++) {
      const h = homes[i % homes.length];
      const home = new THREE.Vector3(h.x + (rnd() - 0.5) * 420, h.y + (rnd() - 0.5) * 420, h.z + (rnd() - 0.5) * 420);
      bodies.push({ home, p: home.clone(), v: new THREE.Vector3(), seed: rnd() * 100, on: 0, size: scale * (0.7 + 0.6 * rnd()), slot: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize() });
    }
    return { mesh, state, bodies };
  }
  const eaters = pests(k.eaters, k.tier.eaters, new THREE.OctahedronGeometry(1, 1).scale(1, 0.55, 1.6), EATER_FRAG, 7);
  const leeches = pests(k.leeches, k.tier.leeches, new THREE.SphereGeometry(1, 10, 6).scale(1, 0.45, 1.3), LEECH_FRAG, 3.2);
  const feeders = pests(k.feeders || [], k.tier.feeders, new THREE.DodecahedronGeometry(1, 0), FEEDER_FRAG, 5);

  // toward `to` at up to `speed`, easing: into b.v / b.p
  function seek(b, to, speed, dt) {
    _v.subVectors(to, b.p);
    const d = _v.length();
    if (d > 1e-3) _v.multiplyScalar(Math.min(speed, d * 1.5) / d);
    b.v.lerp(_v, Math.min(1, dt * 1.6));
    b.p.addScaledVector(b.v, dt);
    return d;
  }
  function write(set, i, b, t) {
    _e.set(Math.sin(t * 0.7 + b.seed) * 0.5, Math.atan2(b.v.x, b.v.z), Math.sin(t * 0.5 + b.seed * 2) * 0.4);
    set.mesh.setMatrixAt(i, _m.compose(b.p, _q.setFromEuler(_e), _s.setScalar(b.size)));
  }

  let drinking = 0, attached = 0, feeding = 0, awake = 0;

  return {
    groups,
    // Once a frame. `at`: the vessel; `speed`: how fast it is going.
    step(dt, t, at, speed) {
      drinking = 0;
      if (eaters) {
        // any lit band draws them, except the one line they cannot digest
        const bait = lampLive() && (lamp.all || (bandIsBeam(lamp.band) && lamp.band !== BAND.HALPHA));
        _t.copy(lamp.pos).addScaledVector(lamp.dir, 34); // where the beam is thickest
        for (let i = 0; i < eaters.bodies.length; i++) {
          const b = eaters.bodies[i];
          const drawn = bait && b.p.distanceTo(lamp.pos) < C.EZ_EATER_SEES;
          let d;
          if (drawn) {
            _v.copy(_t).addScaledVector(b.slot, 22); // each to its own place in it
            d = seek(b, _v, C.EZ_EATER_SPEED, dt);
          } else {
            _v.copy(b.home);
            _v.x += Math.sin(t * 0.2 + b.seed) * 90;
            _v.y += Math.sin(t * 0.17 + b.seed * 1.7) * 60;
            _v.z += Math.cos(t * 0.23 + b.seed) * 90;
            seek(b, _v, C.EZ_EATER_SPEED * 0.4, dt);
            d = Infinity;
          }
          const want = drawn && d < C.EZ_EATER_DRINK ? 1 : 0;
          b.on += (want - b.on) * Math.min(1, dt * 2);
          drinking += b.on;
          eaters.state[i] = b.on;
          write(eaters, i, b, t);
        }
        eaters.mesh.instanceMatrix.needsUpdate = true;
        eaters.mesh.geometry.attributes.aState.needsUpdate = true;
      }
      lamp.eaters = Math.min(1, drinking / C.EZ_EATER_FULL);

      attached = 0;
      if (leeches) {
        for (let i = 0; i < leeches.bodies.length; i++) {
          const b = leeches.bodies[i];
          const d0 = b.p.distanceTo(at);
          if (b.on > 0.5) {
            // on the hull: carried along, until the water tears it off
            b.grip = speed > C.EZ_LEECH_SHAKE ? (b.grip || 0) + dt : 0;
            if (b.grip > 1.2) {
              b.on = 0;
              b.grip = 0;
              b.v.copy(b.slot).multiplyScalar(30);
            } else {
              b.p.copy(at).addScaledVector(b.slot, 4.2);
              attached++;
            }
          } else if (d0 < C.EZ_LEECH_SEES && speed < C.EZ_LEECH_SHAKE) {
            _v.copy(at).addScaledVector(b.slot, 4.2);
            if (seek(b, _v, C.EZ_LEECH_SPEED, dt) < 3) b.on = 1;
          } else {
            _v.copy(b.home);
            _v.y += Math.sin(t * 0.15 + b.seed) * 80;
            seek(b, _v, C.EZ_LEECH_SPEED * 0.4, dt);
          }
          leeches.state[i] = b.on;
          write(leeches, i, b, t);
        }
        leeches.mesh.instanceMatrix.needsUpdate = true;
        leeches.mesh.geometry.attributes.aState.needsUpdate = true;
      }
      feeding = 0;
      if (feeders) {
        // X-rays in reach wake them; without any they settle after a while
        const xray = lampLive() && (lamp.all || lamp.band === BAND.XRAY);
        let near = false;
        for (let i = 0; i < feeders.bodies.length && !near; i++) near = feeders.bodies[i].p.distanceTo(lamp.pos) < C.EZ_FEEDER_SEES;
        awake = xray && near ? C.EZ_FEEDER_SLEEP : Math.max(0, awake - dt);
        _t.copy(lamp.pos).addScaledVector(lamp.dir, 26);
        for (let i = 0; i < feeders.bodies.length; i++) {
          const b = feeders.bodies[i];
          let d = Infinity;
          if (awake > 0) {
            _v.copy(_t).addScaledVector(b.slot, 20);
            d = seek(b, _v, C.EZ_FEEDER_SPEED, dt);
          } else seek(b, b.home, C.EZ_FEEDER_SPEED * 0.5, dt);
          const want = awake > 0 ? (d < 70 ? 1 : 0.4) : 0;
          b.on += (want - b.on) * Math.min(1, dt * 2);
          if (b.on > 0.7) feeding++;
          feeders.state[i] = b.on;
          write(feeders, i, b, t);
        }
        feeders.mesh.instanceMatrix.needsUpdate = true;
        feeders.mesh.geometry.attributes.aState.needsUpdate = true;
      }
      lamp.feeders = Math.min(1, feeding / 3);

      lamp.cabin = attached
        ? Math.max(0, lamp.cabin - C.EZ_CABIN_DRAIN * attached * dt)
        : Math.min(1, lamp.cabin + C.EZ_CABIN_WARM * dt);
    },
    // Is the lamp, as it is now, on this group? (The shaders' test, for a
    // school with some size to it.)
    shows(g) {
      if (!lampLive() || !(lamp.all || lamp.band === g.band)) return false;
      _v.subVectors(g.at, lamp.pos);
      const d = _v.length();
      if (g.band !== BAND.RADIO && d - g.radius > lamp.reach) return false;
      if (d < g.radius) return true; // in among them
      const ang = Math.acos(Math.min(1, _v.dot(lamp.dir) / d));
      const slack = Math.atan2(g.radius, d);
      if (g.band === BAND.RADIO) return ang < 0.32;
      return ang < (bandIsBeam(g.band) ? C.EZ_LAMP_CONE : 1.0) + slack;
    },
    // how nearly the lamp points at a caller, 0..1 (the radio band's sound)
    radioNear() {
      let near = 0;
      for (const g of groups) {
        if (g.band !== BAND.RADIO) continue;
        _v.subVectors(g.at, lamp.pos).normalize();
        near = Math.max(near, (_v.dot(lamp.dir) - 0.55) / 0.45);
      }
      return near;
    },
    drinking: () => drinking,
    attached: () => attached,
    feeding: () => feeding,
    dispose() {
      for (const m of made) {
        k.group.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      }
    },
    info: () => ({
      groups: groups.map((g) => ({ kind: g.kind, band: BANDS[g.band].id, at: g.at.toArray().map(Math.round), radius: Math.round(g.radius) })),
      eaters: eaters ? eaters.bodies.length : 0, leeches: leeches ? leeches.bodies.length : 0, feeders: feeders ? feeders.bodies.length : 0,
      drinking: +drinking.toFixed(2), attached, feeding, awake: +awake.toFixed(1),
      feederAt: feeders ? feeders.bodies[0].p.toArray().map(Math.round) : null,
      eaterAt: eaters ? eaters.bodies[0].p.toArray().map(Math.round) : null,
      leechAt: leeches ? leeches.bodies[0].p.toArray().map(Math.round) : null,
    }),
  };
}
