// The megaworld's surface (world/megaworld.js): one polar disc that rides
// under the camera. The mesh is flat; the rim is dropped here by d^2 / 2R so
// a world far too big to draw as a sphere still has a horizon.

uniform float uR; // the megaworld's nominal radius

varying vec2 vP; // xz from the point under the camera, world units
varying float vD; // ...and its length

void main() {
  vec3 p = position;
  float d2 = dot(p.xz, p.xz);
  p.y -= d2 / (2.0 * uR);
  vP = position.xz;
  vD = sqrt(d2);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
