// Dialogue overlay for talking to aliens and creatures (world/interaction.js).
// Renders a DialoguePayload { speaker, lines, offer? } as a bottom-center DOM
// panel, keyboard-driven so it works under pointer lock (walkview.js pattern):
// E (routed here via walk.js -> advanceDialogue) steps through the lines,
// digit keys pick a 'choice' offer's option, X leaves at any point (real
// Escape would drop pointer lock, so it is not used).
//
// The host (walk.js) owns everything beyond presentation: it opens the panel
// with the payload from module.interact(entity), receives accepted offers via
// onOffer, and signals module.endInteract(entity) from onClose.

const CSS = `
#dlgPanel {
  position: fixed; left: 50%; bottom: 12%; transform: translateX(-50%);
  z-index: 14; pointer-events: none; opacity: 0; transition: opacity 0.25s;
  min-width: 340px; max-width: 620px; padding: 14px 22px 12px;
  font-family: 'Courier New', ui-monospace, monospace; color: #a9f7ff;
  background: rgba(4,10,16,0.72); border: 1px solid rgba(130,247,255,0.45);
  border-radius: 4px; box-shadow: 0 0 24px rgba(130,247,255,0.15);
  user-select: none;
}
#dlgPanel.open { opacity: 1; }
#dlgPanel .dlg-speaker {
  font-size: 12px; letter-spacing: 0.3em; color: #ffc9ec;
  text-shadow: 0 0 10px rgba(212,64,143,0.8); margin-bottom: 8px;
}
#dlgPanel .dlg-speaker .dlg-meta {
  color: #7ad7e0; text-shadow: 0 0 6px rgba(130,247,255,0.5);
}
#dlgPanel .dlg-line {
  font-size: 14px; line-height: 1.5; letter-spacing: 0.06em;
  text-shadow: 0 0 6px rgba(130,247,255,0.5); min-height: 1.5em;
}
#dlgPanel .dlg-options { margin-top: 8px; font-size: 13px; line-height: 1.7; }
#dlgPanel .dlg-options .dlg-opt {
  color: #ffc9ec; text-shadow: 0 0 8px rgba(212,64,143,0.7); letter-spacing: 0.1em;
}
#dlgPanel .dlg-hint {
  margin-top: 10px; font-size: 10px; letter-spacing: 0.3em; color: #7ad7e0;
  text-shadow: 0 0 6px rgba(130,247,255,0.4);
}
`;

let styled = false;
let panel = null;
let speakerEl = null;
let lineEl = null;
let optionsEl = null;
let hintEl = null;
let keyHandler = null;

// Open-dialogue state.
let payload = null;
let lineIndex = 0;
let choosing = false; // showing a 'choice' offer's options
let onOffer = null;
let onClose = null;

function ensureDom() {
  if (!styled) {
    styled = true;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'dlgPanel';
    panel.innerHTML = `
      <div class="dlg-speaker"></div>
      <div class="dlg-line"></div>
      <div class="dlg-options"></div>
      <div class="dlg-hint"></div>
    `;
    document.body.appendChild(panel);
    speakerEl = panel.querySelector('.dlg-speaker');
    lineEl = panel.querySelector('.dlg-line');
    optionsEl = panel.querySelector('.dlg-options');
    hintEl = panel.querySelector('.dlg-hint');
  }
}

function render() {
  const s = payload.speaker;
  speakerEl.innerHTML = '';
  const name = document.createElement('span');
  name.textContent = s.name.toUpperCase();
  speakerEl.appendChild(name);
  const meta = document.createElement('span');
  meta.className = 'dlg-meta';
  meta.textContent = ' · ' + s.species + (s.cityId ? ' · ' + s.cityId : '');
  speakerEl.appendChild(meta);

  if (choosing) {
    lineEl.textContent = payload.offer.prompt;
    optionsEl.innerHTML = '';
    payload.offer.options.forEach((opt, i) => {
      const row = document.createElement('div');
      row.className = 'dlg-opt';
      row.textContent = `[${i + 1}] ${opt.label}`;
      optionsEl.appendChild(row);
    });
    hintEl.textContent = `1–${payload.offer.options.length} — CHOOSE · X — LEAVE`;
  } else {
    lineEl.textContent = payload.lines[lineIndex] ?? '';
    optionsEl.innerHTML = '';
    const last = lineIndex >= payload.lines.length - 1;
    hintEl.textContent = last ? 'E — CLOSE · X — LEAVE' : 'E — CONTINUE · X — LEAVE';
  }
}

function pickOption(i) {
  const opt = payload.offer.options[i];
  if (!opt) return;
  if (onOffer) onOffer({ kind: 'choice', outcomeTag: opt.outcomeTag });
  closeDialogue();
}

export function isDialogueOpen() {
  return payload !== null;
}

export function openDialogue(p, callbacks = {}) {
  if (!p || !p.lines || !p.lines.length) return;
  closeDialogue(); // one dialogue at a time; also fires the previous onClose
  ensureDom();
  payload = p;
  lineIndex = 0;
  choosing = false;
  onOffer = callbacks.onOffer ?? null;
  onClose = callbacks.onClose ?? null;
  keyHandler = (e) => {
    if (e.code === 'KeyX') { closeDialogue(); return; }
    if (choosing && e.code.startsWith('Digit')) pickOption(Number(e.code.slice(5)) - 1);
  };
  document.addEventListener('keydown', keyHandler);
  render();
  panel.classList.add('open');
}

// E pressed while open (routed from walk.js). Steps lines, then resolves the
// offer: 'choice' switches to option-picking; codex/waypoint offers fire
// onOffer once on the final press, then the panel closes.
export function advanceDialogue() {
  if (!payload || choosing) return;
  if (lineIndex < payload.lines.length - 1) {
    lineIndex++;
    render();
    return;
  }
  const offer = payload.offer;
  if (offer && offer.kind === 'choice') {
    choosing = true;
    render();
    return;
  }
  if (offer && onOffer) onOffer(offer);
  closeDialogue();
}

// Idempotent; fires onClose exactly once per open dialogue.
export function closeDialogue() {
  if (!payload) return;
  payload = null;
  choosing = false;
  onOffer = null;
  const cb = onClose;
  onClose = null;
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  if (panel) panel.classList.remove('open');
  if (cb) cb();
}
