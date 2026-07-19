// City-rim haze card: additive glow that fades vertically and toward the
// card's sides, giving the settlement a soft light-dome against the sky.
uniform vec3 uColor;
uniform float uNight;

varying vec2 vUv;

void main() {
  float v = smoothstep(0.0, 0.22, vUv.y) * (1.0 - smoothstep(0.4, 1.0, vUv.y));
  float h = 1.0 - abs(vUv.x - 0.5) * 2.0;
  h *= h;
  float a = v * h * mix(0.04, 0.2, uNight);
  gl_FragColor = vec4(uColor * a, a);
}
