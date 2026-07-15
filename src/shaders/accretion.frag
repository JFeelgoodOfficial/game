// Accretion disk (GDD 4.5). Flat annulus, additive, procedural noise
// scrolling in differential rotation — inner edge faster (~ r^-1.5).
// Temperature gradient: white-hot inner edge through the accent color to
// deep red at the rim. HDR values at the inner edge feed the bloom pass.

varying vec3 vPos; // object space; disk lies in the xy plane

uniform float uTime;
uniform float uRh;     // horizon radius (world units)
uniform float uInner;  // inner edge, x horizon
uniform float uOuter;  // outer edge, x horizon
uniform vec3 uAccent;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
        mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
        mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p *= 2.11;
    a *= 0.5;
  }
  return v;
}

void main() {
  float r = length(vPos.xy) / uRh;          // radius in horizon units
  float t = (r - uInner) / (uOuter - uInner); // 0 inner .. 1 outer
  float ang = atan(vPos.y, vPos.x);

  // differential rotation: inner edge streams faster
  float rot = ang - uTime * 1.6 * pow(max(r, 0.5), -1.5) * 3.0;
  // sample on a cylinder so the seam at +-pi never shows
  vec3 sp = vec3(cos(rot), sin(rot), r * 0.9) * 2.6;
  float n = fbm(sp);
  n = smoothstep(0.25, 0.85, n);

  // temperature gradient: white -> accent -> deep red
  vec3 col = mix(vec3(1.9, 1.75, 1.55), uAccent * 1.5, smoothstep(0.0, 0.45, t));
  col = mix(col, vec3(0.45, 0.06, 0.05), smoothstep(0.45, 1.0, t));

  // fade both edges; density falls off outward
  float edge = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.55, t);
  float density = n * edge;

  gl_FragColor = vec4(col * density, 1.0); // additive: color is the light
}
