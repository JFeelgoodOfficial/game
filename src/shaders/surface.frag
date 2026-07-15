// Planet surface (Phase 3 + Phase 5 slice). Procedural continents from the
// same warped-fbm field the vertex shader displaces with, elevation-banded
// colour, ice caps, day/night terminator, and relief shading from a
// finite-difference perturbation of the normal so mountains cast light and
// shade. Ocean fragments are covered by the separate water sphere; they keep
// a deep floor colour underneath it.

varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

uniform vec3 uSun;
uniform float uSeaLevel;
uniform float uAmp;
uniform float uRadius;

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
float elevation(vec3 p, int oct) {
  vec3 warp = vec3(fbm(p * 1.3 + 4.1, 3), fbm(p * 1.3 + 8.7, 3), fbm(p * 1.3 + 1.9, 3));
  return fbm(p * 1.8 + warp * 0.6, oct);
}

void main() {
  vec3 p = normalize(vObjPos);
  float elev = elevation(p, 6);
  float lat = abs(p.y);

  vec3 col;
  if (elev < uSeaLevel) {
    float d = elev / uSeaLevel;
    col = mix(vec3(0.015, 0.04, 0.14), vec3(0.05, 0.32, 0.52), d * d);
  } else {
    float e = (elev - uSeaLevel) / (1.0 - uSeaLevel);
    col = mix(vec3(0.76, 0.70, 0.48), vec3(0.16, 0.40, 0.13), smoothstep(0.02, 0.18, e));
    col = mix(col, vec3(0.34, 0.28, 0.20), smoothstep(0.30, 0.62, e));
    col = mix(col, vec3(0.92, 0.93, 0.97), smoothstep(0.66, 0.86, e));
  }
  col = mix(col, vec3(0.90, 0.94, 1.0), smoothstep(0.72, 0.93, lat + (elev - 0.5) * 0.15));

  vec3 N = normalize(vWorldNormal), S = normalize(uSun), V = normalize(vViewDir);

  // relief shading: perturb the sphere normal by the terrain gradient
  if (uAmp > 0.0 && elev > uSeaLevel) {
    vec3 t1 = normalize(cross(p, vec3(0.0, 1.0, 0.0)) + vec3(0.0, 0.0, 1e-4));
    vec3 t2 = normalize(cross(p, t1));
    float eps = 0.012;
    float e1 = elevation(normalize(p + t1 * eps), 4);
    float e2 = elevation(normalize(p + t2 * eps), 4);
    float e0 = elevation(p, 4);
    float k = uAmp / (uRadius * eps) * 1.4;
    N = normalize(N - (t1 * (e1 - e0) + t2 * (e2 - e0)) * k);
  }

  float ndl = dot(N, S);
  float day = smoothstep(-0.12, 0.28, ndl);
  vec3 lit = col * (0.04 + 0.96 * day);

  // faint cool rim toward the limb on the day side
  float rim = pow(1.0 - max(dot(normalize(vWorldNormal), V), 0.0), 3.0) * day;
  lit += vec3(0.35, 0.45, 0.7) * rim * 0.35;

  gl_FragColor = vec4(lit, 1.0);
}
