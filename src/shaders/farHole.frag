// The black hole over the megaworld (world/farhole.js): everything about it
// that gives light, on one camera-facing quad, additive. The shadow itself is
// a separate black disc behind this.
//
// q is in shadow radii from the centre. Four things are drawn:
//   the disc     an inclined annulus of fire, canted a little from level, in
//                differential rotation: torn lanes, white-hot at the inner
//                edge, then orange, then ember-red trailing out. Its far half
//                is hidden where it passes behind the shadow; its near half
//                crosses in front.
//   the ring     the disc's far side as gravity shows it: a thick band of the
//                same fire wrapped right round the shadow, widest over the top
//   the edge     the photon ring, a hard thin line on the shadow itself
//   the veil     a faint ember glow the rest sits in
//
// The palette is the point as much as the look. Bloom takes whatever is
// brighter than its threshold in luminance, and a ring this size, blooming,
// fogs the shadow grey. Saturated orange at full strength is well under that
// threshold; only the thin white-hot streaks are over it. The shadow stays
// black.

varying vec2 vUv;

uniform float uTime;
uniform float uHdr;
uniform float uDisc; // outer reach of the disc, shadow radii
uniform float uTilt; // inclination from face-on, rad
uniform float uRoll; // cant from level, rad
uniform float uExtent; // half-width of the quad, shadow radii
uniform float uFade;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

// k 0..1 outward, e 0..1 how hot this streak is: white-gold only in the
// hottest streaks nearest the hole, orange for the body, ember beyond
vec3 fire(float k, float e) {
  vec3 white = vec3(1.0, 0.90, 0.66);
  vec3 orange = vec3(1.0, 0.46, 0.09);
  vec3 ember = vec3(0.62, 0.13, 0.02);
  vec3 c = mix(orange, ember, smoothstep(0.25, 0.9, k));
  return mix(c, white, smoothstep(0.62, 0.95, e) * (1.0 - smoothstep(0.0, 0.5, k)));
}

// Torn concentric lanes at radius r and angle a: fine across the gas, slow
// along it, and pushed about by a coarser turbulence so they braid.
float lanes(float r, float a) {
  float warp = vnoise(vec2(a * 2.2, r * 2.6)) - 0.5;
  r += warp * 0.22;
  a += (vnoise(vec2(r * 3.0, a * 1.3 + 9.0)) - 0.5) * 0.5;
  float n = vnoise(vec2(r * 15.0, a * 1.2)) + 0.6 * vnoise(vec2(r * 41.0, a * 2.4 + 3.0))
          + 0.55 * vnoise(vec2(r * 6.0, a * 0.8 - 1.0)) + 0.25 * vnoise(vec2(r * 95.0, a * 3.3));
  return n / 2.4;
}

void main() {
  vec2 q = (vUv * 2.0 - 1.0) * uExtent;
  float cr = cos(uRoll), sr = sin(uRoll);
  q = vec2(cr * q.x + sr * q.y, -sr * q.x + cr * q.y);
  float rs = length(q);
  float ci = cos(uTilt);
  float inner = 1.15;

  // --- the disc ---
  vec2 d = vec2(q.x, q.y / ci);
  float r = length(d);
  float a = atan(d.y, d.x);
  float spin = uTime * 0.2 / pow(max(r, 0.8), 1.5);
  float k = (r - inner) / (uDisc - inner);
  vec3 disc = vec3(0.0);
  if (k > 0.0 && k < 1.0) {
    float ln = lanes(r, a + spin);
    // a bright body that falls away, and ragged fire trailing far beyond it
    float body = exp(-k * 2.9) * (0.4 + 1.6 * pow(ln, 1.3));
    float trail = exp(-k * 1.2) * pow(ln, 2.4) * 1.7 * (0.5 + 0.5 * vnoise(vec2(a * 2.3 + spin, r * 0.9)));
    float dens = (body + trail) * smoothstep(0.0, 0.03, k) * (1.0 - smoothstep(0.8, 1.0, k));
    // the side coming toward the eye is the brighter
    dens *= 1.0 - 0.4 * cos(a);
    // the far half (q.y > 0) goes behind the shadow and its ring
    float hidden = q.y > 0.0 ? 1.0 - smoothstep(1.0, 1.5, rs) : 0.0;
    disc = fire(k, ln * (1.0 - 0.35 * cos(a))) * min(dens, 1.4) * (1.0 - hidden);
  }

  // --- the ring: the far side, lensed right round the shadow ---
  float up = q.y / max(rs, 1e-4);
  float width = mix(0.28, 0.56, smoothstep(-0.5, 1.0, up));
  float p = (rs - 1.0) / width;
  vec3 ring = vec3(0.0);
  if (p > 0.0 && p < 1.0) {
    float ang = atan(q.y, q.x);
    float ln = lanes(1.2 + p * 1.5, ang * 1.5 + spin * 1.8);
    float dens = smoothstep(0.0, 0.05, p) * pow(1.0 - p, 1.1) * (0.5 + 1.1 * pow(ln, 1.3));
    dens *= mix(0.75, 1.1, smoothstep(-0.7, 0.7, up)) * (1.0 - 0.25 * cos(ang));
    ring = fire(p * 0.6, ln * 1.05) * min(dens, 1.2);
  }

  // --- the edge ---
  float edge = exp(-pow((rs - 1.012) / 0.013, 2.0));
  vec3 photon = vec3(1.0, 0.72, 0.36) * edge * 0.9;

  // --- the veil ---
  float veil = exp(-max(rs - 1.0, 0.0) * 0.75) * 0.05 * smoothstep(1.0, 1.4, rs);
  vec3 glow = vec3(1.0, 0.36, 0.08) * veil;

  vec3 col = (disc + ring + photon) * uHdr + glow;
  // nothing reaches the quad's edge
  col *= 1.0 - smoothstep(0.84, 1.0, max(abs(vUv.x * 2.0 - 1.0), abs(vUv.y * 2.0 - 1.0)));
  gl_FragColor = vec4(col * uFade, 1.0);
}
