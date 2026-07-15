// Sun disc (Phase 4 polish). A bright core with a warm additive halo, parked
// far away in the sun direction and re-centered on the camera each frame so
// it sits at effective infinity — it never gets closer, only the parallax of
// nearer things reads against it. The core is un-tonemapped and above the
// bloom threshold, so bloom gives it its glow.

import * as THREE from 'three';
import { SUN } from './planet.js';

const DIST = 320000; // well beyond the planet, inside the nebula shell

export const sun = { core: null, halo: null };

export function initSun(scene) {
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(9000, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff3da, toneMapped: false })
  );
  core.frustumCulled = false;

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(20000, 32, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffa63c,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  halo.frustumCulled = false;
  halo.renderOrder = -4; // behind nearer transparent things but over the sky

  scene.add(core, halo);
  sun.core = core;
  sun.halo = halo;
}

export function updateSun(camera) {
  sun.core.position.copy(camera.position).addScaledVector(SUN, DIST);
  sun.halo.position.copy(sun.core.position);
}
