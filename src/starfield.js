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
  void main() {
    vec3 p = mod(position - uOffset, uSize) - 0.5 * uSize;
    float d = length(p);
    // fade toward the wrap boundary so stars never pop at the seam
    vFade = 1.0 - smoothstep(0.36 * uSize, 0.5 * uSize, d);
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uPointSize * uPixelRatio * clamp(0.02 * uSize / -mv.z, 0.5, 3.5);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vFade;
  void main() {
    float a = smoothstep(0.5, 0.08, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(vColor * a * vFade, 1.0);
  }
`;

// Rough blackbody range: dim red through yellow-white to blue-white.
// Mostly dim, a few bright (GDD 4.1). Bright stars exceed 1.0 so the
// bloom pass catches them.
function starColor(out) {
  const t = Math.random();
  if (t < 0.45) out.setRGB(1.0, 0.45 + 0.3 * Math.random(), 0.3 + 0.2 * Math.random());
  else if (t < 0.8) out.setRGB(1.0, 0.9 + 0.08 * Math.random(), 0.72 + 0.15 * Math.random());
  else out.setRGB(0.68 + 0.1 * Math.random(), 0.8 + 0.08 * Math.random(), 1.0);
  return out;
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
}

// Hide/show the whole field. Used by the isolated-world pause (see
// src/isolate.js): on a story planet the sky is authored by the world module,
// so the space starfield is neither wanted nor paid for.
export function setStarfieldVisible(v) {
  for (const { points } of layers) points.visible = v;
}

// Call once per render frame. absCam computed in doubles; only the small
// wrapped remainder reaches the GPU.
export function updateStarfield(camera, pixelRatio) {
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
}
