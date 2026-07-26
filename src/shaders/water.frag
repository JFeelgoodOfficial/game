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

void main() {
  vec3 N = normalize(vWorldNormal), S = normalize(uSun), V = normalize(vViewDir);

  // Moving wave normals on liquid seas: three directional ripple trains
  // perturb the sphere normal so the glint field breaks up and travels.
  // Frozen seas (uGloss near 0) stay dead flat — ice, not water.
  if (uGloss > 0.5) {
    vec3 p = vObjPos * 0.55;
    float w1 = sin(p.x * 1.7 + p.z * 0.9 + uTime * 1.1);
    float w2 = sin(p.z * 2.3 - p.x * 0.6 - uTime * 0.8);
    float w3 = sin((p.x + p.y + p.z) * 3.1 + uTime * 1.7);
    N = normalize(N + vec3(w1 + w3 * 0.5, w2 * 0.4, w2 + w3 * 0.5) * 0.035);
  }

  float day = smoothstep(-0.12, 0.28, dot(N, S));

  vec3 col = uWaterColor * (0.05 + 0.95 * day);

  // fresnel sky tint at grazing angles
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += vec3(0.25, 0.4, 0.6) * fres * 0.5 * day * uGloss;

  // sun glint
  vec3 H = normalize(S + V);
  col += vec3(1.0, 0.95, 0.8) * pow(max(dot(N, H), 0.0), 90.0) * day * uGloss;

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

  gl_FragColor = vec4(col, 1.0);
}
