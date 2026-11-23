// SEALED: the owner has not played this yet. Do not open.
//
// Season 1, chapter 12: the engine's oldest part, read with the lamp.
//
// The vessel of Entry Zero, along the inner face of the engine, where the
// plating is older than the rest. Six things are here, one in each band of the
// lamp (ENW.bands, in the lamp's own order), and each is held in its band
// until it is read. Once a turn of the pair a wave goes through: the picture
// stretches one way and squeezes the other, and the vessel is shoved across
// what it was looking at. Then every band at once, and what the six add up to.
//
// A site for the platform walker (src/capitalWalk.js), walked under the pause
// (look `dive`), reached by `en:reach` and left by `en:dock`. `S` is the
// system's story (world/SEALED-engine-ship.js).

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { sun } from '../src/sun.js';
import { isDialogueOpen } from '../src/dialogue.js';
import { chapterHud } from '../src/chapterHud.js';
import { lampHud } from '../src/lampHud.js';
import { lamp, LAMP_U, LAMP_GLSL, BAND, stepLamp, lampShows, lampLive, lampState } from '../src/lamp.js';
import { setMusicArea } from '../src/music.js';
import { setEventRumble } from '../src/sfx.js';
import { floorOf } from './capital.js';
import { setHum, setRadio, logChime, hush } from './entryzero-audio.js';
import { BANDS } from './entryzero-dialogue.js';
import { createSceneClock, crewSay } from './sceneClock.js';
import { buildBinary, createVessel, strain, untilWave } from './SEALED-engine-ship.js';
import { ENW } from './SEALED-engine-words.js';

const ZERO = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const WALL_Z = -300; // the old plating: a face the vessel flies along
const START = new THREE.Vector3(0, 10, 230);
// where each band's thing is on the face, in the lamp's order
const AT = [[-300, 40], [-170, -50], [-40, 60], [90, -40], [220, 50], [330, -30]];
const ease = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

const VERT = /* glsl */ `
  varying vec3 vW;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const NOISE = /* glsl */ `
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
  }
`;
// The face: nothing, until the beam is on it; then old plate, and rivets.
const WALL_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  ${NOISE}
  uniform float uShow;
  varying vec3 vW;
  void main() {
    vec2 q = vW.xy;
    vec2 g = fract(q / 26.0);
    float seam = step(g.x, 0.03) + step(g.y, 0.03);
    float rivet = 1.0 - smoothstep(0.0, 0.06, length(fract(q / 6.5) - 0.5)) * 1.0;
    vec3 plate = vec3(0.3, 0.27, 0.24) * (0.6 + 0.4 * vnoise(q * 0.08)) * (1.0 - 0.5 * min(1.0, seam)) + vec3(0.1) * step(0.97, rivet);
    vec3 col = plate * (0.012 + 0.2 * uShow) + plate * uLampTint * lampBeam(vW) * uLampOn * uLampLit * 1.4;
    gl_FragColor = vec4(col, 1.0);
  }
`;
// One of the six: there in its own band, and (once read) faintly in any.
const THING_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  ${NOISE}
  uniform int uKind;
  uniform float uTime;
  uniform float uRead;
  uniform float uShow;
  varying vec3 vW;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    vec3 col;
    float seen;
    if (uKind == 0) {
      // the hull: a small ship's outline, in plate lighter than the rest
      seen = lampLit(0.0, vW);
      float body = step(abs(p.y), 0.22 * (1.0 - 0.6 * smoothstep(0.2, 0.95, abs(p.x)))) * step(abs(p.x), 0.95);
      float fin = step(abs(p.x + 0.6), 0.08) * step(abs(p.y), 0.5);
      col = vec3(0.5, 0.9, 0.82) * max(body, fin) * (0.7 + 0.3 * vnoise(p * 9.0));
    } else if (uKind == 1) {
      // the names: cut small, row on row, and filled with something that fluoresces
      seen = lampLit(1.0, vW);
      vec2 g = vec2(p.x * 26.0, p.y * 34.0);
      vec2 gi = floor(g), gf = fract(g);
      float glyph = step(0.25, h21(gi)) * step(0.12, gf.x) * step(gf.x, 0.3 + 0.6 * h21(gi + 5.0)) * step(0.3, gf.y) * step(gf.y, 0.62);
      col = vec3(0.75, 0.55, 1.0) * glyph * 1.8;
    } else if (uKind == 2) {
      // the warm room: one compartment, warmer than everything round it
      seen = lampSeen(2.0, vW);
      float room = step(abs(p.x), 0.6) * step(abs(p.y), 0.42);
      col = mix(vec3(0.9, 0.25, 0.05), vec3(1.0, 0.85, 0.5), room * (0.7 + 0.3 * vnoise(p * 3.0 + uTime * 0.2))) * (0.25 + 0.75 * room);
    } else if (uKind == 3) {
      // the chart: stars, and one of them ringed
      seen = lampSeen(3.0, vW);
      vec2 g = floor(p * 14.0);
      float star = step(0.9, h21(g)) * (1.0 - smoothstep(0.0, 0.3, length(fract(p * 14.0) - 0.5)));
      float ring = smoothstep(0.03, 0.0, abs(length(p - vec2(0.32, 0.18)) - 0.16));
      col = vec3(1.0, 0.2, 0.3) * (star + ring * 1.6);
    } else if (uKind == 4) {
      // the clock: inside the wall, a dial, and a small wheel to run it on
      seen = lampLit(4.0, vW);
      float dial = smoothstep(0.03, 0.0, abs(r - 0.7)) + smoothstep(0.02, 0.0, abs(r - 0.1));
      float a = atan(p.y, p.x);
      float ticks = step(0.55, r) * step(r, 0.7) * smoothstep(0.08, 0.0, abs(fract(a / 6.2832 * 12.0) - 0.5) - 0.42);
      float hand = step(r, 0.6) * smoothstep(0.03, 0.0, abs(a - 1.3));
      float wheel = smoothstep(0.03, 0.0, abs(length(p - vec2(0.62, -0.62)) - 0.2));
      col = vec3(0.86, 0.9, 1.0) * min(1.0, dial + ticks + hand + wheel) * 1.3;
    } else {
      // the broadcast: not drawn. It is heard, from the way the lamp is pointed.
      discard;
    }
    float al = max(max(seen, uRead * 0.18), uShow); // (every band at once: all of it, whatever the beam is on)
    if (al * dot(col, vec3(1.0)) < 0.01) discard;
    gl_FragColor = vec4(col * al, 1.0);
  }
`;

export function createEngineReach(ctx, S) {
  const { chapter } = ctx;
  const group = new THREE.Group();
  group.visible = false;
  ctx.scene.add(group);
  const time = { value: 0 };
  const show = { value: 0 }; // every band at once (the scene of it)
  // everything the wave strains (the vessel is not: it is what is being shoved)
  const world = new THREE.Group();
  group.add(world);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(1300, 520), new THREE.ShaderMaterial({ uniforms: { ...LAMP_U, uShow: show }, vertexShader: VERT, fragmentShader: WALL_FRAG, fog: false }));
  wall.position.set(0, 0, WALL_Z);
  wall.frustumCulled = false;
  world.add(wall);
  const things = BANDS.map((b, i) => {
    const uniforms = { ...LAMP_U, uKind: { value: i }, uTime: time, uRead: { value: 0 }, uShow: show };
    const m = new THREE.Mesh(new THREE.PlaneGeometry(110, 80), new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: THING_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    m.position.set(AT[i][0], AT[i][1], WALL_Z + 2);
    m.frustumCulled = false;
    m.renderOrder = 5;
    world.add(m);
    return { i, id: b.id, p: m.position, uniforms, hold: 0 };
  });
  // the pair, a long way behind the vessel, and the way out toward it
  const pair = buildBinary({ r: 150, sep: 600, engine: false });
  pair.group.position.set(-500, 300, 3600);
  pair.group.rotation.x = 0.5;
  world.add(pair.group);
  const exitRing = new THREE.Mesh(new THREE.TorusGeometry(26, 1.2, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.1, 0.7), fog: false }));
  exitRing.position.copy(START).z += 40;
  group.add(exitRing);
  const v = createVessel(group);

  let inside = false, prev = null, scene = null, panelText = null, hintT = 0, wasWave = 0, radioNear = 0, armed = false;
  const later = [];
  const _ext = new THREE.Vector3();
  const say = (line, sec) => crewSay(chapter, line, sec);
  const readN = () => things.filter((t) => S.k1() & (1 << t.i)).length;

  function begin(kind, clock) {
    scene = { kind, clock };
    chapterHud.panel((panelText = null));
    chapterHud.cine(true);
    v.vel.set(0, 0, 0);
    clock.begin();
  }
  const inClock = createSceneClock({
    T: C.EN_S2, lines: ENW.approach, say: (l) => say(l, 6),
    pose(u) {
      const k = ease(0, C.EN_S2, u);
      v.at.set(-260 + 260 * k, 60 - 50 * k, 900 - 670 * k);
      v.yaw = Math.PI + 0.25 * (1 - k);
      v.pitch = -0.05;
    },
    onEnd() {
      scene = null;
      chapterHud.cine(false);
      S.advA('en_2');
      v.at.copy(START);
      v.yaw = Math.PI;
      v.pitch = 0;
      later.push({ text: ENW.readHint, sec: 11 });
    },
  });
  const allClock = createSceneClock({
    T: C.EN_S3, lines: ENW.reveal, say: (l) => say(l, 8),
    pose(u) {
      // carried along the whole face, far enough back to have all six in the glass
      const k = ease(0, C.EN_S3, u);
      v.at.set(-230 + 460 * k, 8, 170 - 40 * Math.sin(k * Math.PI));
      v.yaw = Math.PI + 0.3 * (0.5 - k);
      v.pitch = 0;
      show.value = ease(0, 6, u);
    },
    onEnd() {
      scene = null;
      chapterHud.cine(false);
      lamp.canAll = false;
      lamp.power = C.EN_L1;
      show.value = 0;
      S.advA('en_4');
      v.at.set(0, 10, 120);
      v.yaw = 0;
      v.pitch = 0;
      later.push(ENW.afterReveal, { text: ENW.hud.back, sec: 8 });
    },
  });

  const surfaces = [{ kind: 'disc', cx: 0, cz: 0, r: 1.2, y: 0 }];
  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: UP },
    noShip: true,
    hidePilot: true,
    exit: { x: 0, z: 0 },
    leaveHint: ENW.hud.back,
    surfaces,
    colliders: [],
    floorYAt: floorOf(surfaces, 1.2),
    snap: 1.2,
    pad: new THREE.Vector3(),
    spawn: new THREE.Vector3(),
    spawnYaw: 0,
    npcs: [],
    consoles: [],
    onChoice: () => null,
    portal: null,
    held: () => true,
    act() {
      if (scene) scene.clock.skip();
    },
    heldPrompt: () => (scene ? ENW.skip : null),
    camera: (pos, target) => v.camera(pos, target),
    setWalker() {},
    onEnter() {
      if (inside) return;
      inside = true;
      site.portal = null;
      group.visible = true;
      prev = { fog: ctx.scene.fog, lightI: sun.light.intensity, ambI: sun.ambient.intensity, lampPower: lamp.power, lampMedium: lamp.medium, lampCanAll: lamp.canAll, lampOn: lamp.on, lampBand: lamp.band };
      ctx.scene.fog = null;
      sun.light.intensity = 0;
      sun.ambient.intensity = 0;
      if (ctx.hideFleet) ctx.hideFleet();
      v.board(C.EN_L1, false);
      lampHud.show(true, true, ENW.keys);
      scene = null;
      later.length = 0;
      panelText = null;
      hintT = 0;
      armed = false;
      for (const t of things) {
        t.hold = 0;
        t.uniforms.uRead.value = S.k1() & (1 << t.i) ? 1 : 0;
      }
      if (!S.reachedA('en_2')) begin('in', inClock);
      else {
        v.at.copy(START);
        v.yaw = Math.PI;
        v.pitch = 0;
      }
    },
    onLeave() {
      setMusicArea(1);
      if (!inside) return;
      inside = false;
      if (scene) {
        scene.clock.stop();
        scene = null;
      }
      group.visible = false;
      lampHud.show(false);
      hush();
      setEventRumble(0);
      chapterHud.clear();
      chapterHud.panel(null);
      panelText = null;
      world.scale.set(1, 1, 1);
      show.value = 0;
      lamp.power = prev.lampPower;
      lamp.medium = prev.lampMedium;
      lamp.canAll = prev.lampCanAll;
      lamp.on = prev.lampOn;
      lamp.band = prev.lampBand;
      stepLamp(0, false);
      ctx.scene.fog = prev.fog;
      sun.light.intensity = prev.lightI;
      sun.ambient.intensity = prev.ambI;
      prev = null;
    },
    inside: () => inside,
    tick(dt, t) {
      if (inside) setMusicArea(0);
      chapterHud.tick(dt);
      time.value = t;
      const d = Math.min(dt, 0.1);
      const st = S.a();
      const shown = !!scene; // (a frame that began in a scene ends in it)
      // the wave: once a turn, through everything
      const h = strain(t, C.EN_P1);
      world.scale.set(1 + h * C.EN_P2, 1 - h * C.EN_P2, 1);
      pair.pose((t / C.EN_P1) * Math.PI * 2, 1, 0);
      setEventRumble(Math.abs(h) * 0.6);
      const k = v.helm(!shown && !isDialogueOpen());
      if (scene) scene.clock.tick(d);
      else if (isDialogueOpen()) v.vel.multiplyScalar(Math.exp(-3 * d));
      else {
        _ext.set(h * C.EN_P3, -h * C.EN_P3 * 0.6, 0); // (shoved across the face, one way and then the other)
        for (let rem = d; rem > 1e-5; rem -= 1 / 60) v.step(Math.min(rem, 1 / 60), k, _ext);
        // the face ahead, and how far the vessel will go
        v.at.z = Math.max(WALL_Z + 60, Math.min(320, v.at.z));
        v.at.x = Math.max(-520, Math.min(520, v.at.x));
        v.at.y = Math.max(-200, Math.min(200, v.at.y));
      }
      setHum(0.25 + 0.75 * v.push);
      v.place(!!scene && scene.kind === 'all');
      const live = lampLive();
      // the radio band is an ear: louder the nearer the lamp points at what is playing
      const rt = things[BAND.RADIO];
      let near = 0;
      if (live && lamp.band === BAND.RADIO && !scene) {
        const dir = rt.p.clone().sub(v.at);
        const dist = dir.length();
        near = Math.pow(Math.max(0, dir.dot(lamp.dir) / Math.max(dist, 1)), 6) * Math.max(0.2, 1 - dist / 900);
      }
      radioNear += (near - radioNear) * Math.min(1, d * 5);
      setRadio(live && lamp.band === BAND.RADIO, radioNear);
      if (shown) {
        lampHud.update();
        return;
      }
      if (later.length && !isDialogueOpen() && chapterHud.state().line == null) {
        const l = later.shift();
        if (l && l.by !== undefined) say(l, 7);
        else if (l) chapterHud.say(l.text, l.sec || 7);
      }
      // --- the six: each held in its band, from near enough ---
      if (st === 'en_2' && !isDialogueOpen()) {
        for (const tg of things) {
          if (S.k1() & (1 << tg.i)) continue;
          const nearEnough = v.at.distanceTo(tg.p) < C.EN_L3;
          const on = tg.i === BAND.RADIO ? live && lamp.band === BAND.RADIO && radioNear > 0.55 : lampShows(tg.i, tg.p) > 0;
          tg.hold = nearEnough && on ? tg.hold + d : 0;
          if (tg.hold >= C.EN_L2) {
            S.read(tg.i);
            tg.uniforms.uRead.value = 1;
            logChime();
            const b = ENW.bands[tg.id];
            chapterHud.say(ENW.found.replace('{name}', b.name).replace('{find}', b.find), 8);
            later.push(b.line);
          }
        }
        hintT += d;
        if (hintT > 45) {
          hintT = 0;
          chapterHud.say(ENW.hud.find, 7);
        }
        if (readN() === things.length) S.advA('en_3');
      }
      // ...and then every band at once
      if (S.a() === 'en_3' && later.length === 0 && !isDialogueOpen() && chapterHud.state().line == null) {
        lamp.on = true;
        lamp.canAll = true;
        lamp.power = 4;
        begin('all', allClock);
        return;
      }
      // --- the way back out: through the ring it came in by (once the vessel has been away from it) ---
      const out = v.at.distanceTo(exitRing.position);
      if (out > 90) armed = true;
      if (armed && out < 30 && !site.portal) site.portal = 'en:dock';
      const w = untilWave(t, C.EN_P1);
      const rows = [`${ENW.hud.wave}${String(Math.ceil(w)).padStart(2, '0')}`];
      if (st === 'en_2') rows.push(`${ENW.hud.read}${readN()} / ${things.length}`);
      if (S.reachedA('en_4')) rows.push(ENW.hud.back);
      const text = rows.join('\n');
      if (text !== panelText) chapterHud.panel((panelText = text));
      if (wasWave <= 0 && h !== 0) wasWave = 1;
      if (h === 0) wasWave = 0;
      lampHud.update();
    },
    places: { start: START.toArray(), exit: exitRing.position.toArray(), things: things.map((tg) => ({ id: tg.id, p: tg.p.toArray() })) },
    info: () => ({
      inside, at: v.at.toArray().map((x) => +x.toFixed(1)), yaw: +v.yaw.toFixed(3), pitch: +v.pitch.toFixed(3), scene: scene ? { kind: scene.kind, u: +scene.clock.u().toFixed(2) } : null,
      lamp: inside ? lampState() : null, read: readN(), k1: S.k1(), radio: +radioNear.toFixed(2), strain: +world.scale.x.toFixed(3), panel: panelText,
    }),
    dbg: {
      skip: () => (scene ? scene.clock.skip() : false),
      put(o) {
        if (o.at) v.at.fromArray(o.at);
        if (o.look) v.look(new THREE.Vector3().fromArray(o.look));
        if (Number.isFinite(o.yaw)) v.yaw = o.yaw;
        if (Number.isFinite(o.pitch)) v.pitch = o.pitch;
        v.vel.set(0, 0, 0);
        v.avY = v.avX = 0;
        return site.info();
      },
      band(id) {
        const want = BAND[String(id).toUpperCase()];
        for (let i = 0; i < 6 && lamp.band !== want; i++) lamp.band = (lamp.band + 1) % 6;
        lamp.changed++;
        return lamp.band === want;
      },
      read(i) {
        for (const tg of things) if (i == null || tg.i === i) {
          S.read(tg.i);
          tg.uniforms.uRead.value = 1;
        }
        return S.k1();
      },
    },
  };
  return site;
}
