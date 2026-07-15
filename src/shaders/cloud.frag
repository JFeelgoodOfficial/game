// Cloud layer (Phase 3/4 polish). A thin shell just above the surface: fbm
// noise thresholded into puffs, drifting slowly over time, lit by the same
// sun as the ground so clouds fall dark across the night side. Transparent,
// so the surface shows through the gaps.

varying vec3 vObjPos;
varying vec3 vWorldNormal;

uniform vec3 uSun;
uniform float uTime;
uniform float uCover; // 0 clear .. 1 overcast

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
        mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
        mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.05; a *= 0.5; }
  return v;
}

void main() {
  vec3 p = normalize(vObjPos);
  // slow drift + a second slower layer for churn
  float d = fbm(p * 2.4 + vec3(uTime * 0.006, 0.0, uTime * 0.004));
  d = d * 0.7 + fbm(p * 5.0 - vec3(0.0, uTime * 0.008, 0.0)) * 0.3;

  float lo = mix(0.62, 0.4, uCover);
  float cover = smoothstep(lo, lo + 0.16, d);
  if (cover < 0.01) discard;

  float ndl = dot(normalize(vWorldNormal), normalize(uSun));
  float day = smoothstep(-0.1, 0.32, ndl);
  // brighter sunlit tops, cooler shadowed base
  vec3 col = mix(vec3(0.55, 0.6, 0.72), vec3(1.0), day);

  gl_FragColor = vec4(col, cover * (0.15 + 0.85 * day));
}
