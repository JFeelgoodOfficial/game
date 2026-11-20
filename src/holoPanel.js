// The holodeck's wall panel — E at the panel in the holodeck (src/holodeck.js).
//
// A list of programs: one per world the worldship has assimilated that has an
// experience worth keeping (src/tenretni.js decides which, and when). A row is
// started with its number key or a tap; locked rows say so. Opening and closing
// on E is owned by game.js, as for the terrarium (src/terrariumView.js); X
// closes from here. Never Escape — that would drop pointer lock.

const CSS = `
#holopanel {
  position: fixed; inset: 0; z-index: 22; display: none;
  flex-direction: column; align-items: center; justify-content: center;
  background: rgba(2,6,5,0.88); user-select: none;
  font-family: 'Courier New', ui-monospace, monospace;
}
#holopanel.open { display: flex; }
#holopanel .hp-title {
  font-size: 18px; letter-spacing: 0.42em; color: #35ff8a;
  text-shadow: 0 0 12px rgba(53,255,138,0.5);
}
#holopanel .hp-sub { margin-top: 8px; font-size: 10px; letter-spacing: 0.32em; color: #7fbf9c; }
#holopanel .hp-list { margin-top: 22px; display: flex; flex-direction: column; gap: 8px; width: min(86vw, 520px); max-height: 66vh; overflow-y: auto; }
#holopanel .hp-row {
  display: flex; align-items: baseline; gap: 14px; padding: 12px 16px;
  border: 1px solid rgba(53,255,138,0.45); background: rgba(6,24,16,0.7);
  color: #d6ffe8; font: inherit; font-size: 13px; letter-spacing: 0.18em; text-align: left;
  cursor: pointer;
}
#holopanel .hp-row .hp-key { color: #35ff8a; }
#holopanel .hp-row .hp-note { margin-left: auto; font-size: 10px; letter-spacing: 0.2em; color: #7fbf9c; }
#holopanel .hp-row.locked { border-color: rgba(120,140,130,0.3); color: #5f7068; cursor: default; }
#holopanel .hp-row.locked .hp-key { color: #5f7068; }
#holopanel .hp-foot { margin-top: 18px; font-size: 10px; letter-spacing: 0.3em; color: #4f6a5c; }
`;

const TITLE = 'HOLODECK', SUB = 'WORLDS HELD BY TENRETNI', LOCKED = 'NOT YET ASSIMILATED';
let panel = null;
let title = null, sub = null, foot = null;
const FOOT = 'NUMBER — RUN · X — CLOSE';
let list = null;
let open = false;
let rows = []; // what is on screen: [{ id, label, note, unlocked }]
let onPick = null;

function pick(i) {
  const r = rows[i];
  if (!r || !r.unlocked) return;
  const cb = onPick;
  closeHoloPanel();
  if (cb) cb(r.id);
}

function onKey(e) {
  if (e.code === 'KeyX') closeHoloPanel();
  else if (/^Digit[1-9]$/.test(e.code)) pick(Number(e.code.slice(5)) - 1);
  else if (e.code === 'Digit0') pick(9); // a tenth row, on the longer lists (the light ship's archive)
}

export function initHoloPanel() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  panel = document.createElement('div');
  panel.id = 'holopanel';
  title = document.createElement('div');
  title.className = 'hp-title';
  title.textContent = TITLE;
  sub = document.createElement('div');
  sub.className = 'hp-sub';
  sub.textContent = SUB;
  list = document.createElement('div');
  list.className = 'hp-list';
  foot = document.createElement('div');
  foot.className = 'hp-foot';
  foot.textContent = FOOT;
  panel.append(title, sub, list, foot);
  document.body.appendChild(panel);
}

// programs: [{ id, label, note, unlocked }]; picked(id) runs once, after close.
// `opts` (the light ship's panels, src/homebase.js): { title, sub, locked }
// in place of the freighter's own wording; a locked row with `show` keeps its
// name on screen. Rows past the ninth are [0] and then tap only.
export function openHoloPanel(programs, picked, opts = {}) {
  if (!panel || open) return;
  rows = programs;
  onPick = picked;
  title.textContent = opts.title || TITLE;
  sub.textContent = opts.sub || SUB;
  const lockedNote = opts.locked || LOCKED;
  if (foot) foot.textContent = opts.foot || FOOT;
  list.textContent = '';
  rows.forEach((r, i) => {
    const b = document.createElement('button');
    b.className = 'hp-row' + (r.unlocked ? '' : ' locked');
    const key = document.createElement('span');
    key.className = 'hp-key';
    key.textContent = i < 9 ? `[${i + 1}]` : i === 9 ? '[0]' : '';
    const name = document.createElement('span');
    name.textContent = r.unlocked || r.show ? r.label : '— — —';
    const note = document.createElement('span');
    note.className = 'hp-note';
    note.textContent = r.unlocked ? r.note : r.lockedNote || lockedNote;
    b.append(key, name, note);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      pick(i);
    });
    list.appendChild(b);
  });
  open = true;
  panel.classList.add('open');
  window.addEventListener('keydown', onKey);
}

export function closeHoloPanel() {
  if (!open) return;
  open = false;
  onPick = null;
  panel.classList.remove('open');
  window.removeEventListener('keydown', onKey);
}

export function isHoloPanelOpen() {
  return open;
}

// for headless verification
export const holoPanelDebug = () => ({ open, rows: rows.map((r) => ({ id: r.id, unlocked: r.unlocked })), pick });
