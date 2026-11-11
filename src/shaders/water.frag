// Sea surface (Phase 5 slice, GDD 5.6/5.7). A flat sphere at sea level with
// a per-planet colour and glossiness: liquid oceans get fresnel + sun glint;
// a frozen sea (ice world) is flat but matte — uGloss near zero kills the
// specular so it reads as ice, not water.

varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

uniform vec3 uSun;
uniform vec3 uWaterColor;
uniform float uGloss; // 1 liquid ocean .. ~0.1 frozen
uniform vec3 uFogColor;   // custom fog (planetsky underwater grading)
uniform float uFogDensity;// 0 = off — raw ShaderMaterials can't read scene.fog
uniform float uTime;      // liquid oceans only: moving wave normals
uniform vec3 uSkyColor;   // what the sea reflects at grazing angles
uniform float uGlint;     // peak sun-glint intensity (HDR)
uniform float uDetail;    // 1 on HIGH and up: noise swell instead of sine trains
uniform float uFade;      // 1 near, 0 far: hands the ocean to surface.frag

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
// Two crossing swells drifting at different speeds.
float swell(vec3 q) {
  float t = uTime * 0.22;
  return 0.62 * vnoise(q + vec3(t, 0.0, t * 0.6)) + 0.38 * vnoise(q * 2.7 - vec3(0.0, t * 1.3, t));
}

void main() {
  vec3 N = normalize(vWorldNormal), S = normalize(uSun), V = normalize(vViewDir);
  float dist = length(vViewDir);
  // 1 at the hull, 0 from orbit. Wave relief is sub-pixel from far away, where
  // its only visible effect is to spread the glint — handled below instead.
  float near = 1.0 - smoothstep(500.0, 2600.0, dist);

  // Moving wave normals on liquid seas. Frozen seas (uGloss near 0) stay dead
  // flat — ice, not water.
  if (uGloss > 0.5 && near > 0.0) {
    if (uDetail > 0.5) {
      // Gradient of the swell field by forward differences, projected onto
      // the sea's tangent plane.
      vec3 q = vObjPos * 0.16;
      const float e = 0.4;
      float h0 = swell(q);
      vec3 grad = vec3(swell(q + vec3(e, 0.0, 0.0)), swell(q + vec3(0.0, e, 0.0)), swell(q + vec3(0.0, 0.0, e))) - h0;
      grad -= N * dot(grad, N);
      N = normalize(N - grad * (0.55 * near));
    } else {
      vec3 p = vObjPos * 0.55;
      float w1 = sin(p.x * 1.7 + p.z * 0.9 + uTime * 1.1);
      float w2 = sin(p.z * 2.3 - p.x * 0.6 - uTime * 0.8);
      float w3 = sin((p.x + p.y + p.z) * 3.1 + uTime * 1.7);
      N = normalize(N + vec3(w1 + w3 * 0.5, w2 * 0.4, w2 + w3 * 0.5) * (0.035 * near));
    }
  }

  float muS = dot(normalize(vWorldNormal), S);
  float day = smoothstep(-0.12, 0.28, muS);
  // low sun arrives warm, as on land (surface.frag)
  vec3 sunCol = mix(vec3(1.0, 0.5, 0.24), vec3(1.0), smoothstep(-0.05, 0.42, muS));

  vec3 col = uWaterColor * (0.05 + 0.95 * day * sunCol);

  // Schlick fresnel: water is a 2% mirror head-on and a full one at grazing
  // angles, where it shows the sky instead of its own colour.
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  col = mix(col, uSkyColor * (0.05 + 0.95 * day), fres * 0.6 * uGloss);

  // Sun glint: tight and hot at the hull, widening and dimming with range as
  // more unresolved wave facets share each pixel.
  vec3 H = normalize(S + V);
  float shin = mix(180.0, 420.0, near);
  col += vec3(1.0, 0.93, 0.78) * sunCol * pow(max(dot(N, H), 0.0), shin) * day * uGloss * uGlint * mix(0.16, 1.0, near);

  // Seen from below (divable worlds render DoubleSide): a Snell's-window
  // ceiling — bright daylight in a cone straight overhead, closing to a dark
  // reflective sheet toward the horizon.
  if (!gl_FrontFacing) {
    float window = smoothstep(0.5, 0.85, -dot(N, V));
    vec3 skyThroughSurface = vec3(0.45, 0.72, 0.95) * (0.12 + 0.88 * day);
    col = mix(uWaterColor * 0.12, skyThroughSurface, window);
    col += vec3(1.0, 0.95, 0.8) * pow(max(dot(N, H), 0.0), 60.0) * day * 0.4;
  }

  if (uFogDensity > 0.0) {
    col = mix(col, uFogColor, 1.0 - exp(-length(vViewDir) * uFogDensity));
  }

  gl_FragColor = vec4(col, uFade);
}
