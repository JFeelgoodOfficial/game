// Planet surface (Phase 3 + Phase 5 slice). Procedural continents from the
// same warped-fbm + ridged field the vertex shader displaces with,
// elevation-banded colour from a per-planet palette (GDD 5.7: variation is
// a palette and a threshold), ice caps, day/night terminator, and relief
// shading from a finite-difference perturbation of the normal.

varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

uniform vec3 uSun;
uniform float uSeaLevel;
uniform float uAmp;
uniform float uRadius;
uniform int uOct; // planet.js lowers octaves with distance (audit fix)
uniform float uIceLat;    // latitude where polar ice begins (>1 disables)
uniform vec3 uColDeep;    // deep water / lowest floor
uniform vec3 uColShallow; // shallow water / low basin
uniform vec3 uColSand;    // shoreline
uniform vec3 uColLow;     // lowlands
uniform vec3 uColMid;     // uplands / rock
uniform vec3 uColHigh;    // peaks

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
float ridged(vec3 p, int oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= oct) break;
    v += a * (1.0 - abs(2.0 * vnoise(p) - 1.0));
    p *= 2.11;
    a *= 0.5;
  }
  return v;
}
float elevation(vec3 p, int oct) {
  vec3 warp = vec3(fbm(p * 1.3 + 4.1, 3), fbm(p * 1.3 + 8.7, 3), fbm(p * 1.3 + 1.9, 3));
  float base = fbm(p * 1.8 + warp * 0.6, oct);
  float mask = smoothstep(0.5, 0.62, base);
  return base * 0.72 + ridged(p * 3.5, 4) * 0.28 * mask;
}

void main() {
  vec3 p = normalize(vObjPos);
  float elev = elevation(p, uOct);
  float lat = abs(p.y);

  vec3 col;
  if (elev < uSeaLevel) {
    float d = elev / max(uSeaLevel, 1e-4);
    col = mix(uColDeep, uColShallow, d * d);
  } else {
    float e = (elev - uSeaLevel) / (1.0 - uSeaLevel);
    col = mix(uColSand, uColLow, smoothstep(0.02, 0.18, e));
    col = mix(col, uColMid, smoothstep(0.28, 0.58, e));
    col = mix(col, uColHigh, smoothstep(0.62, 0.84, e));
    // surface detail grain so slopes aren't airbrushed — sub-pixel at
    // distance, so it only runs at full detail level
    if (uOct >= 6) {
      float grain = fbm(p * 40.0, 3);
      col *= 0.88 + 0.24 * grain;
    }
  }
  // polar ice, ragged edge from the elevation noise
  col = mix(col, vec3(0.90, 0.94, 1.0),
            smoothstep(uIceLat, uIceLat + 0.21, lat + (elev - 0.5) * 0.15));

  vec3 N = normalize(vWorldNormal), S = normalize(uSun), V = normalize(vViewDir);

  // relief shading: perturb the sphere normal by the terrain gradient.
  // Audit fix: reconstructed from screen-space derivatives of the elevation
  // already computed above (surface-gradient bump mapping) instead of three
  // extra elevation() evaluations per pixel — ~4x fewer noise lookups on
  // every lit land fragment for the same visual relief.
  if (uAmp > 0.0 && elev > uSeaLevel) {
    vec3 dpx = dFdx(vObjPos);
    vec3 dpy = dFdy(vObjPos);
    vec3 r1 = cross(dpy, N);
    vec3 r2 = cross(N, dpx);
    float det = dot(dpx, r1);
    if (abs(det) > 1e-10) {
      vec3 grad = (r1 * dFdx(elev) + r2 * dFdy(elev)) / det;
      vec3 pert = grad * uAmp * 1.4;
      // soft-limit the slope so grazing angles don't sparkle
      pert *= 3.0 / max(3.0, length(pert));
      N = normalize(N - pert);
    }
  }

  float ndl = dot(N, S);
  float day = smoothstep(-0.12, 0.28, ndl);
  vec3 lit = col * (0.04 + 0.96 * day);

  // faint cool rim toward the limb on the day side
  float rim = pow(1.0 - max(dot(normalize(vWorldNormal), V), 0.0), 3.0) * day;
  lit += vec3(0.35, 0.45, 0.7) * rim * 0.35;

  gl_FragColor = vec4(lit, 1.0);
}
