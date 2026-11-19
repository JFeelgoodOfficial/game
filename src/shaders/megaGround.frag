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
// CAGE_GLSL (world/megaworld.js) is prepended: uS and cage(). So is
// `#define DETAIL` above the low tier: the circuit traces and the relief
// shading, the two things here that are look and not structure.

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
uniform float uAged; // a thousand years on: the conduits are every colour, and there are far more of them
// A million years on (src/era.js, GDD 5.7.5). The Tenretni let go: the stars
// were released and are long gone, so the world is lit by whatever lights it
// now (uDayCol, uDayK); there are seas where the land lies low, growth over
// the plating, cloud shadow, and most of the conduits are dark.
uniform float uEra;
uniform float uRite; // the yearly rite: the empty cages lit again, 0..1
uniform vec3 uDayCol;
uniform float uDayK;

float h21(vec2 c) {
  c = mod(c, 1024.0);
  vec3 p3 = fract(vec3(c.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Smooth noise on a lattice that repeats every `n` cells, so it wraps exactly
// where the pattern it is laid over does.
float lnoise(vec2 uv, float n) {
  vec2 i = floor(uv), f = fract(uv);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(mod(i, n)), h21(mod(i + vec2(1.0, 0.0), n)), f.x),
             mix(h21(mod(i + vec2(0.0, 1.0), n)), h21(mod(i + vec2(1.0, 1.0), n)), f.x), f.y);
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

// the colours the old world runs on: cyan, green, violet, gold
vec3 pal(float h) {
  return h < 0.25 ? vec3(0.22, 0.85, 1.0) : h < 0.5 ? vec3(0.28, 1.0, 0.5) : h < 0.75 ? vec3(0.72, 0.42, 1.0) : vec3(1.0, 0.74, 0.24);
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

  vec3 green = vec3(0.16, 1.0, 0.48), cyan = vec3(0.28, 0.72, 1.0), amber = vec3(1.0, 0.62, 0.20);
#ifdef DETAIL
  // --- relief: a block is a building. One flank catches the light from the
  // hole, the other is in its own shade, the more the taller it is ---
  vec2 fb = fract((vP + uOffBlock) / uBlock);
  float tall = blk.x * blk.x;
  col *= 1.0 + blk.z * tall * (0.9 * (1.0 - smoothstep(0.07, 0.2, fb.x)) - 0.55 * smoothstep(0.8, 0.93, fb.x)
                              + 0.5 * (1.0 - smoothstep(0.07, 0.2, fb.y)) - 0.35 * smoothstep(0.8, 0.93, fb.y));
  // --- circuit traces: each half-block carries one run, across or along,
  // and a few of them are live ---
  vec2 tuv = (vP + uOffBlock) / (uBlock * 0.5);
  vec2 tc = floor(tuv), tf = fract(tuv);
  float th = h21(tc + 71.0);
  float along = th < 0.5 ? tf.y : tf.x;
  float tw = max(fwidth(tuv.x), fwidth(tuv.y));
  float trace = (1.0 - smoothstep(0.035, 0.035 + tw * 1.5, abs(along - 0.5))) * (1.0 - smoothstep(0.1, 0.45, tw));
  float live = step(0.80, h21(tc + 13.0));
  vec3 tcol = mix(amber, cyan, step(0.6, h21(tc + 29.0)));
  col = mix(col, col * 1.9 + 0.006, trace * (1.0 - live));
  // (a million years on almost none are live, and daylight is about to be laid over this)
  col += tcol * trace * live * uHdr * 0.5 * (0.7 + 0.3 * sin(uTime * 2.0 + th * 40.0 + (th < 0.5 ? tuv.x : tuv.y) * 3.0)) * (1.0 - 0.995 * uEra);
#endif
  // --- a million years on: the plating is ground now ---
  float dim = 1.0 - 0.94 * uEra; // what is left of the world's own light
  if (uEra > 0.0) {
    vec2 du = (vP + uOffDistrict) / uDistrict;
    // where it lies low there is sea: coasts a few districts across
    float low = lnoise(du / 4.0, 256.0) * 0.65 + lnoise(du + 40.0, 1024.0) * 0.35;
    float sea = 1.0 - smoothstep(0.43, 0.455, low);
    float shore = (1.0 - smoothstep(0.455, 0.5, low)) * (1.0 - sea);
    // growth: thick in places, and thicker on the low blocks than the tall ones
    float growth = smoothstep(0.3, 0.7, lnoise(du * 2.0 + 90.0, 1024.0) * 0.6 + (1.0 - blk.x) * 0.4);
    vec3 moss = vec3(0.03, 0.075, 0.028) * (0.55 + 0.9 * blk.x) * mix(1.0, 0.6 + 0.8 * plt.x, plt.z);
    vec3 land = mix(col, moss, growth * 0.86);
    land = mix(land, vec3(0.085, 0.075, 0.05), shore * 0.7); // silt, along the water
    vec3 tint = mix(vec3(1.0), uDayCol, 0.55);
    land *= (1.0 + 9.0 * uDayK) * tint;
    // water: dark close to, and the colour of the light a long way off
    float far = smoothstep(0.05, 0.9, clamp(vD / uHorizon, 0.0, 1.0));
    vec3 water = (vec3(0.006, 0.02, 0.028) * (1.0 + 5.0 * uDayK) + uDayCol * uDayK * 0.16 * far) * (0.9 + 0.2 * blk.x * blk.z);
    // (what still glows under it shows through, a little)
    water += vec3(0.02, 0.2, 0.16) * step(0.9, blk.x) * blk.z * 0.05;
    vec3 now = mix(land, water, sea);
#ifdef DETAIL
    // weather: cloud shadow going over, slowly
    float cl = lnoise(du / 2.0 + vec2(uTime * 0.006, uTime * 0.0035), 512.0);
    now *= 0.55 + 0.45 * smoothstep(0.35, 0.62, cl);
#endif
    col = mix(col, now, uEra);
    dim *= 1.0 - 0.9 * sea * uEra; // (nothing is lit out on the water)
  }
  // the hole's own light, from overhead: faint, the colour of its fire
  col += col * vec3(0.9, 0.42, 0.16) * 0.4;

  // --- its own light: sparse, so the dark stays dark ---
  // windows: a few plates in the lit blocks, breathing; amber in some districts
  float lit = step(0.93, plt.x) * step(0.55, blk.x) * plt.z * (1.0 - plt.y);
  vec3 wcol = mix(mix(green, amber, step(0.55, dist3.x)), cyan, step(0.975, plt.x));
  col += wcol * lit * uHdr * 0.7 * (0.55 + 0.45 * sin(uTime * 1.1 + plt.x * 60.0)) * dim;
  // one block in a dozen is lit along its roof line
  col += green * step(0.94, blk.x) * blk.y * blk.z * uHdr * 0.09 * dim;
  // one district in three has light in its trench
  col += green * step(0.66, dist3.x) * dist3.y * dist3.z * dist3.z * uHdr * 0.07 * (0.6 + 0.4 * sin(uTime * 0.7 + dist3.x * 40.0)) * dim;
  // beyond where a plate can be seen, the lit ones still add up to a faint
  // glow: a block's worth while blocks can be told apart, then a district's
  vec3 farCol = mix(green, amber, step(0.55, dist3.x));
  col += farCol * (1.0 - plt.z) * (0.004 + 0.030 * step(0.55, blk.x) * blk.x * blk.z + 0.010 * dist3.x * dist3.z) * dim;

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
  // (a million years on the plate is overgrown like the rest, and lit by the same day)
  padCol = mix(padCol, vec3(0.03, 0.07, 0.03) * (0.7 + 0.5 * step(0.5, rings)) * (1.0 + 9.0 * uDayK) * mix(vec3(1.0), uDayCol, 0.55), uEra);
  col = mix(col, padCol, pad);
  float rim = (1.0 - smoothstep(0.0, 90.0 + px, abs(cd - uPad))) * own.z;
  // a row of fire-coloured lamps round its edge
  float lamps = step(0.5, fract(atan(L.y - own.y, L.x - own.x) * 28.0 / 6.2832));
  // (dark now, except in the rite, when every lamp round every cage is lit)
  col += vec3(1.0, 0.50, 0.14) * rim * lamps * uHdr * 0.7 * mix(1.0, uRite, uEra);
  // the star's light on everything round it: the hull lit warm, falling off
  // with distance and gone at a quarter of the way to the next star
  vec3 warm = vec3(1.0, 0.56, 0.20);
  float pool = max(1.0 - cd / (uS * 0.25), 0.0);
  float lightK = pool * pool / (1.0 + cd * cd / 3.0e7);
  // (no star, no pool of its light: except in the rite)
  col += (col * mix(110.0, 9.0, uEra) + 0.02) * warm * lightK * own.z * mix(1.0, uRite, uEra);
  // conduits to and from the four neighbours
  vec3 fire = vec3(1.0, 0.42, 0.10);
  float cE = conduit(L, own, cage(cell + vec2(1.0, 0.0)), px);
  float cW = conduit(L, cage(cell - vec2(1.0, 0.0)), own, px);
  float cN = conduit(L, own, cage(cell + vec2(0.0, 1.0)), px);
  float cS = conduit(L, cage(cell - vec2(0.0, 1.0)), own, px);
  vec3 lines = mix(fire, pal(h21(cell + 3.0)), uAged) * cE + mix(fire, pal(h21(cell - vec2(1.0, 0.0) + 3.0)), uAged) * cW
             + mix(fire, pal(h21(cell + 57.0)), uAged) * cN + mix(fire, pal(h21(cell - vec2(0.0, 1.0) + 57.0)), uAged) * cS;
  if (uAged > 0.0) {
    // a thousand years on: every star is tied to every star round it, the
    // plates have rings of light let into the hull about them, and the
    // trenches between districts carry light of their own
    lines += uAged * (pal(h21(cell + 91.0)) * conduit(L, own, cage(cell + vec2(1.0, 1.0)), px)
                    + pal(h21(cell - vec2(1.0, 1.0) + 91.0)) * conduit(L, cage(cell - vec2(1.0, 1.0)), own, px)
                    + pal(h21(cell + 133.0)) * conduit(L, own, cage(cell + vec2(1.0, -1.0)), px)
                    + pal(h21(cell - vec2(1.0, -1.0) + 133.0)) * conduit(L, cage(cell - vec2(1.0, -1.0)), own, px));
    float halo = (1.0 - smoothstep(0.0, 80.0 + px, abs(cd - uPad * 1.5))) + (1.0 - smoothstep(0.0, 60.0 + px, abs(cd - uPad * 2.1)))
               + 0.6 * (1.0 - smoothstep(0.0, 50.0 + px, abs(cd - uPad * 2.9)));
    col += pal(h21(cell + 7.0)) * halo * own.z * uAged * uHdr * 0.55 * (0.7 + 0.3 * sin(uTime * 1.3 + cd * 0.002)) * dim;
    col += pal(fract(dist3.x * 7.0)) * dist3.y * dist3.z * uAged * uHdr * 0.32 * (0.65 + 0.35 * sin(uTime * 0.9 + dist3.x * 30.0)) * dim;
  }
  // a million years on most of them are dark: one cage in six still feeds a few threads
  lines *= mix(1.0, 0.03 + 0.97 * step(0.83, h21(cell + 201.0)), uEra);
  col += lines * uHdr * mix(0.34, 0.85, uAged) * (1.0 - pad);

  // --- the distance: haze, and a lit line where the world ends ---
  float fr = clamp(vD / uHorizon, 0.0, 1.0);
  float haze = smoothstep(0.10, 0.92, fr);
  vec3 hz = uHaze * (0.7 + 1.6 * smoothstep(0.6, 1.0, fr));
  // ...and it has air now: a blue line where the world ends
  hz = mix(hz, vec3(0.05, 0.16, 0.36) * (0.5 + 3.0 * smoothstep(0.7, 1.0, fr)), uAged);
  // ...and weather: the distance goes to the colour of the day
  hz = mix(hz, mix(vec3(0.07, 0.13, 0.22), uDayCol * 0.5, 0.45) * (0.25 + uDayK) * (0.6 + 1.4 * smoothstep(0.6, 1.0, fr)), uEra);
  col = mix(col, hz, haze * 0.94);

  gl_FragColor = vec4(col * uFade, 1.0);
}
