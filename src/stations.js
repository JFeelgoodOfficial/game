// Space stations — procedural geometry, lit by the sun's directional light
// (standard materials), with emissive accent strips that catch the bloom.
// No gravity, no collision (GDD 1.2): scenery you can fly around and
// through. Seven of them:
//   - Port Feelgood: a 1.4km open-truss drydock between terra and oceana —
//     the bore is a wide open tunnel you fly straight through, past lit
//     docking bays and a handful of parked ships.
//   - Meridian Ring: a torus ring station in slow orbit around terra.
//   - Auric Platform: a drydock platform near Saturnia's rings.
//   - Relay KX-7: a small deep-space relay on the route to the black hole.
//   - Frostwatch Relay: a listening post hanging off glacia.
//   - Halcyon Platform: a survey platform in neptunia's shadow.
//   - Foundry Anchorage: a mining rig built around an asteroid off rustia —
//     beams carve at glowing excavation pits, a debris stream rises to the
//     hopper, and two shuttles loop between the rock face and the dock.

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

// A parked ship for the drydock — simple hull + swept wings + engine glow,
// varied by scale so the bays don't read as copy-paste.
function dockedShip(scale, glowColor) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.5, 26, 10), hullMat);
  hull.rotation.x = Math.PI / 2;
  g.add(hull);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(3, 11, 10), darkMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -18;
  g.add(nose);
  const wings = new THREE.Mesh(new THREE.BoxGeometry(34, 1.2, 9), darkMat);
  wings.position.z = 6;
  g.add(wings);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9, 7), darkMat);
  fin.position.set(0, 5, 9);
  g.add(fin);
  const engine = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 8, 6),
    new THREE.MeshBasicMaterial({ color: glowColor })
  );
  engine.position.z = 14.5;
  g.add(engine);
  g.scale.setScalar(scale);
  return g;
}

// Port Feelgood — the mega drydock. Two hexagonal end rings joined by six
// longeron beams: the middle is a ~460-unit-wide open bore you fly straight
// through. Docking bays with window bands line the inside walls, parked
// ships sit near them, and magenta approach lights mark both mouths.
function megaStation() {
  const g = new THREE.Group();
  const R = 260; // bore radius to the longerons
  const LEN = 1400; // end to end
  const half = LEN / 2;

  // hexagonal end rings (a torus with 6 tubular segments IS a hexagon)
  for (const zs of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 22, 10, 6), hullMat);
    ring.position.z = zs * half;
    g.add(ring);
    // approach lights: a dot at each hexagon vertex
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 6), glowMat);
      dot.position.set(Math.cos(a) * R, Math.sin(a) * R, zs * half);
      g.add(dot);
    }
  }

  // six longerons connecting the rings, at the hexagon vertices
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * R;
    const y = Math.sin(a) * R;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, LEN, 8), darkMat);
    beam.rotation.x = Math.PI / 2;
    beam.position.set(x, y, 0);
    g.add(beam);
    // a running light strip along every other beam
    if (i % 2 === 0) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(3, 3, LEN * 0.9), windowMat);
      strip.position.set(x * 0.94, y * 0.94, 0);
      g.add(strip);
    }
  }

  // docking bays on the inside walls between longerons — boxes with lit
  // window bands, alternating sides down the length of the bore
  const bayZ = [-460, -160, 140, 440];
  bayZ.forEach((z, i) => {
    const a = ((i * 2 + 1) / 6) * Math.PI * 2; // between longerons
    const bx = Math.cos(a) * (R - 34);
    const by = Math.sin(a) * (R - 34);
    const bay = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.BoxGeometry(120, 46, 170), hullMat);
    bay.add(shell);
    const band = new THREE.Mesh(new THREE.BoxGeometry(122, 6, 150), windowMat);
    band.position.y = -12;
    bay.add(band);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), glowMat);
    beacon.position.set(0, -28, 0);
    bay.add(beacon);
    bay.position.set(bx, by, z);
    // roll the bay so its face points at the bore axis
    bay.rotation.z = a + Math.PI / 2;
    g.add(bay);

    // a parked ship floating just off each bay, nose along the bore
    const ship = dockedShip(1.1 + (i % 3) * 0.45, i % 2 ? 0xd4408f : 0x82f7ff);
    ship.position.set(bx * 0.68, by * 0.68, z + 60);
    ship.rotation.set(0.1 * i, i % 2 ? 0.35 : Math.PI - 0.2, 0.15);
    g.add(ship);
  });

  // one more ship drifting mid-bore, as if on final approach
  const roamer = dockedShip(1.6, 0xd4408f);
  roamer.position.set(30, -60, -half * 0.55);
  roamer.rotation.y = Math.PI;
  g.add(roamer);

  // interior work lights: the sun can't reach inward-facing surfaces, so
  // without these the bays and parked ships read as black silhouettes
  for (const z of [-380, 0, 380]) {
    const lamp = new THREE.PointLight(0xcfe8ff, 2.2, R * 4.4, 1.6);
    lamp.position.set(0, 0, z);
    g.add(lamp);
  }

  return g;
}

// --- Foundry Anchorage: the asteroid mine ---
// A displaced icosahedron rock caged by two hexagonal gantry rings. Mining
// beams from pods on the rings track excavation pits that rotate with the
// rock, a debris stream climbs to the hopper under the habitat, and two ore
// shuttles fly opposed loops between the rock face and the dock arm.

const emberMat = new THREE.MeshBasicMaterial({ color: 0xffa050 });
const beamMat = new THREE.MeshBasicMaterial({
  color: 0xffa050,
  transparent: true,
  opacity: 0.7,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

// scratch for the per-frame beam/shuttle math — zero alloc in updateStations
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const NEG_Z = new THREE.Vector3(0, 0, -1);

function miningStation() {
  const g = new THREE.Group();

  // the rock: icosahedron with radially hashed displacement (deterministic,
  // so resets and reloads carve the same asteroid)
  const rockGeo = new THREE.IcosahedronGeometry(90, 2);
  const pos = rockGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    _v1.fromBufferAttribute(pos, i);
    const h =
      Math.sin(_v1.x * 12.9898 + _v1.y * 78.233 + _v1.z * 37.719) * 43758.5453;
    const n = h - Math.floor(h); // 0..1
    _v1.multiplyScalar(0.8 + n * 0.4); // ±20%
    pos.setXYZ(i, _v1.x, _v1.y, _v1.z);
  }
  rockGeo.computeVertexNormals();
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x6e6259,
    roughness: 0.95,
    metalness: 0.1,
  });
  const rock = new THREE.Mesh(rockGeo, rockMat);
  g.add(rock);

  // excavation pits: ember spheres parented to the rock so they ride its
  // rotation; the beams re-derive their world spot each frame
  const pits = [
    new THREE.Vector3(1, 0.25, 0.35).normalize().multiplyScalar(82),
    new THREE.Vector3(-0.55, 0.6, -0.58).normalize().multiplyScalar(84),
    new THREE.Vector3(0.15, -0.9, 0.4).normalize().multiplyScalar(80),
  ];
  const embers = pits.map((p) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(6, 10, 8), emberMat);
    e.position.copy(p);
    rock.add(e);
    return e;
  });
  // one warm light at the first pit for the glow-on-rock read
  const pitLight = new THREE.PointLight(0xff8840, 3.0, 320, 1.8);
  pitLight.position.copy(pits[0]).multiplyScalar(1.25);
  g.add(pitLight);

  // gantry: two hexagonal rings (6-segment torus) bracketing the rock,
  // joined by four trusses at the corners
  for (const zs of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(150, 8, 8, 6), hullMat);
    ring.position.z = zs * 115;
    g.add(ring);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const truss = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 230, 6), darkMat);
    truss.rotation.x = Math.PI / 2;
    truss.position.set(Math.cos(a) * 150, Math.sin(a) * 150, 0);
    g.add(truss);
  }

  // beam emitter pods on the rings, one per ring
  const podPts = [new THREE.Vector3(0, 150, 115), new THREE.Vector3(-130, 75, -115)];
  const beams = [];
  for (const p of podPts) {
    const pod = new THREE.Mesh(new THREE.SphereGeometry(9, 10, 8), darkMat);
    pod.position.copy(p);
    g.add(pod);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(3.5, 8, 6), emberMat);
    tip.position.copy(p).multiplyScalar(0.94);
    g.add(tip);
    // unit-length cylinder along Y, scaled/aimed at its pit every frame
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1, 6, 1, true), beamMat);
    g.add(beam);
    beams.push(beam);
  }

  // habitat + hopper over the front ring, dock arm reaching +X
  const habitat = new THREE.Mesh(new THREE.BoxGeometry(70, 30, 40), hullMat);
  habitat.position.set(0, 185, 60);
  g.add(habitat);
  const habBand = new THREE.Mesh(new THREE.BoxGeometry(72, 5, 30), windowMat);
  habBand.position.set(0, 180, 60);
  g.add(habBand);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 60, 8), darkMat);
  mast.position.set(0, 160, 92);
  mast.rotation.x = 0.5;
  g.add(mast);
  const hopper = new THREE.Mesh(new THREE.ConeGeometry(16, 26, 8), darkMat);
  hopper.position.set(0, 162, 45);
  g.add(hopper);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(130, 8, 10), darkMat);
  arm.position.set(95, 185, 60);
  g.add(arm);
  const pads = [];
  for (const xo of [120, 158]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(26, 3, 26), hullMat);
    pad.position.set(xo, 190, 60);
    g.add(pad);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), glowMat);
    lamp.position.set(xo, 194, 48);
    g.add(lamp);
    pads.push(pad.position);
  }

  // debris stream: one Points draw, particles advected in the vertex shader
  // from the top of the rock to the hopper mouth (starfield discipline —
  // one uniform write per frame, zero CPU work)
  const N = 240;
  const debrisGeo = new THREE.BufferGeometry();
  debrisGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const offs = new Float32Array(N);
  for (let i = 0; i < N; i++) offs[i] = i / N;
  debrisGeo.setAttribute('aOffset', new THREE.BufferAttribute(offs, 1));
  debrisGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 110, 20), 260);
  const debrisMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute float aOffset;
      varying float vFade;
      float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
      void main() {
        float f = fract(aOffset + uTime * 0.045);
        vec3 a = vec3(0.0, 78.0, 0.0);      // lifted off the rock
        vec3 b = vec3(0.0, 158.0, 43.0);    // the hopper mouth
        float h1 = hash(aOffset), h2 = hash(aOffset + 1.7), h3 = hash(aOffset + 3.1);
        vec3 jitter = (vec3(h1, h2, h3) - 0.5) * vec3(46.0, 20.0, 46.0) * (1.0 - f);
        vec3 p = mix(a, b, f) + jitter;
        vFade = sin(f * 3.14159);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(140.0 / -mv.z, 0.5, 4.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vFade;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        if (dot(d, d) > 0.25) discard;
        gl_FragColor = vec4(0.72, 0.62, 0.52, vFade * 0.8);
      }
    `,
  });
  const debris = new THREE.Points(debrisGeo, debrisMat);
  g.add(debris);

  // two ore shuttles on opposed elliptical loops, rock face <-> dock pads
  const shuttles = [];
  for (let i = 0; i < 2; i++) {
    const s = dockedShip(0.5, 0x82f7ff);
    g.add(s);
    shuttles.push(s);
  }
  const pathA = pads[0]; // dock end of the loop
  const pathB = new THREE.Vector3(74, 10, 8); // just off the rock face

  // per-frame animation: beams track their (rotating) pits, embers pulse,
  // debris advects, shuttles fly the loop
  function anim(t) {
    rock.rotation.y = t * 0.02;
    const rc = Math.cos(rock.rotation.y);
    const rs = Math.sin(rock.rotation.y);
    for (let i = 0; i < beams.length; i++) {
      const pit = pits[(Math.floor(t / C.MINE_BEAM_CYCLE) + i) % pits.length];
      // the pit point, rotated with the rock (hand-rolled rotateY)
      _v1.set(pit.x * rc + pit.z * rs, pit.y, -pit.x * rs + pit.z * rc);
      _v2.copy(podPts[i]);
      _v3.subVectors(_v1, _v2);
      const len = _v3.length();
      const beam = beams[i];
      beam.scale.set(1, len, 1);
      beam.quaternion.setFromUnitVectors(Y_AXIS, _v3.multiplyScalar(1 / len));
      beam.position.addVectors(_v2, _v1).multiplyScalar(0.5);
    }
    for (let i = 0; i < embers.length; i++) {
      embers[i].scale.setScalar(1 + 0.3 * Math.sin(t * 7 + i * 2.1));
    }
    debrisMat.uniforms.uTime.value = t;
    for (let i = 0; i < shuttles.length; i++) {
      const th = t * 0.22 + i * Math.PI; // opposed phases
      const ct = Math.cos(th);
      const st = Math.sin(th);
      // ellipse through the dock pad (th=0) and the rock face (th=pi)
      _v1.addVectors(pathA, pathB).multiplyScalar(0.5); // center
      _v2.subVectors(pathA, pathB).multiplyScalar(0.5); // semi-major
      _v3.set(-_v2.y * 0.3, _v2.x * 0.3, 55); // out-of-plane semi-minor
      const sh = shuttles[i];
      sh.position.copy(_v1).addScaledVector(_v2, ct).addScaledVector(_v3, st);
      // nose along the path tangent
      _v4.copy(_v2).multiplyScalar(-st).addScaledVector(_v3, ct).normalize();
      sh.quaternion.setFromUnitVectors(NEG_Z, _v4);
    }
  }

  return { group: g, anim };
}

export function initStations(scene) {
  // Port Feelgood: parked on the terra→oceana run, bore aimed down the
  // route so travellers fly straight through. No spin — the fixed
  // orientation is the point (spin would swing the tunnel off the route).
  const mega = megaStation();
  const route = new THREE.Vector3(0.9, -0.11, -0.42).normalize(); // toward oceana
  mega.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), route);
  stations.push({
    group: mega,
    name: 'Port Feelgood',
    logDist: 3500,
    spin: 0,
    offset: route.clone().multiplyScalar(6000),
    planetIndex: 0,
  });

  // Meridian Ring: slow orbit around terra, high above the atmosphere.
  const ring = ringStation();
  stations.push({
    group: ring,
    name: 'Meridian Ring',
    logDist: 1600,
    spin: 0.05,
    orbit: { planetIndex: 0, radius: 2600, rate: 0.01, phase: 1.2 },
  });

  // Auric Platform: parked off Saturnia, above the ring plane.
  const platform = platformStation();
  stations.push({
    group: platform,
    name: 'Auric Platform',
    logDist: 1600,
    spin: 0.012,
    offset: new THREE.Vector3(4200, 2200, -900),
    planetIndex: 4,
  });

  // Relay KX-7: deep space, roughly halfway to the black hole.
  const relay = relayStation();
  relay.position.set(0.52, 0.14, -0.84).normalize().multiplyScalar(12500);
  relay.position.y += 600;
  stations.push({ group: relay, name: 'Relay KX-7', logDist: 1600, spin: 0.09 });

  // Frostwatch Relay: a listening post hanging off glacia.
  const frostwatch = relayStation();
  frostwatch.scale.setScalar(1.35);
  stations.push({
    group: frostwatch,
    name: 'Frostwatch Relay',
    logDist: 1600,
    spin: -0.06,
    offset: new THREE.Vector3(1800, 950, -420),
    planetIndex: 2,
  });

  // Halcyon Platform: a survey platform in neptunia's shadow.
  const halcyon = platformStation();
  halcyon.scale.setScalar(1.2);
  stations.push({
    group: halcyon,
    name: 'Halcyon Platform',
    logDist: 1600,
    spin: 0.02,
    offset: new THREE.Vector3(2600, -1300, 900),
    planetIndex: 5,
  });

  // Foundry Anchorage: the asteroid mine, anchored off rustia — the iron
  // world is where the ore is. spin: 0 like Port Feelgood: the beams are
  // aimed geometry, so the frame stays put while the rock turns inside it.
  const foundry = miningStation();
  stations.push({
    group: foundry.group,
    name: 'Foundry Anchorage',
    logDist: 1600,
    spin: 0,
    offset: new THREE.Vector3(-3000, 800, 2200),
    planetIndex: 3,
    anim: foundry.anim,
  });

  for (const s of stations) {
    scene.add(s.group);
    addShiftable(s.group);
  }
  return stations;
}

// Animation is invisible well before a station shrinks to a few pixels —
// beyond this range only the (origin-shift-critical) position updates run.
// spin/anim use absolute t, so resuming in range lands exactly where the
// motion would have been; there is no discontinuity. (Audit fix: the mining
// rig's beam/shuttle trig used to run every frame from 90k units away.)
const ANIM_DISTANCE_SQ = 6000 * 6000;

export function updateStations(t, shipPos) {
  for (const s of stations) {
    const animate = s.group.position.distanceToSquared(shipPos) < ANIM_DISTANCE_SQ;
    if (s.anim && animate) s.anim(t);
    // spin 0 means a deliberately fixed orientation (Port Feelgood's bore
    // stays aimed down the route) — don't clobber its quaternion
    if (s.spin && animate) s.group.rotation.y = t * s.spin;
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
