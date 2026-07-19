// Space-elevator ribbon: a steady base glow with bright cargo pulses racing
// up toward orbit. Local Y encodes height along the merged ribbon segments.
uniform float uTime;
uniform float uNight;
uniform vec3 uColor;
uniform float uHeight; // total local-Y span of the ribbon

varying vec3 vLocalPos;

void main() {
  float yn = clamp(vLocalPos.y / uHeight, 0.0, 1.0);
  float band = fract(yn * 3.0 - uTime * 0.22);
  float pulse = exp(-24.0 * (band - 0.5) * (band - 0.5));
  float night = mix(0.3, 1.0, uNight);
  float fade = 1.0 - yn * 0.55; // thins out toward the vanishing point
  vec3 col = uColor * (0.35 + pulse * 1.3) * night * fade;
  gl_FragColor = vec4(col, 0.85);
}
