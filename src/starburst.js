// Central star-flare for the spiral nebula (owner request — match the painting's
// blazing four-point core). The engine's post chain gives only soft radial bloom
// (no diffraction spikes), so the cross is drawn explicitly: a CanvasTexture with
// a hot core plus four tapered spokes, rendered as an additive, un-tonemapped
// THREE.Sprite. A Sprite auto-billboards toward the camera, so no per-frame code
// is needed; toneMapped:false lets the bright core feed the bloom pass like the
// sun (cf. src/sun.js). Baked once at init.

import * as THREE from 'three';

// A soft four-point star painted into a square canvas: a bright round core plus
// four long tapered rays (up/down/left/right) and four short faint diagonal
// glints. Everything is soft-edged (blurred, additive 'lighter') so it reads as
// glowing light, never a mechanical reticle. Returns a THREE.CanvasTexture.
function makeStarburstTexture(tint = 0xfff2d8) {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const c = new THREE.Color(tint);
  const rgb = `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`;
  const mid = S / 2;

  ctx.clearRect(0, 0, S, S);
  ctx.translate(mid, mid);
  ctx.globalCompositeOperation = 'lighter';

  // Bright round core glow (dominant, soft).
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, S * 0.26);
  core.addColorStop(0.0, 'rgba(255,255,255,1)');
  core.addColorStop(0.18, `rgba(${rgb}, 0.9)`);
  core.addColorStop(0.55, `rgba(${rgb}, 0.28)`);
  core.addColorStop(1.0, `rgba(${rgb}, 0)`);
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, S * 0.26, 0, Math.PI * 2);
  ctx.fill();

  // A single ray: a soft bar that is brightest at the core and tapers to nothing
  // at the tip. Blurred so its long edges are feathered, not hard.
  const drawRay = (angle, len, halfWidth, alpha, blur) => {
    ctx.save();
    ctx.rotate(angle);
    ctx.filter = `blur(${blur}px)`;
    const grad = ctx.createLinearGradient(0, 0, len, 0);
    grad.addColorStop(0.0, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(0.1, `rgba(${rgb}, ${alpha * 0.85})`);
    grad.addColorStop(0.5, `rgba(${rgb}, ${alpha * 0.3})`);
    grad.addColorStop(1.0, `rgba(${rgb}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, -halfWidth, len, halfWidth * 2);
    ctx.restore();
  };
  // Long primary cross (N/E/S/W).
  for (let k = 0; k < 4; k++) drawRay((Math.PI / 2) * k, mid * 0.96, 3, 0.95, 2.2);
  // Short, faint diagonal glints.
  for (let k = 0; k < 4; k++) drawRay((Math.PI / 2) * k + Math.PI / 4, mid * 0.5, 2, 0.4, 2.2);
  ctx.filter = 'none';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A plain soft round glow painted into a canvas — the core's halo. Rendered as a
// Sprite (not a sphere) so it reads as an even soft glow; an additive transparent
// SPHERE would rim-brighten at its silhouette and draw an ugly ring.
function makeGlowTexture(tint = 0xffcf94) {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const c = new THREE.Color(tint);
  const rgb = `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`;
  const mid = S / 2;
  const g = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
  g.addColorStop(0.0, `rgba(${rgb}, 0.9)`);
  g.addColorStop(0.3, `rgba(${rgb}, 0.4)`);
  g.addColorStop(0.7, `rgba(${rgb}, 0.08)`);
  g.addColorStop(1.0, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSprite(tex, size, opacity, renderOrder) {
  const mat = new THREE.SpriteMaterial({
    map: tex,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    opacity,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(size, size, 1);
  sprite.renderOrder = renderOrder;
  return sprite;
}

// The soft round halo glow around the core (Sprite, world-sized off haloR).
export function makeGlow(cfg) {
  const core = cfg.spiral.core;
  return makeSprite(makeGlowTexture(core.haloColor), core.haloR * 2.2, core.haloOpacity, 1);
}

// The four-point star flare at the core (Sprite, world-sized off coreR). Auto-
// billboards toward the camera, so no per-frame code is needed.
export function makeStarburst(cfg) {
  const core = cfg.spiral.core;
  const s = (cfg.spiral.flareScale || 6) * core.coreR;
  return makeSprite(makeStarburstTexture(core.coreColor), s, 1, 2);
}

// Generalized versions for any nebula (the painting nebulae's planetary /
// remnant cores). `color` is any THREE.Color arg (hex number, string, Color).
// `worldRadius` is the halo's on-screen radius in world units; the sprite is
// scaled to a diameter with the same soft-edge headroom makeGlow uses.
export function makeGlowSprite(color, worldRadius, opacity = 0.5) {
  return makeSprite(makeGlowTexture(color), worldRadius * 2.2, opacity, 1);
}

// A four-point flare sized directly in world units (unlike makeStarburst,
// which multiplies a config coreR). For hot central stars of dying-star nebulae.
export function makeStarburstSprite(color, worldSize, opacity = 1) {
  return makeSprite(makeStarburstTexture(color), worldSize, opacity, 2);
}
