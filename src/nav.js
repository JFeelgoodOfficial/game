// Navigation console (user mechanic). A dashboard NAV button (or N) opens
// a holographic system chart — top-down, centred on the ship, square-root
// distance compression so terra (3.5k out) and the sun (150k out) share one
// screen. Nothing is charted until you've flown close enough that it fills
// the canopy: contacts log at close range and persist in localStorage.
// Undiscovered bodies are completely hidden — pure exploration, per the
// user's explicit choice.

import * as THREE from 'three';
import { C } from './constants.js';
import { planets } from './planet.js';
import { sun } from './sun.js';
import { blackhole } from './blackhole.js';
import { deepNebulae } from './deepnebula.js';
import { stations } from './stations.js';

const CSS = `
#navBtn {
  position: fixed; right: 18px; bottom: 22px; z-index: 12;
  padding: 11px 30px; cursor: pointer; user-select: none;
  font-family: 'Courier New', ui-monospace, monospace; font-size: 14px;
  letter-spacing: 0.34em; color: #a9f7ff;
  background: rgba(130,247,255,0.06); border: 1px solid rgba(130,247,255,0.5);
  border-radius: 4px; text-shadow: 0 0 8px rgba(130,247,255,0.7);
  box-shadow: 0 0 20px rgba(130,247,255,0.22), inset 0 0 16px rgba(130,247,255,0.06);
  transition: opacity 0.2s, background 0.15s;
}
#navBtn:hover { background: rgba(130,247,255,0.16); }
#navBtn.hidden { opacity: 0 !important; pointer-events: none; }
#navMap {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  z-index: 20; display: none; flex-direction: column; align-items: center;
  padding: 14px 16px 10px; border-radius: 6px; user-select: none;
  font-family: 'Courier New', ui-monospace, monospace; color: #a9f7ff;
  background: rgba(4,12,20,0.88); border: 1px solid rgba(130,247,255,0.55);
  box-shadow: 0 0 44px rgba(130,247,255,0.3), inset 0 0 30px rgba(130,247,255,0.06);
}
#navMap.open { display: flex; }
#navMap .n-title {
  font-size: 12px; letter-spacing: 0.42em; color: #7ad7e0; margin-bottom: 8px;
  text-shadow: 0 0 8px rgba(130,247,255,0.6);
}
#navMap .n-foot {
  font-size: 10px; letter-spacing: 0.26em; color: #5da8b3; margin-top: 8px;
}
#navToast {
  position: fixed; top: 20%; left: 50%; transform: translateX(-50%);
  z-index: 13; pointer-events: none; opacity: 0; transition: opacity 0.4s;
  font-family: 'Courier New', ui-monospace, monospace; font-size: 14px;
  letter-spacing: 0.34em; color: #7dffc8; padding: 8px 24px;
  border: 1px solid rgba(120,255,190,0.6); border-radius: 3px;
  background: rgba(4,30,20,0.55); text-shadow: 0 0 10px rgba(120,255,190,0.8);
}
`;

const STORE_KEY = 'fgsf.navlog';
const MAX_RANGE = 160000; // chart edge, world units (the sun sits inside it)

let btn, panel, canvas, ctx, foot, toast;
let open = false;
let flyActive = false;
let bodies = null; // built lazily after every module has init'd
let logged = new Set();
let checkTimer = 0;
let toastTimer = 0;

// localStorage can be unavailable (sandboxed iframe) — degrade to session-only
function loadLog() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) logged = new Set(JSON.parse(raw));
  } catch { /* session-only */ }
}
function saveLog() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...logged]));
  } catch { /* session-only */ }
}

const PLANET_COLORS = {
  terra: '#5fc76e', oceana: '#3f9dff', glacia: '#bfe8ff',
  rustia: '#ff8a5a', saturnia: '#e8c78a', neptunia: '#6a7dff',
  'wavemall prime': '#d4408f',
  shadowreach: '#cfcfd4',
};

function buildBodies() {
  bodies = [];
  for (const p of planets) {
    bodies.push({
      id: p.cfg.name,
      label: p.cfg.name.toUpperCase(),
      pos: p.group.position,
      dot: p.radius >= 2000 ? 7 : 5,
      logDist: p.radius * 4, // "fills the window" — a few radii out
      color: PLANET_COLORS[p.cfg.name] || '#a9f7ff',
    });
  }
  bodies.push({
    id: 'sun', label: 'SUN', pos: sun.group.position, dot: 10,
    logDist: C.SUN_RADIUS * 4, color: '#ffd75a',
  });
  bodies.push({
    id: 'blackhole', label: 'BLACK HOLE', pos: blackhole.group.position, dot: 6,
    logDist: 5000, color: '#d4408f',
  });
  for (const n of deepNebulae) {
    bodies.push({
      id: `neb:${n.id}`, label: n.name.toUpperCase(), pos: n.group.position,
      dot: 9, logDist: n.logDist, color: n.navColor,
    });
  }
  for (const s of stations) {
    bodies.push({
      id: s.name, label: s.name.toUpperCase(), pos: s.group.position,
      dot: 3.5, logDist: s.logDist || 1600, color: '#82f7ff', station: true,
    });
  }
}

function showToast(label) {
  showNavToast(`NEW CONTACT LOGGED — ${label}`, 3.2);
}

// Also used by main.js for the one-time first-launch nudge.
export function showNavToast(text, seconds = 3.2) {
  toast.textContent = text;
  toast.style.opacity = '1';
  toastTimer = seconds;
}

function toggleMap(force) {
  open = force !== undefined ? force : !open;
  if (open && !flyActive) open = false;
  panel.classList.toggle('open', open);
}

function sizeCanvas() {
  const size = Math.min(Math.round(window.innerHeight * 0.62), 560);
  canvas.width = size * 2; // crisp on hidpi
  canvas.height = size * 2;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
}

export function initNav() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  btn = document.createElement('div');
  btn.id = 'navBtn';
  btn.className = 'hidden';
  btn.textContent = 'NAV';
  btn.addEventListener('click', () => toggleMap());
  document.body.appendChild(btn);

  panel = document.createElement('div');
  panel.id = 'navMap';
  const title = document.createElement('div');
  title.className = 'n-title';
  title.textContent = 'NAV — SYSTEM CHART';
  panel.appendChild(title);
  canvas = document.createElement('canvas');
  sizeCanvas();
  panel.appendChild(canvas);
  ctx = canvas.getContext('2d');
  // audit fix: the chart was sized once at init and drew mis-scaled after
  // any window resize
  window.addEventListener('resize', sizeCanvas);
  foot = document.createElement('div');
  foot.className = 'n-foot';
  panel.appendChild(foot);
  document.body.appendChild(panel);

  toast = document.createElement('div');
  toast.id = 'navToast';
  document.body.appendChild(toast);

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyN') toggleMap();
    if (e.code === 'Escape') toggleMap(false);
  });

  loadLog();
}

const _rel = new THREE.Vector3();
const _fwd = new THREE.Vector3();

function drawMap(ship) {
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h / 2;
  const R = w / 2 - 30;
  ctx.clearRect(0, 0, w, h);
  ctx.font = '20px "Courier New", monospace';

  // range rings at 1k / 10k / 100k (sqrt-compressed radii)
  ctx.strokeStyle = 'rgba(130,247,255,0.18)';
  ctx.fillStyle = 'rgba(130,247,255,0.4)';
  ctx.lineWidth = 2;
  for (const d of [1000, 10000, 100000]) {
    const r = R * Math.sqrt(d / MAX_RANGE);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillText(d >= 1000 ? `${d / 1000}k` : `${d}`, cx + r * 0.7071 + 6, cy - r * 0.7071 - 6);
  }

  // discovered contacts, plotted relative to the ship (floating-origin safe)
  let found = 0;
  for (const b of bodies) {
    if (!logged.has(b.id)) continue;
    found++;
    _rel.subVectors(b.pos, ship.position);
    const d = Math.hypot(_rel.x, _rel.z);
    const r = R * Math.sqrt(Math.min(d, MAX_RANGE) / MAX_RANGE);
    const ang = Math.atan2(_rel.x, -_rel.z); // world -Z is chart-up
    const x = cx + Math.sin(ang) * r;
    const y = cy - Math.cos(ang) * r;
    ctx.fillStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 14;
    if (b.station) {
      ctx.fillRect(x - b.dot * 2, y - b.dot * 2, b.dot * 4, b.dot * 4);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, b.dot * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    const dist3 = _rel.length();
    const distTxt = dist3 >= 1000 ? `${(dist3 / 1000).toFixed(1)}k` : `${Math.round(dist3)}`;
    ctx.fillText(`${b.label} ${distTxt}`, x + b.dot * 2 + 8, y + 6);
  }

  // the ship: a heading triangle at the centre
  _fwd.set(0, 0, -1).applyQuaternion(ship.quaternion);
  const ha = Math.atan2(_fwd.x, -_fwd.z);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ha);
  ctx.fillStyle = '#ffc9ec';
  ctx.shadowColor = '#d4408f';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(10, 12);
  ctx.lineTo(-10, 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  foot.textContent = `CONTACTS LOGGED: ${found} / ${bodies.length} · N TO CLOSE`;
}

// Called every frame from main. `active` = fly phase; `frameBlend` ties the
// NAV button's visibility to the dashboard like the radio.
export function updateNav(ship, delta, active, frameBlend) {
  if (!bodies) buildBodies();
  flyActive = active;

  const btnVisible = active && frameBlend > 0.15;
  btn.classList.toggle('hidden', !btnVisible);
  if (btnVisible) btn.style.opacity = Math.min(frameBlend * 1.4, 1).toFixed(3);
  if (!active && open) toggleMap(false);

  if (toastTimer > 0) {
    toastTimer -= delta;
    if (toastTimer <= 0) toast.style.opacity = '0';
  }

  // proximity logging, throttled — distance checks are cheap but there's no
  // reason to run them 60x a second
  if (active) {
    checkTimer -= delta;
    if (checkTimer <= 0) {
      checkTimer = 0.5;
      for (const b of bodies) {
        if (logged.has(b.id)) continue;
        if (_rel.subVectors(b.pos, ship.position).length() < b.logDist) {
          logged.add(b.id);
          saveLog();
          showToast(b.label);
        }
      }
    }
  }

  if (open) drawMap(ship);
}

// dev/verification handle
export function navState() {
  return { logged: [...logged], open, count: bodies ? bodies.length : 0 };
}
