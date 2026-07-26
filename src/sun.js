// The sun — now a real body in the world (user request: fly into it and
// burn up). A fixed position along the system's sun direction, with mass
// (it pulls), a radius (the altitude floor + anti-tunnel arrest a dive
// above the photosphere), and a fierce heat zone handled in main.js.
// The un-tonemapped core + additive halo feed the bloom pass for the glow,
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

export function initSun(scene) {
  const group = new THREE.Group();
  group.position.copy(SUN).multiplyScalar(C.SUN_DISTANCE);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(C.SUN_RADIUS, 48, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff3da, toneMapped: false })
  );
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(C.SUN_RADIUS * 2.2, 48, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffa63c,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
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
