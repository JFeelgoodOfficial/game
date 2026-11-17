// The megaworld's surface (world/megaworld.js). Machine city from the eye to
// the horizon: districts, blocks and plating at three scales, trenches, green
// light, and under every caged star a cleared plate, a pool of its light and
// the conduits that run to its neighbours.
//
// Nothing here reads an absolute coordinate. Each pattern scale is handed the
// camera's place wrapped to that pattern's own period (computed in doubles,
// src/farside.js), and every hash is taken on cell ids wrapped to the same
// period, so fp32 never has to hold more than a few hundred thousand and the
// pattern does not jump when the wrap rolls over.
//
// CAGE_GLSL (world/megaworld.js) is prepended: uS and cage().

varying vec2 vP;
varying float vD;

uniform vec2 uOffPlate;
uniform vec2 uOffBlock;
uniform vec2 uOffDistrict;
uniform vec2 uOffCage;
uniform float uPlate;
uniform float uBlock;
uniform float uDistrict;
uniform float uPad; // radius of the plate a cage stands on
uniform float uTime;
uniform float uHdr;
uniform float uStarHdr;
uniform float uHorizon; // distance to the horizon from the camera's height
uniform float uFade; // 0..1, the whole world fading up
uniform vec3 uHaze;

float h21(vec2 c) {
  c = mod(c, 1024.0);
  vec3 p3 = fract(vec3(c.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// A grid of cells: x = this cell's random, y = how near an edge (1 on it),
// z = how much of the pattern survives at this range (0 once a cell is under
// a pixel across, so it fades out instead of shimmering).
vec3 grid(vec2 uv, float line) {
  vec2 f = fract(uv);
  float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  float w = max(fwidth(uv.x), fwidth(uv.y));
  float edge = 1.0 - smoothstep(line, line + w * 1.5 + 0.001, e);
  return vec3(h21(floor(uv)), edge, 1.0 - smoothstep(0.12, 0.55, w));
}

// distance from p to the segment a-b, and how far along it (0..1)
vec2 seg(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return vec2(length(p - a - ab * t), t);
}

// A conduit from this cell's cage to a neighbour's: a hot core, a wide halo,
// and light running along it.
float conduit(vec2 p, vec3 a, vec3 b, float px) {
  vec2 s = seg(p, a.xy, b.xy);
  float len = distance(a.xy, b.xy);
  // it leaves each cage at the edge of its plate
  float ends = smoothstep(uPad * 0.82, uPad, s.y * len) * smoothstep(uPad * 0.82, uPad, (1.0 - s.y) * len);
  float core = 1.0 - smoothstep(70.0, 70.0 + px * 1.5 + 30.0, s.x);
  // a line thinner than a pixel keeps its light instead of flickering
  core *= min(140.0 / max(px, 140.0) * 2.0, 1.0);
  float halo = exp(-s.x / 520.0) * 0.10;
  float run = 0.65 + 0.35 * sin(s.y * len * 0.0021 - uTime * 2.4);
  return (core * run + halo) * ends * a.z * b.z;
}

void main() {
  vec3 dist3 = grid((vP + uOffDistrict) / uDistrict, 0.035);
  vec3 blk = grid((vP + uOffBlock) / uBlock, 0.07);
  vec3 plt = grid((vP + uOffPlate) / uPlate, 0.06);

  // --- the hull: dark plate, each scale shading the one above it ---
  vec3 col = vec3(0.022, 0.026, 0.030);
  col *= 0.55 + 0.9 * dist3.x;
  col *= mix(1.0, 0.5 + 1.0 * blk.x, blk.z);
  col *= mix(1.0, 0.75 + 0.5 * plt.x, plt.z);
  // trenches between blocks and between plates; the wide ones between districts
  col *= 1.0 - 0.8 * blk.y * blk.z;
  col *= 1.0 - 0.5 * plt.y * plt.z;
  col *= 1.0 - 0.9 * dist3.y * dist3.z;

  // --- its own light: sparse, so the dark stays dark ---
  vec3 green = vec3(0.16, 1.0, 0.48), cyan = vec3(0.28, 0.72, 1.0);
  // windows: a few plates in the lit blocks, breathing
  float lit = step(0.93, plt.x) * step(0.55, blk.x) * plt.z * (1.0 - plt.y);
  vec3 wcol = mix(green, cyan, step(0.975, plt.x));
  col += wcol * lit * uHdr * 0.7 * (0.55 + 0.45 * sin(uTime * 1.1 + plt.x * 60.0));
  // one block in a dozen is lit along its roof line
  col += green * step(0.92, blk.x) * blk.y * blk.z * uHdr * 0.22;
  // one district in three has light in its trench
  col += green * step(0.66, dist3.x) * dist3.y * dist3.z * dist3.z * uHdr * 0.2 * (0.6 + 0.4 * sin(uTime * 0.7 + dist3.x * 40.0));
  // beyond where a plate can be seen, the lit ones still add up to a faint glow
  col += green * (1.0 - plt.z) * (0.004 + 0.012 * blk.x * blk.z + 0.006 * dist3.x * dist3.z);

  // --- the caged stars ---
  vec2 L = vP + uOffCage;
  vec2 cell = floor(L / uS);
  vec3 own = cage(cell);
  float px = max(fwidth(L.x), fwidth(L.y));
  // the plate the cage stands on
  float cd = distance(L, own.xy);
  float pad = (1.0 - smoothstep(uPad - 60.0, uPad + 60.0 + px, cd)) * own.z;
  float rings = 0.5 + 0.5 * sin(cd * 0.0105);
  vec3 padCol = vec3(0.05, 0.047, 0.044) * (0.7 + 0.5 * step(0.5, rings));
  col = mix(col, padCol, pad);
  float rim = (1.0 - smoothstep(0.0, 90.0 + px, abs(cd - uPad))) * own.z;
  col += green * rim * uHdr * 0.22;
  // the star's light on everything round it: the hull lit warm, falling off
  // with distance and gone at a quarter of the way to the next star
  vec3 warm = vec3(1.0, 0.56, 0.20);
  float pool = max(1.0 - cd / (uS * 0.25), 0.0);
  float lightK = pool * pool / (1.0 + cd * cd / 3.0e7);
  col += (col * 70.0 + 0.012) * warm * lightK * own.z;
  // conduits to and from the four neighbours
  float c = conduit(L, own, cage(cell + vec2(1.0, 0.0)), px)
          + conduit(L, cage(cell - vec2(1.0, 0.0)), own, px)
          + conduit(L, own, cage(cell + vec2(0.0, 1.0)), px)
          + conduit(L, cage(cell - vec2(0.0, 1.0)), own, px);
  col += green * c * uHdr * 0.9 * (1.0 - pad);

  // --- the distance: haze, and a lit line where the world ends ---
  float fr = clamp(vD / uHorizon, 0.0, 1.0);
  float haze = smoothstep(0.10, 0.92, fr);
  vec3 hz = uHaze * (0.7 + 1.6 * smoothstep(0.6, 1.0, fr));
  col = mix(col, hz, haze * 0.94);

  gl_FragColor = vec4(col * uFade, 1.0);
}
