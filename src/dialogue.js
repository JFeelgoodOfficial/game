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
//
// Touch (no E, no digits, no X): tap the panel to continue, tap an option to
// pick it, tap LEAVE to go.

import { isTouch } from './touchText.js';
import { cineOpen, cineRender, cineClose } from './cineTalk.js';
import { addMet } from './journal.js';

const CSS = `
#dlgPanel {
  position: fixed; left: 50%; bottom: 12%; transform: translateX(-50%);
  z-index: 14; pointer-events: none; opacity: 0; transition: opacity 0.25s;
  min-width: min(340px, 92vw); max-width: min(720px, 92vw);
  box-sizing: border-box; padding: 16px 24px 14px;
  font-family: 'Courier New', ui-monospace, monospace; color: #a9f7ff;
  background: rgba(4,10,16,0.9); border: 1px solid rgba(130,247,255,0.45);
  border-radius: 4px; box-shadow: 0 0 24px rgba(130,247,255,0.15);
  user-select: none;
}
#dlgPanel.open { opacity: 1; }
#dlgPanel .dlg-speaker {
  font-size: 13px; letter-spacing: 0.3em; color: #ffc9ec;
  text-shadow: 0 0 10px rgba(212,64,143,0.8); margin-bottom: 8px;
}
#dlgPanel .dlg-speaker .dlg-meta {
  color: #7ad7e0; text-shadow: 0 0 6px rgba(130,247,255,0.5);
}
#dlgPanel .dlg-line {
  font-size: 17px; line-height: 1.5; letter-spacing: 0.04em; color: #e6fdff;
  text-shadow: 0 0 6px rgba(130,247,255,0.35); min-height: 1.5em;
}
#dlgPanel .dlg-options { margin-top: 8px; font-size: 15px; line-height: 1.7; }
#dlgPanel .dlg-options .dlg-opt {
  color: #ffc9ec; text-shadow: 0 0 8px rgba(212,64,143,0.7); letter-spacing: 0.1em;
}
/* Touch: the panel takes taps, and keeps clear of the two sticks. */
body.touch-ui #dlgPanel { max-width: min(720px, calc(100vw - 300px)); bottom: 8%; }
body.touch-ui #dlgPanel .dlg-line { font-size: 16px; line-height: 1.4; }
body.touch-ui #dlgPanel.open { pointer-events: auto; z-index: 20; }
body.touch-ui #dlgPanel .dlg-opt {
  padding: 8px 10px; margin-top: 6px; border-radius: 3px;
  border: 1px solid rgba(212,64,143,0.55); background: rgba(212,64,143,0.12);
}
#dlgPanel .dlg-leave {
  float: right; margin-left: 14px; padding: 2px 10px; color: #ffc9ec;
  border: 1px solid rgba(212,64,143,0.6); border-radius: 3px; letter-spacing: 0.24em;
}
#dlgPanel .dlg-hint {
  margin-top: 10px; font-size: 12px; letter-spacing: 0.26em; color: #7ad7e0;
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
let cine = null; // the payload's `cine` field while a cinematic talk is up (cineTalk.js)

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
    if (isTouch) {
      panel.addEventListener('touchstart', (e) => {
        if (!payload) return;
        e.preventDefault();
        e.stopPropagation();
        const t = e.target;
        if (t.closest('.dlg-leave')) closeDialogue();
        else if (t.closest('.dlg-opt')) pickOption(Number(t.closest('.dlg-opt').dataset.i));
        else advanceDialogue();
      }, { passive: false });
    }
  }
}

function render() {
  if (cine) {
    const d = getDialogueDisplay();
    cineRender({
      speaker: d.speaker,
      meta: ' · ' + payload.speaker.species, // the place is in the picture
      line: d.line,
      options: choosing ? payload.offer.options.map((o) => o.label) : null,
      last: lineIndex >= payload.lines.length - 1 && !(payload.offer && payload.offer.kind === 'choice'),
      shotHint: payload.shots ? payload.shots[lineIndex] : undefined,
    });
    return;
  }
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
      row.textContent = isTouch ? opt.label : `[${i + 1}] ${opt.label}`;
      row.dataset.i = String(i);
      optionsEl.appendChild(row);
    });
    setHint(isTouch ? 'TAP A CHOICE' : `1–${payload.offer.options.length} — CHOOSE · X — LEAVE`);
  } else {
    lineEl.textContent = payload.lines[lineIndex] ?? '';
    optionsEl.innerHTML = '';
    const last = lineIndex >= payload.lines.length - 1;
    setHint(isTouch
      ? (last ? 'TAP TO CLOSE' : 'TAP TO CONTINUE')
      : (last ? 'E — CLOSE · X — LEAVE' : 'E — CONTINUE · X — LEAVE'));
  }
}

function setHint(text) {
  hintEl.textContent = text;
  if (isTouch) {
    const leave = document.createElement('span');
    leave.className = 'dlg-leave';
    leave.textContent = 'LEAVE';
    hintEl.appendChild(leave);
  }
}

function pickOption(i) {
  const opt = payload.offer.options[i];
  if (!opt) return;
  // The host may return a FOLLOW-UP payload from the pick (vendor branching
  // menus, world/vendors.js): swap it in place and keep the panel open —
  // nested menus recurse naturally. Every existing caller returns nothing
  // from onOffer, so their choice dialogues still close exactly as before.
  const next = onOffer ? onOffer({ kind: 'choice', outcomeTag: opt.outcomeTag }) : null;
  if (next && next.lines && next.lines.length) {
    payload = next;
    lineIndex = 0;
    choosing = false;
    render();
    return;
  }
  closeDialogue();
}

export function isDialogueOpen() {
  return payload !== null;
}

// Snapshot of what #dlgPanel is showing, for the video compositor
// (capture.js). null when no dialogue is open.
export function getDialogueDisplay() {
  if (!payload) return null;
  const s = payload.speaker;
  const last = lineIndex >= payload.lines.length - 1;
  return {
    speaker: s.name.toUpperCase(),
    meta: ' · ' + s.species + (s.cityId ? ' · ' + s.cityId : ''),
    line: choosing ? payload.offer.prompt : (payload.lines[lineIndex] ?? ''),
    options: choosing
      ? payload.offer.options.map((opt, i) => `[${i + 1}] ${opt.label}`)
      : null,
    hint: choosing
      ? `1–${payload.offer.options.length} — CHOOSE · X — LEAVE`
      : (last ? 'E — CLOSE · X — LEAVE' : 'E — CONTINUE · X — LEAVE'),
  };
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
  cine = p.cine || null;
  if (p.speaker && p.speaker.name) addMet(p.speaker.name, p.speaker.species, p.speaker.cityId);
  keyHandler = (e) => {
    if (e.code === 'KeyX') { closeDialogue(); return; }
    if (choosing && e.code.startsWith('Digit')) pickOption(Number(e.code.slice(5)) - 1);
  };
  document.addEventListener('keydown', keyHandler);
  if (cine) cineOpen(cine, { advance: advanceDialogue, pick: pickOption, skip: skipDialogue });
  render();
  if (!cine) panel.classList.add('open');
}

// SKIP in a cinematic talk: straight to the end. A choice is never made for
// the player — skipping stops at it. With no choice, the offer (a codex
// entry, a waypoint) is still handed over, exactly as if every line was read.
export function skipDialogue() {
  if (!payload || choosing) return;
  lineIndex = payload.lines.length - 1;
  advanceDialogue();
}

export const isCinematic = () => cine !== null;

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
  if (cine) {
    cine = null;
    cineClose();
  }
  if (cb) cb();
}
