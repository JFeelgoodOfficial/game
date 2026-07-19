// Zone 2 soul-gems (actuality). View-angle fresnel rim over a soft inner
// glow; uHeart (the room's lub-dub) drives both, and the rim crosses the
// bloom threshold only at the heartbeat peak. Additive, so darker = fainter.
uniform vec3 uColor;
uniform float uHeart;
varying vec3 vN;
varying vec3 vV;

void main() {
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  vec3 col = uColor * (0.18 + uHeart * 0.25 + fres * (0.7 + uHeart * 0.6));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
