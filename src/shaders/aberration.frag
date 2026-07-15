// Mild chromatic aberration at frame edges (GDD 4.4). Radial RGB split
// growing with the square of the distance from center — zero in the middle,
// a few pixels at the corners. No film grain, no vignette.

uniform sampler2D tDiffuse;
uniform float uStrength; // uv-space split scale, derived from CA_STRENGTH px

varying vec2 vUv;

void main() {
  vec2 c = vUv - 0.5;
  vec2 shift = c * dot(c, c) * uStrength;
  float r = texture2D(tDiffuse, vUv + shift).r;
  float g = texture2D(tDiffuse, vUv).g;
  float b = texture2D(tDiffuse, vUv - shift).b;
  gl_FragColor = vec4(r, g, b, 1.0);
}
