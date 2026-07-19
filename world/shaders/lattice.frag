// Hyper-holo-grid lattice of selves (actuality mirror room). Each copy of the
// live-rendered figure gets scanlines, its own flicker (aPhase), and a rare
// per-copy dropout; uSurge (0→1 over the ten-second finale) speeds the
// scanlines, raises the dropout rate, and lifts the whole lattice toward the
// bloom threshold so the loop lands on a crescendo.
uniform sampler2D uMap;
uniform float uTime;
uniform float uSurge;
varying vec2 vUv;
varying float vPhase;
varying vec3 vTint;

float hash(float n) { return fract(sin(n) * 43758.5453); }

void main() {
  vec4 tex = texture2D(uMap, vUv);
  float scan = 0.85 + 0.15 * sin(vUv.y * 160.0 + uTime * (2.0 + uSurge * 8.0) + vPhase * 6.28);
  float flick = 0.92 + 0.08 * sin(uTime * (5.0 + vPhase * 4.0) + vPhase * 40.0);
  float slot = floor(uTime * (1.2 + uSurge * 2.5) + vPhase * 17.0);
  float drop = step(0.94 - uSurge * 0.06, hash(slot + vPhase * 91.0));
  float fade = smoothstep(0.0, 0.12, vUv.y)
             * smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
  gl_FragColor = vec4(tex.rgb * vTint * scan * flick * (1.0 + uSurge * 0.6),
                      tex.a * fade * (1.0 - drop * 0.85));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
