// Visual prototypes (GDD 5.7.10): test scenes for looks a later season needs,
// reached only through `__debug.proto`. Nothing in the game leads to them: no
// story stage, no menu, no key.
//
//   __debug.proto.glass.open()    glass that holds light (world/proto-glass.js)
//   __debug.proto.strobe.open()   a battle lit only by a pulsar's beam (world/proto-strobe.js)
//   .close()  .state()  .set(o)   and, for the strobe, .step(n)
//
// The scenes are their own lazy chunk, fetched the first time one is opened
// (so `open()` returns a promise). This file is the host: it lends a prototype
// the screen and takes it back.
//
// How the screen is lent. A prototype has a scene and a camera of its own.
// While one is open, the renderer's `render` is wrapped: the frame the game
// would have drawn of its own scene is drawn of the prototype's instead, and
// every pass after it (bloom, anti-aliasing) runs as usual. The game's own
// scene is not touched, so there is nothing of it to put back. What IS changed,
// and restored by `close()` exactly: `renderer.render`, the exposure, the
// bloom's threshold and strength, `__debug.paused`, `__debug.hideCockpit`, and
// a class on <body> that puts the HUD away.

let mod = null, loading = null;
let open = null; // { name, proto, saved }
let styled = false;
const built = {};

const dbg = () => window.__debug;
function load() {
  if (mod) return Promise.resolve(mod);
  if (!loading) {
    loading = import('../world/proto-scenes.js')
      .then((m) => (mod = { glass: m.createGlassProto, strobe: m.createStrobeProto }))
      .catch((err) => {
        loading = null;
        console.warn('[proto] the prototypes could not be loaded', err);
        return null;
      });
  }
  return loading;
}

function release() {
  if (!open) return false;
  const { proto, saved } = open;
  const d = dbg();
  d.renderer.render = saved.render;
  d.renderer.toneMappingExposure = saved.exposure;
  d.bloom.threshold = saved.bloomThreshold;
  d.bloom.strength = saved.bloomStrength;
  d.paused = saved.paused;
  d.hideCockpit = saved.hideCockpit;
  document.body.classList.remove('proto-on');
  proto.leave();
  open = null;
  return true;
}

async function take(name) {
  const d = dbg();
  if (!d || !d.renderer || !d.scene) return false;
  const m = await load();
  if (!m) return false;
  if (open && open.name === name) return true;
  release();
  if (!styled) {
    styled = true;
    const style = document.createElement('style');
    style.textContent = 'body.proto-on > *:not(canvas) { opacity: 0 !important; pointer-events: none !important; }';
    document.head.appendChild(style);
  }
  const tier = d.quality.report().tier;
  // (built once per tier: a prototype is not rebuilt because the tier changed under it)
  const key = `${name}:${tier}`;
  if (!built[key]) built[key] = m[name]({ renderer: d.renderer, tier });
  const proto = built[key];
  const saved = {
    render: d.renderer.render, exposure: d.renderer.toneMappingExposure,
    bloomThreshold: d.bloom.threshold, bloomStrength: d.bloom.strength, paused: d.paused, hideCockpit: d.hideCockpit,
  };
  const gameScene = d.scene, gameRender = saved.render.bind(d.renderer);
  let last = performance.now();
  d.renderer.render = function (scene, camera) {
    if (scene !== gameScene) return gameRender(scene, camera); // a pass's own quad: as it was
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    return proto.frame(dt, gameRender);
  };
  d.paused = true; // the flight is held where it is
  d.hideCockpit = true;
  document.body.classList.add('proto-on');
  proto.enter(d);
  open = { name, proto, saved };
  return true;
}

const handle = (name) => ({
  open: () => take(name),
  close: () => (open && open.name === name ? release() : false),
  state: () => (open && open.name === name ? { open: true, ...open.proto.state() } : { open: false, loaded: !!mod }),
  set: (o) => (open && open.name === name ? open.proto.set(o || {}) : false),
  step: (n) => (open && open.name === name && open.proto.step ? open.proto.step(n) : false),
});

export const protoDebug = () => ({ glass: handle('glass'), strobe: handle('strobe'), close: release, which: () => (open ? open.name : null) });
