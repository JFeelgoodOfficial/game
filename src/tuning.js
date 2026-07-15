// lil-gui panel bound to every value in constants.js. Dev builds only —
// the guarded dynamic import is dead-code-eliminated from production
// (GDD 2.3). Includes a button that dumps current values as a constants.js
// literal to the clipboard: tuning that can't be saved gets lost.
//
// Reskinned as a cockpit hologram: translucent, magenta/cyan glow, scanlines,
// monospace, tilted as if projected from the dashboard. It's still the dev
// tuning panel (not a game HUD, GDD 4.3) — just dressed to match the ship.

import { C } from './constants.js';

const HOLO_CSS = `
.lil-gui {
  --background-color: rgba(16,6,24,0.34);
  --text-color: #a9f7ff;
  --title-background-color: rgba(212,64,143,0.20);
  --title-text-color: #ffc9ec;
  --widget-color: rgba(212,64,143,0.16);
  --hover-color: rgba(212,64,143,0.34);
  --focus-color: rgba(130,247,255,0.32);
  --number-color: #a9f7ff;
  --string-color: #ff9de0;
  --font-family: 'Courier New', ui-monospace, monospace;
  --font-size: 11px;
  --input-font-size: 11px;
}
.lil-gui.root {
  right: 18px; top: 50%;
  transform: translateY(-50%) perspective(900px) rotateY(-7deg);
  transform-origin: right center;
  background: linear-gradient(180deg, rgba(24,8,32,0.44), rgba(10,4,18,0.44));
  border: 1px solid rgba(212,64,143,0.45);
  border-radius: 6px;
  box-shadow: 0 0 26px rgba(212,64,143,0.32), inset 0 0 26px rgba(130,247,255,0.06);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  text-shadow: 0 0 6px rgba(130,247,255,0.45);
  overflow: visible;
  animation: holo-flicker 6s infinite;
}
.lil-gui.root > .children { overflow-y: auto; max-height: 84vh; }
.lil-gui .title {
  letter-spacing: 0.2em; text-transform: uppercase;
  border-bottom: 1px solid rgba(212,64,143,0.4);
  text-shadow: 0 0 9px rgba(255,120,200,0.65);
}
.lil-gui .controller .name { opacity: 0.82; }
.lil-gui input {
  background: rgba(130,247,255,0.06) !important;
  color: #cffcff !important;
}
.lil-gui .slider { background: rgba(130,247,255,0.06) !important; }
.lil-gui .slider .fill {
  background: linear-gradient(90deg, rgba(212,64,143,0.75), rgba(130,247,255,0.7)) !important;
}
.lil-gui.root::after {
  content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: 6px;
  background: repeating-linear-gradient(0deg,
    rgba(130,247,255,0.05) 0px, rgba(130,247,255,0.05) 1px,
    transparent 1px, transparent 3px);
  mix-blend-mode: screen;
}
@keyframes holo-flicker {
  0%, 97%, 100% { opacity: 1; }
  98% { opacity: 0.82; }
  99% { opacity: 0.94; }
}
`;

function injectHologramStyle() {
  if (document.getElementById('holo-tuning-style')) return;
  const el = document.createElement('style');
  el.id = 'holo-tuning-style';
  el.textContent = HOLO_CSS;
  document.head.appendChild(el);
}

export async function initTuning() {
  if (!import.meta.env.DEV) return;

  const { default: GUI } = await import('lil-gui');
  injectHologramStyle();
  const gui = new GUI({ title: '◈ SHIP SYSTEMS' });

  for (const key of Object.keys(C)) {
    gui.add(C, key);
  }

  gui.add(
    {
      copy() {
        const lines = Object.keys(C).map((k) => `  ${k}: ${C[k]},`);
        const literal = `export const C = {\n${lines.join('\n')}\n};\n`;
        navigator.clipboard
          .writeText(literal)
          .catch(() => console.log(literal));
      },
    },
    'copy'
  ).name('copy constants.js');

  // Keep the panel usable while flying: don't let it steal pointer lock.
  gui.domElement.addEventListener('click', (e) => e.stopPropagation());
}
