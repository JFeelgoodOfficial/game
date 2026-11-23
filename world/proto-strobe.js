// Prototype: a battle lit only by a pulsar's beam (GDD 5.7.10). A test scene,
// reached only through `__debug.proto.strobe` (src/protoLazy.js). It is in no
// story.
//
// The look a later season needs: a fleet action with no light of its own. A
// pulsar stands off to one side, and its beam comes round like a lighthouse's.
// Each time it crosses the field every hull in it is lit for an instant, hard
// and from one side; then it is dark; and the next crossing shows what has
// changed in between: hulls have moved, some are gone, and where they were
// there is wreckage. The battle is seen as a run of stills.
//
// Nothing in the scene emits. Hulls and wreckage are drawn black except for
// what the beam puts on them (HULL_FRAG: one term, the beam's, times how the
// face stands to the pulsar). The running lights the fleet's ships carry in
// the game (world/warships.js `glow`) are drawn at GLINT of themselves (below),
// which is nothing unless a tuner wants them. The beam itself shows as a faint
// shaft as it swings by, as a searchlight's does in dusty air.
//
// The hulls are the game's own (world/warships.js shipClasses(): each
// faction's warship and freighter), as stand-ins, instanced here. The game's
// live fleets (src/fleets.js) are not touched or moved.
//
// Physics, and where it is left. Real: a pulsar is a spinning neutron star
// whose radio (and for some, optical and X-ray) emission leaves in beams from
// its magnetic poles; the magnetic axis is tilted from the spin axis, so a
// beam sweeps a cone, and anything it crosses is lit once a turn: the
// lighthouse effect. A second, weaker crossing from the other pole (an
// interpulse) is seen from some; here the other pole's cone is taken to miss
// the field, and is not drawn. Licence, all of it marked here:
//   - The rate. A millisecond pulsar turns hundreds of times a second, and
//     even a slow one about once (the Crab: thirty times), each pulse a few
//     per cent of the turn: far too fast and too brief to see as separate
//     flashes. This one is slowed to STROBE_RATE (0.5) sweeps a second, one
//     flash every two seconds, and its beam widened (STROBE_WIDTH) until the
//     flash lasts about a tenth of a second, so that each sweep is its own
//     still and there is time in the dark for the battle to change.
//   - Photosensitivity. Flashing above about three a second is a known
//     seizure risk, so the rate is clamped to STROBE_MAX_RATE (3) whatever is
//     asked for, the default is well under it, and `set({ soft: true })` is a
//     gentler mode: a wider beam, a lower peak, and never fully dark between.
//   - Brightness. A real pulsar's beam is not a searchlight in visible light,
//     and there is nothing in a vacuum for a shaft to show in.

import * as THREE from 'three';
import { C, STROBE_TIER } from '../src/constants.js';
import { mulberry32 } from '../src/noise2.js';
import { shipClasses } from './warships.js';

const GLINT = 0.0; // how much of a hull's own running lights is drawn (STROBE_GLINT, kept here: it is a switch, not a dial)

const BEAM_GLSL = /* glsl */ `
  uniform vec3 uPulsar;
  uniform vec3 uBeam;
  uniform float uWidth;
  uniform float uPeak;
  uniform float uFloor;
  // how much of the beam falls on p: a narrow cone about its axis, from the pulsar
  float beamOn(vec3 p) {
    vec3 d = normalize(p - uPulsar);
    float c = clamp(dot(d, uBeam), -1.0, 1.0);
    float ang = acos(c);
    return uPeak * exp(-(ang * ang) / (uWidth * uWidth)) + uFloor;
  }
`;
const HULL_VERT = /* glsl */ `
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vC;
  void main() {
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    #ifdef USE_COLOR
      vC = color;
    #else
      vC = vec3(0.6);
    #endif
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const HULL_FRAG = /* glsl */ `
  ${BEAM_GLSL}
  uniform float uOwn;
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vC;
  void main() {
    vec3 L = normalize(uPulsar - vW);
    vec3 n = normalize(vN);
    // one light, from one side: the far side of every hull stays black
    float diff = max(dot(n, L), 0.0);
    float lit = beamOn(vW) * (0.03 + 0.97 * diff);
    // (the hulls' own paint is dark; a little of the beam's own blue-white comes off any surface)
    vec3 alb = mix(vC, vec3(0.5, 0.56, 0.66), 0.3);
    gl_FragColor = vec4(alb * lit + vC * uOwn, 1.0);
  }
`;
// The beam, seen. Not a cone of geometry: for each pixel, how near its line of
// sight passes to the beam's axis, as an angle at the pulsar, and
// a falloff across the beam like the one that lights the hulls. Drawn over the whole
// view, added; when the beam crosses the camera itself the view whitens.
const SHAFT_VERT = /* glsl */ `
  varying vec3 vD;
  void main() {
    vD = position;
    gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
  }
`;
const SHAFT_FRAG = /* glsl */ `
  uniform vec3 uPulsar;
  uniform vec3 uBeam;
  uniform float uWidth;
  uniform float uK;
  uniform float uReach;
  varying vec3 vD;
  // how much beam there is at q (from the pulsar). One pole only: the other's
  // cone, tilted as it is, passes clear of the field and of the eye.
  float inBeam(vec3 q) {
    float ax = dot(q, uBeam);
    float ang = length(q - uBeam * ax) / max(abs(ax), 1.0);
    float g = exp(-(ang * ang) / (uWidth * uWidth * 0.5)) * smoothstep(0.0, uReach * 0.03, ax);
    return g / (1.0 + abs(ax) / uReach);
  }
  void main() {
    vec3 d = normalize(vD);
    vec3 w = cameraPosition - uPulsar;
    float b = dot(d, uBeam), dd = dot(d, w), e = dot(uBeam, w);
    float t = max((b * e - dd) / max(1.0 - b * b, 1e-3), 0.0);
    // where the line of sight is nearest the axis...
    float g = inBeam(w + d * t);
    // ...and a few points along it besides: looking down the beam there is no one nearest point
    float far = length(w) * 1.5;
    for (int i = 0; i < 4; i++) g = max(g, inBeam(w + d * far * (float(i) + 0.5) / 4.0));
    vec3 near = w + d * max(-dd, 0.0); // (and round the pulsar itself, where the cone has no width yet)
    g = max(g, 0.8 * exp(-dot(near, near) / (uReach * uReach * 0.002)));
    gl_FragColor = vec4(vec3(0.7, 0.84, 1.0) * g * uK, 1.0);
  }
`;

function glowTexture() {
  const n = 64, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2);
    const a = Math.max(0, 1 - r);
    const i = (y * n + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = Math.round(255 * a * a * a);
  }
  const tex = new THREE.DataTexture(data, n, n);
  tex.needsUpdate = true;
  return tex;
}

// env: { renderer, tier }
export function createStrobeProto(env) {
  const { renderer } = env;
  const T = STROBE_TIER[env.tier] || STROBE_TIER.medium;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 5, 200000);
  const FR = C.STROBE_FIELD_R * (T.field || 1);

  // --- the pulsar, and the frame its beam turns in ---
  const pulsarAt = new THREE.Vector3(-0.74, 0.3, -0.6).normalize().multiplyScalar(C.STROBE_PULSAR_DIST);
  const toField = pulsarAt.clone().multiplyScalar(-1).normalize();
  const spinAxis = new THREE.Vector3(0.15, 1, 0.1).projectOnPlane(toField).normalize(); // (the beam's cone is cut where it crosses the field: near enough a plane there)
  const sweepDir = new THREE.Vector3().crossVectors(spinAxis, toField).normalize();
  const beamDir = toField.clone();
  const U = {
    uPulsar: { value: pulsarAt }, uBeam: { value: beamDir }, uWidth: { value: C.STROBE_WIDTH }, uPeak: { value: C.STROBE_PEAK }, uFloor: { value: 0 },
  };

  // --- the sky: stars, faint, so the dark is somewhere ---
  {
    const rng = mulberry32(0x57a25);
    const n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize().multiplyScalar(120000);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x55607a, size: 1.6, sizeAttenuation: false, fog: false }));
    pts.frustumCulled = false;
    scene.add(pts);
  }
  const tex = glowTexture();
  const pulsar = new THREE.Sprite(new THREE.SpriteMaterial({ color: new THREE.Color(0.75, 0.86, 1.0), map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  pulsar.position.copy(pulsarAt);
  pulsar.scale.setScalar(700);
  scene.add(pulsar);
  // the beam, seen (SHAFT_FRAG)
  const shaftK = { value: C.STROBE_SHAFT };
  {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1000, 2), new THREE.ShaderMaterial({
      uniforms: { uPulsar: U.uPulsar, uBeam: U.uBeam, uWidth: U.uWidth, uK: shaftK, uReach: { value: C.STROBE_PULSAR_DIST } },
      vertexShader: SHAFT_VERT, fragmentShader: SHAFT_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.BackSide, fog: false,
    }));
    m.frustumCulled = false;
    m.renderOrder = 20;
    scene.add(m);
  }

  // --- the hulls: the game's own classes, instanced ---
  const classes = shipClasses();
  const kinds = [];
  for (const f of Object.keys(classes)) for (const k of ['warship', 'freighter']) kinds.push({ f, cls: classes[f][k], side: f === 'wavemall prime' ? 1 : 0 });
  const per = Math.ceil(T.ships / kinds.length);
  const hullMat = () => new THREE.ShaderMaterial({ uniforms: { ...U, uOwn: { value: 0 } }, vertexShader: HULL_VERT, fragmentShader: HULL_FRAG, vertexColors: true, fog: false });
  const ownMat = () => new THREE.ShaderMaterial({ uniforms: { ...U, uOwn: { value: GLINT } }, vertexShader: HULL_VERT, fragmentShader: HULL_FRAG.replace('vC * lit + vC * uOwn', 'vC * uOwn'), vertexColors: true, fog: false });
  const ships = [];
  for (const k of kinds) {
    k.lit = new THREE.InstancedMesh(k.cls.lit, hullMat(), per);
    k.lit.frustumCulled = false;
    scene.add(k.lit);
    if (GLINT > 0) {
      k.glow = new THREE.InstancedMesh(k.cls.glow, ownMat(), per);
      k.glow.frustumCulled = false;
      scene.add(k.glow);
    }
  }
  // wreckage: what a hull that was there one sweep is, the next
  const PIECES = Math.round(C.STROBE_DEBRIS);
  const MAXD = Math.min(1600, T.ships * PIECES);
  const debrisMesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), new THREE.ShaderMaterial({ uniforms: { ...U, uOwn: { value: 0 } }, vertexShader: HULL_VERT, fragmentShader: HULL_FRAG, fog: false }), MAXD);
  debrisMesh.frustumCulled = false;
  scene.add(debrisMesh);
  const debris = [];
  let debrisNext = 0;

  let rng = mulberry32(0x9015a2);
  function spawn(s, fresh) {
    const side = s.kind.side;
    // each side holds its own half of the field, and is going at the other
    s.pos.set((side ? 1 : -1) * (fresh ? FR * (0.9 + 0.2 * rng()) : FR * (0.15 + 0.85 * rng())), (rng() - 0.5) * FR * 0.45, (rng() - 0.5) * FR * 1.3);
    s.head.set(side ? -1 : 1, (rng() - 0.5) * 0.16, (rng() - 0.5) * 0.5).normalize();
    s.speed = C.STROBE_SHIP_SPEED * (0.6 + 0.8 * rng());
    s.roll = (rng() - 0.5) * 0.5;
    s.alive = true;
  }
  function reset() {
    rng = mulberry32(0x9015a2);
    ships.length = 0;
    debris.length = 0;
    debrisNext = 0;
    let n = 0;
    for (let i = 0; i < per; i++) for (const k of kinds) {
      if (n >= T.ships) break;
      const s = { kind: k, slot: i, pos: new THREE.Vector3(), head: new THREE.Vector3(), speed: 0, roll: 0, alive: true };
      spawn(s, false);
      ships.push(s);
      n++;
    }
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _v = new THREE.Vector3();
  const NONE = new THREE.Matrix4().makeScale(0, 0, 0);
  function place() {
    for (const k of kinds) for (let i = 0; i < per; i++) {
      k.lit.setMatrixAt(i, NONE);
      if (k.glow) k.glow.setMatrixAt(i, NONE);
    }
    for (const s of ships) {
      if (!s.alive) continue;
      _q.setFromUnitVectors(_z, s.head).multiply(_q2.setFromAxisAngle(_z, s.roll));
      _m.compose(s.pos, _q, _s.setScalar(1));
      s.kind.lit.setMatrixAt(s.slot, _m);
      if (s.kind.glow) s.kind.glow.setMatrixAt(s.slot, _m);
    }
    for (const k of kinds) {
      k.lit.instanceMatrix.needsUpdate = true;
      if (k.glow) k.glow.instanceMatrix.needsUpdate = true;
    }
    for (let i = 0; i < MAXD; i++) {
      const d = debris[i];
      if (d && d.on) debrisMesh.setMatrixAt(i, _m.compose(d.pos, _q.setFromAxisAngle(d.axis, d.a), _s.setScalar(d.k)));
      else debrisMesh.setMatrixAt(i, NONE);
    }
    debrisMesh.instanceMatrix.needsUpdate = true;
  }
  function move(dt) {
    for (const s of ships) {
      if (!s.alive) continue;
      s.pos.addScaledVector(s.head, s.speed * dt);
      // through the other side's line and out: come about
      if (Math.abs(s.pos.x) > FR * 1.15) {
        s.head.x = -Math.sign(s.pos.x) * Math.abs(s.head.x);
        s.pos.x = Math.sign(s.pos.x) * FR * 1.15;
      }
    }
    for (const d of debris) {
      if (!d || !d.on) continue;
      d.pos.addScaledVector(d.vel, dt);
      d.a += d.spin * dt;
    }
  }
  // what happens in the dark between one sweep and the next
  function strike() {
    sweeps++;
    const alive = ships.filter((s) => s.alive);
    for (const s of alive) {
      if (rng() >= P.loss) continue;
      s.alive = false;
      for (let j = 0; j < PIECES; j++) {
        const i = debrisNext++ % MAXD;
        const d = debris[i] || (debris[i] = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), axis: new THREE.Vector3(), a: 0, spin: 0, k: 1, on: false, born: 0 });
        d.pos.copy(s.pos).add(_v.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(260));
        d.vel.copy(s.head).multiplyScalar(s.speed * 0.5).add(_v.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(170));
        d.axis.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
        d.spin = (rng() - 0.5) * 3;
        d.k = 14 + rng() * rng() * 70;
        d.on = true;
        d.born = sweeps;
      }
    }
    // old wreckage has drifted off; and each side sends more in, so there is always a battle
    for (const d of debris) if (d && d.on && sweeps - d.born > 14) d.on = false;
    if (ships.filter((s) => s.alive).length < T.ships * 0.55) {
      for (const s of ships) {
        if (!s.alive && rng() < 0.35) spawn(s, true);
      }
    }
  }

  // --- state ---
  const P = { rate: C.STROBE_RATE, soft: false, hold: null, orbit: true, angle: 0.9, dist: FR * 1.25, height: FR * 0.26, loss: C.STROBE_LOSS };
  let phase = Math.PI, sweeps = 0, t = 0, frames = 0, fps = 0, fpsT = 0, fpsN = 0, litNow = 0;
  const rate = () => Math.min(C.STROBE_MAX_RATE, Math.max(0.05, P.rate));
  const _size = new THREE.Vector2();
  reset();
  place();

  function aim() {
    // the beam's axis, from the phase: across the field's middle at phase 0
    beamDir.copy(toField).multiplyScalar(Math.cos(phase)).addScaledVector(sweepDir, Math.sin(phase)).normalize();
    U.uWidth.value = P.soft ? C.STROBE_SOFT_WIDTH : C.STROBE_WIDTH;
    U.uPeak.value = P.soft ? C.STROBE_SOFT_PEAK : C.STROBE_PEAK;
    U.uFloor.value = P.soft ? C.STROBE_SOFT_FLOOR : 0;
    const ang = Math.acos(Math.min(1, Math.max(-1, beamDir.dot(toField))));
    litNow = Math.exp(-(ang * ang) / (U.uWidth.value * U.uWidth.value));
  }

  function frame(dt, render) {
    t += dt;
    frames++;
    fpsT += dt;
    fpsN++;
    if (fpsT >= 1) {
      fps = fpsN / fpsT;
      fpsT = fpsN = 0;
    }
    move(dt);
    if (P.hold == null) {
      phase += Math.PI * 2 * rate() * dt;
      if (phase > Math.PI) {
        // (the beam is on the far side of its turn: this is the dark the battle moves in)
        phase -= Math.PI * 2;
        strike();
      }
    } else phase = P.hold;
    aim();
    place();
    if (P.orbit) P.angle += C.STROBE_ORBIT * dt;
    camera.position.set(Math.cos(P.angle) * P.dist, P.height, Math.sin(P.angle) * P.dist);
    camera.lookAt(0, 0, 0);
    const target = renderer.getRenderTarget();
    if (target) _size.set(target.width, target.height);
    else renderer.getDrawingBufferSize(_size);
    camera.aspect = _size.x / _size.y;
    camera.updateProjectionMatrix();
    render(scene, camera);
  }

  const state = () => ({
    tier: env.tier, ships: ships.length, alive: ships.filter((s) => s.alive).length, debris: debris.filter((d) => d && d.on).length, sweeps,
    rate: +rate().toFixed(2), asked: P.rate, maxRate: C.STROBE_MAX_RATE, soft: P.soft, hold: P.hold, phase: +phase.toFixed(3), lit: +litNow.toFixed(3),
    width: U.uWidth.value, peak: U.uPeak.value, floor: U.uFloor.value, frames, fps: +fps.toFixed(1), first: ships[0] ? ships[0].pos.toArray().map(Math.round) : null,
  });

  return {
    frame,
    enter(d) {
      d.renderer.toneMappingExposure = C.STROBE_EXPOSURE;
      d.bloom.threshold = C.STROBE_BLOOM_T;
      d.bloom.strength = C.STROBE_BLOOM_S;
    },
    leave() {},
    // o: { rate (clamped to STROBE_MAX_RATE), soft: bool, hold: true | false | a phase in radians (0: the beam on the field's
    //      middle), orbit: bool, angle, dist, height, loss, shaft, reset: true }
    set(o) {
      if (Number.isFinite(o.rate)) P.rate = o.rate;
      if (typeof o.soft === 'boolean') P.soft = o.soft;
      if (o.hold === true) P.hold = 0;
      else if (o.hold === false || o.hold === null) P.hold = null;
      else if (Number.isFinite(o.hold)) P.hold = o.hold;
      if (typeof o.orbit === 'boolean') P.orbit = o.orbit;
      for (const k of ['angle', 'dist', 'height', 'loss']) if (Number.isFinite(o[k])) P[k] = o[k];
      if (Number.isFinite(o.shaft)) shaftK.value = o.shaft;
      if (o.reset) {
        reset();
        sweeps = 0;
      }
      aim();
      place();
      return state();
    },
    // n sweeps' worth of battle at once (what the dark hides), without waiting for them
    step(n = 1) {
      const period = 1 / rate();
      for (let i = 0; i < Math.max(1, Math.floor(n)); i++) {
        move(period);
        strike();
      }
      place();
      return state();
    },
    state,
  };
}
