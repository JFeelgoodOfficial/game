// Planet surface (Phase 3 preview). Procedural continents from layered noise,
// elevation-banded color, ice caps, a day/night terminator lit by the sun,
// and a sun glint on water. No geometry displacement yet — colour only, one
// sphere. The same noise field will drive vertex displacement when descent
// (Phase 5) arrives, so the near surface stays continuous with this view.

varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

uniform vec3 uSun;
uniform float uSeaLevel;

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
float fbm(vec3 p, int oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 7; i++) {
    if (i >= oct) break;
    v += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 p = normalize(vObjPos);

  // Elevation: broad continents + finer coastline detail. Warped so the
  // shapes aren't obviously spherical noise.
  vec3 warp = vec3(fbm(p * 1.3 + 4.1, 3), fbm(p * 1.3 + 8.7, 3), fbm(p * 1.3 + 1.9, 3));
  float elev = fbm(p * 1.8 + warp * 0.6, 6);
  float lat = abs(p.y); // 0 at equator, 1 at the poles

  vec3 col;
  if (elev < uSeaLevel) {
    float d = elev / uSeaLevel; // 0 deep .. 1 shore
    col = mix(vec3(0.015, 0.04, 0.14), vec3(0.05, 0.32, 0.52), d * d);
  } else {
    float e = (elev - uSeaLevel) / (1.0 - uSeaLevel); // 0 coast .. 1 peak
    col = mix(vec3(0.76, 0.70, 0.48), vec3(0.16, 0.40, 0.13), smoothstep(0.02, 0.18, e)); // sand→green
    col = mix(col, vec3(0.34, 0.28, 0.20), smoothstep(0.30, 0.62, e)); // → rock
    col = mix(col, vec3(0.92, 0.93, 0.97), smoothstep(0.66, 0.86, e)); // → snow
  }
  // polar ice, with a ragged edge from the noise
  col = mix(col, vec3(0.90, 0.94, 1.0), smoothstep(0.72, 0.93, lat + (elev - 0.5) * 0.15));

  // day/night
  vec3 N = normalize(vWorldNormal), S = normalize(uSun), V = normalize(vViewDir);
  float ndl = dot(N, S);
  float day = smoothstep(-0.12, 0.28, ndl);
  vec3 lit = col * (0.04 + 0.96 * day);

  // sun glint on water only, near the specular direction
  if (elev < uSeaLevel) {
    vec3 H = normalize(S + V);
    float spec = pow(max(dot(N, H), 0.0), 60.0) * day;
    lit += vec3(1.0, 0.95, 0.8) * spec * 0.7;
  }

  // faint warm rim at the day/night terminator, atmosphere scatter hint
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * day;
  lit += vec3(0.35, 0.45, 0.7) * rim * 0.35;

  gl_FragColor = vec4(lit, 1.0);
}
