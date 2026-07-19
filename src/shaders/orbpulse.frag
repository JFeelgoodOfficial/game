// Additive fresnel "sound ripple" shell around a district speaker orb.
// A bright rim (fresnel) pulses outward in phase with the orb's own emissive
// throb (uPhase carries the district's phase offset). Peak stays <= 1.0 so the
// thin rim brightens the silhouette without pushing large areas over bloom.
uniform float uTime;
uniform float uPhase;
uniform float uLevel;
uniform vec3 uColor;

varying vec3 vNormalV;
varying vec3 vViewDir;

const float RIPPLE_SPEED = 0.6;

void main() {
  float fresnel = pow(1.0 - clamp(dot(normalize(vNormalV), normalize(vViewDir)), 0.0, 1.0), 3.0);
  // Ripple travels from the silhouette edge inward as the orb "breathes".
  float ripple = 0.5 + 0.5 * sin(uTime * RIPPLE_SPEED + uPhase - fresnel * 4.0);
  float intensity = fresnel * ripple * uLevel;
  gl_FragColor = vec4(uColor * intensity, intensity);
}
