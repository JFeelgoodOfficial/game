// Pretty planet (Phase 3/4 preview). Replaces the Phase 1 wireframe test mass
// with a procedural surface + atmospheric limb, kept as a single sphere (no
// LOD, no descent — that's Phase 5). Same radius/position/gravity/floor as
// before, so it's still the orbit-and-skim target.

import * as THREE from 'three';
import { C } from './constants.js';
import surfaceVert from './shaders/surface.vert?raw';
import surfaceFrag from './shaders/surface.frag?raw';
import atmosphereFrag from './shaders/atmosphere.frag?raw';
import cloudFrag from './shaders/cloud.frag?raw';

// A fixed sun for the system, off to one side so the terminator is visible.
export const SUN = new THREE.Vector3(1.0, 0.35, 0.5).normalize();

export const planet = {
  group: null, surface: null, clouds: null,
  surfaceMat: null, cloudMat: null, atmoMat: null,
};

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

  // Cloud shell just above the surface, drifting, lit by the same sun.
  const cloudMat = new THREE.ShaderMaterial({
    vertexShader: surfaceVert,
    fragmentShader: cloudFrag,
    uniforms: {
      uSun: { value: SUN.clone() },
      uTime: { value: 0 },
      uCover: { value: C.CLOUD_COVER },
    },
    transparent: true,
    depthWrite: false,
  });
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(C.TEST_MASS_RADIUS * 1.02, 96, 48),
    cloudMat
  );
  clouds.renderOrder = 1;

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
    new THREE.SphereGeometry(C.TEST_MASS_RADIUS * C.ATMO_SHELL, 64, 32),
    atmoMat
  );
  atmosphere.renderOrder = 2;

  group.add(surface, clouds, atmosphere);
  scene.add(group);

  planet.group = group;
  planet.surface = surface;
  planet.clouds = clouds;
  planet.surfaceMat = surfaceMat;
  planet.cloudMat = cloudMat;
  planet.atmoMat = atmoMat;
  return group;
}

export function updatePlanet(t) {
  planet.surface.rotation.y = t * C.PLANET_SPIN;
  planet.clouds.rotation.y = t * C.PLANET_SPIN * 1.25; // drift faster than the ground
  planet.surfaceMat.uniforms.uSeaLevel.value = C.SEA_LEVEL;
  planet.cloudMat.uniforms.uTime.value = t;
  planet.cloudMat.uniforms.uCover.value = C.CLOUD_COVER;
}
