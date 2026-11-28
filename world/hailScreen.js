// The big screen on the light ship's bridge (world/basebridge.js): whoever is
// hailing the ship, on a wall of light over the helm.
//
//   const scr = createHailScreen();      scr.mesh goes in the bridge's group
//   scr.show(face)                       power on, with what world/hail-dialogue.js says to show
//   scr.hide()                           power off
//   scr.voice(on)                        someone is speaking (the level bar moves)
//   scr.tick(dt, t)                      every frame the bridge is walked
//   scr.preRender(renderer)              before the composer: the face into its texture
//   scr.on()                             0..1, how far powered on it is
//
// A face of kind 'rig' is a figure built as its own people build theirs
// (world/aliens.js buildRig with that place's seed), stood in a small scene
// of its own and drawn into a render target, only while the screen is on.
// The other kinds are drawn by the screen's shader: a signal heard ('wave'),
// a turning mark ('glyph'), a distress pulse ('beacon').

import * as THREE from 'three';
import { buildRig, poseRig } from './aliens.js';
import { measureRig, standRig } from './rigGround.js';

export const SCREEN_W = 6.4, SCREEN_H = 3.6;
const KIND = { rig: 0, wave: 1, glyph: 2, beacon: 3 };

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FRAG = /* glsl */ `
  uniform sampler2D uTex;
  uniform float uOn;
  uniform float uKind;
  uniform float uTime;
  uniform float uVoice;
  uniform vec3 uCol;
  varying vec2 vUv;
  float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }
  void main() {
    vec2 uv = vUv;
    // power on: a bright line across the middle that opens to the full height
    float open = smoothstep(0.0, 0.35, uOn);
    float tall = smoothstep(0.25, 1.0, uOn);
    float band = abs(uv.y - 0.5) * 2.0;
    if (band > max(tall, 0.012)) discard;
    vec3 col;
    if (uKind < 0.5) {
      // the face: a little roll and jitter, the way a signal across a system arrives
      vec2 t = uv;
      t.x += (h11(floor(uv.y * 90.0) + floor(uTime * 12.0)) - 0.5) * 0.004;
      col = texture2D(uTex, t).rgb;
      col = mix(col, col * uCol * 1.4, 0.25);
    } else if (uKind < 1.5) {
      // a signal: three traces, rising and stopping, answered
      col = uCol * 0.08;
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float y0 = 0.3 + fi * 0.2;
        float gate = step(0.35, fract(uTime * 0.23 + fi * 0.37));
        float w = sin(uv.x * (30.0 + fi * 14.0) - uTime * (2.0 + fi)) * 0.05 * gate * (0.4 + 0.6 * sin(uv.x * 3.1 + uTime + fi));
        float d = abs(uv.y - y0 - w);
        col += uCol * (smoothstep(0.012, 0.0, d) * 1.6 + 0.25 * exp(-d * 40.0)) * (0.5 + 0.5 * gate);
      }
    } else if (uKind < 2.5) {
      // a mark: rings and spokes turning, as a machine signs a message
      vec2 p = (uv - 0.5) * vec2(${(SCREEN_W / SCREEN_H).toFixed(3)}, 1.0);
      float r = length(p), a = atan(p.y, p.x);
      float ring = smoothstep(0.012, 0.0, abs(r - 0.32)) + smoothstep(0.01, 0.0, abs(r - 0.2));
      float spokes = smoothstep(0.08, 0.0, abs(sin(a * 6.0 + uTime * 0.6))) * step(0.2, r) * step(r, 0.32);
      float inner = smoothstep(0.02, 0.0, abs(r - 0.1 - 0.02 * sin(uTime * 2.0)));
      col = uCol * (0.06 + ring * 1.4 + spokes * 0.9 + inner * 1.2);
    } else {
      // a distress pulse: rings out from the middle, once a second
      vec2 p = (uv - 0.5) * vec2(${(SCREEN_W / SCREEN_H).toFixed(3)}, 1.0);
      float r = length(p);
      float ph = fract(uTime * 0.9);
      float ring = smoothstep(0.02, 0.0, abs(r - ph * 0.6)) * (1.0 - ph);
      float dot1 = smoothstep(0.06, 0.04, r) * (0.6 + 0.4 * step(0.5, fract(uTime * 0.9)));
      col = uCol * (0.05 + ring * 1.6 + dot1 * 1.5);
    }
    // the voice: a level bar along the bottom while someone speaks
    float lv = uVoice * (0.35 + 0.65 * abs(sin(uTime * 9.0 + floor(uv.x * 40.0) * 1.7)));
    float bar = step(uv.y, 0.06) * step(abs(uv.x - 0.5) * 2.0, lv) * step(0.3, fract(uv.x * 40.0));
    col += uCol * bar * 1.2;
    // scanlines, a frame, and the bright line of switching on
    col *= 0.86 + 0.14 * sin(uv.y * 600.0);
    float edge = step(0.985, max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 2.0);
    col += uCol * edge * 1.5;
    col += vec3(0.9, 1.0, 1.0) * (1.0 - tall) * smoothstep(0.03, 0.0, band) * open * 2.0;
    gl_FragColor = vec4(col * open, 1.0);
  }
`;

export function createHailScreen() {
  const rt = new THREE.WebGLRenderTarget(512, 288, { depthBuffer: true });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const u = {
    uTex: { value: rt.texture }, uOn: { value: 0 }, uKind: { value: 0 }, uTime: { value: 0 },
    uVoice: { value: 0 }, uCol: { value: new THREE.Color(1, 1, 1) },
  };
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN_W, SCREEN_H),
    new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, fog: false, side: THREE.DoubleSide }),
  );
  mesh.visible = false;
  mesh.frustumCulled = false;

  // --- the face's own small studio ---
  const studio = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(26, SCREEN_W / SCREEN_H, 0.05, 40);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(0.8, 1.2, 1.4);
  const rim = new THREE.DirectionalLight(0xffffff, 1.4);
  rim.position.set(-1.2, 0.8, -1.0);
  studio.add(key, rim, new THREE.AmbientLight(0xffffff, 0.55));
  let rig = null, rigKey = '';
  const _head = new THREE.Vector3();

  let want = 0, on = 0, talking = false;
  function setFace(face) {
    u.uKind.value = KIND[face.kind] ?? 1;
    u.uCol.value.set(face.col ?? 0x9fe8ff);
    if (face.kind !== 'rig') return;
    const k = `${face.seed}:${face.city}`;
    if (k === rigKey) return;
    if (rig) studio.remove(rig.group);
    rig = null;
    rigKey = k;
    try {
      rig = measureRig(buildRig(face.seed, face.city));
      studio.add(rig.group);
      standRig(rig, 0);
      rig.group.updateMatrixWorld(true);
    } catch (err) {
      console.warn('[hailScreen] the caller could not be built; the screen shows their signal', err);
      u.uKind.value = KIND.wave;
    }
    const bg = new THREE.Color(face.col ?? 0x9fe8ff).multiplyScalar(0.12);
    studio.background = bg;
    rim.color.set(face.col ?? 0x9fe8ff);
  }

  return {
    mesh,
    show(face) {
      setFace(face || { kind: 'wave' });
      want = 1;
      mesh.visible = true;
    },
    hide() {
      want = 0;
      talking = false;
    },
    voice(v) {
      talking = !!v;
    },
    on: () => on,
    showing: () => want > 0,
    tick(dt, t) {
      const d = Math.min(dt, 0.1);
      on += Math.sign(want - on) * Math.min(Math.abs(want - on), d / (want > on ? 1.1 : 0.5));
      mesh.visible = on > 0.001;
      u.uOn.value = on;
      u.uTime.value = t;
      u.uVoice.value += ((talking ? 1 : 0) - u.uVoice.value) * Math.min(1, d * 6);
      if (rig && u.uKind.value === 0 && mesh.visible) {
        poseRig(rig, d, t, talking ? 'talk' : 'idle', 0);
        standRig(rig, 0);
      }
    },
    preRender(renderer) {
      if (!mesh.visible || !rig || u.uKind.value !== 0) return;
      rig.group.updateMatrixWorld(true);
      // head and shoulders (the head's joint is at the neck; the face is above it, toward +z)
      rig.joints.head.getWorldPosition(_head);
      cam.position.set(_head.x + 0.15, _head.y + 0.2, _head.z + 1.95);
      cam.lookAt(_head.x, _head.y + 0.02, _head.z);
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(studio, cam);
      renderer.setRenderTarget(prev);
    },
  };
}
