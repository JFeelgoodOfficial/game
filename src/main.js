// Boot entry (kept tiny on purpose). The title screen is static markup in
// index.html, so the browser paints it before any of this runs. We then load
// the heavy game module in the background; when it finishes evaluating it
// adopts the static title (menu.js) and flips LOADING… → LAUNCH. This hides
// the ~700 KB parse + planet geometry generation + first-frame shader compile
// behind the visible title instead of a black screen.

import('./game.js').catch((err) => {
  console.error('Game failed to load:', err);
  const btn = document.querySelector('#menu button');
  const sub = document.querySelector('#menu .sub');
  if (sub) sub.textContent = 'SOMETHING WENT WRONG DURING LOAD';
  if (btn) {
    btn.textContent = 'RELOAD';
    btn.disabled = false;
    btn.addEventListener('click', () => location.reload());
  }
});
