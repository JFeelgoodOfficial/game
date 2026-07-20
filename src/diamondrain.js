// Diamond rain (neptunia — cfg.diamondRain). One THREE.Points draw of
// glittering rhombus sprites falling through a walker-local cylinder, GPU
// advected (stations.js debris discipline: one uniform write per frame, zero
// CPU particle work, zero per-frame allocation). Storms roll in and out on a
// slow noise schedule — sometimes the sky just glitters, sometimes it pours.
//
// The group is scene-level and repositioned to the walker every render frame
// with +Y on the local up, so "down" is constant inside the volume, the
// modulo wrap is invisible, and floating-origin rebases can't smear it.

import * as THREE from 'three';
import { fbm2, smoothstep } from './noise2.js';

const COUNT = 1600;
const RADIUS = 55; // cylinder radius around the walker
const HEIGHT = 90; // fall column height
const DROP = 12; // portion of the column below the walker's feet (slopes)

export function createDiamondRain() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  const phase = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * RADIUS;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * HEIGHT;
    pos[i * 3 + 2] = Math.sin(a) * r;
    seed[i] = Math.random();
    phase[i] = Math.random() * Math.PI * 2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, HEIGHT / 2 - DROP, 0),
    Math.hypot(RADIUS, HEIGHT / 2) + 2
  );

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      attribute float aSeed;
      attribute float aPhase;
      varying float vTwinkle;
      varying float vFade;
      void main() {
        vec3 p = position;
        // fall + wrap; each diamond has its own phase down the column
        p.y = mod(p.y - uTime * (16.0 + aSeed * 10.0), ${HEIGHT.toFixed(1)}) - ${DROP.toFixed(1)};
        // slight shimmer sway on the way down
        p.x += sin(uTime * 0.9 + aPhase) * 1.1;
        p.z += cos(uTime * 0.7 + aPhase * 1.7) * 1.1;
        // fade at the column's top and bottom so the wrap never pops
        float y01 = (p.y + ${DROP.toFixed(1)}) / ${HEIGHT.toFixed(1)};
        vFade = smoothstep(0.0, 0.08, y01) * (1.0 - smoothstep(0.9, 1.0, y01));
        // hard glints: most frames a dim speck, sometimes a flash
        vTwinkle = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (3.0 + aSeed * 5.0) + aPhase), 6.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp((170.0 + aSeed * 120.0) / -mv.z, 0.0, 7.0) * uIntensity;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      varying float vTwinkle;
      varying float vFade;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        // diamond: a hard rhombus, brightest at the very center
        float m = abs(d.x) + abs(d.y);
        if (m > 0.5) discard;
        float core = 1.0 - m * 2.0;
        vec3 col = mix(vec3(0.75, 0.9, 1.0), vec3(1.0), core * core);
        gl_FragColor = vec4(col, vFade * vTwinkle * uIntensity * 0.9);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = true;
  points.renderOrder = 2;

  const group = new THREE.Group();
  group.name = 'diamond-rain';
  group.add(points);

  const _q = new THREE.Quaternion();
  const _yAxis = new THREE.Vector3(0, 1, 0);

  return {
    group,
    // t: wall-clock seconds; pos: walker world position; up: local up.
    // ~35% storm duty cycle, ~30 s roll-in/out, from slow 2D noise.
    update(t, pos, up) {
      group.position.copy(pos);
      _q.setFromUnitVectors(_yAxis, up);
      group.quaternion.copy(_q);
      mat.uniforms.uTime.value = t;
      const storm = 0.5 + 0.5 * fbm2(t * 0.015, 7.31, 2);
      mat.uniforms.uIntensity.value = smoothstep(0.52, 0.68, storm);
    },
    // True while diamonds are visibly falling (for verification/curiosity).
    intensity() {
      return mat.uniforms.uIntensity.value;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      group.parent?.remove(group);
    },
  };
}
