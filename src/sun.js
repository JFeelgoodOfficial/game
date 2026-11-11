// The sun — now a real body in the world (user request: fly into it and
// burn up). A fixed position along the system's sun direction, with mass
// (it pulls), a radius (the altitude floor + anti-tunnel arrest a dive
// above the photosphere), and a fierce heat zone handled in main.js.
// An HDR photosphere and a billboard corona feed the bloom pass for the glow,
// and a DirectionalLight matching the sun direction lights anything with a
// standard material (the space stations) — the planets' custom shaders
// ignore it.

import * as THREE from 'three';
import { C } from './constants.js';
import { addBody } from './gravity.js';
import { addShiftable } from './origin.js';
import { SUN } from './planet.js';

// `light` and `ambient` are the system-wide lighting, exposed so an isolated
// world can stand them down (src/isolate.js): a story world that brings its own
// sky brings its own key light with it, and leaving these on double-counts.
export const sun = { group: null, body: null, light: null, ambient: null };

const NOISE = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
`;

const CORE_VERT = /* glsl */ `
  varying vec3 vDir; // unit direction on the sphere, object space
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalMatrix * normal;
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const CORE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uHdr;
  varying vec3 vDir;
  varying vec3 vN;
  varying vec3 vV;
  ${NOISE}
  void main() {
    float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
    // Limb darkening: the edge of the disc shows cooler, shallower gas.
    float limb = 0.3 + 0.7 * pow(mu, 0.6);
    // Granulation: two scales of slow convection cells.
    float t = uTime * 0.03;
    float g = 0.6 * vnoise(vDir * 9.0 + t) + 0.4 * vnoise(vDir * 26.0 - t * 1.7);
    vec3 cool = vec3(1.0, 0.55, 0.2);
    vec3 hot = vec3(1.0, 0.95, 0.84);
    vec3 col = mix(cool, hot, limb) * limb * (0.8 + 0.4 * g);
    gl_FragColor = vec4(col * uHdr, 1.0);
  }
`;

const CORONA_VERT = /* glsl */ `
  uniform float uHalf;
  varying vec2 vP;
  void main() {
    vP = position.xy;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uHalf;
    gl_Position = projectionMatrix * mv;
  }
`;

const CORONA_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uRadii;
  uniform float uGain;
  varying vec2 vP;
  ${NOISE}
  void main() {
    float r = length(vP) * uRadii; // distance from centre, in sun radii
    float h = max(r - 1.0, 0.0); // height above the limb
    // Inner corona falls off fast; a much fainter outer glow carries further.
    float glow = exp(-h * 2.2) + 0.22 * exp(-h * 0.55);
    // Streamers: brightness varies with angle, slowly, and stretches outward.
    vec2 d = vP / max(length(vP), 1e-4);
    float n = vnoise(vec3(d * 2.6, uTime * 0.015)) * 0.65 + vnoise(vec3(d * 7.0, 3.0 - uTime * 0.02)) * 0.35;
    float streamers = smoothstep(0.35, 0.9, n) * exp(-h * 0.8) * 0.5;
    float a = (glow + streamers) * smoothstep(1.0, 0.7, length(vP));
    vec3 inner = vec3(1.0, 0.86, 0.62);
    vec3 outer = vec3(1.0, 0.5, 0.2);
    vec3 col = mix(inner, outer, clamp(h * 0.6, 0.0, 1.0)) * a * uGain;
    gl_FragColor = vec4(col, 1.0);
  }
`;

let coreMat = null;
let coronaMat = null;

// Per frame: only the convection and streamer drift.
export function updateSun(t) {
  coreMat.uniforms.uTime.value = t;
  coronaMat.uniforms.uTime.value = t;
}

export function initSun(scene) {
  const group = new THREE.Group();
  group.position.copy(SUN).multiplyScalar(C.SUN_DISTANCE);

  // Photosphere: limb-darkened and granulated, written in HDR so the disc
  // clips to white through the tone curve and the bloom pass has something
  // to spread.
  coreMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHdr: { value: C.SUN_CORE_HDR } },
    vertexShader: CORE_VERT,
    fragmentShader: CORE_FRAG,
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(C.SUN_RADIUS, 48, 24), coreMat);

  // Corona: one camera-facing quad centred on the sun. A flat billboard has
  // no silhouette, so the glow falls off evenly instead of drawing the bright
  // rim an additive sphere does (see starburst.js). It sits at the sun's
  // centre depth and is depth-tested: the photosphere hides the part over the
  // disc, and a planet passing in front eclipses it properly.
  coronaMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHalf: { value: C.SUN_RADIUS * C.SUN_CORONA_RADII },
      uRadii: { value: C.SUN_CORONA_RADII },
      uGain: { value: C.SUN_CORONA },
    },
    vertexShader: CORONA_VERT,
    fragmentShader: CORONA_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), coronaMat);
  halo.frustumCulled = false; // the vertex shader places it; its bounds are meaningless
  halo.renderOrder = 1;
  group.add(core, halo);
  scene.add(group);
  addShiftable(group);

  // Gravity + a floor: the radius opts the sun into the altitude-floor and
  // anti-tunnel systems, so even a warp dive arrests above the surface —
  // where the burn (main.js) finishes the job.
  const body = addBody({ position: group.position, mass: C.SUN_MASS, radius: C.SUN_RADIUS });

  // Physical lighting for standard-material objects (space stations).
  const light = new THREE.DirectionalLight(0xfff2dd, 2.4);
  light.position.copy(SUN); // direction: from position toward origin default target
  scene.add(light);
  const ambient = new THREE.AmbientLight(0x223044, 0.8);
  scene.add(ambient);

  sun.group = group;
  sun.body = body;
  sun.light = light;
  sun.ambient = ambient;
  return sun;
}

const _d = new THREE.Vector3();

// Altitude above the sun's surface for the given position (for the burn zone).
export function sunAltitude(pos) {
  return _d.subVectors(pos, sun.group.position).length() - C.SUN_RADIUS;
}
