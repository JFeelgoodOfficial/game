// Atmospheric scattering for the planet's air shell (MEDIUM tier and up; LOW
// keeps the fresnel limb in atmosphereLimb.frag).
//
// The shell is a sphere at uShell planet radii. For each pixel the view ray is
// marched through the air between where it enters the shell and where it
// leaves or strikes the ground, accumulating sunlight scattered toward the
// eye. Light reaching each sample has already crossed air on its way in from
// the sun, and loses more on the way out to the camera; because that loss is
// stronger in the wavelengths the air scatters most, a long grazing path runs
// out of them first. That one mechanism is what makes a blue-air world's limb
// blue at noon and red at the terminator, with no colour authored for either.
//
// Everything is in units of the planet radius, relative to the planet centre,
// so the maths is identical for every world and stays inside mediump range.
// The sun-side optical depth is analytic (a Chapman-style fit), so there is no
// second march per sample.
//
// Blending is "scatter + background * transmittance": rgb is the in-scattered
// light, alpha is how much of what lies behind survives the air.

varying vec3 vWorldNormal;
varying vec3 vViewDir; // camera - fragment, world units, unnormalised

uniform vec3 uSun;
uniform vec3 uBeta; // scattering per planet radius of air at ground density, rgb
uniform float uRadius; // planet radius, world units
uniform float uShell; // shell radius, planet radii
uniform float uH; // density scale height, planet radii
uniform float uSunI; // sunlight intensity
uniform float uMie; // haze (forward-scattering aerosol) strength
uniform float uInside; // how much of the effect survives at ground level

// SAMPLES is a material define: 4 / 8 / 12 by tier.

vec2 raySphere(vec3 o, vec3 d, float r) {
  float b = dot(o, d);
  float h = b * b - (dot(o, o) - r * r);
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  vec3 dir = normalize(-vViewDir);
  // The shell is an unrotated, unscaled sphere, so its outward normal times
  // its radius IS the fragment's position; the camera follows from that.
  vec3 cam = normalize(vWorldNormal) * uShell + vViewDir / uRadius;
  float camR = length(cam);
  bool inside = camR < uShell;
  // From outside, the near hemisphere covers the disc and the limb. The far
  // hemisphere would count the same air twice.
  if (!inside && !gl_FrontFacing) discard;

  vec2 ts = raySphere(cam, dir, uShell);
  vec2 tg = raySphere(cam, dir, 1.0);
  float t0 = max(ts.x, 0.0);
  float t1 = ts.y;
  if (tg.x > 0.0 && tg.x < tg.y) t1 = min(t1, tg.x); // the ray ends on the ground
  if (t1 <= t0) discard;

  vec3 S = normalize(uSun);
  float seg = (t1 - t0) / float(SAMPLES);
  float od = 0.0; // optical depth from the camera to the current sample
  vec3 sum = vec3(0.0);
  for (int i = 0; i < SAMPLES; i++) {
    vec3 p = cam + dir * (t0 + (float(i) + 0.5) * seg);
    float r = length(p);
    float dens = exp(-(r - 1.0) / uH);
    float odMid = od + dens * seg * 0.5;
    od += dens * seg;
    // Air between this sample and the sun: a column of height uH straight up,
    // lengthening as the sun drops toward this point's horizon and beyond.
    float mu = dot(p, S) / r;
    float odSun = dens * uH / (max(mu, 0.0) + 0.18) * (1.0 + 6.0 * max(-mu, 0.0));
    // The planet's own shadow, softened across the terminator.
    float b = dot(p, S);
    float perp = sqrt(max(r * r - b * b, 0.0));
    float lit = b > 0.0 ? 1.0 : smoothstep(0.985, 1.03, perp);
    sum += dens * lit * exp(-uBeta * (odMid + odSun));
  }
  sum *= seg;

  float c = dot(dir, S);
  float phaseR = 0.75 * (1.0 + c * c);
  const float g = 0.76;
  float phaseM = 0.25 * (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
  vec3 scatter = (uBeta * phaseR + vec3(uMie * phaseM)) * sum * uSunI;
  float trans = dot(exp(-uBeta * od), vec3(1.0 / 3.0));

  // Below the top of the air the screen-space sky wash (skyfog.frag) takes
  // over the look; ease this shell out as the camera descends so the two never
  // stack.
  if (inside) {
    float f = mix(uInside, 1.0, smoothstep(0.0, 1.0, (camR - 1.0) / (uShell - 1.0)));
    scatter *= f;
    trans = mix(1.0, trans, f);
  }
  gl_FragColor = vec4(scatter, trans);
}
