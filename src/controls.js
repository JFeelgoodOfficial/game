// On-foot control hint (user mechanic). A compact ON FOOT key panel sits
// bottom-left (the radio's corner — the radio hides on foot). The flight
// controls now live on the 3D dashboard itself (cockpit3d.js), so the old
// in-flight CTRL popup is gone. Driven per frame from game.js via
// updateControls().

import { currentGravityScale } from './walkLazy.js';

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
`;

const WALK_LINES = [
  'W A S D — MOVE · MOUSE — LOOK',
  'SHIFT — RUN · SPACE — JUMP',
  'E — TALK · T — VIEW · SCROLL — ZOOM',
  'G — BOARD (AT YOUR SHIP) · , . — MUSIC',
  'P — PHOTO · R — RECORD (PICS)',
];

let walkHint, gravLine;
let lastWalkOn = null;

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
  for (const line of WALK_LINES) {
    const el = document.createElement('div');
    el.textContent = line;
    walkHint.appendChild(el);
  }
  gravLine = document.createElement('div');
  gravLine.className = 'wh-grav';
  gravLine.textContent = 'LOW GRAVITY';
  gravLine.style.display = 'none';
  walkHint.appendChild(gravLine);
  document.body.appendChild(walkHint);
}

export function updateControls(phase) {
  // walk hint: on-foot only
  const walkOn = phase === 'walk';
  if (walkOn !== lastWalkOn) {
    walkHint.classList.toggle('on', walkOn);
    lastWalkOn = walkOn;
    if (walkOn) {
      gravLine.style.display = currentGravityScale() < 0.7 ? '' : 'none';
    }
  }
}
