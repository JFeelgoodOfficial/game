// The tunnel's glass shell (src/tenretni.js). A unit open cylinder stretched
// from the sphere (uv.y = 0) to terra (uv.y = 1). Pale glass that brightens
// at grazing angles; when uFlow is up, terra's sea runs through it toward the
// sphere in long streaks.

varying vec3 vObj;
varying vec3 vWorldNormal;
varying vec3 vView;
varying vec2 vUv;

uniform float uTime;
uniform float uLen; // world length, for streak scale
uniform float uFlow; // 0..1 water in the pipe
uniform float uAlpha;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec3 N = normalize(vWorldNormal), V = normalize(vView);
  float fres = pow(1.0 - abs(dot(N, V)), 2.0);
  vec3 glass = vec3(0.55, 0.75, 0.9) * (0.08 + 0.5 * fres);
  float a = 0.1 + 0.4 * fres;

  // water: streaks along the pipe, moving to uv.y = 0
  float along = vUv.y * uLen / 90.0 + uTime * 3.2;
  float ang = vUv.x * 14.0;
  float w = vnoise(vec2(ang, along)) * 0.6 + vnoise(vec2(ang * 2.3 + 4.0, along * 2.7)) * 0.4;
  float foam = smoothstep(0.62, 0.9, w);
  vec3 water = mix(vec3(0.05, 0.3, 0.6), vec3(0.3, 0.7, 0.95), w) + vec3(0.9, 0.97, 1.0) * foam;
  vec3 col = mix(glass, water, uFlow * 0.9);
  a = mix(a, 0.8, uFlow);

  gl_FragColor = vec4(col, a * uAlpha);
}
