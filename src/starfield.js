// Starfield (GDD 4.1). Three Points layers at different depths with
// different parallax rates — not a skybox. Parallax across depth is what
// makes motion legible in a featureless void.
//
// Each layer is a cube of stars wrapped infinitely in the vertex shader:
// p = mod(position - uOffset, size) - size/2, drawn centered on the camera.
// uOffset = (absoluteCameraPosition * parallaxRate) mod size, computed here
// in JS doubles (originOffset + camera position), so float32 precision never
// degrades no matter how far the ship travels. One draw call per layer.

import * as THREE from 'three';
import { originOffset } from './origin.js';
import { C } from './constants.js';
import { MOTION_SCALE } from './motion.js';

const LAYERS = [
  // near: sparse and bright. far: dense and dim (GDD 4.1).
  { count: 800, size: 3000, rate: 1.0, pointSize: 34.0, brightness: 1.0 },
  { count: 3000, size: 6000, rate: 0.3, pointSize: 26.0, brightness: 0.55 },
  { count: 10000, size: 10000, rate: 0.08, pointSize: 20.0, brightness: 0.32 },
];

const VERT = /* glsl */ `
  uniform float uSize;
  uniform vec3 uOffset;
  uniform float uPointSize;
  uniform float uPixelRatio;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vFade;
  varying float vSpike;
  void main() {
    vec3 p = mod(position - uOffset, uSize) - 0.5 * uSize;
    float d = length(p);
    // fade toward the wrap boundary so stars never pop at the seam
    vFade = 1.0 - smoothstep(0.36 * uSize, 0.5 * uSize, d);
    vColor = aColor;
    // Only the few stars written well above 1.0 grow diffraction spikes, and
    // they get a larger sprite to hold them.
    vSpike = smoothstep(1.05, 1.6, max(aColor.r, max(aColor.g, aColor.b)));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uPointSize * uPixelRatio * clamp(0.02 * uSize / -mv.z, 0.5, 3.5) * (1.0 + 1.6 * vSpike);
    gl_Position = projectionMatrix * mv;
    // The field is a small cube wrapped around the camera, so its stars are
    // physically nearer than any planet. Pin them to the far plane: everything
    // solid then draws over them, instead of stars showing on a night side.
    gl_Position.z = gl_Position.w;
  }
`;

// A star is a point source: a tight bright core with a faint wide skirt, not
// an evenly soft disc. The core is what stays sharp under antialiasing; the
// skirt is what the bloom pass picks up on the bright ones.
const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vFade;
  varying float vSpike;
  void main() {
    vec2 c = (gl_PointCoord - 0.5) * 2.0; // -1..1 across the sprite
    float edge = 1.0 - smoothstep(0.55, 1.0, max(abs(c.x), abs(c.y))); // nothing reaches the quad's border
    c *= 1.0 + 1.6 * vSpike; // keep the core the same size on enlarged sprites
    float r2 = dot(c, c);
    float core = exp(-r2 * 26.0);
    float skirt = 0.16 * exp(-r2 * 4.5);
    // Four-point diffraction spikes: thin along one axis, long along the other.
    vec2 ac = abs(c);
    float spikes = exp(-ac.y * 34.0 - ac.x * 1.7) + exp(-ac.x * 34.0 - ac.y * 1.7);
    float a = 1.9 * core + (skirt + 0.45 * vSpike * spikes) * edge;
    gl_FragColor = vec4(vColor * a * vFade, 1.0);
  }
`;

// Blackbody colour along one continuous ramp, cool orange (~3000 K) through
// near-white (~6000 K) to blue-white (~12000 K). Weighted toward the cool end,
// as the real sky is. Bright stars exceed 1.0 so the bloom pass catches them.
function starColor(out) {
  const t = Math.pow(Math.random(), 1.5);
  if (t < 0.55) {
    const k = t / 0.55;
    out.setRGB(1.0, 0.6 + 0.34 * k, 0.36 + 0.48 * k);
  } else {
    const k = (t - 0.55) / 0.45;
    out.setRGB(1.0 - 0.3 * k, 0.94 - 0.1 * k, 0.84 + 0.16 * k);
  }
  return out;
}

// Warp streaks: one extra layer drawn as line segments. Both ends of a
// segment carry the same star position, so they wrap together; the tail end
// is pushed along the direction of travel by uStreak, and fades to nothing.
// Hidden (no draw call) below WARP_STREAK_FROM.
const STREAK = { count: 1600, size: 4200, rate: 0.6 };

const STREAK_VERT = /* glsl */ `
  uniform float uSize;
  uniform vec3 uOffset;
  uniform vec3 uStreak; // world-space stretch: travel direction x length
  attribute vec3 aColor;
  attribute float aEnd; // 0 head, 1 tail
  varying vec3 vColor;
  void main() {
    vec3 p = mod(position - uOffset, uSize) - 0.5 * uSize;
    float fade = 1.0 - smoothstep(0.36 * uSize, 0.5 * uSize, length(p));
    p += uStreak * aEnd;
    vColor = aColor * fade * (1.0 - aEnd);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    gl_Position.z = gl_Position.w; // behind everything solid, like the points
  }
`;

const STREAK_FRAG = /* glsl */ `
  uniform float uAmount;
  varying vec3 vColor;
  void main() {
    gl_FragColor = vec4(vColor * uAmount, 1.0);
  }
`;

let streaks = null;
let warp = 0; // eased speed fraction, 0..1

// How hard the ship is warping right now, 0..1, eased. The post chain's
// radial smear and the camera read the same value so they move together.
export function warpAmount() {
  return warp;
}

function initStreaks(scene) {
  const positions = new Float32Array(STREAK.count * 6);
  const colors = new Float32Array(STREAK.count * 6);
  const ends = new Float32Array(STREAK.count * 2);
  for (let i = 0; i < STREAK.count; i++) {
    const x = Math.random() * STREAK.size, y = Math.random() * STREAK.size, z = Math.random() * STREAK.size;
    starColor(_c);
    const b = 0.5 + 1.6 * Math.pow(Math.random(), 2);
    for (let e = 0; e < 2; e++) {
      const o = i * 6 + e * 3;
      positions[o] = x; positions[o + 1] = y; positions[o + 2] = z;
      colors[o] = _c.r * b; colors[o + 1] = _c.g * b; colors[o + 2] = _c.b * b;
      ends[i * 2 + e] = e;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: STREAK_VERT,
    fragmentShader: STREAK_FRAG,
    uniforms: {
      uSize: { value: STREAK.size },
      uOffset: { value: new THREE.Vector3() },
      uStreak: { value: new THREE.Vector3() },
      uAmount: { value: 0 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  streaks = new THREE.LineSegments(geo, mat);
  streaks.frustumCulled = false;
  streaks.renderOrder = -5;
  streaks.visible = false;
  scene.add(streaks);
}

const layers = [];
const _c = new THREE.Color();

export function initStarfield(scene) {
  for (const L of LAYERS) {
    const positions = new Float32Array(L.count * 3);
    const colors = new Float32Array(L.count * 3);
    for (let i = 0; i < L.count; i++) {
      positions[i * 3] = Math.random() * L.size;
      positions[i * 3 + 1] = Math.random() * L.size;
      positions[i * 3 + 2] = Math.random() * L.size;
      starColor(_c);
      const b = L.brightness * (0.25 + 1.5 * Math.pow(Math.random(), 3));
      colors[i * 3] = _c.r * b;
      colors[i * 3 + 1] = _c.g * b;
      colors[i * 3 + 2] = _c.b * b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uSize: { value: L.size },
        uOffset: { value: new THREE.Vector3() },
        uPointSize: { value: L.pointSize },
        uPixelRatio: { value: 1 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = -5;
    scene.add(points);
    layers.push({ points, L });
  }
  initStreaks(scene);
}

// Hide/show the whole field. Used by the isolated-world pause (see
// src/isolate.js): on a story planet the sky is authored by the world module,
// so the space starfield is neither wanted nor paid for.
export function setStarfieldVisible(v) {
  for (const { points } of layers) points.visible = v;
  fieldVisible = v;
  if (!v) streaks.visible = false;
}

// Call once per render frame. absCam computed in doubles; only the small
// wrapped remainder reaches the GPU.
let fieldVisible = true;

// `velocity` is the ship's, in world units per second.
export function updateStarfield(camera, pixelRatio, velocity) {
  const ax = originOffset.x + camera.position.x;
  const ay = originOffset.y + camera.position.y;
  const az = originOffset.z + camera.position.z;
  for (let i = 0; i < layers.length; i++) {
    const { points, L } = layers[i];
    points.position.copy(camera.position);
    const u = points.material.uniforms;
    u.uPixelRatio.value = pixelRatio;
    u.uOffset.value.set(
      (((ax * L.rate) % L.size) + L.size) % L.size,
      (((ay * L.rate) % L.size) + L.size) % L.size,
      (((az * L.rate) % L.size) + L.size) % L.size
    );
  }

  const speed = velocity.length();
  const target = Math.min(speed / C.WARP_SPEED, 1);
  warp += (target - warp) * 0.12;
  const on = fieldVisible && warp > C.WARP_STREAK_FROM;
  streaks.visible = on;
  if (on) {
    const k = (warp - C.WARP_STREAK_FROM) / (1 - C.WARP_STREAK_FROM);
    const u = streaks.material.uniforms;
    streaks.position.copy(camera.position);
    u.uOffset.value.set(
      (((ax * STREAK.rate) % STREAK.size) + STREAK.size) % STREAK.size,
      (((ay * STREAK.rate) % STREAK.size) + STREAK.size) % STREAK.size,
      (((az * STREAK.rate) % STREAK.size) + STREAK.size) % STREAK.size
    );
    // Reduced motion keeps the cue but halves its length.
    const len = (C.WARP_STREAK_LEN * k * (0.5 + 0.5 * MOTION_SCALE)) / Math.max(speed, 1e-3);
    u.uStreak.value.copy(velocity).multiplyScalar(len);
    u.uAmount.value = k;
  }
}
