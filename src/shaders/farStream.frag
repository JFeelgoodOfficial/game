// What rises to the black hole (world/farhole.js), on ribbons, additive.
// vUv.x across (0..1), vUv.y along (0 at the world, 1 at the hole).
//
//   uKind 0   a tether: the time the megaworld draws out of the hole. A
//             streak of fire: a hot core, torn edges, and light running
//             down it, orange from the disc it is drawn from.
//   uKind 1   a wisp: gas pulled off the disc, faint as embers, drifting.

varying vec2 vUv;
varying float vSeed;
varying float vAng; // angle from the hole's centre, rad

uniform float uShadow; // the shadow's angular radius: nothing is drawn across it
uniform float uTime;
uniform float uHdr;
uniform float uFade;
uniform float uKind;

float hash(float n) {
  return fract(sin(n) * 43758.5453);
}
float noise(float x) {
  float i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), f);
}
float hash2(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise2(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  float u = vUv.x * 2.0 - 1.0;
  float v = vUv.y;
  float ends = smoothstep(0.0, 0.08, v) * (1.0 - smoothstep(0.92, 1.0, v));
  vec3 col;
  if (uKind < 0.5) {
    // a core that wanders a little, and two fainter strands either side of it
    float off = (noise(v * 5.0 + vSeed * 17.0 - uTime * 0.05) - 0.5) * 0.5;
    float core = exp(-pow((u - off) * 3.4, 2.0));
    float side = 0.0;
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      float o2 = off + (fi * 2.0 - 1.0) * (0.42 + 0.22 * noise(v * 7.0 + fi * 9.0 + vSeed * 30.0));
      side += exp(-pow((u - o2) * 8.0, 2.0)) * (0.5 + 0.5 * noise(v * 9.0 + fi * 5.0 - uTime * 0.4));
    }
    // torn, like flame: brighter and darker along its length, sliding down
    float tear = 0.55 + 0.45 * noise2(vec2(v * 22.0 + uTime * 0.7 + vSeed * 40.0, u * 2.5));
    float pulse = pow(noise(v * 6.0 + uTime * 0.6 + vSeed * 50.0), 3.0);
    float heat = core * tear * (0.75 + 0.6 * pulse);
    vec3 orange = vec3(1.0, 0.44, 0.08), gold = vec3(1.0, 0.82, 0.50), ember = vec3(0.70, 0.16, 0.03);
    // hottest up the middle and nearest the hole
    vec3 tint = mix(orange, gold, smoothstep(0.55, 1.0, heat) * (0.35 + 0.65 * v));
    col = (tint * heat + ember * side * 0.55 + ember * exp(-u * u * 2.5) * 0.12) * uHdr;
  } else {
    // embers: soft across, torn along, never quite still
    float t = uTime * 0.02;
    float n = noise2(vec2(v * 7.0 - t, u * 1.6 + vSeed * 9.0)) * 0.6 + noise2(vec2(v * 19.0 + t * 1.7, u * 3.5 + vSeed * 4.0)) * 0.4;
    float strand = noise2(vec2(v * 3.0 + vSeed * 20.0, u * 7.0));
    float body = pow(max(1.0 - u * u, 0.0), 1.6);
    float a = body * smoothstep(0.36, 0.85, n) * (0.5 + 0.9 * strand);
    vec3 tint = mix(vec3(0.55, 0.14, 0.03), vec3(1.0, 0.48, 0.14), n) * (0.6 + 0.4 * v);
    col = tint * a * 0.2 * uHdr;
  }
  // nothing is drawn across the shadow: it is taken in at the disc
  col *= ends * smoothstep(uShadow * 1.02, uShadow * 1.9, vAng);
  gl_FragColor = vec4(col * uFade, 1.0);
}
