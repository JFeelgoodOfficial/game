// ---------------------------------------------------------------------------
// Cockpit destination menu — the drop-down beside the NAV button.
//
// The hologram (holonav.js) is a spatial chart: you find a body by looking for
// it. This is the index to that chart — three categories (PLANETS, NEBULAS,
// STATIONS), each expanding into a tappable list that engages the autopilot
// straight at the pick.
//
// It lives in the cockpit scene rather than the DOM because it belongs to the
// dash: the hologram and the buttons are already raycast in-canvas, and
// cockpit3d.js's beginAt() gives it mouse and touch for free.
//
// Two rules it inherits from its neighbours:
//   - Discovery gating is absolute. nav.js hides unlogged bodies completely,
//     so an undiscovered world must not appear here even greyed out.
//   - No glow. Everything on the dash is flat and under the bloom threshold
//     (see cockpit3d.js makeButton); only the wheel and the hologram glow.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { getBodies, isLogged } from './nav.js';
import { startAutoWarp } from './autopilot.js';
import { toggleHolo } from './holonav.js';

const PANEL_W = 0.66;
const HEAD_H = 0.075;
const ROW_H = 0.062;
const GAP = 0.006;

const CATEGORIES = [
  { id: 'planets', title: 'PLANETS', color: '#8cffd1', kinds: ['planet', 'star', 'anomaly'] },
  { id: 'nebulas', title: 'NEBULAS', color: '#c9a0ff', kinds: ['nebula'] },
  { id: 'stations', title: 'STATIONS', color: '#82f7ff', kinds: ['station'] },
];

let root = null; // the whole panel, hidden when closed
let content = null; // rebuilt on every open/expand
let open = false;
let expanded = 'planets';
let hitTargets = [];
const owned = []; // textures/materials/geometries to free on rebuild

// A flat text plate: canvas texture on a plane, so it stays aligned with the
// angled panel instead of billboarding out of it like the hologram's sprites.
function textPlate(text, color, w, h, { bg, align = 'left', dim = false } = {}) {
  const px = 512;
  const c = document.createElement('canvas');
  c.width = px;
  c.height = Math.max(2, Math.round((px * h) / w));
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, c.width, c.height);
  }
  const fs = Math.round(c.height * 0.52);
  g.font = '700 ' + fs + 'px "Courier New", ui-monospace, monospace';
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.globalAlpha = dim ? 0.45 : 1;
  g.fillStyle = color;
  g.fillText(text, align === 'center' ? c.width / 2 : 26, c.height / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  owned.push(tex, mat, mesh.geometry);
  return mesh;
}

function plate(w, h, color, opacity) {
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthTest: false, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  owned.push(mat, mesh.geometry);
  return mesh;
}

function disposeContent() {
  if (!content) return;
  root.remove(content);
  for (const o of owned) o.dispose?.();
  owned.length = 0;
  content = null;
  hitTargets = [];
}

// Logged destinations for a category, nearest-first so the useful ones are on
// top. `kind` is set by nav.js buildBodies — never infer it from the boolean
// flags, since planets and the black hole both carry none.
function rowsFor(cat) {
  return getBodies()
    .filter((b) => cat.kinds.includes(b.kind) && isLogged(b.id))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function rebuild() {
  disposeContent();
  content = new THREE.Group();
  root.add(content);

  // Measure first so the backing plate wraps the real height.
  let bodyH = 0;
  const built = CATEGORIES.map((cat) => {
    const rows = expanded === cat.id ? rowsFor(cat) : null;
    bodyH += HEAD_H + GAP;
    if (rows) bodyH += Math.max(rows.length, 1) * (ROW_H + GAP);
    return { cat, rows };
  });

  const back = plate(PANEL_W + 0.04, bodyH + 0.09, 0x05090f, 0.82);
  back.position.z = -0.004;
  back.renderOrder = 10;
  content.add(back);
  const edge = plate(PANEL_W + 0.05, bodyH + 0.1, 0x2b3a46, 0.55);
  edge.position.z = -0.006;
  edge.renderOrder = 9;
  content.add(edge);

  const title = textPlate('WARP TO', '#7dffc8', PANEL_W, 0.05, { align: 'center' });
  title.position.set(0, bodyH / 2 + 0.028, 0);
  title.renderOrder = 12;
  content.add(title);

  let y = bodyH / 2 - HEAD_H / 2;
  let order = 12;
  for (const { cat, rows } of built) {
    const isOpen = expanded === cat.id;
    const head = plate(PANEL_W, HEAD_H, isOpen ? 0x1d3340 : 0x121a22, 0.95);
    head.position.set(0, y, 0);
    head.renderOrder = order++;
    content.add(head);
    const ht = textPlate(
      (isOpen ? '- ' : '+ ') + cat.title, cat.color, PANEL_W, HEAD_H, { align: 'left' }
    );
    ht.position.set(0, y, 0.001);
    ht.renderOrder = order++;
    content.add(ht);
    // Oversized invisible proxy: the same fat-finger trick the dash buttons use.
    const hit = new THREE.Mesh(
      new THREE.PlaneGeometry(PANEL_W, HEAD_H + 0.02),
      new THREE.MeshBasicMaterial({ visible: false, depthTest: false })
    );
    hit.position.set(0, y, 0.02);
    hit.userData = { navCat: cat.id };
    owned.push(hit.geometry, hit.material);
    content.add(hit);
    hitTargets.push(hit);
    y -= HEAD_H + GAP;

    if (!rows) continue;
    if (rows.length === 0) {
      const empty = textPlate('NO CONTACTS LOGGED', '#8fa3b0', PANEL_W - 0.04, ROW_H, { dim: true });
      empty.position.set(0.02, y, 0.001);
      empty.renderOrder = order++;
      content.add(empty);
      y -= ROW_H + GAP;
      continue;
    }
    for (const b of rows) {
      const rowBg = plate(PANEL_W - 0.04, ROW_H, 0x0b1219, 0.9);
      rowBg.position.set(0.02, y, 0);
      rowBg.renderOrder = order++;
      content.add(rowBg);
      const rt = textPlate('  ' + b.label, b.color, PANEL_W - 0.04, ROW_H);
      rt.position.set(0.02, y, 0.001);
      rt.renderOrder = order++;
      content.add(rt);
      const rhit = new THREE.Mesh(
        new THREE.PlaneGeometry(PANEL_W - 0.04, ROW_H + 0.016),
        new THREE.MeshBasicMaterial({ visible: false, depthTest: false })
      );
      rhit.position.set(0.02, y, 0.02);
      rhit.userData = { navBody: b };
      owned.push(rhit.geometry, rhit.material);
      content.add(rhit);
      hitTargets.push(rhit);
      y -= ROW_H + GAP;
    }
  }
}

// Parented to the cockpit shell so it rides the ship with the rest of the dash.
// Sits above the NAV button, angled in toward the pilot.
export function initNavMenu(shell) {
  root = new THREE.Group();
  // Above the NAV button and clear of the top button row, so the dash stays
  // fully tappable while the menu is up.
  root.position.set(1.34, 1.24, -0.12);
  root.rotation.set(-0.12, -0.34, 0);
  root.scale.setScalar(1.5);
  root.visible = false;
  shell.add(root);
}

export function setNavMenuOpen(v) {
  if (!root || v === open) return;
  open = v;
  root.visible = v;
  if (v) rebuild();
  else disposeContent();
}

export function isNavMenuOpen() {
  return open;
}

// Called from cockpit3d.js beginAt, between the hologram and the wheel.
export function navMenuPick(raycaster) {
  if (!open || !content) return false;
  const hits = raycaster.intersectObjects(hitTargets, false);
  if (!hits.length) return false;
  const u = hits[0].object.userData;
  if (u.navCat) {
    expanded = expanded === u.navCat ? null : u.navCat;
    rebuild();
    return true;
  }
  if (u.navBody) {
    engage(u.navBody);
    return true;
  }
  return false;
}

// Exactly what holonav's ENGAGE does: hand the body to the autopilot, which
// aligns then warps, and stand the nav UI down.
function engage(body) {
  toggleHolo(false);
  startAutoWarp(body);
}

// dev/verification handle
export function navMenuDebug() {
  return {
    isOpen: () => open,
    expanded: () => expanded,
    categories: () => CATEGORIES.map((c) => c.id),
    rows: (catId) => {
      const cat = CATEGORIES.find((c) => c.id === catId);
      return cat ? rowsFor(cat).map((b) => ({ id: b.id, label: b.label, kind: b.kind })) : null;
    },
    expand(catId) {
      expanded = catId;
      if (open) rebuild();
      return expanded;
    },
    tap(id) {
      for (const cat of CATEGORIES) {
        const b = rowsFor(cat).find((x) => x.id === id);
        if (b) { engage(b); return true; }
      }
      return false;
    },
  };
}
