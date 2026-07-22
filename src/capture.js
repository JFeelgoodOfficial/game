// In-game camera (user mechanic). P takes a photo of exactly what's on screen
// — the rendered scene composited with the DOM HUD — and R toggles a silent
// screen recording of the canvas. Both land in a session-only gallery (PICS
// button / panel) where each item can be downloaded or deleted. Nothing is
// persisted: closing the tab clears the gallery.
//
// Photos: the WebGL canvas has no preserveDrawingBuffer, so the pixels must be
// copied in the same task right after composer.render() — capturePendingPhoto
// is called from the frame loop for that reason. The HUD (DOM text panels,
// buttons) is layered on afterwards via an SVG <foreignObject> snapshot, with
// the cockpit-frame <img> layers drawn in between. Anything tagged
// data-nocapture (the shutter flash, the REC dot) is excluded.
//
// Video: rather than record the full-resolution WebGL canvas directly (a large
// surface + software VP9 encode that made gameplay choppy, and which can't see
// the DOM dialogue), we composite each frame onto a small 720p offscreen 2D
// canvas — the scaled scene plus the current dialogue drawn with 2D text APIs —
// and record that. updateRecordingFrame runs from the frame loop in the same
// task as composer.render(), for the same preserveDrawingBuffer reason.

import { getDialogueDisplay } from './dialogue.js';

const CSS = `
#capBtn {
  position: fixed; right: 286px; bottom: 22px; z-index: 12;
  padding: 11px 24px; cursor: pointer; user-select: none;
  font-family: 'Courier New', ui-monospace, monospace; font-size: 14px;
  letter-spacing: 0.34em; color: #a9f7ff;
  background: rgba(130,247,255,0.06); border: 1px solid rgba(130,247,255,0.5);
  border-radius: 4px; text-shadow: 0 0 8px rgba(130,247,255,0.7);
  box-shadow: 0 0 20px rgba(130,247,255,0.22), inset 0 0 16px rgba(130,247,255,0.06);
  transition: opacity 0.2s, background 0.15s;
}
#capBtn:hover { background: rgba(130,247,255,0.16); }
#capBtn.hidden { opacity: 0 !important; pointer-events: none; }
#capFlash {
  position: fixed; inset: 0; z-index: 40; pointer-events: none;
  background: #fff; opacity: 0; transition: opacity 0.28s ease-out;
}
#recDot {
  position: fixed; top: 16px; left: 16px; z-index: 13; display: none;
  align-items: center; gap: 8px; pointer-events: none; user-select: none;
  font-family: 'Courier New', ui-monospace, monospace; font-size: 13px;
  letter-spacing: 0.2em; color: #ff6a6a; text-shadow: 0 0 8px rgba(255,90,90,0.7);
}
#recDot.on { display: flex; }
#recDot .dot {
  width: 11px; height: 11px; border-radius: 50%; background: #ff3838;
  box-shadow: 0 0 10px rgba(255,60,60,0.9); animation: rec-blink 1s step-end infinite;
}
@keyframes rec-blink { 50% { opacity: 0.25; } }
#capToast {
  position: fixed; top: 20%; left: 50%; transform: translateX(-50%);
  z-index: 13; pointer-events: none; opacity: 0; transition: opacity 0.4s;
  font-family: 'Courier New', ui-monospace, monospace; font-size: 13px;
  letter-spacing: 0.3em; color: #a9f7ff; padding: 8px 22px;
  border: 1px solid rgba(130,247,255,0.6); border-radius: 3px;
  background: rgba(4,20,30,0.55); text-shadow: 0 0 10px rgba(130,247,255,0.7);
}
#galPanel {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  z-index: 24; display: none; flex-direction: column; width: min(94vw, 820px);
  box-sizing: border-box; max-height: 86vh;
  padding: 16px 18px 12px; border-radius: 6px; user-select: none;
  font-family: 'Courier New', ui-monospace, monospace; color: #a9f7ff;
  background: rgba(4,12,20,0.92); border: 1px solid rgba(130,247,255,0.55);
  box-shadow: 0 0 44px rgba(130,247,255,0.3), inset 0 0 30px rgba(130,247,255,0.06);
}
#galPanel.open { display: flex; }
#galPanel .g-title {
  font-size: 12px; letter-spacing: 0.42em; color: #7ad7e0; margin-bottom: 12px;
  text-align: center; text-shadow: 0 0 8px rgba(130,247,255,0.6);
}
#galPanel .g-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px; overflow-y: auto; padding: 2px;
}
#galPanel .g-cell { position: relative; border: 1px solid rgba(130,247,255,0.35); border-radius: 3px; overflow: hidden; background: #000; }
#galPanel .g-cell img, #galPanel .g-cell video { display: block; width: 100%; height: 100px; object-fit: cover; }
#galPanel .g-cell .g-actions {
  display: flex; gap: 6px; padding: 5px; background: rgba(4,12,20,0.85);
  font-size: 10px; letter-spacing: 0.1em;
}
#galPanel .g-cell a, #galPanel .g-cell button {
  flex: 1; text-align: center; text-decoration: none; cursor: pointer;
  color: #a9f7ff; background: rgba(130,247,255,0.08); border: 1px solid rgba(130,247,255,0.4);
  border-radius: 2px; padding: 3px 0; font: inherit; font-size: 10px; letter-spacing: 0.1em;
}
#galPanel .g-cell button.del { color: #ff8a8a; border-color: rgba(255,110,110,0.4); }
#galPanel .g-empty { color: #5da8b3; text-align: center; padding: 30px 0; letter-spacing: 0.2em; font-size: 12px; }
#galPanel .g-foot { font-size: 10px; letter-spacing: 0.26em; color: #5da8b3; margin-top: 10px; text-align: center; }
@media (max-width: 640px) {
  #capBtn {
    right: 12px; bottom: 14px; padding: 10px 16px;
    font-size: 12px; letter-spacing: 0.2em;
  }
  #galPanel .g-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
}
`;

let renderer = null;
let capBtn, flash, recDot, recDotTime, toast, panel, grid, foot;
let pendingPhoto = false;
let toastTimer = 0;
let lastBtnShown = null;

// session-only gallery: object URLs are revoked on delete
const items = []; // { kind: 'photo'|'video', blob, url, ts }

// recording state
let mediaRecorder = null;
let recChunks = [];
let recording = false;
let recSeconds = 0;
const REC_MAX = 180; // auto-stop, seconds — bounds in-memory blob size

// video is composited onto a small offscreen canvas (scene + dialogue), and
// that canvas is what MediaRecorder captures — these exist only while recording
let recCanvas = null; // offscreen 2D compositing canvas
let recCtx = null;
let recStream = null;
let recTrack = null; // CanvasCaptureMediaStreamTrack (for requestFrame), may be null
let recNextFrame = 0; // ms timestamp accumulator for the fps throttle
const REC_HEIGHT = 720; // capture height; width follows the window aspect
const REC_FPS = 30;
const REC_BPS = 8_000_000; // 8 Mbps — starfield/noise content is bitrate-hungry

let galleryOpen = false;

export function initCapture(gameRenderer) {
  renderer = gameRenderer;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  capBtn = document.createElement('div');
  capBtn.id = 'capBtn';
  capBtn.textContent = 'PICS';
  capBtn.classList.add('hidden');
  capBtn.addEventListener('click', () => (galleryOpen ? closeGallery() : openGallery()));
  document.body.appendChild(capBtn);

  flash = document.createElement('div');
  flash.id = 'capFlash';
  flash.setAttribute('data-nocapture', '');
  document.body.appendChild(flash);

  recDot = document.createElement('div');
  recDot.id = 'recDot';
  recDot.setAttribute('data-nocapture', '');
  const dot = document.createElement('span');
  dot.className = 'dot';
  recDotTime = document.createElement('span');
  recDotTime.textContent = 'REC 0:00';
  recDot.appendChild(dot);
  recDot.appendChild(recDotTime);
  document.body.appendChild(recDot);

  toast = document.createElement('div');
  toast.id = 'capToast';
  toast.setAttribute('data-nocapture', '');
  document.body.appendChild(toast);

  panel = document.createElement('div');
  panel.id = 'galPanel';
  panel.setAttribute('data-nocapture', '');
  const title = document.createElement('div');
  title.className = 'g-title';
  title.textContent = 'GALLERY';
  grid = document.createElement('div');
  grid.className = 'g-grid';
  foot = document.createElement('div');
  foot.className = 'g-foot';
  foot.textContent = 'P — PHOTO · R — RECORD · X — CLOSE';
  panel.appendChild(title);
  panel.appendChild(grid);
  panel.appendChild(foot);
  document.body.appendChild(panel);
}

export function isGalleryOpen() {
  return galleryOpen;
}

// --- photos ---------------------------------------------------------------

export function requestPhoto() {
  pendingPhoto = true;
}

// Called from the frame loop immediately after composer.render(): the canvas
// still holds this frame's pixels (no preserveDrawingBuffer), so grab them now.
export function capturePendingPhoto() {
  if (!pendingPhoto || !renderer) return;
  pendingPhoto = false;
  const canvas = renderer.domElement;
  const bw = canvas.width, bh = canvas.height;
  const out = document.createElement('canvas');
  out.width = bw; out.height = bh;
  const ctx = out.getContext('2d');
  // 1) the rendered scene (synchronous — must be this task)
  try { ctx.drawImage(canvas, 0, 0, bw, bh); } catch { return; }
  // 2) the cockpit-frame / yoke <img> layers, at their current opacity
  for (const el of document.querySelectorAll('body > img')) {
    const cs = getComputedStyle(el);
    const op = parseFloat(cs.opacity) || 0;
    if (op < 0.01 || cs.display === 'none') continue;
    ctx.save();
    ctx.globalAlpha = op;
    try { ctx.drawImage(el, 0, 0, bw, bh); } catch { /* skip */ }
    ctx.restore();
  }
  // 3) the DOM HUD on top, via an SVG foreignObject snapshot (async), then save
  compositeHudThenSave(out, ctx, bw, bh);
  flashShutter();
}

function compositeHudThenSave(out, ctx, bw, bh) {
  let done = false;
  let svgUrl = null;
  const finalize = () => {
    if (done) return; // run exactly once (onload / onerror / timeout race)
    done = true;
    if (svgUrl) URL.revokeObjectURL(svgUrl);
    out.toBlob((blob) => { if (blob) addItem('photo', blob); }, 'image/png');
  };
  try {
    const w = window.innerWidth, h = window.innerHeight;
    const clone = document.body.cloneNode(true);
    // strip anything that isn't screen HUD text (the canvas, images/videos —
    // already drawn — and the capture chrome itself)
    clone.querySelectorAll('canvas, img, video, script, style, [data-nocapture]')
      .forEach((n) => n.remove());
    let css = '';
    for (const s of document.querySelectorAll('style')) css += s.textContent;
    const inner = clone.innerHTML;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<foreignObject x="0" y="0" width="100%" height="100%">` +
      `<div xmlns="http://www.w3.org/1999/xhtml">` +
      `<style>${css}</style>${inner}</div></foreignObject></svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    svgUrl = URL.createObjectURL(blob);
    const im = new Image();
    im.onload = () => {
      try { ctx.drawImage(im, 0, 0, bw, bh); } catch { /* keep scene+frame */ }
      finalize();
    };
    im.onerror = () => finalize();
    // Safety net: if the HUD image never resolves, still save scene+frame.
    setTimeout(finalize, 1200);
    im.src = svgUrl;
  } catch {
    finalize(); // graceful: scene + cockpit frame only
  }
}

function flashShutter() {
  flash.style.opacity = '0.85';
  requestAnimationFrame(() => { flash.style.opacity = '0'; });
  showToast('PHOTO SAVED — PICS');
}

// --- recording ------------------------------------------------------------

function pickMimeType() {
  // VP8 first: canvas MediaRecorder encoding is software libvpx in practice, and
  // realtime VP8 is much cheaper per frame than VP9. At a fixed 8 Mbps for
  // 720p30 VP9's better compression buys nothing, while its CPU cost is exactly
  // what dropped frames. Only recording uses this — photos are unaffected.
  const opts = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'];
  for (const t of opts) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export function toggleRecording() {
  if (recording) { stopRecording(); return; }
  if (!renderer || !window.MediaRecorder) {
    showToast('RECORDING NOT SUPPORTED');
    return;
  }
  try {
    const gl = renderer.domElement;
    // fixed-size offscreen canvas: aspect of the current window, capped at 720
    // tall, even width (encoders reject odd dimensions). Size stays fixed for
    // the whole recording — resizing a captured canvas mid-stream glitches
    // encoders — so mid-recording resizes are letterboxed instead.
    const aspect = gl.width / gl.height;
    recCanvas = document.createElement('canvas');
    recCanvas.height = REC_HEIGHT;
    recCanvas.width = Math.round((REC_HEIGHT * aspect) / 2) * 2;
    recCtx = recCanvas.getContext('2d', { alpha: false });
    if (!recCtx || !recCanvas.captureStream) throw new Error('unsupported');

    // Prefer explicit frame control: captureStream(0) + requestFrame() emits
    // exactly one encoded frame per composite draw — no duplicate-frame encoding
    // and no reliance on the browser's dirty-canvas heuristics. Fall back to
    // auto mode where requestFrame is unavailable.
    recStream = recCanvas.captureStream(0);
    recTrack = recStream.getVideoTracks()[0];
    if (!recTrack || typeof recTrack.requestFrame !== 'function') {
      if (typeof recStream.requestFrame === 'function') {
        recTrack = recStream; // old Firefox: requestFrame lives on the stream
      } else {
        recTrack = null;
        recStream.getTracks().forEach((t) => t.stop());
        recStream = recCanvas.captureStream(REC_FPS); // auto mode fallback
      }
    }

    const mimeType = pickMimeType();
    mediaRecorder = new MediaRecorder(recStream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: REC_BPS,
    });
    recChunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recChunks, { type: mediaRecorder.mimeType || 'video/webm' });
      recChunks = [];
      if (blob.size) addItem('video', blob);
      showToast('CLIP SAVED — PICS');
    };
    mediaRecorder.start(1000); // 1s timeslice: bounds chunk memory, less lost on failure
    recording = true;
    recSeconds = 0;
    recNextFrame = 0;
    recDot.classList.add('on');
    recDotTime.textContent = 'REC 0:00';
  } catch {
    releaseRecordingSurface();
    showToast('RECORDING FAILED');
  }
}

function stopRecording() {
  if (!recording) return;
  recording = false;
  recDot.classList.remove('on');
  try { mediaRecorder.stop(); } catch { /* already stopped */ }
  // safe to tear down now: the recorder already holds its data; onstop fires
  // async and only touches recChunks
  releaseRecordingSurface();
}

function releaseRecordingSurface() {
  if (recStream) recStream.getTracks().forEach((t) => t.stop());
  recStream = null;
  recTrack = null;
  recCtx = null;
  recCanvas = null;
}

// Composite one video frame: scaled scene + dialogue. Must run in the same task
// as composer.render() — the WebGL canvas has no preserveDrawingBuffer, so its
// pixels are only readable before this task ends (same as capturePendingPhoto).
export function updateRecordingFrame(now) {
  if (!recording || !recCtx) return;
  // throttle to REC_FPS; rAF runs at the display refresh (often 60/120hz)
  if (now < recNextFrame) return;
  // drift-free accumulator, but never queue a burst of catch-up frames after a
  // stall (rAF also pauses on tab blur)
  recNextFrame = Math.max(recNextFrame + 1000 / REC_FPS, now - 1000 / REC_FPS);

  const gl = renderer.domElement;
  const w = recCanvas.width, h = recCanvas.height;
  const scale = Math.min(w / gl.width, h / gl.height);
  const dw = gl.width * scale, dh = gl.height * scale;
  recCtx.fillStyle = '#000';
  recCtx.fillRect(0, 0, w, h);
  try { recCtx.drawImage(gl, (w - dw) / 2, (h - dh) / 2, dw, dh); } catch { return; }

  drawDialogueOverlay(recCtx, w, h);
  if (recTrack) recTrack.requestFrame();
}

const DLG_FONT = "'Courier New', ui-monospace, monospace";

// Wrap `text` to lines no wider than maxWidth, using ctx's current font.
function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? cur + ' ' + word : word;
    if (cur && ctx.measureText(next).width > maxWidth) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// Mirror the #dlgPanel DOM overlay (dialogue.js CSS) onto the video frame with
// 2D canvas drawing. captureStream sees only canvas pixels, so the DOM panel is
// invisible in recordings — this reproduces it. Its opacity fade isn't mirrored;
// the panel pops in/out on video.
function drawDialogueOverlay(ctx, w, h) {
  const d = getDialogueDisplay();
  if (!d) return;

  const PAD_X = 22, PAD_TOP = 14, PAD_BOT = 12;
  const MAXW = 620, MINW = 340;
  const textMax = MAXW - PAD_X * 2; // 576, matches the DOM max-width minus padding

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  // Measure everything first to size the panel.
  const rows = []; // { text, font, color, glow, lh, gapBefore }
  rows.push({
    text: null, // speaker is name + meta, drawn specially
    speaker: d.speaker, meta: d.meta,
    font: `12px ${DLG_FONT}`, lh: 16, gapBefore: 0,
  });
  ctx.font = `14px ${DLG_FONT}`;
  const lineRows = wrapText(ctx, d.line, textMax);
  lineRows.forEach((t, i) => rows.push({
    text: t, font: `14px ${DLG_FONT}`, color: '#a9f7ff',
    glow: 'rgba(130,247,255,0.5)', lh: 21, gapBefore: i === 0 ? 8 : 0,
  }));
  if (d.options) {
    d.options.forEach((t, i) => rows.push({
      text: t, font: `13px ${DLG_FONT}`, color: '#ffc9ec',
      glow: 'rgba(212,64,143,0.7)', lh: 22, gapBefore: i === 0 ? 8 : 0,
    }));
  }
  rows.push({
    text: d.hint, font: `10px ${DLG_FONT}`, color: '#7ad7e0',
    glow: 'rgba(130,247,255,0.4)', lh: 14, gapBefore: 10,
  });

  // widest row → panel width
  let widest = 0;
  for (const r of rows) {
    ctx.font = r.font;
    const measure = r.speaker != null
      ? ctx.measureText(r.speaker + r.meta).width
      : ctx.measureText(r.text).width;
    if (measure > widest) widest = measure;
  }
  const panelW = Math.max(MINW, Math.min(MAXW, widest + PAD_X * 2));
  let contentH = 0;
  for (const r of rows) contentH += r.gapBefore + r.lh;
  const panelH = PAD_TOP + contentH + PAD_BOT;

  const panelX = (w - panelW) / 2;
  const panelBottom = h * 0.88; // CSS bottom: 12%
  const panelY = panelBottom - panelH;

  // panel background + border
  ctx.save();
  ctx.beginPath();
  const r = 4;
  if (ctx.roundRect) ctx.roundRect(panelX, panelY, panelW, panelH, r);
  else ctx.rect(panelX, panelY, panelW, panelH);
  ctx.fillStyle = 'rgba(4,10,16,0.72)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(130,247,255,0.45)';
  ctx.stroke();
  ctx.restore();

  // rows, top-down
  const textX = panelX + PAD_X;
  let y = panelY + PAD_TOP;
  for (const row of rows) {
    y += row.gapBefore;
    ctx.font = row.font;
    if (row.speaker != null) {
      // name in pink, meta suffix in teal, each with its own glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(212,64,143,0.8)';
      ctx.fillStyle = '#ffc9ec';
      ctx.fillText(row.speaker, textX, y);
      const nameW = ctx.measureText(row.speaker).width;
      ctx.shadowColor = 'rgba(130,247,255,0.5)';
      ctx.fillStyle = '#7ad7e0';
      ctx.fillText(row.meta, textX + nameW, y);
    } else {
      ctx.shadowBlur = 6;
      ctx.shadowColor = row.glow;
      ctx.fillStyle = row.color;
      ctx.fillText(row.text, textX, y);
    }
    y += row.lh;
  }
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}

// --- gallery UI -----------------------------------------------------------

function addItem(kind, blob) {
  const url = URL.createObjectURL(blob);
  items.unshift({ kind, blob, url, ts: items.length ? items[0].ts + 1 : 1 });
  if (galleryOpen) renderGrid();
}

function renderGrid() {
  grid.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'g-empty';
    empty.textContent = 'NO CAPTURES YET — P PHOTO · R RECORD';
    grid.appendChild(empty);
    return;
  }
  items.forEach((it, i) => {
    const cell = document.createElement('div');
    cell.className = 'g-cell';
    const media = document.createElement(it.kind === 'video' ? 'video' : 'img');
    media.src = it.url;
    if (it.kind === 'video') { media.muted = true; media.loop = true; media.autoplay = true; media.playsInline = true; }
    const actions = document.createElement('div');
    actions.className = 'g-actions';
    const dl = document.createElement('a');
    dl.textContent = 'SAVE';
    dl.href = it.url;
    dl.download = it.kind === 'video' ? `fgsf-clip-${it.ts}.webm` : `fgsf-photo-${it.ts}.png`;
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = 'DELETE';
    del.addEventListener('click', () => {
      URL.revokeObjectURL(it.url);
      const idx = items.indexOf(it);
      if (idx >= 0) items.splice(idx, 1);
      renderGrid();
    });
    actions.appendChild(dl);
    actions.appendChild(del);
    cell.appendChild(media);
    cell.appendChild(actions);
    grid.appendChild(cell);
  });
}

function openGallery() {
  galleryOpen = true;
  panel.classList.add('open');
  document.exitPointerLock?.();
  renderGrid();
  document.addEventListener('keydown', onGalleryKey);
}

function closeGallery() {
  if (!galleryOpen) return;
  galleryOpen = false;
  panel.classList.remove('open');
  document.removeEventListener('keydown', onGalleryKey);
}

function onGalleryKey(e) {
  if (e.code === 'KeyX') closeGallery();
}

// Toggle the camera / PICS pop-up. Called by the dash PHOTO button (cockpit3d.js)
// in flight, replacing the corner PICS button that only shows on foot now.
export function toggleGallery() {
  if (galleryOpen) closeGallery();
  else openGallery();
}

function showToast(text) {
  toast.textContent = text;
  toast.style.opacity = '1';
  toastTimer = 2.2;
}

// --- per-frame ------------------------------------------------------------

export function updateCapture(phase, frameBlend, delta) {
  // PICS button: on foot only. In flight the camera lives on the dash PHOTO
  // button (which opens this gallery), so the corner button would be redundant.
  const shown = phase === 'walk';
  if (shown !== lastBtnShown) {
    capBtn.classList.toggle('hidden', !shown);
    lastBtnShown = shown;
  }
  if (shown) capBtn.style.opacity = '1';

  if (recording) {
    recSeconds += delta;
    const s = Math.floor(recSeconds);
    recDotTime.textContent = `REC ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (recSeconds >= REC_MAX) stopRecording();
  }
  // never keep recording once we leave gameplay
  if (phase === 'menu' && recording) stopRecording();

  if (toastTimer > 0) {
    toastTimer -= delta;
    if (toastTimer <= 0) toast.style.opacity = '0';
  }
}
