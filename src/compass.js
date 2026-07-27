// On-foot compass (user mechanic): a small dial pinned top-center while
// walking a planet, its arrow pointing at whatever you're currently headed for
// relative to where you're looking, with the straight-line distance underneath.
// Fed by walk.js walkBearing() from game.js each frame; hidden in every other
// mode. The target is the live quest beacon when there is one and the parked
// ship otherwise — the caption says which, and turns accent-coloured for a
// quest so the two never read the same.

const CSS = `
#compass {
  position: fixed; top: 18px; left: 50%; transform: translateX(-50%);
  z-index: 12; pointer-events: none; user-select: none;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  font-family: 'Courier New', ui-monospace, monospace; color: #a9f7ff;
  transition: opacity 0.35s;
}
#compass.hidden { opacity: 0; }
#compass .c-dial {
  width: 52px; height: 52px; border-radius: 50%;
  border: 1px solid rgba(130,247,255,0.55);
  background: rgba(4,12,20,0.55);
  box-shadow: 0 0 18px rgba(130,247,255,0.25), inset 0 0 12px rgba(130,247,255,0.08);
  display: flex; align-items: center; justify-content: center;
}
#compass .c-arrow {
  width: 0; height: 0; border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-bottom: 22px solid #82f7ff;
  filter: drop-shadow(0 0 6px rgba(130,247,255,0.8));
  transform-origin: 50% 68%;
}
#compass .c-dist {
  font-size: 11px; letter-spacing: 0.3em; white-space: nowrap;
  color: #7ad7e0; text-shadow: 0 0 8px rgba(130,247,255,0.6);
}
#compass.quest .c-arrow {
  border-bottom-color: #ff8fd0;
  filter: drop-shadow(0 0 6px rgba(212,64,143,0.9));
}
#compass.quest .c-dist {
  color: #ff8fd0; text-shadow: 0 0 8px rgba(212,64,143,0.7);
}
`;

let root, arrow, dist;
let lastShown = null; // visibility cache — avoid per-frame class churn
let lastDist = -1;
let lastLabel = null;
let lastQuest = null;

export function initCompass() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  root = document.createElement('div');
  root.id = 'compass';
  root.classList.add('hidden');

  const dial = document.createElement('div');
  dial.className = 'c-dial';
  arrow = document.createElement('div');
  arrow.className = 'c-arrow';
  dial.appendChild(arrow);

  dist = document.createElement('div');
  dist.className = 'c-dist';
  dist.textContent = 'SHIP';

  root.appendChild(dial);
  root.appendChild(dist);
  document.body.appendChild(root);
}

// info: {angle (rad, 0 = ahead, + = right), dist, label} from walk.js, or null
// to hide. A label other than SHIP means a quest target, which tints the dial.
export function updateCompass(info) {
  const show = !!info;
  if (show !== lastShown) {
    root.classList.toggle('hidden', !show);
    lastShown = show;
  }
  if (!show) return;
  arrow.style.transform = `rotate(${((info.angle * 180) / Math.PI).toFixed(1)}deg)`;
  const label = info.label ?? 'SHIP';
  const quest = label !== 'SHIP';
  if (quest !== lastQuest) {
    root.classList.toggle('quest', quest);
    lastQuest = quest;
  }
  const d = Math.round(info.dist);
  if (d !== lastDist || label !== lastLabel) {
    lastDist = d;
    lastLabel = label;
    dist.textContent = `${label} · ${d}m`;
  }
}
