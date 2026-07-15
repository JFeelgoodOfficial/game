// Gravitational lensing (GDD 4.5). Screen-space pass: weak-field 1/b
// deflection pulls background samples around the black hole's projected
// position. Full geodesic integration is unnecessary — this reads correctly
// and costs almost nothing. Includes the event horizon (black disk) and the
// photon ring at ~1.5x the horizon radius.

uniform sampler2D tDiffuse;
uniform vec2 uBH;       // BH center in uv
uniform float uRh;      // apparent horizon radius, in vertical-uv units
uniform float uAspect;  // width / height
uniform float uStrength;
uniform float uEnabled;

varying vec2 vUv;

void main() {
  vec3 col;
  if (uEnabled < 0.5 || uRh <= 0.0) {
    col = texture2D(tDiffuse, vUv).rgb;
    gl_FragColor = vec4(col, 1.0);
    return;
  }

  vec2 d = vUv - uBH;
  d.x *= uAspect; // isotropic radius in vertical-uv units
  float r = max(length(d), 1e-5);
  vec2 dir = d / r;

  // weak-field deflection: angle ~ 1/b, scaled by the horizon size
  float defl = uStrength * uRh * uRh / r;
  vec2 uv2 = vUv - dir * defl * vec2(1.0 / uAspect, 1.0);
  col = texture2D(tDiffuse, uv2).rgb;

  // event horizon: black disk with a soft limb
  col *= smoothstep(uRh * 0.92, uRh * 1.02, r);

  // photon ring at 1.5x horizon — most of what makes the image legible
  col += vec3(1.6, 1.35, 1.2) * smoothstep(0.09 * uRh, 0.0, abs(r - 1.5 * uRh));

  gl_FragColor = vec4(col, 1.0);
}
