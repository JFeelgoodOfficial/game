// A time conduit (world/farhole.js): what the megaworld mines out of the black
// hole, coming down. A sheet, not a pipe: a broad ribbon of glass, thick as
// cloth is thick, that hangs from the hole's disc, twists as it falls, and is
// gathered into a funnel over its collector. Its whole shape is made here,
// every frame, from two ends: its foot, which is this mesh's own origin (a
// collector on a cage, fixed in the world), and its head, in the disc (a
// direction in the sky, so a point far out from the camera). And it moves:
// the whole drape sways, folds travel down it, and the twist turns.
//
// position.x: 0..1 along (0 at the collector). position.y: 0..1 round the
// sheet's edge (it is a flattened tube: both faces and the rounded edges).

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
  // more of the sheet's rows are spent near the collector, where it is close
  float t = pow(position.x, 1.7);
  float th = position.y * 6.2832;

  vec3 foot = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  // each leaves the disc at its own place, out to one side of the shadow
  float sgn = aSeed < 0.5 ? -1.0 : 1.0;
  float out1 = 1.7 + 2.2 * abs(aSeed - 0.5) * 2.0;
  vec3 head = cameraPosition + uHoleDir * uHoleDist * 0.96
            + (uHoleRight * sgn * out1 - uHoleUp * (0.25 + 0.5 * fract(aSeed * 7.0))) * uHoleR;
  vec3 span = head - foot;
  float len = length(span);
  vec3 side = normalize(cross(span, vec3(0.0, 1.0, 0.0)));
  // up out of the collector, then thrown over toward the hole; and the whole
  // drape swings, slowly, a long way
  float s1 = sin(uTime * 0.13 + aSeed * 31.0), s2 = sin(uTime * 0.09 + aSeed * 17.0 + 1.3);
  vec3 mid = foot + span * 0.12 + vec3(0.0, 1.0, 0.0) * len * (0.16 + 0.07 * fract(aSeed * 5.0) + 0.03 * s2)
           + side * len * (0.14 * (aSeed * 2.0 - 1.0) + 0.06 * s1);

  vec3 c = curve(foot, mid, head, t);
  vec3 tan = normalize(curve(foot, mid, head, min(t + 0.004, 1.0)) - curve(foot, mid, head, max(t - 0.004, 0.0)));
  vec3 n1 = normalize(cross(tan, vec3(0.31, 0.2, 0.93)));
  vec3 n2 = cross(tan, n1);

  // how wide the sheet is here: a nozzle at the collector, opening fast into
  // a funnel, then as wide as it is far away so it holds its size in the sky
  float away = length(c - cameraPosition);
  float wide = away * (0.085 + 0.035 * fract(aSeed * 3.0));
  float A = mix(300.0, wide, smoothstep(0.0, 0.09, t));
  // folds along it, travelling down: the hang of cloth
  A *= 1.0 + 0.16 * sin(t * 26.0 + aSeed * 40.0 + uTime * 0.5) + 0.08 * sin(t * 61.0 - uTime * 0.8);
  // ...and how thick: round at the nozzle, a fifth of its width as a sheet
  float flat1 = mix(1.0, 0.2, smoothstep(0.0, 0.07, t));
  float B = A * flat1;
  // where it lands it spreads into a bell of spray over the collector
  float bell = 1150.0 * exp(-t * 520.0);
  A += bell;
  B += bell;
  // drawn to nothing as it enters the disc
  float end = 1.0 - 0.8 * smoothstep(0.82, 1.0, t);
  A *= end;
  B *= end;

  // the sheet's own turn about its line: a slow twist down its length, a
  // waver on top of that, all of it drifting round
  float twist = aSeed * 6.2832 + t * 4.2 + uTime * 0.07 + 0.7 * sin(t * 8.0 - uTime * 0.33 + aSeed * 9.0);
  vec3 major = n1 * cos(twist) + n2 * sin(twist);
  vec3 minor = -n1 * sin(twist) + n2 * cos(twist);
  // a ripple across the sheet, so its face is never flat
  float ripple = 1.0 + 0.5 * flat1 * sin(cos(th) * 5.0 + t * 37.0 - uTime * 0.9) * smoothstep(0.02, 0.1, t);

  vec3 world = c + major * (A * cos(th)) + minor * (B * sin(th) * ripple);
  // the normal of an ellipse, near enough for the light on glass
  vN = normalize(major * (cos(th) / max(A, 1.0)) + minor * (sin(th) / max(B, 1.0)));
  vView = cameraPosition - world;
  vAt = vec2(t, th);
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
