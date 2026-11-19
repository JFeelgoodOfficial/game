// Entry Zero, the offer (GDD 5.7.5): the Archivist has come down from the
// suite to the balcony the pilot arrives on, and beyond the rail it has hung
// the archive as it sees it: a wall of records, every one lit, and one that
// is not. Entry zero, the world the Tenretni came from.
//
// Built by world/lightcity.js the first visit after the offer can be made
// (chapter.ezOpen()). One instanced plane for the wall, one robot; the wall's
// cells are coloured in the shader from a seed each, so a frame costs one
// uniform write.

import * as THREE from 'three';
import { buildRobot, trackRobot, tint, box, cyl, mergedMesh } from './capital.js';
import { WELL } from './entryzero-dialogue.js';

const COLS = 30, ROWS = 11; // records shown (the archive holds rather more)
const CELL_W = 1.05, CELL_H = 1.05, GAP = 0.16;
const ARC_R = 46; // the wall bends round the one looking at it
const DARK = { col: 19, row: 5 }; // entry zero: off centre, at eye height from the rail

const WALL_VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aDark;
  varying vec2 vUv;
  varying float vSeed;
  varying float vDark;
  void main() {
    vUv = uv;
    vSeed = aSeed;
    vDark = aDark;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const WALL_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uShow;
  uniform float uZero; // a million years on: entry zero has been found, and its cell is lit
  varying vec2 vUv;
  varying float vSeed;
  varying float vDark;
  vec3 hue(float h) { return 0.5 + 0.5 * cos(6.2832 * (h + vec3(0.0, 0.33, 0.67))); }
  void main() {
    vec2 p = abs(vUv - 0.5) * 2.0;
    float edge = max(p.x, p.y);
    float frame = smoothstep(0.82, 0.9, edge) * (1.0 - smoothstep(0.96, 1.0, edge));
    // a lit record: a world's two colours, turning over slowly, each at its own pace
    float h = vSeed + uTime * (0.012 + 0.02 * fract(vSeed * 7.31));
    vec3 a = hue(h), b = hue(h + 0.21 + 0.3 * fract(vSeed * 3.7));
    float band = 0.5 + 0.5 * sin(vUv.y * 9.0 + vSeed * 40.0 + uTime * (0.3 + fract(vSeed * 5.1)));
    vec3 lit = mix(a, b, band) * (0.55 + 0.45 * (1.0 - edge)) * (0.85 + 0.15 * sin(uTime * 1.7 + vSeed * 90.0));
    vec3 col = lit * 1.25 + frame * vec3(1.0, 0.95, 0.8) * 0.9;
    // the one that is not: nothing in it, and a frame that has been waiting
    vec3 dark = vec3(0.004, 0.005, 0.007) + frame * vec3(0.5, 0.56, 0.62) * (0.35 + 0.25 * sin(uTime * 0.9));
    // (found: it is the one cell that does not change colour)
    vec3 found = vec3(0.9, 0.95, 1.0) * (0.8 + 0.2 * sin(uTime * 0.9)) * (0.6 + 0.4 * (1.0 - edge)) + frame * vec3(1.0, 0.95, 0.8) * 0.9;
    col = mix(col, mix(dark, found, uZero), vDark);
    float alpha = mix(0.9, 0.97, vDark) * uShow * (1.0 - smoothstep(0.985, 1.0, edge));
    gl_FragColor = vec4(col, alpha);
  }
`;

// k: { group, robotMat, glowMat, npcs, colliders, consoles, chapter, at: { x, z },
//      wall: { x, y, z }, vessel: { x, z }, board() }
// The wall faces +x (toward `at`), centred on wall.{x, y, z}. The vessel hangs
// off the opposite rail once the offer is taken; `board` is called at its console.
export function createEntryOffer(k) {
  const root = new THREE.Group();
  k.group.add(root);

  // --- the wall ---
  const n = COLS * ROWS;
  const geo = new THREE.PlaneGeometry(CELL_W, CELL_H);
  const seeds = new Float32Array(n), darks = new Float32Array(n);
  const uniforms = { uTime: { value: 0 }, uShow: { value: 0 }, uZero: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: WALL_VERT, fragmentShader: WALL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const wall = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  let seed = 0x5eed0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const step = (CELL_W + GAP) / ARC_R; // radians a column takes on the arc
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const i = c * ROWS + r;
      const a = (c - (COLS - 1) / 2) * step;
      // an arc about a point ARC_R in front of the wall (+x), opening that way
      p.set(ARC_R - Math.cos(a) * ARC_R, (r - (ROWS - 1) / 2) * (CELL_H + GAP), Math.sin(a) * ARC_R);
      q.setFromAxisAngle(up, Math.PI / 2 - a);
      wall.setMatrixAt(i, m.compose(p, q, s));
      seeds[i] = rnd();
      darks[i] = c === DARK.col && r === DARK.row ? 1 : 0;
    }
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  geo.setAttribute('aDark', new THREE.InstancedBufferAttribute(darks, 1));
  wall.position.set(k.wall.x, k.wall.y, k.wall.z);
  wall.frustumCulled = false;
  wall.renderOrder = 5;
  root.add(wall);

  // --- the one who hung it there ---
  const rig = buildRobot(k.robotMat, k.glowMat, { body: 0xf3eede, dark: 0xc7a255, glow: 0xfff0c0 });
  const A = k.at;
  const face = Math.atan2(k.wall.x - A.x, k.wall.z - A.z); // it is looking at the dark cell
  rig.group.position.set(A.x, 0, A.z);
  rig.group.rotation.y = face;
  rig.group.scale.setScalar(1.15);
  root.add(rig.group);
  const archivist = { ...rig, x: A.x, z: A.z, face, seed: 9.4, look: 0 };
  const solid = { x: A.x, z: A.z, r: 0.85, top: Infinity };
  k.colliders.push(solid);
  const npc = { x: A.x, y: 0, z: A.z, role: 'archivist', talk: () => k.chapter.archivistTalk() };
  k.npcs.push(npc);

  // --- what it gives the pilot: a vessel, moored off the other rail ---
  // (the lamp is on its nose; the well it goes down is under the balcony)
  const V = k.vessel;
  const vessel = new THREE.Group();
  const lit = [
    tint(cyl(1.5, 1.5, 5.2, 0, 0, 0, 20).rotateX(Math.PI / 2), 0xe4e0d2),
    tint(cyl(1.5, 0.7, 1.6, 0, 0, 0, 20).rotateX(Math.PI / 2).translate(0, 0, -3.4), 0xc7a255),
    tint(box(0.18, 1.5, 1.6, 0, 1.9, -2.2), 0xc7a255),
    tint(box(3.6, 0.14, 1.0, 0, 0, -2.6), 0xc7a255),
    tint(box(1.0, 0.1, 4.4, -1.9, 0.9, 0), 0xc7a255), // the plank to the rail
  ];
  vessel.add(mergedMesh(lit, k.robotMat));
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.22, depthWrite: false, fog: false }));
  nose.position.z = 2.6;
  vessel.add(nose);
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.9, 1.6), fog: false });
  const lampLight = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), lampMat);
  lampLight.position.set(1.0, -0.9, 3.0);
  vessel.add(lampLight);
  vessel.position.set(V.x, 0.9, V.z);
  vessel.rotation.y = Math.PI;
  root.add(vessel);
  k.consoles.push({
    x: V.x - 3.6, y: 0, z: V.z, r: 3.2, prompt: WELL.board,
    off: () => !k.chapter.reached('ez_offer'),
    use: () => (k.board(), null),
  });

  let show = 0;
  return {
    tick(dt, t, walker) {
      show = Math.min(1, show + dt * 0.4); // the wall comes up as the pilot comes in
      uniforms.uShow.value = show * show * (3 - 2 * show);
      uniforms.uTime.value = t;
      uniforms.uZero.value = k.chapter.reached('ez_era') ? 1 : 0;
      trackRobot(archivist, walker, dt, t);
      // the vessel is there once it has been given, and rides the air a little
      vessel.visible = k.chapter.reached('ez_offer');
      vessel.position.y = 0.9 + 0.12 * Math.sin(t * 0.8);
      lampMat.color.setHSL((t * 0.05) % 1, 1, 0.6).multiplyScalar(1.6);
    },
    reset() {
      show = 0;
    },
    state: () => ({ cells: n, show, at: [A.x, 0, A.z], dark: [DARK.col, DARK.row] }),
  };
}
