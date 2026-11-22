// The launch (GDD 5.7.5): the end of the saga.
//
// The Tenretni stay. The pilot and the captains who are left take the light
// ship, with the whole archive aboard, out from the megaworld and into the
// black hole it was built to mine.
//
// On the way out the megaworld is seen whole for the only time: a shell, worn
// and smaller than it was, with its oceans showing through the gaps, the one
// star it kept (EZ_LIGHT) lighting one side of it, and round it, if the
// Tenretni went on to make things (EZ_NEW_WORLDS), a ring of young planets
// built from the strata of the shell. Neither of those is decided: both are
// one constant.
//
// The framing is the physics. Outside the horizon the centre of a black hole
// is a place, and can be steered away from. Inside, it is not anywhere: it is
// later. Every path leads to it the way every path leads to tomorrow. So the
// archive is not being thrown away. It is being carried into a future that
// nobody holds yet. As the ship crosses, the whole of the outside closes to a
// ring of light astern and goes out, and ahead there is nothing drawn,
// because nothing ahead has happened.
//
// One clock and a pose from it. At its end the stage is `ez_beyond`, which is
// where the saga stops: the bridge under the dome on the light ship's bow
// (world/eramade.js), the people at their seats, the ship and its archive
// behind them on the strands, and the dark. A pilot who comes back to the
// game at that stage is put straight here (src/game.js). What comes after is
// another chapter (GDD 5.7.7, src/horizon.js), begun from the console at this
// bridge's helm.

import * as THREE from 'three';
import { C, EZ_NEW_WORLDS } from '../src/constants.js';
import { sun } from '../src/sun.js';
import { chapterHud } from '../src/chapterHud.js';
import { DAY } from '../src/era.js';
import { floorOf, tint, box, cyl, mergedMesh } from './capital.js';
import { poseRig } from './aliens.js';
import { standRig } from './rigGround.js';
import { buildCaptain, liveCaptain } from './captainDress.js';
import { setHum, hush } from './entryzero-audio.js';
import { CAPTAINS } from './chapter-dialogue.js';
import { LAUNCH } from './entryzero-dialogue.js';
import { buildHangar } from './lightvessel.js';
import { createMade, BRIDGE } from './eramade.js';

const ZERO = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const AHEAD = new THREE.Vector3(0, 0.12, -1).normalize(); // where the hole is: the way the bridge faces
const MEGA_R = 700;

const VERT = /* glsl */ `
  varying vec3 vW;
  varying vec3 vL;
  varying vec3 vN;
  void main() {
    vL = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
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
// Everything that is not the megaworld: stars, galaxies' worth of dust, the
// hole and its disc; and, past the horizon, all of that closing to a ring astern.
const SKY_FRAG = /* glsl */ `
  ${NOISE}
  uniform float uTime;
  uniform vec3 uHole; // toward it
  uniform float uHoleR; // its angular radius
  uniform float uIn; // 0 outside .. 1 well inside the horizon
  varying vec3 vW;
  void main() {
    vec3 d = normalize(vW - cameraPosition);
    // stars: one to a cell of the sky, most cells empty
    vec3 c = floor(d * 90.0);
    float star = step(0.985, h31(c)) * (0.4 + 0.6 * h31(c + 5.0));
    vec3 col = vec3(1.0, 0.96, 0.9) * star * (1.0 - smoothstep(0.0, 0.5, length(fract(d * 90.0) - 0.5)));
    col += vec3(0.05, 0.03, 0.07) * vnoise(d * 3.0) * vnoise(d * 7.0 + 2.0);
    // a galaxy, high over the bridge and astern of it: tilted, two arms wound round a core
    vec3 G = normalize(vec3(0.3, 0.82, 0.48));
    float gc = dot(d, G);
    if (gc > 0.6) {
      vec3 gx = normalize(cross(G, vec3(0.0, 0.0, 1.0))), gy = cross(G, gx);
      vec2 q = vec2(dot(d, gx), dot(d, gy)) / gc;
      q = vec2(q.x * 0.8 - q.y * 0.6, (q.x * 0.6 + q.y * 0.8) / 0.5) / 0.36; // (seen at a slant)
      float r = length(q), th = atan(q.y, q.x);
      float arms = pow(0.5 + 0.5 * cos(2.0 * (th - log(max(r, 0.02)) * 2.4) + uTime * 0.01), 3.0);
      float dust = 0.55 + 0.45 * vnoise(vec3(q * 9.0, 4.0));
      float body = exp(-r * 2.2) * (0.35 + 0.9 * arms * dust) * smoothstep(1.6, 0.6, r);
      vec3 gcol = mix(vec3(0.55, 0.6, 1.0), vec3(1.0, 0.78, 0.6), exp(-r * 3.0));
      col += gcol * body * 0.9 + vec3(1.0, 0.92, 0.8) * exp(-r * r * 60.0) * 1.2;
    }
    // the hole: a shadow, the ring of light bent round it, and the disc
    float ang = acos(clamp(dot(d, uHole), -1.0, 1.0));
    float disc = exp(-pow((ang - uHoleR * 1.75) / (uHoleR * 0.42), 2.0));
    vec3 tang = normalize(cross(uHole, d) + 1e-4);
    float streak = 0.55 + 0.45 * vnoise(vec3(ang / max(uHoleR, 1e-3) * 5.0, atan(tang.y, tang.x) * 2.0 + uTime * 0.25, 1.0));
    col += vec3(1.0, 0.5, 0.15) * disc * streak * 1.3;
    col += vec3(1.0, 0.85, 0.6) * exp(-pow((ang - uHoleR * 1.03) / (uHoleR * 0.035), 2.0)) * 1.6;
    col *= smoothstep(uHoleR * 0.97, uHoleR * 1.0, ang);
    // inside: the outside is all astern, in a circle that closes
    float back = acos(clamp(dot(d, -uHole), -1.0, 1.0));
    float open = 3.1416 * (1.0 - uIn) * (1.0 - uIn);
    vec3 astern = col * (1.0 - smoothstep(open * 0.9, open, back)) * (1.0 + 4.0 * uIn)
                + vec3(0.6, 0.8, 1.0) * exp(-pow((back - open) / 0.03, 2.0)) * 1.5 * (1.0 - uIn);
    col = mix(col, astern, step(0.001, uIn));
    gl_FragColor = vec4(col, 1.0);
  }
`;
// The megaworld, from outside: a worn shell, and what it kept showing through.
const MEGA_FRAG = /* glsl */ `
  ${NOISE}
  uniform float uTime;
  uniform vec3 uSun;
  uniform vec3 uSunCol;
  uniform float uDay;
  uniform float uFade;
  varying vec3 vW;
  varying vec3 vL;
  varying vec3 vN;
  void main() {
    vec3 n = normalize(vL);
    // the shell: plates, with a good part of them gone
    float plate = vnoise(n * 5.0) * 0.6 + vnoise(n * 12.0 + 3.0) * 0.4;
    float gone = smoothstep(0.5, 0.56, vnoise(n * 2.6 + 9.0) * 0.65 + vnoise(n * 7.0) * 0.35);
    vec3 cell = floor(n * 26.0);
    vec3 shell = vec3(0.1, 0.095, 0.085) * (0.5 + 0.9 * h31(cell)) * (0.6 + 0.6 * plate);
    shell = mix(shell, vec3(0.05, 0.11, 0.05), smoothstep(0.45, 0.7, vnoise(n * 9.0 + 20.0)) * 0.6); // growth, on what is left
    // under it: sea, some land, weather
    float land = smoothstep(0.52, 0.56, vnoise(n * 3.4 + 40.0));
    vec3 inner = mix(vec3(0.03, 0.14, 0.3), vec3(0.1, 0.24, 0.09), land);
    float cloud = smoothstep(0.55, 0.75, vnoise(n * 6.0 + vec3(uTime * 0.01, 0.0, 0.0)));
    inner = mix(inner, vec3(0.8, 0.84, 0.88), cloud * 0.6);
    vec3 col = mix(shell, inner, gone);
    // lit from one side by whatever lights it now
    float day = smoothstep(-0.15, 0.6, dot(normalize(vN), uSun));
    col *= (0.06 + 1.5 * day * uDay) * mix(vec3(1.0), uSunCol, 0.5);
    // the few threads still lit, on the dark side
    col += vec3(0.1, 0.7, 0.8) * step(0.992, h31(cell + 3.0)) * (1.0 - gone) * (1.0 - day) * 0.9;
    vec3 v = normalize(cameraPosition - vW);
    col += vec3(0.15, 0.3, 0.5) * pow(1.0 - max(dot(normalize(vN), v), 0.0), 3.0) * (0.2 + day * uDay); // air
    gl_FragColor = vec4(col * uFade, 1.0);
  }
`;
// A young world, made of the shell's strata: banded, and still warm.
const WORLD_VERT = /* glsl */ `
  attribute float aSeed;
  varying vec3 vL;
  varying vec3 vN;
  varying float vSeed;
  void main() {
    vL = position;
    vSeed = aSeed;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const WORLD_FRAG = /* glsl */ `
  uniform vec3 uSun;
  uniform float uDay;
  uniform float uFade;
  varying vec3 vL;
  varying vec3 vN;
  varying float vSeed;
  void main() {
    float band = sin(vL.y * 9.0 + vSeed * 30.0 + sin(vL.x * 5.0) * 0.6);
    vec3 a = 0.5 + 0.5 * cos(6.2832 * (vSeed + vec3(0.0, 0.33, 0.67)));
    vec3 col = mix(vec3(0.3, 0.25, 0.2), a, 0.45) * (0.75 + 0.25 * band);
    float day = smoothstep(-0.1, 0.6, dot(normalize(vN), uSun));
    gl_FragColor = vec4((col * (0.05 + 1.4 * day * uDay) + vec3(1.0, 0.4, 0.1) * 0.05 * (1.0 - day)) * uFade, 1.0);
  }
`;
// The archive, aboard: every record lit, entry zero among them.
const WALL_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vL;
  void main() {
    vec2 g = vec2(atan(vL.x, vL.z) * 22.0, vL.y * 1.9);
    vec2 gi = floor(g), gf = abs(fract(g) - 0.5) * 2.0;
    float s = fract(sin(dot(gi, vec2(12.9898, 78.233))) * 43758.5453);
    float edge = max(gf.x, gf.y);
    vec3 col = (0.5 + 0.5 * cos(6.2832 * (s + uTime * (0.012 + 0.02 * fract(s * 7.3)) + vec3(0.0, 0.33, 0.67)))) * (0.5 + 0.5 * (1.0 - edge));
    // (one of them is white, and does not change)
    col = mix(col, vec3(0.95, 0.97, 1.0), step(abs(gi.x - 3.0) + abs(gi.y - 2.0), 0.5));
    col *= 1.0 - smoothstep(0.8, 0.95, edge);
    gl_FragColor = vec4(col * 1.1, 1.0);
  }
`;

const ease = (a, b, x) => {
  const f = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return f * f * (3 - 2 * f);
};

// ctx: { scene, camera, hideFleet(), chapter }
export function createLaunch(ctx) {
  const { chapter } = ctx;
  const group = new THREE.Group();
  group.visible = false;
  ctx.scene.add(group);
  const time = { value: 0 };
  const T = C.EZ_LAUNCH_TIME, CROSS = C.EZ_LAUNCH_CROSS;

  // --- the sky, the megaworld, and what is round it ---
  const skyU = { uTime: time, uHole: { value: AHEAD }, uHoleR: { value: 0.05 }, uIn: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3600, 48, 32), new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.frustumCulled = false;
  sky.renderOrder = -5;
  group.add(sky);
  // lit by the day the megaworld has now (src/era.js)
  const sunDir = new THREE.Vector3(-0.5, 0.5, -0.25).normalize(); // (so the face of it the ship is leaving is the lit one)
  const megaU = { uTime: time, uSun: { value: sunDir }, uSunCol: DAY.col, uDay: { value: Math.max(DAY.k.value, 0.12) }, uFade: { value: 1 } };
  const world = new THREE.Group();
  const mega = new THREE.Mesh(new THREE.IcosahedronGeometry(MEGA_R, 6), new THREE.ShaderMaterial({ uniforms: megaU, vertexShader: VERT, fragmentShader: MEGA_FRAG, fog: false }));
  mega.frustumCulled = false;
  world.add(mega);
  let ring = null;
  if (EZ_NEW_WORLDS) {
    const N = 9;
    const geo = new THREE.IcosahedronGeometry(1, 3);
    const seeds = new Float32Array(N);
    ring = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ uniforms: megaU, vertexShader: WORLD_VERT, fragmentShader: WORLD_FRAG, fog: false }), N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.3 * Math.sin(i * 2.1);
      const r = MEGA_R * (1.9 + 0.25 * Math.sin(i * 1.7));
      seeds[i] = (i * 0.618) % 1;
      ring.setMatrixAt(i, m.compose(p.set(Math.cos(a) * r, 40 * Math.sin(i * 3.3), Math.sin(a) * r), q, s.setScalar(26 + 34 * ((i * 0.37) % 1))));
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    ring.frustumCulled = false;
    ring.rotation.set(0.5, 0, 0.25);
    world.add(ring);
  }
  group.add(world);

  // --- the bridge: the dome on the light ship's bow (world/eramade.js), walked
  // at its own size, with the ship behind it and the strands running back
  // from the dome's crown to the corner it finished. The hangar's own
  // builder, without the yard.
  const hangar = buildHangar(group);
  hangar.era(true);
  const made = createMade(hangar);
  made.show(true);
  for (const ch of hangar.root.children) if (ch !== hangar.vessel && ch !== made.root) ch.visible = false;
  const S = 10 / BRIDGE.dome; // so the dome is ten units across the floor, and people stand in it
  hangar.root.scale.setScalar(S);
  hangar.root.rotation.y = Math.PI - made.craft.rotation.y; // its bow the way the bridge faces: -z, at the hole
  hangar.root.position.set(0, 0, 0);
  hangar.root.updateMatrixWorld(true);
  // a point on the bridge, [x, z] from its middle, in this place's frame
  const onBridge = (xz, y = 0) => made.craft.localToWorld(new THREE.Vector3(xz[0], BRIDGE.y + y, BRIDGE.z + xz[1]));
  hangar.root.position.sub(onBridge([0, 0]));
  hangar.root.updateMatrixWorld(true);
  const R = BRIDGE.floor * S - 0.6; // the floor that can be stood on
  const helmAt = onBridge(BRIDGE.helm), pilotAt = onBridge(BRIDGE.pilot);
  const seatsAt = BRIDGE.seats.map((xz) => onBridge(xz)), standsAt = BRIDGE.stands.map((xz) => onBridge(xz));
  // what the camera turns to: the middle of the ship's block of cells, and the corner it finished
  const shipAt = hangar.vessel.localToWorld(new THREE.Vector3(0, 0, -250));
  const cornerAt = hangar.root.localToWorld(made.corner.clone());

  // --- the captains who are left, at their stations ---
  const npcs = [];
  const crew = CAPTAINS.map((c, i) => {
    const rig = buildCaptain(c.id);
    const x = standsAt[i].x, z = standsAt[i].z; // at their own seats, behind the pilot's
    rig.group.position.set(x, 0, z);
    rig.group.rotation.y = Math.PI; // looking ahead
    standRig(rig, 0);
    rig.group.visible = false;
    group.add(rig.group);
    const npc = { x: 1e6, y: 0, z: 1e6, role: 'captain', talk: () => ({ speaker: { name: c.name, species: c.species, cityId: 'The light ship' }, lines: LAUNCH.talk[c.id] || [] }) };
    npcs.push(npc);
    return { c, rig, npc, x, z, on: false };
  });

  // --- the scene ---
  let u = -1, said = -1, lastSaid = false; // its clock: -1 over (or never begun)
  let inside = false, prev = null, walker = null;
  // (it falls away off the starboard quarter: clear of the archive, which is dead astern)
  const megaFrom = new THREE.Vector3(0.86, -0.16, 0.3).normalize(), megaTo = new THREE.Vector3(0.9, 0.04, 0.42).normalize(); // (high enough to be seen over the bow's cells)
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
  const speak = (id, text, sec = 7) => {
    // (a line written for a captain who was lost is said by one who was not)
    const who = CAPTAINS.find((c) => c.id === id && !chapter.ez.isLost(c.id)) || CAPTAINS.find((c) => !chapter.ez.isLost(c.id));
    chapterHud.say(who ? `${who.short} — ${text}` : text, sec);
  };
  // everything the launch shows, from its clock alone (x past the end: as it is left)
  function pose(x) {
    // the megaworld falls astern, slowly and then not
    const far = ease(0, CROSS - 6, x);
    const dist = MEGA_R * 1.9 + 16000 * far * far * far;
    _a.lerpVectors(megaFrom, megaTo, ease(0, 30, x)).normalize();
    world.position.copy(_a).multiplyScalar(dist);
    world.rotation.y = 0.4 + x * 0.004;
    if (ring) ring.rotation.y = x * 0.02;
    // the hole comes up ahead until it is all there is ahead
    skyU.uHoleR.value = 0.05 + 1.5 * Math.pow(ease(6, CROSS, x), 2.2);
    const inn = ease(CROSS, T - 4, x);
    skyU.uIn.value = inn;
    megaU.uFade.value = 1 - ease(CROSS - 1, CROSS + 4, x);
    world.visible = megaU.uFade.value > 0.002;
    // under way the cells stop keeping their own time, and the spectrum runs down the hull as one
    const way = ease(4, CROSS, x) * (1 - 0.4 * inn);
    hangar.uniforms.uFlight.value = way;
    hangar.uniforms.uPhase.value = x * 0.03 * way;
    return inn;
  }
  function begin() {
    u = 0;
    said = -1;
    lastSaid = false;
    chapterHud.cine(true);
  }
  function finish() {
    u = -1;
    chapterHud.cine(false);
    chapter.setBeyond();
    pose(T);
    for (const m of crew) if (m.on) {
      m.npc.x = m.x;
      m.npc.z = m.z;
    }
  }

  const surfaces = [{ kind: 'disc', cx: 0, cz: 0, r: R - 0.5, y: 0 }];
  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: UP },
    noShip: true,
    speed: 1,
    exit: { x: 0, z: 0 },
    leaveHint: '',
    surfaces,
    colliders: [
      { x: helmAt.x, z: helmAt.z, r: 2.0 * S + 0.15, top: Infinity },
      { x: pilotAt.x, z: pilotAt.z, r: 1.1 * S + 0.1, top: Infinity },
      ...seatsAt.map((p) => ({ x: p.x, z: p.z, r: 1.1 * S + 0.1, top: Infinity })),
    ],
    floorYAt: floorOf(surfaces, 1.2),
    snap: 1.2,
    pad: new THREE.Vector3(),
    spawn: onBridge([BRIDGE.pilot[0], (BRIDGE.pilot[1] + BRIDGE.helm[1]) / 2]).setY(0), // between the pilot's seat and the helm
    spawnYaw: Math.PI,
    npcs,
    // (the one way on: the chapter past the horizon, GDD 5.7.7)
    consoles: [{ x: helmAt.x, y: 0, z: helmAt.z, r: 2.6, prompt: 'E — THE HELM', // (at the helm itself)
       off: () => u >= 0 || !chapter.reached('ez_beyond') || chapter.open(), use: () => ((site.portal = 'hz:deck'), null) }],
    onChoice: () => null,
    portal: null,
    held: () => u >= 0,
    // Watched, while it happens: from the port side of the dome at what is
    // being left; up and astern at the ship, the strands and the archive in
    // it; and then forward over the helm to what is ahead.
    camera(pos, target) {
      if (u < 0) return false;
      const look = ease(21, 27, u), turn = ease(31, 39, u);
      pos.set(-5.6, 3.1, -1.4);
      pos.lerp(_c.set(-1.6, 2.0, -2.2), look);
      pos.lerp(_d.set(0.2, 2.5, 4.6), turn);
      _a.copy(world.position).lerp(_b.lerpVectors(shipAt, cornerAt, 0.35), look);
      target.lerpVectors(_a, _b.copy(AHEAD).multiplyScalar(2000), turn);
      return true;
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
      // the figures are lit by the archive, from behind and above
      sun.light.position.set(0.1, 0.7, 0.7).normalize();
      sun.light.color.setRGB(0.8, 0.9, 1.0);
      sun.light.intensity = 1.3;
      sun.ambient.color.setRGB(0.4, 0.5, 0.7);
      sun.ambient.intensity = 0.5;
      ctx.hideFleet();
      for (const m of crew) {
        m.on = !chapter.ez.isLost(m.c.id);
        m.rig.group.visible = m.on;
        m.npc.x = m.npc.z = 1e6;
      }
      chapter.advance('ez_launch');
      // (come back to after it has happened: as it was left)
      if (chapter.reached('ez_beyond')) finish();
      else begin();
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      group.visible = false;
      if (u >= 0) chapterHud.cine(false);
      u = -1;
      hush();
      chapterHud.clear();
      ctx.scene.fog = prev.fog;
      sun.light.position.copy(prev.lightPos);
      sun.light.color.copy(prev.lightColor);
      sun.light.intensity = prev.lightI;
      sun.ambient.color.copy(prev.ambColor);
      sun.ambient.intensity = prev.ambI;
      prev = null;
    },
    tick(dt, t) {
      chapterHud.tick(dt);
      time.value = t;
      const d = Math.min(dt, 0.1);
      if (walker) sky.position.copy(walker);
      let drive = 0.35;
      if (u >= 0) {
        u += d;
        const inn = pose(u);
        drive = 0.5 + 0.5 * ease(4, CROSS, u) - 0.75 * inn;
        while (said + 1 < LAUNCH.lines.length && u >= LAUNCH.lines[said + 1][0]) {
          said++;
          const l = LAUNCH.lines[said];
          speak(l[1], l[2] || (EZ_NEW_WORLDS ? LAUNCH.worlds : LAUNCH.rested), 7.5);
        }
        if (!lastSaid && u >= CROSS + 5) {
          lastSaid = true;
          speak(LAUNCH.last[0], LAUNCH.last[1], 10);
        }
        if (u >= T) finish();
      }
      setHum(Math.max(0.12, drive));
      hangar.tick(t);
      for (const m of crew) {
        if (!m.on) continue;
        poseRig(m.rig, d, t, 'idle', 0);
        standRig(m.rig, 0);
        // (afterwards they turn to whoever comes to them)
        const near = u < 0 && walker && Math.hypot(walker.x - m.x, walker.z - m.z) < 5;
        liveCaptain(m.rig, d, t, false, near ? Math.atan2(walker.x - m.x, walker.z - m.z) - m.rig.group.rotation.y : 0);
      }
    },
    inside: () => inside,
    places: { helm: [helmAt.x, 0, helmAt.z], pilot: [pilotAt.x, 0, pilotAt.z] },
    info: () => ({
      u: +u.toFixed(1), end: T, cross: CROSS, hole: +skyU.uHoleR.value.toFixed(2), inside: +skyU.uIn.value.toFixed(2),
      mega: Math.round(world.position.length()), megaShown: world.visible, worlds: ring ? ring.count : 0,
      crew: crew.filter((m) => m.on).map((m) => m.c.id), day: DAY.kind,
      flight: +hangar.uniforms.uFlight.value.toFixed(2), r: +R.toFixed(1),
      bridge: { helm: [helmAt.x, helmAt.z].map((v) => +v.toFixed(2)), pilot: [pilotAt.x, pilotAt.z].map((v) => +v.toFixed(2)), stands: standsAt.map((p) => [+p.x.toFixed(2), +p.z.toFixed(2)]) },
    }),
    seek(x) {
      if (u >= 0) u = x;
    },
  };
  return site;
}
