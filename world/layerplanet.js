// A planet in five layers (GDD 5.7.4): sky, ground, structures, life, light.
//
// Every world in the megaworld chapter is drawn by this: the pilot's home
// turning outside the suite, the worlds of the holo rooms, the one the light
// ship tries to render, and the one that has never been. A layer is filled by
// a FRAGMENT (plain data: world/chapter-dialogue.js) and the layers are simply
// stacked, so nothing is drawn ahead of time and any mix of fragments from any
// worlds is a planet.
//
//   const p = createLayerPlanet(radius, { life: 500 });
//   p.set('ground', fragment)      fill a layer (null empties it)
//   p.reveal('ground', 0..1)       how much of it has been drawn, south to north
//   p.holo(0..1)                   0 a real world, 1 a hologram of one
//   p.tick(t, pxScale)             once a frame; pxScale = viewport px per unit at 1 unit
//
// Six draws when full, no textures, no per-frame allocation.

import * as THREE from 'three';

export const LAYERS = ['sky', 'ground', 'structures', 'life', 'light'];

const NOISE = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return s;
  }
  // the ground's height, shared by every layer that has to know where land is
  uniform float uScale;
  uniform float uSeed;
  float height(vec3 n) { return fbm(n * uScale + uSeed); }
`;

// what a layer shows of itself: drawn from the south pole up, with a bright
// line where the drawing is, and (as a hologram) scan lines over all of it
const REVEAL = /* glsl */ `
  uniform float uReveal;
  uniform float uHolo;
  uniform float uTime;
  // returns the mask; edge is the line of light at the front
  float revealed(vec3 n, out float edge) {
    float lat = n.y * 0.5 + 0.5;
    float front = uReveal * 1.06 - 0.03 + 0.012 * sin(atan(n.z, n.x) * 9.0 + uTime * 2.0);
    edge = smoothstep(0.035, 0.0, abs(lat - front)) * step(uReveal, 0.999);
    return step(lat, front);
  }
  float scan(vec3 n) { return 0.82 + 0.18 * sin(n.y * 140.0 - uTime * 3.0); }
`;

const VERT = /* glsl */ `
  varying vec3 vN;   // the unit sphere's own normal: where on the world this is
  varying vec3 vWN;  // ...in the world's frame, for the light
  varying vec3 vV;
  void main() {
    vN = normalize(position);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWN = normalize(mat3(modelMatrix) * vN);
    vV = normalize(cameraPosition - w.xyz);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const GROUND_FRAG = /* glsl */ `
  ${NOISE}
  ${REVEAL}
  uniform vec3 uSea, uLand, uHigh;
  uniform float uLevel;
  uniform vec3 uLight;
  varying vec3 vN, vWN, vV;
  void main() {
    float edge;
    float m = revealed(vN, edge);
    if (m + edge < 0.01) discard;
    float h = height(vN);
    float land = smoothstep(uLevel - 0.012, uLevel + 0.012, h);
    vec3 c = mix(uLand, uHigh, smoothstep(uLevel + 0.05, uLevel + 0.3, h));
    // the sea: deeper away from the shore, and it catches the light
    vec3 sea = uSea * (0.55 + 0.9 * smoothstep(uLevel - 0.3, uLevel, h));
    c = mix(sea, c, land);
    float d = max(dot(vWN, uLight), 0.0);
    vec3 hv = normalize(uLight + vV);
    float spec = pow(max(dot(vWN, hv), 0.0), 60.0) * (1.0 - land);
    vec3 lit = c * (0.16 + 1.05 * d) + spec * 0.9;
    // the shoreline, drawn in light: it is the first thing a hologram shows
    float shore = smoothstep(0.02, 0.0, abs(h - uLevel));
    float rim = pow(1.0 - max(dot(vWN, vV), 0.0), 2.5);
    vec3 holo = (c * 0.75 + vec3(0.1, 0.3, 0.42) * rim + shore * vec3(0.5, 0.9, 1.0) * 0.6) * scan(vN);
    vec3 col = mix(lit, holo, uHolo) * m + edge * vec3(0.7, 1.3, 1.6);
    gl_FragColor = vec4(col, mix(1.0, 0.9, uHolo));
  }
`;

const STRUCT_FRAG = /* glsl */ `
  ${NOISE}
  ${REVEAL}
  uniform vec3 uCol;
  uniform float uKind, uDensity, uLevel, uHasGround;
  uniform vec3 uLight;
  varying vec3 vN, vWN, vV;
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float edge;
    float m = revealed(vN, edge);
    if (m < 0.5) discard;
    // a grid on the globe; the cells narrow toward the poles and are let go there
    float lat = asin(clamp(vN.y, -1.0, 1.0)), lon = atan(vN.z, vN.x);
    vec2 g = vec2(lon * 44.0, lat * 44.0);
    vec2 id = floor(g), f = fract(g) - 0.5;
    float r = h2(id);
    float on = step(r, uDensity) * smoothstep(1.35, 1.0, abs(lat));
    // built on the land, where there is any
    float land = mix(1.0, smoothstep(uLevel, uLevel + 0.03, height(vN)), uHasGround);
    float s;
    if (uKind < 0.5) {            // blocks: a lit square, windows in it
      s = step(max(abs(f.x), abs(f.y)), 0.3) * (0.55 + 0.45 * step(0.5, fract(f.x * 6.0)) * step(0.5, fract(f.y * 6.0)));
    } else if (uKind < 1.5) {     // rings: one inside another
      float d = length(f);
      s = smoothstep(0.05, 0.0, abs(fract(d * 5.0) - 0.5) - 0.16) * step(d, 0.46);
    } else if (uKind < 2.5) {     // lines: a run across the cell, lights moving along it
      float along = r > uDensity * 0.5 ? f.x : f.y, across = r > uDensity * 0.5 ? f.y : f.x;
      s = smoothstep(0.07, 0.0, abs(across)) * (0.4 + 0.6 * step(0.6, fract(along * 4.0 - uTime * 0.6 * (r + 0.4))));
      on = step(r, uDensity + 0.25) * smoothstep(1.35, 1.0, abs(lat));
    } else {                      // spires: a point of light with a long glow
      float d = length(f);
      s = smoothstep(0.1, 0.0, d) * 2.0 + smoothstep(0.42, 0.0, d) * 0.35;
    }
    float tw = 0.75 + 0.25 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
    // they show on the night side and in a hologram; daylight drowns them
    float night = mix(smoothstep(0.25, -0.15, dot(vWN, uLight)) * 0.9 + 0.25, 1.0, uHolo);
    float a = s * on * land * tw * night;
    gl_FragColor = vec4(uCol * a * 1.6, a);
  }
`;

const SKY_FRAG = /* glsl */ `
  ${NOISE}
  ${REVEAL}
  uniform vec3 uA, uB;
  uniform float uBands;
  uniform vec3 uLight;
  varying vec3 vN, vWN, vV;
  void main() {
    float edge;
    float m = revealed(vN, edge);
    if (m + edge < 0.01) discard;
    float fres = pow(1.0 - max(dot(vWN, vV), 0.0), 2.2);
    // cloud: drifting, drawn out along the latitudes as far as uBands says
    vec3 p = vec3(vN.x, vN.y * mix(1.0, 5.0, uBands), vN.z) * 2.6;
    float ang = uTime * 0.02;
    p.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p.xz;
    float cl = smoothstep(0.5, 0.72, fbm(p + uSeed * 0.37));
    float d = max(dot(vWN, uLight), 0.0);
    float day = mix(0.12 + 0.95 * d, 0.85, uHolo);
    vec3 col = uB * cl * day + uA * fres * (0.5 + 0.8 * d + 0.5 * uHolo);
    float a = clamp(cl * 0.7 + fres * 0.85, 0.0, 1.0) * m;
    col = col * mix(1.0, scan(vN), uHolo) + edge * uA * 1.5;
    gl_FragColor = vec4(col, max(a, edge * 0.8));
  }
`;

// the air seen from outside: a soft shell of colour round the limb
const HALO_VERT = /* glsl */ `
  varying vec3 vWN, vV;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWN = normalize(mat3(modelMatrix) * normalize(position));
    vV = normalize(cameraPosition - w.xyz);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const HALO_FRAG = /* glsl */ `
  uniform vec3 uA;
  uniform float uReveal, uHolo;
  varying vec3 vWN, vV;
  void main() {
    float k = pow(max(dot(-vWN, vV), 0.0), 5.0);
    gl_FragColor = vec4(uA * k * uReveal * (0.55 + 0.5 * uHolo), 1.0);
  }
`;

// life: points on orbits just over the ground, each with its own inclination
const LIFE_VERT = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uTime, uKind, uSpeed, uRadius, uPx, uReveal;
  varying float vFade;
  void main() {
    // flocks keep to a few orbits; a herd keeps to the middle; drifters go anywhere
    float lanes = uKind < 0.5 ? floor(aSeed.x * 5.0) / 5.0 + aSeed.z * 0.03 : aSeed.x;
    float incl = (uKind > 0.5 && uKind < 1.5) ? (aSeed.x - 0.5) * 0.35 : lanes * 6.2832;
    float node = uKind < 0.5 ? floor(aSeed.x * 5.0) * 1.9 : aSeed.z * 6.2832;
    float clump = uKind < 0.5 ? aSeed.y * 0.9 : aSeed.y * 6.2832;
    float a = clump + uTime * uSpeed * (0.25 + 0.2 * aSeed.z);
    vec3 p = vec3(cos(a), 0.0, sin(a));
    float ci = cos(incl), si = sin(incl);
    p = vec3(p.x, p.z * si, p.z * ci);
    float cn = cos(node), sn = sin(node);
    p = vec3(p.x * cn - p.z * sn, p.y, p.x * sn + p.z * cn);
    float bob = 1.045 + 0.02 * sin(uTime * (1.0 + aSeed.y * 2.0) + aSeed.x * 30.0);
    vec4 mv = modelViewMatrix * vec4(p * uRadius * bob, 1.0);
    gl_Position = projectionMatrix * mv;
    // they arrive a few at a time
    vFade = smoothstep(aSeed.z, aSeed.z + 0.08, uReveal * 1.08);
    gl_PointSize = clamp(uPx * uRadius * (0.012 + 0.016 * aSeed.y) / max(-mv.z, 0.01), 1.5, 48.0) * vFade;
  }
`;
const LIFE_FRAG = /* glsl */ `
  uniform vec3 uCol;
  varying float vFade;
  void main() {
    float r = length(gl_PointCoord * 2.0 - 1.0);
    if (r > 1.0 || vFade < 0.01) discard;
    gl_FragColor = vec4(uCol * pow(1.0 - r, 1.6) * 1.8 * vFade, 1.0);
  }
`;

const _c = new THREE.Color();
const hex = (h, target) => target.copy(_c.set(h));

export function createLayerPlanet(radius = 1, opts = {}) {
  const group = new THREE.Group();
  const LIFE_N = opts.life ?? 400;
  const light = new THREE.Vector3(0.55, 0.45, 0.7).normalize();
  // shared by every shell: one clock, one hologram dial, one ground to stand on
  const shared = {
    uTime: { value: 0 }, uHolo: { value: 0 }, uLight: { value: light },
    uScale: { value: 2 }, uSeed: { value: opts.seed ?? 3.7 }, uLevel: { value: 0.5 },
  };
  const U = {
    ground: { ...shared, uReveal: { value: 0 }, uSea: { value: new THREE.Color() }, uLand: { value: new THREE.Color() }, uHigh: { value: new THREE.Color() } },
    structures: { ...shared, uReveal: { value: 0 }, uCol: { value: new THREE.Color() }, uKind: { value: 0 }, uDensity: { value: 0.4 }, uHasGround: { value: 0 } },
    sky: { ...shared, uReveal: { value: 0 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uBands: { value: 0.4 } },
    life: { uTime: shared.uTime, uReveal: { value: 0 }, uCol: { value: new THREE.Color() }, uKind: { value: 0 }, uSpeed: { value: 0.5 }, uRadius: { value: radius }, uPx: { value: 600 } },
  };
  const haloU = { uA: U.sky.uA, uReveal: U.sky.uReveal, uHolo: shared.uHolo };

  const ball = (r, seg) => new THREE.SphereGeometry(r, seg, Math.round(seg * 0.6));
  const shell = (geo, frag, uniforms, extra) => {
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, fog: false, ...extra }));
    m.visible = false;
    group.add(m);
    return m;
  };
  const ground = shell(ball(radius, 64), GROUND_FRAG, U.ground, { transparent: true });
  ground.renderOrder = 1;
  const structures = shell(ball(radius * 1.004, 64), STRUCT_FRAG, U.structures, {
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  structures.renderOrder = 2;
  const sky = shell(ball(radius * 1.07, 48), SKY_FRAG, U.sky, { transparent: true, depthWrite: false });
  sky.renderOrder = 4;
  const halo = new THREE.Mesh(ball(radius * 1.28, 32), new THREE.ShaderMaterial({
    vertexShader: HALO_VERT, fragmentShader: HALO_FRAG, uniforms: haloU,
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.visible = false;
  halo.renderOrder = 0;
  group.add(halo);

  // life
  const seeds = new Float32Array(LIFE_N * 3);
  let s = 0x9e3779b9 ^ Math.floor((opts.seed ?? 3.7) * 1000);
  const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) ^ (s << 7)), (s >>> 0) / 4294967296);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
  const lifeGeo = new THREE.BufferGeometry();
  lifeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LIFE_N * 3), 3));
  lifeGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  const life = new THREE.Points(lifeGeo, new THREE.ShaderMaterial({
    vertexShader: LIFE_VERT, fragmentShader: LIFE_FRAG, uniforms: U.life,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  life.frustumCulled = false;
  life.visible = false;
  life.renderOrder = 3;
  group.add(life);

  // light: a moon on an orbit, a ring, or a crown at the pole
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const moonArm = new THREE.Group();
  const moon = new THREE.Mesh(ball(radius * 0.1, 20), lightMat);
  moon.position.set(radius * 1.75, 0, 0);
  const moonGlow = new THREE.Mesh(ball(radius * 0.19, 16), glowMat);
  moonGlow.position.copy(moon.position);
  moonArm.add(moon, moonGlow);
  moonArm.rotation.z = 0.35;
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.42, radius * 1.95, 96, 1), glowMat);
  ring.rotation.x = Math.PI / 2 - 0.42;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.34, radius * 0.5, radius * 0.5, 48, 1, true).translate(0, radius * 1.08, 0), glowMat);
  const lights = [moonArm, ring, crown];
  for (const l of lights) {
    l.visible = false;
    l.renderOrder = 5;
    group.add(l);
  }
  let lightKind = -1;
  let lightReveal = 0;
  const lightCol = new THREE.Color(1, 1, 1);

  const filled = { sky: null, ground: null, structures: null, life: null, light: null };
  const amount = { sky: 0, ground: 0, structures: 0, life: 0, light: 0 };

  function show() {
    ground.visible = !!filled.ground && amount.ground > 0;
    structures.visible = !!filled.structures && amount.structures > 0;
    sky.visible = halo.visible = !!filled.sky && amount.sky > 0;
    life.visible = !!filled.life && amount.life > 0;
    for (let i = 0; i < lights.length; i++) lights[i].visible = !!filled.light && i === lightKind && amount.light > 0;
  }

  return {
    group,
    filled,
    // Fill a layer from a fragment (or empty it with null). Its reveal is kept.
    set(layer, f) {
      filled[layer] = f || null;
      if (f) {
        if (layer === 'ground') {
          hex(f.sea, U.ground.uSea.value);
          hex(f.land, U.ground.uLand.value);
          hex(f.high, U.ground.uHigh.value);
          shared.uScale.value = f.scale ?? 2;
          shared.uLevel.value = f.level ?? 0.5;
        } else if (layer === 'structures') {
          hex(f.col, U.structures.uCol.value);
          U.structures.uKind.value = f.kind ?? 0;
          U.structures.uDensity.value = f.density ?? 0.4;
        } else if (layer === 'sky') {
          hex(f.a, U.sky.uA.value);
          hex(f.b, U.sky.uB.value);
          U.sky.uBands.value = f.bands ?? 0.4;
        } else if (layer === 'life') {
          hex(f.col, U.life.uCol.value);
          U.life.uKind.value = f.kind ?? 0;
          U.life.uSpeed.value = f.speed ?? 0.5;
        } else if (layer === 'light') {
          hex(f.col, lightCol);
          lightKind = f.kind ?? 0;
        }
      }
      U.structures.uHasGround.value = filled.ground ? 1 : 0;
      show();
    },
    // Every layer at once, from { sky, ground, ... } (a world's `layers`).
    setAll(layers) {
      for (const l of LAYERS) this.set(l, layers ? layers[l] : null);
    },
    reveal(layer, v) {
      amount[layer] = v;
      if (layer === 'light') lightReveal = v;
      else U[layer].uReveal.value = v;
      show();
    },
    revealAll(v) {
      for (const l of LAYERS) this.reveal(l, v);
    },
    holo(v) {
      shared.uHolo.value = v;
    },
    tick(t, pxScale) {
      shared.uTime.value = t;
      U.life.uPx.value = pxScale;
      moonArm.rotation.y = t * 0.22;
      ring.rotation.z = t * 0.05;
      // the light comes up from nothing, and a hologram's light is never steady
      const flick = 1 - shared.uHolo.value * 0.12 * (0.5 + 0.5 * Math.sin(t * 9.0));
      const k = lightReveal * flick;
      lightMat.color.copy(lightCol).multiplyScalar(1.5 * k);
      lightMat.opacity = Math.min(k * 2, 1);
      glowMat.color.copy(lightCol).multiplyScalar(0.42 * k);
    },
    dispose() {
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    },
  };
}
