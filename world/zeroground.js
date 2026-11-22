// On the ground of the first world (GDD 5.7.5): the relics.
//
// The vessel hangs overhead with every band of its lamp on one patch of the
// planet, and inside that light the ground is ground: a pool of it some
// ninety units wide, with nothing past the edge. The pilot goes down on a
// tether with the two captains who did not stay at the lamp, and a lamp that
// is carried by hand.
//
//   the relics   three, each seen in its own band and no other (RELICS):
//                the makers' writing (ultraviolet), the last warm place
//                (infrared), what is buried (X-ray). Held in its band from
//                near by, a relic gives up one fragment of the story. Any order.
//   the clock    the lamp overhead. Light eaters wear it down, faster the
//                longer it burns, and as it goes the pool comes in. With none
//                left everyone still on it is hauled up; the pilot can go down
//                again on a fresh lamp for what was not found.
//   the edge     the pilot is on a tether and cannot leave the light. The
//                captains are not: they follow the pilot, at a walk. One who is
//                past the edge when it comes in is gone, and stays gone
//                (chapter.ez.lose). Nobody has to be lost: lead them back in.
//
// Who stayed aboard changes how fast the pool comes in and how early they
// call the eaters (STAY, in the writing file; placeholder numbers).
//
// A site for the platform walker (src/capitalWalk.js), reached from the
// submersible through its hatch and left up the tether (FAR_HOPS).

import { setMusicArea } from '../src/music.js';
import * as THREE from 'three';
import { C } from '../src/constants.js';
import { sun } from '../src/sun.js';
import { input } from '../src/input.js';
import { cWalk } from '../src/capitalWalk.js';
import { chapterHud } from '../src/chapterHud.js';
import { lampHud } from '../src/lampHud.js';
import { lamp, LAMP_U, LAMP_GLSL, nextBand, toggleLamp, stepLamp, lampShows, lampLive, resetLamp, lampState } from '../src/lamp.js';
import { poseRig } from './aliens.js';
import { standRig } from './rigGround.js';
import { buildCaptain, liveCaptain } from './captainDress.js';
import { BEAM_VERT, BEAM_FRAG } from './submersible.js';
import { logChime, bandClick, hush } from './entryzero-audio.js';
import { CAPTAINS } from './chapter-dialogue.js';
import { BANDS, RELICS, STAY, GROUND } from './entryzero-dialogue.js';

const ZERO = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const SHIP_Y = 85; // the vessel, overhead
// where the relics are, from under the hatch: [angle, distance]
const RELIC_AT = { writing: [0.6, 62], hearth: [2.9, 46], buried: [4.6, 74] };

const WORLD_VERT = /* glsl */ `
  varying vec3 vW;
  varying vec3 vL;
  varying vec3 vN;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vL = position;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const NOISE = /* glsl */ `
  float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
`;
// The ground: there as far as the vessel's light, and not at all beyond it.
const GROUND_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  ${NOISE}
  uniform float uPool;
  uniform float uTime;
  varying vec3 vW;
  void main() {
    float r = length(vW.xz);
    if (r > uPool) discard;
    vec3 p = vec3(vW.xz, 0.0);
    float grain = 0.55 + 0.45 * vnoise(p * 0.4) + 0.3 * (vnoise(p * 2.3) - 0.5);
    float crack = smoothstep(0.0, 0.06, abs(vnoise(p * 0.09 + 5.0) - 0.5));
    vec3 rock = vec3(0.3, 0.25, 0.2) * grain * (0.45 + 0.55 * crack);
    // every band, from overhead: white, strongest under the hatch
    float over = 0.2 + 0.5 * (1.0 - smoothstep(0.0, uPool, r));
    vec3 col = rock * over;
    // ...and the one band of the lamp in the pilot's hand
    col += rock * uLampTint * lampBeam(vec3(vW.x, 0.0, vW.z)) * uLampOn * uLampLit * 1.6;
    // the edge: where the light stops, the ground is fraying
    float edge = smoothstep(uPool - 2.5, uPool, r);
    col = mix(col, vec3(0.75, 0.95, 1.0) * (0.5 + 0.5 * sin(uTime * 7.0 + atan(vW.z, vW.x) * 31.0)), edge * 0.8);
    gl_FragColor = vec4(col, 1.0);
  }
`;
// A relic: nothing, except in the band its matter answers in.
const RELIC_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  ${NOISE}
  uniform int uKind;
  uniform float uTime;
  uniform float uFound;
  varying vec3 vW;
  varying vec3 vL;
  varying vec3 vN;
  void main() {
    vec3 col;
    float seen;
    if (uKind == 0) {
      // the writing: cut into a standing stone, and filled with something that fluoresces
      seen = lampLit(1.0, vW);
      vec2 g = vec2(vL.x * 3.2, vL.y * 2.4);
      vec2 gi = floor(g), gf = fract(g);
      float glyph = step(0.3, h31(vec3(gi, 3.0))) * step(0.15, gf.x) * step(gf.x, 0.3 + 0.55 * h31(vec3(gi, 7.0))) * step(0.3, gf.y) * step(gf.y, 0.6);
      col = vec3(0.14, 0.1, 0.3) + vec3(0.7, 0.55, 1.0) * glyph * 2.0 * step(0.4, abs(vL.z)); // (on its two broad faces)
    } else if (uKind == 1) {
      // the hearth: a ring of stones round somewhere that has not gone cold
      seen = lampSeen(2.0, vW);
      float r = length(vL.xz);
      col = mix(vec3(1.0, 0.8, 0.45), vec3(0.8, 0.18, 0.04), smoothstep(0.0, 3.2, r)) * (0.5 + 0.5 * vnoise(vec3(vL.xz * 1.3, uTime * 0.4)));
    } else {
      // what is buried: the ground is thin to X-rays, and this is not
      seen = lampLit(4.0, vW);
      float r = length(vL.xz), a = atan(vL.z, vL.x);
      float ring = smoothstep(0.35, 0.1, abs(r - 5.4)) + smoothstep(0.3, 0.08, abs(r - 2.2));
      float spokes = smoothstep(0.1, 0.03, abs(fract(a / 6.2832 * 7.0) - 0.5)) * step(r, 5.4) * step(2.2, r);
      float vault = smoothstep(1.3, 1.0, r);
      col = vec3(0.8, 0.86, 1.0) * min(1.0, ring + spokes + vault) * 1.3;
    }
    // (once read it stays, faintly, whatever the band)
    float a = max(seen, uFound * 0.22);
    if (a * dot(col, vec3(1.0)) < 0.01) discard;
    gl_FragColor = vec4(col * a, 1.0);
  }
`;

// ctx: { scene, camera, hideFleet(), chapter, resume() — put the vessel back over the ground for the way up }
export function createZeroGround(ctx) {
  const { chapter } = ctx;
  const group = new THREE.Group();
  group.visible = false;
  ctx.scene.add(group);
  const time = { value: 0 };
  const pool = { value: C.EZ_POOL_R };

  // --- the ground, the light it is in, and the vessel that is holding it there ---
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(C.EZ_POOL_R + 4, 96).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms: { ...LAMP_U, uPool: pool, uTime: time }, vertexShader: WORLD_VERT, fragmentShader: GROUND_FRAG, fog: false }),
  );
  ground.frustumCulled = false;
  group.add(ground);
  const shaftMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.85, 1.0), transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 1, SHIP_Y, 48, 1, true).translate(0, SHIP_Y / 2, 0), shaftMat);
  shaft.frustumCulled = false;
  shaft.renderOrder = 4;
  group.add(shaft);
  const vessel = new THREE.Group();
  vessel.add(new THREE.Mesh(new THREE.CapsuleGeometry(1.6, 4.4, 4, 12).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b1014, fog: false })));
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2), fog: false }));
  eye.position.y = -1.5;
  vessel.add(eye);
  vessel.position.y = SHIP_Y;
  group.add(vessel);
  // the tether: from the hatch to where the pilot is
  const tether = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 5, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.33, 0.38), fog: false }));
  tether.frustumCulled = false;
  group.add(tether);
  // the eaters, round the beam up there: more of them the longer it burns
  const EAT = 14;
  const eaterGeo = new THREE.OctahedronGeometry(1, 0).scale(1, 0.5, 1.7);
  const eaters = new THREE.InstancedMesh(eaterGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.7, 0.8), fog: false }), EAT);
  eaters.frustumCulled = false;
  group.add(eaters);

  // --- the relics ---
  const relics = RELICS.map((r, i) => {
    const [a, d] = RELIC_AT[r.id];
    const at = new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d);
    const band = BANDS.findIndex((b) => b.id === r.band);
    const geo = r.id === 'writing' ? new THREE.BoxGeometry(3.2, 5.6, 0.9).translate(0, 2.8, 0)
      : r.id === 'hearth' ? new THREE.CircleGeometry(3.4, 28).rotateX(-Math.PI / 2).translate(0, 0.06, 0)
        : new THREE.CircleGeometry(6.4, 40).rotateX(-Math.PI / 2).translate(0, 0.05, 0);
    const uniforms = { ...LAMP_U, uKind: { value: i }, uTime: time, uFound: { value: 0 } };
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms, vertexShader: WORLD_VERT, fragmentShader: RELIC_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    mesh.position.copy(at);
    mesh.rotation.y = Math.atan2(-at.x, -at.z); // facing back toward the hatch
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    group.add(mesh);
    // (looked at a little above the ground, where the eye and the lamp are)
    return { def: r, i, at, look: at.clone().setY(r.id === 'writing' ? 2.8 : 0.3), band, uniforms, hold: 0 };
  });

  // --- the lamp in the pilot's hand ---
  const hand = new THREE.Group();
  hand.rotation.order = 'YXZ';
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(Math.tan(C.EZ_LAMP_CONE), 1, 24, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms: LAMP_U, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
  );
  beam.frustumCulled = false;
  beam.renderOrder = 7;
  hand.add(beam);
  group.add(hand);

  // --- the captains: all three are made; whoever is down here is shown ---
  const crew = CAPTAINS.map((c, i) => {
    const rig = buildCaptain(c.id);
    rig.group.visible = false;
    group.add(rig.group);
    return { c, rig, on: false, yaw: 0, pace: 0, moving: false, dying: -1, slot: i };
  });
  const SLOTS = [[-1.9, -3.0], [1.9, -3.2], [0, -4.6]]; // beside and behind the pilot

  // --- state ---
  let light = 1; // the lamp overhead, 1..0
  let clock = 0, said = -1, warned = 0, edgeT = 0, hauling = -1, saidAll = false, lostSay = -1;
  let allAt = -1;
  let lastChanged = -1, lastBand = -1;
  let inside = false, prev = null;
  let walker = null;
  const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
  const keeper = () => CAPTAINS.find((c) => c.id === chapter.ez.stay()) || CAPTAINS[0];
  const speak = (pair, sec = 6, who = '') => {
    const by = pair[0] === 'keeper' ? keeper() : CAPTAINS.find((c) => c.id === pair[0]);
    chapterHud.say(`${by ? by.short + ' — ' : ''}${pair[1].replace(/\{who\}/g, who)}`, sec);
  };
  const poolR = () => C.EZ_POOL_MIN + (C.EZ_POOL_R - C.EZ_POOL_MIN) * Math.pow(Math.max(0, light), 0.8);

  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: UP },
    noShip: true,
    speed: 1,
    exit: { x: 0, z: 0 },
    leaveHint: GROUND.tether,
    surfaces: [],
    colliders: [{ x: relics[0].at.x, z: relics[0].at.z, r: 1.9, top: Infinity }],
    // ground wherever the light is, and nowhere else
    floorYAt: (x, z) => (x * x + z * z < pool.value * pool.value ? 0 : -Infinity),
    snap: 1.2,
    pad: new THREE.Vector3(),
    spawn: new THREE.Vector3(0, 0, 2),
    spawnYaw: 0,
    npcs: [],
    consoles: [{
      x: 0, y: 0, z: 0, r: 3.2, prompt: GROUND.up,
      off: () => hauling >= 0,
      use: () => (site.leave(), null),
    }],
    onChoice: () => null,
    portal: null, // 'groundup': back up the tether
    // up the tether, to a vessel put back over the ground
    leave() {
      if (site.portal) return;
      ctx.resume();
      site.portal = 'groundup';
    },
    setWalker(p) {
      walker = p;
    },
    onEnter() {
      if (inside) return;
      inside = true;
      site.portal = null;
      group.visible = true;
      const scene = ctx.scene;
      prev = {
        fog: scene.fog,
        lightPos: sun.light.position.clone(), lightColor: sun.light.color.clone(), lightI: sun.light.intensity,
        ambColor: sun.ambient.color.clone(), ambI: sun.ambient.intensity,
      };
      scene.fog = null;
      // the one light there is, for the figures in it: the vessel's, from straight overhead
      sun.light.position.set(0.05, 1, 0.08).normalize();
      sun.light.color.setRGB(0.9, 0.95, 1.0);
      sun.light.intensity = 1.6;
      sun.ambient.color.setRGB(0.5, 0.6, 0.8);
      sun.ambient.intensity = 0.35;
      ctx.hideFleet();
      chapter.advance('ez_relics');
      // a fresh lamp overhead, and the one in the hand
      light = 1;
      pool.value = poolR();
      clock = 0;
      said = chapter.ez.foundCount() ? 99 : -1;
      warned = 0;
      hauling = -1;
      lostSay = -1;
      allAt = chapter.ez.foundAll() ? 3 : -1;
      saidAll = false;
      resetLamp(true);
      lamp.medium = 'fog';
      lamp.power = C.EZ_HAND_POWER;
      lamp.lineBeam = false;
      lastChanged = lamp.changed;
      lastBand = lamp.band;
      input.bandPrev = input.lampToggle = false;
      lampHud.show(true, false, GROUND.keys);
      for (const r of relics) {
        r.hold = 0;
        r.uniforms.uFound.value = chapter.ez.found(r.i) ? 1 : 0;
      }
      // whoever did not stay at the lamp, and is still alive, comes down
      let n = 0;
      for (const m of crew) {
        m.on = m.c.id !== chapter.ez.stay() && !chapter.ez.isLost(m.c.id);
        m.rig.group.visible = m.on;
        m.dying = -1;
        m.rig.group.scale.setScalar(1);
        if (m.on) {
          m.slot = n++;
          m.rig.group.position.set(SLOTS[m.slot][0], 0, 2 + SLOTS[m.slot][1]);
          standRig(m.rig, 0);
        }
      }
    },
    onLeave() {
      setMusicArea(1); // the radio comes back with the daylight

      if (!inside) return;
      inside = false;
      group.visible = false;
      lampHud.show(false);
      hush();
      chapterHud.clear();
      lamp.power = 1;
      ctx.scene.fog = prev.fog;
      sun.light.position.copy(prev.lightPos);
      sun.light.color.copy(prev.lightColor);
      sun.light.intensity = prev.lightI;
      sun.ambient.color.copy(prev.ambColor);
      sun.ambient.intensity = prev.ambI;
      prev = null;
    },
    tick(dt, t) {
      if (inside) setMusicArea(0); // no radio inside the megaworld: only what is down here

      chapterHud.tick(dt);
      time.value = t;
      const d = Math.min(dt, 0.1);
      if (!walker) return;
      clock += d;
      const stay = STAY[chapter.ez.stay()] || STAY.vask;

      // --- the lamp overhead: worn down, faster the longer it has burned ---
      const rate = (stay.pool / C.EZ_POOL_TIME) * (1 + clock / C.EZ_POOL_EATERS);
      if (hauling < 0) light = Math.max(0, light - rate * d);
      const R = poolR();
      pool.value = R;
      shaft.scale.set(R, 1, R);
      shaftMat.opacity = 0.006 + 0.012 * light; // (seen from inside it: a little is a lot)
      const eatN = Math.min(EAT, 2 + Math.floor(clock / 14));
      for (let i = 0; i < EAT; i++) {
        const a = t * (0.5 + 0.07 * i) + i * 2.4, rr = 3 + 1.2 * (i % 4), y = SHIP_Y - 6 - 3.5 * (i % 5) - 2 * Math.sin(t * 0.7 + i);
        _v.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
        eaters.setMatrixAt(i, _m.compose(_v, _q.setFromEuler(_e.set(0, -a, 0.3)), _s.setScalar(i < eatN ? 0.8 : 0)));
      }
      eaters.instanceMatrix.needsUpdate = true;

      // --- the pilot: on a tether, and kept in the light by it ---
      const pr = Math.hypot(cWalk.pos.x, cWalk.pos.z);
      if (pr > R - 0.8 && pr > 0.01) {
        const k = Math.max(0, R - 0.8) / pr;
        cWalk.pos.x *= k;
        cWalk.pos.z *= k;
      }
      _v.set(cWalk.pos.x, cWalk.pos.y + 1.2, cWalk.pos.z);
      tether.position.copy(_v);
      _s.set(0, SHIP_Y, 0).sub(_v);
      const len = _s.length();
      tether.quaternion.setFromUnitVectors(UP, _s.multiplyScalar(1 / len));
      tether.scale.set(1, len, 1);

      // --- the lamp in the hand: one band, where the pilot is looking ---
      if (input.bandPrev) nextBand(1);
      if (input.lampToggle) toggleLamp();
      input.bandPrev = input.lampToggle = false;
      const cp = Math.cos(cWalk.pitch);
      lamp.dir.set(Math.sin(cWalk.yaw) * cp, Math.sin(cWalk.pitch), Math.cos(cWalk.yaw) * cp);
      lamp.pos.set(cWalk.pos.x, cWalk.pos.y + 1.35, cWalk.pos.z).addScaledVector(lamp.dir, 0.5);
      lamp.energy = Math.max(light, 0.001); // (the level shown is the one that matters: the lamp overhead)
      stepLamp(0, false);
      hand.position.copy(lamp.pos);
      hand.rotation.set(-cWalk.pitch, cWalk.yaw, 0);
      beam.scale.setScalar(lamp.reach * 0.75);
      if (lamp.changed !== lastChanged) {
        lastChanged = lamp.changed;
        if (lamp.band !== lastBand) bandClick((lastBand = lamp.band));
      }

      // --- the relics ---
      for (const r of relics) {
        if (chapter.ez.found(r.i)) continue;
        const near = Math.hypot(cWalk.pos.x - r.at.x, cWalk.pos.z - r.at.z) < C.EZ_RELIC_NEAR;
        r.hold = near && lampShows(r.band, r.look) > 0 ? r.hold + d : 0;
        if (r.hold >= C.EZ_LOOK_TIME && chapter.ez.find(r.i)) {
          r.uniforms.uFound.value = 1;
          logChime();
          chapterHud.say(`${GROUND.found.replace('{name}', r.def.name)}. ${r.def.fragment}`, 10);
        }
      }
      // (said a while after the last fragment, so that can be read)
      if (!saidAll && chapter.ez.foundAll() && hauling < 0) {
        if (allAt < 0) allAt = clock + 10.5;
        else if (clock >= allAt) {
          saidAll = true;
          said = 99; // (nothing left to say about arriving)
          speak(GROUND.all, 8);
        }
      }

      // --- the captains: they follow, and they trust where they are led ---
      edgeT = Math.max(0, edgeT - d);
      for (const m of crew) {
        if (!m.on) continue;
        const g = m.rig.group.position;
        if (m.dying >= 0) {
          // past the light: there was nothing under them
          m.dying += d;
          g.y = -m.dying * m.dying * 9;
          m.rig.group.scale.setScalar(Math.max(0.01, 1 - m.dying / 1.4));
          if (m.dying > 1.4) {
            m.on = false;
            m.rig.group.visible = false;
          }
          continue;
        }
        const s = SLOTS[m.slot];
        const sy = Math.sin(cWalk.facingYaw), cy = Math.cos(cWalk.facingYaw);
        const tx = cWalk.pos.x + -cy * s[0] + sy * s[1], tz = cWalk.pos.z + sy * s[0] + cy * s[1];
        const dx = tx - g.x, dz = tz - g.z, dd = Math.hypot(dx, dz);
        m.moving = dd > 0.9;
        m.pace = 0;
        if (m.moving) {
          const step = Math.min(dd - 0.6, C.EZ_CREW_SPEED * d);
          g.x += (dx / dd) * step;
          g.z += (dz / dd) * step;
          m.pace = Math.min(step / Math.max(d, 1e-4) / 9, 1);
          m.yaw = Math.atan2(dx, dz);
        } else m.yaw = Math.atan2(cWalk.pos.x - g.x, cWalk.pos.z - g.z);
        m.rig.group.rotation.y = m.yaw;
        poseRig(m.rig, d, t, m.moving ? 'walk' : 'idle', m.pace);
        standRig(m.rig, 0);
        liveCaptain(m.rig, d, t, false, 0);
        const cr = Math.hypot(g.x, g.z);
        if (cr > R + 0.3) {
          m.dying = 0;
          chapter.ez.lose(m.c.id);
          speak(GROUND.lost, 7, m.c.short);
          lostSay = clock + 8;
        } else if (cr > R - 7 && edgeT <= 0 && hauling < 0) {
          edgeT = 9;
          speak(GROUND.edge, 4, m.c.short);
        }
      }
      if (lostSay >= 0 && clock >= lostSay) {
        lostSay = -1;
        speak(GROUND.lostAfter, 8);
      }

      // --- what is said: arriving, and the lamp going ---
      while (said + 1 < GROUND.arrive.length && clock >= GROUND.arrive[said + 1][0]) {
        said++;
        speak([GROUND.arrive[said][1], GROUND.arrive[said][2]], 6.5);
      }
      // (whoever stayed calls each quarter of the lamp, early by as much as they are able)
      const q = Math.floor((1 - (light - rate * stay.warn)) * 4);
      if (q > warned && q < 4 && hauling < 0) {
        warned = q;
        speak(GROUND.warn, 5);
      }
      // --- no lamp left: everyone still standing is pulled up ---
      if (light <= 0 && hauling < 0) {
        hauling = 0;
        speak(GROUND.haul, 5);
      }
      if (hauling >= 0 && (hauling += d) > 2.6) site.leave();
      lampHud.update();
    },
    inside: () => inside,
    places: { hatch: [0, 0, 2] },
    info: () => ({
      light: +light.toFixed(3), pool: +pool.value.toFixed(1), clock: +clock.toFixed(1), hauling: +hauling.toFixed(1),
      relics: relics.map((r) => ({ id: r.def.id, band: r.def.band, at: r.at.toArray().map((v) => +v.toFixed(1)), found: chapter.ez.found(r.i) })),
      crew: crew.filter((m) => m.on).map((m) => ({ id: m.c.id, at: [+m.rig.group.position.x.toFixed(1), +m.rig.group.position.z.toFixed(1)], dying: m.dying >= 0 })),
      lamp: lampState(), stay: chapter.ez.stay(), lost: crew.filter((m) => chapter.ez.isLost(m.c.id)).map((m) => m.c.id),
    }),
    // dev: the lamp overhead, and a captain's place (far().state().groundSet)
    set(o) {
      if (Number.isFinite(o.light)) light = o.light;
      if (o.crew) {
        const m = crew.find((x) => x.c.id === o.crew.id);
        if (m) m.rig.group.position.set(o.crew.at[0], 0, o.crew.at[1]);
      }
      return site.info();
    },
  };
  return site;
}
