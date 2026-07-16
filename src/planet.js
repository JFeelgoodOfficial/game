// The planetary system (Phases 3/4/6 pulled together). Six planets from a
// config array — variation is a palette and a threshold, not separate
// systems (GDD 5.7):
//   - Terra: continents, liquid ocean, clouds, blue sky.
//   - Oceana: ocean world — sea level high, scattered islands (GDD 5.7).
//   - Glacia: ice world — white-blue palette, sea frozen flat/matte.
//   - Rustia: dead rock — sea level below the terrain minimum, no water.
//   - Saturnia: ringed gold gas giant.  - Neptunia: blue ice giant.
// Every planet registers gravity + an altitude floor (dive into any
// atmosphere; never land). Rocky planets' floors follow their terrain via
// terrain.js with per-planet sea level and amplitude.

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

// The sun direction planets are lit from (the real sun sits along it at
// C.SUN_DISTANCE — far enough that one direction serves every planet).
export const SUN = new THREE.Vector3(1.0, 0.35, 0.5).normalize();

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
    seaLevel: () => C.SEA_LEVEL,
    terrainHeight: () => C.TERRAIN_HEIGHT,
    iceLat: 0.72,
    palette: {
      deep: 0x040a24, shallow: 0x0d5285, sand: 0xc2b37a,
      low: 0x296621, mid: 0x574733, high: 0xebedf7,
    },
    water: { color: 0x082941, gloss: 1.0 },
    clouds: true,
    // On-foot surface dressing (dressing.js): the full golden valley.
    dress: {
      grass: { root: 0xa8842f, tip: 0xf7d06a, emissive: 0xc9a24a },
      trees: true,
      shrubs: true,
      rocks: true,
    },
  },
  {
    name: 'oceana', // ocean world (GDD 5.7): sea level high, island chains
    type: 'terra',
    dir: new THREE.Vector3(0.85, -0.1, -0.52).normalize(),
    distance: () => 30000,
    radius: () => 1100,
    mass: () => 1.04e6, // surface g ~= 30
    skyColor: () => 0x4a7ce8,
    spin: () => 0.014,
    atmoColor: 0x4a80ff,
    seaLevel: () => 0.62,
    terrainHeight: () => 55,
    iceLat: 0.8,
    palette: {
      deep: 0x03102e, shallow: 0x055980, sand: 0xb8ad80,
      low: 0x337333, mid: 0x4d4d38, high: 0xd9dee6,
    },
    water: { color: 0x052e61, gloss: 1.0 },
    clouds: true,
    // Island greens: same dressing, foliage hue pulled toward green.
    dress: {
      grass: { root: 0x4f7a2e, tip: 0x9fce6a, emissive: 0x6fa04a },
      trees: true,
      treeHueShift: 0.14,
      shrubs: true,
      rocks: true,
    },
  },
  {
    name: 'glacia', // ice world (GDD 5.7): white-blue, sea frozen (flat, matte)
    type: 'terra',
    dir: new THREE.Vector3(-0.45, -0.2, 0.87).normalize(),
    distance: () => 55000,
    radius: () => 900,
    mass: () => 6.9e5, // surface g ~= 30
    skyColor: () => 0xa8c8e8,
    spin: () => 0.008,
    atmoColor: 0x9cc2f0,
    seaLevel: () => 0.55,
    terrainHeight: () => 65,
    iceLat: 0.5,
    palette: {
      deep: 0x59738f, shallow: 0x8caec8, sand: 0xbfccdd,
      low: 0xccd9ea, mid: 0x9eb2cc, high: 0xf2f7ff,
    },
    water: { color: 0xb8c8d8, gloss: 0.12 }, // frozen: flat but not reflective
    clouds: false,
    frozenSea: true, // the walker stands on the ice sheet, never swims
    dress: { rocks: true, rockTint: 0x9eb8d4 }, // ice-scoured boulders only
  },
  {
    name: 'rustia', // dead rock (GDD 5.7): sea level below terrain minimum
    type: 'terra',
    dir: new THREE.Vector3(0.62, -0.32, 0.72).normalize(),
    distance: () => 90000,
    radius: () => 800,
    mass: () => 5.5e5, // surface g ~= 30
    skyColor: () => 0xd89a70,
    spin: () => 0.012,
    atmoColor: 0xcc8866,
    seaLevel: () => 0.02, // under everything — no water anywhere
    terrainHeight: () => 60,
    iceLat: 0.93,
    palette: {
      deep: 0x2e1a10, shallow: 0x4d2c18, sand: 0x8c5230,
      low: 0xa86133, mid: 0x803f24, high: 0xc78d61,
    },
    water: null,
    clouds: false,
    dress: { rocks: true, rockTint: 0x8c5230 }, // oxide rubble, nothing grows
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

function makeSurfaceUniforms(cfg, radius) {
  const p = cfg.palette;
  return {
    uSun: { value: SUN.clone() },
    uSeaLevel: { value: cfg.seaLevel() },
    uAmp: { value: cfg.terrainHeight() },
    uRadius: { value: radius },
    uIceLat: { value: cfg.iceLat },
    uColDeep: { value: new THREE.Color(p.deep) },
    uColShallow: { value: new THREE.Color(p.shallow) },
    uColSand: { value: new THREE.Color(p.sand) },
    uColLow: { value: new THREE.Color(p.low) },
    uColMid: { value: new THREE.Color(p.mid) },
    uColHigh: { value: new THREE.Color(p.high) },
  };
}

export function initPlanets(scene) {
  for (const cfg of CONFIGS) {
    const radius = cfg.radius();
    const group = new THREE.Group();
    group.position.copy(cfg.dir).multiplyScalar(cfg.distance());

    const spinning = [];
    let surface;
    let clouds = null;

    if (cfg.type === 'terra') {
      const surfaceMat = new THREE.ShaderMaterial({
        vertexShader: surfaceVert,
        fragmentShader: surfaceFrag,
        uniforms: makeSurfaceUniforms(cfg, radius),
      });
      // mesh density scales down for smaller worlds
      const seg = radius >= 1000 ? 384 : 288;
      surface = new THREE.Mesh(new THREE.SphereGeometry(radius, seg, seg / 2), surfaceMat);
      spinning.push(surface);
      group.add(surface);

      if (cfg.water) {
        const water = new THREE.Mesh(
          new THREE.SphereGeometry(radius + 1.5, 128, 64),
          new THREE.ShaderMaterial({
            vertexShader: surfaceVert,
            fragmentShader: waterFrag,
            uniforms: {
              uSun: { value: SUN.clone() },
              uSeaLevel: { value: 0 },
              uAmp: { value: 0 },
              uWaterColor: { value: new THREE.Color(cfg.water.color) },
              uGloss: { value: cfg.water.gloss },
            },
          })
        );
        spinning.push(water);
        group.add(water);
      }

      if (cfg.clouds) {
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
        clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.1, 96, 48), cloudMat);
        clouds.renderOrder = 1;
        spinning.push(clouds);
        group.add(clouds);
      }
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

    const p = { cfg, group, surface, clouds, spinning, radius, body: null };

    // gravity + altitude floor. Rocky floors follow the terrain: sample the
    // shared noise field in unrotated object space (undo the spin) with this
    // planet's sea level and amplitude.
    const body = { position: group.position, mass: cfg.mass(), radius };
    if (cfg.type === 'terra') {
      const _d = new THREE.Vector3();
      body.groundAt = (dir) => {
        const rot = surface.rotation.y;
        const cos = Math.cos(-rot), sin = Math.sin(-rot);
        _d.set(dir.x * cos + dir.z * sin, dir.y, -dir.x * sin + dir.z * cos);
        return groundHeight(_d.x, _d.y, _d.z, cfg.seaLevel(), cfg.terrainHeight());
      };
    }
    addBody(body);
    p.body = body;
    // On-foot water metadata: world-space sea-surface radius (the water mesh
    // above sits at radius + 1.5) and whether it's walkable ice.
    p.water = cfg.water ? { r: radius + C.WALK_WATER_LEVEL, frozen: !!cfg.frozenSea } : null;

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
      // terra's thresholds stay live-tunable from the panel
      p.surface.material.uniforms.uSeaLevel.value = p.cfg.seaLevel();
      p.surface.material.uniforms.uAmp.value = p.cfg.terrainHeight();
      if (p.clouds) {
        p.clouds.material.uniforms.uTime.value = t;
        p.clouds.material.uniforms.uCover.value = C.CLOUD_COVER;
      }
    } else {
      p.surface.material.uniforms.uTime.value = t;
    }
  }
}

// The planet whose atmosphere the given position is deepest inside (or the
// nearest one, for heat/floor bookkeeping). Fills `out` to avoid allocation.
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
