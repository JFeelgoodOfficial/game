// Shared pass-through vertex stage for the city/wonder effect materials
// (ads, haze cards, elevator ribbon, beams, gate film). Passes UV, the
// local-space position (for height-based effects on merged geometry) and
// the view-space normal.
varying vec2 vUv;
varying vec3 vLocalPos;
varying vec3 vNormal;

void main() {
  vUv = uv;
  vLocalPos = position;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
