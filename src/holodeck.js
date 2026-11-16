// The holodeck: a ship upgrade (src/inventory.js UPGRADES.holodeck), given by
// the worldship once it has fed twice (src/tenretni.js). One of the gallery's
// starboard windows becomes a doorway into a bare gridded room with a panel on
// its far wall; the panel (src/holoPanel.js) starts a program, and game.js
// puts the pilot on foot in a world the worldship has taken out of space.
//
// Built the way the aft patio is (src/patio.js): geometry and obstacles only,
// interior.js owns the walker. Until the upgrade is owned the bay is the
// window it always was (`closed`); owning it swaps that for the opening and
// the room (`room`). Every surface in the room is unlit, so opening it adds no
// light and recompiles nothing.

import * as THREE from 'three';

const DEPTH = 6.9; // how far the room runs out from the hall wall
const HALF = 4; // half its length along the ship

function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#050607';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#e8b420';
  g.lineWidth = 5;
  g.strokeRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(232,180,32,0.25)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function panelTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = '#031014';
  g.fillRect(0, 0, 512, 320);
  g.strokeStyle = '#35ff8a';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 496, 304);
  g.fillStyle = '#35ff8a';
  g.font = 'bold 54px monospace';
  g.textAlign = 'center';
  g.fillText('HOLODECK', 256, 120);
  g.font = '28px monospace';
  g.fillStyle = '#9fffd0';
  g.fillText('ASSIMILATED WORLDS', 256, 180);
  g.fillText('E — CHOOSE PROGRAM', 256, 250);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// o: { group, MATS, glassMat, F, HW, ROOF_Y, solid, Z0, Z1 } — the doorway is
// the window bay Z0..Z1 on the +x wall.
export function buildHolodeck(o) {
  const { group, MATS, glassMat, F, HW, ROOF_Y, solid, Z0, Z1 } = o;
  const zc = (Z0 + Z1) / 2;
  const X0 = HW + 0.1;
  const X1 = X0 + DEPTH;
  const za = zc - HALF, zb = zc + HALF;

  // --- shut: the window this bay always had ---
  const closed = new THREE.Group();
  const sill = new THREE.Mesh(new THREE.BoxGeometry(0.1, -0.8 - F, Z1 - Z0), MATS.wall);
  sill.position.set(HW + 0.05, (F - 0.8) / 2, zc);
  closed.add(sill);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(Z1 - Z0, 4.0).rotateY(Math.PI / 2), glassMat);
  pane.position.set(HW + 0.05, 1.2, zc);
  pane.renderOrder = 2;
  closed.add(pane);
  group.add(closed);

  // --- open: the room ---
  const room = new THREE.Group();
  room.visible = false;
  const tex = gridTexture();
  const wall = (w, h, rep) => {
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(rep[0], rep[1]);
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
  };
  const H = ROOF_Y - F;
  const yMid = (F + ROOF_Y) / 2;
  const add = (m, x, y, z, rx, ry) => {
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    room.add(m);
  };
  add(wall(DEPTH, 2 * HALF, [7, 8]), (X0 + X1) / 2, F + 0.002, zc, -Math.PI / 2, 0); // floor
  add(wall(DEPTH, 2 * HALF, [7, 8]), (X0 + X1) / 2, ROOF_Y, zc, Math.PI / 2, 0); // ceiling
  add(wall(2 * HALF, H, [8, 5]), X1, yMid, zc, 0, -Math.PI / 2); // far wall
  add(wall(DEPTH, H, [7, 5]), (X0 + X1) / 2, yMid, za, 0, 0);
  add(wall(DEPTH, H, [7, 5]), (X0 + X1) / 2, yMid, zb, 0, Math.PI);
  // the hall side, either side of the door and above it
  add(wall(Z0 - za, H, [3.5, 5]), X0, yMid, (za + Z0) / 2, 0, Math.PI / 2);
  add(wall(zb - Z1, H, [3.5, 5]), X0, yMid, (Z1 + zb) / 2, 0, Math.PI / 2);
  add(wall(Z1 - Z0, ROOF_Y - 3.2, [2, 0.6]), X0, (3.2 + ROOF_Y) / 2, zc, 0, Math.PI / 2);
  // door frame
  const frameMat = new THREE.MeshBasicMaterial({ color: 0xe8b420 });
  for (const z of [Z0 + 0.05, Z1 - 0.05]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.2 - F, 0.1), frameMat);
    post.position.set(HW + 0.05, (F + 3.2) / 2, z);
    room.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, Z1 - Z0), frameMat);
  lintel.position.set(HW + 0.05, 3.2, zc);
  room.add(lintel);
  // the panel
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.2).rotateY(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: panelTexture() })
  );
  panel.material.color.setScalar(1.25);
  panel.position.set(X1 - 0.04, 0.55, zc);
  room.add(panel);
  group.add(room);

  // the room's own walls (the hall wall's boxes are interior.js's)
  solid(HW + 1.3, X1 + 1, za - 1, za);
  solid(HW + 1.3, X1 + 1, zb, zb + 1);
  solid(X1, X1 + 1, za - 1, zb + 1);

  const api = {
    open: false,
    xMax: X1,
    panel: { x: X1 - 1.3, z: zc },
    setOpen(v) {
      api.open = v;
      closed.visible = !v;
      room.visible = v;
    },
  };
  return api;
}
