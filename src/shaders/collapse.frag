// Horizon collapse (beyond GDD §4.5 — a deliberate override of "falling in
// does nothing"). When the ship crosses into the black hole, everything
// stretches toward the center and whites out; the world then resets to the
// start. Serves the GDD §7 loop philosophy: a beginning, a middle, an end,
// returned to where you began.
//
// uProgress 0 = off, 1 = peak. Radial motion-smear pulling the image toward
// screen center (spaghettification streaks) plus a growing white core.

uniform sampler2D tDiffuse;
uniform float uProgress;

varying vec2 vUv;

void main() {
  vec2 c = vUv - 0.5;
  float p = uProgress;

  // Accumulate taps progressively zoomed toward center: radial features
  // elongate into streaks as everything rushes into the hole.
  vec3 col = vec3(0.0);
  float total = 0.0;
  const int N = 12;
  for (int i = 0; i < N; i++) {
    float f = float(i) / float(N - 1);       // 0..1
    float s = 1.0 - p * 0.85 * f;             // shrink toward center
    float w = 1.0 - 0.5 * f;
    col += texture2D(tDiffuse, 0.5 + c * s).rgb * w;
    total += w;
  }
  col /= total;

  // Growing white core; overall brighten toward the peak.
  float core = smoothstep(0.55, 0.0, length(c)) * smoothstep(0.5, 1.0, p);
  col = mix(col, vec3(1.0), core * 0.9);
  col += p * p * 0.25;

  gl_FragColor = vec4(col, 1.0);
}
