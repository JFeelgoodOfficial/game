// The aft patio — the ship upgrade Baron Rynva fits in exchange for a piece of
// ember ore (the Emberdeep quest on rustia; src/mineWalk.js, inventory.js
// UPGRADES.patio).
//
// An open deck off the stern lounge: step through a doorway cut in the stern
// window and you are outside, under nothing at all. It needs no rendering
// trick of its own. The interior is an overlay scene drawn over the finished,
// lensed world (see src/interior.js) — wherever the interior has no geometry
// the real space scene shows — so a deck with a rail and no roof IS a view of
// everything: planets, the sun, nebulae, rings, the starfield, all live.
//
// interior.js owns the walker and the collision list; this module only
// contributes geometry and a few obstacle boxes, and reports where the deck
// ends. It is built once at init and merely shown/hidden, so owning the
// upgrade never rebuilds anything, and every light here is an emissive mesh
// or a constant-count point light (intensity 0 while closed) so no shader
// program recompiles when the door opens.
//
// Frame: ship-local metres, the interior's — -z is the nose, the deck runs
// aft from the stern wall, the floor is at y = F.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const PATIO_LEN = 7.6; // stern wall to the aft rail
const DOOR_HW = 1.36; // the doorway: the centre bay of the stern window
const RAIL_H = 1.08;

/**
 * @param o { group, MATS, glassMat, F, HW, AFT_Z, ROOF_Y, solid }
 *   group    interior root (rides the ship)
 *   MATS     interior materials (wall / floor / deck / trim / bench / strip)
 *   solid    (x0, x1, z0, z1) registers an obstacle box with the interior
 */
export function buildPatio(o) {
  const { group, MATS, glassMat, F, HW, AFT_Z, ROOF_Y, solid } = o;
  const Z0 = AFT_Z + 0.1; // outer face of the stern wall
  const Z1 = AFT_Z + PATIO_LEN;

  // What the CLOSED stern has in the doorway: the sill and the centre pane.
  const closed = new THREE.Group();
  {
    const sill = new THREE.BoxGeometry(DOOR_HW * 2, -0.7 - F, 0.1);
    sill.translate(0, (F - 0.7) / 2, AFT_Z + 0.05);
    closed.add(new THREE.Mesh(sill, MATS.wall));
    const pane = new THREE.PlaneGeometry(DOOR_HW * 2, 3.8);
    pane.translate(0, 1.2, AFT_Z + 0.05);
    const pm = new THREE.Mesh(pane, glassMat);
    pm.renderOrder = 2;
    closed.add(pm);
  }
  group.add(closed);

  // Everything that exists only once the upgrade is fitted.
  const deck = new THREE.Group();
  deck.name = 'aft-patio';
  deck.visible = false;
  group.add(deck);

  const P = {};
  const box = (mat, x0, x1, y0, y1, z0, z1) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    (P[mat] ||= []).push(g);
  };
  const boxes = (mat, x0, x1, y0, y1, z0, z1) => {
    box(mat, x0, x1, y0, y1, z0, z1);
    box(mat, -x1, -x0, y0, y1, z0, z1);
  };
  const glass = [];
  const pane = (g) => glass.push(g);

  // ---- the doorway: threshold, a proper frame, a lit header --------------
  box('trim', -DOOR_HW, DOOR_HW, F, F + 0.04, AFT_Z - 0.08, Z0 + 0.12);
  boxes('trim', DOOR_HW - 0.02, DOOR_HW + 0.1, F, 3.1, AFT_Z - 0.06, Z0 + 0.1);
  box('trim', -DOOR_HW - 0.1, DOOR_HW + 0.1, 2.25, 3.1, AFT_Z - 0.04, Z0 + 0.06); // transom
  box('amber', -0.9, 0.9, 2.19, 2.25, AFT_Z + 0.0, Z0 + 0.02); // light over the door

  // ---- the deck ----------------------------------------------------------
  box('deck', -HW - 0.1, HW + 0.1, F - 0.22, F - 0.04, Z0, Z1 + 0.12);
  // boards laid athwartships on the plate, a hair apart
  for (let z = Z0 + 0.02; z < Z1; z += 0.42) {
    box('bench', -HW + 0.14, HW - 0.14, F - 0.04, F, z, Math.min(z + 0.4, Z1));
  }
  // a toe-kerb with a light strip let into it, all the way round
  boxes('trim', HW - 0.14, HW + 0.1, F - 0.04, F + 0.12, Z0, Z1 + 0.12);
  box('trim', -HW - 0.1, HW + 0.1, F - 0.04, F + 0.12, Z1 - 0.02, Z1 + 0.12);
  boxes('strip', HW - 0.16, HW - 0.14, F + 0.03, F + 0.07, Z0 + 0.3, Z1 - 0.2);
  box('strip', -HW + 0.3, HW - 0.3, F + 0.03, F + 0.07, Z1 - 0.04, Z1 - 0.02);

  // ---- the rail: posts, a broad cap to lean on, glass below it ----------
  const RY = F + RAIL_H;
  for (let z = Z0 + 0.5; z <= Z1 + 0.01; z += 1.42) {
    boxes('trim', HW - 0.07, HW + 0.01, F, RY, z - 0.04, z + 0.04);
  }
  for (let x = -HW + 1.0; x <= HW - 0.99; x += 1.33) {
    box('trim', x - 0.04, x + 0.04, F, RY, Z1 + 0.0, Z1 + 0.08);
  }
  boxes('bench', HW - 0.13, HW + 0.07, RY, RY + 0.06, Z0, Z1 + 0.14);
  box('bench', -HW - 0.07, HW + 0.07, RY, RY + 0.06, Z1 - 0.06, Z1 + 0.14);
  for (const sx of [-1, 1]) {
    const g = new THREE.PlaneGeometry(Z1 - Z0, RAIL_H - 0.16);
    g.rotateY(Math.PI / 2);
    g.translate(sx * (HW - 0.03), F + 0.12 + (RAIL_H - 0.16) / 2, (Z0 + Z1) / 2);
    pane(g);
  }
  {
    const g = new THREE.PlaneGeometry(HW * 2, RAIL_H - 0.16);
    g.translate(0, F + 0.12 + (RAIL_H - 0.16) / 2, Z1 + 0.04);
    pane(g);
  }

  // ---- two lamp standards at the aft corners ----------------------------
  for (const sx of [-1, 1]) {
    const x = sx * (HW - 0.45);
    box('trim', x - 0.05, x + 0.05, F, F + 2.3, Z1 - 0.5, Z1 - 0.4);
    box('trim', x - 0.16, x + 0.16, F + 2.3, F + 2.34, Z1 - 0.61, Z1 - 0.29);
    box('amber', x - 0.1, x + 0.1, F + 2.08, F + 2.3, Z1 - 0.55, Z1 - 0.35);
    solid(x - 0.12, x + 0.12, Z1 - 0.57, Z1 - 0.33);
  }

  // ---- somewhere to sit: a long bench against the stern wall, facing aft,
  // and two loungers angled at the view --------------------------------
  for (const sx of [-1, 1]) {
    const x0 = sx > 0 ? DOOR_HW + 0.7 : -HW + 0.5, x1 = sx > 0 ? HW - 0.5 : -DOOR_HW - 0.7;
    box('trim', x0, x1, F, F + 0.34, Z0 + 0.06, Z0 + 0.6);
    box('bench', x0 - 0.04, x1 + 0.04, F + 0.34, F + 0.44, Z0 + 0.04, Z0 + 0.68);
    box('bench', x0 - 0.04, x1 + 0.04, F + 0.44, F + 0.95, Z0 + 0.02, Z0 + 0.12);
    solid(x0 - 0.04, x1 + 0.04, Z0, Z0 + 0.68);
  }
  for (const sx of [-1, 1]) {
    const x = sx * 2.3, z = Z1 - 2.6;
    box('trim', x - 0.36, x + 0.36, F, F + 0.28, z - 0.9, z + 0.9);
    box('bench', x - 0.4, x + 0.4, F + 0.28, F + 0.38, z - 0.95, z + 0.95);
    box('bench', x - 0.4, x + 0.4, F + 0.38, F + 0.9, z - 0.95, z - 0.82); // head end, toward the door
    solid(x - 0.4, x + 0.4, z - 0.95, z + 0.95);
  }
  // a low table between them, with something warm on it: the Baron's fitters
  // left a sliver of the ore that paid for all this
  box('trim', -0.5, 0.5, F, F + 0.4, Z1 - 3.1, Z1 - 2.1);
  box('bench', -0.56, 0.56, F + 0.4, F + 0.45, Z1 - 3.16, Z1 - 2.04);
  solid(-0.56, 0.56, Z1 - 3.16, Z1 - 2.04);

  // ---- the hull around the door: a canopy lip, and the engine cowls below
  // and outboard, so the deck sits ON a ship rather than floating --------
  box('wall', -HW - 0.1, HW + 0.1, ROOF_Y - 0.05, ROOF_Y + 0.14, Z0, Z0 + 0.9);
  box('strip', -HW + 0.4, HW - 0.4, ROOF_Y - 0.08, ROOF_Y - 0.05, Z0 + 0.3, Z0 + 0.36);
  boxes('wall', HW + 0.1, HW + 1.5, F - 2.6, F - 0.1, Z0 - 3, Z1 + 1.0);
  box('wall', -HW - 0.1, HW + 0.1, F - 2.6, F - 0.22, Z0 - 0.5, Z0 + 2.2);

  const MAT = {
    ...MATS,
    // HDR, above the interior pass's bloom threshold on purpose: the deck
    // lamps are the only things out here meant to glow.
    amber: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.82, 0.38) }),
  };
  for (const k of Object.keys(P)) {
    deck.add(new THREE.Mesh(mergeGeometries(P[k], false), MAT[k]));
    for (const g of P[k]) g.dispose();
  }
  const gm = new THREE.Mesh(mergeGeometries(glass, false), glassMat);
  gm.renderOrder = 2;
  deck.add(gm);
  for (const g of glass) g.dispose();

  // the ember sliver on the table
  const emberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.5, 0.1) });
  const ember = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), emberMat);
  ember.scale.set(1, 1.7, 1);
  ember.position.set(0, F + 0.61, Z1 - 2.6);
  deck.add(ember);

  // engine bells under the quarters: a ring, a white-blue throat, a soft plume
  const plumes = [];
  for (const sx of [-1, 1]) {
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.7, 2.4, 20, 1, true), MATS.trim);
    bell.rotation.x = Math.PI / 2;
    bell.position.set(sx * (HW + 0.8), F - 1.5, Z1 + 1.9);
    deck.add(bell);
    const throat = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 20),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 2.2, 3.4) })
    );
    throat.position.set(sx * (HW + 0.8), F - 1.5, Z1 + 2.6);
    deck.add(throat);
    const plume = new THREE.Mesh(
      new THREE.ConeGeometry(0.85, 7, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.35, 0.6, 1.0), transparent: true, opacity: 0.32,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    plume.rotation.x = Math.PI / 2; // apex aft
    plume.position.set(sx * (HW + 0.8), F - 1.5, Z1 + 6.4);
    deck.add(plume);
    plumes.push(plume);
  }

  // One warm light over the deck so faces and boards are not lit by ambient
  // alone on the night side. Always in the scene (constant light count);
  // dark while the door is shut.
  const lamp = new THREE.PointLight(0xffc890, 0, 12, 1.6);
  lamp.position.set(0, F + 2.4, Z1 - 1.6);
  group.add(lamp);

  let open = false;
  function setOpen(on) {
    open = !!on;
    deck.visible = open;
    closed.visible = !open;
    lamp.intensity = open ? 7 : 0;
  }

  function update(t) {
    if (!open) return;
    const f = 0.9 + 0.1 * Math.sin(t * 9.0) * Math.sin(t * 2.3);
    for (const p of plumes) p.material.opacity = 0.3 * f;
    ember.rotation.y = t * 0.5;
  }

  return {
    setOpen,
    update,
    get open() { return open; },
    doorHalf: DOOR_HW,
    z0: Z0,
    z1: Z1, // the aft rail: the walker's limit is this minus its radius
    railH: RAIL_H,
  };
}
