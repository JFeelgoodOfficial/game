// Prototype: glass that holds light (GDD 5.7.10). A test scene, reached only
// through `__debug.proto.glass` (src/protoLazy.js). It is in no story.
//
// The look a later season needs: glass that is not a window. Three things are
// asked of it, and each is a term of one shader (GLASS_FRAG):
//
//   it bends what is behind it   Refraction. On the tiers that can pay for it
//       the scene behind the glass is drawn once more each frame, without the
//       glass, into a target, and every facet reads that picture a little to
//       one side of where it is: how far depends on how the facet leans to the
//       eye. Red and blue are read a little apart (dispersion), so edges split
//       into colour. On LOW there is no second drawing: the bent ray is looked
//       up in the sky's own function instead (ENV), which costs nothing and
//       bends only the sky.
//   it keeps light               Absorption by thickness (a facet seen square
//       on is looked through at its thickest, and takes most), a rim that
//       catches the star (Fresnel), and the star's own glint.
//   something moves in it        Colour, slowly: a field of noise sampled at a
//       few depths along the line of sight into the glass, so it has depth and
//       parallax and is not a pattern on the surface. This is what an encased
//       mind looks like from outside.
//
// It is shown on two things. A crown: a ring of long shards turning slowly
// round a small captured star, with the star's light drawn between them as a
// lattice. And one figure, standing inside a shard: a made figure
// (world/aliens.js buildRig), never the pilot's own model.
//
// Physics, and where it is left. Real: Snell's law, Fresnel reflection rising
// toward grazing angles, dispersion (blue bends more than red), Beer-Lambert
// absorption. Approximated: one refraction at the near face only, in screen
// space, with no second surface and no total internal reflection; thickness
// guessed from the angle of the facet. Not physics at all: light that stays.
// Glass does not keep light. That it does here is the fiction.

import * as THREE from 'three';
import { C, GLASS_TIER } from '../src/constants.js';
import { mulberry32 } from '../src/noise2.js';
import { buildRig, poseRig } from './aliens.js';
import { measureRig, standRig } from './rigGround.js';

const FIG = new THREE.Vector3(620, -140, 260); // where the encased figure stands, clear of the crown
const STAR_COL = new THREE.Color(1.0, 0.86, 0.62);

// The sky, as a function of direction: stars, and two soft clouds, so that a
// bent ray lands on something different from a straight one.
const ENV = /* glsl */ `
  float eh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  vec3 envColor(vec3 d) {
    vec3 col = vec3(0.004, 0.006, 0.014);
    vec3 g = floor(d * 110.0);
    float s = eh(g);
    vec3 c = (g + 0.5) / 110.0;
    float pt = smoothstep(0.0026, 0.0, length(d - normalize(c)) - 0.0012 * s);
    col += vec3(0.8, 0.88, 1.0) * step(0.94, s) * pt * (0.15 + 0.55 * eh(g + 3.0)); // (kept under the bloom's threshold: stars, not lamps)
    float a = max(0.0, dot(d, normalize(vec3(0.5, 0.2, -0.84))));
    float b = max(0.0, dot(d, normalize(vec3(-0.7, -0.3, 0.64))));
    col += vec3(0.5, 0.16, 0.34) * pow(a, 5.0) * 0.5 + vec3(0.1, 0.36, 0.42) * pow(b, 4.0) * 0.4;
    return col;
  }
`;
const SKY_VERT = /* glsl */ `
  varying vec3 vD;
  void main() {
    vD = position;
    gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
  }
`;
const SKY_FRAG = /* glsl */ `
  ${ENV}
  varying vec3 vD;
  void main() { gl_FragColor = vec4(envColor(normalize(vD)), 1.0); }
`;
const GLASS_VERT = /* glsl */ `
  varying vec3 vW;
  varying vec3 vO;
  void main() {
    vO = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const GLASS_FRAG = /* glsl */ `
  ${ENV}
  uniform sampler2D uScene;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uSeed;
  uniform float uRefract;
  uniform float uDisperse;
  uniform float uAbsorb;
  uniform float uMind;
  uniform float uMindSpeed;
  uniform float uRim;
  uniform float uThrough;
  uniform float uKeep;
  uniform float uScale;
  uniform vec3 uStar;
  uniform vec3 uStarCol;
  uniform float uStarFall;
  uniform vec3 uCamObj;
  varying vec3 vW;
  varying vec3 vO;
  float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  // (a narrow run of colour: teal through blue to violet, with one warm turn; not the whole wheel)
  vec3 palette(float t) { return vec3(0.42, 0.5, 0.62) + vec3(0.42, 0.4, 0.38) * cos(6.2831 * (t * 0.6 + vec3(0.58, 0.4, 0.22))); }
  void main() {
    // facets: the face's own normal, not a smoothed one
    vec3 N = normalize(cross(dFdx(vW), dFdy(vW)));
    vec3 V = normalize(cameraPosition - vW);
    if (dot(N, V) < 0.0) N = -N;
    float nv = clamp(dot(N, V), 0.0, 1.0);
    float F = pow(1.0 - nv, 3.0);
    // --- what is behind it, bent ---
    vec3 bg;
    #ifdef GLASS_SCENE
      vec3 Nv = mat3(viewMatrix) * N;
      vec2 uv = gl_FragCoord.xy / uRes;
      vec2 off = Nv.xy * uRefract * (0.3 + 0.7 * (1.0 - nv));
      off.x *= uRes.y / uRes.x;
      #ifdef GLASS_DISPERSE
        bg = vec3(texture2D(uScene, uv + off * (1.0 + uDisperse)).r, texture2D(uScene, uv + off).g, texture2D(uScene, uv + off * (1.0 - uDisperse)).b);
      #else
        bg = texture2D(uScene, uv + off).rgb;
      #endif
    #else
      vec3 rd = refract(-V, N, 0.72);
      if (dot(rd, rd) < 0.01) rd = reflect(-V, N);
      bg = envColor(rd);
      bg += uStarCol * pow(max(dot(rd, normalize(uStar - vW)), 0.0), 220.0) * 5.0 * uStarFall;
    #endif
    // --- what it keeps: more is taken the more glass is looked through ---
    float th = 0.3 + 0.7 * nv;
    vec3 tint = exp(-uAbsorb * uKeep * th * vec3(1.7, 0.5, 0.85));
    // --- what moves in it: colour, at several depths along the line of sight ---
    vec3 Vo = normalize(uCamObj - vO);
    vec3 mind = vec3(0.0);
    for (int i = 0; i < GLASS_STEPS; i++) {
      vec3 p = (vO - Vo * (0.5 + float(i) * 1.3) * uScale) / uScale;
      float veil = smoothstep(0.32, 0.68, vnoise(p * 0.085 + vec3(uSeed * 3.1, uTime * uMindSpeed * 0.6, 0.0)));
      float n = vnoise(p * 0.19 + vec3(0.0, uTime * uMindSpeed, uSeed * 7.0));
      mind += palette(n * 1.25 + uSeed + uTime * 0.008) * veil;
    }
    mind *= uMind * uKeep / float(GLASS_STEPS);
    // --- the star: caught on the facets that face it, on every edge, and as a glint ---
    vec3 L = normalize(uStar - vW);
    float fall = uStarFall / (1.0 + dot(uStar - vW, uStar - vW) * 0.00035);
    float facing = pow(max(dot(N, L), 0.0), 1.5);
    float spec = pow(max(dot(reflect(-L, N), V), 0.0), 90.0);
    vec3 col = bg * tint * (1.0 - 0.5 * F);
    col += mind * (0.35 + 0.65 * th);
    col += uStarCol * (facing * 0.1 * uKeep + F * uRim) * fall;
    col += uStarCol * spec * 3.0 * fall;
    gl_FragColor = vec4(col, mix(1.0, clamp(0.3 + 0.7 * F + dot(mind, vec3(0.5)), 0.0, 1.0), uThrough));
  }
`;
// The lattice: the star's light, drawn where the glass sends it.
const BEAM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const BEAM_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uK;
  uniform vec3 uCol;
  varying vec2 vUv;
  void main() {
    float a = pow(1.0 - vUv.y, 0.7) * (0.75 + 0.25 * sin(uTime * 2.3 + vUv.y * 30.0));
    gl_FragColor = vec4(uCol * a * uK, 1.0);
  }
`;

function glowTexture() {
  const n = 64, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2);
    const a = Math.max(0, 1 - r);
    const i = (y * n + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = Math.round(255 * a * a * a);
  }
  const tex = new THREE.DataTexture(data, n, n);
  tex.needsUpdate = true;
  return tex;
}
// a shard: a long crystal of six faces, pointed at both ends, along +Y
function shardGeo(len, w, rng) {
  const pts = [new THREE.Vector2(0.001, -len / 2), new THREE.Vector2(w * (0.8 + 0.3 * rng()), -len / 2 + len * (0.1 + 0.08 * rng())), new THREE.Vector2(w * (0.55 + 0.3 * rng()), len / 2 - len * (0.22 + 0.15 * rng())), new THREE.Vector2(0.001, len / 2)];
  return new THREE.LatheGeometry(pts, 6);
}

// env: { renderer, tier }
export function createGlassProto(env) {
  const { renderer } = env;
  const T = GLASS_TIER[env.tier] || GLASS_TIER.medium;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 20000);
  const time = { value: 0 };
  const res = { value: new THREE.Vector2(1, 1) };
  const rt = T.scene ? new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true }) : null;
  const shared = {
    uScene: { value: rt ? rt.texture : null }, uRes: res, uTime: time,
    uRefract: { value: C.GLASS_REFRACT }, uDisperse: { value: C.GLASS_DISPERSE }, uAbsorb: { value: C.GLASS_ABSORB },
    uMind: { value: C.GLASS_MIND }, uMindSpeed: { value: C.GLASS_MIND_SPEED }, uRim: { value: C.GLASS_RIM },
    uStarCol: { value: STAR_COL.clone().multiplyScalar(C.GLASS_STAR) },
  };
  const defines = { GLASS_STEPS: T.steps };
  if (T.scene) defines.GLASS_SCENE = 1;
  if (T.disperse) defines.GLASS_DISPERSE = 1;
  // keep: how much of the glass's own light and colour this piece shows (less, where something stands inside it to be seen)
  const glassMat = (seed, star, fall, scale, through, keep = 1) => new THREE.ShaderMaterial({
    uniforms: { ...shared, uSeed: { value: seed }, uStar: { value: star }, uStarFall: { value: fall }, uScale: { value: scale }, uThrough: { value: through ? 1 : 0 }, uKeep: { value: keep }, uCamObj: { value: new THREE.Vector3() } },
    defines, vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, transparent: !!through, depthWrite: !through, side: THREE.DoubleSide, fog: false,
  });
  const _inv = new THREE.Matrix4();
  const track = (mesh) => {
    mesh.frustumCulled = false;
    mesh.onBeforeRender = (r, s, cam) => {
      mesh.material.uniforms.uCamObj.value.copy(cam.position).applyMatrix4(_inv.copy(mesh.matrixWorld).invert());
    };
    return mesh;
  };

  // --- the sky ---
  const sky = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }));
  sky.scale.setScalar(9000);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);
  scene.add(new THREE.AmbientLight(0x8fa4c8, 0.9));
  const key = new THREE.DirectionalLight(0xffe6c0, 1.5);
  key.position.set(0.4, 1, 0.5);
  scene.add(key);

  // --- the crown: a captured star, and the shards that turn round it ---
  const crown = new THREE.Group();
  scene.add(crown);
  const star = new THREE.Mesh(new THREE.SphereGeometry(4.2, 20, 14), new THREE.MeshBasicMaterial({ color: STAR_COL.clone().multiplyScalar(C.GLASS_STAR), fog: false }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: STAR_COL, map: glowTexture(), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glow.scale.setScalar(44);
  crown.add(star, glow);
  const glass = new THREE.Group(); // everything of glass: hidden while what is behind it is drawn
  crown.add(glass);
  const beams = new THREE.Group();
  crown.add(beams);
  const beamMat = (k, col) => new THREE.ShaderMaterial({ uniforms: { uTime: time, uK: { value: k }, uCol: { value: col } }, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0); // from the origin, along +Y, one long
  const beamK = { value: C.GLASS_BEAM };
  const Y = new THREE.Vector3(0, 1, 0);
  function beam(a, b, w, col) {
    const m = new THREE.Mesh(beamGeo, beamMat(1, col));
    m.material.uniforms.uK = beamK;
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    m.position.copy(a);
    m.quaternion.setFromUnitVectors(Y, d.multiplyScalar(1 / len));
    m.scale.set(w, len, w);
    m.frustumCulled = false;
    beams.add(m);
  }
  const shards = [];
  {
    const rng = mulberry32(0x61a55);
    const N = T.shards;
    const ZEROV = new THREE.Vector3();
    const tips = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const tall = i % 2 === 0;
      const len = C.GLASS_SHARD_LEN * (tall ? 1 : 0.62) * (0.9 + 0.2 * rng());
      const w = len * (0.12 + 0.05 * rng());
      const m = track(new THREE.Mesh(shardGeo(len, w, rng), glassMat(rng(), ZEROV, 1, 1, false)));
      const rad = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      // a crown's points: standing, leaning out a little
      const axis = new THREE.Vector3().copy(rad).multiplyScalar(0.28 + 0.12 * rng()).add(Y).normalize();
      const at = rad.clone().multiplyScalar(C.GLASS_RING_R).addScaledVector(Y, tall ? 8 : -6);
      m.position.copy(at);
      m.quaternion.setFromUnitVectors(Y, axis);
      glass.add(m);
      shards.push({ m, axis, spin: (rng() - 0.5) * 0.16, base: m.quaternion.clone(), a: 0 });
      const foot = at.clone().addScaledVector(axis, -len * 0.42), head = at.clone().addScaledVector(axis, len * 0.46);
      tips.push({ foot, head, axis });
      // the star's light, to the foot of each shard...
      beam(ZEROV, foot, 0.5, STAR_COL.clone());
      // ...and out of its point, bent, into the dark
      beam(head, head.clone().addScaledVector(axis, 70).addScaledVector(rad, 22), 0.34, new THREE.Color().setHSL((i / N + 0.55) % 1, 0.7, 0.6));
    }
    // ...and from point to point round the ring: the lattice
    for (let i = 0; i < N; i++) {
      beam(tips[i].head, tips[(i + 2) % N].foot, 0.22, new THREE.Color(0.6, 0.9, 1.0));
      beam(tips[i].foot, tips[(i + 1) % N].foot, 0.18, new THREE.Color(1.0, 0.8, 0.6));
    }
  }

  // --- the encased figure: someone standing inside a shard ---
  const stand = new THREE.Group();
  stand.position.copy(FIG);
  scene.add(stand);
  const rig = measureRig(buildRig(0x9c1a55, 'glass'));
  stand.add(rig.group);
  const lampAt = FIG.clone().add(new THREE.Vector3(2.5, 6, 3));
  const figGlass = new THREE.Group();
  stand.add(figGlass);
  {
    const rng = mulberry32(0xf1c5);
    // (on the tier with no second drawing, this one shard is blended over the figure instead, or it would hide it)
    const m = track(new THREE.Mesh(shardGeo(7.4, 1.25, rng), glassMat(0.37, lampAt, 0.3, 0.12, !T.scene, 0.45)));
    m.position.set(0, 2.2, 0);
    m.rotation.set(0.05, 0.4, -0.06);
    m.renderOrder = 5;
    figGlass.add(m);
    // a plinth of smaller shards round its foot
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const s = track(new THREE.Mesh(shardGeo(1.8 + rng() * 1.6, 0.32, rng), glassMat(rng(), lampAt, 0.45, 0.12, false)));
      s.position.set(Math.cos(a) * 1.9, 0.4, Math.sin(a) * 1.9);
      s.rotation.set((rng() - 0.5) * 0.9, a, (rng() - 0.5) * 0.9);
      figGlass.add(s);
    }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3.4, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.6, metalness: 0.2 }));
    floor.position.y = -0.02;
    stand.add(floor);
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ color: STAR_COL, map: glowTexture(), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    lamp.position.copy(lampAt).sub(FIG);
    lamp.scale.setScalar(2.4);
    stand.add(lamp);
  }

  // --- state ---
  const P = { view: 'crown', orbit: true, angle: 0.6, dist: null, height: null, spin: C.GLASS_SPIN };
  let frames = 0, fps = 0, fpsT = 0, fpsN = 0, t = 0;
  const _size = new THREE.Vector2();
  const _look = new THREE.Vector3();

  function frame(dt, render) {
    t += dt;
    time.value = t;
    frames++;
    fpsT += dt;
    fpsN++;
    if (fpsT >= 1) {
      fps = fpsN / fpsT;
      fpsT = fpsN = 0;
    }
    crown.rotation.y += P.spin * dt;
    for (const s of shards) {
      s.a += s.spin * dt;
      s.m.quaternion.copy(s.base).multiply(new THREE.Quaternion().setFromAxisAngle(Y, s.a));
    }
    poseRig(rig, dt, t, 'idle', 0);
    standRig(rig, 0);
    if (P.orbit) P.angle += C.GLASS_ORBIT * dt;
    const fig = P.view === 'figure';
    const dist = P.dist ?? (fig ? 9.5 : 150), h = P.height ?? (fig ? 2.6 : 42);
    _look.copy(fig ? FIG : crown.position);
    if (fig) _look.y += 1.5;
    camera.position.set(_look.x + Math.cos(P.angle) * dist, _look.y + h - (fig ? 1.5 : 0), _look.z + Math.sin(P.angle) * dist);
    camera.lookAt(_look);
    // the size of whatever is being drawn into
    const target = renderer.getRenderTarget();
    if (target) _size.set(target.width, target.height);
    else renderer.getDrawingBufferSize(_size);
    res.value.copy(_size);
    camera.aspect = _size.x / _size.y;
    camera.updateProjectionMatrix();
    if (rt) {
      // what is behind the glass, drawn without it, for the glass to bend
      const w = Math.max(4, Math.round(_size.x * T.rt)), hh = Math.max(4, Math.round(_size.y * T.rt));
      if (rt.width !== w || rt.height !== hh) rt.setSize(w, hh);
      glass.visible = figGlass.visible = false;
      renderer.setRenderTarget(rt);
      renderer.clear();
      render(scene, camera);
      renderer.setRenderTarget(target);
      glass.visible = figGlass.visible = true;
    }
    render(scene, camera);
  }

  return {
    frame,
    enter(d) {
      d.renderer.toneMappingExposure = C.GLASS_EXPOSURE;
      d.bloom.threshold = C.GLASS_BLOOM_T;
      d.bloom.strength = C.GLASS_BLOOM_S;
    },
    leave() {},
    // o: { view: 'crown' | 'figure', orbit: bool, angle, dist, height, spin, refract, disperse, absorb, mind, mindSpeed, rim, beam }
    set(o) {
      if (o.view === 'crown' || o.view === 'figure') P.view = o.view;
      if (typeof o.orbit === 'boolean') P.orbit = o.orbit;
      for (const k of ['angle', 'spin']) if (Number.isFinite(o[k])) P[k] = o[k];
      for (const k of ['dist', 'height']) if (o[k] === null || Number.isFinite(o[k])) P[k] = o[k];
      const U = { refract: 'uRefract', disperse: 'uDisperse', absorb: 'uAbsorb', mind: 'uMind', mindSpeed: 'uMindSpeed', rim: 'uRim' };
      for (const k of Object.keys(U)) if (Number.isFinite(o[k])) shared[U[k]].value = o[k];
      if (Number.isFinite(o.beam)) beamK.value = o.beam;
      return true;
    },
    state: () => ({
      tier: env.tier, view: P.view, orbit: P.orbit, angle: +P.angle.toFixed(3), shards: shards.length, scene: !!T.scene, steps: T.steps, disperse: !!T.disperse,
      target: rt ? [rt.width, rt.height] : null, frames, fps: +fps.toFixed(1), figure: FIG.toArray(),
      uniforms: { refract: shared.uRefract.value, disperse: shared.uDisperse.value, absorb: shared.uAbsorb.value, mind: shared.uMind.value, rim: shared.uRim.value, beam: beamK.value },
    }),
  };
}
