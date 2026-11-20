// SEALED: the owner has not played this yet. Do not open.
//
// The sky of the chapter past the horizon (GDD 5.7.7), and the physics it is
// drawn from. One shader for every place in the chapter.
//
// WHAT IS PHYSICS HERE (a non-spinning hole of mass M, G = c = 1, M as a time;
// an observer who fell from rest far away, the "rain" frame):
//
//   proper time, horizon to the end        (4/3) M               HZ_FALL
//   the most anyone can have inside        pi M                  HZ_MOST
//       (from rest at the horizon, then free fall: one burn and then
//        nothing. Any thrust after that shortens it. Lewis & Kwan 2007.)
//   where the ship is, by the time left    x = sqrt(r / 2M) = (tau / (4M/3))^(1/3)
//   home, as seen                          d(v)/d(tau) = 1 / (1 + beta), beta = 1 / x
//       half speed at the horizon, slowing to a stop. All of home ever seen:
//       4M (F(1) - F(x)), F(x) = x^3/3 - x^2/2 + x - ln(1 + x); at the end
//       0.5607 M (HZ_HOME_STOP). An infaller does NOT see the outside's future
//       run fast: they see a finite stretch that slows to a halt, because
//       later light cannot catch them.
//   the dark ahead                         q = 27 M^2 / r^2,
//                                          p = (q - 1) / (beta + sqrt(1 - q (1 - beta^2))),
//                                          cos(half-angle) = p / (1 + beta p)
//       42 degrees at the horizon; half the sky only at the very end.
//   colour                                 light from far away is measured at
//                                          1 / (1 + beta) straight astern (red, dim)
//                                          and 1 + beta p at the edge of the dark (blue)
//   the tide                               stretch 4 / (9 tau^2) per metre,
//                                          whatever M is: nothing until the last second
//
// WHAT IS NOT (the story's, marked X in plans/SEALED-horizon.md):
//   X1  the hole's mass, and the megaworld beside it; these non-spinning
//       figures are kept on the clocks even once the hole is known to spin
//   X2  anything seen ahead of something that crossed a million years ago:
//       the principle is right (light sent outward just inside the horizon
//       hangs there), but it dims as e^(-lag / 4M); no detector would find it
//   X3  the sky's turning (frame dragging is real; that it is this easy to see is not)
//   the map of the sky between the edge of the dark and straight astern is an
//       eased interpolation between the two true values, not a ray trace
//   X8  mode 1: the inside of the exact spinning solution taken at its word.
//       A real hole is not thought to have it. Lights coming out of the ring
//       are ours: what is true is only that nothing in physics says what a
//       visible singularity would give off.
//   X10 mode 2: plain stars on the far side of the ring. In the exact
//       solution that side is a separate, empty region.

import * as THREE from 'three';
import { C } from '../src/constants.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
// x = sqrt(r / 2M) from the proper time left on the rain path
const xOf = (tauLeft) => Math.cbrt(clamp01(tauLeft / C.HZ_FALL)) || 1e-3;
const F = (x) => (x * x * x) / 3 - (x * x) / 2 + x - Math.log(1 + x);
function pEdge(x) {
  const beta = 1 / x, q = 27 / (4 * x * x * x * x);
  return (q - 1) / (beta + Math.sqrt(Math.max(0, 1 - q * (1 - beta * beta))));
}
// half-angle of the dark ahead, radians
export function shadowAngle(tauLeft) {
  const x = xOf(tauLeft), p = pEdge(x);
  return Math.acos(Math.min(1, Math.max(-1, p / (1 + p / x))));
}
// seconds of home's clock seen since the horizon
export const homeSeen = (tauLeft) => 4 * C.HZ_M * (F(1) - F(xOf(tauLeft)));
// how blue the edge of the dark is, and how red straight astern (1 = as sent)
export const edgeBlue = (tauLeft) => 1 + pEdge(xOf(tauLeft)) / xOf(tauLeft);
export const backRed = (tauLeft) => 1 / (1 + 1 / xOf(tauLeft));
// stretch along the fall, per metre, in m/s^2
export const tide = (tauLeft) => 4 / (9 * Math.max(tauLeft, 1e-3) ** 2);

const VERT = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const FRAG = /* glsl */ `
  uniform float uTime, uMode, uShadow, uEdge, uBack, uSwirl, uHomeGlow, uRite, uPort, uStar, uRingR, uFar, uOpen, uShip, uPick;
  uniform vec3 uAhead, uHome, uRing, uFallDir;
  uniform vec4 uFall; // the colour of one light that is going by, and how bright
  uniform vec4 uMark[4]; // xyz: a direction, w: how bright (the lamp's sightings)
  uniform vec3 uMarkCol[4];
  varying vec3 vW;
  float h31(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  vec3 stars(vec3 s) {
    vec3 c = floor(s * 90.0);
    float st = step(0.985, h31(c)) * (0.4 + 0.6 * h31(c + 5.0));
    return vec3(1.0, 0.96, 0.9) * st * (1.0 - smoothstep(0.0, 0.5, length(fract(s * 90.0) - 0.5)));
  }
  float ang(vec3 a, vec3 b) { return acos(clamp(dot(a, b), -1.0, 1.0)); }
  void main() {
    vec3 d = normalize(vW - cameraPosition);
    vec3 col = vec3(0.0);
    if (uMode < 0.5) {
      // --- falling: the whole outside sky, pushed into what is not the dark ahead ---
      float a = ang(d, uAhead);
      float k = clamp((a - uShadow) / (3.14159 - uShadow), 0.0, 1.0); // 0 at the edge of the dark, 1 astern
      float src = 3.14159 * pow(k, 0.75); // (an interpolation, not a ray trace)
      vec3 perp = normalize(d - uAhead * dot(d, uAhead) + 1e-5);
      // frame dragging: the belt turns about the way the ship is falling
      float cs = cos(uSwirl), sn = sin(uSwirl);
      perp = perp * cs + cross(uAhead, perp) * sn;
      vec3 s = uAhead * cos(src) + perp * sin(src);
      float gain = mix(uEdge, uBack, k);
      vec3 hue = mix(vec3(0.65, 0.8, 1.3), vec3(1.2, 0.6, 0.35), k);
      col = stars(s) * hue * gain * (1.0 + 2.0 * (1.0 - k) * (1.0 - k));
      // the edge of the dark: where the sky crowds, and is bluest
      col += vec3(0.5, 0.7, 1.3) * exp(-pow((a - uShadow) / 0.02, 2.0)) * 0.5 * uEdge;
      col *= smoothstep(uShadow * 0.985, uShadow, a);
      // home, astern: a small warm disc, and the cages when they are lit
      float ha = ang(d, uHome);
      col += vec3(1.0, 0.55, 0.3) * uHomeGlow * (smoothstep(0.03, 0.024, ha) * 1.2 + 0.25 * exp(-ha * 40.0));
      vec3 hp = normalize(d - uHome * dot(d, uHome) + 1e-5);
      float spoke = pow(max(0.0, cos(atan(hp.y, hp.x) * 12.0)), 30.0);
      col += vec3(1.0, 0.85, 0.5) * uRite * spoke * exp(-pow((ha - 0.055) / 0.006, 2.0)) * 1.6;
      col += vec3(0.8, 0.9, 1.0) * uRite * pow(max(0.0, cos(atan(hp.y, hp.x) * 9.0 + 1.0)), 60.0) * exp(-pow((ha - 0.085) / 0.004, 2.0));
      // the two roofs, as they come: what fell before to port (amber), what falls after to starboard (white)
      float side = d.x;
      col += vec3(1.0, 0.6, 0.2) * uPort * smoothstep(0.1, 1.0, -side) * 0.5;
      col += vec3(1.0, 1.0, 1.2) * uStar * smoothstep(-0.1, 1.0, side) * (1.4 + 0.6 * sin(uTime * 23.0 + d.y * 40.0));
      // ahead, in the dark: this ship, as it once crossed (X2)
      vec2 g = vec2(dot(d, vec3(1.0, 0.0, 0.0)), dot(d, vec3(0.0, 1.0, 0.0)) - uAhead.y) * 60.0;
      float cellIn = step(abs(g.x) + abs(g.y) * 1.8, 4.0) * step(0.3, h31(vec3(floor(g), 3.0)));
      vec2 gf = abs(fract(g) - 0.5);
      col += vec3(0.5, 0.9, 1.0) * uShip * cellIn * step(max(gf.x, gf.y), 0.4) * step(0.0, dot(d, uAhead)) * 0.8;
      for (int i = 0; i < 4; i++) {
        float m = ang(d, uMark[i].xyz);
        col += uMarkCol[i] * uMark[i].w * (exp(-pow((m - 0.05) / 0.008, 2.0)) + 0.3 * exp(-m * 30.0));
      }
    } else {
      // --- past the roof: the ring, and what shows through its middle ---
      float a = ang(d, uRing);
      vec3 plain = stars(d) + vec3(0.03, 0.04, 0.07) * h31(floor(d * 9.0));
      float inside = smoothstep(uRingR, uRingR * 0.96, a);
      col = plain * max(uFar, inside);
      col += vec3(1.0, 0.98, 0.94) * (exp(-pow((a - uRingR) / (0.004 + uRingR * 0.012), 2.0)) * 3.0 + 0.25 * exp(-abs(a - uRingR) * 30.0));
      // the roof just crossed, low astern
      col += vec3(1.0, 0.55, 0.15) * (1.0 - uFar) * 0.22 * smoothstep(0.2, 1.0, dot(d, -uRing)) ;
      // the star the ship turns to
      float pa = ang(d, vec3(0.0, 0.12, -0.9928));
      col += vec3(1.0, 0.9, 0.7) * uPick * (smoothstep(0.012, 0.006, pa) * 2.5 + 0.5 * exp(-pa * 25.0));
    }
    float fa = ang(d, uFallDir);
    col += uFall.rgb * uFall.w * (smoothstep(0.014, 0.008, fa) * 2.0 + 0.5 * exp(-fa * 45.0));
    gl_FragColor = vec4(col * uOpen, 1.0);
  }
`;

export const AHEAD = new THREE.Vector3(0, 0.12, -1).normalize(); // the way the bridge faces: the way it is falling
export const HOME_DIR = new THREE.Vector3(0.2, 1.1, 1).normalize(); // astern, over the top of the archive's arc

export function createSky() {
  const U = {
    uTime: { value: 0 }, uMode: { value: 0 }, uShadow: { value: 0.73 }, uEdge: { value: 3.9 }, uBack: { value: 0.5 }, uSwirl: { value: 0 },
    uHomeGlow: { value: 1 }, uRite: { value: 0 }, uPort: { value: 0 }, uStar: { value: 0 }, uRingR: { value: 0.22 }, uFar: { value: 0 }, uOpen: { value: 1 }, uShip: { value: 0 }, uPick: { value: 0 },
    uAhead: { value: AHEAD.clone() }, uHome: { value: HOME_DIR.clone() }, uRing: { value: new THREE.Vector3(-0.75, 0.4, -0.53).normalize() },
    uFallDir: { value: new THREE.Vector3(0, -1, 0) }, uFall: { value: new THREE.Vector4(1, 1, 1, 0) },
    uMark: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 1, 0, 0)) },
    uMarkCol: { value: [0, 1, 2, 3].map(() => new THREE.Color(1, 1, 1)) },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(3600, 48, 32), new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, fog: false, depthWrite: false }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -5;
  return {
    mesh, U,
    // the falling sky, from the proper time left on the rain path
    fall(tauLeft) {
      U.uMode.value = 0;
      U.uShadow.value = shadowAngle(tauLeft);
      U.uEdge.value = Math.min(edgeBlue(tauLeft), 8);
      U.uBack.value = backRed(tauLeft);
    },
  };
}
