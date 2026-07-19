// Zone 9 dragon hologram (actuality). Samples the owner's box-free hologram
// artwork and adds live projection artifacts: drifting scanlines, a rare
// glitch band (uv slice displacement + RGB split inside the band only), and a
// slow vertical projection sweep whose crest intentionally crosses the bloom
// threshold (0.85) for a soft halo. Rendered additive over the granite layer,
// so black stays invisible.
uniform sampler2D uMap;
uniform float uTime;
varying vec2 vUv;

float hash(float n) { return fract(sin(n) * 43758.5453); }

void main() {
  vec2 uv = vUv;

  // Glitch slice: ~1 in 6 time-slots displaces one horizontal band.
  float slot = floor(uTime * 1.7);
  float g = step(0.84, hash(slot));
  float band = g * step(abs(vUv.y - hash(slot + 7.0)), 0.035);
  uv.x += (hash(slot + 13.0) - 0.5) * 0.08 * band;

  vec3 col = texture2D(uMap, uv).rgb;
  // RGB split inside the glitch band only.
  col.r = mix(col.r, texture2D(uMap, uv + vec2(0.006, 0.0)).r, band);
  col.b = mix(col.b, texture2D(uMap, uv - vec2(0.006, 0.0)).b, band);

  // Drifting scanlines + slow projection sweep + base shimmer (replaces the
  // old JS-side opacity sin).
  float scan = 0.86 + 0.14 * sin(vUv.y * 340.0 - uTime * 2.6);
  float sweep = 0.55 * exp(-pow((fract(uTime * 0.09) - vUv.y) * 9.0, 2.0));
  float shimmer = 0.86 + 0.12 * sin(uTime * 2.2);

  gl_FragColor = vec4(col * scan * (shimmer + sweep), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
