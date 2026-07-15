// Planet surface vertex shader — Phase 5 slice: real vertex displacement
// from the SAME warped-fbm + ridged-mountain field the fragment shader
// colours with (and terrain.js mirrors for the altitude floor), so the
// relief you skim over is the relief you saw from orbit. Land rises above
// sea level; the ocean floor stays on the base sphere (the water sphere
// covers it).

varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

uniform float uSeaLevel;
uniform float uAmp; // terrain height, world units. 0 for gas giants.

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
float fbm(vec3 p, int oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 7; i++) {
    if (i >= oct) break;
    v += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}
// Ridged multifractal: sharp crests where plain fbm is rounded.
float ridged(vec3 p, int oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= oct) break;
    v += a * (1.0 - abs(2.0 * vnoise(p) - 1.0));
    p *= 2.11;
    a *= 0.5;
  }
  return v;
}
float elevation(vec3 p, int oct) {
  vec3 warp = vec3(fbm(p * 1.3 + 4.1, 3), fbm(p * 1.3 + 8.7, 3), fbm(p * 1.3 + 1.9, 3));
  float base = fbm(p * 1.8 + warp * 0.6, oct);
  // ridged mountains grow only out of already-high ground
  float mask = smoothstep(0.5, 0.62, base);
  return base * 0.72 + ridged(p * 3.5, 4) * 0.28 * mask;
}

void main() {
  vec3 dir = normalize(position);
  float disp = 0.0;
  if (uAmp > 0.0) {
    disp = max(elevation(dir, 6) - uSeaLevel, 0.0) * uAmp;
  }
  vec3 displaced = position + dir * disp;
  vObjPos = displaced;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(displaced, 1.0);
  vViewDir = cameraPosition - world.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
