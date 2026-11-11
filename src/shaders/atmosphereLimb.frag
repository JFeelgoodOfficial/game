// Atmospheric limb (Phase 4 preview). Backside shell, additive: a fresnel
// glow that thickens at grazing angles, brightest on the sun side. The limb
// against black is most of what makes the orbital view read as a planet
// rather than a textured ball.

varying vec3 vWorldNormal;
varying vec3 vViewDir;

uniform vec3 uSun;
uniform vec3 uColor;

void main() {
  vec3 N = normalize(vWorldNormal), V = normalize(vViewDir);
  // backside normals face inward; flip so grazing = limb
  float fres = pow(1.0 - abs(dot(N, V)), 2.4);
  float sun = smoothstep(-0.35, 0.6, dot(-N, normalize(uSun)));
  float a = fres * (0.25 + 0.75 * sun);
  gl_FragColor = vec4(uColor * a, a);
}
