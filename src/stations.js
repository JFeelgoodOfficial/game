// Space stations — procedural geometry, lit by the sun's directional light
// (standard materials), with emissive accent strips that catch the bloom.
// No gravity, no collision (GDD 1.2): scenery you can fly around and
// through. Eight of them:
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
//   - Orbital Art Gallery: a cultural hub in a wide terra orbit — a ringed
//     docking spine leads to a glass Grand Hall tower whose gallery decks
//     hang the owner's art collection (images from /artgallery). The one
//     dockable station: G at the berth parks the ship and the interior is
//     walked on foot in low gravity (galleryLayout.js + stationWalk.js).

import * as THREE from 'three';
import { C } from './constants.js';
import { addShiftable } from './origin.js';
import { planets } from './planet.js';
import * as GL from './galleryLayout.js';

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

// --- Orbital Art Gallery: the cultural hub ---
// A ringed docking spine (open bore, flythrough like Port Feelgood at a
// fifth of the scale) runs into a tall tapered Grand Hall tower: a glazed
// atrium where four balcony levels hang the owner's art collection on lit
// panels. Brass-gold placards mark the approach and the entrance arch.

// the owner's art: drop images into /artgallery at the repo root and they
// hang themselves on the panels (alphabetical, cycling across 32 slots);
// empty slots get a procedural placeholder — same contract as the corridor
// pictures in interior.js
const galleryArtUrls = Object.entries(
  import.meta.glob('/artgallery/*.{png,jpg,jpeg,webp}', {
    eager: true,
    query: '?url',
    import: 'default',
  })
)
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([, url]) => url);

const artLoader = new THREE.TextureLoader();
const galleryTexCache = new Map(); // url -> texture, so 32 slots share loads

function galleryTexture(url) {
  let tex = galleryTexCache.get(url);
  if (!tex) {
    tex = artLoader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    galleryTexCache.set(url, tex);
  }
  return tex;
}

function galleryPlaceholder(seed) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 180;
  const ctx = cv.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 180);
  grad.addColorStop(0, '#141a26');
  grad.addColorStop(1, '#0a0d14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 180);
  // a scatter of stars, deterministic per panel slot
  ctx.fillStyle = '#9fb4cc';
  for (let i = 0; i < 40; i++) {
    const h = Math.sin(seed * 37.7 + i * 12.9898) * 43758.5453;
    const h2 = Math.sin(seed * 51.3 + i * 78.233) * 24634.6345;
    const x = (h - Math.floor(h)) * 256;
    const y = (h2 - Math.floor(h2)) * 150;
    ctx.globalAlpha = 0.25 + ((h * 7) % 1) * 0.6;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#d4af6a';
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, 236, 160);
  ctx.fillStyle = '#5a6a80';
  ctx.font = '13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ORBITAL ART GALLERY', 128, 85);
  ctx.font = '10px monospace';
  ctx.fillText('add images to artgallery/', 128, 105);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// brass-gold accent — the gallery's signage color, nothing else uses it
const brassMat = new THREE.MeshBasicMaterial({ color: 0xd4af6a });

// A lit signage plate: dark backing, gold border, gold lettering — the
// station's exterior name ("ORBITAL ART GALLERY"). Drawn to a canvas so it's
// real text, not a stand-in bar. MeshBasicMaterial keeps it legible against
// space; the gold (0xd4af6a, max channel ~0.83) sits just under the bloom
// threshold so it reads as a sign, not a flare.
function gallerySignTexture(line1, line2, wPx = 1024, hPx = 256) {
  const cv = document.createElement('canvas');
  cv.width = wPx;
  cv.height = hPx;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0a0d14';
  ctx.fillRect(0, 0, wPx, hPx);
  ctx.strokeStyle = '#d4af6a';
  ctx.lineWidth = Math.round(hPx * 0.028);
  const m = hPx * 0.07;
  ctx.strokeRect(m, m, wPx - m * 2, hPx - m * 2);
  ctx.fillStyle = '#d4af6a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (line2) {
    ctx.font = `bold ${Math.round(hPx * 0.32)}px Georgia, "Times New Roman", serif`;
    ctx.fillText(line1, wPx / 2, hPx * 0.4);
    ctx.font = `${Math.round(hPx * 0.13)}px Georgia, serif`;
    ctx.fillText(line2, wPx / 2, hPx * 0.72);
  } else {
    ctx.font = `bold ${Math.round(hPx * 0.5)}px Georgia, "Times New Roman", serif`;
    ctx.fillText(line1, wPx / 2, hPx * 0.55);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// interior surfaces are seen from both sides (decks from below, ramps from
// everywhere), so they get their own double-sided variants of the house look
const deckMat = new THREE.MeshStandardMaterial({
  color: 0x767e8a,
  roughness: 0.6,
  metalness: 0.6,
  side: THREE.DoubleSide,
});
const floorMat = new THREE.MeshStandardMaterial({
  color: 0x3a4048,
  roughness: 0.7,
  metalness: 0.5,
  side: THREE.DoubleSide,
});

// Annular deck sector (flat ring slab with the ramp notch already cut).
// Shape-space XY maps to world XZ under rotation.x = PI/2, with the extrude
// depth going downward — so the mesh's y position IS the walking surface.
function ringSector(rIn, rOut, deg0, deg1) {
  const a0 = (deg0 * Math.PI) / 180;
  const a1 = (deg1 * Math.PI) / 180;
  const s = new THREE.Shape();
  s.absarc(0, 0, rOut, a0, a1, false);
  s.absarc(0, 0, rIn, a1, a0, true);
  return new THREE.ExtrudeGeometry(s, {
    depth: GL.DECK_THICKNESS,
    bevelEnabled: false,
    curveSegments: 28,
  });
}

// Spiral ramp ribbon between two heights, swept over a polar sector around
// the tower axis. Coordinates are tower-centered (add TOWER at placement).
function spiralRibbon(rIn, rOut, th0, th1, yA, yB, segs) {
  const pos = [];
  const index = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const th = ((th0 + (th1 - th0) * t) * Math.PI) / 180;
    const y = yA + (yB - yA) * t;
    pos.push(Math.cos(th) * rIn, y, Math.sin(th) * rIn);
    pos.push(Math.cos(th) * rOut, y, Math.sin(th) * rOut);
  }
  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

function addBox(parent, w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function orbitalArtGalleryStation() {
  const g = new THREE.Group();

  // docking spine: the open bore runs down local Z into the tower. Nothing
  // occludes the gap between the spine (r 6) and the ring trusses (r 34) —
  // thread it like Port Feelgood's bore at a fifth of the scale.
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 260, 12), hullMat);
  spine.rotation.x = Math.PI / 2;
  spine.position.z = -20; // spans z -150..110, meeting the tower's base
  g.add(spine);

  // four ring trusses along the spine; the torus already lies in XY so it
  // faces the bore. Collected for anim — each gets an independent micro-roll.
  const rings = [];
  [-90, -30, 40, 100].forEach((z, i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(34, 3, 8, 24), darkMat);
    ring.position.z = z;
    g.add(ring);
    rings.push(ring);
    // solar wing pairs on alternating rings, parented so they ride the roll
    if (i % 2 === 0) {
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(70, 1, 18), panelMat);
        wing.position.x = s * 52;
        ring.add(wing);
      }
    }
  });

  // approach placard over the spine, facing back down the bore — you read
  // the name as you line up your final approach through the ring trusses
  const approachSign = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 12),
    new THREE.MeshBasicMaterial({
      map: gallerySignTexture('ORBITAL ART GALLERY', 'EST 2042 · CULTURAL HUB', 1024, 256),
      side: THREE.DoubleSide,
    })
  );
  approachSign.position.set(0, 14, 78);
  g.add(approachSign);

  // Grand Hall tower: a tapered open-ended shell standing vertical at the
  // spine's +Z end. DoubleSide so the interior wall renders for visitors;
  // the glazing band floats just outside it as translucent glass so the
  // atrium reads as a lit glass tower rather than bare metal.
  const tower = new THREE.Group();
  tower.position.set(0, 50, 150); // base at y -40, crown at y 140
  g.add(tower);
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0x9aa2ad,
    roughness: 0.55,
    metalness: 0.75,
    side: THREE.DoubleSide,
  });
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(70, 55, 180, 16, 1, true), shellMat);
  tower.add(shell);
  const glassMat = new THREE.MeshBasicMaterial({
    color: 0xbfe8ff,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const glazing = new THREE.Mesh(new THREE.CylinderGeometry(72, 57, 176, 16, 1, true), glassMat);
  tower.add(glazing);

  // exterior glass-grid read: vertical mullions leaning with the taper, a
  // lit window band at each balcony level, and a glowing crown ring — from
  // outside the tower reads as an inhabited glass atrium, not bare hull
  const towerR = (y) => 55 + ((y + 90) / 180) * 15; // shell radius at local y
  const lean = Math.atan(15 / 180); // taper angle
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const mullion = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 181, 6), darkMat);
    mullion.position.set(Math.cos(a) * 63, 0, Math.sin(a) * 63);
    mullion.quaternion.setFromAxisAngle(
      new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)),
      -lean
    );
    tower.add(mullion);
  }
  for (const y of [-70, -35, 0, 35]) {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(towerR(y) + 1.2, towerR(y) + 1.2, 2.5, 16, 1, true),
      windowMat
    );
    band.position.y = y + 9; // level with the hung art inside
    tower.add(band);
  }
  const crown = new THREE.Mesh(new THREE.TorusGeometry(70, 1.6, 6, 32), glowMat);
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 90;
  tower.add(crown);

  // the gallery's name on the tower flanks — big lit plates on three sides
  // (toward the bore, and both broad faces) so it reads from most approach
  // angles. One shared texture, three planes.
  const towerSignMat = new THREE.MeshBasicMaterial({
    map: gallerySignTexture('ORBITAL ART GALLERY', 'EST 2042 · CULTURAL HUB', 1024, 256),
  });
  for (const a of [-Math.PI / 2, 0, Math.PI]) {
    const y = 5;
    const r = towerR(y) + 3.5;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(46, 11.5), towerSignMat);
    sign.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    sign.rotation.y = Math.PI / 2 - a; // outward-facing at this azimuth
    tower.add(sign);
  }

  // entrance arch at the base facing the spine, with the GRAND HALL sign
  const arch = new THREE.Mesh(new THREE.TorusGeometry(20, 2, 8, 16, Math.PI), glowMat);
  arch.position.set(0, -50, -58);
  tower.add(arch);
  const hallSign = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 8),
    new THREE.MeshBasicMaterial({ map: gallerySignTexture('GRAND HALL', null, 512, 160) })
  );
  hallSign.position.set(0, -26, -61);
  hallSign.rotation.y = Math.PI; // face the bore, above the arch
  tower.add(hallSign);

  // ---- walkable interior (foot scale; layout numbers in galleryLayout.js,
  // which stationWalk.js mirrors for collision + NPC placement) ----
  // All interior pieces are added to the station group directly, in
  // group-local coordinates — the frame the walker moves in.

  const TX = GL.TOWER.x;
  const TZ = GL.TOWER.z;

  // Grand Atrium floor (deck A): a full disc at y 0.
  const atriumFloor = new THREE.Mesh(
    new THREE.CylinderGeometry(GL.ATRIUM_FLOOR_R, GL.ATRIUM_FLOOR_R, GL.DECK_THICKNESS, 32),
    floorMat
  );
  atriumFloor.position.set(TX, -GL.DECK_THICKNESS / 2, TZ);
  g.add(atriumFloor);

  // Gallery decks B/C/D: annuli hugging the shell, each with its arrival
  // ramp's notch cut out, plus curb + brass rail at the atrium-void edge.
  for (let d = 1; d < GL.DECKS.length; d++) {
    const y = GL.DECKS[d];
    const notch = GL.DECK_NOTCH[d];
    const outer = GL.towerR(y) - 0.7;
    const deck = new THREE.Mesh(
      ringSector(GL.DECK_INNER_R, outer, notch[1], notch[0] + 360),
      deckMat
    );
    deck.rotation.x = Math.PI / 2;
    deck.position.set(TX, y, TZ);
    g.add(deck);
    const curb = new THREE.Mesh(new THREE.TorusGeometry(GL.DECK_INNER_R, 0.35, 6, 40), darkMat);
    curb.rotation.x = Math.PI / 2;
    curb.position.set(TX, y + 0.15, TZ);
    g.add(curb);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(GL.DECK_INNER_R, 0.16, 6, 40), brassMat);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(TX, y + GL.RAIL_HEIGHT - 0.05, TZ);
    g.add(rail);
  }

  // Spiral ramps between the decks, with brass handrail ribbons.
  for (const r of GL.RAMPS) {
    const ramp = new THREE.Mesh(
      spiralRibbon(GL.RAMP_R_IN, GL.RAMP_R_OUT, r.th0, r.th1, r.yA, r.yB, 32),
      deckMat
    );
    ramp.position.set(TX, 0, TZ);
    g.add(ramp);
    for (const edge of [GL.RAMP_R_IN + 0.1, GL.RAMP_R_OUT - 0.35]) {
      const hand = new THREE.Mesh(
        spiralRibbon(edge, edge + 0.25, r.th0, r.th1, r.yA + 1.0, r.yB + 1.0, 32),
        brassMat
      );
      hand.position.set(TX, 0, TZ);
      g.add(hand);
    }
  }

  // Atrium furniture: central dais, the curator's desk, two easel pedestals
  // (their art panels come from the exhibit loop below).
  const dais = new THREE.Mesh(
    new THREE.CylinderGeometry(GL.DAIS.r - 0.4, GL.DAIS.r - 0.2, GL.DAIS.h, 20),
    darkMat
  );
  dais.position.set(GL.DAIS.x, GL.DAIS.h / 2, GL.DAIS.z);
  g.add(dais);
  addBox(g, 3, 1.1, 1.4, GL.DESK.x, 0.55, GL.DESK.z, darkMat);
  addBox(g, 3.2, 0.1, 1.6, GL.DESK.x, 1.15, GL.DESK.z, brassMat);
  for (const e of GL.EASELS) addBox(g, 0.6, 0.5, 0.6, e.x, 0.25, e.z, darkMat);

  // The 32 exhibits at eye height. Slot order preserved bottom-up so the
  // /artgallery images keep their alphabetical hang order.
  const spots = GL.artSpots();
  for (let k = 0; k < spots.length; k++) {
    const s = spots[k];
    const tex = galleryArtUrls.length
      ? galleryTexture(galleryArtUrls[k % galleryArtUrls.length])
      : galleryPlaceholder(k + 1);
    // color scales the unlit texture to 0.82 so even a pure-white artwork
    // stays under BLOOM_THRESHOLD (0.85) — bright pieces read as paintings,
    // not bloom flares, and the glow frame keeps the lit-exhibit accent
    const art = new THREE.Mesh(
      new THREE.PlaneGeometry(GL.ART_W, GL.ART_H),
      new THREE.MeshBasicMaterial({ map: tex, color: 0xd2d2d2 })
    );
    art.position.set(s.x, s.y, s.z);
    art.rotation.y = s.rotY;
    g.add(art);
    // lit frame just behind the art (against the panel's facing normal)
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(GL.ART_W + 0.6, GL.ART_H + 0.6),
      glowMat
    );
    const nx = Math.sin(s.rotY);
    const nz = Math.cos(s.rotY);
    frame.position.set(s.x - nx * 0.06, s.y, s.z - nz * 0.06);
    frame.rotation.y = s.rotY;
    g.add(frame);
  }

  // ---- spine complex: berth pad, airlock, viewing promenade, crew bay ----
  const R = GL.ROOMS;
  const wallH = R.ceilY - R.floorY; // 4.5
  const wallY = (R.floorY + R.ceilY) / 2; // 9.25

  // Berth pad: an open EVA slab off the airlock's west door, edge-lit.
  const bp = R.berthPad;
  addBox(g, bp.x1 - bp.x0, 1, bp.z1 - bp.z0, (bp.x0 + bp.x1) / 2, bp.topY - 0.5, (bp.z0 + bp.z1) / 2, hullMat);
  addBox(g, 0.4, 0.2, bp.z1 - bp.z0, bp.x0 + 0.2, bp.topY + 0.1, (bp.z0 + bp.z1) / 2, windowMat);
  addBox(g, 0.4, 0.2, bp.z1 - bp.z0, bp.x1 - 0.2, bp.topY + 0.1, (bp.z0 + bp.z1) / 2, windowMat);

  // Airlock room: floor, ceiling, walls with the pad door (west) and the
  // promenade doorway (aft), glow strips over both doors.
  const al = R.airlock;
  addBox(g, 10, 0.6, 14, 0, R.floorY - 0.3, 57, floorMat);
  addBox(g, 10.6, 0.6, 15.2, 0, R.ceilY + 0.3, 57, hullMat);
  addBox(g, 10.6, wallH, 0.6, 0, wallY, al.z0 - 0.3, hullMat); // north
  addBox(g, 0.6, wallH, R.padDoor.z0 - al.z0, al.x0 - 0.3, wallY, (al.z0 + R.padDoor.z0) / 2, hullMat);
  addBox(g, 0.6, wallH, al.z1 - R.padDoor.z1, al.x0 - 0.3, wallY, (R.padDoor.z1 + al.z1) / 2, hullMat);
  addBox(g, 0.6, wallH, 14, al.x1 + 0.3, wallY, 57, hullMat); // east
  addBox(g, R.aftDoor.x0 - al.x0, wallH, 0.6, (al.x0 + R.aftDoor.x0) / 2, wallY, al.z1 + 0.3, hullMat);
  addBox(g, al.x1 - R.aftDoor.x1, wallH, 0.6, (R.aftDoor.x1 + al.x1) / 2, wallY, al.z1 + 0.3, hullMat);
  addBox(g, 3.6, 0.25, 0.7, 0, R.ceilY - 0.35, al.z1 + 0.3, glowMat); // aft door strip
  addBox(g, 0.7, 0.25, 6.2, al.x0 - 0.3, R.ceilY - 0.35, 57, glowMat); // pad door strip

  // Viewing promenade: open window bays on the west (sill + header + posts,
  // the 8.1..10.2 band is clear glass at eye height), solid hull east wall
  // with the crew-bay door, widened observation bay framing terra.
  const pr = R.promenade;
  const bay = R.bay;
  addBox(g, 6, 0.6, pr.z1 - pr.z0, 0, R.floorY - 0.3, (pr.z0 + pr.z1) / 2, floorMat);
  addBox(g, 6.6, 0.6, pr.z1 - pr.z0, 0, R.ceilY + 0.3, (pr.z0 + pr.z1) / 2, hullMat);
  addBox(g, 4, 0.6, bay.z1 - bay.z0, -5, R.floorY - 0.3, 77, floorMat);
  addBox(g, 4, 0.6, bay.z1 - bay.z0, -5, R.ceilY + 0.3, 77, hullMat);
  // west window sections (promenade wall outside the bay span)
  for (const seg of [
    { z0: pr.z0, z1: bay.z0, x: pr.x0 - 0.3 },
    { z0: bay.z1, z1: pr.z1, x: pr.x0 - 0.3 },
    { z0: bay.z0, z1: bay.z1, x: bay.x0 - 0.3 }, // the observation bay glass
  ]) {
    const len = seg.z1 - seg.z0;
    const zc = (seg.z0 + seg.z1) / 2;
    addBox(g, 0.6, R.sillTop - R.floorY, len, seg.x, (R.floorY + R.sillTop) / 2, zc, hullMat);
    addBox(g, 0.6, R.ceilY - R.headerY, len, seg.x, (R.headerY + R.ceilY) / 2, zc, hullMat);
    addBox(g, 0.5, wallH, 0.5, seg.x, wallY, zc, darkMat); // center mullion post
  }
  // bay return walls joining the promenade wall to the bay glass
  addBox(g, 4.6, wallH, 0.6, -5.15, wallY, bay.z0 - 0.3, hullMat);
  addBox(g, 4.6, wallH, 0.6, -5.15, wallY, bay.z1 + 0.3, hullMat);
  // east wall segments around the crew-bay door, with a lit band
  const cd = R.crewDoor;
  addBox(g, 0.6, wallH, cd.z0 - pr.z0, pr.x1 + 0.3, wallY, (pr.z0 + cd.z0) / 2, hullMat);
  addBox(g, 0.6, wallH, pr.z1 - cd.z1, pr.x1 + 0.3, wallY, (cd.z1 + pr.z1) / 2, hullMat);
  addBox(g, 0.15, 1.0, 14, pr.x1 - 0.05, 9, 83, windowMat);
  addBox(g, 0.7, 0.25, cd.z1 - cd.z0 + 0.4, pr.x1 + 0.3, R.ceilY - 0.35, (cd.z0 + cd.z1) / 2, glowMat);

  // Crew & maintenance bay: the workers' room — crates, a lit console.
  const cw = R.crew;
  addBox(g, 12, 0.6, 14, 9, R.floorY - 0.3, 75, floorMat);
  addBox(g, 12.6, 0.6, 15.2, 9, R.ceilY + 0.3, 75, hullMat);
  addBox(g, 12, wallH, 0.6, 9, wallY, cw.z0 - 0.3, hullMat);
  addBox(g, 12, wallH, 0.6, 9, wallY, cw.z1 + 0.3, hullMat);
  addBox(g, 0.6, wallH, 14, cw.x1 + 0.3, wallY, 75, hullMat);
  addBox(g, 0.8, 2.4, 6, cw.x1 - 0.4, R.floorY + 1.4, 77, darkMat); // console
  addBox(g, 0.2, 0.5, 5.4, cw.x1 - 0.9, R.floorY + 2.2, 77, windowMat);
  addBox(g, 1.4, 1.4, 1.4, 11.5, R.floorY + 0.7, 70.5, darkMat); // crates
  addBox(g, 1.1, 1.1, 1.1, 13.2, R.floorY + 0.55, 72.2, darkMat);
  addBox(g, 1.2, 1.2, 1.2, 11.5, R.floorY + 2.0, 70.5, darkMat);

  // Vestibule: the ramp from the promenade down into the atrium, framed by
  // the entrance arch outside, with glow guide strips along its edges.
  const vs = R.vestibule;
  const rampLen = Math.hypot(vs.z1 - vs.z0, R.floorY);
  const rampTilt = Math.atan2(R.floorY, vs.z1 - vs.z0);
  const rampFloor = addBox(g, 6, 0.6, rampLen + 0.4, 0, R.floorY / 2 - 0.3, (vs.z0 + vs.z1) / 2, floorMat);
  rampFloor.rotation.x = rampTilt;
  for (const sx of [-2.6, 2.6]) {
    const strip = addBox(g, 0.25, 0.15, rampLen, sx, R.floorY / 2 + 0.35, (vs.z0 + vs.z1) / 2, glowMat);
    strip.rotation.x = rampTilt;
  }
  addBox(g, 0.6, 11.5, vs.z1 - vs.z0, vs.x0 - 0.3, 5.75, (vs.z0 + vs.z1) / 2, darkMat);
  addBox(g, 0.6, 11.5, vs.z1 - vs.z0, vs.x1 + 0.3, 5.75, (vs.z0 + vs.z1) / 2, darkMat);

  // interior lights — the sun can't reach past the glazing, so without
  // these the decks read as silhouettes (Port Feelgood convention). Gentle
  // decay 1.0: physical falloff dies long before the 55u shell at walking
  // scale, and a gallery wants its walls readable.
  for (const y of [-38, 38]) {
    const lamp = new THREE.PointLight(0xfff2d8, 18, 300, 1.0);
    lamp.position.y = y;
    tower.add(lamp);
  }
  const promLamp = new THREE.PointLight(0xfff2d8, 6, 60, 1.0);
  promLamp.position.set(0, 10.4, 78);
  g.add(promLamp);
  const crewLamp = new THREE.PointLight(0xffc890, 5, 40, 1.0);
  crewLamp.position.set(9, 10.4, 75);
  g.add(crewLamp);

  // dressing: a visiting shuttle berthed under the spine (clear of the room
  // complex on top), two patrol craft off the crown
  const shuttle = dockedShip(1.1, 0xd4af6a);
  shuttle.position.set(14, -12, 30);
  shuttle.rotation.y = 0.15;
  g.add(shuttle);
  const patrolA = dockedShip(0.7, 0xbfe8ff);
  patrolA.position.set(95, 125, 150);
  patrolA.rotation.set(0.1, 1.9, 0.05);
  g.add(patrolA);
  const patrolB = dockedShip(0.7, 0xbfe8ff);
  patrolB.position.set(-88, 100, 178);
  patrolB.rotation.set(-0.08, -0.7, 0.1);
  g.add(patrolB);

  // ring trusses roll independently of the hull spin, rates staggered so
  // the spine reads alive on approach
  function anim(t) {
    for (let i = 0; i < rings.length; i++) {
      rings[i].rotation.z = t * (0.02 + i * 0.005);
    }
  }

  return { group: g, anim };
}

export function initStations(scene) {
  // Anchor planets are looked up by name, not raw index — CONFIGS order
  // shifts when planets are inserted (wavemall prime once bumped saturnia
  // and neptunia, stranding two stations off the wrong worlds).
  const idx = (name) => planets.findIndex((p) => p.cfg.name === name);

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
    planetIndex: idx('terra'),
  });

  // Meridian Ring: slow orbit around terra, high above the atmosphere.
  const ring = ringStation();
  stations.push({
    group: ring,
    name: 'Meridian Ring',
    logDist: 1600,
    spin: 0.05,
    orbit: { planetIndex: idx('terra'), radius: 2600, rate: 0.01, phase: 1.2 },
  });

  // Auric Platform: parked off Saturnia, above the ring plane.
  const platform = platformStation();
  stations.push({
    group: platform,
    name: 'Auric Platform',
    logDist: 1600,
    spin: 0.012,
    offset: new THREE.Vector3(4200, 2200, -900),
    planetIndex: idx('saturnia'),
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
    planetIndex: idx('glacia'),
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
    planetIndex: idx('neptunia'),
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
    planetIndex: idx('rustia'),
    anim: foundry.anim,
  });

  // Orbital Art Gallery: the cultural hub in a wide, stately terra orbit —
  // outside Meridian Ring's lane (radius 2600) so the two never crowd. The
  // dock entry marks it G-dockable (game.js gate -> stationWalk.js).
  const gallery = orbitalArtGalleryStation();
  stations.push({
    group: gallery.group,
    name: 'Orbital Art Gallery',
    logDist: 1600,
    spin: 0.015,
    orbit: { planetIndex: idx('terra'), radius: 3400, rate: 0.007, phase: 4.2 },
    anim: gallery.anim,
    dock: { berthLocal: GL.BERTH_LOCAL },
  });

  for (const s of stations) {
    scene.add(s.group);
    addShiftable(s.group);
  }
  return stations;
}

// The dockable-station lookup for game.js's G gate and stationWalk.js's
// undock math. `dist` is to the NEAREST of the station's two anchors — the
// spine (group origin) and the tower center — not the small berth point, so
// pressing G anywhere alongside the ~400u-long station docks (the whole hard
// part of "where do I dock" was aiming at an invisible spot). The returned
// berth vector is module scratch — copy, don't keep.
const _berthW = new THREE.Vector3();
const _anchorW = new THREE.Vector3();
const _yUpV = new THREE.Vector3(0, 1, 0);
export function nearestDockableStation(shipPos) {
  let bestS = null;
  let bestD = Infinity;
  for (const s of stations) {
    if (!s.dock) continue;
    // spine anchor (the group origin sits on the docking spine)
    let d = s.group.position.distanceTo(shipPos);
    // tower anchor (the Grand Hall is 150u down +Z from the origin)
    _anchorW
      .set(0, 50, 150)
      .applyAxisAngle(_yUpV, s.group.rotation.y)
      .add(s.group.position);
    d = Math.min(d, _anchorW.distanceTo(shipPos));
    if (d < bestD) {
      bestD = d;
      bestS = s;
    }
  }
  if (!bestS) return null;
  _berthW
    .set(bestS.dock.berthLocal.x, bestS.dock.berthLocal.y, bestS.dock.berthLocal.z)
    .applyAxisAngle(_yUpV, bestS.group.rotation.y)
    .add(bestS.group.position);
  return { station: bestS, dist: bestD, berth: _berthW };
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
