// Procedural per-cell window grid. Each window decides independently
// whether it is lit, and slowly re-rolls that decision over time so lights
// wink on and off across the skyline. Density and brightness ride uNight:
// sparse dim windows by day, a dense glowing grid at night (bright enough
// to feed the bloom pass).
uniform float uTime;
uniform float uNight;  // 0 = full day, 1 = full night
uniform vec3 uWarm;    // lit-window colour
uniform vec3 uFacade;  // dark facade between windows

varying vec2 vCell;
varying float vSeed;
varying float vFace;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + vSeed * 61.7) * 43758.5453);
}

void main() {
  vec2 id = floor(vCell);
  vec2 f = fract(vCell);
  // window pane inset within its cell (mullions stay dark)
  float pane = step(0.15, f.x) * step(f.x, 0.85) * step(0.2, f.y) * step(f.y, 0.8);
  float n = hash(id);
  // slow per-window churn: each window re-rolls on its own clock
  float roll = hash(id + floor(uTime * 0.25 + n * 8.0));
  float onFrac = mix(0.06, 0.62, uNight);
  float lit = step(roll, onFrac) * pane * vFace;
  float warmth = 0.75 + 0.5 * hash(id + 7.0);
  // Anti-shimmer: once cells shrink toward a pixel, fade the discrete grid
  // into its statistical average glow (procedural texture can't mipmap).
  float density = max(fwidth(vCell.x), fwidth(vCell.y));
  float detail = clamp(2.0 - density * 3.0, 0.0, 1.0);
  float glow = mix(onFrac * 0.35 * vFace, lit * warmth, detail);
  vec3 col = uFacade + uWarm * glow * mix(0.35, 1.6, uNight);
  gl_FragColor = vec4(col, 1.0);
}
