// Hyperrealistic thatched cottage — walkable interior + cottage gardens
// Textures: mrdoob/three.js @dev  examples/textures/*  (copied into examples/textures/)
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';

/* ---------------------------------------------------------------- seeded rng */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260727);
const rand = (a = 0, b = 1) => a + rng() * (b - a);

/* ---------------------------------------------------------------- renderer */
const container = document.getElementById('app') || document.body;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xc9d8c4, 0.0075);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 600);
camera.position.set(11, 5.2, 19);
if (window.__startView) camera.position.set(...window.__startView.p);

/* ---------------------------------------------------------------- sky + env */
const sky = new Sky();
sky.scale.setScalar(4500);
const su = sky.material.uniforms;
su.turbidity.value = 4;
su.rayleigh.value = 1.6;
su.mieCoefficient.value = 0.006;
su.mieDirectionalG.value = 0.82;
const sunDir = new THREE.Vector3().setFromSphericalCoords(
  1, THREE.MathUtils.degToRad(66), THREE.MathUtils.degToRad(58));
su.sunPosition.value.copy(sunDir);
scene.add(sky);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(sky, 0, 0.1, 1000).texture;
scene.environmentIntensity = 0.7;

const sun = new THREE.DirectionalLight(0xfff2d8, 3.2);
sun.position.copy(sunDir).multiplyScalar(60);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 160;
const S = 26;
Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S });
sun.shadow.bias = -0.0007;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbcd7ff, 0x4b6b3a, 0.55));

/* ---------------------------------------------------------------- textures */
const tl = new THREE.TextureLoader();
function tex(url, repeat = 1, srgb = true) {
  const t = tl.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const T = 'examples/textures/';
const grassMap = tex(T + 'terrain/grasslight-big.jpg', 200);
const brickMap = tex(T + 'brick_diffuse.jpg', 2);
const brickBump = tex(T + 'brick_bump.jpg', 2, false);
const brickRough = tex(T + 'brick_roughness.jpg', 2, false);
const woodMap = tex(T + 'hardwood2_diffuse.jpg', 6);
const woodBump = tex(T + 'hardwood2_bump.jpg', 6, false);
const woodRough = tex(T + 'hardwood2_roughness.jpg', 6, false);
const blossomMap = tex(T + 'sprites/blossom.png', 1);

// procedural straw / thatch
function thatchTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#8a7047'; g.fillRect(0, 0, 1024, 1024);
  // broad tonal banding (thatch courses)
  for (let y = 0; y < 1024; y += 64) {
    const v = rand(0.82, 1.12);
    g.fillStyle = `rgba(${(140 * v) | 0},${(116 * v) | 0},${(74 * v) | 0},0.55)`;
    g.fillRect(0, y, 1024, 64);
    g.fillStyle = 'rgba(60,45,26,0.22)';
    g.fillRect(0, y + 58, 1024, 6);
  }
  for (let i = 0; i < 42000; i++) {
    const x = rand(0, 1024), y = rand(0, 1024), l = rand(14, 62);
    const v = rand(0.55, 1.25);
    g.strokeStyle = `rgba(${(168 * v) | 0},${(140 * v) | 0},${(92 * v) | 0},${rand(0.2, 0.75)})`;
    g.lineWidth = rand(0.7, 2.4);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-4, 4), y + l); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.4, 0.4);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
// procedural lime plaster
function plasterTexture(base = [239, 234, 220]) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) {
    const v = rand(-16, 12);
    g.fillStyle = `rgba(${base[0] + v},${base[1] + v},${base[2] + v - 2},0.5)`;
    g.fillRect(rand(0, 512), rand(0, 512), rand(1, 5), rand(1, 5));
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const thatchMap = thatchTexture();
const plasterMap = plasterTexture();
const plasterMapIn = plasterTexture([246, 240, 226]);

/* ---------------------------------------------------------------- materials */
const M = {
  grass: new THREE.MeshStandardMaterial({ map: grassMap, color: 0x7d9c55, roughness: 1 }),
  thatch: new THREE.MeshStandardMaterial({ map: thatchMap, bumpMap: thatchMap, bumpScale: 3, roughness: 1, color: 0xcfae7c }),
  plaster: new THREE.MeshStandardMaterial({ map: plasterMap, bumpMap: plasterMap, bumpScale: 0.6, roughness: 0.92 }),
  plasterIn: new THREE.MeshStandardMaterial({ map: plasterMapIn, bumpMap: plasterMapIn, bumpScale: 0.4, roughness: 0.95 }),
  brick: new THREE.MeshStandardMaterial({ map: brickMap, bumpMap: brickBump, bumpScale: 0.6, roughnessMap: brickRough, roughness: 1 }),
  wood: new THREE.MeshStandardMaterial({ map: woodMap, bumpMap: woodBump, bumpScale: 0.25, roughnessMap: woodRough, roughness: 0.8 }),
  beam: new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.85 }),
  trim: new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.55 }),
  door: new THREE.MeshStandardMaterial({ color: 0x8fa383, roughness: 0.5 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xdfeef2, roughness: 0.06, metalness: 0, transmission: 0.92,
    thickness: 0.05, ior: 1.5, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
  }),
  stone: new THREE.MeshStandardMaterial({ color: 0x9a958c, roughness: 0.95 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x4a7a33, roughness: 0.95, flatShading: true }),
  leafDark: new THREE.MeshStandardMaterial({ color: 0x2c4d21, roughness: 1, flatShading: true }),
  bark: new THREE.MeshStandardMaterial({ color: 0x4a3a2b, roughness: 1 }),
  fabric: new THREE.MeshStandardMaterial({ color: 0x8d6d63, roughness: 0.95 }),
  fabricLight: new THREE.MeshStandardMaterial({ color: 0xd8cdb8, roughness: 0.95 }),
  linen: new THREE.MeshStandardMaterial({ color: 0xeee7d6, roughness: 0.95 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.4, metalness: 0.9 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc9a34a, roughness: 0.3, metalness: 1 }),
  flame: new THREE.MeshStandardMaterial({ color: 0xff8a2b, emissive: 0xff7a1a, emissiveIntensity: 4, roughness: 1 }),
  bulb: new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffd79a, emissiveIntensity: 3 }),
};

/* ---------------------------------------------------------------- helpers */
const colliders = [];  // {x0,x1,z0,z1}
const tmpColor = new THREE.Color();
function collide(x, z, w, d) {
  colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
}
function box(w, h, d, mat, x, y, z, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = opts.cast !== false;
  m.receiveShadow = opts.receive !== false;
  scene.add(m);
  if (opts.solid) collide(x, z, w, d);
  return m;
}
function cyl(r1, r2, h, mat, x, y, z, seg = 18) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  scene.add(m); return m;
}

/* ---------------------------------------------------------------- terrain */
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 1, 1), M.grass);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// rolling hills in the distance
const hillMat = new THREE.MeshStandardMaterial({ color: 0x7f9d5b, roughness: 1 });
for (let i = 0; i < 14; i++) {
  const r = rand(28, 60);
  const h = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 14), hillMat);
  const a = rand(0, Math.PI * 2), dist = r + rand(85, 150);
  h.position.set(Math.cos(a) * dist, rand(-r * 0.82, -r * 0.66), Math.sin(a) * dist);
  h.receiveShadow = true;
  scene.add(h);
}

/* ---------------------------------------------------------------- cottage shell
   footprint: x -4.5..4.5, z -3.5..3.5, wall t=0.36, wall height 2.7 */
const WT = 0.36, WH = 2.7, HX = 4.5, HZ = 3.5;

function wallRun(axis, fixed, from, to, y0, y1, mat = M.plaster, solid = true) {
  const len = to - from, h = y1 - y0, mid = (from + to) / 2;
  const w = axis === 'x' ? len : WT, d = axis === 'x' ? WT : len;
  const x = axis === 'x' ? mid : fixed, z = axis === 'x' ? fixed : mid;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [M.plaster, M.plaster, M.plaster, M.plaster, M.plaster, M.plaster]);
  m.material = mat; m.position.set(x, y0 + h / 2, z);
  m.castShadow = true; m.receiveShadow = true; scene.add(m);
  if (solid && y0 < 1.9) collide(x, z, w + 0.02, d + 0.02);
  return m;
}
// interior plaster skin (slightly inset) for warmer inside walls
function innerSkin(axis, fixed, from, to, y0, y1, sign) {
  const len = to - from, h = y1 - y0, mid = (from + to) / 2;
  const g = new THREE.PlaneGeometry(len, h);
  const m = new THREE.Mesh(g, M.plasterIn);
  if (axis === 'x') { m.position.set(mid, y0 + h / 2, fixed + sign * (WT / 2 + 0.005)); m.rotation.y = sign > 0 ? 0 : Math.PI; }
  else { m.position.set(fixed + sign * (WT / 2 + 0.005), y0 + h / 2, mid); m.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2; }
  m.receiveShadow = true; scene.add(m);
}

// FRONT wall (z = +HZ): door gap -0.75..0.75, windows -3.4..-1.9 and 1.9..3.4
wallRun('x', HZ, -HX, -3.4, 0, WH);
wallRun('x', HZ, -3.4, -1.9, 0, 0.95);           // sill
wallRun('x', HZ, -3.4, -1.9, 2.05, WH);          // head
wallRun('x', HZ, -1.9, -0.75, 0, WH);
wallRun('x', HZ, -0.75, 0.75, 2.15, WH, M.plaster, false); // door lintel
wallRun('x', HZ, 0.75, 1.9, 0, WH);
wallRun('x', HZ, 1.9, 3.4, 0, 0.95);
wallRun('x', HZ, 1.9, 3.4, 2.05, WH);
wallRun('x', HZ, 3.4, HX, 0, WH);
innerSkin('x', HZ, -HX, HX, 0, WH, -1);

// BACK wall (z = -HZ): window -1.2..0.6, fireplace breast handled separately
wallRun('x', -HZ, -HX, -1.2, 0, WH);
wallRun('x', -HZ, -1.2, 0.6, 0, 1.0);
wallRun('x', -HZ, -1.2, 0.6, 2.1, WH);
wallRun('x', -HZ, 0.6, HX, 0, WH);
innerSkin('x', -HZ, -HX, HX, 0, WH, 1);

// LEFT wall (x = -HX): window -1.0..0.6
wallRun('z', -HX, -HZ, -1.0, 0, WH);
wallRun('z', -HX, -1.0, 0.6, 0, 1.0);
wallRun('z', -HX, -1.0, 0.6, 2.1, WH);
wallRun('z', -HX, 0.6, HZ, 0, WH);
innerSkin('z', -HX, -HZ, HZ, 0, WH, 1);

// RIGHT wall (x = +HX): wide kitchen window -0.4..1.8
wallRun('z', HX, -HZ, -0.4, 0, WH);
wallRun('z', HX, -0.4, 1.8, 0, 1.0);
wallRun('z', HX, -0.4, 1.8, 2.1, WH);
wallRun('z', HX, 1.8, HZ, 0, WH);
innerSkin('z', HX, -HZ, HZ, 0, WH, -1);

// stone plinth around the base
const plinth = new THREE.Mesh(new THREE.BoxGeometry(HX * 2 + 0.5, 0.45, HZ * 2 + 0.5), M.stone);
plinth.position.set(0, 0.2, 0); plinth.receiveShadow = true; plinth.castShadow = true;
scene.add(plinth);

/* floors + ceiling */
const floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2 - WT, HZ * 2 - WT), M.wood);
floor.rotation.x = -Math.PI / 2; floor.position.y = 0.42; floor.receiveShadow = true;
scene.add(floor);
const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2),
  new THREE.MeshStandardMaterial({ color: 0xefe8d8, roughness: 0.95 }));
ceil.rotation.x = Math.PI / 2; ceil.position.y = WH - 0.02; ceil.receiveShadow = true;
scene.add(ceil);
for (let i = -3; i <= 3; i++) box(HX * 2, 0.2, 0.22, M.beam, 0, WH - 0.14, i * 1.0);
box(0.24, 0.24, HZ * 2, M.beam, 0, WH - 0.14, 0);

/* windows: frame + mullions + glass */
function window4(x, y, z, w, h, rotY) {
  const g = new THREE.Group();
  g.position.set(x, y, z); g.rotation.y = rotY;
  const frameMat = M.trim;
  const add = (gw, gh, gd, gx, gy, gz, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, gd), mat);
    m.position.set(gx, gy, gz); m.castShadow = true; m.receiveShadow = true; g.add(m);
  };
  add(w + 0.16, 0.1, 0.3, 0, h / 2 + 0.05, 0, frameMat);
  add(w + 0.16, 0.12, 0.34, 0, -h / 2 - 0.06, 0, frameMat);      // sill
  add(0.1, h, 0.3, -w / 2 - 0.05, 0, 0, frameMat);
  add(0.1, h, 0.3, w / 2 + 0.05, 0, 0, frameMat);
  add(0.06, h, 0.16, 0, 0, 0, frameMat);
  for (let i = 1; i <= 2; i++) add(w, 0.05, 0.14, 0, -h / 2 + (h * i) / 3, 0, frameMat);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.glass);
  g.add(glass);
  scene.add(g);
  return g;
}
window4(-2.65, 1.5, HZ + 0.03, 1.5, 1.1, 0);
window4(2.65, 1.5, HZ + 0.03, 1.5, 1.1, 0);
window4(-0.3, 1.55, -HZ - 0.03, 1.8, 1.1, Math.PI);
window4(-0.2, 1.55, 0, 1.6, 1.1, Math.PI / 2).position.set(-HX - 0.03, 1.55, -0.2);
window4(0.7, 1.55, 0, 2.2, 1.1, -Math.PI / 2).position.set(HX + 0.03, 1.55, 0.7);

/* door + porch */
const doorGroup = new THREE.Group();
doorGroup.position.set(-0.75, 0.42, HZ);
const doorPanel = box(1.5, 2.05, 0.1, M.door, 0, 1.03, 0.06);
doorPanel.parent.remove(doorPanel); doorGroup.add(doorPanel);
for (let i = 0; i < 3; i++) {
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.04), M.glass);
  p.position.set(-0.42 + i * 0.42, 1.7, 0.12); doorGroup.add(p);
}
const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), M.brass);
knob.position.set(0.55, 1.0, 0.14); doorGroup.add(knob);
doorGroup.rotation.y = -0.62;   // ajar, walk straight in
scene.add(doorGroup);
// porch canopy
box(2.4, 0.14, 1.2, M.beam, 0, 2.9, HZ + 0.55);
const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 1.5), M.thatch);
canopy.position.set(0, 3.1, HZ + 0.6); canopy.rotation.x = -0.16;
canopy.castShadow = true; scene.add(canopy);
cyl(0.07, 0.07, 2.5, M.beam, -1.1, 1.7, HZ + 1.05);
cyl(0.07, 0.07, 2.5, M.beam, 1.1, 1.7, HZ + 1.05);
// steps
box(2.6, 0.16, 0.6, M.stone, 0, 0.36, HZ + 0.5);
box(3.0, 0.16, 0.5, M.stone, 0, 0.2, HZ + 1.0);
// lanterns beside the door
const lanternLights = [];
[-1.35, 1.35].forEach((lx) => {
  box(0.14, 0.24, 0.14, M.metal, lx, 2.1, HZ + 0.14);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), M.bulb);
  bulb.position.set(lx, 2.1, HZ + 0.14); scene.add(bulb);
  const l = new THREE.PointLight(0xffc46b, 6, 7, 2);
  l.position.set(lx, 2.1, HZ + 0.3); scene.add(l); lanternLights.push(l);
});

/* ---------------------------------------------------------------- thatched roof */
function thatchRoof() {
  const halfW = HZ + 0.6, ridge = 3.3, len = HX * 2 + 1.3;
  const shape = new THREE.Shape();
  shape.moveTo(-halfW, 0);
  shape.lineTo(-halfW * 0.94, 0.42);
  shape.quadraticCurveTo(-halfW * 0.42, ridge * 0.82, 0, ridge);
  shape.quadraticCurveTo(halfW * 0.42, ridge * 0.82, halfW * 0.94, 0.42);
  shape.lineTo(halfW, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: true, bevelSize: 0.16, bevelThickness: 0.16, bevelSegments: 3, curveSegments: 28 });
  geo.rotateY(Math.PI / 2);
  geo.translate(-len / 2 + 0.16, WH - 0.18, 0);
  const roof = new THREE.Mesh(geo, M.thatch);
  roof.castShadow = true; roof.receiveShadow = true;
  scene.add(roof);
  // rolled ridge + eave fringe
  const ridgeRoll = cyl(0.3, 0.3, len, M.thatch, 0, WH + ridge - 0.28, 0, 16);
  ridgeRoll.rotation.z = Math.PI / 2;
  [-1, 1].forEach((s) => {
    const e = cyl(0.3, 0.3, len - 0.2, M.thatch, 0, WH - 0.1, s * halfW * 0.93, 14);
    e.rotation.z = Math.PI / 2;
  });
}
thatchRoof();

// dormer windows (eyebrow style) on the front slope
function dormer(x) {
  const g = new THREE.Group();
  g.position.set(x, WH + 0.95, HZ - 0.75);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.05, 1.5), M.plaster);
  body.castShadow = true; body.receiveShadow = true; g.add(body);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(1.02, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.thatch);
  hood.scale.set(1, 0.72, 1.15); hood.position.y = 0.5; hood.castShadow = true; g.add(hood);
  const w = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.75), M.glass);
  w.position.set(0, 0.05, 0.78); g.add(w);
  const fr = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 0.14), M.trim);
  fr.position.set(0, -0.35, 0.78); g.add(fr);
  const mull = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.1), M.trim);
  mull.position.set(0, 0.05, 0.8); g.add(mull);
  scene.add(g);
}
dormer(-2.3); dormer(2.3);

// chimneys
function chimney(x, z, h) {
  box(0.9, h, 0.9, M.brick, x, WH + h / 2 - 0.2, z);
  box(1.15, 0.2, 1.15, M.brick, x, WH + h - 0.1, z);
  cyl(0.16, 0.19, 0.42, M.brick, x - 0.2, WH + h + 0.2, z, 12);
  cyl(0.16, 0.19, 0.42, M.brick, x + 0.2, WH + h + 0.2, z, 12);
}
chimney(-3.2, -1.4, 4.6);
chimney(3.4, 0.6, 3.9);

/* ---------------------------------------------------------------- interior */
const FY = 0.42; // floor level

// fireplace on the back wall
box(2.6, 2.3, 0.55, M.brick, -3.0, FY + 1.15, -HZ + 0.55, { solid: true });
box(1.5, 1.15, 0.4, new THREE.MeshStandardMaterial({ color: 0x1b1613, roughness: 1 }), -3.0, FY + 0.6, -HZ + 0.72);
box(2.9, 0.18, 0.75, M.beam, -3.0, FY + 1.75, -HZ + 0.62);   // mantel
const logs = new THREE.Group();
for (let i = 0; i < 4; i++) {
  const l = cyl(0.08, 0.08, 0.8, M.bark, 0, 0, 0, 8);
  l.parent.remove(l);
  l.rotation.z = Math.PI / 2; l.rotation.y = rand(-0.5, 0.5);
  l.position.set(rand(-0.2, 0.2), 0.1 + i * 0.09, rand(-0.1, 0.1));
  logs.add(l);
}
logs.position.set(-3.0, FY + 0.1, -HZ + 0.75); scene.add(logs);
const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 12), M.flame);
flame.position.set(-3.0, FY + 0.45, -HZ + 0.75); scene.add(flame);
const fireLight = new THREE.PointLight(0xff7b2d, 14, 9, 2);
fireLight.position.set(-3.0, FY + 0.6, -HZ + 0.9);
fireLight.castShadow = true; fireLight.shadow.mapSize.set(512, 512);
scene.add(fireLight);
// mantel clutter
box(0.14, 0.3, 0.14, M.linen, -3.7, FY + 2.0, -HZ + 0.62);
box(0.14, 0.24, 0.14, M.linen, -2.4, FY + 1.97, -HZ + 0.62);

// rug
const rug = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40),
  new THREE.MeshStandardMaterial({ color: 0x8a4a41, roughness: 1 }));
rug.rotation.x = -Math.PI / 2; rug.position.set(-2.1, FY + 0.012, -0.6);
rug.receiveShadow = true; scene.add(rug);

// sofa facing the fire
function sofa(x, z, ry) {
  const g = new THREE.Group(); g.position.set(x, FY, z); g.rotation.y = ry;
  const p = (w, h, d, px, py, pz, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; g.add(m);
  };
  p(2.0, 0.35, 0.9, 0, 0.28, 0, M.fabric);
  p(2.0, 0.7, 0.22, 0, 0.7, -0.34, M.fabric);
  p(0.24, 0.5, 0.9, -0.88, 0.6, 0, M.fabric);
  p(0.24, 0.5, 0.9, 0.88, 0.6, 0, M.fabric);
  p(0.85, 0.16, 0.75, -0.42, 0.53, 0.03, M.fabricLight);
  p(0.85, 0.16, 0.75, 0.42, 0.53, 0.03, M.fabricLight);
  p(0.4, 0.4, 0.14, -0.55, 0.75, -0.2, M.linen);
  p(0.4, 0.4, 0.14, 0.55, 0.75, -0.2, M.fabricLight);
  [[-0.9, -0.4], [0.9, -0.4], [-0.9, 0.4], [0.9, 0.4]].forEach(([lx, lz]) => {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 10), M.beam);
    l.position.set(lx, 0.1, lz); l.castShadow = true; g.add(l);
  });
  scene.add(g);
  collide(x, z, 2.1, 1.0);
}
sofa(-2.1, 0.6, Math.PI);

// armchair
function armchair(x, z, ry) {
  const g = new THREE.Group(); g.position.set(x, FY, z); g.rotation.y = ry;
  const p = (w, h, d, px, py, pz, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; g.add(m);
  };
  p(0.9, 0.32, 0.85, 0, 0.3, 0, M.fabricLight);
  p(0.9, 0.68, 0.2, 0, 0.68, -0.32, M.fabricLight);
  p(0.18, 0.45, 0.85, -0.36, 0.56, 0, M.fabricLight);
  p(0.18, 0.45, 0.85, 0.36, 0.56, 0, M.fabricLight);
  p(0.6, 0.14, 0.7, 0, 0.51, 0.02, M.fabric);
  scene.add(g); collide(x, z, 1.0, 0.95);
}
armchair(-0.4, -1.5, -2.3);

// coffee table
box(1.1, 0.08, 0.6, M.wood, -2.1, FY + 0.42, -0.55, { solid: true });
[[-0.48, -0.22], [0.48, -0.22], [-0.48, 0.22], [0.48, 0.22]].forEach(([dx, dz]) =>
  cyl(0.045, 0.045, 0.4, M.beam, -2.1 + dx, FY + 0.2, -0.55 + dz, 10));
box(0.22, 0.06, 0.3, new THREE.MeshStandardMaterial({ color: 0x6b3d2e, roughness: 0.6 }), -2.2, FY + 0.49, -0.55);

// dining table + chairs (kitchen side)
box(1.8, 0.09, 1.0, M.wood, 2.4, FY + 0.76, -1.4, { solid: true });
[[-0.78, -0.4], [0.78, -0.4], [-0.78, 0.4], [0.78, 0.4]].forEach(([dx, dz]) =>
  box(0.1, 0.72, 0.1, M.beam, 2.4 + dx, FY + 0.36, -1.4 + dz));
function chair(x, z, ry) {
  const g = new THREE.Group(); g.position.set(x, FY, z); g.rotation.y = ry;
  const p = (w, h, d, px, py, pz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.beam);
    m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; g.add(m);
  };
  p(0.44, 0.06, 0.44, 0, 0.45, 0);
  p(0.44, 0.55, 0.06, 0, 0.72, -0.19);
  [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach(([lx, lz]) => p(0.05, 0.45, 0.05, lx, 0.22, lz));
  scene.add(g); collide(x, z, 0.5, 0.5);
}
chair(1.35, -1.4, Math.PI / 2); chair(3.45, -1.4, -Math.PI / 2); chair(2.4, -0.45, 0);

// kitchen run along the right wall
box(1.0, 0.9, 2.4, new THREE.MeshStandardMaterial({ color: 0xdcd3bf, roughness: 0.8 }), HX - 0.68, FY + 0.45, 1.2, { solid: true });
box(1.1, 0.08, 2.5, M.stone, HX - 0.68, FY + 0.93, 1.2);
box(0.5, 0.06, 0.7, M.metal, HX - 0.68, FY + 0.92, 1.6);
cyl(0.02, 0.02, 0.3, M.brass, HX - 0.68, FY + 1.1, 1.25, 10);
for (let i = 0; i < 3; i++) box(0.06, 0.5, 0.06, M.beam, HX - 0.3, FY + 1.7 + 0, 0.3 + i * 0.35, { cast: true });
box(1.0, 0.06, 2.0, M.wood, HX - 0.4, FY + 1.85, 1.3);   // open shelf
for (let i = 0; i < 5; i++) {
  const jar = cyl(0.07, 0.07, rand(0.14, 0.22), M.linen, HX - 0.45, FY + 1.98, 0.5 + i * 0.4, 12);
  jar.material = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(rand(0.05, 0.13), 0.35, 0.7), roughness: 0.5 });
}

// bookshelf + books
box(1.6, 1.9, 0.34, M.beam, 1.6, FY + 0.95, -HZ + 0.35, { solid: true });
for (let s = 0; s < 4; s++) {
  let bx = 0.95;
  while (bx < 2.3) {
    const w = rand(0.05, 0.1), h = rand(0.22, 0.3);
    const b = box(w, h, 0.24, new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(rand(0, 1), 0.35, 0.38), roughness: 0.7,
    }), bx, FY + 0.3 + s * 0.45 + h / 2, -HZ + 0.35);
    bx += w + 0.012;
  }
}

// bed nook, left rear
box(1.5, 0.4, 2.1, M.beam, -3.4, FY + 0.25, 1.6, { solid: true });
box(1.44, 0.26, 2.0, M.linen, -3.4, FY + 0.58, 1.6);
box(1.3, 0.2, 0.45, M.fabricLight, -3.4, FY + 0.72, 0.85);
box(1.5, 0.9, 0.14, M.beam, -3.4, FY + 0.75, 2.6);
box(1.44, 0.1, 1.2, M.fabric, -3.4, FY + 0.72, 2.0);
box(0.5, 0.5, 0.4, M.beam, -2.4, FY + 0.25, 0.7);   // side table
const bedLamp = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.2, 14, 1, true), M.linen);
bedLamp.position.set(-2.4, FY + 0.62, 0.7); scene.add(bedLamp);
const bedLight = new THREE.PointLight(0xffcf94, 5, 5, 2);
bedLight.position.set(-2.4, FY + 0.55, 0.7); scene.add(bedLight);

// hanging pendant over the table
cyl(0.012, 0.012, 0.8, M.metal, 2.4, WH - 0.55, -1.4, 8);
const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.28, 20, 1, true),
  new THREE.MeshStandardMaterial({ color: 0x2f3b33, roughness: 0.5, side: THREE.DoubleSide }));
shade.position.set(2.4, WH - 1.0, -1.4); scene.add(shade);
const pendantBulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), M.bulb);
pendantBulb.position.set(2.4, WH - 1.12, -1.4); scene.add(pendantBulb);
const pendantLight = new THREE.PointLight(0xffd9a0, 9, 8, 2);
pendantLight.position.set(2.4, WH - 1.15, -1.4);
pendantLight.castShadow = true; pendantLight.shadow.mapSize.set(512, 512);
scene.add(pendantLight);

// potted plants inside
function pot(x, z, s = 1) {
  cyl(0.16 * s, 0.12 * s, 0.24 * s, new THREE.MeshStandardMaterial({ color: 0xa9694b, roughness: 0.9 }), x, FY + 0.12 * s, z, 14);
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12 * s, 10, 8), M.leaf);
    leaf.position.set(x + rand(-0.15, 0.15) * s, FY + (0.3 + rand(0, 0.22)) * s, z + rand(-0.15, 0.15) * s);
    leaf.scale.set(1, 0.7, 1); leaf.castShadow = true; scene.add(leaf);
  }
}
pot(-0.2, 2.6, 1.1); pot(4.0, -2.9, 0.9);

/* ---------------------------------------------------------------- garden */
// stone path from the door
const pathMat = new THREE.MeshStandardMaterial({ map: brickMap, bumpMap: brickBump, bumpScale: 0.4, color: 0xa9a29a, roughness: 1 });
const slab = new THREE.CylinderGeometry(0.55, 0.55, 0.06, 9);
const path = new THREE.InstancedMesh(slab, pathMat, 22);
path.receiveShadow = true;
const dummy = new THREE.Object3D();
for (let i = 0; i < 22; i++) {
  const t = i / 21;
  dummy.position.set(Math.sin(t * 3.4) * 2.2, 0.03, HZ + 1.6 + t * 15);
  dummy.rotation.y = rand(0, Math.PI);
  dummy.scale.set(rand(0.8, 1.15), 1, rand(0.8, 1.15));
  dummy.updateMatrix(); path.setMatrixAt(i, dummy.matrix);
}
scene.add(path);

// grass tufts
const tuft = new THREE.ConeGeometry(0.035, 0.24, 4);
tuft.translate(0, 0.12, 0);
const tufts = new THREE.InstancedMesh(tuft, new THREE.MeshStandardMaterial({ color: 0x6b924a, roughness: 1, flatShading: true }), 16000);
tufts.castShadow = false; tufts.receiveShadow = true;
for (let i = 0; i < 16000; i++) {
  const a = rand(0, Math.PI * 2), r = rand(5, 46);
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const inHouse = Math.abs(x) < HX + 1.2 && Math.abs(z) < HZ + 1.2;
  dummy.position.set(inHouse ? x * 3 : x, 0, inHouse ? z * 3 : z);
  dummy.rotation.set(rand(-0.16, 0.16), rand(0, 6.28), rand(-0.16, 0.16));
  dummy.scale.set(rand(0.7, 1.4), rand(0.5, 1.3), rand(0.7, 1.4));
  tufts.setColorAt(i, tmpColor.setHSL(rand(0.2, 0.3), rand(0.3, 0.55), rand(0.28, 0.46)));
  dummy.updateMatrix(); tufts.setMatrixAt(i, dummy.matrix);
}
scene.add(tufts);
tufts.instanceColor.needsUpdate = true;

// flowering shrubs — foliage clumps + blossom dots
const foliageGeo = new THREE.IcosahedronGeometry(1, 1);
const clumps = new THREE.InstancedMesh(foliageGeo, M.leaf, 900);
const clumpsDark = new THREE.InstancedMesh(foliageGeo, M.leafDark, 700);
clumps.castShadow = clumps.receiveShadow = true;
clumpsDark.castShadow = clumpsDark.receiveShadow = true;
const petalGeo = new THREE.SphereGeometry(0.07, 6, 5);
const petalMat = new THREE.MeshStandardMaterial({ color: 0xf6c3d2, roughness: 0.85 });
const petalMat2 = new THREE.MeshStandardMaterial({ color: 0xfaf3ea, roughness: 0.85 });
const petals = new THREE.InstancedMesh(petalGeo, petalMat, 2600);
const petals2 = new THREE.InstancedMesh(petalGeo, petalMat2, 1800);
let ci = 0, cdi = 0, pi = 0, p2i = 0;

const tmpColor2 = null;
function leafTint(base) {
  return tmpColor.setHSL(rand(0.22, 0.31), rand(0.28, 0.5), base);
}
function shrub(cx, cz, radius, height, blossoms = true) {
  const n = Math.round(radius * 5);
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.28), r = rand(0, radius);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const s = rand(0.25, 0.5) * height;
    dummy.position.set(x, s * 0.75, z);
    dummy.rotation.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28));
    dummy.scale.set(s, s * 0.85, s);
    dummy.updateMatrix();
    if (rng() > 0.45) { if (ci < clumps.count) { clumps.setColorAt(ci, leafTint(rand(0.24, 0.4))); clumps.setMatrixAt(ci++, dummy.matrix); } }
    else if (cdi < clumpsDark.count) { clumpsDark.setColorAt(cdi, leafTint(rand(0.18, 0.28))); clumpsDark.setMatrixAt(cdi++, dummy.matrix); }
    if (!blossoms) continue;
    for (let k = 0; k < 4; k++) {
      dummy.position.set(x + rand(-s, s), s * 0.8 + rand(0, s * 0.9), z + rand(-s, s));
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(rand(0.7, 1.5));
      dummy.updateMatrix();
      if (rng() > 0.4) { if (pi < petals.count) petals.setMatrixAt(pi++, dummy.matrix); }
      else if (p2i < petals2.count) petals2.setMatrixAt(p2i++, dummy.matrix);
    }
  }
}
// beds hugging the cottage and lining the path
for (let x = -HX - 0.6; x <= HX + 0.6; x += 1.05) {
  shrub(x + rand(-0.2, 0.2), HZ + 1.5 + rand(-0.3, 0.3), 0.5, rand(0.9, 1.5));
  shrub(x + rand(-0.2, 0.2), -HZ - 1.3 + rand(-0.3, 0.3), 0.5, rand(0.8, 1.4));
}
for (let z = -HZ - 0.4; z <= HZ + 0.4; z += 1.05) {
  shrub(-HX - 1.5 + rand(-0.3, 0.3), z, 0.5, rand(0.9, 1.6));
  shrub(HX + 1.5 + rand(-0.3, 0.3), z, 0.5, rand(0.9, 1.6));
}
for (let i = 0; i < 34; i++) {
  const t = i / 33;
  const px = Math.sin(t * 3.4) * 2.2, pz = HZ + 1.8 + t * 14.5;
  shrub(px + (i % 2 ? 1 : -1) * rand(1.4, 2.4), pz, rand(0.35, 0.6), rand(0.5, 1.0));
}
for (let i = 0; i < 22; i++) {
  const a = rand(0, 6.28), r = rand(16, 38);
  shrub(Math.cos(a) * r, Math.sin(a) * r, rand(0.6, 1.3), rand(0.8, 1.7), rng() > 0.4);
}
[clumps, clumpsDark, petals, petals2].forEach((m) => {
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  scene.add(m);
});

// climbing roses on the cottage walls
const ivy = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), M.leafDark, 1500);
const ivyFlower = new THREE.InstancedMesh(petalGeo, petalMat, 500);
let ii = 0, ifi = 0;
function climb(axis, fixed, from, to, sign) {
  for (let i = 0; i < 420; i++) {
    const u = rand(from, to);
    const h = rand(0.3, WH + 1.4) * (0.55 + 0.45 * Math.abs(Math.sin(u * 1.7)));
    const off = sign * (WT / 2 + rand(0.05, 0.22));
    const x = axis === 'x' ? u : fixed + off, z = axis === 'x' ? fixed + off : u;
    dummy.position.set(x, h, z);
    dummy.rotation.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28));
    dummy.scale.setScalar(rand(0.5, 1.5));
    dummy.updateMatrix();
    if (ii < ivy.count) ivy.setMatrixAt(ii++, dummy.matrix);
    if (rng() > 0.75 && ifi < ivyFlower.count) {
      dummy.scale.setScalar(rand(0.8, 1.5)); dummy.updateMatrix();
      ivyFlower.setMatrixAt(ifi++, dummy.matrix);
    }
  }
}
climb('x', HZ, -HX, -1.9, 1);
climb('x', -HZ, -HX, HX, -1);
climb('z', -HX, -HZ, HZ, -1);
[ivy, ivyFlower].forEach((m) => { m.castShadow = true; m.instanceMatrix.needsUpdate = true; scene.add(m); });

// window boxes with flowers
[[-2.65, HZ + 0.25], [2.65, HZ + 0.25]].forEach(([bx, bz]) => {
  box(1.7, 0.24, 0.34, M.beam, bx, 0.98, bz);
  shrub(bx, bz, 0.55, 0.55);
});

// trees
function tree(x, z, scale = 1) {
  const h = 6.5 * scale;
  const trunk = cyl(0.18 * scale, 0.42 * scale, h, M.bark, x, h / 2, z, 12);
  trunk.rotation.z = rand(-0.05, 0.05);
  for (let i = 0; i < 26; i++) {
    const a = rand(0, 6.28), r = rand(0, 2.9 * scale);
    const c = new THREE.Mesh(foliageGeo, rng() > 0.5 ? M.leaf : M.leafDark);
    c.position.set(x + Math.cos(a) * r, h * rand(0.72, 1.15), z + Math.sin(a) * r);
    c.scale.set(rand(0.9, 1.8) * scale, rand(0.7, 1.2) * scale, rand(0.9, 1.8) * scale);
    c.rotation.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28));
    c.castShadow = true; c.receiveShadow = true; scene.add(c);
  }
  collide(x, z, 0.9 * scale, 0.9 * scale);
}
tree(-15, -10, 1.35); tree(18, -9, 1.15); tree(16, 14, 1.25); tree(-17, 12, 1.0); tree(-24, -20, 1.5); tree(26, 3, 1.3);

// dry-stone garden wall + gate posts at the far end of the path
const wallStone = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.28, 0.42), M.stone, 620);
let wi = 0;
function stoneWall(x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
  const rows = 4, per = Math.floor(len / 0.48);
  for (let r = 0; r < rows; r++) for (let i = 0; i < per; i++) {
    const t = (i + (r % 2) * 0.5) / per;
    dummy.position.set(x0 + (x1 - x0) * t, 0.14 + r * 0.26, z0 + (z1 - z0) * t);
    dummy.rotation.set(0, ang + rand(-0.12, 0.12), 0);
    dummy.scale.set(rand(0.85, 1.1), rand(0.85, 1.1), rand(0.85, 1.1));
    dummy.updateMatrix();
    if (wi < wallStone.count) wallStone.setMatrixAt(wi++, dummy.matrix);
  }
}
stoneWall(-16, 18, -2.5, 18);
stoneWall(2.5, 18, 16, 18);
wallStone.instanceMatrix.needsUpdate = true;
wallStone.castShadow = wallStone.receiveShadow = true;
scene.add(wallStone);
[[-2.2, 18], [2.2, 18]].forEach(([gx, gz]) => box(0.5, 1.7, 0.5, M.stone, gx, 0.85, gz, { solid: true }));

// drifting blossom petals in the air
const airPetals = new THREE.Points(
  (() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      p[i * 3] = rand(-30, 30); p[i * 3 + 1] = rand(0.5, 9); p[i * 3 + 2] = rand(-30, 30);
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return g;
  })(),
  new THREE.PointsMaterial({ map: blossomMap, size: 0.22, transparent: true, depthWrite: false, opacity: 0.9, color: 0xffe3ec })
);
scene.add(airPetals);
const petalBase = airPetals.geometry.attributes.position.array.slice();

/* ---------------------------------------------------------------- controls */
const walk = new PointerLockControls(camera, renderer.domElement);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 2, 0);
if (window.__startView) orbit.target.set(...window.__startView.t);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI / 2 - 0.03;
orbit.minDistance = 4; orbit.maxDistance = 90;

let mode = 'orbit';
let dragLook = false;   // fallback when pointer lock is unavailable (embedded iframes)
const hud = document.getElementById('hud');
const hint = document.getElementById('hint');
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
function hintText() {
  if (mode !== 'walk') return 'Drag to orbit · scroll to zoom · click or press W to walk inside';
  return dragLook
    ? 'WASD / arrows to walk · drag to look · Shift to run · press O for garden view'
    : 'WASD / arrows to walk · mouse to look · Shift to run · Esc or O for garden view';
}
function setMode(m) {
  mode = m;
  orbit.enabled = m === 'orbit';
  if (m === 'walk') {
    player.y = (insideHouse(player.x, player.z) ? FY : 0) + EYE;
    camera.position.copy(player);
    euler.setFromQuaternion(camera.quaternion);
    dragLook = false;
    try { walk.lock(); } catch (e) { dragLook = true; }
    setTimeout(() => {
      if (mode === 'walk' && document.pointerLockElement !== renderer.domElement) {
        dragLook = true;
        renderer.domElement.style.cursor = 'grab';
        if (hint) hint.textContent = hintText();
      }
    }, 220);
  } else {
    dragLook = false;
    renderer.domElement.style.cursor = '';
    if (document.pointerLockElement) walk.unlock();
  }
  if (hint) hint.textContent = hintText();
}
document.addEventListener('pointerlockerror', () => {
  if (mode === 'walk') { dragLook = true; renderer.domElement.style.cursor = 'grab'; if (hint) hint.textContent = hintText(); }
});

// drag-to-look (used when pointer lock is denied)
let dragging = false, lastX = 0, lastY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (mode !== 'walk' || !dragLook) return;
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  renderer.domElement.setPointerCapture(e.pointerId);
  renderer.domElement.style.cursor = 'grabbing';
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!dragging || mode !== 'walk' || !dragLook) return;
  euler.setFromQuaternion(camera.quaternion);
  euler.y -= (e.clientX - lastX) * 0.0032;
  euler.x = THREE.MathUtils.clamp(euler.x - (e.clientY - lastY) * 0.0032, -1.35, 1.35);
  euler.z = 0;
  camera.quaternion.setFromEuler(euler);
  lastX = e.clientX; lastY = e.clientY;
});
const endDrag = () => { dragging = false; if (dragLook) renderer.domElement.style.cursor = 'grab'; };
renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);
renderer.domElement.addEventListener('click', () => { if (mode === 'orbit') setMode('walk'); });
walk.addEventListener('unlock', () => { if (mode === 'walk' && !dragLook) setMode('orbit'); });
addEventListener('keydown', (e) => { if (e.code === 'Escape' && mode === 'walk' && dragLook) setMode('orbit'); });

const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyO') setMode(mode === 'walk' ? 'orbit' : 'walk');
  if (mode === 'orbit' && ['KeyW', 'ArrowUp'].includes(e.code)) setMode('walk');
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

const EYE = 1.62, RAD = 0.34;
const player = new THREE.Vector3(0.2, EYE, 17);
function insideHouse(x, z) {
  return Math.abs(x) < HX - WT / 2 && Math.abs(z) < HZ - WT / 2;
}
function blocked(x, z) {
  for (const c of colliders) {
    if (x > c.x0 - RAD && x < c.x1 + RAD && z > c.z0 - RAD && z < c.z1 + RAD) return true;
  }
  return false;
}
function move(dt) {
  const fwd = Number(keys.KeyW || keys.ArrowUp) - Number(keys.KeyS || keys.ArrowDown);
  const side = Number(keys.KeyD || keys.ArrowRight) - Number(keys.KeyA || keys.ArrowLeft);
  if (!fwd && !side) return;
  const speed = (keys.ShiftLeft || keys.ShiftRight ? 4.4 : 2.0) * dt;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize().negate();
  const step = new THREE.Vector3().addScaledVector(dir, fwd).addScaledVector(right, side);
  if (step.lengthSq() === 0) return;
  step.normalize().multiplyScalar(speed);
  if (!blocked(player.x + step.x, player.z)) player.x += step.x;
  if (!blocked(player.x, player.z + step.z)) player.z += step.z;
  player.y = (insideHouse(player.x, player.z) ? FY : 0) + EYE;
  camera.position.copy(player);
}

/* ---------------------------------------------------------------- loop */
function frame(elapsed, dt) {
  // fire flicker
  const f = 0.75 + 0.25 * Math.sin(elapsed * 11.3) * Math.sin(elapsed * 5.1 + 1.7);
  fireLight.intensity = 10 + f * 8;
  flame.scale.set(0.9 + f * 0.2, 0.85 + f * 0.35, 0.9 + f * 0.2);
  M.flame.emissiveIntensity = 3 + f * 2.5;
  // drifting petals
  const pos = airPetals.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const bx = petalBase[i * 3], by = petalBase[i * 3 + 1], bz = petalBase[i * 3 + 2];
    const y = ((by - elapsed * 0.35 + 40) % 9.5) + 0.4;
    pos.setXYZ(i, bx + Math.sin(elapsed * 0.6 + by * 3) * 0.9, y, bz + Math.cos(elapsed * 0.45 + bx) * 0.9);
  }
  pos.needsUpdate = true;

  if (mode === 'walk') move(dt);
  else orbit.update();
  renderer.render(scene, camera);
}

const seekRaw = new URLSearchParams(location.search).get('t');
const seek = seekRaw !== null && /^-?\d+(\.\d+)?$/.test(seekRaw) ? seekRaw : null;
if (seek !== null) {
  const t = parseFloat(seek);
  // scripted camera path for deterministic stills
  const shots = [
    { p: [10, 4.2, 20], look: [0, 2.4, 0] },
    { p: [0.2, 1.62, 8], look: [0, 1.7, 0] },
    { p: [1.6, FY + 1.62, 1.2], look: [-3.0, FY + 1.2, -HZ] },
    { p: [-16, 8, -16], look: [0, 3, 0] },
  ];
  const s = shots[Math.min(shots.length - 1, Math.floor(t))];
  camera.position.set(...s.p);
  camera.lookAt(...s.look);
  orbit.enabled = false;
  frame(t, 1 / 60);
  window.__ready = true;
} else {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 1 / 30);
    frame(reduce ? 0 : clock.getElapsedTime(), dt);
  });
  setMode('orbit');
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
if (hud) hud.style.opacity = 1;
Object.assign(window, { __three: THREE, __scene: scene, __camera: camera, __orbit: orbit, __renderer: renderer });
