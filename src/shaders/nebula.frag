// Nebula (GDD 4.2). Layered value noise over the view direction — the sphere
// follows the camera, so shading by direction keeps the sky static. Dark,
// desaturated, one accent color. It should be barely there: the failure mode
// is a screensaver.

varying vec3 vPos;

uniform vec3 uAccent;
uniform float uIntensity;

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
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vPos);
  float n = fbm(dir * 3.0);
  float m = fbm(dir * 5.0 + 7.31);

  // broad dark base, faintly shaped by the noise
  vec3 col = vec3(0.045, 0.05, 0.075) * (0.35 + 0.65 * n);
  // accent only where both fields align — sparse, restrained
  float d = smoothstep(0.5, 0.9, n) * smoothstep(0.45, 0.85, m);
  col += uAccent * d * 0.30;

  gl_FragColor = vec4(col * uIntensity, 1.0);
}
