// The world-gate's shimmer film: a rippling energy membrane spanning the
// arch. Additive and collider-free — the player walks straight through it.
uniform float uTime;
uniform float uNight;
uniform vec3 uColor;

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
  vec2 c = vUv - 0.5;
  float edge = 1.0 - smoothstep(0.3, 0.5, length(c * vec2(1.0, 1.15)));
  float n = vnoise(vUv * 7.0 + vec2(0.0, uTime * 0.35));
  float ripple = 0.5 + 0.5 * sin((vUv.y + n * 0.25) * 22.0 - uTime * 1.2);
  float a = edge * (0.1 + 0.16 * ripple) * mix(0.35, 1.0, uNight);
  gl_FragColor = vec4(uColor * a, a);
}
