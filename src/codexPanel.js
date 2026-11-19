// The CODEX (owner request): what the pilot has learned and where to go next,
// opened from the disc at the centre of the dash (cockpit3d.js), J, or the
// on-foot ≡ panel. A DOM dialog in the radioPopup.js pattern, with type sized
// for a phone from the start.
//
//   NEXT    the errands in hand, each with SET COURSE where there is a place
//   PEOPLE  everyone spoken to
//   PLACES  the chart's logged bodies
//   LORE    codex subjects
//
// The content is worked out on open by codexData.js; nothing is stored here.

import { objectives, people, places, lore } from './codexData.js';
import { markCodexRead } from './journal.js';
import { uiSound } from './sfx.js';

const CSS = `
#codexPanel {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  z-index: 24; display: none; flex-direction: column; gap: 10px;
  width: min(640px, 94vw); height: min(560px, 92vh); box-sizing: border-box;
  padding: 16px 18px 12px; border-radius: 6px; user-select: none; -webkit-user-select: none;
  font-family: 'Courier New', ui-monospace, monospace; color: #cfeff4;
  background: rgba(4,12,20,0.95); border: 1px solid rgba(130,247,255,0.55);
  box-shadow: 0 0 44px rgba(130,247,255,0.3), inset 0 0 30px rgba(130,247,255,0.06);
}
#codexPanel.open { display: flex; }
#codexPanel .cx-top { display: flex; align-items: center; gap: 10px; }
#codexPanel .cx-title { flex: 1; font-size: 15px; letter-spacing: 0.42em; color: #7ad7e0; text-shadow: 0 0 8px rgba(130,247,255,0.6); }
#codexPanel button {
  font-family: inherit; cursor: pointer; color: #a9f7ff; border-radius: 4px;
  background: rgba(130,247,255,0.06); border: 1px solid rgba(130,247,255,0.5);
  touch-action: manipulation;
}
#codexPanel .cx-close { font-size: 14px; letter-spacing: 0.24em; min-height: 44px; padding: 0 16px; }
#codexPanel .cx-tabs { display: flex; gap: 6px; }
#codexPanel .cx-tab { flex: 1; min-height: 46px; font-size: 14px; letter-spacing: 0.18em; }
#codexPanel .cx-tab.sel { background: rgba(212,64,143,0.28); color: #ffd0ee; border-color: rgba(212,64,143,0.8); }
#codexPanel .cx-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 2px 4px 2px 2px; scrollbar-width: thin; -webkit-overflow-scrolling: touch; }
#codexPanel .cx-item {
  padding: 12px 14px; margin-bottom: 8px; border-radius: 4px;
  background: rgba(4,10,16,0.85); border: 1px solid rgba(130,247,255,0.28);
}
#codexPanel .cx-head { display: flex; align-items: baseline; gap: 10px; }
#codexPanel .cx-name { flex: 1; font-size: 17px; line-height: 1.35; color: #f2feff; letter-spacing: 0.02em; }
#codexPanel .cx-prog { font-size: 15px; color: #ffd75a; letter-spacing: 0.1em; white-space: nowrap; }
#codexPanel .cx-text { margin-top: 6px; font-size: 15px; line-height: 1.45; color: #a9d8df; }
#codexPanel .cx-go {
  margin-top: 10px; min-height: 46px; padding: 0 18px; font-size: 14px; letter-spacing: 0.2em;
  color: #ffe9a8; border-color: rgba(255,215,90,0.7); background: rgba(255,215,90,0.1);
}
#codexPanel .cx-sub { margin: 14px 2px 8px; font-size: 13px; letter-spacing: 0.34em; color: #7ad7e0; }
#codexPanel .cx-sub:first-child { margin-top: 2px; }
#codexPanel .cx-done { font-size: 15px; line-height: 1.5; color: #7fb7bf; padding: 2px 4px; }
#codexPanel .cx-done::before { content: '✓ '; color: #8cffd1; }
#codexPanel .cx-row { font-size: 16px; line-height: 1.4; padding: 9px 12px; border-bottom: 1px solid rgba(130,247,255,0.14); }
#codexPanel .cx-row small { display: block; font-size: 13px; color: #7fb7bf; letter-spacing: 0.06em; }
#codexPanel .cx-empty { font-size: 15px; color: #7fb7bf; text-align: center; padding: 36px 10px; line-height: 1.6; }
@media (max-height: 480px) {
  #codexPanel { height: 96vh; padding: 10px 12px 8px; gap: 6px; }
  #codexPanel .cx-tab { min-height: 42px; }
}
`;

const TABS = ['NEXT', 'PEOPLE', 'PLACES', 'LORE'];
let panel = null, bodyEl = null, tabEls = [];
let isOpen = false;
let tab = 'NEXT';
let setCourse = null; // (navBody) => void, given by the host (engageWarp)

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

function render() {
  tabEls.forEach((b, i) => b.classList.toggle('sel', TABS[i] === tab));
  bodyEl.textContent = '';
  bodyEl.scrollTop = 0;
  if (tab === 'NEXT') {
    const { next, done } = objectives();
    if (!next.length) {
      bodyEl.appendChild(el('div', 'cx-empty', 'Nothing is asked of you just now. Land somewhere and talk to the people in charge.'));
    }
    for (const o of next) {
      const item = el('div', 'cx-item');
      const head = el('div', 'cx-head');
      head.appendChild(el('div', 'cx-name', o.text));
      if (o.progress) head.appendChild(el('div', 'cx-prog', o.progress));
      item.appendChild(head);
      if (o.detail) item.appendChild(el('div', 'cx-text', o.detail));
      if (o.target && setCourse) {
        const go = el('button', 'cx-go', 'SET COURSE — ' + o.target.label);
        go.type = 'button';
        go.addEventListener('click', () => {
          uiSound('toggle');
          closeCodex();
          setCourse(o.target);
        });
        item.appendChild(go);
      }
      bodyEl.appendChild(item);
    }
    if (done.length) {
      bodyEl.appendChild(el('div', 'cx-sub', 'DONE'));
      for (const d of done) bodyEl.appendChild(el('div', 'cx-done', d));
    }
  } else if (tab === 'PEOPLE') {
    const list = people();
    if (!list.length) bodyEl.appendChild(el('div', 'cx-empty', 'You have not spoken to anyone yet.'));
    for (const p of list) {
      const row = el('div', 'cx-row', p.name);
      const where = [p.role, p.place].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i && !(i === 1 && a[0].includes(v))).join(' · ');
      if (where) row.appendChild(el('small', null, where));
      bodyEl.appendChild(row);
    }
  } else if (tab === 'PLACES') {
    const groups = places();
    if (!groups.length) bodyEl.appendChild(el('div', 'cx-empty', 'Nothing logged yet. Fly close to a world to log it.'));
    for (const g of groups) {
      bodyEl.appendChild(el('div', 'cx-sub', g.title));
      for (const b of g.rows) {
        const row = el('div', 'cx-row', (b.objective ? '◆ ' : '') + b.label);
        if (b.color) row.style.color = typeof b.color === 'number' ? '#' + b.color.toString(16).padStart(6, '0') : b.color;
        bodyEl.appendChild(row);
      }
    }
  } else {
    const list = lore();
    if (!list.length) bodyEl.appendChild(el('div', 'cx-empty', 'Nothing learned yet. People and creatures will tell you things if you ask.'));
    for (const l of list) {
      const item = el('div', 'cx-item');
      item.appendChild(el('div', 'cx-name', l.title));
      if (l.text) item.appendChild(el('div', 'cx-text', l.text));
      bodyEl.appendChild(item);
    }
  }
}

function onKey(e) {
  if (e.code === 'KeyX' || e.code === 'Escape') closeCodex();
}

export function initCodexPanel(opts = {}) {
  setCourse = opts.setCourse || null;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  panel = el('div');
  panel.id = 'codexPanel';
  panel.setAttribute('data-nocapture', '');
  const top = el('div', 'cx-top');
  top.appendChild(el('div', 'cx-title', 'CODEX'));
  const close = el('button', 'cx-close', 'CLOSE');
  close.type = 'button';
  close.addEventListener('click', () => closeCodex());
  top.appendChild(close);
  panel.appendChild(top);
  const tabs = el('div', 'cx-tabs');
  tabEls = TABS.map((t) => {
    const b = el('button', 'cx-tab', t);
    b.type = 'button';
    b.addEventListener('click', () => {
      tab = t;
      uiSound('toggle');
      render();
    });
    tabs.appendChild(b);
    return b;
  });
  panel.appendChild(tabs);
  bodyEl = el('div', 'cx-body');
  panel.appendChild(bodyEl);
  // touches inside the panel are the panel's (the canvas under it flies the ship)
  panel.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  document.body.appendChild(panel);
  // back to flying with the mouse: put the book away (radioPopup.js does the same)
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) closeCodex();
  });
}

export function openCodex(startTab) {
  if (!panel || isOpen) return;
  isOpen = true;
  if (startTab) tab = startTab;
  markCodexRead();
  if (document.pointerLockElement) document.exitPointerLock(); // the panel wants a cursor
  render();
  panel.classList.add('open');
  document.addEventListener('keydown', onKey);
}

export function closeCodex() {
  if (!isOpen) return;
  isOpen = false;
  panel.classList.remove('open');
  document.removeEventListener('keydown', onKey);
}

export function toggleCodex() {
  if (isOpen) closeCodex();
  else openCodex();
}

export const isCodexOpen = () => isOpen;

// dev/verification handle
export function codexDebug() {
  return {
    open: (t) => openCodex(t),
    close: closeCodex,
    isOpen: () => isOpen,
    tab: (t) => { tab = t; if (isOpen) render(); },
    data: () => ({ ...objectives(), people: people(), lore: lore(), places: places().map((g) => ({ title: g.title, n: g.rows.length })) }),
    text: () => (isOpen ? bodyEl.innerText : null),
  };
}
