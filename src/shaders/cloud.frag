// Cloud layer (Phase 3/4 polish). A thin shell just above the surface: fbm
// noise thresholded into puffs, drifting slowly over time, lit by the same
// sun as the ground so clouds fall dark across the night side. Transparent,
// so the surface shows through the gaps.

varying vec3 vObjPos;
varying vec3 vWorldNormal;

uniform vec3 uSun;
uniform float uTime;
uniform float uCover; // 0 clear .. 1 overcast
uniform float uStorm; // 0 fair weather .. 1 thunderheads: dark bases, fast churn, lightning

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
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.05; a *= 0.5; }
  return v;
}

void main() {
  vec3 p = normalize(vObjPos);
  // slow drift + a second slower layer for churn
  // storm systems move and boil several times faster than fair-weather cloud
  float tt = uTime * (1.0 + 5.0 * uStorm);
  float d = fbm(p * 2.4 + vec3(tt * 0.006, 0.0, tt * 0.004));
  d = d * 0.7 + fbm(p * 5.0 - vec3(0.0, tt * 0.008, 0.0)) * 0.3;

  float lo = mix(0.62, 0.4, uCover);
  float cover = smoothstep(lo, lo + 0.16, d);
  if (cover < 0.01) discard;

  float ndl = dot(normalize(vWorldNormal), normalize(uSun));
  float day = smoothstep(-0.1, 0.32, ndl);
  // brighter sunlit tops, cooler shadowed base
  vec3 col = mix(vec3(0.55, 0.6, 0.72), vec3(1.0), day);
  // cloud tops near the terminator catch the same reddened sunlight the ground does
  col *= mix(vec3(1.0, 0.55, 0.3), vec3(1.0), smoothstep(-0.05, 0.42, ndl));

  float alpha = cover * (0.15 + 0.85 * day);
  if (uStorm > 0.0) {
    // Thunderheads: the thick middles of the cloud mass go slate-dark, with a
    // finer turbulence breaking up their edges.
    float thick = smoothstep(lo + 0.1, lo + 0.34, d);
    float boil = fbm(p * 26.0 + vec3(tt * 0.03, -tt * 0.02, 0.0));
    vec3 dark = vec3(0.2, 0.17, 0.2) * (0.25 + 0.75 * day);
    col = mix(col, dark, uStorm * thick * (0.55 + 0.45 * boil));
    // Lightning. The sky is cut into cells; each cell rolls a die several
    // times a second and now and then lights up from inside, double-flashing
    // as it dies. Visible on the night side too, which is the point.
    vec3 cp = p * 16.0;
    vec3 cell = floor(cp);
    float slot = floor(uTime * 2.6 + hash(cell) * 9.0);
    float roll = hash(cell + slot * 0.37);
    if (roll > 0.955) {
      float ph = fract(uTime * 2.6 + hash(cell) * 9.0);
      float flick = exp(-ph * 5.0) * (0.6 + 0.4 * sin(ph * 60.0));
      float core = 1.0 - smoothstep(0.0, 0.75, length(fract(cp) - 0.5));
      float bolt = flick * core * thick * uStorm;
      col += vec3(0.85, 0.9, 1.0) * bolt * 6.0;
      alpha = max(alpha, cover * min(bolt * 2.0, 1.0));
    }
  }

  gl_FragColor = vec4(col, alpha);
}
