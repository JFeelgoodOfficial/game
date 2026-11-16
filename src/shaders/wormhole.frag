// Tenretni's wormhole (src/tenretni.js). A camera-facing disc, additive. Log-
// spiral arms wound tighter toward the middle and turning faster there (the
// accretion disc's differential rotation, borrowed), a throat of receding
// rings, and a white core. Values above 1 feed the bloom pass.

varying vec2 vUv;

uniform float uTime;
uniform float uPower; // 0..1 overall brightness (0 while closed)
uniform float uHdr;

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
  vec2 q = vUv * 2.0 - 1.0;
  float r = length(q);
  if (r > 1.0 || uPower <= 0.0) discard;
  float a = atan(q.y, q.x);

  // spiral coordinate: angle sheared by log radius, spun faster near the core
  float spin = uTime * 0.22 / (0.18 + r);
  float s = a + 3.6 * log(r + 0.03) + spin;

  // arms: two noise octaves sampled along the spiral, periodic in angle
  vec2 sc = vec2(cos(s), sin(s));
  float n1 = vnoise(sc * 2.3 + vec2(r * 6.0 - uTime * 0.15, 0.0));
  float n2 = vnoise(sc * 6.1 + vec2(r * 19.0 - uTime * 0.4, 3.1));
  float arms = pow(0.5 + 0.5 * sin(s * 3.0 + n1 * 3.0), 2.2);
  float fil = smoothstep(0.42, 0.95, n2 * (0.55 + 0.6 * arms));

  // throat: rings sliding inward
  float rings = 0.5 + 0.5 * sin(34.0 * pow(r, 0.55) + uTime * 1.7);
  rings = pow(rings, 6.0) * smoothstep(0.75, 0.1, r);

  // colour by radius: white core, gold, blue, violet rim
  vec3 col = mix(vec3(1.0, 0.72, 0.36), vec3(0.22, 0.5, 1.0), smoothstep(0.08, 0.5, r));
  col = mix(col, vec3(0.62, 0.3, 0.95), smoothstep(0.5, 0.95, r));
  col = mix(col, vec3(1.0, 0.8, 0.5), 0.5 * n1 * smoothstep(0.7, 0.2, r));

  float body = (0.18 + 0.9 * arms) * (0.35 + 1.4 * fil) + 0.22 * rings;
  float rim = smoothstep(1.0, 0.8, r) * (0.75 + 0.6 * r);
  float core = exp(-r * r * 38.0) * 3.2 + exp(-r * 7.0) * 0.5;

  vec3 lit = col * body * rim + vec3(1.0, 0.95, 0.88) * core;
  gl_FragColor = vec4(lit * uPower * uHdr * 0.55, 1.0);
}
