// Rocky-planet terrain height on the CPU (Phase 5 slice). An exact port of
// the GLSL hash/vnoise/fbm/ridged/elevation chain in surface.vert (vertex
// displacement) and surface.frag (colour), so the altitude floor can follow
// the ground on every terra-type planet. JS doubles vs GPU fp32 drift a
// little; the floor's MIN_ALTITUDE margin absorbs it.

function fract(x) {
  return x - Math.floor(x);
}

function hash(px, py, pz) {
  px = fract(px * 0.3183099 + 0.1) * 17;
  py = fract(py * 0.3183099 + 0.1) * 17;
  pz = fract(pz * 0.3183099 + 0.1) * 17;
  return fract(px * py * pz * (px + py + pz));
}

function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const c000 = hash(ix, iy, iz), c100 = hash(ix + 1, iy, iz);
  const c010 = hash(ix, iy + 1, iz), c110 = hash(ix + 1, iy + 1, iz);
  const c001 = hash(ix, iy, iz + 1), c101 = hash(ix + 1, iy, iz + 1);
  const c011 = hash(ix, iy + 1, iz + 1), c111 = hash(ix + 1, iy + 1, iz + 1);
  return (
    (c000 * (1 - fx) + c100 * fx) * (1 - fy) * (1 - fz) +
    (c010 * (1 - fx) + c110 * fx) * fy * (1 - fz) +
    (c001 * (1 - fx) + c101 * fx) * (1 - fy) * fz +
    (c011 * (1 - fx) + c111 * fx) * fy * fz
  );
}

function fbm(x, y, z, oct) {
  let v = 0, a = 0.5;
  for (let i = 0; i < oct; i++) {
    v += a * vnoise(x, y, z);
    x *= 2.03; y *= 2.03; z *= 2.03;
    a *= 0.5;
  }
  return v;
}

function ridged(x, y, z, oct) {
  let v = 0, a = 0.5;
  for (let i = 0; i < oct; i++) {
    v += a * (1 - Math.abs(2 * vnoise(x, y, z) - 1));
    x *= 2.11; y *= 2.11; z *= 2.11;
    a *= 0.5;
  }
  return v;
}

// Per-planet field shaping (mirrors uRidge/uRidgeFreq/uValley in the
// shaders). The defaults reproduce the original hard-coded field exactly:
// base*0.72 + ridged(p*3.5)*0.28*mask, no valley carving.
export const DEFAULT_SHAPE = { ridge: 0.28, ridgeFreq: 3.5, valley: 0 };

// Mirrors surface.frag/vert elevation() exactly.
export function elevationAt(px, py, pz, shape) {
  const s = shape || DEFAULT_SHAPE;
  const wx = fbm(px * 1.3 + 4.1, py * 1.3 + 4.1, pz * 1.3 + 4.1, 3);
  const wy = fbm(px * 1.3 + 8.7, py * 1.3 + 8.7, pz * 1.3 + 8.7, 3);
  const wz = fbm(px * 1.3 + 1.9, py * 1.3 + 1.9, pz * 1.3 + 1.9, 3);
  const base = fbm(px * 1.8 + wx * 0.6, py * 1.8 + wy * 0.6, pz * 1.8 + wz * 0.6, 6);
  const t = (base - 0.5) / 0.12;
  const mask = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); // smoothstep(0.5,0.62,base)
  const f = s.ridgeFreq;
  let e = base * (1 - s.ridge) + ridged(px * f, py * f, pz * f, 4) * s.ridge * mask;
  if (s.valley > 0) {
    // Ridged-inverse drainage lines carved only out of mid-high ground.
    // Octave count fixed at 3 on CPU and GPU alike — never tied to the LOD.
    const tv = (base - 0.45) / 0.17;
    const mv = tv <= 0 ? 0 : tv >= 1 ? 1 : tv * tv * (3 - 2 * tv); // smoothstep(0.45,0.62,base)
    e -= s.valley * (1 - ridged(px * 2.2, py * 2.2, pz * 2.2, 3)) * mv;
  }
  return e;
}

// Ground height above the base sphere radius for a normalized direction in
// the planet's UNROTATED object space, with that planet's sea level and
// terrain amplitude. Callers undo the planet's spin first (see planet.js
// groundAt). With deepAmp > 0 (divable ocean worlds) the value goes SIGNED
// below sea level — a real seafloor; with deepAmp 0 it clamps at 0 exactly
// as before.
export function groundHeight(px, py, pz, seaLevel, amp, shape, deepAmp = 0) {
  const e = elevationAt(px, py, pz, shape) - seaLevel;
  return e > 0 ? e * amp : e * deepAmp;
}
