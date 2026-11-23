// Under the Ice: the ocean (GDD 5.7.9; Season 1, chapter 3).
//
// Under four kilometres of ice, a sea kept liquid by the planet's own core,
// with no light in it that the vessel did not bring. The vessel is Entry
// Zero's (world/submersible.js), and is flown the same way:
//
//   W / S         ahead / astern          Space / Shift   rise / sink
//   A / D         sideways                mouse           turn
//   Q / E         the lamp's band         L               lamp
//   1 / 2 / 3     the hull sounder: low, mid, high (or the three pads)
//
// Sight is not much use. The people who live here (ICE.people) talk on the 21
// cm band, which the lamp only hears (src/lamp.js): on that band the signal is
// loudest along the way the vessel points, and that is how anything is found.
//
//   the first one   Found by ear. It stops; then it calls in three notes, and
//                   the call is given back on the sounder, three times, longer
//                   each time (ICE_PHRASES). That is the whole of first contact.
//   the vents       The others come, and lead: to where they live, on the warm
//                   chimneys of the sea floor, and then up to the thinnest ice
//                   they know, which to them is the top of the world.
//   the choice      SHOW: nose up under the thin ice until it opens. The sea
//                   rushes up the hole and the vessel has to be pulled clear
//                   of it or go with it. LEAVE: the bore is freezing shut; get
//                   back to it in time, and take nothing.
//   the event       They learn they are not alone, either way (src/
//                   fixedEvents.js `contact`): now, from the pilot, or later,
//                   from whoever listens next.
//
// The science. Real: rogue planets; an ocean kept liquid under ice by
// radiogenic heat with no star at all; life on hydrothermal vents, fed by
// chemistry and not by light; water exposed to vacuum boiling and freezing
// into a plume. The 21 cm line is hydrogen's, and cold ice does pass radio at
// that wavelength for kilometres. Stretched: liquid water does not. Even
// fresh water swallows 1.4 GHz within a few centimetres, so a people could not
// talk across an ocean on it, and a hole held open by a warm plume would in
// truth skin over with ice. Both are licence.
//
// A site for the platform walker (src/capitalWalk.js), walked under the pause
// (look `dive`), reached by the door `ice:down` and left by `ice:up`.

import * as THREE from 'three';
import { C, CH_TIER, ICE_PHRASES, ICE_NOTES, ICE_PLACES } from '../src/constants.js';
import { Q } from '../src/quality.js';
import { sun } from '../src/sun.js';
import { input, moveAxes } from '../src/input.js';
import { cWalk } from '../src/capitalWalk.js';
import { openDialogue, isDialogueOpen } from '../src/dialogue.js';
import { chapterHud } from '../src/chapterHud.js';
import { lampHud } from '../src/lampHud.js';
import { lamp, LAMP_U, LAMP_GLSL, BAND, nextBand, toggleLamp, stepLamp, lampLive, resetLamp, lampState } from '../src/lamp.js';
import { setMusicArea } from '../src/music.js';
import { uiSound, chime, setEventRumble } from '../src/sfx.js';
import { mulberry32 } from '../src/noise2.js';
import { tint, box, mergedMesh, floorOf } from './capital.js';
import { BEAM_VERT, BEAM_FRAG } from './submersible.js';
import { setHum, bandClick, setRadio, hullTick, logChime, setRoar, hush } from './entryzero-audio.js';
import { createSceneClock, crewSay, crewSpeaker } from './sceneClock.js';
import { ICE } from './ice-dialogue.js';

const ZERO = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const KEY = 'ch3.decision';
const FLOOR = -C.ICE_DEPTH;
const FIRST = new THREE.Vector3(ICE_PLACES.first[0], ICE_PLACES.first[1], ICE_PLACES.first[2]);
const CITY = new THREE.Vector3(ICE_PLACES.city[0], FLOOR + 90, ICE_PLACES.city[1]);
const ROOF = new THREE.Vector3(ICE_PLACES.roof[0], 0, ICE_PLACES.roof[1]);
const UNDER = new THREE.Vector3(ROOF.x, -95, ROOF.z); // where the vessel is brought to, under the thin ice
const BOX = 520;
const LIMIT = 3600; // the sea goes on; the vessel does not
const ease = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
// the underside of the ice, and the sea floor (one function each, for the meshes and the hull)
const hash = (x, z) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const bump = (x, z, f) => {
  const xi = Math.floor(x * f), zi = Math.floor(z * f), fx = x * f - xi, fz = z * f - zi;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  return (hash(xi, zi) * (1 - sx) + hash(xi + 1, zi) * sx) * (1 - sz) + (hash(xi, zi + 1) * (1 - sx) + hash(xi + 1, zi + 1) * sx) * sz;
};
function ceilY(x, z) {
  // thick and hanging everywhere, worn smooth and high at the bore and at the roof
  const clear = Math.min(1, Math.hypot(x, z) / 160) * Math.min(1, Math.hypot(x - ROOF.x, z - ROOF.z) / 220);
  return -(bump(x, z, 0.004) * 46 + bump(x, z, 0.019) * 12) * clear;
}
function floorY(x, z) {
  const mound = Math.max(0, 1 - Math.hypot(x - CITY.x, z - CITY.z) / 520);
  return FLOOR + bump(x, z, 0.003) * 60 + bump(x, z, 0.02) * 9 + mound * mound * 70;
}

const WORLD_VERT = /* glsl */ `
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const NOISE = /* glsl */ `
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
  }
`;
// The underside of the ice. Dark, until the beam is on it; and at one place, thin.
const ICE_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  ${NOISE}
  uniform float uTime;
  uniform vec3 uRoof;
  uniform float uMelt;
  uniform float uOpen;
  uniform float uHole;
  varying vec3 vW;
  void main() {
    vec2 q = vW.xz;
    float d = distance(q, uRoof.xz);
    // the hole: through it, the sky
    if (d < uHole * uOpen) {
      vec2 g = floor((q - uRoof.xz) * 1.4);
      float star = step(0.965, h21(g)) * (0.5 + 0.5 * h21(g + 7.0));
      gl_FragColor = vec4(vec3(0.01, 0.014, 0.03) + vec3(0.9, 0.95, 1.0) * star, 1.0);
      return;
    }
    float grain = 0.55 + 0.45 * vnoise(q * 0.05) + 0.3 * (vnoise(q * 0.4) - 0.5);
    float vein = smoothstep(0.0, 0.05, abs(vnoise(q * 0.012 + 4.0) - 0.5));
    vec3 ice = vec3(0.5, 0.78, 0.95) * grain * (0.5 + 0.5 * vein);
    vec3 col = ice * 0.006;
    col += ice * uLampTint * lampBeam(vW) * uLampOn * uLampLit * 1.3;
    // thin ice lets a little of the sky's own light through: nothing an eye would call light
    float thin = 1.0 - smoothstep(60.0, 240.0, d);
    col += vec3(0.1, 0.16, 0.26) * thin * thin * (0.06 + 0.5 * uMelt);
    // ...and where the hull's heat is on it, it glows, and runs
    float hot = (1.0 - smoothstep(0.0, uHole * 1.6, d)) * uMelt;
    col += vec3(1.0, 0.55, 0.25) * hot * (0.6 + 0.4 * sin(uTime * 9.0 + d));
    float rim = (1.0 - smoothstep(uHole, uHole * 1.5, d)) * uOpen;
    col += vec3(0.6, 0.85, 1.0) * rim * 0.5;
    gl_FragColor = vec4(col, 1.0);
  }
`;
// The sea floor: silt, and the vents' own dull glow where the rock is hot.
const BED_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  ${NOISE}
  uniform float uTime;
  uniform vec3 uCity;
  varying vec3 vW;
  void main() {
    vec2 q = vW.xz;
    float grain = 0.5 + 0.5 * vnoise(q * 0.07) + 0.3 * (vnoise(q * 0.6) - 0.5);
    vec3 silt = vec3(0.34, 0.3, 0.26) * grain;
    float near = 1.0 - smoothstep(120.0, 560.0, distance(q, uCity.xz));
    vec3 col = silt * 0.004;
    col += silt * uLampTint * lampBeam(vW) * uLampOn * uLampLit * 1.4;
    float seam = smoothstep(0.08, 0.0, abs(vnoise(q * 0.02 + 11.0) - 0.5)) * near;
    col += vec3(1.0, 0.3, 0.06) * seam * (0.12 + 0.05 * sin(uTime * 1.3 + q.x * 0.05));
    col += vec3(1.0, 0.4, 0.1) * lampBand(2.0) * (near * 0.25 + seam * 0.9) * lampRange(vW);
    gl_FragColor = vec4(col, 1.0);
  }
`;
// A chimney, and the garden on it.
const TOWER_VERT = /* glsl */ `
  attribute float aSeed;
  varying vec3 vW;
  varying vec3 vL;
  varying vec3 vN;
  varying float vSeed;
  void main() {
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vL = position;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vSeed = aSeed;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const TOWER_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  ${NOISE}
  uniform float uTime;
  varying vec3 vW;
  varying vec3 vL;
  varying vec3 vN;
  varying float vSeed;
  void main() {
    float course = step(0.12, fract(vL.y * 6.0)); // cut and stacked, course on course
    vec3 stone = vec3(0.3, 0.27, 0.25) * (0.6 + 0.4 * vnoise(vW.xy * 0.3)) * (0.7 + 0.3 * course);
    vec3 col = stone * 0.01;
    col += stone * uLampTint * lampLit(0.0, vW) * 1.5;
    // the garden: things that make their own light, in bands up the stone
    float a = atan(vL.z, vL.x);
    float bed = smoothstep(0.55, 0.9, vnoise(vec2(a * 2.2 + vSeed * 30.0, vL.y * 9.0)));
    vec3 glow = mix(vec3(0.1, 0.9, 0.7), vec3(0.5, 0.4, 1.0), fract(vSeed * 7.0));
    col += glow * bed * (0.22 + 0.1 * sin(uTime * 1.6 + vSeed * 40.0 + vL.y * 5.0));
    // ultraviolet: the gardens fluoresce
    col += glow * bed * lampLit(1.0, vW) * 1.6;
    // the mouth of it, hot: seen in the infrared, and a little without
    float mouth = smoothstep(0.86, 1.0, vL.y);
    col += vec3(1.0, 0.35, 0.08) * mouth * (0.25 + 1.2 * lampSeen(2.0, vW));
    gl_FragColor = vec4(col, 1.0);
  }
`;
// One of them: a bell, and what hangs from it. The rim lights as it calls.
const CALLER_VERT = /* glsl */ `
  attribute float aCall;
  attribute float aSeed;
  uniform float uTime;
  varying vec3 vW;
  varying vec3 vN;
  varying float vCall;
  varying float vY;
  varying float vSeed;
  void main() {
    vec3 p = position;
    // it swims by closing the bell, and the trailing arms follow late
    float beat = sin(uTime * 2.1 + aSeed * 40.0);
    float low = clamp(-p.y / 6.0, 0.0, 1.0);
    p.xz *= 1.0 + 0.16 * beat * (1.0 - low) - 0.1 * beat * low;
    p.x += sin(uTime * 1.7 + p.y * 0.8 + aSeed * 20.0) * 0.5 * low;
    vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vCall = aCall;
    vY = position.y;
    vSeed = aSeed;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const CALLER_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  uniform float uTime;
  varying vec3 vW;
  varying vec3 vN;
  varying float vCall;
  varying float vY;
  varying float vSeed;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vW);
    float rimK = pow(1.0 - abs(dot(n, v)), 2.0);
    vec3 body = vec3(0.5, 0.62, 0.7);
    vec3 col = body * 0.012 + body * rimK * 0.05;
    col += body * uLampTint * lampLit(0.0, vW) * (0.35 + 0.65 * rimK);
    // the calling organ: a ring at the bell's lip. It lights when it speaks.
    float lip = smoothstep(0.9, 0.0, abs(vY + 0.3));
    vec3 voice = mix(vec3(0.3, 0.8, 1.0), vec3(0.9, 0.7, 1.0), fract(vSeed * 5.0));
    col += voice * lip * (0.1 + 1.5 * vCall);
    col += voice * rimK * vCall * 0.5;
    // warm, a little, to the infrared
    col += vec3(1.0, 0.4, 0.12) * lampSeen(2.0, vW) * 0.5;
    gl_FragColor = vec4(col, 1.0);
  }
`;
const MOTE_VERT = /* glsl */ `
  ${LAMP_GLSL}
  uniform vec3 uAt;
  uniform float uBox;
  uniform float uTime;
  uniform vec3 uDrift;
  attribute float aSeed;
  varying float vLit;
  void main() {
    vec3 p = position * uBox;
    p.y -= uTime * (0.4 + 0.9 * aSeed); // marine snow: it falls
    p += uDrift * (0.6 + 0.8 * aSeed);
    p = mod(p - uAt + 0.5 * uBox, uBox) - 0.5 * uBox + uAt;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    float edge = 1.0 - smoothstep(0.4 * uBox, 0.5 * uBox, length(p - uAt));
    vLit = (0.01 + lampBeam(p) * uLampOn * uLampLit) * edge;
    gl_PointSize = clamp(330.0 * (0.5 + aSeed) / max(-mv.z, 1.0), 1.0, 7.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const MOTE_FRAG = /* glsl */ `
  uniform vec3 uLampTint;
  varying float vLit;
  void main() {
    float a = 1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(mix(vec3(0.5, 0.6, 0.7), uLampTint, 0.8) * vLit * a, 1.0);
  }
`;

// ctx: the system's (world/ice-system.js). story: { stage(), reached(s), advance(s), revert(s) }
export function createIceOcean(ctx, story) {
  const { chapter, season, fixed } = ctx;
  const group = new THREE.Group();
  group.visible = false;
  ctx.scene.add(group);
  const time = { value: 0 };
  const tier = CH_TIER[Q.tier] || CH_TIER.medium;

  // --- the ice overhead, the bore through it, the sea floor ---
  const iceU = { ...LAMP_U, uTime: time, uRoof: { value: ROOF }, uMelt: { value: 0 }, uOpen: { value: 0 }, uHole: { value: C.ICE_HOLE_R } };
  const span = 7600;
  const sheet = (fn, cx, cz, seg) => {
    const g = new THREE.PlaneGeometry(span, span, seg, seg).rotateX(-Math.PI / 2).translate(cx, 0, cz);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, fn(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    return g;
  };
  const mid = [(ROOF.x + FIRST.x) / 2, (CITY.z + 0) / 2];
  const ice = new THREE.Mesh(sheet(ceilY, mid[0], mid[1], 150), new THREE.ShaderMaterial({ uniforms: iceU, vertexShader: WORLD_VERT, fragmentShader: ICE_FRAG, side: THREE.DoubleSide, fog: false }));
  const bed = new THREE.Mesh(sheet(floorY, mid[0], mid[1], 130), new THREE.ShaderMaterial({ uniforms: { ...LAMP_U, uTime: time, uCity: { value: CITY } }, vertexShader: WORLD_VERT, fragmentShader: BED_FRAG, fog: false }));
  // the bore: a shaft of meltwater up through the ice, lit from the top by the pad
  const BORE_H = 420, BORE_RAD = 24;
  const bore = new THREE.Mesh(
    new THREE.CylinderGeometry(BORE_RAD, BORE_RAD, BORE_H, 40, 1, true).translate(0, BORE_H / 2 - 4, 0),
    new THREE.ShaderMaterial({ uniforms: iceU, vertexShader: WORLD_VERT, fragmentShader: ICE_FRAG.replace('if (d < uHole * uOpen) {', 'if (false) {'), side: THREE.BackSide, fog: false }),
  );
  const boreLight = new THREE.Mesh(
    new THREE.CylinderGeometry(BORE_RAD * 0.9, BORE_RAD * 1.6, 260, 32, 1, true).translate(0, -120, 0),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.75, 1.0), transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  boreLight.renderOrder = 4;
  const boreRing = new THREE.Mesh(new THREE.TorusGeometry(BORE_RAD, 1.4, 8, 56).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.6, 2.0), fog: false }));
  // the sky's light down the hole, once there is one
  const skyShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(C.ICE_HOLE_R * 0.9, C.ICE_HOLE_R * 2.4, 420, 32, 1, true).translate(ROOF.x, -206, ROOF.z),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.7, 1.0), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  skyShaft.renderOrder = 4;
  for (const m of [ice, bed, bore, boreLight, boreRing, skyShaft]) {
    m.frustumCulled = false;
    group.add(m);
  }

  // --- where they live: chimneys on the warm rock ---
  const TOWERS = 46;
  const towerGeo = new THREE.CylinderGeometry(0.42, 1, 1, 10, 6, true).translate(0, 0.5, 0);
  const tSeed = new Float32Array(TOWERS);
  const towers = new THREE.InstancedMesh(towerGeo, new THREE.ShaderMaterial({ uniforms: { ...LAMP_U, uTime: time }, vertexShader: TOWER_VERT, fragmentShader: TOWER_FRAG, side: THREE.DoubleSide, fog: false }), TOWERS);
  {
    const rng = mulberry32(0x1ce01);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (let i = 0; i < TOWERS; i++) {
      const a = rng() * Math.PI * 2, r = 30 + Math.sqrt(rng()) * 330;
      const x = CITY.x + Math.cos(a) * r, z = CITY.z + Math.sin(a) * r;
      const h = 40 + rng() * rng() * 190 * (1 - r / 420), w = 9 + rng() * 14;
      m.compose(p.set(x, floorY(x, z) - 3, z), q.setFromEuler(e.set((rng() - 0.5) * 0.12, rng() * 6, (rng() - 0.5) * 0.12)), s.set(w, Math.max(26, h), w));
      towers.setMatrixAt(i, m);
      tSeed[i] = rng();
    }
    towerGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(tSeed, 1));
  }
  towers.frustumCulled = false;
  group.add(towers);

  // --- them ---
  const N = Math.round(C.ICE_CALLERS);
  const callerGeo = (() => {
    const parts = [tint(new THREE.SphereGeometry(3, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 0.85, 1), 0xffffff)];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      parts.push(tint(new THREE.ConeGeometry(0.22, 7.5, 5).rotateX(Math.PI).translate(Math.cos(a) * 1.9, -3.9, Math.sin(a) * 1.9), 0xffffff));
    }
    const g = mergedMesh(parts, null).geometry;
    g.deleteAttribute('color');
    return g;
  })();
  const aCall = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
  const aSeed = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
  callerGeo.setAttribute('aCall', aCall);
  callerGeo.setAttribute('aSeed', aSeed);
  const callerMesh = new THREE.InstancedMesh(callerGeo, new THREE.ShaderMaterial({ uniforms: { ...LAMP_U, uTime: time }, vertexShader: CALLER_VERT, fragmentShader: CALLER_FRAG, side: THREE.DoubleSide, fog: false }), N);
  callerMesh.frustumCulled = false;
  group.add(callerMesh);
  // each: where it is, where it keeps in the company (an offset from the one that leads), how big
  const callers = [];
  {
    const rng = mulberry32(0xca11);
    for (let i = 0; i < N; i++) {
      const a = rng() * Math.PI * 2, r = i ? 26 + rng() * 70 : 0;
      callers.push({ i, pos: new THREE.Vector3(0, -9000, 0), off: new THREE.Vector3(Math.cos(a) * r, (rng() - 0.5) * 50, Math.sin(a) * r), k: i ? 0.7 + rng() * 0.7 : 1.25, call: 0, here: false, ph: rng() * 9 });
      aSeed.setX(i, rng());
    }
    aSeed.needsUpdate = true;
  }
  const lead = callers[0];

  // --- specks, and the vessel ---
  const mN = Math.min(tier.motes, 1600);
  const mPos = new Float32Array(mN * 3), mSeed = new Float32Array(mN);
  {
    const rng = mulberry32(0x5e4);
    for (let i = 0; i < mN; i++) {
      mPos[i * 3] = rng();
      mPos[i * 3 + 1] = rng();
      mPos[i * 3 + 2] = rng();
      mSeed[i] = rng();
    }
  }
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  mGeo.setAttribute('aSeed', new THREE.BufferAttribute(mSeed, 1));
  const at = new THREE.Vector3(0, -60, 0); // where the vessel is
  const drift = new THREE.Vector3();
  const motes = new THREE.Points(mGeo, new THREE.ShaderMaterial({ uniforms: { ...LAMP_U, uAt: { value: at }, uBox: { value: BOX }, uTime: time, uDrift: { value: drift } }, vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  motes.frustumCulled = false;
  group.add(motes);
  const hull = new THREE.Group();
  hull.rotation.order = 'YXZ';
  {
    // what of the hull the seat can see: the frame of the glass
    const frame = [];
    for (const [x, y] of [[-1.5, 1.05], [1.5, 1.05], [-1.5, -1.05], [1.5, -1.05]]) frame.push(tint(box(0.07, 0.07, 1.6, x, y, 1.5), 0x0b1116));
    frame.push(tint(box(3.07, 0.07, 0.07, 0, 1.05, 2.3), 0x0b1116), tint(box(3.07, 0.07, 0.07, 0, -1.05, 2.3), 0x0b1116));
    frame.push(tint(box(0.07, 2.17, 0.07, -1.5, 0, 2.3), 0x0b1116), tint(box(0.07, 2.17, 0.07, 1.5, 0, 2.3), 0x0b1116));
    hull.add(mergedMesh(frame, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  }
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

  // --- the sounder's pads (touch; a keyboard has 1, 2, 3) ---
  let pads = null;
  function buildPads() {
    if (pads) return;
    const style = document.createElement('style');
    style.textContent = `
#icePads { position: fixed; left: 50%; bottom: 24vh; transform: translateX(-50%); display: none; gap: 1.2vw; z-index: 61; font-family: 'Courier New', monospace; }
#icePads.on { display: flex; }
#icePads button { width: clamp(64px, 11vw, 120px); padding: 0.9em 0; background: rgba(4, 12, 20, 0.6); border: 1px solid rgba(130, 247, 255, 0.5); color: #a9f7ff; letter-spacing: 0.2em; font: inherit; font-size: clamp(11px, 1.5vw, 16px); border-radius: 6px; }
#icePads button.lit { background: rgba(130, 247, 255, 0.5); color: #04121c; box-shadow: 0 0 22px rgba(130, 247, 255, 0.8); }
#icePads button.mine.lit { background: rgba(255, 210, 122, 0.6); box-shadow: 0 0 22px rgba(255, 210, 122, 0.8); }
body.ch-cine #icePads { display: none !important; }`;
    document.head.appendChild(style);
    const root = document.createElement('div');
    root.id = 'icePads';
    const btn = ICE.pads.map((label, i) => {
      const b = document.createElement('button');
      b.textContent = `${i + 1} · ${label}`;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        press(i);
      });
      root.appendChild(b);
      return b;
    });
    document.body.appendChild(root);
    pads = { root, btn, lit: -1, t: 0 };
  }
  function lightPad(i, mine) {
    if (!pads) return;
    pads.btn.forEach((b, j) => {
      b.classList.toggle('lit', j === i);
      b.classList.toggle('mine', !!mine);
    });
    pads.lit = i;
    pads.t = 0.35;
  }
  const onKey = (e) => {
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') press(Number(e.code.slice(5)) - 1);
  };

  // --- state ---
  const vel = new THREE.Vector3();
  let yaw = 0, pitch = 0, avY = 0, avX = 0, baseYaw = 0, push = 0;
  let inside = false, prev = null, resume = null;
  let scene = null, snap = null; // a scene, and where the vessel was when it began
  let signal = 0, hearT = 0, hintT = 0, saidFirst = false;
  let tone = null; // { round, phase: 'play' | 'input' | 'gap', i, t, got }
  let leadTo = null; // where they are leading: CITY, then UNDER
  let asking = false, askT = 0, saidRoof = false;
  let melt = 0, pullT = -1, leaveT = -1, saidMinute = false;
  let dead = null, deathLine = null, panelText = null, lastChanged = -1, lastBand = -1;
  const later = [];
  const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
  const decision = () => season.get(KEY);
  const say = (line, sec) => crewSay(chapter, line, sec);

  // --- them: where each one is ---
  function placeCallers(d, t) {
    for (const c of callers) {
      const s = c.here ? c.k : 0;
      c.call = Math.max(0, c.call - d * 2.2);
      const bob = Math.sin(t * 0.7 + c.ph) * 2.2;
      _m.compose(_w.set(c.pos.x, c.pos.y + bob, c.pos.z), _q.setFromEuler(_e.set(Math.sin(t * 0.4 + c.ph) * 0.2, c.ph, Math.cos(t * 0.33 + c.ph) * 0.2)), _s.setScalar(s));
      callerMesh.setMatrixAt(c.i, _m);
      aCall.setX(c.i, c.call);
    }
    callerMesh.instanceMatrix.needsUpdate = true;
    aCall.needsUpdate = true;
  }
  // the company, round the one that leads
  function gather(point, d, snapTo) {
    for (const c of callers) {
      if (!c.here) continue;
      _w.copy(point).add(c.off);
      _w.y = Math.min(ceilY(_w.x, _w.z) - 14, Math.max(floorY(_w.x, _w.z) + 16, _w.y));
      if (snapTo) c.pos.copy(_w);
      else c.pos.lerp(_w, Math.min(1, d * (c === lead ? 3 : 0.9)));
    }
  }
  const leadPoint = new THREE.Vector3();
  function settle() {
    const st = story.stage();
    for (const c of callers) {
      c.here = c === lead ? story.reached('forecast') : story.reached('answered');
      c.call = 0;
    }
    leadTo = st === 'answered' ? CITY : st === 'city' || st === 'asked' || st === 'decided' ? UNDER : null;
    if (st === 'contact' || st === 'done') leadPoint.copy(UNDER);
    else if (st === 'city' || st === 'asked' || st === 'decided') leadPoint.copy(st === 'city' ? CITY : UNDER);
    else if (st === 'answered') leadPoint.copy(FIRST);
    else leadPoint.copy(FIRST);
    if (st === 'asked' || st === 'decided') leadPoint.copy(UNDER).add(_w.set(60, -40, 50));
    gather(leadPoint, 0, true);
    const shown = fixed.outcome('contact')?.how === 'shown';
    iceU.uOpen.value = shown ? 1 : 0;
    iceU.uMelt.value = 0;
    skyShaft.material.opacity = shown ? 0.05 : 0;
    melt = 0;
    pullT = -1;
    leaveT = -1;
    tone = null;
    asking = false;
  }

  // --- the scenes ---
  function begin(kind, clock) {
    scene = { kind, clock };
    snap = { at: at.clone(), yaw, pitch };
    vel.set(0, 0, 0);
    avY = avX = 0;
    chapterHud.cine(true);
    if (pads) pads.root.classList.remove('on');
    clock.begin();
  }
  function endScene() {
    scene = null;
    chapterHud.cine(false);
  }
  const turnTo = (p) => {
    const dx = p.x - at.x, dy = p.y - at.y, dz = p.z - at.z;
    return [Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz))];
  };
  const lerpA = (a, b, k) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
  };
  // down the bore
  const descentClock = createSceneClock({
    T: C.ICE_DESCENT_T, lines: ICE.descent, say: (l) => say(l, 6),
    pose(u) {
      const k = ease(0, C.ICE_DESCENT_T, u);
      at.set(0, 380 - 440 * k, 0);
      yaw = 0.4 + u * 0.05;
      pitch = -1.1 + 0.9 * ease(12, C.ICE_DESCENT_T, u);
      hullTick(0.5 * (1 - ease(10, 14, u)), 0.016);
    },
    onEnd() {
      endScene();
      story.advance('down');
      later.push({ text: ICE.radioHint, sec: 10 });
      hintT = 0;
    },
  });
  // the others arriving
  const answeredClock = createSceneClock({
    T: C.ICE_ANSWERED_T, lines: ICE.answered, say: (l) => say(l, 6),
    pose(u) {
      at.copy(snap.at);
      yaw = snap.yaw + 0.5 * Math.sin(u * 0.18);
      pitch = snap.pitch * (1 - ease(0, 4, u));
      // they come in out of the dark, one after another, to where the first one is
      for (const c of callers) {
        if (c === lead) continue;
        const k = ease(2 + c.i * 0.6, 9 + c.i * 0.6, u);
        c.here = k > 0;
        _w.copy(lead.pos).add(c.off);
        c.pos.copy(_w).addScaledVector(_s.copy(c.off).setY(0).normalize(), 700 * (1 - k));
        if (k > 0 && k < 1 && Math.sin(u * 5 + c.i) > 0.92) c.call = 1;
      }
      if (Math.sin(u * 2.2) > 0.95) lead.call = 1;
    },
    onEnd() {
      endScene();
      story.advance('answered');
      for (const c of callers) c.here = true;
      leadTo = CITY;
      leadPoint.copy(lead.pos);
    },
  });
  // the vents: carried over them
  const cityClock = createSceneClock({
    T: C.ICE_CITY_T, lines: ICE.city, say: (l) => say(l, 6.5),
    pose(u) {
      const a = 2.2 + u * 0.035, r = 300 - u * 2.4;
      at.set(CITY.x + Math.cos(a) * r, CITY.y + 100 - u * 1.6, CITY.z + Math.sin(a) * r);
      const [ty, tp] = turnTo(_w.set(CITY.x, CITY.y - 30, CITY.z));
      yaw = ty;
      pitch = tp;
      gather(_w.set(CITY.x, CITY.y + 30, CITY.z), 0.016, u < 0.1);
      const c = callers[Math.floor(u * 1.3) % N];
      if (u > 12 && u < 22 && Math.sin(u * 7) > 0.9) c.call = 1;
    },
    onEnd() {
      endScene();
      // (the lamp was every band for the length of it)
      lamp.canAll = false;
      lamp.power = C.ICE_LAMP_POWER;
      story.advance('city');
      leadTo = UNDER;
      leadPoint.set(CITY.x, CITY.y + 30, CITY.z);
    },
  });
  // the sky
  const skyClock = createSceneClock({
    T: C.ICE_SKY_T, lines: ICE.sky, say: (l) => say(l, 7),
    pose(u) {
      // from below and to one side, looking up the hole
      at.set(ROOF.x + 70 - u * 0.5, -150 + u * 1.1, ROOF.z + 60);
      const [ty, tp] = turnTo(_w.set(ROOF.x, 30, ROOF.z));
      yaw = ty;
      pitch = Math.min(C.EZ_SUB_PITCH, tp);
      iceU.uOpen.value = 1;
      skyShaft.material.opacity = 0.05 + 0.05 * ease(0, 8, u);
      // they rise to it, and ring it
      for (const c of callers) {
        const a = c.ph * 0.7 + u * 0.05, r = 46 + (c.i % 5) * 16;
        _w.set(ROOF.x + Math.cos(a) * r, -150 + (110 - (c.i % 4) * 14) * ease(3, 15, u), ROOF.z + Math.sin(a) * r);
        c.pos.lerp(_w, 0.05);
        if (u > 16 && u < 23 && Math.sin(u * 4 + c.i * 0.6) > 0.985) c.call = 1;
        if (u > 24 && Math.sin(u * 2.4 + c.i * 0.9) > 0.9) c.call = 1;
      }
    },
    onEnd() {
      endScene();
      fixed.resolve('contact', 'shown', { archived: true });
      season.set('ch3.archived', true);
      story.advance('contact');
      season.survive(KEY);
      at.copy(UNDER).y -= 60;
      later.push({ text: ICE.hud.toBore, sec: 8 });
    },
  });
  // ...or the way up, with the ice left shut
  const awayClock = createSceneClock({
    T: C.ICE_AWAY_T, lines: ICE.away, say: (l) => say(l, 7),
    pose(u) {
      at.set(0, -30 + 330 * ease(0, C.ICE_AWAY_T, u), 0);
      yaw = snap.yaw + u * 0.04;
      pitch = -1.25;
      // they come to the bore's mouth, and stay there
      gather(_w.set(0, -80, 0), 0.016, false);
      const c = callers[Math.floor(u * 1.7) % N];
      if (Math.sin(u * 3.1) > 0.8) c.call = 1;
    },
    onEnd() {
      endScene();
      fixed.resolve('contact', 'left', { archived: false });
      season.set('ch3.archived', false);
      story.advance('contact');
      season.survive(KEY);
      site.portal = 'ice:up';
    },
  });

  // --- the sounder ---
  function press(i) {
    if (!inside || scene || isDialogueOpen() || i < 0 || i > 2) return;
    chime(ICE_NOTES[i]);
    lightPad(i, true);
    if (!tone || tone.phase !== 'input') return;
    const phrase = ICE_PHRASES[tone.round];
    if (phrase[tone.got] !== i) {
      tone.phase = 'gap';
      tone.t = 1.4;
      tone.got = 0;
      chapterHud.say(ICE.wrong, 4);
      return;
    }
    tone.got++;
    if (tone.got < phrase.length) return;
    chapterHud.say(ICE.right[tone.round], 4);
    logChime();
    lead.call = 1;
    tone.round++;
    tone.got = 0;
    if (tone.round >= ICE_PHRASES.length) {
      tone = null;
      if (pads) pads.root.classList.remove('on');
      begin('answered', answeredClock);
      return;
    }
    tone.phase = 'gap';
    tone.t = 2.2;
  }
  function stepTone(d) {
    const heard = lampLive() && lamp.band === BAND.RADIO;
    if (tone.phase === 'gap') {
      tone.t -= d;
      if (tone.t <= 0) {
        tone.phase = 'play';
        tone.i = -1;
        tone.t = 0;
      }
    } else if (tone.phase === 'play' && heard) {
      // (it is only heard on the band it speaks on: off it, the call waits)
      tone.t -= d;
      if (tone.t <= 0) {
        tone.i++;
        const phrase = ICE_PHRASES[tone.round];
        if (tone.i >= phrase.length) {
          tone.phase = 'input';
          tone.got = 0;
        } else {
          chime(ICE_NOTES[phrase[tone.i]]);
          lightPad(phrase[tone.i], false);
          lead.call = 1;
          tone.t = C.ICE_NOTE_TIME;
        }
      }
    }
  }

  // --- the decision ---
  function ask() {
    if (asking || isDialogueOpen() || scene || story.stage() !== 'asked') return;
    asking = true;
    season.offer(KEY, 'ice:ask', { stage: 'asked' }); // the checkpoint, as the decision is shown
    const who = crewSpeaker(chapter, 'marrow');
    // each captain aboard says their side first; then the vessel says what can be done
    const sides = ICE.decide.sides.filter((s) => chapter.crew().some((c) => c.id === s.by)).map((s) => `${chapter.crew().find((c) => c.id === s.by).short} — ${s.text}`);
    openDialogue({
      speaker: who && sides.length ? { name: 'The crew', species: 'aboard the vessel', cityId: ICE.decide.speaker.cityId } : ICE.decide.speaker,
      cine: { kind: 'comm', from: ICE.decide.prompt },
      lines: [...sides, ...ICE.decide.lines],
      offer: { kind: 'choice', prompt: ICE.decide.prompt, options: [{ label: ICE.decide.show, outcomeTag: 'ice:show' }, { label: ICE.decide.leave, outcomeTag: 'ice:leave' }] },
    }, {
      onOffer: (offer) => {
        const option = offer.outcomeTag === 'ice:show' ? 'show' : offer.outcomeTag === 'ice:leave' ? 'leave' : null;
        if (!option || !decide(option)) return null;
        return { speaker: ICE.decide.speaker, cine: { kind: 'comm', from: ICE.decide.prompt }, lines: (option === 'show' ? ICE.show : ICE.leave).lines };
      },
      onClose: () => {
        asking = false;
        askT = 7; // unanswered: asked again
      },
    });
  }
  function decide(option) {
    if (story.stage() !== 'asked' || (option !== 'show' && option !== 'leave')) return false;
    season.offer(KEY, 'ice:ask', { stage: 'asked' });
    season.decide(KEY, option);
    story.advance('decided');
    melt = 0;
    pullT = -1;
    leaveT = option === 'leave' ? 0 : -1;
    saidMinute = false;
    uiSound('engage');
    const o = option === 'show' ? ICE.show : ICE.leave;
    later.push(o.crew, { text: o.hint, sec: 10 });
    return true;
  }
  function unmake() {
    if (story.stage() !== 'decided') return false;
    if (scene) {
      scene.clock.stop();
      endScene();
    }
    season.die();
    story.revert('asked');
    setEventRumble(0);
    setRoar(0);
    settle();
    return true;
  }
  function die(cause) {
    if (dead || site.portal) return;
    dead = cause;
    site.portal = 'ice:back';
  }

  // --- the hull ---
  function step(h, fwd, strafe, lift) {
    yaw += avY * h;
    pitch = Math.min(Math.max(pitch + avX * h, -C.EZ_SUB_PITCH), C.EZ_SUB_PITCH);
    const damp = Math.exp(-C.EZ_SUB_TURN_DAMP * h);
    avY *= damp;
    avX *= damp;
    const cp = Math.cos(pitch);
    _f.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
    _r.set(-Math.cos(yaw), 0, Math.sin(yaw));
    _w.set(0, 0, 0).addScaledVector(_f, fwd).addScaledVector(_r, strafe);
    _w.y += lift;
    const n = _w.length();
    if (n > 1) _w.multiplyScalar(1 / n);
    vel.addScaledVector(_w, C.ICE_SUB_THRUST * h);
    // the sea going up the hole takes the vessel with it, harder the nearer
    if (pullT >= 0) {
      _w.set(ROOF.x - at.x, 6 - at.y, ROOF.z - at.z);
      const dist = _w.length();
      vel.addScaledVector(_w.multiplyScalar(1 / Math.max(dist, 1)), C.ICE_PULL * Math.exp(-dist / 210) * (1 - ease(C.ICE_PULL_TIME * 0.7, C.ICE_PULL_TIME, pullT)) * h);
    }
    vel.multiplyScalar(Math.exp(-C.ICE_SUB_DRAG * h));
    at.addScaledVector(vel, h);
    // the ice above (but for the bore, and the hole), the floor below, and how far the vessel will go
    const rr = Math.hypot(at.x, at.z), hole = Math.hypot(at.x - ROOF.x, at.z - ROOF.z) < C.ICE_HOLE_R && iceU.uOpen.value > 0.5;
    const top = rr < 24 - 4 ? 60 : hole ? 40 : ceilY(at.x, at.z) - 9;
    if (at.y > top) {
      at.y = top;
      if (vel.y > 0) vel.y = 0;
    }
    if (rr < 24 && at.y > -6) {
      // inside the bore: its wall
      const lim = 24 - 5;
      if (rr > lim) {
        at.x *= lim / rr;
        at.z *= lim / rr;
      }
    }
    const bot = floorY(at.x, at.z) + 12;
    if (at.y < bot) {
      at.y = bot;
      if (vel.y < 0) vel.y = 0;
    }
    const far = Math.hypot(at.x - mid[0], at.z - mid[1]);
    if (far > LIMIT) {
      at.x = mid[0] + ((at.x - mid[0]) * LIMIT) / far;
      at.z = mid[1] + ((at.z - mid[1]) * LIMIT) / far;
    }
  }

  // --- what the corner of the screen says ---
  const bar = (v) => '█'.repeat(Math.round(Math.min(1, Math.max(0, v)) * 10)).padEnd(10, '░');
  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function panel() {
    const st = story.stage();
    const rows = [];
    const radio = lampLive() && lamp.band === BAND.RADIO;
    if (tone) {
      rows.push(radio ? (tone.phase === 'input' ? ICE.hud.yours : ICE.hud.listen) : ICE.hud.noRadio);
      rows.push(`${ICE.hud.answer}${tone.round} / ${ICE_PHRASES.length}`);
    } else if (st === 'down' || st === 'heard') rows.push(radio ? ICE.hud.signal + bar(signal) : ICE.hud.noRadio);
    else if (st === 'answered' || st === 'city') rows.push(ICE.hud.follow, radio ? ICE.hud.signal + bar(signal) : ICE.hud.noRadio);
    else if (st === 'decided' && decision() === 'show') rows.push(pullT >= 0 ? ICE.hud.pull : ICE.hud.melt + bar(1 - melt));
    else if (st === 'decided') rows.push(ICE.hud.bore + mmss(Math.max(0, C.ICE_LEAVE_TIME - leaveT)), radio ? ICE.hud.signal + bar(signal) : ICE.hud.toBore);
    else if (st === 'contact') rows.push(ICE.hud.toBore, radio ? ICE.hud.signal + bar(signal) : '');
    const text = rows.length && !scene ? rows.filter(Boolean).join('\n') : null;
    if (text !== panelText) chapterHud.panel((panelText = text));
  }

  const surfaces = [{ kind: 'disc', cx: 0, cz: 0, r: 1.2, y: 0 }];
  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: UP },
    noShip: true,
    hidePilot: true, // seated behind the camera
    speed: 1,
    exit: { x: 0, z: 0 },
    leaveHint: ICE.hud.toBore,
    surfaces,
    colliders: [],
    floorYAt: floorOf(surfaces, 1.2),
    snap: 1.2,
    pad: new THREE.Vector3(),
    spawn: new THREE.Vector3(),
    spawnYaw: 0,
    npcs: [],
    consoles: [],
    onChoice: () => null,
    portal: null, // 'ice:up' through the bore; 'ice:back' when the vessel is lost
    held: () => true, // one seat, and it is not left
    act() {
      if (scene) scene.clock.skip();
      else nextBand(1);
    },
    heldPrompt: () => (scene ? ICE.skip : null),
    camera(pos, target) {
      pos.copy(at);
      const cp = Math.cos(pitch);
      target.set(at.x + Math.sin(yaw) * cp * 10, at.y + Math.sin(pitch) * 10, at.z + Math.cos(yaw) * cp * 10);
      return true;
    },
    setWalker() {},
    onEnter() {
      if (inside) return;
      inside = true;
      site.portal = null;
      dead = null;
      group.visible = true;
      prev = {
        fog: ctx.scene.fog, lightI: sun.light.intensity, ambI: sun.ambient.intensity,
        lampPower: lamp.power, lampMedium: lamp.medium, lampCanAll: lamp.canAll, lampOn: lamp.on, lampBand: lamp.band,
      };
      ctx.scene.fog = null;
      sun.light.intensity = 0; // nothing down here is lit by a sun: every material answers the lamp or glows
      sun.ambient.intensity = 0;
      if (ctx.hideFleet) ctx.hideFleet();
      resetLamp(true);
      lamp.medium = 'water';
      lamp.power = C.ICE_LAMP_POWER;
      lamp.canAll = false;
      lamp.lineBeam = false;
      lastChanged = lamp.changed;
      lastBand = lamp.band;
      input.bandPrev = input.lampToggle = false;
      lampHud.show(true, true, ICE.keys);
      buildPads();
      document.addEventListener('keydown', onKey);
      baseYaw = cWalk.yaw;
      cWalk.pitch = 0;
      vel.set(0, 0, 0);
      avY = avX = 0;
      scene = null;
      later.length = 0;
      if (deathLine) later.push({ text: deathLine, sec: 9 });
      deathLine = null;
      panelText = null;
      hearT = 0;
      hintT = 0;
      saidFirst = story.reached('heard');
      saidRoof = story.reached('asked');
      askT = 3;
      settle();
      if (resume === 'ask') {
        // back at the asking: under the thin ice, looking up at it
        at.copy(UNDER);
        yaw = 0.6;
        pitch = 0.5;
      } else if (!story.reached('down')) begin('descent', descentClock);
      else {
        at.set(0, -70, 0);
        yaw = 0.6;
        pitch = -0.2;
      }
      resume = null;
      if (story.stage() === 'heard') tone = { round: 0, phase: 'gap', i: -1, t: 2, got: 0 };
    },
    onLeave() {
      setMusicArea(1);
      if (!inside) return;
      inside = false;
      unmake(); // (taken up, by any way out, with the choice not lived through: it is to be asked again)
      if (scene) {
        scene.clock.stop();
        endScene();
      }
      group.visible = false;
      document.removeEventListener('keydown', onKey);
      if (pads) pads.root.classList.remove('on');
      lampHud.show(false);
      hush();
      setEventRumble(0);
      chapterHud.clear();
      chapterHud.panel(null);
      panelText = null;
      tone = null;
      lamp.power = prev.lampPower;
      lamp.medium = prev.lampMedium;
      lamp.canAll = prev.lampCanAll;
      lamp.on = prev.lampOn;
      lamp.band = prev.lampBand;
      stepLamp(0, false);
      ctx.scene.fog = prev.fog;
      sun.light.intensity = prev.lightI;
      sun.ambient.intensity = prev.ambI;
      prev = null;
    },
    inside: () => inside,
    tick(dt, t) {
      if (inside) setMusicArea(0); // no radio stations under four kilometres of ice
      chapterHud.tick(dt);
      time.value = t;
      const d = Math.min(dt, 0.1);
      const st = story.stage();

      // --- the controls: the walker's look, taken back and leaned on the hull ---
      const talk = isDialogueOpen() || !!scene;
      const dYaw = cWalk.yaw - baseYaw, dPitch = cWalk.pitch;
      cWalk.yaw = baseYaw;
      cWalk.pitch = 0;
      if (!talk) {
        avY += dYaw * C.EZ_SUB_TURN;
        avX += dPitch * C.EZ_SUB_TURN;
        if (input.bandPrev) nextBand(-1);
        if (input.lampToggle) toggleLamp();
      }
      input.bandPrev = input.lampToggle = false;
      const axes = moveAxes();
      const stick = input.moveX !== 0 || input.moveY !== 0;
      const lift = talk ? 0 : (input.brake ? 1 : 0) - (input.sink || (input.sprint && !stick) ? 1 : 0);
      const fwd = talk ? 0 : axes.fwd, strafe = talk ? 0 : axes.strafe;
      const shown = !!scene; // (a frame that began in a scene ends in it, even if the scene ended on it: the stage read above is stale)
      if (scene) scene.clock.tick(d);
      else if (isDialogueOpen()) vel.multiplyScalar(Math.exp(-3 * d));
      else for (let rem = d; rem > 1e-5; rem -= 1 / 60) step(Math.min(rem, 1 / 60), fwd, strafe, lift);
      push += (Math.min(1, Math.hypot(fwd, strafe, lift)) - push) * Math.min(1, d * 4);
      setHum(0.25 + 0.75 * push);
      drift.addScaledVector(vel, -d * 0.02);

      // --- the hull, and the lamp on it ---
      hull.position.copy(at);
      hull.rotation.set(-pitch, yaw, 0);
      lamp.pos.copy(LAMP_AT).applyQuaternion(hull.quaternion).add(at);
      const cp = Math.cos(pitch);
      lamp.dir.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
      lamp.energy = 1;
      stepLamp(0, !!scene && scene.kind === 'city');
      beam.scale.setScalar(lamp.reach * 0.75);
      if (lamp.changed !== lastChanged) {
        lastChanged = lamp.changed;
        if (lamp.band !== lastBand) bandClick((lastBand = lamp.band));
      }
      const radio = lampLive() && lamp.band === BAND.RADIO;

      // --- the radio band is an ear: louder the nearer the vessel points at them ---
      const target = st === 'contact' || (st === 'decided' && decision() === 'leave') ? _s.set(0, -30, 0) : story.reached('forecast') && !scene ? lead.pos : null;
      let near = 0;
      if (target) {
        _w.subVectors(target, at);
        const dist = _w.length();
        const along = dist > 1 ? Math.max(0, _w.dot(lamp.dir) / dist) : 1;
        near = Math.pow(along, 4) * (0.3 + 0.7 * Math.max(0, 1 - dist / 2600));
      }
      signal += ((radio ? near : 0) - signal) * Math.min(1, d * 5);
      setRadio(radio, signal);

      if (shown) {
        placeCallers(d, t);
        panel();
        lampHud.update();
        return;
      }
      if (later.length && !isDialogueOpen() && chapterHud.state().line == null) {
        const l = later.shift();
        if (l && l.by !== undefined) say(l, 7);
        else if (l) chapterHud.say(l.text, l.sec || 7);
      }

      // --- finding the first one, by ear ---
      if (st === 'down') {
        lead.pos.copy(FIRST);
        if (Math.sin(t * 1.9) > 0.9) lead.call = 1; // it calls, over and over, at nobody
        hintT += d;
        if (hintT > 26) {
          hintT = 0;
          chapterHud.say(radio ? ICE.turnHint : ICE.radioHint, 8);
        }
        if (radio && signal > 0.25 && !saidFirst) {
          saidFirst = true;
          say(ICE.first, 7);
        }
        const dist = at.distanceTo(FIRST);
        hearT = radio && dist < C.ICE_HEAR_R && near > 0.2 ? hearT + d : 0;
        if (hearT >= C.ICE_HEAR_TIME) {
          story.advance('heard');
          later.push(...ICE.heard);
          tone = { round: 0, phase: 'gap', i: -1, t: 9, got: 0 };
        }
      }
      // --- the call, and the call given back ---
      if (tone && !isDialogueOpen()) {
        // it comes round to the glass, and keeps there
        const cpp = Math.cos(pitch);
        _w.set(at.x + Math.sin(yaw) * cpp * 34, at.y + Math.sin(pitch) * 34 + 3, at.z + Math.cos(yaw) * cpp * 34);
        lead.pos.lerp(_w, Math.min(1, d * 0.8));
        stepTone(d);
        pads.root.classList.toggle('on', tone != null);
      } else if (pads && !tone) pads.root.classList.remove('on');
      if (pads && pads.lit >= 0 && (pads.t -= d) <= 0) lightPad(-1, false);

      // --- following: to the vents, and then to the roof ---
      if (leadTo && (st === 'answered' || st === 'city')) {
        // the one that leads goes ahead, and waits when the vessel falls behind
        _w.subVectors(leadTo, leadPoint);
        const left = _w.length(), gap = leadPoint.distanceTo(at);
        if (left > 4 && gap < C.ICE_LEAD_GAP) leadPoint.addScaledVector(_w.multiplyScalar(1 / left), Math.min(left, C.ICE_LEAD_SPEED * d));
        gather(leadPoint, d, false);
        if (Math.sin(t * 2.6) > 0.93) lead.call = 1;
        if (st === 'answered' && at.distanceTo(CITY) < C.ICE_ARRIVE_R) {
          lamp.on = true;
          lamp.canAll = true;
          lamp.power = 2.2; // (for the length of the scene the whole of it is in reach)
          begin('city', cityClock);
        } else if (st === 'city' && at.distanceTo(UNDER) < C.ICE_ARRIVE_R) {
          story.advance('asked');
          if (!saidRoof) later.push(...ICE.roof);
          saidRoof = true;
          askT = 6;
        }
      } else if (st === 'asked' || st === 'decided' || st === 'contact') {
        gather(_w.copy(st === 'decided' && decision() === 'leave' ? at : UNDER).add(_s.set(50, -50, 40)), d, false);
        const c = callers[Math.floor(t * 0.9) % N];
        if (Math.sin(t * 3.3) > 0.94) c.call = 1;
      }

      // --- the roof of the world: the question, asked until it is answered ---
      if (st === 'asked' && !asking && at.distanceTo(UNDER) < C.ICE_ARRIVE_R * 1.3 && later.length === 0) {
        askT -= d;
        if (askT <= 0) ask();
      }
      if (st === 'decided' && !isDialogueOpen()) {
        if (decision() === 'show') {
          if (pullT < 0) {
            // nose up, under the thin place: the hull's heat does it
            const under = Math.hypot(at.x - ROOF.x, at.z - ROOF.z) < C.ICE_ROOF_R && at.y > -260 && pitch > 0.75;
            melt = under ? melt + d / C.ICE_MELT_TIME : Math.max(0, melt - d / (C.ICE_MELT_TIME * 3));
            iceU.uMelt.value = melt;
            setEventRumble(under ? 0.25 + 0.4 * melt : 0);
            if (melt >= 1) {
              pullT = 0;
              iceU.uMelt.value = 0;
              say(ICE.show.breach, 6);
              uiSound('impact');
            }
          } else {
            pullT += d;
            iceU.uOpen.value = ease(0, 1.2, pullT);
            skyShaft.material.opacity = 0.05 * iceU.uOpen.value;
            const k = 1 - ease(C.ICE_PULL_TIME * 0.7, C.ICE_PULL_TIME, pullT);
            setRoar(k);
            setEventRumble(0.8 * k);
            drift.y += 60 * k * d; // everything in the water is going the same way
            if (Math.hypot(at.x - ROOF.x, at.z - ROOF.z) < C.ICE_HOLE_R && at.y > -12) die('vented');
            else if (pullT >= C.ICE_PULL_TIME) {
              pullT = -1;
              setRoar(0);
              setEventRumble(0);
              begin('sky', skyClock);
            }
          }
        } else {
          leaveT += d;
          const left = C.ICE_LEAVE_TIME - leaveT;
          if (!saidMinute && left < 60) {
            saidMinute = true;
            say(ICE.leave.minute, 6);
          }
          if (Math.hypot(at.x, at.z) < C.ICE_BORE_R && at.y > -95) begin('away', awayClock);
          else if (left <= 0) die('sealed');
        }
      }
      // --- up the bore, any other time ---
      if (st !== 'decided' && !site.portal && Math.hypot(at.x, at.z) < 24 && at.y > 30) site.portal = 'ice:up';

      placeCallers(d, t);
      panel();
      lampHud.update();
    },
    // The vessel has been lost ('ice:back'): the choice is unmade, and the pilot is under the thin ice again.
    revive() {
      unmake();
      deathLine = ICE.death[dead || 'left'] || null;
      dead = null;
      resume = 'ask';
    },
    askAgain() {
      resume = 'ask';
    },
    settle,
    places: { first: FIRST.toArray(), city: CITY.toArray(), roof: ROOF.toArray(), under: UNDER.toArray(), bore: [0, -70, 0] },
    info: () => ({
      inside, at: at.toArray().map((v) => +v.toFixed(1)), yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3), speed: +vel.length().toFixed(1),
      scene: scene ? { kind: scene.kind, u: +scene.clock.u().toFixed(2) } : null, lamp: inside ? lampState() : null, signal: +signal.toFixed(3),
      tone: tone ? { round: tone.round, phase: tone.phase, got: tone.got, want: ICE_PHRASES[tone.round] } : null,
      lead: lead.pos.toArray().map((v) => Math.round(v)), callers: callers.filter((c) => c.here).length, asking,
      melt: +melt.toFixed(3), pull: +pullT.toFixed(1), leave: leaveT >= 0 ? +(C.ICE_LEAVE_TIME - leaveT).toFixed(1) : null, open: +iceU.uOpen.value.toFixed(2),
      dead, panel: panelText, pads: !!pads && pads.root.classList.contains('on'),
    }),
    // dev (world/ice-system.js hands these to __debug)
    dbg: {
      seek: (u) => (scene ? (scene.clock.seek(u), true) : false),
      skip: () => (scene ? scene.clock.skip() : false),
      // put the vessel somewhere, pointed somewhere
      put(o) {
        if (o.at) at.fromArray(o.at);
        if (o.look) [yaw, pitch] = turnTo(_w.fromArray(o.look));
        if (Number.isFinite(o.yaw)) yaw = o.yaw;
        if (Number.isFinite(o.pitch)) pitch = o.pitch;
        vel.set(0, 0, 0);
        avY = avX = 0;
        return site.info();
      },
      band(id) {
        const want = BAND[String(id).toUpperCase()];
        for (let i = 0; i < 6 && lamp.band !== want; i++) nextBand(1);
        return lamp.band === want;
      },
      press,
      decide,
      ask,
      kill: (cause) => (die(cause || 'vented'), dead),
      melt(v) {
        if (story.stage() !== 'decided' || decision() !== 'show') return false;
        melt = v;
        return true;
      },
      time(left) {
        if (leaveT < 0) return false;
        leaveT = C.ICE_LEAVE_TIME - left;
        return true;
      },
    },
  };
  return site;
}
