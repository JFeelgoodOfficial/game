// Atmospheric entry (Phase 5 preview). As the ship descends into the air the
// view washes toward a sky colour, and the haze thickens toward the horizon
// and below it — grazing sightlines look through more air — with a brighter
// band right at the horizon line. Brighter and bluer on the day side,
// near-dark at night. Screen-space AND depth-aware: solid geometry only
// hazes with its sightline distance (aerial perspective), so nearby
// buildings stay crisp instead of having the horizon painted through them,
// while empty sky (cleared depth) keeps the full directional gradient.
// Driven by the ship's altitude and the planet-up direction (main.js).
// Never a hazard — the floor holds you above the surface, this just paints
// the air.

uniform sampler2D tDiffuse;
uniform sampler2D tDepth; // scene depth, from the composer's render target
uniform float uAtmo;      // 0 above the atmosphere, 1 at the surface
uniform float uDay;       // 0 night .. 1 full day at the ship's position
uniform vec3 uSkyDay;
uniform float uDensity;
uniform vec3 uUpView;     // planet-away ("up") direction, in view space
uniform float uAspect;
uniform float uTanHalf;   // tan(fov/2)
uniform float uNear;
uniform float uFar;
uniform float uHazeDist;  // sightline distance through air for ~63% haze

varying vec2 vUv;

void main() {
  vec3 col = texture2D(tDiffuse, vUv).rgb;

  // reconstruct the view ray for this pixel
  vec2 nd = vUv * 2.0 - 1.0;
  vec3 rayUn = vec3(nd.x * uAspect * uTanHalf, nd.y * uTanHalf, -1.0);
  vec3 ray = normalize(rayUn);
  float up = dot(ray, normalize(uUpView)); // +1 zenith, 0 horizon, -1 nadir
  float horizon = 1.0 - abs(up);           // 1 at the horizon line

  // depth in the atmosphere, richer toward and below the horizon
  float depth = uAtmo * uAtmo;
  float dens = depth * uDensity * (0.5 + 0.7 * horizon + 0.3 * max(-up, 0.0));

  vec3 sky = mix(vec3(0.01, 0.02, 0.05), uSkyDay, uDay);
  // hot, pale band right at the horizon
  vec3 hazeCol = mix(sky, uSkyDay * 1.35 + 0.08, pow(horizon, 4.0) * uDay);

  // Aerial perspective: haze builds with the distance the sightline travels
  // through the air. Cleared depth (sky) inverts to dist >= uFar, the factor
  // saturates to 1, and the directional sky gradient above is reproduced
  // exactly — no seam, no branch.
  float zBuf = texture2D(tDepth, vUv).x;
  float viewZ = (uNear * uFar) / ((uFar - uNear) * zBuf - uFar); // negative
  float dist = -viewZ * length(rayUn);
  float distFactor = 1.0 - exp(-dist / uHazeDist);

  float amount = clamp(dens, 0.0, 0.94) * (0.25 + 0.75 * uDay) * distFactor;
  col = mix(col, hazeCol, clamp(amount, 0.0, 0.94));

  gl_FragColor = vec4(col, 1.0);
}
