// Mild chromatic aberration at frame edges (GDD 4.4). Radial RGB split
// growing with the square of the distance from center — zero in the middle,
// a few pixels at the corners. No film grain, no vignette.

uniform sampler2D tDiffuse;
uniform float uStrength; // uv-space split scale, derived from CA_STRENGTH px
uniform float uWarp;     // radial smear reach at the corners (uv); 0 off

varying vec2 vUv;

void main() {
  vec2 c = vUv - 0.5;
  vec2 shift = c * dot(c, c) * uStrength;
  float r = texture2D(tDiffuse, vUv + shift).r;
  float g = texture2D(tDiffuse, vUv).g;
  float b = texture2D(tDiffuse, vUv - shift).b;
  vec3 col = vec3(r, g, b);
  // Warp: smear the frame outward from its centre, more toward the edges, so
  // the stars' streaks and everything else share one direction of motion.
  // Three extra taps, only while warping.
  if (uWarp > 0.0005) {
    vec2 step = c * (uWarp * dot(c, c) * 4.0 / 3.0);
    col += texture2D(tDiffuse, vUv - step).rgb;
    col += texture2D(tDiffuse, vUv - step * 2.0).rgb;
    col += texture2D(tDiffuse, vUv - step * 3.0).rgb;
    col *= 0.25;
  }
  gl_FragColor = vec4(col, 1.0);
}
