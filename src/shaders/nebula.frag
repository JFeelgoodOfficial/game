// Nebula (GDD 4.2). Layered value noise over the view direction — the sphere
// follows the camera, so shading by direction keeps the sky static. Dark and
// desaturated in the gaps with the magenta accent gathering into distinct
// cloud masses, so it reads as a nebula in part of the sky rather than a
// uniform wash. Still restrained: the failure mode is a screensaver.

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
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vPos);

  // Large-scale mask decides WHERE the nebula lives; detail shapes it.
  float mask = fbm(dir * 1.6 + 2.0);
  float detail = fbm(dir * 4.5 + 9.3);
  float density = smoothstep(0.42, 0.86, mask * 0.68 + detail * 0.32);

  // Deep violet body brightening to the accent in the dense cores.
  vec3 body = mix(vec3(0.10, 0.02, 0.16), uAccent, density);
  body += uAccent * pow(density, 2.2) * 0.7;              // hot cores
  // a cooler secondary tint at the fringes for depth
  body += vec3(0.08, 0.10, 0.22) * smoothstep(0.25, 0.5, density) * (1.0 - density);

  // Near-black interstellar base, nebula painted over it by density.
  vec3 col = vec3(0.015, 0.018, 0.03);
  col = mix(col, body, density);

  gl_FragColor = vec4(col * uIntensity, 1.0);
}
