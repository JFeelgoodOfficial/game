// On-foot camera view choice (first vs third person). The first time the
// pilot ever steps onto a planet an overlay offers the choice; it's stored
// (localStorage, same graceful degradation as nav.js) and reused on every
// later disembark. T toggles between views any time on foot — and the toggle
// updates the stored preference, so the pref always mirrors the last view used.
//
// The chooser is keyboard-driven (1 / 3) so it works under pointer lock;
// the buttons also work with a free cursor. The game keeps running behind it.

const PREF_KEY = 'sf-walk-view';

const CSS = `
#viewChooser {
  position: fixed; inset: 0; z-index: 26;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 22px; background: radial-gradient(ellipse at center, rgba(8,2,14,0.15), rgba(4,0,10,0.6));
  font-family: 'Courier New', ui-monospace, monospace; color: #a9f7ff;
  transition: opacity 0.35s; user-select: none;
}
#viewChooser.hidden { opacity: 0; pointer-events: none; }
#viewChooser .vc-title {
  font-size: 17px; letter-spacing: 0.4em; color: #ffc9ec;
  text-shadow: 0 0 14px rgba(212,64,143,0.8);
}
#viewChooser .vc-row { display: flex; gap: 26px; }
#viewChooser button {
  font: inherit; font-size: 14px; letter-spacing: 0.26em; padding: 14px 34px;
  background: rgba(130,247,255,0.06); color: #a9f7ff; cursor: pointer;
  border: 1px solid rgba(130,247,255,0.5); border-radius: 4px;
  text-shadow: 0 0 8px rgba(130,247,255,0.7);
  box-shadow: 0 0 20px rgba(130,247,255,0.18), inset 0 0 16px rgba(130,247,255,0.06);
  transition: background 0.2s, box-shadow 0.2s;
}
#viewChooser button:hover {
  background: rgba(212,64,143,0.25);
  box-shadow: 0 0 30px rgba(212,64,143,0.45), inset 0 0 20px rgba(212,64,143,0.12);
}
#viewChooser .vc-sub {
  font-size: 12px; letter-spacing: 0.3em; color: #7ad7e0;
  text-shadow: 0 0 8px rgba(130,247,255,0.5);
}
#viewToast {
  position: fixed; top: 14%; left: 50%; transform: translateX(-50%);
  z-index: 12; pointer-events: none; opacity: 0; transition: opacity 0.5s;
  font-family: 'Courier New', ui-monospace, monospace; font-size: 13px;
  letter-spacing: 0.34em; color: #a9f7ff; padding: 8px 24px;
  border: 1px solid rgba(130,247,255,0.45); border-radius: 3px;
  background: rgba(4,10,16,0.5); text-shadow: 0 0 8px rgba(130,247,255,0.6);
}
`;

let styled = false;
let chooser = null;
let toast = null;
let toastTimer = null;
let keyHandler = null;
let pref = undefined; // undefined = not read yet; null = no stored choice

function ensureStyle() {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
}

// localStorage can throw (privacy modes) — degrade to session-only memory,
// same policy as the nav discovery log.
export function getViewPref() {
  if (pref === undefined) {
    try {
      const v = localStorage.getItem(PREF_KEY);
      pref = v === 'fp' || v === 'tp' ? v : null;
    } catch {
      pref = null;
    }
  }
  return pref;
}

export function setViewPref(v) {
  pref = v;
  try {
    localStorage.setItem(PREF_KEY, v);
  } catch {
    /* session-only */
  }
}

export function toggleViewPref() {
  const next = getViewPref() === 'fp' ? 'tp' : 'fp';
  setViewPref(next);
  return next;
}

// First-ever disembark: offer the choice. Resolves via onPick('fp'|'tp').
// Keys 1/3 work under pointer lock; the buttons work with a free cursor.
export function showViewChooser(onPick) {
  ensureStyle();
  if (!chooser) {
    chooser = document.createElement('div');
    chooser.id = 'viewChooser';
    chooser.innerHTML = `
      <div class="vc-title">CHOOSE YOUR VIEW</div>
      <div class="vc-row">
        <button data-view="fp">[1] FIRST PERSON</button>
        <button data-view="tp">[3] THIRD PERSON</button>
      </div>
      <div class="vc-sub">T TOGGLES ANYTIME &middot; SHIFT RUN &middot; SPACE JUMP &middot; G BOARD SHIP</div>
    `;
    document.body.appendChild(chooser);
  }
  chooser.classList.remove('hidden');

  const pick = (v) => {
    setViewPref(v);
    chooser.classList.add('hidden');
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    onPick(v);
  };
  for (const b of chooser.querySelectorAll('button')) {
    b.onclick = () => pick(b.dataset.view);
  }
  keyHandler = (e) => {
    if (e.code === 'Digit1' || e.code === 'Numpad1') pick('fp');
    else if (e.code === 'Digit3' || e.code === 'Numpad3') pick('tp');
  };
  document.addEventListener('keydown', keyHandler);
}

// Brief on-foot reminder shown on later disembarks (the chooser only ever
// appears once).
export function showViewToast(text, seconds = 4) {
  ensureStyle();
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'viewToast';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.style.opacity = '1';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
  }, seconds * 1000);
}

export function hideViewUI() {
  if (chooser) chooser.classList.add('hidden');
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  if (toast) toast.style.opacity = '0';
}
