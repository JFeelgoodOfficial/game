/**
 * actuality-mirrorroom.js
 *
 * The hyper-holo-grid set piece for world/actuality.js — the contemplative
 * chamber unlocked once every zone has been visited. Rather than true recursive
 * mirrors (infeasible in real time for a planet-scale scene), it literalizes the
 * book's own words — "individuals ... stacked on top or below your own ... it
 * goes on forever" — by rendering the player's own figure (on a lit dais) to a
 * texture once per frame and displaying a grid of that live copy receding into a
 * cool haze, doubled by a faked reflective floor, on fine mirror-grid walls.
 *
 * This is the first world/ → src/ import in the project (Astronaut); it is a
 * deliberate reuse of the existing procedural figure so the reflected "selves"
 * match the player's body. No per-frame allocation on the hot path.
 */

import * as THREE from 'three';
import { Astronaut } from '../src/astronaut.js';

export function createMirrorRoom(opts = {}) {
  const HALF = opts.half ?? 4;      // interior half-extent (8 m cube)
  const SPACING = opts.spacing ?? 2.2;
  const REACH = opts.reach ?? 4;    // copies span i,j,k in [-REACH, REACH]

  const group = new THREE.Group();
  group.name = 'actuality.mirror';
  const geos = [];
  const mats = [];
  const texs = [];

  // Fine cyan mirror grid on deep blue-black glass; a barely-visible "0" is
  // worked into the centre (the tenth digit, 0 = repeat program).
  const gc = document.createElement('canvas');
  gc.width = 256; gc.height = 256;
  const gg = gc.getContext('2d');
  gg.fillStyle = '#050a12'; gg.fillRect(0, 0, 256, 256);
  gg.strokeStyle = 'rgba(90,170,230,0.30)'; gg.lineWidth = 1;
  for (let k = 0; k <= 256; k += 12) { gg.beginPath(); gg.moveTo(0, k); gg.lineTo(256, k); gg.moveTo(k, 0); gg.lineTo(k, 256); gg.stroke(); }
  gg.strokeStyle = 'rgba(120,200,255,0.5)'; gg.lineWidth = 2;
  for (let k = 0; k <= 256; k += 48) { gg.beginPath(); gg.moveTo(0, k); gg.lineTo(256, k); gg.moveTo(k, 0); gg.lineTo(k, 256); gg.stroke(); }
  gg.globalAlpha = 0.1; gg.strokeStyle = '#bfe0ff'; gg.lineWidth = 9;
  gg.font = 'bold 190px Georgia, serif'; gg.textAlign = 'center'; gg.textBaseline = 'middle';
  gg.strokeText('0', 128, 128);
  const gridTex = new THREE.CanvasTexture(gc);
  gridTex.colorSpace = THREE.SRGBColorSpace;
  gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
  gridTex.repeat.set(2, 2);
  texs.push(gridTex);

  // --- Chamber shell: mirror-grid glass on the four walls + ceiling. ---
  const glassMat = new THREE.MeshBasicMaterial({
    map: gridTex, color: 0x3a5a80, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
  });
  mats.push(glassMat);
  const faceGeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2);
  geos.push(faceGeo);
  const addFace = (x, y, z, rx, ry) => {
    const m = new THREE.Mesh(faceGeo, glassMat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0);
    group.add(m);
  };
  addFace(0, HALF, -HALF, 0, 0);            // back
  addFace(0, HALF, HALF, 0, Math.PI);       // front
  addFace(-HALF, HALF, 0, 0, Math.PI / 2);  // left
  addFace(HALF, HALF, 0, 0, -Math.PI / 2);  // right
  addFace(0, HALF * 2, 0, Math.PI / 2, 0);  // ceiling

  // Glass floor. It was 0.62 opaque to half-hide a faked reflection; now there
  // are real copies stacked underneath, so it drops to a sheet you genuinely
  // see down through — the stack continues below your feet.
  const floorGeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2);
  const floorMat = new THREE.MeshBasicMaterial({
    map: gridTex, color: 0x0a1622, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(0, 0.01, 0); floor.rotation.x = -Math.PI / 2;
  group.add(floor);
  geos.push(floorGeo); mats.push(floorMat);

  // Emissive edge trim (soft bloom seams) at floor + ceiling.
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x9fd6ff, emissive: 0x6fb8ff, emissiveIntensity: 1.0, roughness: 0.4,
  });
  mats.push(trimMat);
  const trimGeo = new THREE.BoxGeometry(HALF * 2 + 0.1, 0.05, 0.05);
  geos.push(trimGeo);
  for (const y of [0.02, HALF * 2 - 0.02]) {
    for (const z of [-HALF, HALF]) {
      const t = new THREE.Mesh(trimGeo, trimMat); t.position.set(0, y, z); group.add(t);
      const t2 = new THREE.Mesh(trimGeo, trimMat); t2.position.set(0, y, z); t2.rotation.y = Math.PI / 2; group.add(t2);
    }
  }

  // Central dais the player stands on (dark disc + glowing rim + downlight).
  const daisGeo = new THREE.CylinderGeometry(1.7, 1.8, 0.2, 40);
  const daisMat = new THREE.MeshStandardMaterial({ color: 0x0c1420, roughness: 0.35, metalness: 0.5 });
  const dais = new THREE.Mesh(daisGeo, daisMat); dais.position.set(0, 0.1, 0);
  group.add(dais); geos.push(daisGeo); mats.push(daisMat);
  const rimGeo = new THREE.TorusGeometry(1.7, 0.04, 8, 48);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, emissive: 0x8fd0ff, emissiveIntensity: 1.2, roughness: 0.3 });
  const rim = new THREE.Mesh(rimGeo, rimMat); rim.position.set(0, 0.21, 0); rim.rotation.x = Math.PI / 2;
  group.add(rim); geos.push(rimGeo); mats.push(rimMat);
  const downLight = new THREE.PointLight(0xcfe8ff, 1.7, 14, 2.0);
  downLight.position.set(0, HALF * 1.6, 0); group.add(downLight);
  // Softer, brighter room: a cool ambient fill + a sky-blue hemisphere so the
  // whole grid lifts out of the dark, and four low corner glows for a gentle
  // blue wash up the walls.
  group.add(new THREE.AmbientLight(0x5a86c0, 0.55));
  group.add(new THREE.HemisphereLight(0x9fd0ff, 0x0a1424, 0.6));
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const gl = new THREE.PointLight(0x6fb0ff, 0.7, 12, 2.0);
    gl.position.set(cx * (HALF - 0.6), 1.2, cz * (HALF - 0.6)); group.add(gl);
  }
  // A large, faint additive halo that reads as a soft blue glow filling the air.
  const haloGeo = new THREE.SphereGeometry(HALF * 1.3, 20, 16);
  const haloMat = new THREE.MeshBasicMaterial({ color: 0x2f6dc0, transparent: true, opacity: 0.14, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const halo = new THREE.Mesh(haloGeo, haloMat); halo.position.set(0, HALF, 0);
  group.add(halo); geos.push(haloGeo); mats.push(haloMat);

  // Recessed ceiling light discs.
  const discGeo = new THREE.CircleGeometry(0.4, 20);
  const discMat = new THREE.MeshBasicMaterial({ color: 0xdfefff });
  geos.push(discGeo); mats.push(discMat);
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2], [0, 0]]) {
    const d = new THREE.Mesh(discGeo, discMat);
    d.position.set(dx, HALF * 2 - 0.02, dz); d.rotation.x = Math.PI / 2;
    group.add(d);
  }

  // Matte-black void shell enclosing the copies. Sized from the lattice on all
  // three axes and centred on the dais, so the stack fades into black in every
  // direction instead of clipping through a shell that only ever accounted for
  // one floor plane of copies.
  const shellR = SPACING * (REACH + 3);
  const shellRY = SPACING * 1.3 * (REACH + 3);
  const voidGeo = new THREE.BoxGeometry(shellR * 2, shellRY * 2, shellR * 2);
  const voidMat = new THREE.MeshBasicMaterial({ color: 0x01030a, side: THREE.BackSide });
  const voidShell = new THREE.Mesh(voidGeo, voidMat);
  voidShell.position.set(0, 1.1, 0); // the dais, i.e. the centre of the stack
  group.add(voidShell);
  geos.push(voidGeo); mats.push(voidMat);

  // Scattered depth sparkles (distant cool lights).
  const NS = 90;
  const sparkGeo = new THREE.PlaneGeometry(0.05, 0.05);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0x8fc8ff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
  const sparks = new THREE.InstancedMesh(sparkGeo, sparkMat, NS);
  sparks.frustumCulled = false; group.add(sparks);
  geos.push(sparkGeo); mats.push(sparkMat);
  {
    const sm = new THREE.Matrix4();
    let s = 0x51ab;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = 0; i < NS; i++) {
      sm.makeTranslation((rnd() - 0.5) * shellR * 1.6, (rnd() - 0.2) * shellR * 1.2, (rnd() - 0.5) * shellR * 1.6);
      sparks.setMatrixAt(i, sm);
    }
    sparks.instanceMatrix.needsUpdate = true;
  }

  // --- RTT: render the player's figure on a lit dais to a texture per frame. ---
  const rt = new THREE.WebGLRenderTarget(384, 384, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });
  const cloneScene = new THREE.Scene();
  const clone = new Astronaut();
  cloneScene.add(clone.group);
  cloneScene.add(new THREE.AmbientLight(0x9fc4e8, 0.8));
  const cloneKey = new THREE.DirectionalLight(0xffffff, 1.4);
  cloneKey.position.set(2, 4, 3);
  cloneScene.add(cloneKey);
  // A small dais under the clone so every copy stands on its own platform.
  const cDaisGeo = new THREE.CylinderGeometry(0.6, 0.66, 0.09, 28);
  const cDaisMat = new THREE.MeshStandardMaterial({ color: 0x10202e, roughness: 0.4, metalness: 0.5 });
  const cDais = new THREE.Mesh(cDaisGeo, cDaisMat); cDais.position.y = -0.04; cloneScene.add(cDais);
  const cRimGeo = new THREE.TorusGeometry(0.62, 0.02, 6, 32);
  const cRimMat = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, emissive: 0x8fd0ff, emissiveIntensity: 1.3, roughness: 0.3 });
  const cRim = new THREE.Mesh(cRimGeo, cRimMat); cRim.position.y = 0.01; cRim.rotation.x = Math.PI / 2; cloneScene.add(cRim);
  const cloneCam = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
  cloneCam.position.set(0, 1.7, 5.4);
  cloneCam.lookAt(0, 0.85, 0);

  // --- Copies: a true 3-D lattice of the live clone texture. ---
  //
  // This used to be a single floor plane of copies plus one flipped set below
  // it faking a reflection — nothing above you, nothing genuinely below. The
  // book's line, quoted in this file's own header, is "individuals ... stacked
  // on top or below your own ... it goes on forever", so the grid now runs in
  // all three axes and the fake reflection is gone: the real stack underfoot
  // is what it was standing in for.
  //
  // 9x9x9 is 728 copies and still one draw call, which is nothing on a world
  // where the rest of the universe is switched off.
  const latMat = new THREE.MeshBasicMaterial({
    map: rt.texture, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  mats.push(latMat);
  const latGeo = new THREE.PlaneGeometry(1.25, 2.3);
  geos.push(latGeo);
  const cells = [];
  const FY = 1.1;             // copy centre height (figure stands on its dais)
  const VSPACING = SPACING * 1.3; // taller than wide: bodies need headroom
  for (let i = -REACH; i <= REACH; i++) {
    for (let j = -REACH; j <= REACH; j++) {
      for (let k = -REACH; k <= REACH; k++) {
        if (i === 0 && j === 0 && k === 0) continue; // that one is you
        // Euclidean falloff, so the stack hazes out evenly in every direction
        // rather than down the axes first.
        const d = Math.sqrt(i * i + j * j + k * k);
        cells.push({
          x: i * SPACING,
          y: FY + j * VSPACING,
          z: k * SPACING,
          dim: Math.pow(0.80, d),
        });
      }
    }
  }
  const lattice = new THREE.InstancedMesh(latGeo, latMat, cells.length);
  lattice.frustumCulled = false;
  lattice.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cells.length * 3), 3);
  for (let c = 0; c < cells.length; c++) {
    const d = cells[c].dim;
    lattice.instanceColor.setXYZ(c, d * 0.8, d * 0.9, d); // cool tint
  }
  lattice.instanceColor.needsUpdate = true;
  group.add(lattice);

  // --- Update: pose the clone as the player, billboard every copy. ---
  //
  // The copies all sample one render-to-texture clone, so they already move in
  // perfect unison; the work is making that unison be YOU. The clone used to
  // play a hardcoded 'idle' and spin on its own axis ("the selves regard you
  // from their own angle"), which is the opposite of mimicry. Now walk.mode,
  // walk.speed01 and the player's facing drive it directly.
  //
  // The quads stay camera-facing and the CLONE'S camera is orbited to match the
  // angle you are being seen from — so each copy is a live picture of you from
  // the viewer's side. Giving every copy your literal yaw instead would be more
  // naive-correct and much worse: flat billboards all sharing one heading go
  // edge-on and vanish the moment you turn.
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _camOff = new THREE.Vector3();
  const CAM_DIST = 5.4;
  function update(t, dt, playerLocal, speed01 = 0, mode = 'idle', facingYaw = 0, viewYaw = 0) {
    clone.update(dt, mode, speed01);
    clone.group.rotation.y = 0; // the clone stays put; the camera moves around it

    // Where the viewer stands relative to the player, expressed as an angle
    // about the clone. rel = 0 means we're looking at the player's back.
    const rel = viewYaw - facingYaw;
    _camOff.set(Math.sin(rel) * CAM_DIST, 1.7, Math.cos(rel) * CAM_DIST);
    cloneCam.position.copy(_camOff);
    cloneCam.lookAt(0, 0.85, 0);

    rim.material.emissiveIntensity = 1.0 + Math.sin(t * 1.5) * 0.3;
    const px = playerLocal ? playerLocal.x : 0;
    const pz = playerLocal ? playerLocal.z : 0;
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      const yaw = Math.atan2(px - cell.x, pz - cell.z); // billboard toward the viewer
      _e.set(0, yaw, 0);
      _q.setFromEuler(_e);
      _m.compose(_v3(cell.x, cell.y, cell.z), _q, _s3(1, 1, 1));
      lattice.setMatrixAt(c, _m);
    }
    lattice.instanceMatrix.needsUpdate = true;
  }

  const _tv = new THREE.Vector3();
  const _ts = new THREE.Vector3();
  function _v3(x, y, z) { return _tv.set(x, y, z); }
  function _s3(x, y, z) { return _ts.set(x, y, z); }

  // --- Pre-composer render: draw the clone (on its dais) into the target. ---
  const _prevColor = new THREE.Color();
  function preRender(renderer) {
    const prevTarget = renderer.getRenderTarget();
    renderer.getClearColor(_prevColor);
    const prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(cloneScene, cloneCam);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(_prevColor, prevAlpha);
  }

  function dispose() {
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    for (const tx of texs) tx.dispose();
    rt.dispose();
    cloneScene.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  }

  return { group, update, preRender, dispose, half: HALF };
}
