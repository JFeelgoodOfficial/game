// Energy beam (monolith anti-grav columns, titan gaze): value noise
// streaming along the beam inside an open cylinder/cone, additive, faded
// at both ends so the shell edges never read as hard geometry.
uniform float uTime;
uniform float uNight;
uniform vec3 uColor;
uniform float uFlow; // stream speed along the beam (+down the uv.y axis)

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec2 p = vec2(vUv.x * 6.0, vUv.y * 3.0 + uTime * uFlow);
  float n = vnoise(p) * 0.65 + vnoise(p * 2.7) * 0.35;
  float core = smoothstep(0.35, 0.9, n);
  float endFade = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
  float a = core * endFade * mix(0.25, 0.9, uNight);
  gl_FragColor = vec4(uColor * a, a);
}
