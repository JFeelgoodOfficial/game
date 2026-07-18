/**
 * actuality-mirrorroom.js
 *
 * The hyper-holo-grid set piece for world/actuality.js — the contemplative
 * chamber unlocked once every zone has been visited. Rather than true recursive
 * mirrors (infeasible in real time for a planet-scale scene), it literalizes the
 * book's own words — "individuals ... stacked on top or below your own ... it
 * goes on forever" — by rendering the player's own figure to a small texture
 * once per frame and displaying a 3D lattice of that live copy receding in every
 * direction, dimmed by lattice distance, seen through near-black glass walls.
 *
 * This is the first world/ → src/ import in the project (Astronaut); it is a
 * deliberate reuse of the existing procedural figure so the reflected "selves"
 * match the player's body. No per-frame allocation on the hot path.
 */

import * as THREE from 'three';
import { Astronaut } from '../src/astronaut.js';

export function createMirrorRoom(opts = {}) {
  const HALF = opts.half ?? 4;      // interior half-extent (8 m cube)
  const SPACING = opts.spacing ?? 2.4;
  const SHELL = 2;                  // lattice shells per axis (depth cap)

  const group = new THREE.Group();
  group.name = 'actuality.mirror';
  const geos = [];
  const mats = [];

  // --- Chamber shell: near-black translucent "glass" on all six faces. ---
  const glassMat = new THREE.MeshBasicMaterial({
    color: 0x05060a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false,
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
  addFace(0, 0, 0, -Math.PI / 2, 0);        // floor (visual; solid slab below)

  // Emissive edge trim (soft bloom seams).
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xbfe0ff, emissive: 0x9fd0ff, emissiveIntensity: 1.0, roughness: 0.4,
  });
  mats.push(trimMat);
  const trimGeo = new THREE.BoxGeometry(HALF * 2 + 0.1, 0.06, 0.06);
  geos.push(trimGeo);
  for (const y of [0.02, HALF * 2 - 0.02]) {
    for (const z of [-HALF, HALF]) {
      const t = new THREE.Mesh(trimGeo, trimMat); t.position.set(0, y, z); group.add(t);
      const t2 = new THREE.Mesh(trimGeo, trimMat); t2.position.set(0, y, z); t2.rotation.y = Math.PI / 2; group.add(t2);
    }
  }

  // Matte-black void shell enclosing the lattice (backdrop).
  const voidGeo = new THREE.BoxGeometry(SPACING * (SHELL * 2 + 3), SPACING * (SHELL * 2 + 3), SPACING * (SHELL * 2 + 3));
  const voidMat = new THREE.MeshBasicMaterial({ color: 0x020204, side: THREE.BackSide });
  const voidShell = new THREE.Mesh(voidGeo, voidMat);
  voidShell.position.set(0, HALF, 0);
  group.add(voidShell);
  geos.push(voidGeo); mats.push(voidMat);

  // --- RTT: render the player's figure to a small target once per frame. ---
  const rt = new THREE.WebGLRenderTarget(256, 256, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });
  const cloneScene = new THREE.Scene();
  const clone = new Astronaut();
  cloneScene.add(clone.group);
  cloneScene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const cloneKey = new THREE.DirectionalLight(0xffffff, 1.3);
  cloneKey.position.set(2, 4, 3);
  cloneScene.add(cloneKey);
  const cloneCam = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
  cloneCam.position.set(0, 1.9, 5.2);
  cloneCam.lookAt(0, 1.0, 0);

  // --- Lattice of the live clone texture. ---
  const latMat = new THREE.MeshBasicMaterial({
    map: rt.texture, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  mats.push(latMat);
  const latGeo = new THREE.PlaneGeometry(1.1, 2.1);
  geos.push(latGeo);
  const cells = [];
  for (let i = -SHELL; i <= SHELL; i++) {
    for (let j = -SHELL; j <= SHELL; j++) {
      for (let k = -SHELL; k <= SHELL; k++) {
        if (i === 0 && j === 0 && k === 0) continue; // the player is the origin
        cells.push({ x: i * SPACING, y: HALF + j * SPACING, z: k * SPACING, dim: Math.pow(0.72, Math.abs(i) + Math.abs(j) + Math.abs(k)) });
      }
    }
  }
  const lattice = new THREE.InstancedMesh(latGeo, latMat, cells.length);
  lattice.frustumCulled = false;
  lattice.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cells.length * 3), 3);
  for (let c = 0; c < cells.length; c++) {
    const d = cells[c].dim;
    lattice.instanceColor.setXYZ(c, d, d, d);
  }
  lattice.instanceColor.needsUpdate = true;
  group.add(lattice);

  // --- Update: pose the clone, billboard every lattice cell toward the player.
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  let cloneYaw = 0;
  function update(t, dt, playerLocal, speed01 = 0) {
    clone.update(dt, 'idle', speed01);
    cloneYaw += dt * 0.12;
    clone.group.rotation.y = cloneYaw; // the selves regard you from their own angle
    const px = playerLocal ? playerLocal.x : 0;
    const pz = playerLocal ? playerLocal.z : 0;
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      const yaw = Math.atan2(px - cell.x, pz - cell.z); // face the player
      const mir = (c % 2) ? -1 : 1; // alternate parity mirror for reflection flavor
      _e.set(0, yaw, 0);
      _q.setFromEuler(_e);
      _m.compose(_v3(cell.x, cell.y, cell.z), _q, _s3(mir, 1, 1));
      lattice.setMatrixAt(c, _m);
    }
    lattice.instanceMatrix.needsUpdate = true;
  }

  const _tv = new THREE.Vector3();
  const _ts = new THREE.Vector3();
  function _v3(x, y, z) { return _tv.set(x, y, z); }
  function _s3(x, y, z) { return _ts.set(x, y, z); }

  // --- Pre-composer render: draw the clone into the render target. ---
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
    rt.dispose();
    cloneScene.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  }

  return { group, update, preRender, dispose, half: HALF };
}
