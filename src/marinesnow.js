// Marine snow + bubbles (divable worlds — neptunia). One THREE.Points draw of
// suspended particulate drifting down and occasional bubbles rising through a
// diver-local volume, GPU advected (the diamondrain.js discipline: one uniform
// write per frame, zero CPU particle work, zero per-frame allocation). The
// water column reads as a medium instead of empty tinted air.
//
// The group is scene-level and repositioned to the walker every render frame
// with +Y on the local up, so drift direction is constant inside the volume,
// the modulo wrap is invisible, and floating-origin rebases can't smear it.
// walk.js drives uIntensity with the dive depth — dry, the volume costs one
// discarded draw.

import * as THREE from 'three';

const COUNT = 1400;
const RADIUS = 30; // volume radius around the diver
const HEIGHT = 40; // drift column height
const DROP = 20; // half below the diver — snow falls past you both ways

export function createMarineSnow() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  const kind = new Float32Array(COUNT); // 0 = snow mote, 1 = bubble
  for (let i = 0; i < COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * RADIUS;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * HEIGHT;
    pos[i * 3 + 2] = Math.sin(a) * r;
    seed[i] = Math.random();
    kind[i] = Math.random() < 0.12 ? 1 : 0;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
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
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      attribute float aSeed;
      attribute float aKind;
      varying float vFade;
      varying float vKind;
      void main() {
        vKind = aKind;
        vec3 p = position;
        // snow sinks slowly; bubbles rise fast — each with its own phase
        float vy = mix(-(0.35 + aSeed * 0.5), 2.2 + aSeed * 1.6, aKind);
        p.y = mod(p.y + uTime * vy, ${HEIGHT.toFixed(1)}) - ${DROP.toFixed(1)};
        // lateral drift with the current; bubbles wobble on the way up
        p.x += sin(uTime * 0.22 + aSeed * 37.0) * (1.5 + aKind * 0.4);
        p.z += cos(uTime * 0.18 + aSeed * 51.0) * 1.5;
        float y01 = (p.y + ${DROP.toFixed(1)}) / ${HEIGHT.toFixed(1)};
        vFade = smoothstep(0.0, 0.1, y01) * (1.0 - smoothstep(0.9, 1.0, y01));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float size = mix(40.0 + aSeed * 40.0, 90.0 + aSeed * 60.0, aKind);
        gl_PointSize = clamp(size / -mv.z, 0.0, 6.0) * uIntensity;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      varying float vFade;
      varying float vKind;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float soft = smoothstep(0.5, 0.1, r);
        // motes: soft dim specks. bubbles: a brighter ring with a dark centre.
        float ring = smoothstep(0.18, 0.32, r) * smoothstep(0.5, 0.36, r);
        float a = mix(soft * 0.35, ring * 0.8 + soft * 0.1, vKind);
        vec3 col = mix(vec3(0.62, 0.72, 0.9), vec3(0.8, 0.95, 1.0), vKind);
        gl_FragColor = vec4(col, a * vFade * uIntensity);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = true;
  points.renderOrder = 2;

  const group = new THREE.Group();
  group.name = 'marine-snow';
  group.add(points);

  const _q = new THREE.Quaternion();
  const _yAxis = new THREE.Vector3(0, 1, 0);

  return {
    group,
    // t: wall-clock seconds; pos: walker world position; up: local up;
    // depth01: dive depth 0..1 — 0 hides the volume entirely.
    update(t, pos, up, depth01) {
      group.position.copy(pos);
      _q.setFromUnitVectors(_yAxis, up);
      group.quaternion.copy(_q);
      mat.uniforms.uTime.value = t;
      mat.uniforms.uIntensity.value = Math.min(Math.max(depth01 * 3, 0), 1);
      group.visible = depth01 > 0.001;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      group.parent?.remove(group);
    },
  };
}
