// Scrolling hold-queue ticker for the Wavemall Prime entrance arch.
// uLevel carries the day/night dim (0.55 day .. 1.0 night) so the strip
// blooms after dark (peak ~1.3, over the 0.85 bloom threshold) but stays a
// readable pale band by day (~0.71, under threshold).
uniform sampler2D uTex;
uniform float uTime;
uniform float uLevel;

varying vec2 vUv;

const float SCROLL_SPEED = 0.035;
const float PEAK = 1.3;

void main() {
  vec2 uv = vec2(fract(vUv.x + uTime * SCROLL_SPEED), vUv.y);
  vec4 texel = texture2D(uTex, uv);

  // Holo scanlines + soft top/bottom fade so the strip reads as projected
  // light, not a solid panel.
  float scan = 0.85 + 0.15 * sin(vUv.y * 60.0 + uTime * 8.0);
  float fade = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);

  vec3 color = texel.rgb * (uLevel * PEAK * scan * fade);
  float lum = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
  float alpha = clamp(lum * 1.6, 0.0, 1.0) * fade;

  if (alpha < 0.01) discard;
  gl_FragColor = vec4(color, alpha);
}
