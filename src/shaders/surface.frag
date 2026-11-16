// Planet surface (Phase 3 + Phase 5 slice). Procedural continents from the
// same warped-fbm + ridged field the vertex shader displaces with,
// elevation-banded colour from a per-planet palette (GDD 5.7: variation is
// a palette and a threshold), ice caps, day/night terminator, and relief
// shading from a finite-difference perturbation of the normal.

varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

uniform vec3 uSun;
uniform float uSeaLevel;
uniform float uAmp;
uniform float uRadius;
uniform int uOct; // planet.js lowers octaves with distance (audit fix)
uniform float uRidge;    // ridged-mountain weight (default 0.28)
uniform float uRidgeFreq;// ridged-mountain frequency (default 3.5)
uniform float uValley;   // drainage-valley carving depth (default 0)
uniform float uIceLat;    // latitude where polar ice begins (>1 disables)
uniform vec3 uColDeep;    // deep water / lowest floor
uniform vec3 uColShallow; // shallow water / low basin
uniform vec3 uColSand;    // shoreline
uniform vec3 uColLow;     // lowlands
uniform vec3 uColMid;     // uplands / rock
uniform vec3 uColHigh;    // peaks
uniform vec3 uFogColor;   // custom fog (planetsky underwater grading)
uniform float uFogDensity;// 0 = off — raw ShaderMaterials can't read scene.fog
uniform float uSeabedDetail; // 1 on divable worlds: grain/relief run underwater too

uniform float uSeaGloss;
uniform vec3 uSkyColor;
uniform float uSeaGlint;
uniform vec4 uCity; // xyz: town direction in object space, w: 1 if this world has one
uniform float uCityHdr;
uniform float uCloudShadow;
uniform float uTime;
uniform float uCover;
// Tenretni (src/tenretni.js): the sea is gone. uDrain.xyz is where the tunnel
// struck (object space), w the progress 0..1; the dry front spreads from there.
uniform vec4 uDrain;
// ...and the city it leaves at the strike point: x = how much is built 0..1,
// y = cos of the city's angular radius.
uniform vec2 uTech;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
        mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
        mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p, int oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 7; i++) {
    if (i >= oct) break;
    v += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}
float ridged(vec3 p, int oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= oct) break;
    v += a * (1.0 - abs(2.0 * vnoise(p) - 1.0));
    p *= 2.11;
    a *= 0.5;
  }
  return v;
}
float elevation(vec3 p, int oct) {
  vec3 warp = vec3(fbm(p * 1.3 + 4.1, 3), fbm(p * 1.3 + 8.7, 3), fbm(p * 1.3 + 1.9, 3));
  float base = fbm(p * 1.8 + warp * 0.6, oct);
  float mask = smoothstep(0.5, 0.62, base);
  float e = base * (1.0 - uRidge) + ridged(p * uRidgeFreq, 4) * uRidge * mask;
  if (uValley > 0.0) {
    // must match surface.vert exactly — valley octaves fixed at 3, not uOct
    e -= uValley * (1.0 - ridged(p * 2.2, 3)) * smoothstep(0.45, 0.62, base);
  }
  return e;
}

void main() {
  vec3 p = normalize(vObjPos);
  float elev = elevation(p, uOct);
  float lat = abs(p.y);

  vec3 col;
  if (elev < uSeaLevel) {
    float d = elev / max(uSeaLevel, 1e-4);
    col = mix(uColDeep, uColShallow, d * d);
    if (uSeabedDetail > 0.5 && uOct >= 6) {
      // Divable seabed: the same detail grain the land gets, plus current-
      // combed sand ripples in the shallow band where a diver actually looks.
      float grain = fbm(p * 40.0, 3);
      col *= 0.9 + 0.2 * grain;
      float shallow = smoothstep(0.5, 0.95, d);
      float rip = sin((p.x * 0.62 + p.z * 0.78) * 900.0 + fbm(p * 26.0, 2) * 7.0);
      col *= 1.0 + rip * 0.07 * shallow;
    }
  } else {
    float e = (elev - uSeaLevel) / (1.0 - uSeaLevel);
    col = mix(uColSand, uColLow, smoothstep(0.02, 0.18, e));
    col = mix(col, uColMid, smoothstep(0.28, 0.58, e));
    col = mix(col, uColHigh, smoothstep(0.62, 0.84, e));
    // surface detail grain so slopes aren't airbrushed — sub-pixel at
    // distance, so it only runs at full detail level
    if (uOct >= 6) {
      float grain = fbm(p * 40.0, 3);
      col *= 0.88 + 0.24 * grain;
    }
  }
  // Drained world: sea floor and land alike bake to cracked tan. The front
  // leaves the strike point first and reaches the antipode as w hits 1.
  float dry = 0.0;
  if (uDrain.w > 0.0) {
    dry = clamp(uDrain.w * 3.0 - (1.0 - dot(p, uDrain.xyz)), 0.0, 1.0);
    float basin = smoothstep(uSeaLevel - 0.14, uSeaLevel + 0.1, elev);
    vec3 dust = mix(vec3(0.30, 0.21, 0.14), vec3(0.66, 0.52, 0.36), basin);
    dust = mix(dust, vec3(0.50, 0.40, 0.31), smoothstep(uSeaLevel + 0.12, uSeaLevel + 0.4, elev));
    dust *= 0.82 + 0.36 * fbm(p * 9.0, 3);
    // mud cracks: the thin zero-lines of two noise fields
    float c1 = abs(vnoise(p * 17.0) - 0.5), c2 = abs(vnoise(p * 41.0 + 3.7) - 0.5);
    float crack = (1.0 - smoothstep(0.0, 0.03, c1)) * 0.6 + (1.0 - smoothstep(0.0, 0.045, c2)) * 0.3;
    dust *= 1.0 - 0.7 * crack;
    col = mix(col, dust, dry);
  }
  // polar ice, ragged edge from the elevation noise
  col = mix(col, vec3(0.90, 0.94, 1.0),
            smoothstep(uIceLat, uIceLat + 0.21, lat + (elev - 0.5) * 0.15) * (1.0 - dry));

  vec3 N = normalize(vWorldNormal), S = normalize(uSun), V = normalize(vViewDir);

  // relief shading: perturb the sphere normal by the terrain gradient.
  // Audit fix: reconstructed from screen-space derivatives of the elevation
  // already computed above (surface-gradient bump mapping) instead of three
  // extra elevation() evaluations per pixel — ~4x fewer noise lookups on
  // every lit land fragment for the same visual relief.
  if (uAmp > 0.0 && (elev > uSeaLevel || uSeabedDetail > 0.5)) {
    vec3 dpx = dFdx(vObjPos);
    vec3 dpy = dFdy(vObjPos);
    vec3 r1 = cross(dpy, N);
    vec3 r2 = cross(N, dpx);
    float det = dot(dpx, r1);
    if (abs(det) > 1e-10) {
      vec3 grad = (r1 * dFdx(elev) + r2 * dFdy(elev)) / det;
      vec3 pert = grad * uAmp * 1.4;
      // soft-limit the slope so grazing angles don't sparkle
      pert *= 3.0 / max(3.0, length(pert));
      N = normalize(N - pert);
    }
  }

  float ndl = dot(N, S);
  float day = smoothstep(-0.12, 0.28, ndl);
  vec3 Ns = normalize(vWorldNormal); // the smooth sphere, without relief
  float muS = dot(Ns, S);
  // Sunlight that reaches the ground near the terminator has crossed a long
  // slant of air and arrives warm. (The limb glow itself is the air shell's.)
  vec3 sunCol = mix(vec3(1.0, 0.5, 0.24), vec3(1.0), smoothstep(-0.05, 0.42, muS));

  // Cloud shadows: the cloud layer's low octaves, re-evaluated at the ground.
  float shade = 1.0;
  if (uCloudShadow > 0.5) {
    float cd = fbm(p * 2.4 + vec3(uTime * 0.006, 0.0, uTime * 0.004), 3);
    float lo = mix(0.62, 0.4, uCover) - 0.06; // 3 of the layer's 5 octaves sum lower
    shade = 1.0 - 0.45 * smoothstep(lo, lo + 0.16, cd);
  }

  vec3 lit = col * (0.04 + 0.96 * day * shade * sunCol);

  bool sea = elev < uSeaLevel;
  // Open water seen from far out, where the sea mesh has faded away: a sky
  // reflection at grazing angles and the sun's glint, spread wide by distance.
  if (sea && uSeaGloss > 0.5) {
    float ndv = max(dot(Ns, V), 0.0);
    float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
    lit = mix(lit, uSkyColor * (0.05 + 0.95 * day), fres * 0.6 * (1.0 - dry));
    vec3 H = normalize(S + V);
    lit += vec3(1.0, 0.93, 0.78) * pow(max(dot(Ns, H), 0.0), 180.0) * day * uSeaGlint * 0.16 * sunCol * (1.0 - dry);
  }

  // The town's lights on the night side: a warm cluster broken into districts.
  if (uCity.w > 0.5 && !sea) {
    float near = smoothstep(0.975, 0.9985, dot(p, uCity.xyz)); // ~13 degrees out to the core
    if (near > 0.0) {
      float blocks = vnoise(p * 150.0) * vnoise(p * 61.0 + 7.3);
      float glow = near * near * (0.25 + 3.0 * blocks);
      lit += vec3(1.0, 0.72, 0.38) * glow * uCityHdr * (1.0 - smoothstep(-0.15, 0.1, muS)) * (1.0 - dry);
    }
  }

  // Tenretni's city: the ground under it plated dark, cut by lit streets that
  // run out from the middle and round it. Glows by day as well as by night.
  if (uTech.x > 0.0) {
    float cd = dot(p, uDrain.xyz);
    if (cd > uTech.y) {
      float rr = sqrt(max(1.0 - cd, 0.0) / max(1.0 - uTech.y, 1e-5)); // 0 centre .. 1 edge
      float built = smoothstep(rr * 0.9, rr * 0.9 + 0.12, uTech.x * 1.05);
      vec3 ax = abs(uDrain.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
      vec3 t1 = normalize(cross(uDrain.xyz, ax));
      vec3 t2 = cross(uDrain.xyz, t1);
      float th = atan(dot(p, t2), dot(p, t1));
      float edge = 1.0 - smoothstep(0.72, 1.0, rr + 0.14 * (vnoise(p * 60.0) - 0.5));
      float spokes = pow(abs(sin(th * 9.0 + 2.0 * vnoise(p * 30.0))), 24.0);
      float ringsT = pow(abs(sin(rr * 26.0)), 18.0);
      float blocks = step(0.55, vnoise(p * 420.0)) * 0.35;
      float street = max(spokes, ringsT) + blocks;
      vec3 plate = vec3(0.035, 0.045, 0.04) * (0.6 + 0.8 * vnoise(p * 240.0));
      float m = built * edge;
      lit = mix(lit, plate * (0.3 + 0.9 * day), m);
      vec3 glow = mix(vec3(0.15, 1.0, 0.5), vec3(0.4, 0.85, 1.0), smoothstep(0.5, 0.0, rr));
      lit += glow * m * (street * 1.4 + 1.2 * exp(-rr * rr * 30.0)) * uCityHdr * 0.2;
    }
  }

  if (uFogDensity > 0.0) {
    // vViewDir is unnormalized (camera - fragment), so its length is the view
    // distance the exponential runs on — matches FogExp2 on standard materials.
    lit = mix(lit, uFogColor, 1.0 - exp(-length(vViewDir) * uFogDensity));
  }

  gl_FragColor = vec4(lit, 1.0);
}
