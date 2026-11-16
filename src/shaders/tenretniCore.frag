// The worldship's power source (src/tenretni.js): what was terra's magma core,
// seen through the bore. Slow convection cells, bright cracks between them,
// values well above 1 for the bloom pass.

varying vec3 vObj;
varying vec3 vWorldNormal;
varying vec3 vView;

uniform float uTime;
uniform float uHeat; // 0..1 (rises as the bore opens, again under way)

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
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.07; a *= 0.5; }
  return v;
}

void main() {
  vec3 p = normalize(vObj);
  float t = uTime * 0.06;
  vec3 w = vec3(fbm(p * 2.0 + t), fbm(p * 2.0 + 5.2 - t), fbm(p * 2.0 + 9.1 + t * 0.7));
  float n = fbm(p * 3.2 + w * 1.6);
  float cracks = 1.0 - abs(2.0 * fbm(p * 5.5 + w * 1.1 - t) - 1.0);
  cracks = pow(cracks, 5.0);
  vec3 dark = vec3(0.35, 0.04, 0.0);
  vec3 hot = vec3(1.0, 0.42, 0.06);
  vec3 col = mix(dark, hot, smoothstep(0.3, 0.75, n)) + vec3(1.0, 0.85, 0.45) * cracks * 1.4;
  float limb = 1.0 - max(dot(normalize(vWorldNormal), normalize(vView)), 0.0);
  col += vec3(1.0, 0.35, 0.05) * limb * limb * 0.4;
  gl_FragColor = vec4(col * (0.3 + 0.55 * uHeat), 1.0);
}
