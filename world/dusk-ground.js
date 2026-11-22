// The Long Dusk: the ground (GDD 5.7.9; Season 1, chapter 2).
//
// A strip of a tidally locked world, laid across its twilight line. +X is
// toward the star: that way the ground burns. -X is the night: that way it
// freezes. In between is the dusk, a few hundred units wide, and the camp that
// walks to stay in it.
//
//   the lean     The star never rises or sets here, but it leans: the orbit is
//                not quite a circle, so the world's steady spin runs a little
//                ahead of its orbit and then a little behind (libration in
//                longitude, about twice the eccentricity, in radians). The
//                twilight line moves across the ground with it (`term`), the
//                camp moves with the line, and src/voyage.js's star is rocked
//                by the same angle (world/dusk-system.js).
//   the gauges   Sunward of the dusk the suit heats, nightward it cools. Either
//                one full is a death. Warm vents on the night side, which only
//                the lamp's infrared shows, give the cold back.
//   the tall     Three groups past the night edge. Dark shapes to the eye; in
//                the infrared, big ones walking small ones. In H-alpha, the
//                line in the sky they are walking away from.
//   the choice   Renn asks for the cutting torches. ARM: the edge is held, and
//                the pilot turns each group back from the fires with the beam.
//                WARN: the fires go out, and the pilot goes out behind each
//                group and turns it through the open edge. The same act, both
//                ways: the tall turn from light.
//   the flare    Comes when its clock says, whatever was done (src/fixedEvents.js).
//                Under the sledges it is watched. In the open it kills, and a
//                death after the choice puts the pilot back at the asking
//                (src/season.js).
//
// The science. Real: tidal locking; a habitable strip at the terminator;
// libration; red-dwarf flares; warm bodies glowing at 10 µm against a cold
// night; and the route a flare's particles take. The flash of a flare is light
// and falls on the day side only. The protons that follow are steered by the
// world's magnetic field and come down on the night side in a band (the
// auroral oval, fed from the magnetotail), and a proton aurora does glow in
// hydrogen's own lines, H-alpha among them, which is what the lamp picks out
// before the eye can. Stretched: for that band to be deadly at ground level
// the air has to be thin and the field weak, and the particles here follow the
// light by seconds where minutes to hours is the truth. Both are licence.
//
// A site for the platform walker (src/capitalWalk.js), in the world (the
// universe is not paused), docked at by the freighter (src/game.js SYSTEM_DOCK).
// It is built on a globe of its own and not on a src/planet.js world: a real
// planet's landing would take the helm from the dock's.

import * as THREE from 'three';
import { C, DUSK_WAVES, DUSK_GROUPS_Z } from '../src/constants.js';
import { sun } from '../src/sun.js';
import { input } from '../src/input.js';
import { cWalk } from '../src/capitalWalk.js';
import { chapterHud } from '../src/chapterHud.js';
import { lampHud } from '../src/lampHud.js';
import { lamp, LAMP_U, LAMP_GLSL, BAND, nextBand, toggleLamp, stepLamp, lampShows, lampLive, resetLamp, lampState } from '../src/lamp.js';
import { openDialogue, isDialogueOpen } from '../src/dialogue.js';
import { fbm2, mulberry32 } from '../src/noise2.js';
import { uiSound, setEventRumble } from '../src/sfx.js';
import { tint, box, cyl, mergedMesh } from './capital.js';
import { buildRig, poseRig } from './aliens.js';
import { measureRig, standRig } from './rigGround.js';
import { BEAM_VERT, BEAM_FRAG } from './submersible.js';
import { logChime, bandClick, setWeather, setDread, setRoar, hush } from './entryzero-audio.js';
import { createSceneClock, crewSay } from './sceneClock.js';
import { createCrewFollow } from './crewFollow.js';
import { DUSK } from './dusk-dialogue.js';

const ZERO = new THREE.Vector3();
const R = C.DUSK_GLOBE_R;
// the ground that is walked
const X0 = -620, X1 = 400, ZW = 175;
const PAD = [34, 118], PAD_R = 20;
const CAMP_Z = -34;
const ELDER = [9, 15]; // where Renn walks, from the middle of the camp
const KEY = 'ch2.decision'; // the season's fact, and its checkpoint
const VENTS = [[-300, -62], [-388, 52], [-444, -18], [-362, 140], [-432, -132]];
const FIRES_Z = [-140, -70, 0, 70, 140];
const YOUNG = 3; // small ones in each group
const ease = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

// The lie of the land: the world's curve, and a little roughness that the
// pad is cleared of. One function for the mesh, the walker and every figure.
function groundY(x, z) {
  const pd = Math.hypot(x - PAD[0], z - PAD[1]);
  const rough = fbm2(x * 0.011 + 3.1, z * 0.011 - 7.7, 3) * 0.9 * ease(PAD_R, PAD_R + 26, pd);
  return 1.6 + rough - (x * x + z * z) / (2 * R);
}

const VERT = /* glsl */ `
  uniform vec3 uOff;
  varying vec3 vW;
  varying vec3 vP;
  varying vec3 vN;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vP = position + uOff; // in the site's own frame, whatever the origin has done
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
// The ground and the globe under it: lit by where it is, not by a lamp in the sky.
const GROUND_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  ${NOISE}
  uniform float uTerm;
  uniform float uTime;
  uniform float uHaze;
  uniform float uFlash;
  uniform float uAurora;
  uniform float uBandX;
  uniform float uBandHW;
  uniform float uFireK;
  uniform vec3 uFireCol;
  uniform vec3 uFire[5];
  uniform float uGlobe;
  varying vec3 vW;
  varying vec3 vP;
  void main() {
    float s = vP.x - uTerm; // sunward of the twilight line by this much
    vec2 q = vP.xz;
    float grain = 0.62 + 0.38 * vnoise(q * 0.21) + 0.22 * (vnoise(q * 1.7) - 0.5) + 0.3 * (vnoise(q * 0.018) - 0.5);
    vec3 night = vec3(0.010, 0.014, 0.028);
    vec3 dusk = vec3(0.34, 0.16, 0.09);
    vec3 day = vec3(1.25, 0.74, 0.42);
    vec3 col = mix(night, dusk, smoothstep(-210.0, 10.0, s));
    col = mix(col, day, smoothstep(30.0, 430.0, s));
    col *= grain;
    // the dusk: every stone throws a shadow a hundred times its height, all the same way
    float duskK = smoothstep(-160.0, -10.0, s) * (1.0 - smoothstep(120.0, 330.0, s));
    float streak = smoothstep(0.52, 0.7, vnoise(vec2(q.x * 0.012, q.y * 0.34)));
    col *= 1.0 - 0.45 * duskK * streak * (1.0 - uGlobe);
    // frost, where the star has not been in a long time
    float frost = step(0.985, h21(floor(q * 1.6))) * (1.0 - smoothstep(-260.0, -120.0, s));
    col += vec3(0.25, 0.3, 0.4) * frost * (0.4 + 0.6 * sin(uTime * 2.0 + q.x)) * (1.0 - uGlobe);
    vec3 rock = vec3(0.34, 0.24, 0.18) * grain;
    // the picket fires
    for (int i = 0; i < 5; i++) {
      float d = distance(q, uFire[i].xy);
      col += rock * uFireCol * uFire[i].z * uFireK * (0.75 + 0.25 * sin(uTime * 9.0 + float(i) * 2.1)) / (1.0 + d * d * 0.012);
    }
    // the lamp: its beam on the ground, and in the infrared the ground's own heat
    col += rock * uLampTint * lampBeam(vW) * uLampOn * uLampLit * 1.5;
    col += vec3(1.0, 0.36, 0.08) * lampBand(2.0) * smoothstep(-40.0, 420.0, s) * 0.5 * grain;
    // the flare: the day side whitens; then the band on the night side takes the particles
    col += vec3(1.0, 0.92, 0.82) * uFlash * smoothstep(-60.0, 240.0, s) * (0.6 + 0.6 * grain);
    float band = 1.0 - smoothstep(uBandHW * 0.55, uBandHW, abs(vP.x - uBandX));
    col += vec3(0.22, 1.0, 0.5) * uAurora * band * (0.35 + 0.65 * vnoise(vec2(q.y * 0.05 + uTime * 1.3, q.x * 0.03))) * 0.42;
    // air: thin, but there is a horizon in it
    float dist = distance(vW, cameraPosition);
    vec3 haze = mix(vec3(0.012, 0.015, 0.03), vec3(0.42, 0.17, 0.09), smoothstep(-260.0, 200.0, s)) * (1.0 + uFlash * 1.5);
    col = mix(col, haze, uHaze * (1.0 - exp(-dist * 0.0014)));
    gl_FragColor = vec4(col, 1.0);
  }
`;
// The tall, and their young: a dark shape to the eye, warm to the lamp.
const TALL_VERT = /* glsl */ `
  attribute float aGo;
  attribute float aHot;
  uniform float uTime;
  uniform vec3 uOff;
  varying vec3 vW;
  varying vec3 vP;
  varying vec3 vN;
  varying float vHot;
  varying float vBody;
  void main() {
    vec3 p = position;
    // four long legs, walking: each swings from where it joins the body
    float leg = clamp((2.9 - p.y) / 2.9, 0.0, 1.0) * step(p.y, 2.9);
    float phase = dot(instanceMatrix[3].xz, vec2(0.37, 0.61));
    p.z += sign(p.x) * sign(p.z) * sin(uTime * 3.4 + phase) * leg * 0.75 * aGo;
    p.y += sin(uTime * 3.4 * 2.0 + phase) * 0.05 * aGo * (1.0 - leg);
    vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vW = w.xyz;
    vP = (instanceMatrix * vec4(p, 1.0)).xyz + uOff;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vHot = aHot;
    vBody = smoothstep(2.4, 3.4, position.y);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const TALL_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  uniform float uTerm;
  uniform float uAurora;
  uniform float uBandX;
  uniform float uBandHW;
  uniform float uFireK;
  uniform vec3 uFireCol;
  uniform float uEdgeX;
  varying vec3 vW;
  varying vec3 vP;
  varying vec3 vN;
  varying float vHot;
  varying float vBody;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vW);
    float s = vP.x - uTerm;
    // to the eye: nearly nothing. A rim of dusk on the sunward side, firelight near the fires.
    vec3 col = vec3(0.008, 0.01, 0.016);
    col += vec3(0.5, 0.2, 0.1) * max(n.x, 0.0) * smoothstep(-330.0, -60.0, s) * 0.3;
    col += uFireCol * uFireK * (0.25 + 0.75 * max(n.x, 0.0)) * exp(-abs(vP.x - uEdgeX) / 38.0) * 0.4;
    // in the beam: a pale hide
    col += vec3(0.5, 0.62, 0.6) * uLampTint * lampLit(0.0, vW) * (0.3 + 0.7 * max(dot(n, -uLampDir), 0.0));
    // in the infrared: its own warmth, hottest at the heart, and the young burn hotter than the grown
    float core = pow(max(dot(n, v), 0.0), 1.6);
    vec3 heat = mix(vec3(0.9, 0.2, 0.03), vec3(1.0, 0.86, 0.55), core * (0.45 + 0.55 * vBody) * (0.7 + 0.3 * vHot));
    col = mix(col, heat * (0.55 + 0.6 * vHot), lampSeen(2.0, vW));
    // under the band when it comes down
    float band = 1.0 - smoothstep(uBandHW * 0.55, uBandHW, abs(vP.x - uBandX));
    col += vec3(0.2, 0.9, 0.45) * uAurora * band * (0.25 + 0.75 * max(n.y, 0.0)) * 0.5;
    gl_FragColor = vec4(col, 1.0);
  }
`;
// A warm vent: there in the infrared, and not otherwise.
const VENT_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  ${NOISE}
  uniform float uTime;
  varying vec3 vW;
  varying vec3 vP;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float a = lampSeen(2.0, vW) * (1.0 - smoothstep(0.2, 1.0, r)) * (0.6 + 0.4 * vnoise(vP.xz * 0.8 + uTime * 0.3));
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(vec3(0.9, 0.22, 0.04), vec3(1.0, 0.8, 0.45), 1.0 - r) * a, 1.0);
  }
`;
const VENT_VERT = /* glsl */ `
  uniform vec3 uOff;
  varying vec3 vW;
  varying vec3 vP;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vP = position + uOff;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
// The line in the night sky: hydrogen, glowing. One band of the lamp sees it
// before the flare; during it, anyone can.
const SKY_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  ${NOISE}
  uniform float uTime;
  uniform float uAurora;
  varying vec3 vW;
  varying vec3 vP;
  varying vec2 vUv;
  void main() {
    float ray = 0.35 + 0.65 * vnoise(vec2(vP.z * 0.045 + uTime * 0.12, 1.7));
    ray *= 0.6 + 0.4 * vnoise(vec2(vP.z * 0.31, uTime * 0.5));
    float fall = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
    float ends = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
    float faint = lampBand(3.0) * 0.13;
    vec3 col = vec3(1.0, 0.16, 0.24) * faint + mix(vec3(0.2, 1.0, 0.5), vec3(1.0, 0.2, 0.35), smoothstep(0.3, 0.9, vUv.y)) * uAurora * 1.3;
    float a = ray * fall * ends;
    if (a * (faint + uAurora) < 0.004) discard;
    gl_FragColor = vec4(col * a, 1.0);
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

// ctx: the system's (world/dusk-system.js): { scene, camera, chapter, voyage, season, fixed }
// story: { stage(), reached(s), advance(s), revert(s) }: the chapter's stage machine
export function createDuskGround(ctx, story) {
  const { chapter, season, fixed } = ctx;
  const group = new THREE.Group();
  const time = { value: 0 };
  const off = { value: new THREE.Vector3() };
  const fires = FIRES_Z.map((z) => new THREE.Vector3(C.DUSK_EDGE_X, z, 1)); // (x, z, lit) for the shader
  const U = {
    ...LAMP_U, uOff: off, uTime: time, uTerm: { value: 0 }, uHaze: { value: 0 }, uFlash: { value: 0 }, uAurora: { value: 0 },
    uBandX: { value: C.DUSK_BAND_X }, uBandHW: { value: C.DUSK_BAND_HW }, uFireK: { value: 1 }, uFireCol: { value: new THREE.Color(1.0, 0.45, 0.16) },
    uFire: { value: fires }, uEdgeX: { value: C.DUSK_EDGE_X },
  };

  // --- the ground, and the world it is a strip of ---
  const gw = X1 - X0 + 160, gd = ZW * 2 + 120;
  const groundGeo = new THREE.PlaneGeometry(gw, gd, 150, 52).rotateX(-Math.PI / 2).translate((X0 + X1) / 2, 0, 0);
  {
    const p = groundGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, groundY(p.getX(i), p.getZ(i)));
    groundGeo.computeVertexNormals();
  }
  const ground = new THREE.Mesh(groundGeo, new THREE.ShaderMaterial({ uniforms: { ...U, uGlobe: { value: 0 } }, vertexShader: VERT, fragmentShader: GROUND_FRAG, fog: false }));
  ground.frustumCulled = false;
  group.add(ground);
  const globeOff = new THREE.Vector3(0, -R - 0.8, 0);
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(R, 128, 80),
    new THREE.ShaderMaterial({ uniforms: { ...U, uOff: { value: globeOff }, uGlobe: { value: 1 } }, vertexShader: VERT, fragmentShader: GROUND_FRAG, fog: false }),
  );
  globe.position.copy(globeOff);
  globe.frustumCulled = false;
  group.add(globe);

  // --- what stands still: the pad, stones, the cairns the picket fires burn on, the lee ---
  const litMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  {
    const lit = [], glow = [];
    const py = groundY(PAD[0], PAD[1]);
    lit.push(tint(cyl(PAD_R, PAD_R + 1.5, 0.5, PAD[0], py - 0.1, PAD[1], 28), 0x4a362c));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      glow.push(tint(box(0.6, 0.16, 0.6, PAD[0] + Math.cos(a) * (PAD_R - 0.8), py + 0.2, PAD[1] + Math.sin(a) * (PAD_R - 0.8)), 0xffa25a, 1.4));
    }
    const rng = mulberry32(0x2d05c);
    for (let i = 0; i < 110; i++) {
      const x = X0 + rng() * (X1 - X0 + 60), z = (rng() * 2 - 1) * (ZW + 40);
      if (Math.hypot(x - PAD[0], z - PAD[1]) < PAD_R + 6) continue;
      const r = 0.3 + rng() * rng() * 1.6;
      lit.push(tint(new THREE.SphereGeometry(r, 5, 4).rotateY(rng() * 6).scale(1, 0.6 + rng() * 0.5, 1).translate(x, groundY(x, z) + r * 0.2, z), 0x3a2a22));
    }
    // the lee: a low ridge past the far end of the edge, out of the band
    for (let i = 0; i < 14; i++) {
      const x = -330 + i * 22 + rng() * 8, z = ZW + 22 + rng() * 10, r = 7 + rng() * 9;
      lit.push(tint(new THREE.SphereGeometry(r, 6, 4).rotateY(rng() * 6).scale(1.5, 0.8, 0.9).translate(x, groundY(x, z) + r * 0.25, z), 0x2a2022));
    }
    for (const f of fires) lit.push(tint(cyl(0.7, 1.2, 1.2, f.x, groundY(f.x, f.y) + 0.5, f.y, 7), 0x33261f));
    group.add(mergedMesh(lit, litMat));
    group.add(mergedMesh(glow, glowMat));
  }
  // the fires themselves (put out, or turned to torches, by what is decided)
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const flames = fires.map((f) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.6, 7), flameMat);
    m.position.set(f.x, groundY(f.x, f.y) + 2.3, f.y);
    group.add(m);
    return m;
  });
  // warm vents
  const ventGeo = new THREE.CircleGeometry(C.DUSK_VENT_R, 24).rotateX(-Math.PI / 2);
  const vents = VENTS.map(([x, z]) => {
    const m = new THREE.Mesh(ventGeo, new THREE.ShaderMaterial({ uniforms: { ...U, uOff: { value: new THREE.Vector3(x, 0, z) } }, vertexShader: VENT_VERT, fragmentShader: VENT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    m.position.set(x, groundY(x, z) + 0.25, z);
    m.renderOrder = 5;
    group.add(m);
    return { x, z };
  });
  // the line in the sky, over the band
  const skyOff = new THREE.Vector3(C.DUSK_BAND_X, 150, 0);
  const curtain = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 330, 1, 1).rotateY(Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms: { ...U, uOff: { value: skyOff } }, vertexShader: VENT_VERT, fragmentShader: SKY_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
  );
  curtain.position.copy(skyOff);
  curtain.frustumCulled = false;
  curtain.renderOrder = 6;
  group.add(curtain);
  // the flare, on the horizon where the star is
  const flareMat = new THREE.SpriteMaterial({ color: 0xfff0e0, map: glowTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const flareSprite = new THREE.Sprite(flareMat);
  flareSprite.position.set(3200, 40, 0);
  flareSprite.visible = false;
  group.add(flareSprite);
  // ...and the glow it lays along that horizon the rest of the time
  const duskGlow = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff4a26, map: flareMat.map, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  duskGlow.position.set(3400, 20, 0);
  duskGlow.scale.set(5200, 1500, 1);
  group.add(duskGlow);

  // --- the camp: sledges hauled by hand, and the people who haul them ---
  const camp = new THREE.Group();
  group.add(camp);
  const SLEDGES = [[0, 0, 0.1], [-13, 9, -0.2], [-12, -11, 0.25], [12, -9, -0.1], [-26, -1, 0.05], [-25, 17, 0.3]];
  {
    const lit = [], glow = [];
    for (const [x, z, yaw] of SLEDGES) {
      const part = (g) => g.rotateY(yaw).translate(x, 0, z);
      for (const s of [-1, 1]) lit.push(tint(part(box(7.4, 0.3, 0.4, 0, 0.15, s * 1.5)), 0x2e2420));
      lit.push(tint(part(box(6.6, 0.25, 3.4, 0, 1.25, 0)), 0x5a4636));
      for (const sx of [-2.6, 2.6]) for (const sz of [-1.5, 1.5]) lit.push(tint(part(box(0.24, 1.1, 0.24, sx, 0.7, sz)), 0x2e2420));
      // the awning: hide over hoops
      lit.push(tint(part(new THREE.CylinderGeometry(1.75, 1.75, 6.2, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 1.4, 0)), 0x8a6a4a));
      // water skins slung underneath: what they shelter under
      for (const sx of [-1.8, 0, 1.8]) lit.push(tint(part(new THREE.SphereGeometry(0.62, 8, 6).scale(1.25, 0.8, 1).translate(sx, 0.75, 0)), 0x3c5a66));
      glow.push(tint(part(box(0.3, 0.3, 0.3, 3.5, 1.75, 0)), 0xffb060, 1.3));
    }
    camp.add(mergedMesh(lit, litMat));
    camp.add(mergedMesh(glow, glowMat));
  }
  const WALK_AT = [ELDER, [5, 20], [-6, 14], [-19, 22], [3, -17], [-18, -19], [-33, 8], [18, 2], [-8, -4], [-30, -12], [22, -16], [-36, 24]];
  const walkers = [];
  for (let i = 0; i < Math.min(WALK_AT.length, Math.round(C.DUSK_WALKERS)); i++) {
    const rig = measureRig(buildRig(0x5111 + i * 7919, 'dusk'));
    rig.group.scale.setScalar(i === 0 ? 1.08 : 0.92 + 0.02 * (i % 5));
    group.add(rig.group);
    walkers.push({ rig, at: WALK_AT[i], x: 0, z: 0 });
  }
  // the pickets: three walkers who stand at the fires
  const pickets = [1, 2, 3].map((i) => {
    const rig = measureRig(buildRig(0x91c7 + i * 104729, 'dusk'));
    const z = FIRES_Z[i] + 4, x = C.DUSK_EDGE_X + 5;
    rig.group.position.set(x, 0, z);
    rig.group.rotation.y = -Math.PI / 2; // facing the night
    group.add(rig.group);
    return { rig, x, z };
  });

  // --- the tall ---
  const tallGeo = (() => {
    const parts = [];
    parts.push(tint(new THREE.SphereGeometry(1, 12, 9).scale(0.8, 0.72, 1.55).translate(0, 3.35, 0), 0xffffff));
    parts.push(tint(new THREE.CylinderGeometry(0.2, 0.34, 2.5, 7).rotateX(0.75).translate(0, 4.5, 1.75), 0xffffff));
    parts.push(tint(new THREE.SphereGeometry(1, 9, 7).scale(0.34, 0.3, 0.62).translate(0, 5.5, 2.75), 0xffffff));
    parts.push(tint(new THREE.ConeGeometry(0.3, 1.7, 6).rotateX(-1.9).translate(0, 3.2, -2.1), 0xffffff));
    for (const sx of [-0.5, 0.5]) for (const sz of [-0.95, 0.95]) parts.push(tint(new THREE.CylinderGeometry(0.1, 0.14, 3.0, 6).translate(sx, 1.5, sz), 0xffffff));
    const geo = mergedMesh(parts, null).geometry;
    geo.deleteAttribute('color');
    return geo;
  })();
  const PER = 2 + YOUNG;
  const N_TALL = DUSK_GROUPS_Z.length * PER;
  const aGo = new THREE.InstancedBufferAttribute(new Float32Array(N_TALL), 1);
  const aHot = new THREE.InstancedBufferAttribute(new Float32Array(N_TALL), 1);
  tallGeo.setAttribute('aGo', aGo);
  tallGeo.setAttribute('aHot', aHot);
  const tall = new THREE.InstancedMesh(tallGeo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: TALL_VERT, fragmentShader: TALL_FRAG, fog: false }), N_TALL);
  tall.frustumCulled = false;
  group.add(tall);
  // each group: two grown on the outside, the young between them
  const groups = DUSK_GROUPS_Z.map((z, i) => {
    const rng = mulberry32(0x7a11 + i * 31);
    const members = [];
    members.push({ dx: 5.5, dz: 3, k: 1.5 + rng() * 0.2, young: false });
    members.push({ dx: -5, dz: -4, k: 1.45 + rng() * 0.2, young: false });
    for (let j = 0; j < YOUNG; j++) members.push({ dx: (rng() - 0.5) * 4.5, dz: (j - 1) * 3.2 + rng(), k: 0.52 + rng() * 0.12, young: true });
    for (let j = 0; j < PER; j++) aHot.setX(i * PER + j, members[j].young ? 1 : 0);
    return {
      i, members, home: { x: -352 - 22 * (i % 2), z }, homeX: -352 - 22 * (i % 2), pos: new THREE.Vector3(-352, 0, z), yaw: Math.PI / 2,
      state: 'away', seen: 0, counted: false, turn: 0, path: null, go: 0, down: 0, t0: rng() * 20,
    };
  });
  aHot.needsUpdate = true;
  const LEE = groups.map((g) => ({ x: -160 - 26 * g.i, z: ZW - 10 }));
  const GAP = { x: C.DUSK_EDGE_X + 6, z: ZW - 28 }; // the open end of the edge, by the lee

  // --- the lamp in the pilot's hand ---
  const hand = new THREE.Group();
  hand.rotation.order = 'YXZ';
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(Math.tan(C.EZ_LAMP_CONE), 1, 24, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms: LAMP_U, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
  );
  beam.frustumCulled = false;
  beam.renderOrder = 7;
  hand.add(beam);
  hand.visible = false;
  group.add(hand);

  // --- whoever came along in the freighter ---
  const bucket = () => (story.reached('flare') ? 'after' : story.reached('asked') ? 'edge' : 'early');
  const crew = createCrewFollow({
    group, floorY: groundY,
    talk: (c) => ({ speaker: { name: c.name, species: c.species, cityId: DUSK.elder.cityId }, lines: DUSK.ground[c.id][bucket()], cine: true }),
  });

  // --- state ---
  let term = 0; // where the twilight line is, along x
  let termV = 0; // ...and how fast it is moving
  let campX = 0, campHeld = null; // (held: the sledges are down, for the flare)
  let walker = null, walkerLive = null, inside = false, prev = null;
  let heat = 0, cold = 0, warnedHot = false, warnedCold = false, onVent = false;
  let scene = null; // { kind, clock }
  let said = -1, sinceForecast = -1;
  let forecastOpen = false;
  let lampOn = false, lastChanged = -1, lastBand = -1, skyHold = 0, skySeen = false, hinted = 0;
  let actT = -1, actDone = false, saidMinute = false, saidFront = 0, broke = 0;
  let outcome = null; // set as the flare begins: { how, young, key }
  let dead = null, deathLine = null;
  const later = []; // things to be said once nobody is being talked to
  let panelText = null;
  const _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  const decision = () => season.get(KEY);
  const say = (line, sec) => crewSay(chapter, line, sec);
  const elderAt = () => ({ x: campX + ELDER[0], z: CAMP_Z + ELDER[1] });

  // --- the tall: where each one is, from its group ---
  function placeTall() {
    for (const g of groups) {
      const shown = g.state !== 'away';
      const sy = Math.sin(g.yaw), cy = Math.cos(g.yaw);
      for (let j = 0; j < PER; j++) {
        const m = g.members[j];
        const x = g.pos.x + cy * m.dx + sy * m.dz, z = g.pos.z - sy * m.dx + cy * m.dz;
        const lie = 1 - 0.55 * g.down;
        _p.set(x, groundY(x, z) - (shown ? 0 : 400), z);
        _m.compose(_p, _q.setFromEuler(_e.set(0, g.yaw, 0)), _s.set(m.k, m.k * lie, m.k));
        tall.setMatrixAt(g.i * PER + j, _m);
        aGo.setX(g.i * PER + j, g.go * (1 - g.down));
      }
    }
    tall.instanceMatrix.needsUpdate = true;
    aGo.needsUpdate = true;
  }
  function head(g, x, z, speed, d) {
    const dx = x - g.pos.x, dz = z - g.pos.z, dd = Math.hypot(dx, dz);
    if (dd < 0.5) {
      g.go = 0;
      return true;
    }
    const step = Math.min(dd, speed * d);
    g.pos.x += (dx / dd) * step;
    g.pos.z += (dz / dd) * step;
    let dy = Math.atan2(dx, dz) - g.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    g.yaw += dy * Math.min(1, 3 * d);
    g.go = Math.min(1, speed / 4);
    return dd - step < 0.5;
  }
  // a group pacing where it is kept: up toward the fires, and back
  function mill(g, t, d) {
    const a = t * 0.11 + g.t0;
    head(g, g.home.x + 24 * Math.sin(a), g.home.z + 11 * Math.sin(a * 0.63 + 1.3), C.DUSK_HERD_SPEED, d);
  }
  function settleGroups() {
    const st = story.stage();
    const act = st === 'decided' || st === 'acted';
    for (const g of groups) {
      g.turn = 0;
      g.path = null;
      g.down = 0;
      g.go = 0;
      g.home.x = g.homeX;
      g.pos.set(g.home.x, 0, g.home.z);
      g.yaw = Math.PI / 2;
      if (!story.reached('asked')) g.state = 'away';
      else if (story.reached('flare')) {
        // afterwards: whoever got out is in the lee, and nobody is where the band came down
        const out = outcome ? !!(outcome.safe & (1 << g.i)) : false;
        g.state = out ? 'safe' : 'away';
        if (out) {
          g.pos.set(LEE[g.i].x, 0, LEE[g.i].z);
          g.yaw = 0;
        }
      } else if (act && decision() === 'arm') {
        g.state = 'wait';
        g.pos.set(C.DUSK_BAND_X + 40, 0, g.home.z);
      } else g.state = 'mill';
      if (!story.reached('seen')) {
        g.seen = 0;
        g.counted = false;
      } else g.counted = true;
    }
    placeTall();
  }
  const count = (state) => groups.filter((g) => g.state === state).length;
  const seenN = () => groups.filter((g) => g.counted).length;

  // --- the fires, by what has been decided ---
  function setFires() {
    const st = story.stage();
    const act = st === 'decided' || st === 'acted';
    const d = decision();
    const outNow = (act && d === 'warn') || (story.reached('flare') && outcome && outcome.how !== 'armed');
    const torch = act && d === 'arm';
    U.uFireK.value = outNow ? 0 : torch ? 2.6 : 1;
    U.uFireCol.value.setRGB(torch ? 0.75 : 1.0, torch ? 0.85 : 0.45, torch ? 1.0 : 0.16);
    flameMat.color.setRGB(torch ? 0.7 : 1.0, torch ? 0.85 : 0.6, torch ? 1.0 : 0.25);
    for (const f of flames) f.visible = !outNow;
    for (const p of pickets) p.rig.group.visible = !outNow;
  }

  // --- the scenes: one clock each, and everything placed from it ---
  function begin(kind, clock) {
    scene = { kind, clock };
    hand.visible = false; // (the beam is not in the picture)
    chapterHud.cine(true);
    clock.begin();
  }
  function endScene() {
    scene = null;
    hand.visible = lampOn;
    chapterHud.cine(false);
  }
  // the edge: something tall comes up to the firelight, and turns back from it
  const edgeClock = createSceneClock({
    T: C.DUSK_EDGE_T, lines: DUSK.edge, say: (l) => say(l, 6),
    pose(u) {
      for (const g of groups) {
        g.state = 'mill';
        const k = Math.pow(Math.max(0, Math.sin(u * 0.42 + g.i * 1.1)), 2);
        g.pos.set(g.home.x + (C.DUSK_EDGE_X - 26 - g.home.x) * k, 0, g.home.z + 6 * Math.sin(u * 0.2 + g.i));
        g.yaw = Math.PI / 2 + (Math.cos(u * 0.42 + g.i * 1.1) < 0 ? Math.PI : 0);
        g.go = 0.8;
      }
      placeTall();
    },
    onEnd() {
      endScene();
      story.advance('edge');
      settleGroups();
      lampUp();
      later.push({ text: DUSK.lampHint, sec: 9 });
    },
  });
  // what the lamp shows: every band at once, from above, for as long as it takes to understand it
  const seenClock = createSceneClock({
    T: C.DUSK_SEEN_T, lines: DUSK.seen, say: (l) => say(l, 6),
    pose(u) {
      for (const g of groups) {
        g.state = 'mill';
        g.pos.set(g.home.x + 5 * Math.sin(u * 0.3 + g.i), 0, g.home.z - 10 + u * 0.9);
        g.yaw = 0;
        g.go = 0.5;
      }
      placeTall();
    },
    onEnd() {
      endScene();
      lamp.canAll = false;
      lamp.power = C.DUSK_LAMP_POWER;
      stepLamp(0, false);
      story.advance('seen');
      settleGroups();
      logChime();
    },
  });
  function beginSeen() {
    for (const g of groups) g.counted = true;
    skySeen = true;
    lamp.on = true;
    lamp.canAll = true;
    lamp.power = 4; // (for the length of the scene the whole night is in reach)
    begin('seen', seenClock);
  }
  let flareClock = null;
  function flarePose(u) {
    const flash = ease(1.5, 5, u) * (1 - 0.8 * ease(9, 17, u)) * (1 - ease(36, C.DUSK_FLARE_T, u));
    const aur = ease(16, 23, u) * (1 - ease(37, C.DUSK_FLARE_T, u));
    U.uFlash.value = flash;
    U.uAurora.value = aur;
    flareSprite.visible = flash > 0.01;
    flareMat.opacity = Math.min(1, flash * 1.2);
    flareSprite.scale.setScalar(500 + 2600 * flash);
    chapterHud.white(0.5 * ease(2, 3.4, u) * (1 - ease(3.4, 6.5, u)));
    const fall = ease(24, 32, u);
    for (const g of groups) if (g.state === 'caught') g.down = fall;
    placeTall();
    setRoar(Math.max(flash * 0.6, aur));
    setEventRumble(Math.max(flash, aur) * 0.7);
  }
  function beginFlare() {
    if (scene || story.stage() !== 'decided') return false;
    // how it went, fixed now: the flare itself changes nothing that was done
    const d = decision();
    for (const g of groups) {
      if (g.state === 'safe' || g.state === 'led' || g.state === 'broke') {
        g.state = 'safe';
        g.pos.set(LEE[g.i].x, 0, LEE[g.i].z);
      } else {
        g.state = 'caught';
        g.pos.set(C.DUSK_BAND_X + 30 + 18 * g.i, 0, g.home.z * 0.8);
      }
      g.go = 0;
    }
    const out = count('safe');
    const how = d === 'arm' ? 'armed' : out === groups.length ? 'rerouted' : out > 0 ? 'partial' : 'unheeded';
    let safe = 0; // which groups got out, one bit each
    for (const g of groups) if (g.state === 'safe') safe |= 1 << g.i;
    outcome = { how, groups: out, safe, young: out * YOUNG, of: groups.length * YOUNG, key: how };
    story.advance('acted');
    later.length = 0;
    campHeld = campX;
    lampDown();
    chapterHud.panel(null);
    panelText = null;
    const lines = [...DUSK.flare.open, ...DUSK.flare[outcome.key], DUSK.flare.close];
    flareClock = createSceneClock({
      T: C.DUSK_FLARE_T, lines, say: (l) => say(l, 6.5), pose: flarePose,
      onEnd() {
        endScene();
        flarePose(C.DUSK_FLARE_T);
        chapterHud.white(0);
        setRoar(0);
        setEventRumble(0);
        fixed.resolve('flare', outcome.how, { young: outcome.young, of: outcome.of, groups: outcome.groups, safe: outcome.safe });
        season.set('ch2.young', outcome.young);
        story.advance('flare');
        season.survive(KEY); // the choice has been lived through: it stays made
        campHeld = null;
        actT = -1;
        setFires();
        settleGroups();
      },
    });
    begin('flare', flareClock);
    return true;
  }

  // --- the lamp ---
  function lampUp() {
    if (lampOn) return;
    lampOn = true;
    resetLamp(true);
    lamp.medium = 'void';
    lamp.power = C.DUSK_LAMP_POWER;
    lamp.lineBeam = false;
    lastChanged = lamp.changed;
    lastBand = lamp.band;
    input.bandPrev = input.lampToggle = false;
    lampHud.show(true, false, DUSK.keys);
    hand.visible = true;
  }
  function lampDown() {
    if (!lampOn) return;
    lampOn = false;
    lampHud.show(false);
    hand.visible = false;
    lamp.on = false;
    stepLamp(0, false);
  }

  // --- the decision ---
  function decide(option) {
    if (story.stage() !== 'seen' || (option !== 'arm' && option !== 'warn')) return false;
    season.offer(KEY, 'dusk:ask', { stage: 'seen' });
    season.decide(KEY, option);
    story.advance('decided');
    actT = 0;
    actDone = false;
    saidMinute = false;
    saidFront = 0;
    broke = 0;
    campHeld = campX; // the sledges go down where they are
    setFires();
    settleGroups();
    uiSound('engage');
    const o = option === 'arm' ? DUSK.armed : DUSK.warned;
    later.push(o.crew, { text: o.hint, sec: 10 });
    return true;
  }
  // dying, or leaving, with the choice not yet lived through: it is unmade
  function unmake() {
    const st = story.stage();
    if (st !== 'decided' && st !== 'acted') return false;
    if (scene) {
      scene.clock.stop();
      endScene();
    }
    season.die();
    story.revert('seen');
    actT = -1;
    campHeld = null;
    outcome = null;
    U.uFlash.value = U.uAurora.value = 0;
    flareSprite.visible = false;
    chapterHud.white(0);
    setRoar(0);
    setEventRumble(0);
    setFires();
    settleGroups();
    return true;
  }
  function die(cause) {
    if (dead || site.portal) return;
    const st = story.stage();
    dead = (st === 'decided' || st === 'acted') && cause === 'cold' ? 'night' : cause;
    site.portal = 'dusk:back';
  }

  // --- Renn ---
  function elderTalk() {
    const st = story.stage();
    const speaker = DUSK.elder;
    if (!story.reached('asked')) {
      story.advance('asked');
      settleGroups();
      later.push(DUSK.askCrew);
      return { speaker, lines: DUSK.ask, cine: true };
    }
    if (st === 'asked' || st === 'edge') return { speaker, lines: DUSK.askAgain, cine: true };
    if (st === 'seen') {
      season.offer(KEY, 'dusk:ask', { stage: 'seen' }); // the checkpoint, as the decision is shown
      return {
        speaker, lines: DUSK.decide.lines, cine: true,
        offer: { kind: 'choice', prompt: DUSK.decide.prompt, options: [{ label: DUSK.decide.arm, outcomeTag: 'dusk:arm' }, { label: DUSK.decide.warn, outcomeTag: 'dusk:warn' }] },
      };
    }
    if (st === 'decided' || st === 'acted') return { speaker, lines: [(decision() === 'arm' ? DUSK.armed : DUSK.warned).lines.at(-1)], cine: true };
    if (st === 'flare') {
      story.advance('done');
      return { speaker, lines: DUSK.done[outcome ? outcome.key : 'again'] || DUSK.done.again, cine: true };
    }
    return { speaker, lines: DUSK.done.again, cine: true };
  }
  const elderNpc = { x: 0, y: 0, z: 0, h: 2.6, role: 'elder', talk: elderTalk };
  const shelter = {
    x: 0, y: 0, z: CAMP_Z, r: C.DUSK_SHELTER_R, prompt: DUSK.shelterPrompt,
    off: () => story.stage() !== 'decided' || !!scene,
    use: () => (beginFlare(), null),
  };

  // --- what the corner of the screen says ---
  const bar = (v) => '█'.repeat(Math.round(v * 10)).padEnd(10, '░');
  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function panel() {
    const st = story.stage();
    const rows = [];
    if (st === 'decided') rows.push(DUSK.hud.flare + mmss(Math.max(0, actLen() - actT)));
    else if (story.reached('forecast') && !story.reached('acted')) rows.push(DUSK.hud.flareSoon);
    if (st === 'edge') rows.push(`${DUSK.hud.seen}${seenN()} / ${groups.length}`);
    if (st === 'decided') rows.push(decision() === 'arm' ? `${DUSK.hud.held}${count('penned') + count('driven')} / ${groups.length}` : `${DUSK.hud.turned}${count('safe') + count('led')} / ${groups.length}`);
    if (st === 'flare') rows.push(DUSK.hud.talk);
    if (st === 'done') rows.push(DUSK.hud.done);
    if (heat > 0.03) rows.push(DUSK.hud.heat + bar(heat));
    if (cold > 0.03) rows.push(DUSK.hud.cold + bar(cold));
    const text = rows.length && !scene ? rows.join('\n') : null;
    if (text !== panelText) chapterHud.panel((panelText = text));
  }
  const actLen = () => (decision() === 'arm' ? C.DUSK_ARM_TIME : C.DUSK_WARN_TIME);

  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: ctx.sunDir },
    surfaces: [],
    colliders: [
      ...fires.map((f) => ({ x: f.x, z: f.y, r: 1.3, top: Infinity })),
    ],
    floorYAt: (x, z) => (x > X0 && x < X1 && Math.abs(z) < ZW ? groundY(x, z) : -Infinity),
    snap: 1.6,
    pad: new THREE.Vector3(PAD[0], groundY(PAD[0], PAD[1]) + 0.15, PAD[1]),
    padR: PAD_R,
    spawn: new THREE.Vector3(PAD[0] - 9, groundY(PAD[0] - 9, PAD[1] - 12), PAD[1] - 12),
    leaveHint: DUSK.camp.leaveHint,
    npcs: [elderNpc, ...crew.npcs],
    consoles: [shelter],
    portal: null, // 'dusk:back': the pilot has died here
    onChoice(tag) {
      const option = tag === 'dusk:arm' ? 'arm' : tag === 'dusk:warn' ? 'warn' : null;
      if (!option || !decide(option)) return null;
      return { speaker: DUSK.elder, lines: (option === 'arm' ? DUSK.armed : DUSK.warned).lines, cine: true };
    },
    mark() {
      const st = story.stage();
      if (scene) return null;
      const e = elderAt();
      if (st === 'forecast' || st === 'seen' || st === 'flare') return { x: e.x, z: e.z, label: DUSK.marks.elder };
      if (st === 'asked') return { x: C.DUSK_EDGE_X + 12, z: 0, label: DUSK.marks.edge };
      if (st === 'decided' && (actDone || actLen() - actT < 60)) return { x: shelter.x, z: shelter.z, label: DUSK.marks.shelter };
      return null;
    },
    held: () => !!scene,
    act() {
      if (scene) scene.clock.skip();
    },
    heldPrompt: () => (scene ? DUSK.skip : ''),
    camera(pos, target) {
      if (!scene) return false;
      const u = Math.max(0, scene.clock.u());
      const pz = cWalk.pos.z;
      if (scene.kind === 'edge') {
        const x = C.DUSK_EDGE_X + 20 - u * 0.3;
        pos.set(x, groundY(x, pz) + 3.4, pz + 7);
        target.set(C.DUSK_EDGE_X - 70, groundY(C.DUSK_EDGE_X - 70, pz) + 5, pz * 0.5);
      } else if (scene.kind === 'seen') {
        const x = C.DUSK_EDGE_X + 34 - u * 0.9;
        pos.set(x, groundY(x, 0) + 7 + u * 0.55, pz * 0.3 - 30 + u * 1.2);
        target.set(C.DUSK_BAND_X + 120, 14 + u * 0.5, 10);
      } else {
        const cx = campHeld ?? campX;
        if (u < 15) {
          // from under the awning, toward the star
          pos.set(cx - 9 + u * 0.12, groundY(cx - 9, CAMP_Z) + 1.5, CAMP_Z + 0.8);
          target.set(cx + 420, groundY(cx, CAMP_Z) + 26, CAMP_Z - 20);
        } else {
          // ...and then the other way, at the night
          pos.set(cx + 6 - (u - 15) * 0.2, groundY(cx + 6, CAMP_Z) + 2.4 + (u - 15) * 0.22, CAMP_Z + 4);
          target.set(C.DUSK_BAND_X + 60, 55 + (u - 15) * 0.6, 40);
        }
      }
      return true;
    },
    setWalker(p, live) {
      walker = p || null;
      walkerLive = p ? live || null : null;
    },
    onEnter() {
      if (inside) return;
      inside = true;
      site.portal = null;
      dead = null;
      const sc = ctx.scene;
      prev = {
        fog: sc.fog,
        lightColor: sun.light.color.clone(), lightI: sun.light.intensity,
        ambColor: sun.ambient.color.clone(), ambI: sun.ambient.intensity,
        lampPower: lamp.power, lampMedium: lamp.medium, lampCanAll: lamp.canAll, lampOn: lamp.on, lampBand: lamp.band,
      };
      sc.fog = new THREE.FogExp2(0x1a0d0a, 0.0024);
      U.uHaze.value = 1;
      heat = cold = 0;
      warnedHot = warnedCold = false;
      scene = null;
      said = story.reached('asked') ? 99 : -1;
      sinceForecast = story.reached('forecast') ? 0 : -1;
      forecastOpen = false;
      skyHold = 0;
      skySeen = false;
      hinted = 0;
      later.length = 0;
      if (deathLine) later.push({ text: deathLine, sec: 9 });
      deathLine = null;
      panelText = null;
      actT = -1; // (a choice not lived through was unmade on the way out: there is no clock to come back to)
      campHeld = null;
      setFires();
      settleGroups();
      lampOn = false;
      if (story.reached('edge') && !story.reached('flare')) lampUp();
      crew.set(ctx.voyage.crew());
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      unmake(); // (left, by any way out, with the flare still to come: the asking is to be done again)
      if (scene) {
        scene.clock.stop();
        endScene();
      }
      crew.set([]);
      lampHud.show(false);
      lampOn = false;
      hand.visible = false;
      hush();
      setEventRumble(0);
      chapterHud.clear();
      chapterHud.panel(null);
      panelText = null;
      U.uHaze.value = 0;
      U.uFlash.value = U.uAurora.value = 0;
      flareSprite.visible = false;
      lamp.power = prev.lampPower;
      lamp.medium = prev.lampMedium;
      lamp.canAll = prev.lampCanAll;
      lamp.on = prev.lampOn;
      lamp.band = prev.lampBand;
      stepLamp(0, false);
      ctx.scene.fog = prev.fog;
      sun.light.color.copy(prev.lightColor);
      sun.light.intensity = prev.lightI;
      sun.ambient.color.copy(prev.ambColor);
      sun.ambient.intensity = prev.ambI;
      prev = null;
    },
    inside: () => inside,
    // Every frame the system is mounted (src/voyage.js), walked or not: the
    // twilight line, the camp keeping pace with it, and the fires.
    update(dt, t) {
      const d = Math.min(dt, 0.1);
      time.value = t;
      U.uTerm.value = term;
      // the camp walks with the line, unless the sledges are down
      campX = campHeld ?? term;
      const moving = campHeld == null && Math.abs(termV) > 0.12;
      camp.position.set(campX, groundY(campX, CAMP_Z), CAMP_Z);
      const dir = termV >= 0 ? Math.PI / 2 : -Math.PI / 2;
      for (let i = 0; i < walkers.length; i++) {
        const w = walkers[i];
        w.x = campX + w.at[0];
        w.z = CAMP_Z + w.at[1];
        const g = w.rig.group;
        g.position.x = w.x;
        g.position.z = w.z;
        // (Renn turns to whoever has walked up to her)
        const near = i === 0 && walker && Math.hypot(walker.x - w.x, walker.z - w.z) < 9;
        g.rotation.y = near ? Math.atan2(walker.x - w.x, walker.z - w.z) : moving ? dir : g.rotation.y;
        if (inside || i < 4) {
          poseRig(w.rig, d, t, moving && !near ? 'walk' : 'idle', 0.25);
          standRig(w.rig, groundY(w.x, w.z));
        }
      }
      const e = elderAt();
      elderNpc.x = e.x;
      elderNpc.z = e.z;
      elderNpc.y = groundY(e.x, e.z);
      shelter.x = campX;
      shelter.y = groundY(campX, CAMP_Z);
      for (const p of pickets) {
        if (!p.rig.group.visible) continue;
        if (inside) poseRig(p.rig, d, t, 'idle', 0);
        standRig(p.rig, groundY(p.x, p.z));
      }
      for (let i = 0; i < flames.length; i++) flames[i].scale.setScalar(0.85 + 0.25 * Math.sin(t * 11 + i * 2.3));
    },
    // where the twilight line is and how fast it is moving (world/dusk-system.js keeps the clock)
    setTerm(x, v) {
      term = x;
      termV = v;
    },
    scened: () => !!scene || story.stage() === 'decided' || story.stage() === 'acted',
    // Every frame it is walked.
    tick(dt, t) {
      chapterHud.tick(dt);
      const d = Math.min(dt, 0.1);
      if (!walker) return;
      const st = story.stage();
      const px = cWalk.pos.x, pz = cWalk.pos.z;
      const s = px - term;

      // --- the light the figures stand in: all of it from one side, or none ---
      const day = ease(-220, 200, s);
      const fl = U.uFlash.value, au = U.uAurora.value;
      sun.light.color.setRGB(1.0, 0.5 + 0.4 * fl, 0.32 + 0.5 * fl);
      sun.light.intensity = 2.1 * day * (1 + 2 * fl);
      sun.ambient.color.setRGB(0.5 + 0.2 * day - 0.2 * au, 0.42 + 0.4 * au, 0.56);
      sun.ambient.intensity = 0.16 + 0.55 * day + 0.5 * au + (lampOn && lampLive() ? 0.12 : 0);
      ctx.scene.fog.color.setRGB(0.012 + 0.2 * day + 0.3 * fl, 0.014 + 0.08 * day + 0.25 * fl + 0.1 * au, 0.03 + 0.03 * day + 0.2 * fl);
      setWeather(0, Math.min(1, 0.22 + Math.abs(s) / 520));
      setDread(st === 'decided' || scene ? 0.5 : ease(120, 380, -s) * 0.6);

      // --- a scene has the screen ---
      if (scene) {
        if (scene.kind === 'seen') {
          lamp.dir.set(-1, 0.1, 0).normalize();
          lamp.pos.set(px, cWalk.pos.y + 1.35, pz).add(group.position);
          stepLamp(0, true);
        }
        scene.clock.tick(d);
        panel();
        lampHud.update();
        return;
      }

      // --- the forecast: before anything else is done here (src/fixedEvents.js) ---
      if (st === 'arrived' && !forecastOpen && !isDialogueOpen()) {
        forecastOpen = true;
        openDialogue(fixed.forecast('flare'), {
          onClose: () => {
            forecastOpen = false;
            story.advance('forecast');
            sinceForecast = 0;
          },
        });
      }
      // ...and what is said about the place, after it
      if (sinceForecast >= 0 && !isDialogueOpen()) {
        sinceForecast += d;
        while (said + 1 < DUSK.arrive.length && sinceForecast >= DUSK.arrive[said + 1][0]) say(DUSK.arrive[++said][1], 7);
      }
      if (later.length && !isDialogueOpen() && chapterHud.state().line == null) {
        const l = later.shift();
        if (l && l.by !== undefined) say(l, 7);
        else if (l) chapterHud.say(l.text, l.sec || 7);
      }

      // --- the gauges ---
      if (!isDialogueOpen()) {
        const over = Math.min(1, Math.max(0, (s - C.DUSK_HOT_AT) / C.DUSK_EXPOSE_SPAN));
        const under = Math.min(1, Math.max(0, (-s - C.DUSK_COLD_AT) / C.DUSK_EXPOSE_SPAN));
        const wasVent = onVent;
        onVent = vents.some((v) => Math.hypot(px - v.x, pz - v.z) < C.DUSK_VENT_R) || (U.uFireK.value > 0 && fires.some((f) => Math.hypot(px - f.x, pz - f.y) < C.DUSK_VENT_R)); // (a lit fire is warm ground too)
        heat = over > 0 ? heat + (over / C.DUSK_HEAT_TIME) * d : Math.max(0, heat - d / C.DUSK_RECOVER_TIME);
        cold = onVent ? Math.max(0, cold - (2 * d) / C.DUSK_RECOVER_TIME) : under > 0 ? cold + (under / C.DUSK_COLD_TIME) * d : Math.max(0, cold - d / C.DUSK_RECOVER_TIME);
        if (onVent && !wasVent && cold > 0.1) chapterHud.say(DUSK.vent, 4);
        if (heat > 0.4 && !warnedHot) {
          warnedHot = true;
          say(DUSK.hot, 5);
        } else if (heat <= 0) warnedHot = false;
        if (cold > 0.4 && !warnedCold) {
          warnedCold = true;
          say(DUSK.cold, 5);
        } else if (cold <= 0) warnedCold = false;
        if (heat >= 1) die('heat');
        else if (cold >= 1) die('cold');
      }

      // --- the edge: reached for the first time ---
      if (st === 'asked' && px < C.DUSK_EDGE_X + 30 && !isDialogueOpen()) {
        begin('edge', edgeClock);
        return;
      }

      // --- the lamp in the hand ---
      if (lampOn) {
        if (input.bandPrev) nextBand(1);
        if (input.lampToggle) toggleLamp();
        input.bandPrev = input.lampToggle = false;
        const cp = Math.cos(cWalk.pitch);
        lamp.dir.set(Math.sin(cWalk.yaw) * cp, Math.sin(cWalk.pitch), Math.cos(cWalk.yaw) * cp);
        hand.position.set(px, cWalk.pos.y + 1.35, pz).addScaledVector(lamp.dir, 0.5);
        lamp.pos.copy(hand.position).add(group.position); // (the shaders are asked about world points)
        lamp.energy = 1;
        stepLamp(0, false);
        hand.rotation.set(-cWalk.pitch, cWalk.yaw, 0);
        beam.scale.setScalar(lamp.reach * 0.75);
        if (lamp.changed !== lastChanged) {
          lastChanged = lamp.changed;
          if (lamp.band !== lastBand) bandClick((lastBand = lamp.band));
        }
      }
      const world = (g, y) => _w.set(g.pos.x, groundY(g.pos.x, g.pos.z) + y, g.pos.z).add(group.position);

      // --- looking: the warm shapes, then the line in the sky ---
      if (st === 'edge' && lampOn) {
        for (const g of groups) {
          mill(g, t, d);
          if (g.counted) continue;
          // (held on it: the lamp has to be looking at the group, not just toward the night)
          const aimed = _p.copy(world(g, 4)).sub(lamp.pos).normalize().dot(lamp.dir) > 0.95;
          g.seen = aimed && lampShows(BAND.IR, world(g, 4)) > 0 ? g.seen + d : 0;
          if (g.seen >= C.DUSK_SEE_TIME) {
            g.counted = true;
            logChime();
            if (seenN() < groups.length) chapterHud.say(DUSK.sawOne, 5);
            else later.push(DUSK.sawAll, { text: DUSK.skyHint, sec: 10 });
          }
        }
        if (seenN() === groups.length) {
          const up = lampLive() && lamp.band === BAND.HALPHA && lamp.dir.x < -0.45 && lamp.dir.y > -0.2;
          skyHold = up ? skyHold + d : 0;
          if (skyHold >= C.DUSK_SKY_TIME && !isDialogueOpen()) {
            beginSeen();
            return;
          }
        }
        // (a nudge, if the lamp has been carried a while and nothing has been found with it)
        hinted += d;
        if (hinted > 40) {
          hinted = 0;
          chapterHud.say(seenN() < groups.length ? DUSK.lampHint : DUSK.skyHint, 8);
        }
        placeTall();
      } else if (st === 'seen' || st === 'asked') {
        for (const g of groups) if (g.state === 'mill') mill(g, t, d);
        placeTall();
      }

      // --- after the choice: the edge held, or the edge opened ---
      if (st === 'decided' && actT >= 0 && !isDialogueOpen()) {
        actT += d;
        const arm = decision() === 'arm';
        for (const g of groups) {
          const lit = lampOn && lampShows(BAND.BLUEGREEN, world(g, 4)) > 0 && Math.hypot(px - g.pos.x, pz - g.pos.z) < C.DUSK_TURN_RANGE;
          if (g.state === 'hold' || g.state === 'mill') {
            // kept where they are by the dark behind them and the light ahead
            mill(g, t, d);
            if (lit && px < g.pos.x - 5) {
              g.turn += d;
              if (g.turn >= C.DUSK_TURN_TIME) {
                g.state = 'led';
                g.path = [GAP, LEE[g.i]];
                logChime();
                chapterHud.say(DUSK.turnedOne, 5);
              }
            } else if (lit) {
              // from the front, the beam is one more fire
              g.turn = 0;
              g.home.x = Math.max(C.DUSK_BAND_X - 40, g.home.x - 5 * d);
              if (t - saidFront > 14) {
                saidFront = t;
                chapterHud.say(DUSK.front, 6);
              }
            } else g.turn = Math.max(0, g.turn - d * 0.5);
          } else if (g.state === 'led' || g.state === 'broke') {
            if (head(g, g.path[0].x, g.path[0].z, C.DUSK_HERD_RUN, d)) {
              g.path.shift();
              if (!g.path.length) {
                g.state = 'safe';
                g.yaw = 0;
              }
            }
          } else if (g.state === 'wait') {
            g.go = 0;
            if (actT >= DUSK_WAVES[g.i]) {
              g.state = 'charge';
              g.aim = Math.max(-ZW + 20, Math.min(ZW - 40, pz)); // at the fire nearest where the pilot stands
            }
          } else if (g.state === 'charge') {
            const through = head(g, C.DUSK_EDGE_X + 4, g.aim, C.DUSK_CHARGE_SPEED, d);
            if (Math.hypot(px - g.pos.x, pz - g.pos.z) < C.DUSK_TRAMPLE_R) die('trampled');
            if (lit) {
              g.turn += d;
              if (g.turn >= C.DUSK_TURN_TIME) {
                g.state = 'driven';
                chapterHud.say(DUSK.drove, 5);
              }
            }
            if (through && g.state === 'charge') {
              g.state = 'broke';
              g.path = [GAP, LEE[g.i]];
              broke++;
              chapterHud.say(DUSK.broke, 6);
            }
          } else if (g.state === 'driven') {
            if (head(g, C.DUSK_BAND_X + 20, g.home.z, C.DUSK_HERD_RUN, d)) g.state = 'penned';
          } else g.go = 0;
        }
        placeTall();
        const left = actLen() - actT;
        const open = groups.some((g) => (arm ? g.state === 'wait' || g.state === 'charge' : g.state === 'mill' || g.state === 'hold'));
        if (!actDone && !open) {
          actDone = true;
          chapterHud.say(DUSK.allDone, 7);
        }
        if (!saidMinute && left < 60) {
          saidMinute = true;
          say(DUSK.minute, 6);
        }
        if (left <= 0) {
          // it comes when it comes
          if (Math.hypot(px - shelter.x, pz - shelter.z) < C.DUSK_SHELTER_R * 2) beginFlare();
          else die('flare');
        }
      }

      crew.tick(dt, t, walkerLive);
      panel();
      if (lampOn) lampHud.update();
    },
    // The pilot has died here ('dusk:back'): where they are put, and what is undone.
    revive() {
      const after = unmake();
      deathLine = DUSK.death[dead || 'cold'] || null;
      dead = null;
      if (after || story.stage() === 'seen') {
        // back at the asking: beside Renn, facing her
        const cx = term, e = { x: cx + ELDER[0], z: CAMP_Z + ELDER[1] };
        const x = e.x + 3.2, z = e.z + 2.6;
        return { spawn: new THREE.Vector3(x, groundY(x, z), z), yaw: Math.atan2(e.x - x, e.z - z) };
      }
      return { spawn: site.spawn.clone(), yaw: Math.PI };
    },
    askAt() {
      const e = { x: term + ELDER[0], z: CAMP_Z + ELDER[1] };
      const x = e.x + 3.2, z = e.z + 2.6;
      return { spawn: new THREE.Vector3(x, groundY(x, z), z), yaw: Math.atan2(e.x - x, e.z - z) };
    },
    outcome: () => outcome,
    setOutcome(o) {
      outcome = o;
    },
    settle() {
      setFires();
      settleGroups();
      if (!inside) return;
      if (story.reached('edge') && !story.reached('acted')) lampUp();
      else lampDown();
      if (story.stage() !== 'decided') {
        actT = -1;
        campHeld = null;
      }
    },
    globe: { centre: globeOff, radius: R },
    places: {
      pad: [PAD[0] - 9, PAD[1] - 12], edge: [C.DUSK_EDGE_X + 12, 0], band: [C.DUSK_BAND_X, 0], gap: [GAP.x, GAP.z],
      vents: VENTS, bounds: [X0, X1, ZW],
    },
    info: () => ({
      term: +term.toFixed(1), camp: +campX.toFixed(1), elder: [+elderNpc.x.toFixed(1), +elderNpc.z.toFixed(1)], shelter: [+shelter.x.toFixed(1), shelter.z],
      heat: +heat.toFixed(3), cold: +cold.toFixed(3), onVent, scene: scene ? { kind: scene.kind, u: +scene.clock.u().toFixed(2) } : null,
      lamp: lampOn ? lampState() : null, seen: seenN(), sky: skySeen, act: actT >= 0 ? { t: +actT.toFixed(1), left: +(actLen() - actT).toFixed(1), done: actDone, broke } : null,
      groups: groups.map((g) => ({ i: g.i, state: g.state, at: [+g.pos.x.toFixed(1), +g.pos.z.toFixed(1)], counted: g.counted, turn: +g.turn.toFixed(2) })),
      fires: U.uFireK.value, flash: +U.uFlash.value.toFixed(2), aurora: +U.uAurora.value.toFixed(2), outcome, dead, panel: panelText,
      ground: (x, z) => groundY(x, z),
    }),
    // dev (world/dusk-system.js hands these to __debug)
    dbg: {
      seek: (u) => (scene ? (scene.clock.seek(u), true) : false),
      skip: () => (scene ? scene.clock.skip() : false),
      decide,
      kill: (cause) => (die(cause || 'cold'), dead),
      shelter: () => beginFlare(),
      // count a group as seen / turned without the lamp; the sky as seen
      see(i) {
        for (const g of groups) if (i == null || g.i === i) g.counted = true;
        return seenN();
      },
      sky() {
        if (story.stage() !== 'edge' || scene) return false;
        beginSeen();
        return true;
      },
      turn(i) {
        const g = groups[i];
        if (!g || story.stage() !== 'decided') return false;
        if (decision() === 'arm') g.state = 'driven';
        else {
          g.state = 'led';
          g.path = [GAP, LEE[g.i]];
        }
        return g.state;
      },
      time(left) {
        if (actT < 0) return false;
        actT = actLen() - left;
        return true;
      },
      gauges(h, c) {
        if (Number.isFinite(h)) heat = h;
        if (Number.isFinite(c)) cold = c;
        return [heat, cold];
      },
    },
  };
  return site;
}
