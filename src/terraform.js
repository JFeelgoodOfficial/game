// The handheld terrain manipulator (terra only — cfg.terraform). Point the
// device at the ground and hold RAISE (Z / on-screen button) or LOWER (X /
// button) to sculpt it: smooth cosine-falloff stamps that move BOTH the
// rendered geometry (absolute re-stamp of affected baked vertices, with
// analytic normals) and the CPU terrain field the walker's feet, camera and
// flight floor sample (installed as body.editHeightAt — see planet.js).
// Edits persist to localStorage (fail-open, same pattern as settings.js) and
// replay onto the baked geometry via planet.onBaked on the next boot.
//
// Aiming is an analytic raymarch against the same CPU field — no
// THREE.Raycaster, no mesh dependence: what the reticle sits on is exactly
// what the feet will stand on.
//
// v1 limits (accepted): stamps keep the original procedural color band and
// analytic vertex normals only (the fragment shader's derivative bump tracks
// the procedural field, not edits); dressing/city placed before an edit may
// float/sink over resculpted ground.

import * as THREE from 'three';
import { C } from './constants.js';
import { planets } from './planet.js';
import { groundHeight } from './terrain.js';
import { input } from './input.js';
import { showViewToast } from './walkview.js';

const STORE_PREFIX = 'nova7.tform.';

// --- scratch (never allocated per frame) ---
const _dir = new THREE.Vector3();
const _p = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _d1 = new THREE.Vector3();
const _d2 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);

// Per-planet edit stores: name -> { planet, edits: [{x,y,z,r,h,dotMin}] }
const stores = new Map();

let active = null; // the store while walking a terraform planet
let astronautGroup = null;
let reticle = null; // additive ring on the aim point (child of planet.surface)
let device = null; // the handheld prop (scene-level, posed every frame)
let deviceTip = null; // emissive tip material — pulses while firing
let stampTimer = 0;
let wasFiring = false; // for the once-per-stroke bounding-sphere refresh
let aimHit = false;
const _aimDirWorld = new THREE.Vector3(); // hit dir, world space
const _aimDirLocal = new THREE.Vector3(); // hit dir, unrotated surface space
let uiRoot = null;

// ---------------------------------------------------------------------------
// Edit store + CPU field
// ---------------------------------------------------------------------------

function makeEdit(planet, x, y, z, r, h) {
  const chord = r / planet.radius;
  return { x, y, z, r, h, dotMin: 1 - (chord * chord) / 2 };
}

function loadStore(planet) {
  const edits = [];
  try {
    const raw = localStorage.getItem(STORE_PREFIX + planet.cfg.name);
    if (raw) {
      for (const row of JSON.parse(raw)) {
        if (!Array.isArray(row) || row.length !== 5) continue;
        edits.push(makeEdit(planet, row[0], row[1], row[2], row[3], row[4]));
      }
    }
  } catch {
    /* private mode / corrupt store — session-only */
  }
  return { planet, edits };
}

function saveStore(store) {
  try {
    localStorage.setItem(
      STORE_PREFIX + store.planet.cfg.name,
      JSON.stringify(
        store.edits.map((e) => [
          +e.x.toFixed(5), +e.y.toFixed(5), +e.z.toFixed(5),
          +e.r.toFixed(2), +e.h.toFixed(2),
        ])
      )
    );
  } catch {
    /* session-only */
  }
}

// Summed edit height for an UNROTATED surface-space direction — the hook
// planet.js sample() calls from body.terrainAt/groundAt.
function makeSampler(store) {
  const R = store.planet.radius;
  return (dx, dy, dz) => {
    let h = 0;
    const edits = store.edits;
    for (let i = 0; i < edits.length; i++) {
      const e = edits[i];
      const dot = dx * e.x + dy * e.y + dz * e.z;
      if (dot <= e.dotMin) continue;
      const dist = Math.sqrt(Math.max(2 - 2 * dot, 0)) * R;
      if (dist >= e.r) continue;
      h += e.h * (0.5 + 0.5 * Math.cos((Math.PI * dist) / e.r));
    }
    return h;
  };
}

// ---------------------------------------------------------------------------
// Geometry re-stamp (absolute, idempotent — safe for merge and replay)
// ---------------------------------------------------------------------------

// Total signed terrain height (procedural + edits) for an unrotated dir.
function totalHeight(store, dx, dy, dz) {
  const cfg = store.planet.cfg;
  return (
    groundHeight(
      dx, dy, dz,
      cfg.seaLevel(), cfg.terrainHeight(),
      cfg.shape || null,
      cfg.oceanDepth ? cfg.oceanDepth() : 0
    ) + store.planet.body.editHeightAt(dx, dy, dz)
  );
}

// Recompute every baked vertex within `rr` surface-units of dir (cx,cy,cz):
// position = dir * (radius + totalHeight), normal from two tangent
// finite-difference samples of the total field. A full scan of ~74k verts is
// ~a dot product each — simple, and immune to SphereGeometry's seam/pole
// vertex duplication.
function restampRegion(store, cx, cy, cz, rr) {
  const planet = store.planet;
  if (!planet.baked) return;
  const geo = planet.surface.geometry;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const R = planet.radius;
  const chord = rr / R;
  const dotMin = 1 - (chord * chord) / 2 - 1e-5;
  const EPS = 2.0; // tangent step, surface units
  for (let vi = 0; vi < pos.count; vi++) {
    const x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
    const len = Math.sqrt(x * x + y * y + z * z);
    const dx = x / len, dy = y / len, dz = z / len;
    if (dx * cx + dy * cy + dz * cz <= dotMin) continue;
    const h = totalHeight(store, dx, dy, dz);
    const rNew = R + h;
    pos.setXYZ(vi, dx * rNew, dy * rNew, dz * rNew);
    // analytic normal: perturb the sphere normal by the field gradient
    _dir.set(dx, dy, dz);
    _t1.crossVectors(_dir, Math.abs(dy) < 0.94 ? _yAxis : _d1.set(1, 0, 0)).normalize();
    _t2.crossVectors(_dir, _t1).normalize();
    _d1.copy(_dir).addScaledVector(_t1, EPS / R).normalize();
    _d2.copy(_dir).addScaledVector(_t2, EPS / R).normalize();
    const g1 = (totalHeight(store, _d1.x, _d1.y, _d1.z) - h) / EPS;
    const g2 = (totalHeight(store, _d2.x, _d2.y, _d2.z) - h) / EPS;
    _n.copy(_dir).addScaledVector(_t1, -g1).addScaledVector(_t2, -g2).normalize();
    nor.setXYZ(vi, _n.x, _n.y, _n.z);
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
}

function replayAll(store) {
  for (const e of store.edits) restampRegion(store, e.x, e.y, e.z, e.r);
  if (store.edits.length) store.planet.surface.geometry.computeBoundingSphere();
}

// ---------------------------------------------------------------------------
// Init / lifecycle
// ---------------------------------------------------------------------------

// Called once from initWalk: wires every terraform planet's CPU field hook
// and geometry replay, so persisted sculpting is visible from orbit.
export function initTerraform() {
  for (const p of planets) {
    if (!p.cfg.terraform || p.body === null) continue;
    const store = loadStore(p);
    stores.set(p.cfg.name, store);
    p.body.editHeightAt = makeSampler(store);
    if (p.baked) replayAll(store);
    else p.onBaked = () => replayAll(store);
  }
  initTerraformUI();
}

// Enter/exit a landing site (walk.js). Builds the reticle + handheld prop
// lazily on the first terraform world.
export function terraformEnter(planet, astronaut) {
  const store = stores.get(planet.cfg.name);
  if (!store) return;
  active = store;
  astronautGroup = astronaut;
  stampTimer = 0;
  if (!reticle) buildVisuals();
  planet.surface.add(reticle);
  astronaut.parent.add(device); // the scene — posed absolutely every frame
  reticle.visible = false;
  device.visible = true;
  setTerraformUIVisible(true);
}

export function terraformExit() {
  if (!active) return;
  reticle?.parent?.remove(reticle);
  device?.parent?.remove(device);
  active = null;
  astronautGroup = null;
  aimHit = false;
  setTerraformUIVisible(false);
}

function buildVisuals() {
  // Aim reticle: a thin additive magenta ring marking the brush edge. Kept
  // dim and narrow — at 35 u radius anything brighter floods the view (and
  // the bloom pass) when seen edge-on from the third-person camera.
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(C.TFORM_RADIUS * 0.94, C.TFORM_RADIUS, 48),
    new THREE.MeshBasicMaterial({
      color: 0x8f2f6a,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  reticle.renderOrder = 3;

  // The handheld device: a small emitter — grip, body, barrel, emissive tip.
  device = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x2c2a44, roughness: 0.5, metalness: 0.6 });
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.06), hull);
  grip.position.y = -0.08;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.22), hull);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.16, 8), hull);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -0.17;
  deviceTip = new THREE.MeshStandardMaterial({
    color: 0xd4408f,
    emissive: new THREE.Color(0xd4408f),
    emissiveIntensity: 0.6,
  });
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), deviceTip);
  tip.position.z = -0.26;
  device.add(grip, body, barrel, tip);
}

// ---------------------------------------------------------------------------
// Per-render-frame update: aim, visuals, stamping. Called from
// updateWalkCamera with the freshly posed camera.
// ---------------------------------------------------------------------------

export function updateTerraform(camera, dt, t) {
  if (!active) return;
  const planet = active.planet;

  // --- analytic raymarch against the live field (terrain + edits) ---
  _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  aimHit = false;
  let prevF = 0;
  for (let i = 0; i <= 64; i++) {
    _p.copy(camera.position).addScaledVector(_fwd, i * 1.5);
    _dir.subVectors(_p, planet.body.position);
    const r = _dir.length();
    _dir.multiplyScalar(1 / r);
    let floorR = planet.radius + planet.body.terrainAt(_dir);
    // The sea counts as a stamp target too (dredge a pit / raise an island).
    if (planet.water && floorR < planet.water.r) floorR = planet.water.r;
    const f = r - floorR;
    if (i > 0 && f < 0 && prevF >= 0) {
      // bisect between the last two samples for a crisp hit
      let a = (i - 1) * 1.5, b = i * 1.5;
      for (let s = 0; s < 6; s++) {
        const m = (a + b) / 2;
        _p.copy(camera.position).addScaledVector(_fwd, m);
        _dir.subVectors(_p, planet.body.position);
        const rm = _dir.length();
        _dir.multiplyScalar(1 / rm);
        let fr = planet.radius + planet.body.terrainAt(_dir);
        if (planet.water && fr < planet.water.r) fr = planet.water.r;
        if (rm - fr < 0) b = m;
        else a = m;
      }
      _aimDirWorld.copy(_dir);
      aimHit = true;
      break;
    }
    prevF = f;
  }

  // --- reticle on the hit point (planet.surface local frame) ---
  if (aimHit) {
    const rot = planet.surface.rotation.y;
    const cos = Math.cos(-rot), sin = Math.sin(-rot);
    _aimDirLocal.set(
      _aimDirWorld.x * cos + _aimDirWorld.z * sin,
      _aimDirWorld.y,
      -_aimDirWorld.x * sin + _aimDirWorld.z * cos
    );
    const h = planet.body.terrainAtLocal(_aimDirLocal);
    const surfH = planet.water ? Math.max(h, C.WALK_WATER_LEVEL) : h;
    reticle.visible = true;
    reticle.position.copy(_aimDirLocal).multiplyScalar(planet.radius + surfH + 0.4);
    _q.setFromUnitVectors(_yAxis, _aimDirLocal);
    reticle.quaternion.copy(_q);
    reticle.rotateX(-Math.PI / 2); // ring geometry lies in XY — lay it flat
  } else {
    reticle.visible = false;
  }

  // --- pose the handheld prop ---
  const firing = (input.raise || input.lower) && aimHit;
  if (walkViewIsFP()) {
    device.position.copy(camera.position)
      .addScaledVector(_t1.set(1, 0, 0).applyQuaternion(camera.quaternion), 0.35)
      .addScaledVector(_t2.set(0, 1, 0).applyQuaternion(camera.quaternion), -0.28)
      .addScaledVector(_fwd, 0.7);
    device.quaternion.copy(camera.quaternion);
  } else if (astronautGroup) {
    // At the astronaut's right hip, aimed with the camera.
    device.position.copy(astronautGroup.position)
      .addScaledVector(_t1.set(1, 0, 0).applyQuaternion(astronautGroup.quaternion), 0.5)
      .addScaledVector(_t2.set(0, 1, 0).applyQuaternion(astronautGroup.quaternion), 1.1);
    device.quaternion.copy(camera.quaternion);
  }
  deviceTip.emissiveIntensity = firing ? 1.0 + Math.sin(t * 30) * 0.25 : 0.5;

  // --- stamping cadence (+ one bounding-sphere refresh per stroke end) ---
  if (!firing || !planet.baked) {
    if (wasFiring && planet.baked)
      planet.surface.geometry.computeBoundingSphere();
    wasFiring = false;
    stampTimer = 0;
    return;
  }
  wasFiring = true;
  stampTimer -= dt;
  if (stampTimer > 0) return;
  stampTimer = 1 / C.TFORM_RATE;
  applyStamp(input.raise ? C.TFORM_DELTA : -C.TFORM_DELTA);
}

function applyStamp(delta) {
  const store = active;
  const edits = store.edits;
  const last = edits.length ? edits[edits.length - 1] : null;
  // Merge into the previous stamp when close and same-signed — holding the
  // trigger grows one edit instead of burning the budget.
  let e;
  if (
    last &&
    Math.sign(last.h) === Math.sign(delta) &&
    last.x * _aimDirLocal.x + last.y * _aimDirLocal.y + last.z * _aimDirLocal.z >
      1 - ((0.25 * last.r) / store.planet.radius) ** 2 / 2
  ) {
    last.h += delta;
    e = last;
  } else {
    if (edits.length >= C.TFORM_MAX_EDITS) {
      showViewToast('TERRAFORM CHARGE DEPLETED — this world holds no more edits', 3);
      return;
    }
    e = makeEdit(store.planet, _aimDirLocal.x, _aimDirLocal.y, _aimDirLocal.z, C.TFORM_RADIUS, delta);
    edits.push(e);
  }
  restampRegion(store, e.x, e.y, e.z, e.r);
  saveStore(store);
}

// walkview owns the FP/TP preference; read it lazily to dodge an import cycle.
let _viewGetter = null;
export function setViewGetter(fn) {
  _viewGetter = fn;
}
function walkViewIsFP() {
  return _viewGetter ? _viewGetter() === 'fp' : false;
}

// ---------------------------------------------------------------------------
// HUD: RAISE / LOWER hold-buttons (warpBtn pattern — buttons feed `input`)
// ---------------------------------------------------------------------------

function initTerraformUI() {
  if (uiRoot) return;
  const style = document.createElement('style');
  style.textContent = `
    #tformUI {
      position: fixed; right: 18px; bottom: 96px; z-index: 10;
      display: none; flex-direction: column; gap: 10px;
      font-family: 'Courier New', monospace; user-select: none;
    }
    #tformUI.on { display: flex; }
    .tformBtn {
      padding: 12px 18px; border: 1px solid rgba(212, 64, 143, 0.7);
      border-radius: 8px; color: #ffd9ec; background: rgba(40, 8, 28, 0.55);
      font-size: 14px; letter-spacing: 2px; text-align: center;
      cursor: pointer; touch-action: none;
    }
    .tformBtn.active {
      background: rgba(212, 64, 143, 0.75); color: #fff;
      box-shadow: 0 0 18px rgba(212, 64, 143, 0.8);
    }
    .tformHint { font-size: 10px; opacity: 0.6; color: #ffd9ec; text-align: center; }
    @media (max-width: 640px) {
      #tformUI { right: 12px; bottom: 96px; }
    }
    @media (pointer: coarse) {
      .tformBtn { padding: 14px 20px; }
    }
  `;
  document.head.appendChild(style);

  uiRoot = document.createElement('div');
  uiRoot.id = 'tformUI';
  const mk = (label, flag) => {
    const b = document.createElement('div');
    b.className = 'tformBtn';
    b.textContent = label;
    const set = (v) => (e) => {
      e.preventDefault();
      input[flag] = v;
      b.classList.toggle('active', v);
    };
    b.addEventListener('mousedown', set(true));
    b.addEventListener('touchstart', set(true), { passive: false });
    window.addEventListener('mouseup', set(false));
    b.addEventListener('touchend', set(false));
    b.addEventListener('mouseleave', set(false));
    uiRoot.appendChild(b);
    return b;
  };
  mk('▲ RAISE', 'raise');
  mk('▼ LOWER', 'lower');
  const hint = document.createElement('div');
  hint.className = 'tformHint';
  hint.textContent = 'Z / X — terrain tool';
  uiRoot.appendChild(hint);
  document.body.appendChild(uiRoot);
}

export function setTerraformUIVisible(v) {
  uiRoot?.classList.toggle('on', !!v);
}
