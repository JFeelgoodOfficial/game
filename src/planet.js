// The planetary system (Phases 3/4/6 pulled together). Three planets from a
// config array — variation is a palette and a threshold, not separate
// systems (GDD 5.7):
//   - Terra: procedural continents with real vertex-displaced relief
//     (Phase 5 slice), a water sphere at sea level, clouds, blue sky.
//   - A Saturn-like gas giant: banded gold, ring system, amber sky.
//   - A Neptune-like ice giant: deep blue bands, methane limb, indigo sky.
// Every planet registers gravity + an altitude floor (you can dive into any
// atmosphere; you can never land). Terra's floor follows the terrain via
// terrain.js.

import * as THREE from 'three';
import { C } from './constants.js';
import { addBody } from './gravity.js';
import { addShiftable } from './origin.js';
import { groundHeight } from './terrain.js';
import surfaceVert from './shaders/surface.vert?raw';
import surfaceFrag from './shaders/surface.frag?raw';
import atmosphereFrag from './shaders/atmosphere.frag?raw';
import cloudFrag from './shaders/cloud.frag?raw';
import gasgiantFrag from './shaders/gasgiant.frag?raw';
import ringsFrag from './shaders/rings.frag?raw';
import waterFrag from './shaders/water.frag?raw';

// A fixed sun for the system, off to one side so terminators are visible.
export const SUN = new THREE.Vector3(1.0, 0.35, 0.5).normalize();

// planets[i]: { cfg, group, surface, spinning: [meshes], body }
export const planets = [];

const CONFIGS = [
  {
    name: 'terra',
    type: 'terra',
    dir: new THREE.Vector3(0, 0, -1),
    distance: () => C.START_DISTANCE,
    radius: () => C.TEST_MASS_RADIUS,
    mass: () => C.TEST_MASS,
    skyColor: () => C.SKY_COLOR, // panel-tunable for terra

    spin: () => C.PLANET_SPIN,
    atmoColor: 0x5a8cff,
  },
  {
    name: 'saturnia',
    type: 'gas',
    dir: new THREE.Vector3(-0.72, 0.1, -0.68).normalize(),
    distance: () => 45000,
    radius: () => 2600,
    mass: () => 5.8e6, // surface g ~= 30, under boost thrust: always escapable
    skyColor: () => 0xd8b06a,
    spin: () => 0.02,
    atmoColor: 0xe8c07a,
    gas: {
      base: 0xc2a06a, bandA: 0xe8d4a8, bandB: 0x8a6a42,
      limb: 0xffd9a0, bands: 22.0,
    },
    rings: { inner: 1.35, outer: 2.35, tilt: 0.47, color: 0xd8c49a },
  },
  {
    name: 'neptunia',
    type: 'gas',
    dir: new THREE.Vector3(-0.15, 0.22, 0.96).normalize(),
    distance: () => 70000,
    radius: () => 1400,
    mass: () => 1.7e6, // surface g ~= 30
    skyColor: () => 0x3450c8,
    spin: () => 0.03,
    atmoColor: 0x4a6aff,
    gas: {
      base: 0x2646b0, bandA: 0x4a72e8, bandB: 0x18288a,
      limb: 0x9ab8ff, bands: 16.0,
    },
  },
];

export function initPlanets(scene) {
  for (const cfg of CONFIGS) {
    const radius = cfg.radius();
    const group = new THREE.Group();
    group.position.copy(cfg.dir).multiplyScalar(cfg.distance());

    const spinning = [];
    let surface;

    if (cfg.type === 'terra') {
      const surfaceMat = new THREE.ShaderMaterial({
        vertexShader: surfaceVert,
        fragmentShader: surfaceFrag,
        uniforms: {
          uSun: { value: SUN.clone() },
          uSeaLevel: { value: C.SEA_LEVEL },
          uAmp: { value: C.TERRAIN_HEIGHT },
          uRadius: { value: radius },
        },
      });
      surface = new THREE.Mesh(new THREE.SphereGeometry(radius, 384, 192), surfaceMat);
      spinning.push(surface);

      // sea surface: flat sphere just above the ocean floor
      const water = new THREE.Mesh(
        new THREE.SphereGeometry(radius + 1.5, 128, 64),
        new THREE.ShaderMaterial({
          vertexShader: surfaceVert,
          fragmentShader: waterFrag,
          uniforms: {
            uSun: { value: SUN.clone() },
            uSeaLevel: { value: 0 },
            uAmp: { value: 0 },
          },
        })
      );
      spinning.push(water);

      const cloudMat = new THREE.ShaderMaterial({
        vertexShader: surfaceVert,
        fragmentShader: cloudFrag,
        uniforms: {
          uSun: { value: SUN.clone() },
          uSeaLevel: { value: 0 },
          uAmp: { value: 0 },
          uTime: { value: 0 },
          uCover: { value: C.CLOUD_COVER },
        },
        transparent: true,
        depthWrite: false,
      });
      const clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.1, 96, 48), cloudMat);
      clouds.renderOrder = 1;
      spinning.push(clouds);

      group.add(surface, water, clouds);
    } else {
      const gasMat = new THREE.ShaderMaterial({
        vertexShader: surfaceVert,
        fragmentShader: gasgiantFrag,
        uniforms: {
          uSun: { value: SUN.clone() },
          uSeaLevel: { value: 0 },
          uAmp: { value: 0 },
          uTime: { value: 0 },
          uBase: { value: new THREE.Color(cfg.gas.base) },
          uBandA: { value: new THREE.Color(cfg.gas.bandA) },
          uBandB: { value: new THREE.Color(cfg.gas.bandB) },
          uLimb: { value: new THREE.Color(cfg.gas.limb) },
          uBands: { value: cfg.gas.bands },
        },
      });
      surface = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 48), gasMat);
      spinning.push(surface);
      group.add(surface);

      if (cfg.rings) {
        const ringMat = new THREE.ShaderMaterial({
          vertexShader: surfaceVert,
          fragmentShader: ringsFrag,
          uniforms: {
            uSeaLevel: { value: 0 },
            uAmp: { value: 0 },
            uSunObj: { value: new THREE.Vector3() },
            uInner: { value: radius * cfg.rings.inner },
            uOuter: { value: radius * cfg.rings.outer },
            uPlanetR: { value: radius },
            uColor: { value: new THREE.Color(cfg.rings.color) },
          },
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const rings = new THREE.Mesh(
          new THREE.RingGeometry(radius * cfg.rings.inner, radius * cfg.rings.outer, 192, 1),
          ringMat
        );
        rings.rotation.x = -Math.PI / 2 + cfg.rings.tilt;
        rings.renderOrder = 1;
        group.add(rings);
        // sun direction in ring-object space (rings only rotate about x once)
        rings.updateMatrix();
        const inv = new THREE.Matrix3().setFromMatrix4(rings.matrix).invert();
        ringMat.uniforms.uSunObj.value.copy(SUN).applyMatrix3(inv);
      }
    }

    // atmosphere limb shell
    const atmoMat = new THREE.ShaderMaterial({
      vertexShader: surfaceVert,
      fragmentShader: atmosphereFrag,
      uniforms: {
        uSun: { value: SUN.clone() },
        uSeaLevel: { value: 0 },
        uAmp: { value: 0 },
        uColor: { value: new THREE.Color(cfg.atmoColor) },
      },
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius * C.ATMO_SHELL, 64, 32),
      atmoMat
    );
    atmosphere.renderOrder = 2;
    group.add(atmosphere);

    scene.add(group);
    addShiftable(group);

    const p = { cfg, group, surface, spinning, radius, body: null };

    // gravity + altitude floor. Terra's floor follows the terrain: sample
    // the same noise field in unrotated object space (undo the spin).
    const body = { position: group.position, mass: cfg.mass(), radius };
    if (cfg.type === 'terra') {
      const _d = new THREE.Vector3();
      body.groundAt = (dir) => {
        // dir: normalized planet→ship in world/local frame. Undo spin (about y).
        const rot = surface.rotation.y;
        const cos = Math.cos(-rot), sin = Math.sin(-rot);
        _d.set(dir.x * cos + dir.z * sin, dir.y, -dir.x * sin + dir.z * cos);
        return groundHeight(_d.x, _d.y, _d.z);
      };
    }
    addBody(body);
    p.body = body;

    planets.push(p);
  }
  return planets;
}

const _tmp = new THREE.Vector3();

export function updatePlanets(t) {
  for (const p of planets) {
    const spin = p.cfg.spin();
    for (const m of p.spinning) m.rotation.y = t * spin;
    if (p.cfg.type === 'terra') {
      p.surface.material.uniforms.uSeaLevel.value = C.SEA_LEVEL;
      p.surface.material.uniforms.uAmp.value = C.TERRAIN_HEIGHT;
      const clouds = p.spinning[2];
      clouds.material.uniforms.uTime.value = t;
      clouds.material.uniforms.uCover.value = C.CLOUD_COVER;
    } else {
      p.surface.material.uniforms.uTime.value = t;
    }
  }
}

// The planet whose atmosphere the given position is deepest inside (or the
// nearest one, for heat/floor bookkeeping). Returns {p, altitude, atmo, up}
// via the out object to avoid allocation.
export function atmosphereAt(pos, out) {
  out.p = null;
  out.atmo = 0;
  out.altitude = Infinity;
  for (const p of planets) {
    _tmp.subVectors(pos, p.group.position);
    const alt = _tmp.length() - p.radius;
    const atmoHeight = p.radius * (C.ATMO_SHELL - 1);
    const a = Math.min(Math.max(1 - alt / atmoHeight, 0), 1);
    if (a > out.atmo || (out.p === null && alt < out.altitude)) {
      out.p = p;
      out.atmo = a;
      out.altitude = alt;
      out.upX = _tmp.x; out.upY = _tmp.y; out.upZ = _tmp.z;
    }
  }
  return out;
}
