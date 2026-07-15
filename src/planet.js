// Pretty planet (Phase 3/4 preview). Replaces the Phase 1 wireframe test mass
// with a procedural surface + atmospheric limb, kept as a single sphere (no
// LOD, no descent — that's Phase 5). Same radius/position/gravity/floor as
// before, so it's still the orbit-and-skim target.

import * as THREE from 'three';
import { C } from './constants.js';
import surfaceVert from './shaders/surface.vert?raw';
import surfaceFrag from './shaders/surface.frag?raw';
import atmosphereFrag from './shaders/atmosphere.frag?raw';

// A fixed sun for the system, off to one side so the terminator is visible.
const SUN = new THREE.Vector3(1.0, 0.35, 0.5).normalize();

export const planet = { group: null, surface: null, surfaceMat: null, atmoMat: null };

export function initPlanet(scene) {
  const group = new THREE.Group();
  group.position.set(0, 0, -C.START_DISTANCE);

  const surfaceMat = new THREE.ShaderMaterial({
    vertexShader: surfaceVert,
    fragmentShader: surfaceFrag,
    uniforms: {
      uSun: { value: SUN.clone() },
      uSeaLevel: { value: C.SEA_LEVEL },
    },
  });
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(C.TEST_MASS_RADIUS, 128, 64),
    surfaceMat
  );

  const atmoMat = new THREE.ShaderMaterial({
    vertexShader: surfaceVert,
    fragmentShader: atmosphereFrag,
    uniforms: {
      uSun: { value: SUN.clone() },
      uColor: { value: new THREE.Color(0x5a8cff) },
    },
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(C.TEST_MASS_RADIUS * 1.055, 64, 32),
    atmoMat
  );

  group.add(surface, atmosphere);
  scene.add(group);

  planet.group = group;
  planet.surface = surface;
  planet.surfaceMat = surfaceMat;
  planet.atmoMat = atmoMat;
  return group;
}

export function updatePlanet(t) {
  planet.surface.rotation.y = t * C.PLANET_SPIN;
  planet.surfaceMat.uniforms.uSeaLevel.value = C.SEA_LEVEL;
}
