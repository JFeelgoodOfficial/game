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

void main() {
  vec3 N = normalize(vWorldNormal), S = normalize(uSun), V = normalize(vViewDir);
  float day = smoothstep(-0.12, 0.28, dot(N, S));

  vec3 col = uWaterColor * (0.05 + 0.95 * day);

  // fresnel sky tint at grazing angles
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += vec3(0.25, 0.4, 0.6) * fres * 0.5 * day * uGloss;

  // sun glint
  vec3 H = normalize(S + V);
  col += vec3(1.0, 0.95, 0.8) * pow(max(dot(N, H), 0.0), 90.0) * day * uGloss;

  if (uFogDensity > 0.0) {
    col = mix(col, uFogColor, 1.0 - exp(-length(vViewDir) * uFogDensity));
  }

  gl_FragColor = vec4(col, 1.0);
}
