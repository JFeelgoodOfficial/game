// Radio console (user mechanic) — a small dashboard panel over the cockpit
// image: prev/next track buttons and a scrolling readout of the current
// song title. Sits with the other dashboard controls, so it fades with the
// cockpit frame (visible at idle, gone at boost) but stays clickable
// whenever it's visible. `,` and `.` switch tracks from the keyboard too
// (see input.js).

import { nextTrack, prevTrack, currentTitle, onTrackChange } from './music.js';

const CSS = `
#radio {
  position: fixed; left: 18px; bottom: 22px; z-index: 12;
  display: flex; align-items: center; gap: 8px;
  font-family: 'Courier New', ui-monospace, monospace;
  padding: 8px 12px; border-radius: 4px; user-select: none;
  color: #a9f7ff; background: rgba(10,20,30,0.55);
  border: 1px solid rgba(130,247,255,0.5);
  box-shadow: 0 0 20px rgba(130,247,255,0.22), inset 0 0 16px rgba(130,247,255,0.06);
  transition: opacity 0.2s;
}
#radio.hidden { opacity: 0 !important; pointer-events: none; }
#radio .r-btn {
  cursor: pointer; font-size: 14px; line-height: 1; padding: 6px 9px;
  color: #ffc9ec; border: 1px solid rgba(212,64,143,0.55); border-radius: 3px;
  background: rgba(212,64,143,0.12);
  text-shadow: 0 0 8px rgba(255,120,200,0.6);
  transition: background 0.15s;
}
#radio .r-btn:hover { background: rgba(212,64,143,0.32); }
#radio .r-tag {
  font-size: 9px; letter-spacing: 0.3em; color: #7ad7e0; align-self: center;
  writing-mode: vertical-rl; transform: rotate(180deg);
  text-shadow: 0 0 6px rgba(130,247,255,0.5);
}
#radio .r-screen {
  width: 190px; overflow: hidden; white-space: nowrap;
  padding: 5px 0; border-radius: 2px;
  background: rgba(4,10,16,0.85); border: 1px solid rgba(130,247,255,0.3);
  box-shadow: inset 0 0 10px rgba(0,0,0,0.6);
}
#radio .r-scroll {
  display: inline-block; font-size: 12px; letter-spacing: 0.18em;
  color: #82f7ff; text-shadow: 0 0 8px rgba(130,247,255,0.8);
  padding-left: 0; animation: radio-scroll 9s linear infinite;
}
@keyframes radio-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
`;

let panel, scroll;

function refresh() {
  // the text is doubled so the -50% translate loops seamlessly
  const t = currentTitle() + ' · ';
  scroll.textContent = t + t;
  // restart the marquee from the left on a track change
  scroll.style.animation = 'none';
  void scroll.offsetWidth; // reflow so the animation actually restarts
  scroll.style.animation = '';
}

export function initRadio() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  panel = document.createElement('div');
  panel.id = 'radio';
  panel.className = 'hidden';

  const tag = document.createElement('div');
  tag.className = 'r-tag';
  tag.textContent = 'RADIO';
  panel.appendChild(tag);

  const prev = document.createElement('div');
  prev.className = 'r-btn';
  prev.textContent = '⏮';
  prev.addEventListener('click', prevTrack);
  panel.appendChild(prev);

  const screen = document.createElement('div');
  screen.className = 'r-screen';
  scroll = document.createElement('span');
  scroll.className = 'r-scroll';
  screen.appendChild(scroll);
  panel.appendChild(screen);

  const next = document.createElement('div');
  next.className = 'r-btn';
  next.textContent = '⏭';
  next.addEventListener('click', nextTrack);
  panel.appendChild(next);

  document.body.appendChild(panel);
  onTrackChange(refresh);
  refresh();

  // keyboard track switching works even when the pointer is locked
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Comma') prevTrack();
    if (e.code === 'Period') nextTrack();
  });
}

// Fades with the cockpit frame: the radio is part of the dashboard.
// `active` is false on the menu so it never floats over the title screen.
export function updateRadio(frameBlend, active) {
  const visible = active && frameBlend > 0.15;
  panel.classList.toggle('hidden', !visible);
  if (visible) panel.style.opacity = Math.min(frameBlend * 1.4, 1).toFixed(3);
}
