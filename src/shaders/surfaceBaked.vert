// Terra surface vertex shader, post-bake (audit fix). The warped-fbm +
// ridged displacement that surface.vert evaluated per vertex EVERY frame is
// baked into the geometry once on the CPU (planet.js bakePlanetGeometry,
// via the exact-port field in terrain.js), so this shader is just a
// pass-through. The fragment shader still evaluates the same field per
// pixel for colour and relief, so the visual result is unchanged.

varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

void main() {
  vObjPos = position; // already displaced; normalize() in the fragment
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vViewDir = cameraPosition - world.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
