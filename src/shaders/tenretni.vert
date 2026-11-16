// Shared by Tenretni's sphere, the tunnel shell and the wormhole disc
// (src/tenretni.js): object-space position, world normal, view vector, uv.

varying vec3 vObj;
varying vec3 vWorldNormal;
varying vec3 vView;
varying vec2 vUv;

void main() {
  vObj = position;
  vUv = uv;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vView = cameraPosition - world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
