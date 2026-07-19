// Zone 9 black box — the city far below (actuality). One plane replaces the
// old two stacked planes: the same aerial-city texture sampled twice, the deep
// layer zoomed + dimmed so it shows through darker districts (parallax depth),
// with a slow bounded cloud drift and a faint heat shimmer. All offsets are
// sin-bounded — the texture is not tileable, so UVs must never wrap.
uniform sampler2D uMap;
uniform float uTime;
varying vec2 vUv;

void main() {
  vec2 wob = vec2(sin(vUv.y * 40.0 + uTime * 1.2),
                  cos(vUv.x * 40.0 + uTime * 1.1)) * 0.0025;   // heat shimmer
  vec2 uvA = vUv + wob + vec2(sin(uTime * 0.020), cos(uTime * 0.017)) * 0.006;
  vec2 uvB = (vUv - 0.5) * 0.55 + 0.5 + wob * 0.5
           + vec2(sin(uTime * 0.05), cos(uTime * 0.045)) * 0.01; // deep layer, counter-drift
  vec3 a = texture2D(uMap, uvA).rgb;
  vec3 b = texture2D(uMap, uvB).rgb * 0.45;
  vec3 col = a + b * (1.0 - smoothstep(0.25, 0.8, dot(a, vec3(0.333))));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
