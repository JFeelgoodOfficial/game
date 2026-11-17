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
  vec3 lit = base * (0.06 + 1.2 * day);
  if (uCore.w > 0.0) {
    vec3 toCore = uCore.xyz - vPos;
    float cd = length(toCore);
    lit += base * vec3(1.0, 0.62, 0.28) * uCore.w * max(dot(N, toCore / cd), 0.0) / (1.0 + cd * cd * 2.0e-8);
  }

  vec3 wc = floor(vPos * uWin);
  float wh = hash(wc + 3.7);
  float on = step(0.88, wh);
  vec3 wcol = mix(vec3(0.15, 1.0, 0.45), vec3(0.3, 0.75, 1.0), step(0.93, wh));
  lit += wcol * on * uHdr * (0.6 + 0.4 * sin(uTime * 1.3 + wh * 50.0));
  // roofs glow: the tops of the towers carry the brightest light
  lit += vec3(0.2, 1.0, 0.55) * smoothstep(0.93, 1.0, vUp) * uHdr * 0.4 * step(0.55, plate);

  gl_FragColor = vec4(lit, 1.0);
}
