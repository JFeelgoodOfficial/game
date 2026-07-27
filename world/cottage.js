// The cottage — the world on the other side of the sun.
//
// Fly into the star and the hull fails exactly as it always did: the heat
// climbs, the canopy cracks, the screen goes white. What changed is what the
// white fades up on. Instead of the death menu you are standing on a landing
// pad at the end of a garden path, in front of a thatched cottage, and nothing
// here wants anything from you. When you have had enough you walk back to the
// ship and take off, and the next thing you see is Terra, dead ahead, the way
// the game opened.
//
// This module is the place itself — geometry, sky, light and a quiet audio bed.
// It does NOT own the walker, the camera or the loop: src/cottageWalk.js is the
// third walk mode (after the planet walker and the station walker) and drives
// this from under phase 'walk'. src/isolate.js switches the flight sim off
// while you are here, which is what pays for the shadow maps and the ambient
// occlusion pass — the whole frame budget goes to one small garden.
//
// FRAME. Everything is built in a flat, y-up local frame centred on the
// cottage, parented to one group that sits at the scene origin. There is no
// planet under this and no curvature to fight: the ground is a plane, up is
// +Y everywhere, and the fog closes long before the plane's edge. The walker
// stays within ~40 u of the origin, well inside C.ORIGIN_SHIFT_THRESHOLD
// (5000), so the floating origin never rebases while you are here and the
// group needs no addShiftable registration.
//
// SCENE STATE. The module writes scene.fog, scene.environment and
// scene.environmentIntensity — three globals the flight sim also uses. They are
// captured on construction and put back in dispose(), the same contract
// world/actuality-sky.js follows. Getting this wrong is how you end up flying
// the solar system through cottage-garden fog.
//
// Textures live in public/textures/ (the three.js examples set) and are
// addressed through import.meta.env.BASE_URL, because vite.config.js builds
// with base './'. The thatch and the lime plaster are generated to canvas at
// build time instead — nothing in the examples set looks like wet straw.

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { settings } from '../src/settings.js';

/* ---------------------------------------------------------------- seeded rng */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cottage footprint: x -4.5..4.5, z -3.5..3.5, wall t=0.36, wall height 2.7.
const WT = 0.36, WH = 2.7, HX = 4.5, HZ = 3.5;
const FY = 0.42;   // interior floor level
const PAD_Z = 34;  // landing pad centre, down the path past the garden gate
const PAD_R = 9;   // pad deck radius
const PAD_Y = 0.3; // pad deck height above the grass

// The sky dome must sit inside isolate.js's ISO_FAR (4000) or it clips. The
// fog (FogExp2 0.0075) is opaque by ~400 u, so nothing between here and there
// is ever seen anyway — this only has to clear the hills at ~150.
const SKY_SCALE = 3000;

/**
 * Build the cottage world.
 *
 * @param scene the root scene — fog and the environment map live there, and are
 *              restored by dispose().
 * @param opts  { renderer } — needed for texture anisotropy. The PMREM bake for
 *              the environment map also needs it, but runs from preRender().
 * @returns {{ group, colliders, spawn, pad, floorYAt, insideHouse,
 *             update, preRender, dispose }}
 */
export function createCottage(scene, opts = {}) {
  const renderer = opts.renderer ?? null;
  // Isolation buys shadow maps and an AO pass, but the budget is not infinite
  // and this world is drawn on top of both. LOW drops the extra shadow caster
  // and thins the grass; the layout is identical either way.
  const low = opts.quality === 'low';
  const rng = mulberry32(20260727);
  const rand = (a = 0, b = 1) => a + rng() * (b - a);

  const group = new THREE.Group();
  const disposables = [];       // geometries + materials + textures
  const tmpColor = new THREE.Color();
  const dummy = new THREE.Object3D();

  const track = (x) => { disposables.push(x); return x; };

  /* ---------------------------------------------------------------- sky + env */
  const prevFog = scene.fog;
  const prevEnv = scene.environment;
  const prevEnvIntensity = scene.environmentIntensity ?? 1;

  scene.fog = new THREE.FogExp2(0xc9d8c4, 0.0075);

  const sky = new Sky();
  sky.scale.setScalar(SKY_SCALE);
  const su = sky.material.uniforms;
  su.turbidity.value = 4;
  su.rayleigh.value = 1.6;
  su.mieCoefficient.value = 0.006;
  su.mieDirectionalG.value = 0.82;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(
    1, THREE.MathUtils.degToRad(66), THREE.MathUtils.degToRad(58));
  su.sunPosition.value.copy(sunDir);
  group.add(sky);

  // The environment map is what makes the PBR surfaces read as real rather than
  // flat-lit, but the bake needs a renderer and construction may not have one.
  // preRender() is the hook that does — it bakes once, on the first frame.
  let pmrem = null;
  let envRT = null;
  let envBaked = false;

  const sun = new THREE.DirectionalLight(0xfff2d8, 3.2);
  sun.position.copy(sunDir).multiplyScalar(60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(low ? 768 : 1024, low ? 768 : 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  const S = 26;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S });
  sun.shadow.bias = -0.0007;
  sun.shadow.normalBias = 0.03;
  group.add(sun);
  group.add(new THREE.HemisphereLight(0xbcd7ff, 0x4b6b3a, 0.55));

  /* ---------------------------------------------------------------- textures */
  const tl = new THREE.TextureLoader();
  const maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
  // A texture that 404s leaves three.js sampling an EMPTY image, which reads as
  // solid black — not as "no texture". One missing file therefore paints a whole
  // surface black with no error anywhere. `fallback` is the colour to stand in
  // with, painted to a 1x1 canvas, so a missing file degrades to a flat tint.
  function tex(url, repeat = 1, srgb = true, fallback = 0x808080) {
    const t = tl.load(url, undefined, undefined, () => {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const g = c.getContext('2d');
      g.fillStyle = `#${fallback.toString(16).padStart(6, '0')}`;
      g.fillRect(0, 0, 1, 1);
      t.image = c;
      t.needsUpdate = true;
      console.warn(`cottage: missing texture ${url} — using a flat fallback`);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = maxAniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return track(t);
  }
  const T = `${import.meta.env.BASE_URL}textures/`;
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
    t.anisotropy = maxAniso;
    return track(t);
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
    return track(t);
  }
  // Procedural meadow, for the same reason the thatch and the plaster are
  // procedural: nothing in the three.js examples set is a lawn seen from
  // standing height. It is also the one surface a photo would betray — the
  // ground plane is 400 u across and any tiling photograph repeats visibly.
  // Mottled tonal patches first, then fine per-blade speckle over the top.
  function grassTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#5f7d3c'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 260; i++) {
      const x = rand(0, 512), y = rand(0, 512), r = rand(18, 90);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      const h = rand(0.19, 0.29), l = rand(0.2, 0.38);
      grd.addColorStop(0, `hsla(${h * 360},${rand(28, 46)}%,${l * 100}%,0.5)`);
      grd.addColorStop(1, 'hsla(0,0%,0%,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    }
    for (let i = 0; i < 30000; i++) {
      const v = rand(0.7, 1.35);
      g.strokeStyle = `rgba(${(96 * v) | 0},${(128 * v) | 0},${(58 * v) | 0},${rand(0.15, 0.6)})`;
      g.lineWidth = rand(0.6, 1.8);
      const x = rand(0, 512), y = rand(0, 512);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-2, 2), y - rand(3, 9)); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(90, 90); // ~4.4 u per tile across the 400 u ground
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return track(t);
  }
  const grassMap = grassTexture();
  const thatchMap = thatchTexture();
  const plasterMap = plasterTexture();
  const plasterMapIn = plasterTexture([246, 240, 226]);

  /* ---------------------------------------------------------------- materials */
  const M = {
    grass: new THREE.MeshStandardMaterial({ map: grassMap, color: 0xb8c9a0, roughness: 1 }),
    thatch: new THREE.MeshStandardMaterial({ map: thatchMap, bumpMap: thatchMap, bumpScale: 3, roughness: 1, color: 0xcfae7c }),
    plaster: new THREE.MeshStandardMaterial({ map: plasterMap, bumpMap: plasterMap, bumpScale: 0.6, roughness: 0.92 }),
    plasterIn: new THREE.MeshStandardMaterial({ map: plasterMapIn, bumpMap: plasterMapIn, bumpScale: 0.4, roughness: 0.95 }),
    brick: new THREE.MeshStandardMaterial({ map: brickMap, bumpMap: brickBump, bumpScale: 0.6, roughnessMap: brickRough, roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ map: woodMap, bumpMap: woodBump, bumpScale: 0.25, roughnessMap: woodRough, roughness: 0.8 }),
    beam: new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.85 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.55 }),
    door: new THREE.MeshStandardMaterial({ color: 0x8fa383, roughness: 0.5 }),
    // Deliberately NOT a transmission material. `transmission > 0` makes
    // three.js render the whole scene into a separate target every frame so the
    // glass has something to refract — a second full pass, on top of the AO and
    // the shadow maps isolation just switched on, to serve five cottage window
    // panes seen edge-on. A rough, reflective, half-opaque physical material
    // reads the same at this size for none of that.
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xdfeef2, roughness: 0.06, metalness: 0, ior: 1.5,
      clearcoat: 1, clearcoatRoughness: 0.05,
      transparent: true, opacity: 0.42, side: THREE.DoubleSide,
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
  for (const k in M) track(M[k]);

  /* ---------------------------------------------------------------- helpers */
  const colliders = [];  // {x0,x1,z0,z1} — AABBs in the flat local frame
  function collide(x, z, w, d) {
    colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
  }
  function box(w, h, d, mat, x, y, z, o = {}) {
    const m = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), mat);
    m.position.set(x, y, z);
    m.castShadow = o.cast !== false;
    m.receiveShadow = o.receive !== false;
    (o.parent ?? group).add(m);
    if (o.solid) collide(x, z, w, d);
    return m;
  }
  function cyl(r1, r2, h, mat, x, y, z, seg = 18, parent = group) {
    const m = new THREE.Mesh(track(new THREE.CylinderGeometry(r1, r2, h, seg)), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  }

  /* ---------------------------------------------------------------- terrain */
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(400, 400, 1, 1)), M.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // rolling hills in the distance
  const hillMat = track(new THREE.MeshStandardMaterial({ color: 0x7f9d5b, roughness: 1 }));
  for (let i = 0; i < 14; i++) {
    const r = rand(28, 60);
    const h = new THREE.Mesh(track(new THREE.SphereGeometry(r, 24, 14)), hillMat);
    const a = rand(0, Math.PI * 2), dist = r + rand(85, 150);
    h.position.set(Math.cos(a) * dist, rand(-r * 0.82, -r * 0.66), Math.sin(a) * dist);
    // Fog-bound scenery, 85-150 u out and well outside the shadow camera's
    // 26-unit box. Shadows would cost the pass and change nothing.
    group.add(h);
  }

  /* ---------------------------------------------------------------- cottage shell */
  function wallRun(axis, fixed, from, to, y0, y1, mat = M.plaster, solid = true) {
    const len = to - from, h = y1 - y0, mid = (from + to) / 2;
    const w = axis === 'x' ? len : WT, d = axis === 'x' ? WT : len;
    const x = axis === 'x' ? mid : fixed, z = axis === 'x' ? fixed : mid;
    const m = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), mat);
    m.position.set(x, y0 + h / 2, z);
    m.castShadow = true; m.receiveShadow = true; group.add(m);
    if (solid && y0 < 1.9) collide(x, z, w + 0.02, d + 0.02);
    return m;
  }
  // interior plaster skin (slightly inset) for warmer inside walls
  function innerSkin(axis, fixed, from, to, y0, y1, sign) {
    const len = to - from, h = y1 - y0, mid = (from + to) / 2;
    const m = new THREE.Mesh(track(new THREE.PlaneGeometry(len, h)), M.plasterIn);
    if (axis === 'x') { m.position.set(mid, y0 + h / 2, fixed + sign * (WT / 2 + 0.005)); m.rotation.y = sign > 0 ? 0 : Math.PI; }
    else { m.position.set(fixed + sign * (WT / 2 + 0.005), y0 + h / 2, mid); m.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2; }
    m.receiveShadow = true; group.add(m);
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
  const plinth = new THREE.Mesh(
    track(new THREE.BoxGeometry(HX * 2 + 0.5, 0.45, HZ * 2 + 0.5)), M.stone);
  plinth.position.set(0, 0.2, 0);
  plinth.receiveShadow = true; plinth.castShadow = true;
  group.add(plinth);

  /* floors + ceiling */
  const floor = new THREE.Mesh(
    track(new THREE.PlaneGeometry(HX * 2 - WT, HZ * 2 - WT)), M.wood);
  floor.rotation.x = -Math.PI / 2; floor.position.y = FY; floor.receiveShadow = true;
  group.add(floor);
  const ceil = new THREE.Mesh(track(new THREE.PlaneGeometry(HX * 2, HZ * 2)),
    track(new THREE.MeshStandardMaterial({ color: 0xefe8d8, roughness: 0.95 })));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = WH - 0.02; ceil.receiveShadow = true;
  group.add(ceil);
  for (let i = -3; i <= 3; i++) box(HX * 2, 0.2, 0.22, M.beam, 0, WH - 0.14, i * 1.0);
  box(0.24, 0.24, HZ * 2, M.beam, 0, WH - 0.14, 0);

  /* windows: frame + mullions + glass */
  function window4(x, y, z, w, h, rotY) {
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = rotY;
    const add = (gw, gh, gd, gx, gy, gz, mat) => {
      const m = new THREE.Mesh(track(new THREE.BoxGeometry(gw, gh, gd)), mat);
      m.position.set(gx, gy, gz); m.castShadow = true; m.receiveShadow = true; g.add(m);
    };
    add(w + 0.16, 0.1, 0.3, 0, h / 2 + 0.05, 0, M.trim);
    add(w + 0.16, 0.12, 0.34, 0, -h / 2 - 0.06, 0, M.trim);      // sill
    add(0.1, h, 0.3, -w / 2 - 0.05, 0, 0, M.trim);
    add(0.1, h, 0.3, w / 2 + 0.05, 0, 0, M.trim);
    add(0.06, h, 0.16, 0, 0, 0, M.trim);
    for (let i = 1; i <= 2; i++) add(w, 0.05, 0.14, 0, -h / 2 + (h * i) / 3, 0, M.trim);
    g.add(new THREE.Mesh(track(new THREE.PlaneGeometry(w, h)), M.glass));
    group.add(g);
    return g;
  }
  window4(-2.65, 1.5, HZ + 0.03, 1.5, 1.1, 0);
  window4(2.65, 1.5, HZ + 0.03, 1.5, 1.1, 0);
  window4(-0.3, 1.55, -HZ - 0.03, 1.8, 1.1, Math.PI);
  window4(-0.2, 1.55, 0, 1.6, 1.1, Math.PI / 2).position.set(-HX - 0.03, 1.55, -0.2);
  window4(0.7, 1.55, 0, 2.2, 1.1, -Math.PI / 2).position.set(HX + 0.03, 1.55, 0.7);

  /* door + porch */
  const doorGroup = new THREE.Group();
  doorGroup.position.set(-0.75, FY, HZ);
  box(1.5, 2.05, 0.1, M.door, 0, 1.03, 0.06, { parent: doorGroup });
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.34, 0.04)), M.glass);
    p.position.set(-0.42 + i * 0.42, 1.7, 0.12); doorGroup.add(p);
  }
  const knob = new THREE.Mesh(track(new THREE.SphereGeometry(0.055, 16, 12)), M.brass);
  knob.position.set(0.55, 1.0, 0.14); doorGroup.add(knob);
  doorGroup.rotation.y = -0.62;   // ajar, walk straight in
  group.add(doorGroup);
  // porch canopy
  box(2.4, 0.14, 1.2, M.beam, 0, 2.9, HZ + 0.55);
  const canopy = new THREE.Mesh(track(new THREE.BoxGeometry(2.6, 0.5, 1.5)), M.thatch);
  canopy.position.set(0, 3.1, HZ + 0.6); canopy.rotation.x = -0.16;
  canopy.castShadow = true; group.add(canopy);
  cyl(0.07, 0.07, 2.5, M.beam, -1.1, 1.7, HZ + 1.05);
  cyl(0.07, 0.07, 2.5, M.beam, 1.1, 1.7, HZ + 1.05);
  // steps
  box(2.6, 0.16, 0.6, M.stone, 0, 0.36, HZ + 0.5);
  box(3.0, 0.16, 0.5, M.stone, 0, 0.2, HZ + 1.0);
  // Lanterns beside the door. Emissive glass only — under a daylit sky a
  // 7-unit point light contributes almost nothing visible, and every extra
  // dynamic light is paid for by every lit fragment in the garden. The bloom
  // pass is what actually sells them.
  [-1.35, 1.35].forEach((lx) => {
    box(0.14, 0.24, 0.14, M.metal, lx, 2.1, HZ + 0.14);
    const bulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.06, 12, 10)), M.bulb);
    bulb.position.set(lx, 2.1, HZ + 0.14); group.add(bulb);
  });

  /* ---------------------------------------------------------------- thatched roof */
  (function thatchRoof() {
    const halfW = HZ + 0.6, ridge = 3.3, len = HX * 2 + 1.3;
    const shape = new THREE.Shape();
    shape.moveTo(-halfW, 0);
    shape.lineTo(-halfW * 0.94, 0.42);
    shape.quadraticCurveTo(-halfW * 0.42, ridge * 0.82, 0, ridge);
    shape.quadraticCurveTo(halfW * 0.42, ridge * 0.82, halfW * 0.94, 0.42);
    shape.lineTo(halfW, 0);
    const geo = track(new THREE.ExtrudeGeometry(shape, {
      depth: len, bevelEnabled: true, bevelSize: 0.16,
      bevelThickness: 0.16, bevelSegments: 3, curveSegments: 28,
    }));
    geo.rotateY(Math.PI / 2);
    geo.translate(-len / 2 + 0.16, WH - 0.18, 0);
    const roof = new THREE.Mesh(geo, M.thatch);
    roof.castShadow = true; roof.receiveShadow = true;
    group.add(roof);
    // rolled ridge + eave fringe
    const ridgeRoll = cyl(0.3, 0.3, len, M.thatch, 0, WH + ridge - 0.28, 0, 16);
    ridgeRoll.rotation.z = Math.PI / 2;
    [-1, 1].forEach((s) => {
      const e = cyl(0.3, 0.3, len - 0.2, M.thatch, 0, WH - 0.1, s * halfW * 0.93, 14);
      e.rotation.z = Math.PI / 2;
    });
  })();

  // dormer windows (eyebrow style) on the front slope
  function dormer(x) {
    const g = new THREE.Group();
    g.position.set(x, WH + 0.95, HZ - 0.75);
    const body = new THREE.Mesh(track(new THREE.BoxGeometry(1.5, 1.05, 1.5)), M.plaster);
    body.castShadow = true; body.receiveShadow = true; g.add(body);
    const hood = new THREE.Mesh(
      track(new THREE.SphereGeometry(1.02, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)), M.thatch);
    hood.scale.set(1, 0.72, 1.15); hood.position.y = 0.5; hood.castShadow = true; g.add(hood);
    const w = new THREE.Mesh(track(new THREE.PlaneGeometry(0.95, 0.75)), M.glass);
    w.position.set(0, 0.05, 0.78); g.add(w);
    const fr = new THREE.Mesh(track(new THREE.BoxGeometry(1.05, 0.08, 0.14)), M.trim);
    fr.position.set(0, -0.35, 0.78); g.add(fr);
    const mull = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.75, 0.1)), M.trim);
    mull.position.set(0, 0.05, 0.8); g.add(mull);
    group.add(g);
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
  // fireplace on the back wall
  box(2.6, 2.3, 0.55, M.brick, -3.0, FY + 1.15, -HZ + 0.55, { solid: true });
  box(1.5, 1.15, 0.4,
    track(new THREE.MeshStandardMaterial({ color: 0x1b1613, roughness: 1 })),
    -3.0, FY + 0.6, -HZ + 0.72);
  box(2.9, 0.18, 0.75, M.beam, -3.0, FY + 1.75, -HZ + 0.62);   // mantel
  const logs = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const l = cyl(0.08, 0.08, 0.8, M.bark, 0, 0, 0, 8, logs);
    l.rotation.z = Math.PI / 2; l.rotation.y = rand(-0.5, 0.5);
    l.position.set(rand(-0.2, 0.2), 0.1 + i * 0.09, rand(-0.1, 0.1));
  }
  logs.position.set(-3.0, FY + 0.1, -HZ + 0.75); group.add(logs);
  const flame = new THREE.Mesh(track(new THREE.ConeGeometry(0.28, 0.55, 12)), M.flame);
  flame.position.set(-3.0, FY + 0.45, -HZ + 0.75); group.add(flame);
  // The one shadow caster indoors. A shadow-casting PointLight is a CUBE map —
  // six depth passes over the scene every frame — so the room gets exactly one,
  // and only when the quality setting can afford it.
  const fireLight = new THREE.PointLight(0xff7b2d, 14, 9, 2);
  fireLight.position.set(-3.0, FY + 0.6, -HZ + 0.9);
  if (!low) {
    fireLight.castShadow = true;
    fireLight.shadow.mapSize.set(512, 512);
  }
  group.add(fireLight);
  // mantel clutter
  box(0.14, 0.3, 0.14, M.linen, -3.7, FY + 2.0, -HZ + 0.62);
  box(0.14, 0.24, 0.14, M.linen, -2.4, FY + 1.97, -HZ + 0.62);

  // rug
  const rug = new THREE.Mesh(track(new THREE.CircleGeometry(1.7, 40)),
    track(new THREE.MeshStandardMaterial({ color: 0x8a4a41, roughness: 1 })));
  rug.rotation.x = -Math.PI / 2; rug.position.set(-2.1, FY + 0.012, -0.6);
  rug.receiveShadow = true; group.add(rug);

  // sofa facing the fire
  function sofa(x, z, ry) {
    const g = new THREE.Group(); g.position.set(x, FY, z); g.rotation.y = ry;
    const p = (w, h, d, px, py, pz, mat) => {
      const m = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), mat);
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
      const l = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 10)), M.beam);
      l.position.set(lx, 0.1, lz); l.castShadow = true; g.add(l);
    });
    group.add(g);
    collide(x, z, 2.1, 1.0);
  }
  sofa(-2.1, 0.6, Math.PI);

  // armchair
  function armchair(x, z, ry) {
    const g = new THREE.Group(); g.position.set(x, FY, z); g.rotation.y = ry;
    const p = (w, h, d, px, py, pz, mat) => {
      const m = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), mat);
      m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; g.add(m);
    };
    p(0.9, 0.32, 0.85, 0, 0.3, 0, M.fabricLight);
    p(0.9, 0.68, 0.2, 0, 0.68, -0.32, M.fabricLight);
    p(0.18, 0.45, 0.85, -0.36, 0.56, 0, M.fabricLight);
    p(0.18, 0.45, 0.85, 0.36, 0.56, 0, M.fabricLight);
    p(0.6, 0.14, 0.7, 0, 0.51, 0.02, M.fabric);
    group.add(g); collide(x, z, 1.0, 0.95);
  }
  armchair(-0.4, -1.5, -2.3);

  // coffee table
  box(1.1, 0.08, 0.6, M.wood, -2.1, FY + 0.42, -0.55, { solid: true });
  [[-0.48, -0.22], [0.48, -0.22], [-0.48, 0.22], [0.48, 0.22]].forEach(([dx, dz]) =>
    cyl(0.045, 0.045, 0.4, M.beam, -2.1 + dx, FY + 0.2, -0.55 + dz, 10));
  box(0.22, 0.06, 0.3,
    track(new THREE.MeshStandardMaterial({ color: 0x6b3d2e, roughness: 0.6 })),
    -2.2, FY + 0.49, -0.55);

  // dining table + chairs (kitchen side)
  box(1.8, 0.09, 1.0, M.wood, 2.4, FY + 0.76, -1.4, { solid: true });
  [[-0.78, -0.4], [0.78, -0.4], [-0.78, 0.4], [0.78, 0.4]].forEach(([dx, dz]) =>
    box(0.1, 0.72, 0.1, M.beam, 2.4 + dx, FY + 0.36, -1.4 + dz));
  function chair(x, z, ry) {
    const g = new THREE.Group(); g.position.set(x, FY, z); g.rotation.y = ry;
    const p = (w, h, d, px, py, pz) => {
      const m = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), M.beam);
      m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; g.add(m);
    };
    p(0.44, 0.06, 0.44, 0, 0.45, 0);
    p(0.44, 0.55, 0.06, 0, 0.72, -0.19);
    [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]
      .forEach(([lx, lz]) => p(0.05, 0.45, 0.05, lx, 0.22, lz));
    group.add(g); collide(x, z, 0.5, 0.5);
  }
  chair(1.35, -1.4, Math.PI / 2); chair(3.45, -1.4, -Math.PI / 2); chair(2.4, -0.45, 0);

  // kitchen run along the right wall
  box(1.0, 0.9, 2.4,
    track(new THREE.MeshStandardMaterial({ color: 0xdcd3bf, roughness: 0.8 })),
    HX - 0.68, FY + 0.45, 1.2, { solid: true });
  box(1.1, 0.08, 2.5, M.stone, HX - 0.68, FY + 0.93, 1.2);
  box(0.5, 0.06, 0.7, M.metal, HX - 0.68, FY + 0.92, 1.6);
  cyl(0.02, 0.02, 0.3, M.brass, HX - 0.68, FY + 1.1, 1.25, 10);
  for (let i = 0; i < 3; i++) box(0.06, 0.5, 0.06, M.beam, HX - 0.3, FY + 1.7, 0.3 + i * 0.35);
  box(1.0, 0.06, 2.0, M.wood, HX - 0.4, FY + 1.85, 1.3);   // open shelf
  for (let i = 0; i < 5; i++) {
    const jarMat = track(new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(rand(0.05, 0.13), 0.35, 0.7), roughness: 0.5,
    }));
    cyl(0.07, 0.07, rand(0.14, 0.22), jarMat, HX - 0.45, FY + 1.98, 0.5 + i * 0.4, 12);
  }

  // bookshelf + books
  box(1.6, 1.9, 0.34, M.beam, 1.6, FY + 0.95, -HZ + 0.35, { solid: true });
  for (let s = 0; s < 4; s++) {
    let bx = 0.95;
    while (bx < 2.3) {
      const w = rand(0.05, 0.1), h = rand(0.22, 0.3);
      box(w, h, 0.24, track(new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(rand(0, 1), 0.35, 0.38), roughness: 0.7,
      })), bx, FY + 0.3 + s * 0.45 + h / 2, -HZ + 0.35);
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
  const bedLamp = new THREE.Mesh(
    track(new THREE.ConeGeometry(0.16, 0.2, 14, 1, true)), M.linen);
  bedLamp.position.set(-2.4, FY + 0.62, 0.7); group.add(bedLamp);
  const bedLight = new THREE.PointLight(0xffcf94, 5, 5, 2);
  bedLight.position.set(-2.4, FY + 0.55, 0.7); group.add(bedLight);

  // hanging pendant over the table
  cyl(0.012, 0.012, 0.8, M.metal, 2.4, WH - 0.55, -1.4, 8);
  const shade = new THREE.Mesh(track(new THREE.ConeGeometry(0.3, 0.28, 20, 1, true)),
    track(new THREE.MeshStandardMaterial({
      color: 0x2f3b33, roughness: 0.5, side: THREE.DoubleSide,
    })));
  shade.position.set(2.4, WH - 1.0, -1.4); group.add(shade);
  const pendantBulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.06, 14, 10)), M.bulb);
  pendantBulb.position.set(2.4, WH - 1.12, -1.4); group.add(pendantBulb);
  const pendantLight = new THREE.PointLight(0xffd9a0, 9, 8, 2);
  pendantLight.position.set(2.4, WH - 1.15, -1.4);
  group.add(pendantLight); // no shadow: the fire is the room's caster

  // potted plants inside
  function pot(x, z, s = 1) {
    cyl(0.16 * s, 0.12 * s, 0.24 * s,
      track(new THREE.MeshStandardMaterial({ color: 0xa9694b, roughness: 0.9 })),
      x, FY + 0.12 * s, z, 14);
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(track(new THREE.SphereGeometry(0.12 * s, 10, 8)), M.leaf);
      leaf.position.set(x + rand(-0.15, 0.15) * s, FY + (0.3 + rand(0, 0.22)) * s, z + rand(-0.15, 0.15) * s);
      leaf.scale.set(1, 0.7, 1); leaf.castShadow = true; group.add(leaf);
    }
  }
  pot(-0.2, 2.6, 1.1); pot(4.0, -2.9, 0.9);

  /* ---------------------------------------------------------------- garden */
  // The stone path runs from the door, through the gate in the garden wall
  // (z = 18), and on out to the landing pad — so the way back to the ship is
  // never a question you have to ask.
  const pathMat = track(new THREE.MeshStandardMaterial({
    map: brickMap, bumpMap: brickBump, bumpScale: 0.4, color: 0xa9a29a, roughness: 1,
  }));
  const PATH_N = 46;
  const path = new THREE.InstancedMesh(
    track(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 9)), pathMat, PATH_N);
  path.receiveShadow = true;
  const pathX = (t) => Math.sin(t * 3.4) * 2.2 * (1 - Math.min(t, 1) * 0.55);
  for (let i = 0; i < PATH_N; i++) {
    const t = i / (PATH_N - 1);
    // t 0..1 walks door -> pad; the lateral wiggle straightens as it approaches
    // the gate so the slabs actually pass between the posts at x = +-2.2.
    dummy.position.set(pathX(t * 1.35), 0.03, HZ + 1.6 + t * (PAD_Z - PAD_R - HZ - 1.6));
    dummy.rotation.y = rand(0, Math.PI);
    dummy.scale.set(rand(0.8, 1.15), 1, rand(0.8, 1.15));
    dummy.updateMatrix(); path.setMatrixAt(i, dummy.matrix);
  }
  group.add(path);

  // grass tufts
  const tuft = track(new THREE.ConeGeometry(0.035, 0.24, 4));
  tuft.translate(0, 0.12, 0);
  const TUFTS = low ? 4000 : 11000;
  const tufts = new THREE.InstancedMesh(tuft,
    track(new THREE.MeshStandardMaterial({
      color: 0x6b924a, roughness: 1, flatShading: true,
    })), TUFTS);
  // Neither cast nor receive: the ground plane underneath already takes the
  // tree and cottage shadows, and blades this small only ever sample one texel
  // of the map anyway. This is the single biggest saving in the world — it
  // keeps 16 k instances out of the depth pass entirely.
  tufts.castShadow = tufts.receiveShadow = false;
  for (let i = 0; i < TUFTS; i++) {
    const a = rand(0, Math.PI * 2), r = rand(5, 46);
    let x = Math.cos(a) * r, z = Math.sin(a) * r;
    const inHouse = Math.abs(x) < HX + 1.2 && Math.abs(z) < HZ + 1.2;
    if (inHouse) { x *= 3; z *= 3; }
    // and none on the landing pad deck
    if (x * x + (z - PAD_Z) * (z - PAD_Z) < (PAD_R + 1) * (PAD_R + 1)) { x *= 4; z *= 4; }
    dummy.position.set(x, 0, z);
    dummy.rotation.set(rand(-0.16, 0.16), rand(0, 6.28), rand(-0.16, 0.16));
    dummy.scale.set(rand(0.7, 1.4), rand(0.5, 1.3), rand(0.7, 1.4));
    tufts.setColorAt(i, tmpColor.setHSL(rand(0.2, 0.3), rand(0.3, 0.55), rand(0.28, 0.46)));
    dummy.updateMatrix(); tufts.setMatrixAt(i, dummy.matrix);
  }
  group.add(tufts);
  tufts.instanceColor.needsUpdate = true;

  // flowering shrubs — foliage clumps + blossom dots
  const foliageGeo = track(new THREE.IcosahedronGeometry(1, 1));
  const clumps = new THREE.InstancedMesh(foliageGeo, M.leaf, 900);
  const clumpsDark = new THREE.InstancedMesh(foliageGeo, M.leafDark, 700);
  clumps.castShadow = clumps.receiveShadow = true;
  clumpsDark.castShadow = clumpsDark.receiveShadow = true;
  const petalGeo = track(new THREE.SphereGeometry(0.07, 6, 5));
  const petalMat = track(new THREE.MeshStandardMaterial({ color: 0xf6c3d2, roughness: 0.85 }));
  const petalMat2 = track(new THREE.MeshStandardMaterial({ color: 0xfaf3ea, roughness: 0.85 }));
  const petals = new THREE.InstancedMesh(petalGeo, petalMat, 2600);
  const petals2 = new THREE.InstancedMesh(petalGeo, petalMat2, 1800);
  // 4400 blossom dots at 7 cm across. They are shadow-pass geometry that casts
  // nothing anyone can see, so they stay out of it — the clumps they sit on
  // already carry the shape.
  petals.castShadow = petals.receiveShadow = false;
  petals2.castShadow = petals2.receiveShadow = false;
  let ci = 0, cdi = 0, pi = 0, p2i = 0;

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
      if (rng() > 0.45) {
        if (ci < clumps.count) { clumps.setColorAt(ci, leafTint(rand(0.24, 0.4))); clumps.setMatrixAt(ci++, dummy.matrix); }
      } else if (cdi < clumpsDark.count) {
        clumpsDark.setColorAt(cdi, leafTint(rand(0.18, 0.28))); clumpsDark.setMatrixAt(cdi++, dummy.matrix);
      }
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
    const px = pathX(t * 1.35), pz = HZ + 1.8 + t * 14.5;
    shrub(px + (i % 2 ? 1 : -1) * rand(1.4, 2.4), pz, rand(0.35, 0.6), rand(0.5, 1.0));
  }
  for (let i = 0; i < 22; i++) {
    const a = rand(0, 6.28), r = rand(16, 38);
    const sx = Math.cos(a) * r, sz = Math.sin(a) * r;
    // keep the pad approach clear
    if (sx * sx + (sz - PAD_Z) * (sz - PAD_Z) < (PAD_R + 4) * (PAD_R + 4)) continue;
    shrub(sx, sz, rand(0.6, 1.3), rand(0.8, 1.7), rng() > 0.4);
  }
  [clumps, clumpsDark, petals, petals2].forEach((m) => {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    group.add(m);
  });

  // climbing roses on the cottage walls
  const ivy = new THREE.InstancedMesh(
    track(new THREE.SphereGeometry(0.16, 8, 6)), M.leafDark, 1500);
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
  ivy.castShadow = true; // the roses read as depth against the plaster
  ivyFlower.castShadow = false; // their blooms do not
  [ivy, ivyFlower].forEach((m) => {
    m.instanceMatrix.needsUpdate = true; group.add(m);
  });

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
      c.castShadow = true; c.receiveShadow = true; group.add(c);
    }
    collide(x, z, 0.9 * scale, 0.9 * scale);
  }
  tree(-15, -10, 1.35); tree(18, -9, 1.15); tree(16, 14, 1.25);
  tree(-17, 12, 1.0); tree(-24, -20, 1.5); tree(26, 3, 1.3);

  // dry-stone garden wall + gate posts, with the gate on the path to the pad
  const wallStone = new THREE.InstancedMesh(
    track(new THREE.BoxGeometry(0.5, 0.28, 0.42)), M.stone, 620);
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
  group.add(wallStone);
  // The wall is waist-high scenery, but it still has to stop you — two spans,
  // each one AABB, with the gate gap between them left open.
  collide(-9.25, 18, 13.5, 0.5);
  collide(9.25, 18, 13.5, 0.5);
  [[-2.2, 18], [2.2, 18]].forEach(([gx, gz]) => box(0.5, 1.7, 0.5, M.stone, gx, 0.85, gz, { solid: true }));

  /* ---------------------------------------------------------------- landing pad */
  // A low stone deck at the end of the path. The ship is set down here on
  // arrival and this is where you board to leave — cottageWalk.js reads `pad`.
  const padDeck = new THREE.Mesh(
    track(new THREE.CylinderGeometry(PAD_R, PAD_R + 0.35, PAD_Y, 40)), M.stone);
  padDeck.position.set(0, PAD_Y / 2, PAD_Z);
  padDeck.castShadow = true; padDeck.receiveShadow = true;
  group.add(padDeck);
  // a timber rim, and lamps around the edge so it reads as a place to land
  const rim = new THREE.Mesh(
    track(new THREE.TorusGeometry(PAD_R - 0.2, 0.12, 8, 48)), M.beam);
  rim.position.set(0, PAD_Y, PAD_Z); rim.rotation.x = -Math.PI / 2;
  rim.castShadow = true; rim.receiveShadow = true;
  group.add(rim);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.39;
    const lx = Math.cos(a) * (PAD_R - 0.9), lz = PAD_Z + Math.sin(a) * (PAD_R - 0.9);
    cyl(0.06, 0.08, 0.7, M.metal, lx, PAD_Y + 0.35, lz, 8);
    const glob = new THREE.Mesh(track(new THREE.SphereGeometry(0.13, 12, 10)), M.bulb);
    glob.position.set(lx, PAD_Y + 0.78, lz); group.add(glob);
  }
  // Emissive globes, no point lights: eight of them outdoors at midmorning
  // would cost the whole garden a per-fragment light loop each and change
  // almost nothing on screen. Bloom picks them up.

  /* ---------------------------------------------------------------- air petals */
  const petalPosCount = 600;
  const airGeo = track(new THREE.BufferGeometry());
  {
    const p = new Float32Array(petalPosCount * 3);
    for (let i = 0; i < petalPosCount; i++) {
      p[i * 3] = rand(-30, 30); p[i * 3 + 1] = rand(0.5, 9); p[i * 3 + 2] = rand(-30, 30);
    }
    airGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  }
  const airPetals = new THREE.Points(airGeo, track(new THREE.PointsMaterial({
    map: blossomMap, size: 0.22, transparent: true, depthWrite: false,
    opacity: 0.9, color: 0xffe3ec,
  })));
  group.add(airPetals);
  const petalBase = airGeo.attributes.position.array.slice();

  /* ---------------------------------------------------------------- floor query */
  function insideHouse(x, z) {
    return Math.abs(x) < HX - WT / 2 && Math.abs(z) < HZ - WT / 2;
  }
  // Height of the walkable surface under (x, z). Three decks: the cottage
  // floorboards, the landing pad, and the grass.
  function floorYAt(x, z) {
    if (insideHouse(x, z)) return FY;
    const dz = z - PAD_Z;
    if (x * x + dz * dz < PAD_R * PAD_R) return PAD_Y;
    return 0;
  }

  /* ---------------------------------------------------------------- ambience */
  // A quiet bed, built the way the story worlds build theirs (world/actuality.js,
  // world/shadowreach.js) — but routed through settings.musicVolume, which those
  // three predate. Filtered noise for wind through the garden, plus two detuned
  // sines an octave apart, barely there. Nothing rhythmic: the point of the
  // place is that nothing is happening.
  let audio = null;
  let alive = true;
  function initAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);

      // wind: looped pink-ish noise through a gentle low-pass
      const len = ctx.sampleRate * 4;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.0990460;
        b1 = 0.96300 * b1 + w * 0.2965164;
        b2 = 0.57000 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.06;
      }
      // taper the seam so the loop doesn't tick
      for (let i = 0; i < 2000; i++) {
        const k = i / 2000;
        d[i] *= k;
        d[len - 1 - i] *= k;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf; noise.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 620; lp.Q.value = 0.4;
      const windGain = ctx.createGain(); windGain.gain.value = 0.75;
      noise.connect(lp); lp.connect(windGain); windGain.connect(master);
      noise.start();

      // two soft sines, a fifth apart, slowly beating against each other
      const oscs = [];
      [110, 164.81].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = i === 0 ? 0.035 : 0.022;
        o.connect(g); g.connect(master);
        o.start();
        oscs.push({ o, g, base: f });
      });

      audio = { ctx, master, noise, windGain, lp, oscs, t: 0, fade: 0 };
      ctx.resume?.();
    } catch {
      audio = null; // no audio context (autoplay policy, headless) — silent world
    }
  }

  function targetVolume() {
    return settings.muted ? 0 : settings.musicVolume * 0.55;
  }

  function updateAudio(dt) {
    if (!audio) return;
    audio.t += dt;
    // fade in over ~2.5 s so the bed arrives with the light rather than under it
    audio.fade = Math.min(audio.fade + dt / 2.5, 1);
    audio.master.gain.value = targetVolume() * audio.fade;
    // the wind breathes
    audio.lp.frequency.value = 620 + Math.sin(audio.t * 0.13) * 180;
    audio.windGain.gain.value = 0.6 + Math.sin(audio.t * 0.19 + 1.4) * 0.22;
    // and the drone drifts a few cents, so it never sits still
    for (let i = 0; i < audio.oscs.length; i++) {
      const s = audio.oscs[i];
      s.o.frequency.value = s.base * (1 + Math.sin(audio.t * (0.07 + i * 0.03)) * 0.0015);
    }
  }

  function disposeAudio() {
    if (!audio) return;
    try {
      audio.noise.stop();
      for (const s of audio.oscs) s.o.stop();
      audio.master.disconnect();
      audio.ctx.close();
    } catch {
      // already torn down
    }
    audio = null;
  }

  initAudio();

  /* ---------------------------------------------------------------- lifecycle */
  // Per-frame, at render rate. `elapsed` is wall-clock seconds.
  function update(dt, elapsed) {
    if (!alive) return;
    // fire flicker
    const f = 0.75 + 0.25 * Math.sin(elapsed * 11.3) * Math.sin(elapsed * 5.1 + 1.7);
    fireLight.intensity = 10 + f * 8;
    flame.scale.set(0.9 + f * 0.2, 0.85 + f * 0.35, 0.9 + f * 0.2);
    M.flame.emissiveIntensity = 3 + f * 2.5;
    // drifting petals
    const pos = airGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const bx = petalBase[i * 3], by = petalBase[i * 3 + 1], bz = petalBase[i * 3 + 2];
      const y = ((by - elapsed * 0.35 + 40) % 9.5) + 0.4;
      pos.setXYZ(i, bx + Math.sin(elapsed * 0.6 + by * 3) * 0.9, y, bz + Math.cos(elapsed * 0.45 + bx) * 0.9);
    }
    pos.needsUpdate = true;
    updateAudio(dt);
  }

  // Pre-composer hook — the only one that gets a renderer, which the PMREM bake
  // needs. One bake, on the first frame we are handed one.
  function preRender(r) {
    if (envBaked || !r || !alive) return;
    envBaked = true;
    pmrem = new THREE.PMREMGenerator(r);
    envRT = pmrem.fromScene(sky, 0, 0.1, SKY_SCALE);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.7;
  }

  function dispose() {
    if (!alive) return;
    alive = false;
    disposeAudio();
    group.parent?.remove(group);
    group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
    });
    for (const d of disposables) d.dispose?.();
    sky.material.dispose();
    sky.geometry.dispose();
    if (envRT) { envRT.dispose(); envRT = null; }
    if (pmrem) { pmrem.dispose(); pmrem = null; }
    // hand the scene globals back exactly as we found them
    scene.fog = prevFog;
    scene.environment = prevEnv;
    scene.environmentIntensity = prevEnvIntensity;
  }

  return {
    group,
    colliders,
    // Where the player is standing when the white fades out: on the pad, beside
    // the ship, looking down the path at the cottage.
    spawn: new THREE.Vector3(3.2, PAD_Y, PAD_Z + 2.4),
    pad: new THREE.Vector3(0, PAD_Y, PAD_Z),
    padRadius: PAD_R,
    // Where the ship sits, and which way its nose points (down the path, so it
    // is already facing out when you climb in).
    shipSpot: new THREE.Vector3(-1.6, PAD_Y, PAD_Z + 0.6),
    floorYAt,
    insideHouse,
    update,
    preRender,
    dispose,
  };
}
