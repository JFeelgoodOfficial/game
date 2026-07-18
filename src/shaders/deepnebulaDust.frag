// Deep nebula dark dust. NormalBlending (real alpha), drawn AFTER the additive
// gas so it genuinely occludes the bright billows behind it — the material of
// the black paint that gives the nebula its dense central mass. Near-black
// colour, low per-sprite opacity accumulated over many overlapping soft sprites.

varying vec3 vColor;  // near-black
varying float vAlpha; // near-fade (from the shared vertex shader)

uniform float uOpacity;

void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.15, r) * uOpacity * vAlpha;
  gl_FragColor = vec4(vColor, a);
}
