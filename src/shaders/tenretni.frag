// Tenretni, the machine world (src/tenretni.js). One unit sphere, no texture:
// the hull is plated procedurally on a cube projection (so the plates are
// square everywhere, with no pinch at the poles) in three nested scales,
// trenches between them, and a scatter of green windows that carry the HDR.
// The mesh itself never rotates — uSpin turns the pattern instead, so the
// clip plane that hides the part still inside the wormhole stays put.

varying vec3 vObj;
varying vec3 vWorldNormal;
varying vec3 vView;

uniform vec3 uSun; // world
uniform float uTime;
uniform float uSpin; // rad about y
uniform float uClip; // object-space z past which the hull is still in transit
uniform float uHdr;
uniform float uWake; // 0..1 window brightness

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// plates at one scale: x = plate shade, y = trench (1 in the gap), z = id
vec3 plates(vec2 uv, float n, float seed) {
  vec2 g = uv * n;
  vec2 id = floor(g);
  // merge some neighbours into 2x1 slabs so the grid does not read as a grid
  float h = hash(id + seed);
  if (h > 0.6) { id.x = floor(id.x * 0.5) * 2.0; g.x = (g.x - id.x) * 0.5 + id.x; }
  vec2 f = fract(g);
  float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  float idh = hash(id * 1.7 + seed * 3.1);
  return vec3(idh, 1.0 - smoothstep(0.0, 0.06, e), idh);
}

void main() {
  if (vObj.z > uClip) discard;

  vec3 p = normalize(vObj);
  float c = cos(uSpin), s = sin(uSpin);
  p = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);

  // cube projection
  vec3 ap = abs(p);
  vec2 uv;
  float face;
  if (ap.x >= ap.y && ap.x >= ap.z) { uv = p.yz / ap.x; face = p.x > 0.0 ? 0.0 : 1.0; }
  else if (ap.y >= ap.z) { uv = p.xz / ap.y; face = p.y > 0.0 ? 2.0 : 3.0; }
  else { uv = p.xy / ap.z; face = p.z > 0.0 ? 4.0 : 5.0; }
  uv = uv * 0.5 + 0.5;

  vec3 big = plates(uv, 5.0, face * 7.0);
  vec3 mid = plates(uv, 17.0, face * 13.0 + big.z * 9.0);
  vec3 fine = plates(uv, 61.0, face * 3.0 + mid.z * 5.0);

  float shade = 0.07 + 0.12 * big.x + 0.09 * mid.x + 0.05 * fine.x;
  float trench = max(big.y, max(mid.y * 0.8, fine.y * 0.45));
  vec3 base = vec3(shade * 0.92, shade, shade * 0.96) * (1.0 - 0.85 * trench);
  // sunk plates: a few mid-scale cells sit lower and darker
  base *= mid.x < 0.22 ? 0.45 : 1.0;

  vec3 N = normalize(vWorldNormal), S = normalize(uSun), V = normalize(vView);
  float ndl = dot(N, S);
  float day = smoothstep(-0.1, 0.5, ndl);
  vec3 lit = base * (0.05 + 1.25 * day);
  // dull metal highlight on the sunward plates
  vec3 H = normalize(S + V);
  lit += vec3(0.5, 0.52, 0.5) * pow(max(dot(N, H), 0.0), 24.0) * day * (0.15 + 0.4 * mid.x);

  // windows: a fine lattice, lit cell by cell, denser on some plates
  vec2 wg = uv * 46.0;
  vec2 wid = floor(wg);
  vec2 wf = fract(wg);
  float wh = hash(wid + face * 31.0);
  float dense = 0.93 - 0.12 * step(0.6, mid.x);
  float on = step(dense, wh) * step(0.18, wf.x) * step(wf.x, 0.82) * step(0.25, wf.y) * step(wf.y, 0.75);
  float flick = 0.75 + 0.25 * sin(uTime * (1.0 + wh * 3.0) + wh * 40.0);
  vec3 wcol = mix(vec3(0.15, 1.0, 0.45), vec3(0.75, 1.0, 0.85), step(0.97, wh));
  // trench glow: the big seams leak the same green
  float seam = big.y * (0.05 + 0.04 * sin(uTime * 0.7 + uv.x * 20.0));
  lit += wcol * (on * flick * 0.6 + seam) * uWake * uHdr * (1.0 - trench * 0.6 * (1.0 - big.y));

  // a faint green limb so the night side keeps its outline against the sky
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  lit += vec3(0.02, 0.12, 0.06) * fres * uWake;

  gl_FragColor = vec4(lit, 1.0);
}
