// Animated alien ad boards: the seeded glyph canvas is swept by a rolling
// highlight band, modulated by scanlines, and occasionally tears sideways
// for one beat (holo-glitch). Dim by day, blooming at night.
uniform sampler2D uMap;
uniform float uTime;
uniform float uNight;

varying vec2 vUv;

float hash1(float p) { return fract(sin(p * 127.1) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  // glitch: a few beats a minute, one frame-ish of horizontal tearing
  float beat = floor(uTime * 1.7);
  float tear = step(0.93, hash1(beat));
  uv.x = fract(uv.x + tear * (hash1(floor(vUv.y * 24.0) + beat) - 0.5) * 0.1);

  vec3 col = texture2D(uMap, uv).rgb;
  // rolling highlight sweep up the board
  float band = fract(vUv.y - uTime * 0.12);
  float sweep = 1.0 + 0.8 * exp(-30.0 * (band - 0.5) * (band - 0.5));
  float scan = 0.85 + 0.15 * sin(vUv.y * 320.0 + uTime * 8.0);
  float level = mix(0.25, 1.6, uNight);
  gl_FragColor = vec4(col * sweep * scan * level, 1.0);
}
