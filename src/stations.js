// Space stations — procedural geometry, lit by the sun's directional light
// (standard materials), with emissive accent strips that catch the bloom.
// No gravity, no collision (GDD 1.2): scenery you can fly around and
// through. Three of them:
//   - Meridian Ring: a torus ring station in slow orbit around terra.
//   - Auric Platform: a drydock platform near Saturnia's rings.
//   - Relay KX-7: a small deep-space relay on the route to the black hole.

import * as THREE from 'three';
import { C } from './constants.js';
import { addShiftable } from './origin.js';
import { planets } from './planet.js';

const hullMat = new THREE.MeshStandardMaterial({
  color: 0x9aa2ad,
  roughness: 0.55,
  metalness: 0.75,
});
const darkMat = new THREE.MeshStandardMaterial({
  color: 0x3a4048,
  roughness: 0.7,
  metalness: 0.5,
});
const panelMat = new THREE.MeshStandardMaterial({
  color: 0x1a2c4d,
  roughness: 0.35,
  metalness: 0.6,
});
const glowMat = new THREE.MeshBasicMaterial({ color: 0xd4408f });
const windowMat = new THREE.MeshBasicMaterial({ color: 0xbfe8ff });

export const stations = []; // { group, spin, orbit?: {planet, radius, rate, phase} }

function ringStation() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(90, 9, 12, 48), hullMat);
  g.add(ring);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 44, 16), hullMat);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  // spokes: cylinders extend along local Y; rotating about Z fans them
  // through the ring plane (the torus lies in XY)
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 88, 8), darkMat);
    spoke.rotation.z = (i / 4) * Math.PI * 2;
    g.add(spoke);
  }
  // glowing rim strip + windows band
  const strip = new THREE.Mesh(new THREE.TorusGeometry(90, 1.6, 6, 64), glowMat);
  strip.position.z = 9.5;
  g.add(strip);
  const windows = new THREE.Mesh(new THREE.TorusGeometry(90, 2.2, 6, 64), windowMat);
  windows.position.z = -9.5;
  g.add(windows);
  return g;
}

function platformStation() {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(160, 10, 90), hullMat);
  g.add(slab);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(8, 12, 55, 10), darkMat);
  tower.position.set(-45, 32, 0);
  g.add(tower);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(11, 16, 12), hullMat);
  dome.position.set(-45, 62, 0);
  g.add(dome);
  // gantry arms
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(8, 40, 8), darkMat);
    arm.position.set(52, 22, s * 28);
    g.add(arm);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 56), hullMat);
    beam.position.set(52, 44, 0);
    g.add(beam);
  }
  // solar wings
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(70, 1.6, 34), panelMat);
    wing.position.set(0, 2, s * 75);
    g.add(wing);
  }
  // deck strip lights
  const strip = new THREE.Mesh(new THREE.BoxGeometry(160, 1.2, 2.4), glowMat);
  strip.position.set(0, 5.8, 0);
  g.add(strip);
  return g;
}

function relayStation() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 40, 8), hullMat);
  g.add(core);
  const dish = new THREE.Mesh(new THREE.ConeGeometry(26, 12, 20, 1, true), darkMat);
  dish.position.y = 32;
  dish.rotation.x = Math.PI;
  g.add(dish);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 70, 6), darkMat);
  boom.rotation.z = Math.PI / 2;
  g.add(boom);
  for (const s of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(26, 1.2, 16), panelMat);
    panel.position.set(s * 34, 0, 0);
    g.add(panel);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6), glowMat);
  beacon.position.y = -24;
  g.add(beacon);
  return g;
}

export function initStations(scene) {
  // Meridian Ring: slow orbit around terra, high above the atmosphere.
  const ring = ringStation();
  stations.push({
    group: ring,
    spin: 0.05,
    orbit: { planetIndex: 0, radius: 2600, rate: 0.01, phase: 1.2 },
  });

  // Auric Platform: parked off Saturnia, above the ring plane.
  const platform = platformStation();
  stations.push({ group: platform, spin: 0.012, offset: new THREE.Vector3(4200, 2200, -900), planetIndex: 4 });

  // Relay KX-7: deep space, roughly halfway to the black hole.
  const relay = relayStation();
  relay.position.set(0.52, 0.14, -0.84).normalize().multiplyScalar(12500);
  relay.position.y += 600;
  stations.push({ group: relay, spin: 0.09 });

  for (const s of stations) {
    scene.add(s.group);
    addShiftable(s.group);
  }
  return stations;
}

export function updateStations(t) {
  for (const s of stations) {
    s.group.rotation.y = t * s.spin;
    if (s.orbit) {
      const p = planets[s.orbit.planetIndex].group.position;
      const a = s.orbit.phase + t * s.orbit.rate;
      s.group.position.set(
        p.x + Math.cos(a) * s.orbit.radius,
        p.y + s.orbit.radius * 0.12,
        p.z + Math.sin(a) * s.orbit.radius
      );
    } else if (s.offset) {
      const p = planets[s.planetIndex].group.position;
      s.group.position.set(p.x + s.offset.x, p.y + s.offset.y, p.z + s.offset.z);
    }
  }
}
