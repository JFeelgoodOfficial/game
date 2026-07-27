// On-foot control hint (user mechanic). A compact ON FOOT key panel sits
// bottom-left (the radio's corner — the radio hides on foot). The flight
// controls now live on the 3D dashboard itself (cockpit3d.js), so the old
// in-flight CTRL popup is gone. Driven per frame from game.js via
// updateControls().

import { currentGravityScale, currentBoardable, cottageActive } from './walkLazy.js';
import { setEquipButtonVisible } from './vehicleMenu.js';

const CSS = `
#walkHint {
  position: fixed; left: 16px; bottom: 16px; z-index: 12;
  pointer-events: none; user-select: none;
  padding: 10px 14px; border-radius: 4px;
  font-family: 'Courier New', ui-monospace, monospace; font-size: 11px;
  line-height: 1.75; letter-spacing: 0.18em; color: #9fd8e8;
  background: rgba(4,12,20,0.55); border: 1px solid rgba(130,247,255,0.35);
  box-shadow: 0 0 16px rgba(130,247,255,0.15);
  transition: opacity 0.3s; opacity: 0;
}
#walkHint.on { opacity: 1; }
#walkHint .wh-title {
  color: #82f7ff; letter-spacing: 0.34em; margin-bottom: 2px;
  text-shadow: 0 0 8px rgba(130,247,255,0.6);
}
#walkHint .wh-grav {
  color: #ffd06a; letter-spacing: 0.3em; margin-top: 2px;
  text-shadow: 0 0 8px rgba(255,208,106,0.6);
}
#walkHint .wh-board {
  color: #ff9a5a; letter-spacing: 0.3em; margin-top: 2px;
  text-shadow: 0 0 8px rgba(255,154,90,0.6);
}
#walkHint .wh-obj {
  color: #ff8fd0; letter-spacing: 0.3em; margin-top: 6px;
  padding-top: 6px; border-top: 1px solid rgba(212,64,143,0.35);
  text-shadow: 0 0 8px rgba(212,64,143,0.7);
}
@media (max-width: 640px) {
  #walkHint {
    font-size: 10px; letter-spacing: 0.1em;
    max-width: calc(100vw - 32px); box-sizing: border-box;
  }
}
`;

const WALK_LINES = [
  'W A S D — MOVE · MOUSE — LOOK',
  'SHIFT — RUN · SPACE — JUMP',
  'E — TALK · T — VIEW · SCROLL — ZOOM',
  'G — BOARD (AT YOUR SHIP) · , . — MUSIC',
  'I — EQUIPMENT · B — USE SELECTED',
  'P — PHOTO · R — RECORD (PICS)',
];

// The cottage has no NPCs, no equipment and no quests — listing keys that do
// nothing is worse than listing none. Four lines, and one of them is the way out.
const COTTAGE_LINES = [
  'W A S D — MOVE · MOUSE — LOOK',
  'SHIFT — RUN · SPACE — JUMP',
  'T — VIEW · SCROLL — ZOOM',
  'G — BOARD (AT THE PAD) · , . — MUSIC',
];

let walkHint, gravLine, boardLine, objLine;
let lineEls = [];
let lastWalkOn = null;
let lastObjective = null;
let lastLines = null;

export function initControls() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  walkHint = document.createElement('div');
  walkHint.id = 'walkHint';
  const title = document.createElement('div');
  title.className = 'wh-title';
  title.textContent = 'ON FOOT';
  walkHint.appendChild(title);
  // One element per line, reused: the two key sets are different lengths, so
  // the surplus rows hide rather than churn the DOM on every world change.
  const rows = Math.max(WALK_LINES.length, COTTAGE_LINES.length);
  for (let i = 0; i < rows; i++) {
    const el = document.createElement('div');
    walkHint.appendChild(el);
    lineEls.push(el);
  }
  gravLine = document.createElement('div');
  gravLine.className = 'wh-grav';
  gravLine.textContent = 'LOW GRAVITY';
  gravLine.style.display = 'none';
  walkHint.appendChild(gravLine);
  boardLine = document.createElement('div');
  boardLine.className = 'wh-board';
  boardLine.textContent = 'SNOWBOARD RIDES HERE';
  boardLine.style.display = 'none';
  walkHint.appendChild(boardLine);
  objLine = document.createElement('div');
  objLine.className = 'wh-obj';
  objLine.style.display = 'none';
  walkHint.appendChild(objLine);
  document.body.appendChild(walkHint);
}

// The one thing an accepted quest wants from you, kept on screen for as long as
// it is true. Everything else about a quest is a toast that fades in four
// seconds, which left the player with no record of what they had taken on.
// Called every frame; touches the DOM only when the text actually changes.
export function setObjective(text) {
  if (text === lastObjective) return;
  lastObjective = text;
  objLine.style.display = text ? '' : 'none';
  if (text) objLine.textContent = text;
}

function setLines(lines) {
  if (lines === lastLines) return;
  lastLines = lines;
  for (let i = 0; i < lineEls.length; i++) {
    const text = lines[i];
    lineEls[i].style.display = text ? '' : 'none';
    if (text) lineEls[i].textContent = text;
  }
}

export function updateControls(phase) {
  // walk hint: on-foot only
  const walkOn = phase === 'walk';
  const cottage = walkOn && cottageActive();
  if (walkOn !== lastWalkOn) {
    walkHint.classList.toggle('on', walkOn);
    // No equipment in the cottage — the quest vehicles don't come here.
    setEquipButtonVisible(walkOn && !cottage);
    lastWalkOn = walkOn;
    if (walkOn) {
      gravLine.style.display = currentGravityScale() < 0.7 ? '' : 'none';
      boardLine.style.display = currentBoardable() ? '' : 'none';
    }
  }
  if (walkOn) setLines(cottage ? COTTAGE_LINES : WALK_LINES);
}
