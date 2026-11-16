// Navigation discovery (user mechanic). Nothing is charted until you've flown
// close enough that it fills the canopy: contacts log at close range and
// persist in localStorage. Undiscovered bodies are completely hidden — pure
// exploration, per the user's explicit choice.
//
// This module owns the discovery state and the "NEW CONTACT LOGGED" toast.
// The chart itself is now the 3D navigation hologram (holonav.js), which reads
// the discovered bodies through getBodies() / isLogged().

import * as THREE from 'three';
import { C } from './constants.js';
import { planets } from './planet.js';
import { sun } from './sun.js';
import { blackhole } from './blackhole.js';
import { deepNebulae } from './deepnebula.js';
import { stations } from './stations.js';
import { coinWorld } from '../world/coinworld.js';
import { touchify } from './touchText.js';

const CSS = `
#navToast {
  position: fixed; top: 20%; left: 50%; transform: translateX(-50%);
  z-index: 13; pointer-events: none; opacity: 0; transition: opacity 0.4s;
  font-family: 'Courier New', ui-monospace, monospace; font-size: 14px;
  letter-spacing: 0.34em; color: #7dffc8; padding: 8px 24px;
  border: 1px solid rgba(120,255,190,0.6); border-radius: 3px;
  background: rgba(4,30,20,0.55); text-shadow: 0 0 10px rgba(120,255,190,0.8);
  max-width: 92vw; box-sizing: border-box; white-space: normal; text-align: center;
}
`;

const STORE_KEY = 'fgsf.navlog';

let toast;
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
  // stevenlacey is a gift, not a secret: it is on the chart from the first
  // launch, so it can be picked as a destination without stumbling on it first
  // (it is small, 45,000 units out and well below the plane of the planets).
  logged.add('stevenlacey');
}
function saveLog() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...logged]));
  } catch { /* session-only */ }
}

const PLANET_COLORS = {
  terra: '#5fc76e',
  rustia: '#ff8a5a', saturnia: '#e8c78a', neptunia: '#6a7dff',
  'wavemall prime': '#d4408f', actuality: '#f2c94c',
  shadowreach: '#cfcfd4', wyattmattoe: '#f4f8ff',
  stevenlacey: '#e7bf55',
};

// Every record carries an explicit `kind` — 'planet' | 'star' | 'anomaly' |
// 'nebula' | 'station'. The boolean flags below it stay because holonav.js
// branches on them for marker geometry, but they can't classify on their own:
// planets carry no flag AND neither does the black hole, so "no flag means
// planet" quietly files an event horizon under planets. The cockpit's
// destination menu groups on `kind`.
function buildBodies() {
  bodies = [];
  for (const p of planets) {
    bodies.push({
      id: p.cfg.name,
      label: p.cfg.name.toUpperCase(),
      pos: p.group.position,
      dot: p.radius >= 2000 ? 7 : 5,
      radius: p.radius,
      logDist: p.radius * 4, // "fills the window" — a few radii out
      color: PLANET_COLORS[p.cfg.name] || '#a9f7ff',
      kind: 'planet',
    });
  }
  bodies.push({
    id: 'sun', label: 'SUN', pos: sun.group.position, dot: 10,
    radius: C.SUN_RADIUS, logDist: C.SUN_RADIUS * 4, color: '#ffd75a', star: true,
    kind: 'star',
  });
  bodies.push({
    id: 'blackhole', label: 'BLACK HOLE', pos: blackhole.group.position, dot: 6,
    radius: C.BH_HORIZON, logDist: 5000, color: '#d4408f', kind: 'anomaly',
  });
  for (const n of deepNebulae) {
    bodies.push({
      id: `neb:${n.id}`, label: n.name.toUpperCase(), pos: n.group.position,
      dot: 9, radius: n.logDist * 0.25, logDist: n.logDist, nebula: true,
      kind: 'nebula',
      // live getter: painting nebulae learn their color when the image decodes
      get color() { return n.navColor; },
    });
  }
  for (const s of stations) {
    bodies.push({
      id: s.name, label: s.name.toUpperCase(), pos: s.group.position,
      dot: 3.5, radius: 400, logDist: s.logDist || 1600, color: '#82f7ff', station: true,
      kind: 'station',
    });
  }
  // stevenlacey, the coin world: a place you land on, so it files as a planet.
  if (coinWorld) {
    bodies.push({
      id: 'stevenlacey', label: 'STEVENLACEY', pos: coinWorld.group.position,
      dot: 5, radius: coinWorld.radius, logDist: coinWorld.radius * 4,
      color: PLANET_COLORS.stevenlacey, kind: 'planet',
    });
  }
}

function showToast(label) {
  showNavToast(`NEW CONTACT LOGGED — ${label}`, 3.2);
}

// Also used by game.js for the one-time first-launch nudge.
export function showNavToast(text, seconds = 3.2) {
  toast.textContent = touchify(text, { seated: true });
  toast.style.opacity = '1';
  toastTimer = seconds;
}

// Pull the banner down now, whatever it was counting. For transitions that
// leave the flight sim entirely (the cottage) — a contact-logged toast from
// the last second of the dive should not survive into the garden.
export function hideNavToast() {
  if (!toast) return;
  toast.style.opacity = '0';
  toastTimer = 0;
}

export function initNav() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  toast = document.createElement('div');
  toast.id = 'navToast';
  document.body.appendChild(toast);

  loadLog();
}

const _rel = new THREE.Vector3();

// Called every frame from game.js. `active` = fly phase. Runs the proximity
// discovery check and drives the toast timer.
export function updateNav(ship, delta, active) {
  if (!bodies) buildBodies();

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
        if (logged.has(b.id) || sessionKnown.has(b.id)) continue;
        if (_rel.subVectors(b.pos, ship.position).length() < b.logDist) {
          logged.add(b.id);
          saveLog();
          showToast(b.label);
        }
      }
    }
  }
}

// The discovered-body list, for the navigation hologram. Each carries a live
// `pos` reference, an `id`, `label`, `color`, `radius`, `logDist`, and a type
// flag (station / star / nebula) for its marker style.
export function getBodies() {
  if (!bodies) buildBodies();
  return bodies;
}

// Take a body off every chart (hologram, destination menu, proximity log), or
// put it back. Matched by the position object it tracks, so one call covers a
// world and the stations that ride it. Used when a world leaves space.
const hiddenBodies = [];
export function setNavHidden(pos, hidden) {
  if (!bodies) buildBodies();
  if (hidden) {
    for (let i = bodies.length - 1; i >= 0; i--) {
      if (bodies[i].pos === pos) hiddenBodies.push(bodies.splice(i, 1)[0]);
    }
  } else {
    for (let i = hiddenBodies.length - 1; i >= 0; i--) {
      if (hiddenBodies[i].pos === pos) bodies.push(hiddenBodies.splice(i, 1)[0]);
    }
  }
}

// Put something new on the chart after boot (the war fleets, src/fleets.js).
// `known` charts it at once, without having to be flown up to first; that is
// kept for the session only, so a ship that no longer exists is not left in
// the saved log.
const sessionKnown = new Set();
export function addNavBody(body, known = true) {
  if (!bodies) buildBodies();
  if (bodies.some((b) => b.id === body.id) || hiddenBodies.some((b) => b.id === body.id)) return;
  bodies.push(body);
  if (known) sessionKnown.add(body.id);
}

export function isLogged(id) {
  if (sessionKnown.has(id)) return true;
  return logged.has(id);
}

// dev/verification handle. `openProbe` lets holonav report the chart's open
// state without a circular import.
let openProbe = () => false;
export function setNavOpenProbe(fn) {
  openProbe = fn;
}
export function navState() {
  return { logged: [...logged], open: openProbe(), count: bodies ? bodies.length : 0 };
}
