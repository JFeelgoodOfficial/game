// Tenretni's small hardware (src/tenretni.js): the tunnel's ring frames and
// the city's towers, both instanced. Towers stand on y = 0 and rise as uGrow
// goes 0..1, the middle of the city first (aRad is 0 there, 1 at the edge).

attribute float aRad;

uniform float uGrow;

varying vec3 vPos; // instance-placed position, parent units
varying vec3 vWorldNormal;
varying vec3 vView;
varying float vUp; // 0 at the base of a tower, 1 at its roof

void main() {
  vec3 pos = position;
  float g = clamp(uGrow * 1.7 - aRad * 0.7, 0.0, 1.0);
  pos.y *= g;
  vUp = position.y;
#ifdef USE_INSTANCING
  mat4 im = instanceMatrix;
#else
  mat4 im = mat4(1.0);
#endif
  vec4 placed = im * vec4(pos, 1.0);
  vPos = placed.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * mat3(im) * normal);
  vec4 world = modelMatrix * placed;
  vView = cameraPosition - world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  if (g <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // not built yet
}
