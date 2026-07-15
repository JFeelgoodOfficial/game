// Planetary rings. Radial bands from 1D fbm over the ring radius, translucent
// with gaps, warm-lit by the sun and darkened inside the planet's shadow
// cylinder (cheap: behind the planet relative to the sun, within one planet
// radius of the shadow axis).

varying vec3 vObjPos; // ring plane: xy, planet at origin

uniform vec3 uSunObj;   // sun direction in ring-object space
uniform float uInner;   // world units
uniform float uOuter;
uniform float uPlanetR;
uniform vec3 uColor;

float hash1(float n) { return fract(sin(n) * 43758.5453123); }
float noise1(float x) {
  float i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash1(i), hash1(i + 1.0), f);
}
float fbm1(float x) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise1(x); x *= 2.13; a *= 0.5; }
  return v;
}

void main() {
  float r = length(vObjPos.xy);
  float t = (r - uInner) / (uOuter - uInner);

  // radial band structure: density with distinct gaps
  float n = fbm1(t * 26.0 + 3.7);
  float gaps = smoothstep(0.36, 0.48, n); // carve empty lanes
  float fine = 0.75 + 0.25 * noise1(t * 140.0);
  float density = gaps * fine * smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.8, t);
  if (density < 0.01) discard;

  // planet shadow across the rings
  vec3 S = normalize(uSunObj);
  float along = dot(vObjPos, S);
  float axisDist = length(vObjPos - S * along);
  float shadow = (along < 0.0 && axisDist < uPlanetR) ? 0.22 : 1.0;

  vec3 col = uColor * (0.35 + 0.65 * shadow);
  gl_FragColor = vec4(col, density * 0.85);
}
