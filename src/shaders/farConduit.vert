// A time conduit (world/farhole.js): what the megaworld mines out of the black
// hole, coming down. A tube whose whole shape is made here, every frame, from
// two ends: its foot, which is this mesh's own origin (a collector on a cage,
// fixed in the world), and its head, which is in the hole's disc (a direction
// in the sky, so a point far out from the camera). Between them it arcs up
// and over, thin as a nozzle at the collector and swelling as it climbs.
//
// position.x: 0..1 along (0 at the collector). position.y: 0..1 round the tube.

attribute float aSeed;

uniform vec3 uHoleDir, uHoleRight, uHoleUp;
uniform float uHoleDist;
uniform float uHoleR; // one shadow radius, at the hole
uniform float uTime;

varying vec3 vN;
varying vec3 vView;
varying vec2 vAt; // along (0..1), around (radians)
varying float vSeed;

vec3 curve(vec3 a, vec3 b, vec3 c, float t) {
  return (1.0 - t) * (1.0 - t) * a + 2.0 * t * (1.0 - t) * b + t * t * c;
}

void main() {
  // more of the tube's rings are spent near the collector, where it is close
  float t = position.x * position.x;
  float th = position.y * 6.2832;

  vec3 foot = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  // each conduit leaves the disc at its own place under the hole
  // (out along the disc to one side or the other, never across the shadow)
  float sgn = aSeed < 0.5 ? -1.0 : 1.0;
  float out1 = 1.7 + 2.2 * abs(aSeed - 0.5) * 2.0;
  vec3 head = cameraPosition + uHoleDir * uHoleDist * 0.96
            + (uHoleRight * sgn * out1 - uHoleUp * (0.25 + 0.5 * fract(aSeed * 7.0))) * uHoleR;
  vec3 span = head - foot;
  float len = length(span);
  // straight up out of the collector first, then thrown over toward the hole,
  // each to its own side
  vec3 side = normalize(cross(span, vec3(0.0, 1.0, 0.0)));
  vec3 mid = foot + span * 0.12 + vec3(0.0, 1.0, 0.0) * len * (0.16 + 0.07 * fract(aSeed * 5.0))
           + side * len * 0.14 * (aSeed * 2.0 - 1.0);

  vec3 c = curve(foot, mid, head, t);
  vec3 tan = normalize(curve(foot, mid, head, min(t + 0.004, 1.0)) - curve(foot, mid, head, max(t - 0.004, 0.0)));
  vec3 n1 = normalize(cross(tan, vec3(0.31, 0.2, 0.93)));
  vec3 n2 = cross(tan, n1);

  // a nozzle at the collector with a skirt of splash round it; then as thick
  // as it is far away, so it holds its size against the sky; slow swells
  // travelling down it; drawn to nothing as it enters the disc
  float away = length(c - cameraPosition);
  float wide = away * (0.030 + 0.012 * fract(aSeed * 3.0));
  float r = mix(260.0, wide, smoothstep(0.0, 0.24, t));
  // where it lands it spreads into a bell of spray over the collector
  r += 1150.0 * exp(-t * 520.0);
  // slow swells down it, and folds along it like cloth: it is not round
  r *= 1.0 + 0.24 * sin(t * 24.0 + aSeed * 40.0 + uTime * 0.25) + 0.30 * sin(th * 2.0 + t * 19.0 - uTime * 0.12) + 0.12 * sin(th * 5.0 - t * 43.0);
  r *= 1.0 - 0.75 * smoothstep(0.82, 1.0, t);

  vec3 radial = n1 * cos(th) + n2 * sin(th);
  vec3 world = c + radial * r;
  vN = radial;
  vView = cameraPosition - world;
  vAt = vec2(t, th);
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
