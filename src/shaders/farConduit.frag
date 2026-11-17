// A time conduit (world/farhole.js): glass with something running in it.
// Additive, both faces drawn: clear through the middle, bright and coloured
// at its edges like a film of oil, with grains of gold light falling down the
// inside toward the collector.

varying vec3 vN;
varying vec3 vView;
varying vec2 vAt;
varying float vSeed;

uniform float uTime;
uniform float uFade;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  float t = vAt.x, th = vAt.y;
  vec3 N = normalize(vN), V = normalize(vView);
  float facing = abs(dot(N, V));
  float fres = pow(1.0 - facing, 2.0);

  // the film: its colour turns with the angle it is seen at, and drifts
  float flow = vnoise(vec2(t * 26.0 + uTime * 0.05 + vSeed * 9.0, th * 1.3)) * 0.6
             + vnoise(vec2(t * 70.0 - uTime * 0.08, th * 2.6 + vSeed * 4.0)) * 0.4;
  float film = facing * 1.4 + flow * 0.9 + vSeed;
  vec3 irid = 0.5 + 0.5 * cos(6.2832 * (film + vec3(0.0, 0.33, 0.67)));
  // mostly the blue-violet of cold glass, with the rainbow coming through
  vec3 glass = mix(vec3(0.42, 0.50, 1.0), irid, 0.55);
  vec3 col = glass * (0.010 + 0.30 * fres) * (0.6 + 0.6 * flow);
  // a hard highlight right on the silhouette
  col += vec3(0.85, 0.90, 1.0) * pow(1.0 - facing, 7.0) * 0.26;

  // what it carries: grains of gold light, falling
  float lanes = vnoise(vec2(th * 7.0 + vSeed * 30.0, t * 5.0));
  float grain = vnoise(vec2(th * 26.0 + vSeed * 11.0, t * 900.0 + uTime * 2.2));
  float fine = vnoise(vec2(th * 60.0, t * 2600.0 + uTime * 3.4));
  float gold = pow(grain, 5.0) * smoothstep(0.35, 0.8, lanes) * 2.2 + pow(fine, 9.0) * 1.2;
  col += vec3(1.0, 0.74, 0.34) * gold * (0.2 + 0.6 * facing) * 0.5;

  // where it pours into the collector, it is all light
  col += vec3(1.0, 0.80, 0.50) * exp(-t * 700.0) * 1.6;

  // out of the disc it comes from nothing: a dozen of these cross the same
  // patch of sky up there, and adding them all would white the hole out
  col *= 1.0 - smoothstep(0.30, 0.78, t);
  gl_FragColor = vec4(col * uFade, 1.0);
}
