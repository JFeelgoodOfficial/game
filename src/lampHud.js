// What the lamp puts on the screen (GDD 5.7.5): the band it is on, as a
// telescope caption would give it, and three levels: the lamp's charge, the
// crew's X-ray dose, the warmth of the cabin.
//
// DOM, like every other HUD here, made the first time it is shown. A readout
// on the glass and not on a dashboard (GDD 7 prefers the dashboard) because
// the same lamp is carried on foot later, where there is none. On a touch
// screen it also carries the lamp's buttons, since there are no keys.
//
//   show(on, vehicle)   in / out; `vehicle` adds the SINK button on touch
//   update()            once a frame while it is in (writes only what changed)

import { input } from './input.js';
import { lamp, nextBand, toggleLamp } from './lamp.js';
import { BANDS, LAMP } from '../world/entryzero-dialogue.js';

const CSS = `
#ezHud { position: fixed; left: 50%; bottom: max(9.5vh, env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 58; display: none;
  font-family: 'Courier New', monospace; color: #a9f7ff; text-transform: uppercase; letter-spacing: 0.2em; pointer-events: none; text-align: center; }
#ezHud.on { display: block; }
#ezHud .band { font-size: clamp(13px, 1.9vw, 21px); text-shadow: 0 0 12px currentColor, 0 0 2px #000; }
#ezHud .band small { font-size: 0.68em; opacity: 0.8; margin-left: 0.8em; text-transform: none; } /* (µm is not Mm) */
#ezHud.off .band { opacity: 0.35; }
#ezHud .row { display: flex; gap: 1.6em; justify-content: center; margin-top: 0.7em; font-size: clamp(9px, 1.15vw, 13px); }
#ezHud .m { display: flex; align-items: center; gap: 0.6em; text-shadow: 0 0 8px rgba(130, 247, 255, 0.7); }
#ezHud .bar { width: clamp(54px, 8vw, 110px); height: 6px; border: 1px solid rgba(130, 247, 255, 0.6); background: rgba(4, 12, 20, 0.55); }
#ezHud .fill { height: 100%; width: 0; background: #a9f7ff; box-shadow: 0 0 8px rgba(130, 247, 255, 0.8); }
#ezHud .m.warn { color: #ffc27a; } #ezHud .m.warn .fill { background: #ffc27a; box-shadow: 0 0 8px #ffa640; }
#ezHud .m.bad { color: #ff7a8c; } #ezHud .m.bad .fill { background: #ff7a8c; box-shadow: 0 0 8px #ff4a66; }
#ezHud .keys { margin-top: 0.8em; font-size: clamp(9px, 1.05vw, 12px); opacity: 0.75; }
#ezHud .tap { display: none; gap: 0.7em; justify-content: center; margin-top: 0.9em; pointer-events: auto; }
#ezHud .tap div { padding: 0.75em 0.9em; border: 1px solid rgba(130, 247, 255, 0.6); background: rgba(4, 12, 20, 0.6); font-size: 12px; touch-action: none; user-select: none; }
#ezHud .tap div.down { background: rgba(130, 247, 255, 0.3); }
body.touch-ui #ezHud { bottom: auto; top: max(9vh, env(safe-area-inset-top)); }
body.touch-ui #ezHud .keys { display: none; }
body.touch-ui #ezHud .tap { display: flex; }
#ezHud:not(.vehicle) .sink { display: none; }
#ezHud:not(.all) .every { display: none; }
/* at a vehicle's controls the on-foot key list and the compass are not for this */
body.ez-ride #walkHint, body.ez-ride #compass, body.ez-ride #equipBtn { opacity: 0 !important; pointer-events: none !important; }
`;

let root = null, bandEl = null, keysEl = null;
const meters = {};
let shownBand = -1, shownOn = null, shownAll = null;
const shown = { energy: -1, dose: -1, cabin: -1 };

function meter(name, label) {
  const m = document.createElement('div');
  m.className = 'm';
  m.innerHTML = `<span>${label}</span><div class="bar"><div class="fill"></div></div>`;
  meters[name] = { el: m, fill: m.querySelector('.fill') };
  return m;
}
function tap(label, cls, down, up) {
  const el = document.createElement('div');
  el.textContent = label;
  if (cls) el.className = cls;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.classList.add('down');
    down();
  });
  const end = () => {
    el.classList.remove('down');
    if (up) up();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', end);
  return el;
}

function build() {
  if (root) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  root = document.createElement('div');
  root.id = 'ezHud';
  root.setAttribute('data-nocapture', '');
  bandEl = document.createElement('div');
  bandEl.className = 'band';
  const row = document.createElement('div');
  row.className = 'row';
  row.append(meter('energy', 'LAMP'), meter('dose', 'DOSE'), meter('cabin', 'CABIN'));
  keysEl = document.createElement('div');
  keysEl.className = 'keys';
  const taps = document.createElement('div');
  taps.className = 'tap';
  taps.append(
    tap('‹ BAND', '', () => nextBand(-1)),
    tap('BAND ›', '', () => nextBand(1)),
    tap('LAMP', '', () => toggleLamp()),
    tap('EVERY', 'every', () => { input.allBands = true; }, () => { input.allBands = false; }),
    tap('SINK', 'sink', () => { input.sink = true; }, () => { input.sink = false; }),
  );
  root.append(bandEl, row, keysEl, taps);
  document.body.appendChild(root);
}

function level(name, v, warn, bad, rising) {
  const pct = Math.round(v * 50) * 2; // (2% steps: the bar is not rewritten every frame)
  if (pct === shown[name]) return;
  shown[name] = pct;
  const m = meters[name];
  m.fill.style.width = `${pct}%`;
  const w = rising ? v >= warn : v <= warn, b = rising ? v >= bad : v <= bad;
  m.el.classList.toggle('warn', w && !b);
  m.el.classList.toggle('bad', b);
}

export const lampHud = {
  show(on, vehicle = false) {
    if (!on && !root) return;
    build();
    root.classList.toggle('on', on);
    root.classList.toggle('vehicle', on && vehicle);
    document.body.classList.toggle('ez-ride', on && vehicle);
    if (!on) input.allBands = input.sink = false;
    shownBand = -1;
  },
  update() {
    if (!root) return;
    const live = lamp.on && lamp.energy > 0;
    if (lamp.band !== shownBand || live !== shownOn || lamp.all !== shownAll) {
      shownBand = lamp.band;
      shownOn = live;
      shownAll = lamp.all;
      const b = BANDS[lamp.band];
      bandEl.textContent = '';
      bandEl.append(lamp.all ? 'EVERY BAND' : live ? b.label : lamp.on ? LAMP.out : 'LAMP OFF');
      if (live && !lamp.all) {
        const nm = document.createElement('small');
        nm.textContent = b.nm;
        bandEl.appendChild(nm);
      }
      bandEl.style.color = lamp.all ? '#ffffff' : `#${b.tint.toString(16).padStart(6, '0')}`;
      root.classList.toggle('off', !live);
      root.classList.toggle('all', lamp.canAll);
      keysEl.textContent = lamp.canAll ? `${LAMP.prompt} · ${LAMP.toggle} · ${LAMP.all}` : `${LAMP.prompt} · ${LAMP.toggle}`;
    }
    level('energy', lamp.energy, 0.3, 0.12, false);
    level('dose', lamp.dose, 0.5, 0.8, true);
    level('cabin', lamp.cabin, 0.45, 0.2, false);
  },
  state: () => ({ on: !!root && root.classList.contains('on'), band: bandEl ? bandEl.textContent : null }),
};
