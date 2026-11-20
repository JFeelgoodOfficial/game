// Dark plate with lit green windows — the ring frames and the city towers.

varying vec3 vPos;
varying vec3 vWorldNormal;
varying vec3 vView;
varying float vUp;

uniform vec3 uSun;
uniform float uHdr;
uniform float uWin; // window lattice density (per parent unit)
uniform float uTime;
// A light inside the frame (the megaworld's caged stars, world/megaworld.js):
// xyz its place in vPos's space, w its strength. Unset (0) everywhere else.
uniform vec4 uCore;
// A million years on (src/era.js): growth over the plating, most windows dark,
// and daylight of whatever strength there is. Unset (0) everywhere else.
uniform float uEra;
uniform float uDayK;
#ifdef HAZE
// Standing on the megaworld (world/megaworld.js): the haze the ground is
// drawn into, on the same curve as megaGround.frag's, so a tower and the
// plate behind it go grey together.
uniform vec3 uHaze;
uniform float uHorizon;
uniform float uAged;
uniform vec3 uDayCol;
vec3 hazed(vec3 col, float dist) {
  float fr = clamp(dist / uHorizon, 0.0, 1.0);
  float haze = smoothstep(0.10, 0.92, fr);
  vec3 hz = uHaze * (0.7 + 1.6 * smoothstep(0.6, 1.0, fr));
  hz = mix(hz, vec3(0.05, 0.16, 0.36) * (0.5 + 3.0 * smoothstep(0.7, 1.0, fr)), uAged);
  hz = mix(hz, mix(vec3(0.07, 0.13, 0.22), uDayCol * 0.5, 0.45) * (0.25 + uDayK) * (0.6 + 1.4 * smoothstep(0.6, 1.0, fr)), uEra);
  return mix(col, hz, haze * 0.94);
}
#endif

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  vec3 N = normalize(vWorldNormal), S = normalize(uSun);
  float day = smoothstep(-0.1, 0.5, dot(N, S));
  vec3 cell = floor(vPos * uWin * 0.25);
  float plate = hash(cell);
  vec3 base = vec3(0.07, 0.08, 0.08) * (0.6 + 0.8 * plate);
  float growth = uEra * smoothstep(0.3, 0.75, hash(floor(vPos * uWin * 0.06) + 1.3) * 0.65 + 0.35 * plate);
  base = mix(base, vec3(0.045, 0.1, 0.04) * (0.6 + 0.8 * plate), growth * 0.8);
  vec3 lit = base * (0.06 + 1.2 * day * mix(1.0, uDayK * 1.5, uEra));
  if (uCore.w > 0.0) {
    vec3 toCore = uCore.xyz - vPos;
    float cd = length(toCore);
    lit += base * vec3(1.0, 0.62, 0.28) * uCore.w * max(dot(N, toCore / cd), 0.0) / (1.0 + cd * cd * 2.0e-8);
  }

  vec3 wc = floor(vPos * uWin);
  float wh = hash(wc + 3.7);
  float on = step(mix(0.88, 0.992, uEra), wh);
  vec3 wcol = mix(vec3(0.15, 1.0, 0.45), vec3(0.3, 0.75, 1.0), step(0.93, wh));
#ifdef HAZE
  // a long way off a window is under a pixel: rather than a shimmer of on and
  // off, the wall glows with what its windows add up to
  float wpx = length(fwidth(vPos * uWin));
  float wk = 1.0 - smoothstep(0.6, 1.6, wpx);
  lit += wcol * on * uHdr * (0.6 + 0.4 * sin(uTime * 1.3 + wh * 50.0)) * wk;
  lit += vec3(0.17, 0.97, 0.47) * (1.0 - wk) * mix(0.035, 0.003, uEra) * uHdr;
#else
  lit += wcol * on * uHdr * (0.6 + 0.4 * sin(uTime * 1.3 + wh * 50.0));
#endif
  // roofs glow: the tops of the towers carry the brightest light
  lit += vec3(0.2, 1.0, 0.55) * smoothstep(0.93, 1.0, vUp) * uHdr * 0.4 * step(0.55, plate) * (1.0 - uEra);

#ifdef HAZE
  lit = hazed(lit, length(vView));
#endif
  gl_FragColor = vec4(lit, 1.0);
}
