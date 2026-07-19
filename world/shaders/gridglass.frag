// Hyper-holo-grid chamber glass (actuality mirror room). Samples the cyan
// mirror-grid canvas (its 2×2 repeat baked in here — ShaderMaterial ignores
// texture.repeat) and sends a luminous pulse band climbing the grid lines;
// uSurge speeds and brightens it through the finale. Line crests cross the
// bloom threshold only as the surge peaks.
uniform sampler2D uMap;
uniform float uTime;
uniform float uSurge;
uniform vec3 uTint;
varying vec2 vUv;

void main() {
  vec4 g = texture2D(uMap, vUv * 2.0);
  float lines = smoothstep(0.10, 0.30, g.b);
  float pulse = 0.5 + 0.5 * sin(vUv.y * 6.28 - uTime * (1.2 + uSurge * 3.0));
  vec3 col = g.rgb * uTint * (1.0 + lines * pulse * (0.9 + uSurge * 1.4));
  gl_FragColor = vec4(col, 0.5);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
