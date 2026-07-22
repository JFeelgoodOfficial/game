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
import { C } from './constants.js';

const CYAN = 0x82f7ff,
  PINK = 0xffc9ec,
  GOLD = 0xffd27a;
const HOLO_R = 0.8; // chart edge radius, prototype units (pre rig-scale)
const MAX_RANGE = 160000; // world units mapped to the chart edge

let holo, chart, shipCone, promptGroup, engageProxy, reticle;
let arrowCurve, arrowHead, sunHalo;
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

// A soft round glow texture (radial alpha falloff), so glow sprites read as
// halos rather than hard squares. Built once, shared.
let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.28, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

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
  holo.position.set(0, 1.44, -0.25);
  holo.scale.setScalar(0.001);
  holo.visible = false;
  shell.add(holo);

  // The chart plane, tilted toward the pilot so the range/orbit rings read as
  // an angled orrery (like the reference) rather than a flat top-down disc.
  // Markers, the sun, rings and the course arrow all live here; the info panel
  // stays upright (added straight to `holo`) so its readouts face the pilot.
  chart = new THREE.Group();
  chart.rotation.x = -0.42;
  holo.add(chart);

  // upward emitter beam — a faint cone of light widening from the projector to
  // the chart, so the hologram reads as projected from the console.
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(HOLO_R * 0.95, 1.35, 44, 1, true),
    new THREE.MeshBasicMaterial({
      color: CYAN,
      transparent: true,
      opacity: 0.045,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  beam.position.y = -0.675;
  holo.add(beam);

  // base disc + orbit rings at 1k / 10k / 100k (sqrt-compressed radii)
  const base = new THREE.Mesh(
    new THREE.CircleGeometry(HOLO_R, 64),
    new THREE.MeshBasicMaterial({ color: 0x0a2230, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending })
  );
  base.rotation.x = -Math.PI / 2;
  chart.add(base);
  // several orbit rings so the chart reads as an orrery; alternate cyan/gold
  const ringDists = [1200, 6000, 20000, 55000, 130000];
  ringDists.forEach(function (d, i) {
    chart.add(ring(HOLO_R * Math.sqrt(d / MAX_RANGE), i % 2 ? GOLD : CYAN, 0.34));
  });

  // central holographic star — the orrery's sun: a bright core, a soft gold
  // halo, and a light so nearby markers catch a warm rim.
  const sunCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.038, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff0c8 })
  );
  chart.add(sunCore);
  sunHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture(), color: GOLD, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthTest: false })
  );
  sunHalo.scale.setScalar(0.22);
  chart.add(sunHalo);
  chart.add(new THREE.PointLight(GOLD, 0.4, 1.4, 2));

  // ship heading marker, just above the sun (current position + nose heading)
  shipCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.028, 0.08, 3),
    new THREE.MeshBasicMaterial({ color: PINK })
  );
  shipCone.rotation.x = Math.PI / 2; // lay the cone flat, nose along -Z
  chart.add(shipCone);

  // selection reticle, hidden until something is picked
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.03, 0.042, 28),
    new THREE.MeshBasicMaterial({ color: PINK, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  reticle.rotation.x = -Math.PI / 2;
  reticle.visible = false;
  chart.add(reticle);

  // course arrow: a glowing cyan curve from the sun to the target with a cone
  // head, rebuilt each frame in updateHolonav — the travel path in the ref.
  arrowCurve = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending })
  );
  arrowCurve.visible = false;
  chart.add(arrowCurve);
  arrowHead = new THREE.Mesh(
    new THREE.ConeGeometry(0.028, 0.075, 18),
    new THREE.MeshBasicMaterial({ color: CYAN })
  );
  arrowHead.visible = false;
  chart.add(arrowHead);

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
  // counter the chart tilt so the readout panel faces the pilot upright
  promptGroup.rotation.x = 0.42;
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.44),
    new THREE.MeshBasicMaterial({ color: 0x061820, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  promptGroup.add(bg);
  // top border strip, so the panel reads as a framed readout like the ref
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.012),
    new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  strip.position.set(0, 0.216, 0.005);
  promptGroup.add(strip);
  // the ENGAGE hit-proxy: an invisible plane that still raycasts
  engageProxy = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.1),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  engageProxy.position.set(0, -0.15, 0.01);
  engageProxy.userData.engage = true;
  promptGroup.add(engageProxy);
  chart.add(promptGroup);
}

// A warp-time flavor ETA from the distance and the ship's warp speed.
function etaText(d) {
  const secs = d / C.WARP_SPEED;
  if (secs < 1) return '<1 SEC';
  if (secs < 60) return `${Math.round(secs)} SEC`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m} MIN ${s} SEC`;
}

function distText(d) {
  return d >= 1000 ? `${(d / 1000).toFixed(1)}k U` : `${Math.round(d)} U`;
}

// Rebuilt on selection; the distance / ETA lines refresh on a throttle.
let promptLabels = [];
function fillPrompt(body) {
  for (const l of promptLabels) promptGroup.remove(l);
  promptLabels = [];
  const dest = label('DESTINATION', CYAN, 0.2);
  dest.position.set(0, 0.16, 0.02);
  const name = label(body.label, body.color, 0.44);
  name.position.set(0, 0.075, 0.02);
  promptLabels.push(dest, name);
  promptGroup.add(dest, name);
  const eng = label('[ ENGAGE ]', PINK, 0.34);
  eng.position.set(0, -0.15, 0.02);
  promptLabels.push(eng);
  promptGroup.add(eng);
  refreshDist(body);
}

let distLabel = null,
  etaLabel = null;
function refreshDist(body) {
  for (const l of [distLabel, etaLabel]) {
    if (!l) continue;
    promptGroup.remove(l);
    const i = promptLabels.indexOf(l);
    if (i >= 0) promptLabels.splice(i, 1);
  }
  const d = _rel.subVectors(body.pos, currentShipPos).length();
  distLabel = label(`DIST  ${distText(d)}`, CYAN, 0.34);
  distLabel.position.set(0, -0.01, 0.02);
  etaLabel = label(`ETA  ${etaText(d)}`, GOLD, 0.32);
  etaLabel.position.set(0, -0.08, 0.02);
  promptLabels.push(distLabel, etaLabel);
  promptGroup.add(distLabel, etaLabel);
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
      new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthTest: false })
    );
    mesh.scale.setScalar(0.07);
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

  chart.add(group);
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
  arrowCurve.visible = true;
  arrowHead.visible = true;
  promptGroup.visible = true;
  fillPrompt(body);
  rebuildPickTargets();
}

function deselect() {
  selectedId = null;
  reticle.visible = false;
  arrowCurve.visible = false;
  arrowHead.visible = false;
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

  // selection follow: reticle, prompt, and the curved cyan course arrow
  if (selectedId) {
    const m = markers.get(selectedId);
    if (m && m.group.visible) {
      reticle.position.copy(m.group.position);
      // fixed readout panel to the upper-right of the chart (like the ref's
      // corner readouts) so it never washes into the central star
      promptGroup.position.set(HOLO_R * 0.95, 0.5, -HOLO_R * 0.1);
      updateArrow(m.group.position);
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

// Build the glowing course arrow: a quadratic curve bowed above the chart from
// the sun out to the target, with the cone head sitting at the target end and
// aimed along the final tangent — the reference's sweeping travel path.
const _a0 = new THREE.Vector3();
const _a1 = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _at = new THREE.Vector3();
function updateArrow(targetPos) {
  _a0.set(0, 0.01, 0); // start at the sun
  _a1.copy(targetPos);
  const len = _a1.length();
  // control point: midway, lifted above the plane and nudged sideways so the
  // path bows like the reference rather than running dead straight
  _ac.set((_a0.x + _a1.x) / 2 - _a1.z * 0.18, 0.01 + len * 0.32, (_a0.z + _a1.z) / 2 + _a1.x * 0.18);
  const N = 26;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = 1 - t;
    pts.push(
      new THREE.Vector3(
        u * u * _a0.x + 2 * u * t * _ac.x + t * t * _a1.x,
        u * u * _a0.y + 2 * u * t * _ac.y + t * t * _a1.y,
        u * u * _a0.z + 2 * u * t * _ac.z + t * t * _a1.z
      )
    );
  }
  arrowCurve.geometry.setFromPoints(pts);
  const end = pts[N];
  const prev = pts[N - 1];
  arrowHead.position.copy(end);
  _at.subVectors(end, prev).normalize();
  arrowHead.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _at);
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
