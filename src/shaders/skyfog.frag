// Atmospheric entry (Phase 5 preview). As the ship descends into the
// planet's atmosphere the view washes toward a sky colour — brighter and
// bluer on the day side, near-dark at night — so space fades to sky and the
// stars drown out. Density grows the deeper you go. Screen-space, driven by
// the ship's altitude (main.js). Never a hazard: the altitude floor holds
// you above the surface, this just paints the air.

uniform sampler2D tDiffuse;
uniform float uAtmo;    // 0 above the atmosphere, 1 at the surface
uniform float uDay;     // 0 night .. 1 full day at the ship's position
uniform vec3 uSkyDay;
uniform float uDensity;

varying vec2 vUv;

void main() {
  vec3 col = texture2D(tDiffuse, vUv).rgb;

  float d = clamp(uAtmo * uAtmo * uDensity, 0.0, 1.0);
  vec3 sky = mix(vec3(0.01, 0.02, 0.05), uSkyDay, uDay);

  // day side washes strongly to blue; night side only hazes faintly
  float amount = d * (0.25 + 0.75 * uDay);
  col = mix(col, sky, clamp(amount, 0.0, 0.92));

  gl_FragColor = vec4(col, 1.0);
}
