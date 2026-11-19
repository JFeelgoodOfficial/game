// The centre of the megaworld: entry zero, the world the Tenretni came from
// (GDD 5.7.5).
//
// The lattice stops short of it; the vessel falls the last of the way. What
// is there cannot be seen. Each band of the lamp shows one thing about it and
// nothing else:
//
//   blue-green   where its seas were (water carries that colour)
//   ultraviolet  the makers' writing, on the land (it fluoresces)
//   infrared     a few places still warm
//   H-alpha      a rim of thin hydrogen: what is left of its air
//   X-ray        what is under the ground
//   radio        one steady note, from the middle of it
//
// Every band at once (hold Z: it is learned here) is the first time anything
// has looked at all of it together, and it is there: the whole world, faint.
// It is only solid where the full spectrum actually reaches, and in the mist
// round it that is no further than the shortest band goes, infrared, about a
// hundred units. So the vessel has to come down to that height and stay
// there, holding every band on the ground, for the ground to be ground. Let
// go, run out of lamp, or let the light eaters drink it, and it is gone.
//
// Held still over solid ground for a few seconds, the pilot is asked who
// stays aboard at the lamp (world/entryzero-dialogue.js CENTRE.choice, STAY).
//
// Same shape as a zone of the hollow (world/hollow.js), so the submersible
// flies it the same way.

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { lamp, LAMP_U, LAMP_GLSL, BAND, lampLive } from '../src/lamp.js';
import { createLife } from './hollowlife.js';
import { CENTRE } from './entryzero-dialogue.js';

const PLANET_VERT = /* glsl */ `
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vL;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vL = position;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const PLANET_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  uniform float uTime;
  uniform float uSeen;  // every band is on it: the whole, faint
  uniform float uSolid; // ...and near enough that it is ground
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vL;
  float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  void main() {
    vec3 n = normalize(vL);
    float h = vnoise(n * 2.3) * 0.55 + vnoise(n * 5.1 + 4.0) * 0.3 + vnoise(n * 13.0) * 0.15;
    float land = smoothstep(0.5, 0.53, h);
    vec3 v = normalize(cameraPosition - vW);
    float face = abs(dot(normalize(vN), v));
    vec3 col = vec3(0.0);
    // blue-green: where the seas were
    col += lampBand(0.0) * (1.0 - land) * vec3(0.05, 0.5, 0.45) * (0.2 + 0.4 * vnoise(n * 46.0 + uTime * 0.15));
    // ultraviolet: writing, in rows, across the land
    vec2 g = vec2(atan(n.z, n.x) * 40.0, asin(n.y) * 64.0);
    vec2 gi = floor(g), gf = fract(g);
    float glyph = step(0.45, h31(vec3(gi, 2.0))) * step(0.2, gf.x) * step(gf.x, 0.2 + 0.6 * h31(vec3(gi, 5.0))) * step(0.3, gf.y) * step(gf.y, 0.55);
    col += lampBand(1.0) * land * glyph * step(0.5, h31(vec3(gi.y, 9.0, 1.0))) * vec3(0.55, 0.4, 1.0) * 0.9;
    // infrared: the last warm places
    float warm = smoothstep(0.86, 0.93, vnoise(n * 11.0 + 3.0)) * land;
    col += lampBand(2.0) * warm * vec3(1.0, 0.5, 0.15) * 1.3;
    // H-alpha: a rim of air
    col += lampBand(3.0) * pow(1.0 - face, 3.0) * vec3(1.0, 0.15, 0.25) * 0.9;
    // X-ray: under the ground
    vec3 c = n * 15.0;
    vec3 cf = fract(c) - 0.5;
    float buried = step(0.7, h31(floor(c))) * smoothstep(0.07, 0.02, abs(length(cf.xy) - 0.3));
    col += lampBand(4.0) * land * buried * vec3(0.8, 0.86, 1.0) * 0.9;
    // every band at once: the thing itself. Faint, until the light is near
    // enough to land on it, and then it is rock and dry sea-bed and lit.
    vec3 body = mix(vec3(0.05, 0.16, 0.2), vec3(0.26, 0.21, 0.16) * (0.6 + 0.8 * h), land);
    col *= mix(1.0, 0.45, uSeen);
    col += body * uSeen * (0.16 + 0.25 * pow(1.0 - face, 2.0));
    col += body * 3.2 * lampBeam(vW) * uSolid * uAll;
    if (dot(col, vec3(1.0)) < 0.004) discard;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// k: { group, time, tier, chapter, speak(pair, sec), say(text, sec), panel(text) }
export function createCentre(k) {
  const root = new THREE.Group();
  root.visible = false;
  k.group.add(root);
  const R = C.EZ_PLANET_R;
  const entry = new THREE.Vector3();
  const centre = new THREE.Vector3(0, -C.EZ_PLANET_DOWN, 0);
  const u = { ...LAMP_U, uTime: k.time, uSeen: { value: 0 }, uSolid: { value: 0 } };
  let planet = null, life = null;
  let seen = 0, solid = 0, alt = Infinity, holdT = 0, clock = 0, said = -1;
  let saidAppear = false, saidNear = 0, saidSolid = false, wasSolid = false, goneT = 0, asked = false, panelAlt = -1, panelPct = -1;
  const _v = new THREE.Vector3();

  function build() {
    if (planet) return;
    planet = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 6), new THREE.ShaderMaterial({ uniforms: u, vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG, fog: false }));
    planet.position.copy(centre);
    planet.frustumCulled = false;
    root.add(planet);
    // the light eaters are here too, over the side of it the vessel comes down on
    const haunt = (a, b) => new THREE.Vector3(centre.x + Math.cos(a) * (R + 260) * Math.cos(b), centre.y + (R + 260) * Math.sin(b), centre.z + Math.sin(a) * (R + 260) * Math.cos(b));
    life = createLife({ group: root, time: k.time, tier: k.tier, schools: [], callers: [], eaters: [haunt(0.4, 1.0), haunt(3.2, 1.1)], leeches: [], feeders: [], seed: 0x10ce05 });
  }
  function free() {
    if (life) life.dispose();
    life = null;
    if (planet) {
      root.remove(planet);
      planet.geometry.dispose();
      planet.material.dispose();
      planet = null;
    }
  }
  function reset() {
    seen = solid = holdT = 0;
    wasSolid = false;
    u.uSeen.value = u.uSolid.value = 0;
  }

  return {
    enter(at) {
      build();
      root.visible = true;
      at.copy(entry);
      at.y -= 80;
      reset();
      clock = 0;
      said = k.chapter.ez.stay() ? 99 : -1; // (been here before: nothing to say)
      asked = !!k.chapter.ez.stay();
      lamp.canAll = true; // what the descent was for
      return true;
    },
    home(at) {
      at.copy(entry);
      at.y -= 80;
      reset();
    },
    leave() {
      root.visible = false;
      k.panel(null);
      free();
    },
    upper: entry,
    medium: () => 'fog',
    // it has mass: the pull is toward it, from anywhere
    weigh(at, vel, h) {
      _v.subVectors(centre, at);
      const d = _v.length();
      if (d > 1) vel.addScaledVector(_v, (C.EZ_CENTRE_PULL * h) / d);
    },
    bound(at, vel) {
      _v.subVectors(at, centre);
      const d = _v.length();
      // nowhere to go but here
      if (d > C.EZ_PLANET_DOWN + 500) {
        at.copy(centre).addScaledVector(_v, (C.EZ_PLANET_DOWN + 500) / d);
        const out = vel.dot(_v) / d;
        if (out > 0) vel.addScaledVector(_v, -out / d);
      }
      // while it is solid there is ground to stay off; while it is not, there is nothing
      if (solid > 0.5 && d < R + C.EZ_HOVER_MIN) {
        at.copy(centre).addScaledVector(_v, (R + C.EZ_HOVER_MIN) / d);
        const into = vel.dot(_v) / d;
        if (into < 0) vel.addScaledVector(_v, -into / d);
      }
    },
    // Once a frame. `held`: the pilot is being asked (the light is kept on for
    // them). Returns 'choose' when the pilot is to be asked who stays.
    tick(dt, t, at, speed, push, held) {
      life.step(dt, t, at, speed);
      _v.subVectors(centre, at);
      const d = _v.length();
      alt = d - R;
      const aimed = _v.dot(lamp.dir) / d > 0.45; // the lamp is on it, more or less
      const all = lamp.all && lampLive();
      const eaten = lamp.eaters > 0.6;
      seen += ((all && aimed ? 1 : 0) - seen) * Math.min(1, dt * 1.5);
      const reach = all && aimed && !eaten && alt < lamp.reach && alt > 0;
      solid = reach ? Math.min(1, solid + dt / C.EZ_SOLID_IN) : Math.max(0, solid - dt / C.EZ_SOLID_OUT);
      u.uSeen.value = seen;
      u.uSolid.value = solid;

      // --- what is said ---
      clock += dt;
      while (said + 1 < CENTRE.arrive.length && clock >= CENTRE.arrive[said + 1][0]) {
        said++;
        k.speak([CENTRE.arrive[said][1], CENTRE.arrive[said][2]], 7);
      }
      if (!saidAppear && seen > 0.8) {
        saidAppear = true;
        k.speak(CENTRE.appear, 7);
      }
      if (saidAppear && !saidSolid && saidNear >= 0 && seen > 0.8 && alt > lamp.reach && (saidNear += dt) > 9) {
        saidNear = -1;
        k.speak(CENTRE.near, 8);
      }
      if (!saidSolid && solid >= 1) {
        saidSolid = true;
        k.speak(CENTRE.solid, 6);
      }
      if (solid >= 1) wasSolid = true;
      goneT = Math.max(0, goneT - dt);
      if (wasSolid && solid <= 0 && goneT <= 0) {
        wasSolid = false;
        goneT = 12;
        k.speak(eaten ? CENTRE.eaten : CENTRE.gone, 5);
      }
      // the height, while there is anything to be a height over
      if (seen > 0.3 && alt < 900) {
        const a = Math.round(alt / 5) * 5, pc = Math.round(solid * 20) * 5;
        if (a !== panelAlt || pc !== panelPct) {
          panelAlt = a;
          panelPct = pc;
          k.panel(CENTRE.altitude.replace('{alt}', String(a)).replace('{pct}', String(pc)));
        }
      } else if (panelAlt !== -1) {
        panelAlt = panelPct = -1;
        k.panel(null);
      }

      // --- held still over ground that holds: the hatch, and who stays at the lamp ---
      holdT = solid >= 1 && speed < 14 ? holdT + dt : 0;
      if (!asked && !held && holdT > C.EZ_HOVER_HOLD) {
        asked = true;
        return 'choose';
      }
      return null;
    },
    // the one note from the middle of it, as the lamp points there
    radioNear() {
      _v.subVectors(centre, lamp.pos).normalize();
      return Math.max(0, (_v.dot(lamp.dir) - 0.55) / 0.45);
    },
    // (the pilot left the question unanswered: it is asked again the next time the ground holds)
    unask() {
      if (!k.chapter.ez.stay()) asked = false;
      holdT = 0;
    },
    info: () => ({
      zone: 5, centre: centre.toArray(), r: R, alt: Math.round(alt), seen: +seen.toFixed(2), solid: +solid.toFixed(2), hold: +holdT.toFixed(1),
      reach: lamp.reach, asked, stay: k.chapter.ez.stay(), life: life ? life.info() : null,
    }),
  };
}
