// Under the Ice: the surface (GDD 5.7.9; Season 1, chapter 3).
//
// A rogue planet: one thrown out of the system it formed in, with no star.
// Nothing lights this ice but the stars and what the freighter brought: a pad,
// and a bore melted down through four kilometres of it, with the vessel of
// Entry Zero hung over its mouth. It is a short walk, and the place the
// chapter begins and ends.
//
//   the forecast   On the first step out (src/fixedEvents.js `contact`).
//   the bore       E at its head, a plain choice, and the door `ice:down`
//                  to the ocean (world/ice-ocean.js).
//   afterwards     If the ice was opened, the plume from the hole stands on
//                  the horizon: water boiling into vacuum and freezing as it
//                  goes (what Enceladus does).
//
// A site for the platform walker (src/capitalWalk.js), in the world, docked at
// by the freighter. Built on a globe of its own, as the dusk world's camp is
// (world/dusk-ground.js says why).

import * as THREE from 'three';
import { C, ICE_PLACES } from '../src/constants.js';
import { sun } from '../src/sun.js';
import { chapterHud } from '../src/chapterHud.js';
import { openDialogue, isDialogueOpen } from '../src/dialogue.js';
import { fbm2, mulberry32 } from '../src/noise2.js';
import { tint, box, cyl, mergedMesh } from './capital.js';
import { setWeather, hush } from './entryzero-audio.js';
import { crewSay } from './sceneClock.js';
import { createCrewFollow } from './crewFollow.js';
import { ICE } from './ice-dialogue.js';

const ZERO = new THREE.Vector3();
const R = C.ICE_GLOBE_R;
const HALF = 230; // the ground that is walked, each way
const PAD = [0, 78], PAD_R = 20;
const BORE = [0, -72];

function groundY(x, z) {
  const flat = Math.min(1, Math.max(0, (Math.min(Math.hypot(x - PAD[0], z - PAD[1]), Math.hypot(x - BORE[0], z - BORE[1])) - 22) / 30));
  // pressure ridges: the ice has been squeezed, and stood up in lines
  const ridge = Math.pow(Math.abs(fbm2(x * 0.014 + 9.3, z * 0.014 + 2.2, 3)), 1.6) * 3.2;
  return 1.6 + ridge * flat * flat * (3 - 2 * flat) - (x * x + z * z) / (2 * R);
}

const VERT = /* glsl */ `
  uniform vec3 uOff;
  varying vec3 vW;
  varying vec3 vP;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vP = position + uOff;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
// Ice under starlight: nearly black, blue where the pad's lamps and the bore's glow reach it.
const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uHaze;
  uniform vec3 uLamp[2];
  uniform vec3 uLampCol[2];
  varying vec3 vW;
  varying vec3 vP;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    vec2 q = vP.xz;
    float grain = 0.6 + 0.4 * vnoise(q * 0.3) + 0.25 * (vnoise(q * 2.1) - 0.5);
    float crack = smoothstep(0.0, 0.05, abs(vnoise(q * 0.05 + 3.0) - 0.5)) * smoothstep(0.0, 0.035, abs(vnoise(q * 0.11 - 8.0) - 0.5));
    vec3 ice = vec3(0.55, 0.7, 0.9) * grain * (0.45 + 0.55 * crack);
    vec3 col = ice * 0.022; // starlight, and nothing else
    for (int i = 0; i < 2; i++) {
      float d = distance(q, uLamp[i].xy);
      col += ice * uLampCol[i] * uLamp[i].z / (1.0 + d * d * 0.0016);
    }
    col += vec3(0.5, 0.7, 1.0) * step(0.992, h21(floor(q * 2.0))) * 0.12; // a crystal face, catching a star
    float dist = distance(vW, cameraPosition);
    col = mix(col, vec3(0.004, 0.006, 0.012), uHaze * (1.0 - exp(-dist * 0.0009)));
    gl_FragColor = vec4(col, 1.0);
  }
`;

function glowTexture() {
  const n = 64, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2);
    const a = Math.max(0, 1 - r);
    const i = (y * n + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = Math.round(255 * a * a);
  }
  const tex = new THREE.DataTexture(data, n, n);
  tex.needsUpdate = true;
  return tex;
}

// ctx: the system's (world/ice-system.js). story: { stage(), reached(s), advance(s) }
export function createIceSurface(ctx, story) {
  const { chapter, fixed } = ctx;
  const group = new THREE.Group();
  const time = { value: 0 };
  const padY = groundY(PAD[0], PAD[1]), boreY = groundY(BORE[0], BORE[1]);
  const U = {
    uOff: { value: new THREE.Vector3() }, uTime: time, uHaze: { value: 0 },
    uLamp: { value: [new THREE.Vector3(PAD[0], PAD[1], 1), new THREE.Vector3(BORE[0], BORE[1], 1.4)] },
    uLampCol: { value: [new THREE.Color(1.0, 0.82, 0.6), new THREE.Color(0.5, 0.85, 1.0)] },
  };

  const geo = new THREE.PlaneGeometry(HALF * 2 + 120, HALF * 2 + 120, 96, 96).rotateX(-Math.PI / 2);
  {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, groundY(p.getX(i), p.getZ(i)));
  }
  const ground = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, fog: false }));
  ground.frustumCulled = false;
  group.add(ground);
  const globeOff = new THREE.Vector3(0, -R - 0.8, 0);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.ShaderMaterial({ uniforms: { ...U, uOff: { value: globeOff } }, vertexShader: VERT, fragmentShader: FRAG, fog: false }));
  globe.position.copy(globeOff);
  globe.frustumCulled = false;
  group.add(globe);

  // --- the pad, the bore's head, and the vessel hung over it ---
  const litMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const colliders = [];
  {
    const lit = [], glow = [];
    lit.push(tint(cyl(PAD_R, PAD_R + 1.5, 0.5, PAD[0], padY - 0.1, PAD[1], 28), 0x2a3240));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      glow.push(tint(box(0.6, 0.16, 0.6, PAD[0] + Math.cos(a) * (PAD_R - 0.8), padY + 0.2, PAD[1] + Math.sin(a) * (PAD_R - 0.8)), 0xffd0a0, 1.4));
    }
    // a line of markers from the pad to the bore
    for (let z = PAD[1] - PAD_R - 8; z > BORE[1] + 16; z -= 14) for (const sx of [-3.2, 3.2]) glow.push(tint(box(0.3, 0.5, 0.3, sx, groundY(sx, z) + 0.3, z), 0x8fd8ff, 1.2));
    // the bore: a collar on the ice, three legs over it, the vessel on its cable
    lit.push(tint(cyl(7.5, 8.5, 1.2, BORE[0], boreY + 0.4, BORE[1], 28), 0x39424e));
    glow.push(tint(cyl(6.2, 6.2, 0.2, BORE[0], boreY + 1.05, BORE[1], 28), 0x7fd8ff, 1.6));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const leg = new THREE.CylinderGeometry(0.28, 0.4, 19, 7).rotateZ(0.42).rotateY(-a).translate(BORE[0] + Math.cos(a) * 5.4, boreY + 9.2, BORE[1] + Math.sin(a) * 5.4);
      lit.push(tint(leg, 0x4a5462));
      colliders.push({ x: BORE[0] + Math.cos(a) * 9, z: BORE[1] + Math.sin(a) * 9, r: 0.8, top: Infinity });
    }
    lit.push(tint(cyl(1.3, 1.3, 1.2, BORE[0], boreY + 18, BORE[1], 12), 0x4a5462));
    lit.push(tint(cyl(0.06, 0.06, 9, BORE[0], boreY + 13, BORE[1], 5), 0x9aa4b0));
    lit.push(tint(new THREE.CapsuleGeometry(1.7, 3.6, 4, 12).translate(BORE[0], boreY + 6.2, BORE[1]), 0x18222c));
    glow.push(tint(new THREE.SphereGeometry(0.6, 10, 8).translate(BORE[0], boreY + 3.4, BORE[1]), 0xeaffff, 1.6));
    // the console at the bore's head
    lit.push(tint(box(1.5, 1.1, 0.8, BORE[0] + 10.5, boreY + 0.6, BORE[1] + 4), 0x39424e));
    glow.push(tint(box(1.2, 0.06, 0.6, BORE[0] + 10.5, boreY + 1.18, BORE[1] + 4), 0x9fe8ff, 1.5));
    colliders.push({ x: BORE[0], z: BORE[1], r: 7.6, top: Infinity }, { x: BORE[0] + 10.5, z: BORE[1] + 4, r: 1.0, top: Infinity });
    // blocks of ice, stood up along the ridges
    const rng = mulberry32(0x1ce5);
    for (let i = 0; i < 70; i++) {
      const x = (rng() * 2 - 1) * (HALF + 40), z = (rng() * 2 - 1) * (HALF + 40);
      if (Math.hypot(x - PAD[0], z - PAD[1]) < PAD_R + 8 || Math.hypot(x - BORE[0], z - BORE[1]) < 20 || (Math.abs(x) < 8 && z < PAD[1] && z > BORE[1])) continue;
      const r = 0.5 + rng() * rng() * 2.6;
      lit.push(tint(new THREE.SphereGeometry(r, 5, 4).rotateY(rng() * 6).scale(0.8, 1 + rng() * 1.4, 0.7).translate(x, groundY(x, z) + r * 0.3, z), 0x5a7088));
    }
    group.add(mergedMesh(lit, litMat));
    group.add(mergedMesh(glow, glowMat));
  }
  // steam off the bore: the meltwater, boiling where it meets no air at all
  const tex = glowTexture();
  const steam = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x9fd8ff, map: tex, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  steam.position.set(BORE[0], boreY + 10, BORE[1]);
  steam.scale.set(16, 30, 1);
  group.add(steam);
  // ...and, if the ice was opened, the plume from the hole, a long way off
  const plume = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xbfe6ff, map: tex, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  plume.position.set(ICE_PLACES.roof[0], 170, ICE_PLACES.roof[1]); // (over the roof of the world, as far from the bore up here as it is down there)
  plume.scale.set(150, 760, 1);
  plume.visible = false;
  group.add(plume);

  const bucket = () => (story.reached('contact') ? 'after' : 'early');
  const crew = createCrewFollow({
    group, floorY: groundY,
    talk: (c) => ({ speaker: { name: c.name, species: c.species, cityId: ICE.shelf.speaker.cityId }, lines: ICE.ground[c.id][bucket()], cine: true }),
  });

  let walker = null, walkerLive = null, inside = false, prev = null;
  let forecastOpen = false, said = -1, since = -1, panelText = null;
  const say = (line, sec) => crewSay(chapter, line, sec);

  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: ctx.sunDir },
    surfaces: [],
    colliders,
    floorYAt: (x, z) => (Math.abs(x) < HALF && Math.abs(z) < HALF ? groundY(x, z) : -Infinity),
    snap: 1.6,
    pad: new THREE.Vector3(PAD[0], padY + 0.15, PAD[1]),
    padR: PAD_R,
    spawn: new THREE.Vector3(PAD[0] - 8, groundY(PAD[0] - 8, PAD[1] - 13), PAD[1] - 13),
    fromBore: new THREE.Vector3(BORE[0] + 10.5, groundY(BORE[0] + 10.5, BORE[1] + 7.5), BORE[1] + 7.5),
    leaveHint: ICE.shelf.leaveHint,
    npcs: crew.npcs,
    consoles: [{
      x: BORE[0] + 10.5, y: boreY, z: BORE[1] + 5.6, r: 3, prompt: ICE.shelf.board,
      off: () => story.reached('contact') || !story.reached('forecast'),
      use: () => ({
        speaker: ICE.shelf.speaker, lines: ICE.shelf.boardLines, cine: true,
        offer: { kind: 'choice', prompt: ICE.shelf.boardPrompt, options: [{ label: ICE.shelf.go, outcomeTag: 'ice:go' }, { label: ICE.shelf.stay, outcomeTag: 'ice:stay' }] },
      }),
    }],
    portal: null, // 'ice:down': into the bore
    onChoice(tag) {
      if (tag === 'ice:go') site.portal = 'ice:down';
      return null;
    },
    mark: () => (story.reached('forecast') && !story.reached('contact') ? { x: BORE[0] + 10.5, z: BORE[1] + 5.6, label: ICE.marks.bore } : null),
    setWalker(p, live) {
      walker = p || null;
      walkerLive = p ? live || null : null;
    },
    onEnter() {
      if (inside) return;
      inside = true;
      site.portal = null;
      prev = {
        fog: ctx.scene.fog,
        lightColor: sun.light.color.clone(), lightI: sun.light.intensity,
        ambColor: sun.ambient.color.clone(), ambI: sun.ambient.intensity,
      };
      ctx.scene.fog = new THREE.FogExp2(0x02040a, 0.0016);
      U.uHaze.value = 1;
      // no sun: the figures stand in the pad's lamps
      sun.light.color.setRGB(0.75, 0.85, 1.0);
      sun.light.intensity = 0.5;
      sun.ambient.color.setRGB(0.6, 0.7, 0.9);
      sun.ambient.intensity = 0.55;
      forecastOpen = false;
      said = story.reached('down') ? 99 : -1;
      since = story.reached('forecast') ? 0 : -1;
      panelText = null;
      plume.visible = fixed.outcome('contact')?.how === 'shown';
      // up out of the bore with it settled: the chapter is over, bar the walk to the pad
      if (story.stage() === 'contact') story.advance('done');
      crew.set(ctx.voyage.crew());
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      crew.set([]);
      hush();
      chapterHud.clear();
      chapterHud.panel(null);
      panelText = null;
      U.uHaze.value = 0;
      ctx.scene.fog = prev.fog;
      sun.light.color.copy(prev.lightColor);
      sun.light.intensity = prev.lightI;
      sun.ambient.color.copy(prev.ambColor);
      sun.ambient.intensity = prev.ambI;
      prev = null;
    },
    inside: () => inside,
    update(dt, t) {
      time.value = t;
      steam.material.opacity = 0.12 + 0.05 * Math.sin(t * 1.7);
      steam.scale.set(16 + 2 * Math.sin(t * 0.9), 30 + 4 * Math.sin(t * 0.6 + 1), 1);
    },
    tick(dt, t) {
      chapterHud.tick(dt);
      const d = Math.min(dt, 0.1);
      if (!walker) return;
      const st = story.stage();
      setWeather(0, 0.12); // (no air to speak of: this is the suit)
      if (st === 'arrived' && !forecastOpen && !isDialogueOpen()) {
        forecastOpen = true;
        openDialogue(fixed.forecast('contact'), {
          onClose: () => {
            forecastOpen = false;
            story.advance('forecast');
            since = 0;
          },
        });
      }
      if (since >= 0 && !isDialogueOpen()) {
        since += d;
        while (said + 1 < ICE.arrive.length && since >= ICE.arrive[said + 1][0]) say(ICE.arrive[++said][1], 7);
      }
      crew.tick(dt, t, walkerLive);
      const text = st === 'done' ? ICE.hud.done : story.reached('forecast') && !story.reached('contact') ? ICE.hud.board : null;
      if (text !== panelText) chapterHud.panel((panelText = text));
    },
    globe: { centre: globeOff, radius: R },
    places: { pad: [PAD[0] - 8, PAD[1] - 13], bore: [BORE[0] + 10.5, BORE[1] + 5.6] },
    info: () => ({ inside, plume: plume.visible, panel: panelText, ground: (x, z) => groundY(x, z) }),
  };
  return site;
}
