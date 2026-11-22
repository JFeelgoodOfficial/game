// A cut to black shared by anything that needs one (the bed in the pilot's
// suite). One DOM element; CSS runs the fade so nothing here needs a frame
// callback. The mine keeps its own (src/mineWalk.js), which outlives its walker.
let el = null;
export function fadeTo(opacity, seconds) {
  if (typeof document === 'undefined') return;
  if (!el) {
    el = document.createElement('div');
    el.id = 'sceneFade';
    el.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:5;';
    document.body.appendChild(el);
  }
  el.style.transition = seconds > 0 ? `opacity ${seconds}s ease` : 'none';
  if (seconds <= 0) void el.offsetWidth; // commit the jump before any later transition
  el.style.opacity = String(opacity);
}
