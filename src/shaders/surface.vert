// Planet surface vertex shader (Phase 3 preview). Passes object-space
// position (for the procedural surface, which rotates with the mesh) and the
// world normal + view direction (for lighting, which stays fixed to the sun).

varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

void main() {
  vObjPos = position;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vViewDir = cameraPosition - world.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
