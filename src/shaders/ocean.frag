// Fragment half of the sea patch (world/seapatch.js). The lighting is
// water.frag's — same fresnel, glint, storm rollers, Snell ceiling and fog,
// fed by the SAME uniform objects — with the analytic Gerstner slope laid over
// it, so where the relief fades out at the rim this is the water sphere,
// pixel for pixel. On top: breaking crests, and the ship's wake.

varying vec2 vFlat;
varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vTx;
varying vec3 vTz;
varying vec3 vViewDir;

uniform vec3 uSun;
uniform vec3 uWaterColor;
uniform float uGloss;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uTime;
uniform vec3 uSkyColor;
uniform float uGlint;
uniform float uDetail;
uniform float uStorm;
uniform vec3 uFoamColor;
uniform float uScale;
uniform vec3 uHull; // halfBeam, halfLength, 1 = a hull is here

//#CONSTS

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float swell(vec3 q) {
  float t = uTime * 0.22;
  return 0.62 * vnoise(q + vec3(t, 0.0, t * 0.6)) + 0.38 * vnoise(q * 2.7 - vec3(0.0, t * 1.3, t));
}
float stormSea(vec3 q) {
  float t = uTime;
  float a = 1.0 - abs(2.0 * vnoise(q + vec3(t * 0.55, t * 0.12, t * 0.4)) - 1.0);
  float b = 1.0 - abs(2.0 * vnoise(q * 2.3 + vec3(-t * 0.5, t * 0.3, t * 0.85)) - 1.0);
  float c = vnoise(q * 0.31 + vec3(t * 0.08, 0.0, -t * 0.06));
  return (a * a * 0.62 + b * b * 0.38) * (0.55 + 0.75 * c);
}

void main() {
  vec2 p = vFlat;
  float r = length(p);
  float t = uTime;

  // Hull outline: no sea inside the ship.
  float hullD = 9.0;
  if (uHull.z > 0.5) {
    // world/reachship.js hullHalfWidth: blunt transom astern, a finer bow
    vec2 q = abs(p / uHull.xy);
    float e = p.y > 0.0 ? 2.1 : 4.5;
    hullD = pow(pow(q.x, e) + pow(q.y, e), 1.0 / e);
    if (hullD < 0.93) discard;
  }

  vec3 N0 = normalize(vWorldNormal), S = normalize(uSun), V = normalize(vViewDir);
  vec3 N = N0;
  float dist = length(vViewDir);
  float near = 1.0 - smoothstep(500.0, 2600.0, dist);

  // fine ripples, exactly as on the sphere
  if (uGloss > 0.5 && near > 0.0) {
    if (uDetail > 0.5) {
      vec3 q = vObjPos * 0.16;
      const float e = 0.4;
      float h0 = swell(q);
      vec3 grad = vec3(swell(q + vec3(e, 0.0, 0.0)), swell(q + vec3(0.0, e, 0.0)), swell(q + vec3(0.0, 0.0, e))) - h0;
      grad -= N * dot(grad, N);
      N = normalize(N - grad * (0.55 * near));
    } else {
      vec3 q = vObjPos * 0.55;
      float w1 = sin(q.x * 1.7 + q.z * 0.9 + uTime * 1.1);
      float w2 = sin(q.z * 2.3 - q.x * 0.6 - uTime * 0.8);
      float w3 = sin((q.x + q.y + q.z) * 3.1 + uTime * 1.7);
      N = normalize(N + vec3(w1 + w3 * 0.5, w2 * 0.4, w2 + w3 * 0.5) * (0.035 * near));
    }
  }

  // the real swell
  float amp = (1.0 - smoothstep(RELIEF_START, RELIEF_END, r)) * uScale;
  float h = 0.0, fold = 0.0;
  vec2 d = vec2(0.0), g = vec2(0.0);
//#WAVES
  vec3 Tx = normalize(vTx - N0 * dot(vTx, N0));
  vec3 Tz = normalize(vTz - N0 * dot(vTz, N0));
  N = normalize(N * (1.0 - fold) - Tx * g.x - Tz * g.y);

  // The sphere's painted storm rollers hand over to the geometry: full
  // strength where there is no relief, gone where the waves are real.
  float storm = uStorm * (1.0 - amp);
  float crest = 0.0;
  if (storm > 0.0) {
    vec3 q = vObjPos * 0.021;
    const float e = 0.12;
    crest = stormSea(q);
    vec3 grad = vec3(stormSea(q + vec3(e, 0.0, 0.0)), stormSea(q + vec3(0.0, e, 0.0)), stormSea(q + vec3(0.0, 0.0, e))) - crest;
    grad -= N0 * dot(grad, N0);
    N = normalize(N - grad * (3.2 * storm));
  }

  float muS = dot(N0, S);
  float day = smoothstep(-0.12, 0.28, muS);
  vec3 sunCol = mix(vec3(1.0, 0.5, 0.24), vec3(1.0), smoothstep(-0.05, 0.42, muS));

  vec3 col = uWaterColor * (0.05 + 0.95 * day * sunCol);
  float slope = clamp(dot(N, S) - muS, -0.5, 0.5);
  // deep troughs, lit faces: painted for the storm sea, by height for the real one
  col *= mix(1.0, max(0.42 + 1.1 * crest + 1.3 * slope, 0.2), storm);
  col *= mix(1.0, clamp(0.78 + 0.07 * h + 1.1 * slope, 0.3, 1.9), amp);

  // Light through the crests: a wave standing up between you and the sky
  // glows with the water's own colour, where the flat sea only mirrors.
  float thru = amp * smoothstep(0.2, 2.6, h) * (0.35 + 0.65 * pow(1.0 - max(dot(N0, V), 0.0), 2.0));
  col += (uWaterColor * 3.2 + vec3(0.05, 0.03, 0.16)) * thru * day;

  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  col = mix(col, uSkyColor * (0.05 + 0.95 * day), fres * 0.6 * uGloss);

  vec3 H = normalize(S + V);
  float rough = max(storm, amp * 0.7);
  float shin = mix(180.0, 420.0, near);
  col += vec3(1.0, 0.93, 0.78) * sunCol * pow(max(dot(N, H), 0.0), shin * (1.0 - 0.8 * rough)) * day * uGloss * uGlint * mix(0.16, 1.0, near) * (1.0 - 0.85 * rough);

  // --- foam ---
  vec3 foamCol = uFoamColor * (0.08 + 0.92 * day);
  float foam = 0.0;
  if (storm > 0.0) {
    float f0 = smoothstep(0.6, 0.84, crest);
    f0 = max(f0, 0.35 * smoothstep(0.42, 0.7, crest) * vnoise(vObjPos * 0.9 + uTime * 0.7));
    foam = f0 * storm;
  }
  // water-frame coordinate: the whole sea streams astern
  vec2 w = vec2(p.x, p.y + ADVECT * t);
  float n1 = vnoise(vec3(w * 0.33, t * 0.35));
  float n2 = vnoise(vec3(w * 1.3, t * 0.6));
  float n3 = vnoise(vec3(w * 3.9, t * 0.9));
  // lacy breakup shared by every kind of foam: holes open and close in it
  float lace = smoothstep(0.34, 0.72, n2 * 0.62 + n3 * 0.5);
  // breaking crests: where the Gerstner pinch is tightest, torn up by noise
  float cap = smoothstep(0.1, 0.19, fold) * smoothstep(0.3, 0.75, n1) * (0.35 + 0.65 * lace);
  // spindrift streaks trailing down the back of each crest
  cap = max(cap, 0.28 * smoothstep(0.05, 0.13, fold) * smoothstep(0.55, 0.9, vnoise(vec3(w.x * 2.2, w.y * 0.28, t * 0.2))));
  foam = max(foam, cap * amp);

  if (uHull.z > 0.5) {
    float hb = uHull.x, hl = uHull.y;
    // wash along the plating
    float wash = (1.0 - smoothstep(1.0, 1.13, hullD)) * (0.3 + 0.7 * lace);
    // the screws' wake: a boiling lane astern, spreading and dying away
    float aft = -p.y - hl * 0.92;
    float lane = 0.0;
    if (aft > 0.0) {
      float wd = hb * 0.7 + aft * 0.15;
      float core = 1.0 - smoothstep(wd * 0.3, wd, abs(p.x));
      lane = core * exp(-aft / 210.0) * (0.12 + 0.88 * lace) * (0.55 + 0.45 * n1);
    }
    // Kelvin arms off the bow: thin feathered ridges, not painted lines
    float back = hl - p.y;
    float arms = 0.0;
    if (back > 0.0) {
      float off = abs(abs(p.x) - (hb * 0.25 + back * 0.36));
      arms = (1.0 - smoothstep(0.6, 3.2 + back * 0.025, off)) * exp(-back / 260.0) * smoothstep(0.0, 20.0, back) * (0.1 + 0.9 * lace);
    }
    foam = max(foam, clamp(max(wash, max(lane, arms)), 0.0, 1.0) * uScale);
  }
  col = mix(col, foamCol, clamp(foam, 0.0, 1.0));

  if (!gl_FrontFacing) {
    float window = smoothstep(0.5, 0.85, -dot(N, V));
    vec3 skyThroughSurface = vec3(0.45, 0.72, 0.95) * (0.12 + 0.88 * day);
    col = mix(uWaterColor * 0.12, skyThroughSurface, window);
    col += vec3(1.0, 0.95, 0.8) * pow(max(dot(N, H), 0.0), 60.0) * day * 0.4;
    col = mix(col, col * 1.6 + 0.05, clamp(foam, 0.0, 1.0) * 0.5); // foam glows from below
  }

  if (uFogDensity > 0.0) {
    col = mix(col, uFogColor, 1.0 - exp(-length(vViewDir) * uFogDensity));
  }

  gl_FragColor = vec4(col, 1.0);
}
