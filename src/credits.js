// About Wave Collector — the popup behind the corridor plaque's "press E for
// more". Opening/closing on E is owned by main.js (via input.interact, so it
// can't double-fire); X also closes from here. Never Escape — that would drop
// pointer lock.

const CSS = `
#credits {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  z-index: 22; display: none; flex-direction: column; max-width: 560px;
  padding: 18px 26px 14px; border-radius: 6px; user-select: none;
  font-family: 'Courier New', ui-monospace, monospace; color: #cdd8e8;
  background: rgba(10,10,16,0.92); border: 1px solid rgba(200,168,106,0.65);
  box-shadow: 0 0 44px rgba(200,168,106,0.25), inset 0 0 30px rgba(200,168,106,0.05);
}
#credits.open { display: flex; }
#credits .cr-title {
  font-size: 13px; letter-spacing: 0.42em; color: #c8a86a;
  margin-bottom: 12px; text-align: center;
  text-shadow: 0 0 10px rgba(200,168,106,0.6);
}
#credits p {
  font-size: 12.5px; line-height: 1.8; letter-spacing: 0.04em;
  margin: 0 0 12px; text-align: left;
}
#credits em { color: #e8d9b0; font-style: italic; }
#credits .cr-foot {
  font-size: 10px; letter-spacing: 0.3em; color: #8a7a58;
  margin-top: 2px; text-align: center;
}
`;

const PARA_1 =
  'Wave Collector is the electronic music project of Neal Wright, based in ' +
  'Nederland/Boulder, Colorado. The project builds tracks from field ' +
  'recordings collected during travels and everyday life, weaving natural ' +
  'and found sounds into layered electronic compositions. Wave Collector’s ' +
  'sound draws influence from artists like Chrome Sparks, Gold Panda, ' +
  'Flying Lotus, Machinedrum, Boards of Canada, Teebs, and Shigeto.';

// [title, year] pairs woven into the second paragraph as <em> runs.
const PARA_2_PARTS = [
  ['Beyond studio work, Wave Collector is also a long-time turntablist, ' +
    'incorporating live scratching and sample manipulation into ' +
    'performances. The discography spans several releases, including the ' +
    'debut LP ', null],
  ['Catalog of Stolen Worlds', 'em'],
  [' (2016), the Go-inspired ', null],
  ['Wave Games', 'em'],
  [' (2022), and the more recent ', null],
  ['Your Call is Important to Us', 'em'],
  [' (2025) and ', null],
  ['Home Decor', 'em'],
  [' (2023).', null],
];

let panel = null;
let open = false;

function onKey(e) {
  if (e.code === 'KeyX') closeCredits();
}

export function initCredits() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  panel = document.createElement('div');
  panel.id = 'credits';

  const title = document.createElement('div');
  title.className = 'cr-title';
  title.textContent = 'ABOUT WAVE COLLECTOR';
  panel.appendChild(title);

  const p1 = document.createElement('p');
  p1.textContent = PARA_1;
  panel.appendChild(p1);

  const p2 = document.createElement('p');
  for (const [text, tag] of PARA_2_PARTS) {
    if (tag === 'em') {
      const em = document.createElement('em');
      em.textContent = text;
      p2.appendChild(em);
    } else {
      p2.appendChild(document.createTextNode(text));
    }
  }
  panel.appendChild(p2);

  const foot = document.createElement('div');
  foot.className = 'cr-foot';
  foot.textContent = 'E / X — CLOSE';
  panel.appendChild(foot);

  document.body.appendChild(panel);
}

export function openCredits() {
  if (open || !panel) return;
  open = true;
  panel.classList.add('open');
  document.addEventListener('keydown', onKey);
}

export function closeCredits() {
  if (!open) return;
  open = false;
  panel.classList.remove('open');
  document.removeEventListener('keydown', onKey);
}

export function isCreditsOpen() {
  return open;
}
