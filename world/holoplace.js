// A place, painted on the inside of a dome (GDD 5.7.4).
//
// The archive's worlds are not built anywhere: where one has to be stood in or
// flown through, a dome closes round the viewer and the world is painted on
// the inside of it from that world's fragments (world/chapter-dialogue.js):
// its sky and cloud, its ground going by underneath, what was built on it as
// lights and as a skyline. One draw, no textures.
//
//   const place = createPlace(radius);
//   place.paint(world.layers, seed)   which world
//   place.uniforms.uSpeed             how fast the ground goes by (1 = in flight)
//   place.uniforms.uAlpha             0..1, for fading it in round a room
//   place.uniforms.uFade              brightness
//   place.uniforms.uTime              the clock

import * as THREE from 'three';

const PLACE_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const PLACE_FRAG = /* glsl */ `
  uniform vec3 uA, uB, uSea, uLand, uHigh, uStruct, uLightC;
  uniform float uTime, uBands, uScale, uLevel, uSeed, uFade, uAlpha, uSpeed;
  varying vec3 vDir;
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.03 + 17.3; a *= 0.5; }
    return s;
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 L = normalize(vec3(0.75, 0.3, 0.55));
    // the sky, its cloud drawn out along the way the ship is going
    vec3 sky = mix(uB, uA, smoothstep(-0.02, 0.55, h));
    vec2 q = d.xz / (abs(h) + 0.3);
    float cl = fbm(q * vec2(1.6, 1.6 / (1.0 + uBands * 3.0)) + vec2(uSeed, uTime * 0.35 * uSpeed));
    sky = mix(sky, uB * 1.2 + 0.08, smoothstep(0.45, 0.8, cl) * smoothstep(0.0, 0.3, h) * 0.75);
    float s = max(dot(d, L), 0.0);
    sky += uLightC * (pow(s, 500.0) * 4.0 + pow(s, 14.0) * 0.4);
    // the ground, going by underneath
    vec2 p = d.xz / max(-h, 0.015) + vec2(uSeed * 3.0, uTime * 2.2 * uSpeed);
    float n = fbm(p * uScale * 0.3);
    float land = smoothstep(uLevel - 0.02, uLevel + 0.02, n);
    vec3 g = mix(uSea * (0.5 + 0.9 * n), mix(uLand, uHigh, smoothstep(uLevel, uLevel + 0.3, n)), land);
    g *= 0.55 + 0.6 * max(L.y + 0.4 * n, 0.0);
    // what was built on it, as lights
    vec2 c = floor(p * 5.0), f = fract(p * 5.0) - 0.5;
    g += uStruct * step(h2(c), 0.3) * land * smoothstep(0.3, 0.0, length(f)) * 1.8;
    vec3 col = h > 0.0 ? sky : mix(uB, g, smoothstep(0.0, 0.2, -h));
    // a skyline of it along the horizon
    float az = atan(d.x, d.z) * 38.0;
    float id = floor(az);
    float tall = h2(vec2(id, uSeed)) * h2(vec2(id * 0.37, 4.0)) * 0.16;
    float tower = step(0.0, h) * step(h, tall) * step(0.12, fract(az)) ;
    float win = step(0.6, h2(floor(vec2(az * 4.0, h * 260.0))));
    col = mix(col, uStruct * (0.12 + 0.9 * win) + uA * 0.1, tower * 0.9);
    gl_FragColor = vec4(col * uFade, uAlpha);
  }
`;

export function createPlace(radius) {
  const uniforms = {
    uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() },
    uSea: { value: new THREE.Color() }, uLand: { value: new THREE.Color() }, uHigh: { value: new THREE.Color() },
    uStruct: { value: new THREE.Color() }, uLightC: { value: new THREE.Color() },
    uTime: { value: 0 }, uBands: { value: 0 }, uScale: { value: 2 }, uLevel: { value: 0.5 }, uSeed: { value: 0 },
    uFade: { value: 1 }, uAlpha: { value: 1 }, uSpeed: { value: 1 },
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 32),
    new THREE.ShaderMaterial({ vertexShader: PLACE_VERT, fragmentShader: PLACE_FRAG, uniforms, side: THREE.BackSide, fog: false })
  );
  mesh.visible = false;
  mesh.frustumCulled = false;
  return {
    mesh,
    uniforms,
    paint(L, seed) {
      uniforms.uA.value.set(L.sky.a);
      uniforms.uB.value.set(L.sky.b);
      uniforms.uBands.value = L.sky.bands;
      uniforms.uSea.value.set(L.ground.sea);
      uniforms.uLand.value.set(L.ground.land);
      uniforms.uHigh.value.set(L.ground.high);
      uniforms.uScale.value = L.ground.scale;
      uniforms.uLevel.value = L.ground.level;
      uniforms.uStruct.value.set(L.structures.col);
      uniforms.uLightC.value.set(L.light.col);
      uniforms.uSeed.value = seed;
    },
  };
}
