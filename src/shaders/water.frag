// Sea surface (Phase 5 slice, GDD 5.6). A flat sphere at sea level: deep
// blue with a fresnel sky tint and the sun glint. Flat water against rough
// land is most of what makes terrain read as a planet from the air.

varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

uniform vec3 uSun;

void main() {
  vec3 N = normalize(vWorldNormal), S = normalize(uSun), V = normalize(vViewDir);
  float day = smoothstep(-0.12, 0.28, dot(N, S));

  vec3 col = vec3(0.03, 0.16, 0.32) * (0.05 + 0.95 * day);

  // fresnel sky tint at grazing angles
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += vec3(0.25, 0.4, 0.6) * fres * 0.5 * day;

  // sun glint
  vec3 H = normalize(S + V);
  col += vec3(1.0, 0.95, 0.8) * pow(max(dot(N, H), 0.0), 90.0) * day;

  gl_FragColor = vec4(col, 1.0);
}
