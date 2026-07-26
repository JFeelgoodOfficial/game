// Raymarched cloud layer for world/actuality-sky.js.
//
// Runs inside a large inward-facing dome centred on the viewer, entirely in the
// anchor's local frame (+Y up). For each pixel we take the view direction,
// intersect it with a horizontal slab at cloud altitude, and march that segment
// through a 3D noise volume that was baked once on the CPU. Density is shaped by
// a coverage threshold and a vertical falloff so the slab has a flat-ish base
// and a billowed top, the way real cumulus sit on their condensation level.
//
// Lighting is a cheap two-term model rather than a second raymarch toward the
// sun: Beer's law for extinction plus a Henyey-Greenstein forward-scatter lobe
// so the cloud edges glow when you look toward the sun. That is most of what
// sells a cloud, at a fraction of the cost of light-marching every sample.
//
// Rays pointing below the horizon exit immediately — the ground is down there.

uniform sampler3D uNoise;
uniform float uTime;
uniform float uCover;      // 0 = clear, 1 = overcast
uniform float uAltitude;   // slab base height above the viewer (m)
uniform float uThickness;  // slab depth (m)
uniform float uDrift;      // wind speed multiplier
uniform vec3  uTint;
uniform vec3  uSunDir;     // anchor-local, normalized
uniform vec3  uSunColor;
uniform float uSteps;
uniform float uOpacity;
uniform float uAmbient;   // sky's own contribution to cloud lighting

varying vec3 vDir;

// Sample the baked volume. R = billow shape, G = erosion detail, B = fine curl.
float sampleDensity(vec3 p, float heightFrac) {
  // Feature scale. The volume tiles every 1/FREQ metres and its coarsest octave
  // is a quarter of that, so this sets how big a cloud is: at 0.00035 the base
  // billows come out ~700 m across, which is what a cumulus looks like from a
  // kilometre below. Finer than that and the march undersamples it into speckle.
  const float FREQ = 0.00035;
  vec3 wind = vec3(uTime * 0.004 * uDrift, 0.0, uTime * 0.0016 * uDrift);
  vec3 uvw = p * FREQ + wind;
  vec4 n = texture(uNoise, uvw);

  // Base shape, pushed through the coverage threshold. Remapping (rather than
  // multiplying) keeps clouds crisp-edged instead of uniformly translucent.
  //
  // The threshold is remapped into the range the baked noise actually occupies.
  // Layered inverted-Worley clusters around ~0.5, so a naive `1 - uCover`
  // threshold sits above almost every sample and the sky comes out empty; this
  // maps uCover 0..1 onto a threshold that spans "a few clouds" to "overcast".
  float base = n.r;
  float cov = 0.62 - uCover * 0.42;
  float d = (base - cov) / max(1.0 - cov, 0.001);
  if (d <= 0.0) return 0.0;

  // Erode the edges with the finer octaves — this is what turns blobs into
  // cauliflower. Erosion bites hardest where the base is already thin.
  vec4 nd = texture(uNoise, uvw * 3.7 + vec3(0.31, 0.17, 0.63));
  float erosion = nd.g * 0.6 + nd.b * 0.4;
  d -= erosion * 0.35 * (1.0 - d);

  // Vertical profile: flat base, rounded top.
  float shape = smoothstep(0.0, 0.18, heightFrac) * smoothstep(1.0, 0.55, heightFrac);
  return max(0.0, d) * shape;
}

// Henyey-Greenstein phase — forward scattering, so cloud rims light up when
// you look toward the sun.
float hg(float cosT, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (12.566370614 * pow(1.0 + g2 - 2.0 * g * cosT, 1.5));
}

void main() {
  vec3 dir = normalize(vDir);

  // Below the horizon there is ground, not sky. Fade out rather than cut, so
  // the slab never shows a hard seam at eye level.
  float horizon = smoothstep(0.0, 0.06, dir.y);
  if (horizon <= 0.001) discard;

  float base = uAltitude;
  float top = uAltitude + uThickness;
  float tBase = base / max(dir.y, 0.001);
  float tTop = top / max(dir.y, 0.001);

  // Grazing rays traverse an enormous slice; clamp so the step count stays
  // meaningful and distant cloud resolves into haze instead of banding.
  float far = min(tTop, 9000.0);
  float near = min(tBase, far);
  float span = far - near;
  if (span <= 0.0) discard;

  int steps = int(clamp(uSteps, 6.0, 48.0));
  float dt = span / float(steps);
  float cosT = dot(dir, normalize(uSunDir));
  float phase = hg(cosT, 0.72) * 12.0 + 0.32; // normalized-ish, tuned by eye

  float transmittance = 1.0;
  vec3 scattered = vec3(0.0);

  // Dither the entry point to break up the step banding.
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float t = near + dt * jitter;

  for (int i = 0; i < 48; i++) {
    if (i >= steps || transmittance < 0.02) break;
    vec3 p = dir * t;
    float h = clamp((p.y - base) / max(uThickness, 1.0), 0.0, 1.0);
    float density = sampleDensity(p, h);
    if (density > 0.001) {
      float sigma = density * 0.0035;
      float stepT = exp(-sigma * dt);
      // Deeper in the cloud = less sunlight reaching the sample. Approximated
      // from height in the slab rather than a second march toward the sun.
      float sun = mix(0.22, 1.0, h) * phase;
      // The sky itself is the other half of a cloud's light, and the bigger
      // half when you aren't looking toward the sun. It has to scale with the
      // preset: a constant bright enough for noon paints daylight cumulus into
      // a midnight sky. These are radiance values feeding an ACES curve whose
      // exposure is also per-preset, so "white" lives well above 1.
      vec3 lit = uSunColor * sun * 2.2 + uTint * uAmbient;
      // Energy-conserving accumulation: what this step scatters is what it
      // removes from the beam.
      scattered += transmittance * (1.0 - stepT) * lit;
      transmittance *= stepT;
    }
    t += dt;
  }

  // Distance fade. A slab seen edge-on piles up unbounded optical depth toward
  // the horizon, which reads as a hard dark band rather than as sky. Real cloud
  // decks do converge down there, but they also disappear into aerial
  // perspective long before they stack up — so fade the layer out over the last
  // stretch of its visible range and let the sky take over.
  float fade = 1.0 - smoothstep(2200.0, 7000.0, near);

  float alpha = (1.0 - transmittance) * horizon * fade * uOpacity;
  if (alpha <= 0.003) discard;
  // `scattered` already carries the tint through `lit` — multiplying again here
  // would square it and drag every cloud toward grey.
  gl_FragColor = vec4(scattered, alpha);
}
