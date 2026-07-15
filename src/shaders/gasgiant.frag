// Gas giant surface (Phase 6 variation, GDD 5.7). Latitude bands warped by
// fbm, slow band drift, storm speckles, same sun lighting/terminator as the
// rocky surface, and a fresnel limb tint (methane glow on the ice giant).
// One shader, palette uniforms — variation is a palette, not a new system.

varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

uniform vec3 uSun;
uniform float uTime;
uniform vec3 uBase;   // mid-band colour
uniform vec3 uBandA;  // light band
uniform vec3 uBandB;  // dark band
uniform vec3 uLimb;   // fresnel limb tint
uniform float uBands; // band frequency

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
  vec3 p = normalize(vObjPos);

  // bands: latitude stripes, wobbled by fbm so they churn like weather
  float wob = fbm(vec3(p.x * 2.0, p.y * 5.0, p.z * 2.0) + uTime * 0.01) - 0.5;
  float lat = p.y + wob * 0.22;
  float s = sin(lat * uBands + sin(lat * uBands * 0.37) * 1.7);
  vec3 col = mix(uBase, uBandA, smoothstep(-0.2, 0.9, s));
  col = mix(col, uBandB, smoothstep(0.15, 0.95, -s));

  // storm speckles along the bands
  float storm = fbm(p * 9.0 + vec3(uTime * 0.02, 0.0, 0.0));
  col += vec3(0.10, 0.08, 0.06) * smoothstep(0.68, 0.85, storm);

  // day/night
  vec3 N = normalize(vWorldNormal), S = normalize(uSun), V = normalize(vViewDir);
  float day = smoothstep(-0.12, 0.28, dot(N, S));
  col *= (0.04 + 0.96 * day);

  // fresnel limb tint (thick atmosphere / methane)
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5) * day;
  col += uLimb * rim * 0.55;

  gl_FragColor = vec4(col, 1.0);
}
