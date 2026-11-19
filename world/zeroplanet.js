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
// Once the three relics have given up their fragments (world/zeroground.js),
// every band held on it again is the reveal: for half a minute the vessel is
// carried up over the first world as it was, alive, lit by the ones who made
// the machine, and then the lights go out one at a time, without hurry. It
// is one clock and a pose from it, so a vessel that comes back after it has
// played finds the world as the scene left it. The words are REVEAL, and are
// placeholders: what the one who was afraid had lost is not written yet.
//
// Same shape as a zone of the hollow (world/hollow.js), so the submersible
// flies it the same way.

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { lamp, LAMP_U, LAMP_GLSL, BAND, lampLive } from '../src/lamp.js';
import { createLife } from './hollowlife.js';
import { addCodex } from '../src/journal.js';
import { CENTRE, REVEAL } from './entryzero-dialogue.js';

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
  uniform float uReveal; // as it was
  uniform float uLights; // ...with the makers still on it
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
    col *= mix(1.0, 0.4, uSeen) * (1.0 - 0.75 * uSolid);
    col += body * uSeen * (0.16 + 0.25 * pow(1.0 - face, 2.0));
    // (close to, the ground has grain: stones, and the cracked floor of a sea)
    float grain = 0.55 + 0.45 * vnoise(vL * 0.35) + 0.25 * (vnoise(vL * 1.7) - 0.5);
    float cracks = mix(1.0, smoothstep(0.0, 0.05, abs(vnoise(vL * 0.11 + 5.0) - 0.5)), 1.0 - land);
    col += body * grain * cracks * 1.5 * lampBeam(vW) * uSolid * uAll;
    // as it was: sea, land, weather, and at the warm places the lights of the
    // ones who lived there
    float glint = pow(face, 6.0) * (1.0 - land);
    vec3 was = mix(vec3(0.02, 0.1, 0.22) + vec3(0.2, 0.3, 0.35) * glint, mix(vec3(0.09, 0.2, 0.07), vec3(0.3, 0.25, 0.16), smoothstep(0.56, 0.72, h)), land);
    float cloud = smoothstep(0.55, 0.78, vnoise(n * 4.2 + vec3(uTime * 0.012, 0.0, 0.0)) * 0.7 + vnoise(n * 11.0) * 0.3);
    was = mix(was, vec3(0.75, 0.8, 0.85), cloud * 0.55) * (0.22 + 0.9 * face);
    was += vec3(1.0, 0.72, 0.35) * smoothstep(0.8, 0.9, vnoise(n * 11.0 + 3.0)) * land * uLights * 1.6;
    was += vec3(0.15, 0.3, 0.55) * pow(1.0 - face, 3.0); // air
    col = mix(col, was, uReveal);
    if (dot(col, vec3(1.0)) < 0.004) discard;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// k: { group, time, tier, chapter, speak(pair, sec), say(text, sec), panel(text), cine(on) }
export function createCentre(k) {
  const root = new THREE.Group();
  root.visible = false;
  k.group.add(root);
  const R = C.EZ_PLANET_R;
  const entry = new THREE.Vector3();
  const centre = new THREE.Vector3(0, -C.EZ_PLANET_DOWN, 0);
  const u = { ...LAMP_U, uTime: k.time, uSeen: { value: 0 }, uSolid: { value: 0 }, uReveal: { value: 0 }, uLights: { value: 1 } };
  // the reveal: its clock (-1: not playing), and what leads up to it
  let rv = -1, rvSaid = -1, rvHold = 0, rvReady = 0, rvFrom = 0;
  const ease = (a, b, x) => {
    const f = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return f * f * (3 - 2 * f);
  };
  // everything the reveal shows, from its clock alone (x past the end: as it is left)
  function poseReveal(x) {
    u.uReveal.value = ease(1.5, 9, x);
    u.uLights.value = 1 - ease(22, 31, x);
    return rvFrom + (R * C.EZ_REVEAL_RISE - rvFrom) * ease(0, 27, x); // the height it is carried to
  }
  let planet = null, life = null;
  let seen = 0, solid = 0, alt = Infinity, holdT = 0, clock = 0, said = -1;
  let askWait = 0;
  let saidAppear = false, saidNear = 0, saidSolid = false, wasSolid = false, goneT = 0, asked = false, panelAlt = -1, panelPct = -1;
  const _v = new THREE.Vector3();

  function build() {
    if (planet) return;
    planet = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 6), new THREE.ShaderMaterial({ uniforms: u, vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG, fog: false }));
    planet.position.copy(centre);
    planet.frustumCulled = false;
    root.add(planet);
    // the light eaters are here too, round the sides of it: a lit lamp over
    // the top brings them in about twenty seconds, and a dark one sends them back
    const haunt = (a, b) => new THREE.Vector3(centre.x + Math.cos(a) * (R + 420) * Math.cos(b), centre.y + (R + 420) * Math.sin(b), centre.z + Math.sin(a) * (R + 420) * Math.cos(b));
    life = createLife({ group: root, time: k.time, tier: k.tier, schools: [], callers: [], eaters: [haunt(0.4, 0.42), haunt(3.2, 0.48)], leeches: [], feeders: [], seed: 0x10ce05 });
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
    rv = -1;
    rvHold = rvReady = 0;
    // (seen already: the world is as the scene left it)
    if (k.chapter.reached('ez_reveal')) poseReveal(C.EZ_REVEAL_TIME);
    else u.uReveal.value = 0;
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
      asked = false;
      askWait = 0;
      lamp.canAll = true; // what the descent was for
      return true;
    },
    home(at) {
      at.copy(entry);
      at.y -= 80;
      reset();
    },
    // the reveal has the vessel (it is carried, not flown)
    busy: () => rv >= 0,
    leave() {
      root.visible = false;
      if (rv >= 0) k.cine(false);
      rv = -1;
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
    tick(dt, t, at, speed, push, held, key) {
      // --- the reveal: one clock, and the vessel carried up over what it shows ---
      if (rv >= 0) {
        rv += dt;
        const h = poseReveal(rv);
        at.set(centre.x, centre.y + R + h, centre.z);
        alt = h;
        u.uSeen.value = 1;
        u.uSolid.value = 0;
        while (rvSaid + 1 < REVEAL.lines.length && rv >= REVEAL.lines[rvSaid + 1][0]) {
          rvSaid++;
          const l = REVEAL.lines[rvSaid];
          if (l[1]) k.speak([l[1], l[2]], 7.5);
          else k.say(l[2], 7.5);
        }
        if (rv >= C.EZ_REVEAL_TIME) {
          rv = -1;
          seen = 1;
          solid = 0;
          wasSolid = false; // (nothing went: it was shown)
          k.cine(false);
          if (k.chapter.advance('ez_reveal')) addCodex(REVEAL.codex);
          k.speak(REVEAL.after, 8);
        }
        return null;
      }
      life.step(dt, t, at, speed);
      _v.subVectors(centre, at);
      const d = _v.length();
      alt = d - R;
      const aimed = _v.dot(lamp.dir) / d > 0.45; // the lamp is on it, more or less
      const all = lamp.all && lampLive();
      // the eaters wear the lamp down (src/lamp.js); with all of them on the beam there is none left for the ground
      const eaten = lamp.eaters >= 0.99;
      seen += ((all && aimed ? 1 : 0) - seen) * Math.min(1, dt * 1.5);
      const reach = all && aimed && !eaten && alt < lamp.reach && alt > 0;
      solid = reach ? Math.min(1, solid + dt / C.EZ_SOLID_IN) : Math.max(0, solid - dt / C.EZ_SOLID_OUT);
      u.uSeen.value = seen;
      u.uSolid.value = solid;
      // (once it has been shown, it is what every band at once shows: as it was, and gone dark)
      if (k.chapter.reached('ez_reveal')) u.uReveal.value = seen;

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
      // --- seen, and nothing left here: climbing away from it is the way back up ---
      if (k.chapter.reached('ez_reveal') && alt > C.EZ_RISE_AT && !held) return 'rise';

      // --- with every fragment found: every band on it once more is the reveal ---
      const whole = k.chapter.ez.foundAll() && !k.chapter.reached('ez_reveal');
      if (whole) {
        if (rvReady >= 0 && (rvReady += dt) > 4) {
          rvReady = -1;
          k.speak(REVEAL.ready, 8);
        }
        rvHold = key && all && aimed ? rvHold + dt : 0;
        if (rvHold > C.EZ_REVEAL_HOLD && !held) {
          rv = 0;
          rvSaid = -1;
          rvFrom = Math.max(alt, C.EZ_HOVER_MIN);
          k.cine(true);
          k.panel(null);
          panelAlt = panelPct = -1;
          return null;
        }
      }
      // the height, while there is anything to be a height over
      if (seen > 0.3 && alt < 900 && !k.chapter.reached('ez_reveal')) {
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
      // (asked first who stays; after that, each time, whether to go down)
      askWait = Math.max(0, askWait - dt);
      holdT = solid >= 1 && speed < 14 ? holdT + dt : 0;
      // (with the story whole there is nothing left to go down for)
      if (!asked && !held && askWait <= 0 && holdT > C.EZ_HOVER_HOLD && !k.chapter.ez.foundAll()) {
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
    // (a question left unanswered, or answered `not yet`: asked again, the next
    // time the ground has held for a while)
    unask(wait = 0) {
      asked = false;
      askWait = wait;
      holdT = 0;
    },
    // Back from the ground, up the tether: the vessel is where it was left,
    // low over the place, with whoever stayed still at the lamp.
    arrive(at) {
      build();
      root.visible = true;
      at.copy(centre);
      at.y += R + 80;
      reset();
      solid = seen = 1;
      said = 99;
      asked = false;
      askWait = 14;
      lamp.canAll = true;
    },
    info: () => ({
      zone: 5, centre: centre.toArray(), r: R, alt: Math.round(alt), seen: +seen.toFixed(2), solid: +solid.toFixed(2), hold: +holdT.toFixed(1),
      reach: lamp.reach, asked, stay: k.chapter.ez.stay(), life: life ? life.info() : null,
      reveal: +rv.toFixed(1), shown: +u.uReveal.value.toFixed(2), lights: +u.uLights.value.toFixed(2), rvHold: +rvHold.toFixed(1),
    }),
  };
}
