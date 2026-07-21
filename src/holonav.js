// Navigation hologram (user mechanic). NAV (button or N) raises a holographic
// system chart above the console: a ship-centred, square-root-compressed map
// so terra (3.5k out) and the sun (150k out) share one projection. Only
// contacts you've identified appear (nav.js discovery). Touch or click a world
// to select it, then confirm on the ENGAGE prompt to hand the ship to the
// auto-warp (autopilot.js): the hologram folds away, the ship turns to the
// world, and warp carries you to just outside its orbit.
//
// The hologram is a child of the cockpit shell, so it inherits the ship pose
// and the camera zoom for free. Picking is driven from cockpit3d.js's pointer
// handler via holoPick().

import * as THREE from 'three';
import { getBodies, isLogged, setNavOpenProbe } from './nav.js';
import { startAutoWarp } from './autopilot.js';
import { label } from './holoLabel.js';

const CYAN = 0x82f7ff,
  PINK = 0xffc9ec;
const HOLO_R = 0.62; // chart edge radius, prototype units (pre rig-scale)
const MAX_RANGE = 160000; // world units mapped to the chart edge

let holo, shipCone, promptGroup, engageProxy, reticle, path;
const markers = new Map(); // body id -> { group, proxy, body }
let pickTargets = [];

let open = false; // logical state (drives mouse-steer pause + NAV light)
let flyActive = false;
let selectedId = null;
let distTimer = 0;

const _rel = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _p = new THREE.Vector3();
let currentShipPos = new THREE.Vector3(); // ship.position ref, set each frame

function ring(radius, color, opacity) {
  const seg = 96,
    arr = new Float32Array(seg * 3);
  for (let s = 0; s < seg; s++) {
    const a = (s / seg) * Math.PI * 2;
    arr[s * 3] = Math.cos(a) * radius;
    arr[s * 3 + 1] = 0;
    arr[s * 3 + 2] = Math.sin(a) * radius;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  return new THREE.LineLoop(
    g,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending })
  );
}

export function initHolonav(shell) {
  holo = new THREE.Group();
  holo.position.set(0, 1.52, -0.25);
  holo.scale.setScalar(0.001);
  holo.visible = false;
  shell.add(holo);

  // base disc + range rings at 1k / 10k / 100k (sqrt-compressed radii)
  const base = new THREE.Mesh(
    new THREE.CircleGeometry(HOLO_R, 48),
    new THREE.MeshBasicMaterial({ color: 0x0a2230, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending })
  );
  base.rotation.x = -Math.PI / 2;
  holo.add(base);
  for (const d of [1000, 10000, 100000]) {
    holo.add(ring(HOLO_R * Math.sqrt(d / MAX_RANGE), CYAN, 0.16));
  }

  // ship heading marker at the centre
  shipCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.03, 0.09, 3),
    new THREE.MeshBasicMaterial({ color: PINK })
  );
  shipCone.rotation.x = Math.PI / 2; // lay the cone flat, nose along -Z
  holo.add(shipCone);

  // selection reticle + course path, hidden until something is picked
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.03, 0.042, 28),
    new THREE.MeshBasicMaterial({ color: PINK, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  reticle.rotation.x = -Math.PI / 2;
  reticle.visible = false;
  holo.add(reticle);

  const pathG = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  path = new THREE.Line(
    pathG,
    new THREE.LineDashedMaterial({ color: PINK, dashSize: 0.03, gapSize: 0.02, transparent: true, opacity: 0.9 })
  );
  path.visible = false;
  holo.add(path);

  buildPrompt();

  setNavOpenProbe(() => open);

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyN') toggleHolo();
    else if (e.code === 'Escape' && open) toggleHolo(false);
  });
}

function buildPrompt() {
  promptGroup = new THREE.Group();
  promptGroup.visible = false;
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.34),
    new THREE.MeshBasicMaterial({ color: 0x061820, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  promptGroup.add(bg);
  // the ENGAGE hit-proxy: an invisible plane that still raycasts
  engageProxy = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.1),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  engageProxy.position.set(0, -0.1, 0.01);
  engageProxy.userData.engage = true;
  promptGroup.add(engageProxy);
  holo.add(promptGroup);
}

// Rebuilt on selection (and the distance line refreshed on a throttle).
let promptLabels = [];
function fillPrompt(body) {
  for (const l of promptLabels) promptGroup.remove(l);
  promptLabels = [];
  const title = label(`WARP → ${body.label}`, body.color, 0.42);
  title.position.set(0, 0.1, 0.02);
  const eng = label('[ ENGAGE ]', PINK, 0.34);
  eng.position.set(0, -0.1, 0.02);
  promptLabels.push(title, eng);
  promptGroup.add(title, eng);
  refreshDist(body);
}

let distLabel = null;
function refreshDist(body) {
  if (distLabel) {
    promptGroup.remove(distLabel);
    const i = promptLabels.indexOf(distLabel);
    if (i >= 0) promptLabels.splice(i, 1);
  }
  const d = _rel.subVectors(body.pos, currentShipPos).length();
  const txt = d >= 1000 ? `${(d / 1000).toFixed(1)}k` : `${Math.round(d)}`;
  distLabel = label(txt, CYAN, 0.3);
  distLabel.position.set(0, 0, 0.02);
  promptLabels.push(distLabel);
  promptGroup.add(distLabel);
}

// marker geometry per body type
function makeMarker(body) {
  const group = new THREE.Group();
  const color = body.color;
  let mesh;
  if (body.station) {
    mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.016),
      new THREE.MeshBasicMaterial({ color: CYAN })
    );
  } else if (body.nebula) {
    mesh = new THREE.Sprite(
      new THREE.SpriteMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthTest: false })
    );
    mesh.scale.setScalar(0.05);
  } else {
    const r = 0.012 + (body.dot / 10) * 0.01;
    mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 16), new THREE.MeshBasicMaterial({ color }));
  }
  group.add(mesh);

  const lab = label(body.label, color, 0.22);
  lab.position.set(0, 0.05, 0);
  group.add(lab);

  // comfortable touch target, invisible but still raycasts
  const proxy = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  proxy.userData.body = body;
  group.add(proxy);

  holo.add(group);
  return { group, proxy, body };
}

// (re)build the set of visible markers for the currently-logged bodies
function refreshMarkers() {
  for (const b of getBodies()) {
    if (!isLogged(b.id)) {
      const m = markers.get(b.id);
      if (m) m.group.visible = false;
      continue;
    }
    let m = markers.get(b.id);
    if (!m) {
      m = makeMarker(b);
      markers.set(b.id, m);
    }
    m.group.visible = true;
  }
  rebuildPickTargets();
}

function rebuildPickTargets() {
  pickTargets = [];
  for (const m of markers.values()) if (m.group.visible) pickTargets.push(m.proxy);
  if (selectedId && promptGroup.visible) pickTargets.push(engageProxy);
}

export function toggleHolo(force) {
  const next = force !== undefined ? force : !open;
  if (next && !flyActive) return;
  open = next;
  if (open) {
    document.exitPointerLock?.(); // free the cursor to pick a destination
    refreshMarkers();
  } else {
    deselect();
  }
}

export function isHoloOpen() {
  return open;
}

function select(body) {
  if (!body) return;
  selectedId = body.id;
  reticle.visible = true;
  path.visible = true;
  promptGroup.visible = true;
  fillPrompt(body);
  rebuildPickTargets();
}

function deselect() {
  selectedId = null;
  reticle.visible = false;
  path.visible = false;
  promptGroup.visible = false;
  rebuildPickTargets();
}

function engage() {
  const body = getBodies().find((b) => b.id === selectedId);
  if (body) {
    toggleHolo(false);
    startAutoWarp(body);
  }
}

// Called from cockpit3d's pointer handler. Returns true if the pointer landed
// on a body or the ENGAGE prompt (consumed); a miss deselects and returns
// false so the press falls through to the dashboard.
export function holoPick(raycaster) {
  if (!open || !pickTargets.length) {
    if (open) deselect();
    return false;
  }
  const hits = raycaster.intersectObjects(pickTargets, false);
  if (!hits.length) {
    deselect();
    return false;
  }
  const o = hits[0].object;
  if (o.userData.engage) engage();
  else select(o.userData.body);
  return true;
}

// chart mapping: ship-centred, sqrt-compressed, chart-forward = world -Z
function chartPos(pos, out) {
  _rel.subVectors(pos, currentShipPos);
  const d = Math.hypot(_rel.x, _rel.z);
  const r = HOLO_R * Math.sqrt(Math.min(d, MAX_RANGE) / MAX_RANGE);
  const ang = Math.atan2(_rel.x, -_rel.z);
  out.set(Math.sin(ang) * r, 0, -Math.cos(ang) * r);
}

export function updateHolonav(ship, delta, active) {
  flyActive = active;
  if (!open && holo.scale.x <= 0.0015) {
    // eased fully closed — nothing to do
    if (holo.visible) holo.visible = false;
  }
  if (!active && open) toggleHolo(false);

  // scale in/out
  const target = open ? 1 : 0.001;
  const s = holo.scale.x + (target - holo.scale.x) * Math.min(delta * 12, 1);
  holo.scale.setScalar(s);
  holo.visible = s > 0.0015;
  if (!holo.visible) return;

  currentShipPos = ship.position;

  // ship heading cone at centre
  _fwd.set(0, 0, -1).applyQuaternion(ship.quaternion);
  shipCone.rotation.z = -Math.atan2(_fwd.x, -_fwd.z);

  // place each visible marker
  for (const m of markers.values()) {
    if (!m.group.visible) continue;
    chartPos(m.body.pos, _p);
    m.group.position.copy(_p);
  }

  // selection follow: reticle, prompt, dashed course
  if (selectedId) {
    const m = markers.get(selectedId);
    if (m && m.group.visible) {
      reticle.position.copy(m.group.position);
      promptGroup.position.set(m.group.position.x, m.group.position.y + 0.16, m.group.position.z);
      const pts = [new THREE.Vector3(0, 0.005, 0), m.group.position.clone()];
      path.geometry.setFromPoints(pts);
      path.computeLineDistances();
      distTimer -= delta;
      if (distTimer <= 0) {
        distTimer = 0.4;
        refreshDist(m.body);
      }
    } else {
      deselect();
    }
  }
}

// dev/verification handle
export function holonavDebug() {
  return {
    isOpen: () => open,
    markerCount: () => [...markers.values()].filter((m) => m.group.visible).length,
    selected: () => selectedId,
    select(id) {
      const b = getBodies().find((x) => x.id === id);
      if (b) select(b);
      return !!b;
    },
    engage,
  };
}
