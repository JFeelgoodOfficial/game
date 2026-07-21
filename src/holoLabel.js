// Shared canvas-texture label sprite for the 3D cockpit dashboard and the
// navigation hologram (cockpit3d.js, holonav.js). A small glowing monospace
// sprite that always faces the camera; depth-test off + additive so it reads
// as projected light rather than a painted decal.

import * as THREE from 'three';

function hex(h) {
  return '#' + h.toString(16).padStart(6, '0');
}

export function label(text, color, scale = 0.4) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.font = '600 64px "Courier New", ui-monospace, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const col = typeof color === 'number' ? hex(color) : color;
  g.shadowColor = col;
  g.shadowBlur = 22;
  g.fillStyle = col;
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
  );
  s.scale.set(scale, scale * 0.25, 1);
  return s;
}
