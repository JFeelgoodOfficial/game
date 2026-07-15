// Game menu + hull-stress UI (user mechanics — deliberate overrides of the
// GDD's "no menus" (3.3) and "no death" (1.2), at the user's request).
// All DOM: the menu overlay (start / ship-lost states), the heat vignette,
// the runtime-generated canopy cracks, and the explosion flash.

const CSS = `
#menu {
  position: fixed; inset: 0; z-index: 30;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 28px; background: radial-gradient(ellipse at center, rgba(8,2,14,0.25), rgba(4,0,10,0.78));
  font-family: 'Courier New', ui-monospace, monospace; color: #a9f7ff;
  transition: opacity 0.5s; user-select: none;
}
#menu.hidden { opacity: 0; pointer-events: none; }
#menu h1 {
  margin: 0; font-size: clamp(20px, 3.4vw, 42px); letter-spacing: 0.34em;
  font-weight: 400; text-align: center; max-width: 92vw;
  color: #ffc9ec; text-shadow: 0 0 18px rgba(212,64,143,0.8), 0 0 40px rgba(212,64,143,0.4);
}
#menu .sub {
  font-size: 13px; letter-spacing: 0.28em; color: #7ad7e0;
  text-shadow: 0 0 8px rgba(130,247,255,0.5);
}
#menu .dead { color: #ff7a6a; text-shadow: 0 0 12px rgba(255,80,60,0.7); }
#menu button {
  font: inherit; font-size: 15px; letter-spacing: 0.3em; padding: 13px 46px;
  background: rgba(212,64,143,0.12); color: #ffc9ec; cursor: pointer;
  border: 1px solid rgba(212,64,143,0.55); border-radius: 4px;
  text-shadow: 0 0 8px rgba(255,120,200,0.6);
  box-shadow: 0 0 22px rgba(212,64,143,0.25), inset 0 0 18px rgba(212,64,143,0.08);
  transition: background 0.2s, box-shadow 0.2s;
}
#menu button:hover {
  background: rgba(212,64,143,0.3);
  box-shadow: 0 0 34px rgba(212,64,143,0.5), inset 0 0 24px rgba(212,64,143,0.15);
}
#heatVignette {
  position: fixed; inset: 0; z-index: 8; pointer-events: none; opacity: 0;
  background: radial-gradient(ellipse at center,
    rgba(255,40,0,0) 42%, rgba(255,60,10,0.55) 78%, rgba(255,30,0,0.85) 100%);
}
#cracks { position: fixed; inset: 0; z-index: 9; pointer-events: none; opacity: 0; }
#flash {
  position: fixed; inset: 0; z-index: 28; pointer-events: none; opacity: 0;
  background: radial-gradient(ellipse at center, #fff7e8 0%, #ffb347 45%, rgba(255,80,20,0.9) 100%);
}
`;

let menu, title, sub, button, vignette, cracks, flash;
let onLaunch = null;

function el(tag, id, parent) {
  const e = document.createElement(tag);
  if (id) e.id = id;
  (parent || document.body).appendChild(e);
  return e;
}

// deterministic PRNG for the crack pattern
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function crackSVG() {
  const rnd = mulberry32(1337);
  let paths = '';
  const impacts = [
    [34 + rnd() * 8, 30 + rnd() * 10],
    [68 + rnd() * 8, 55 + rnd() * 10],
  ];
  for (const [ix, iy] of impacts) {
    const rays = 6 + Math.floor(rnd() * 3);
    for (let r = 0; r < rays; r++) {
      const ang = (r / rays) * Math.PI * 2 + rnd() * 0.7;
      let x = ix, y = iy, d = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      const segs = 4 + Math.floor(rnd() * 4);
      let len = 3 + rnd() * 5;
      let a = ang;
      for (let s = 0; s < segs; s++) {
        a += (rnd() - 0.5) * 0.9;
        x += Math.cos(a) * len;
        y += Math.sin(a) * len * 0.7;
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
        len *= 0.85;
      }
      const w = (0.28 - r * 0.02).toFixed(2);
      paths += `<path d="${d}" stroke="rgba(235,245,255,0.8)" stroke-width="${w}" fill="none"/>`;
      paths += `<path d="${d}" stroke="rgba(120,160,200,0.35)" stroke-width="${(w * 3).toFixed(2)}" fill="none"/>`;
    }
    // impact star
    paths += `<circle cx="${ix}" cy="${iy}" r="0.7" fill="rgba(255,255,255,0.9)"/>`;
  }
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">${paths}</svg>`;
}

export function initMenu(launchCallback) {
  onLaunch = launchCallback;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  vignette = el('div', 'heatVignette');
  cracks = el('div', 'cracks');
  cracks.innerHTML = crackSVG();
  flash = el('div', 'flash');

  menu = el('div', 'menu');
  title = el('h1', null, menu);
  title.textContent = 'FEELGOOD SPACE FLIGHT';
  sub = el('div', null, menu);
  sub.className = 'sub';
  button = el('button', null, menu);
  button.addEventListener('click', () => onLaunch && onLaunch());

  showMenu('start');
}

export function showMenu(mode) {
  if (mode === 'dead') {
    sub.textContent = 'HULL BURNED THROUGH — SHIP LOST';
    sub.className = 'sub dead';
    button.textContent = 'FLY AGAIN';
  } else {
    sub.textContent = 'W/S THRUST · MOUSE STEER · SHIFT BOOST · SPACE BRAKE';
    sub.className = 'sub';
    button.textContent = 'LAUNCH';
  }
  menu.classList.remove('hidden');
  document.exitPointerLock?.();
}

export function hideMenu() {
  menu.classList.add('hidden');
}

// heat: 0..1; crackAt: threshold; flashAmt: 0..1 explosion flash
export function updateHeatUI(heat, crackAt, flashAmt) {
  vignette.style.opacity = Math.min(heat * 1.1, 1).toFixed(3);
  cracks.style.opacity = heat >= crackAt ? '1' : '0';
  flash.style.opacity = Math.min(Math.max(flashAmt, 0), 1).toFixed(3);
}
