// Instanced tower window shell. Derives the per-face window-cell density
// from the instance's scale (extracted from instanceMatrix columns) so
// windows stay roughly constant-sized on every tower, whatever its
// footprint or height. aSeed decorrelates the lit-window pattern between
// towers that share a scale.
attribute float aSeed;

varying vec2 vCell;   // uv scaled into window-cell space
varying float vSeed;
varying float vFace;  // 1 = wall face, 0 = roof/underside (no windows)

void main() {
  vSeed = aSeed;

  #ifdef USE_INSTANCING
    vec3 sc = vec3(
      length(instanceMatrix[0].xyz),
      length(instanceMatrix[1].xyz),
      length(instanceMatrix[2].xyz)
    );
  #else
    vec3 sc = vec3(1.0);
  #endif

  // Horizontal extent of this face: x-facing walls span the box depth (z),
  // z-facing walls span the width (x).
  float horiz = abs(normal.x) > 0.5 ? sc.z : sc.x;
  vFace = 1.0 - step(0.5, abs(normal.y));
  vCell = vec2(uv.x * horiz / 2.4, uv.y * sc.y / 3.2);

  #ifdef USE_INSTANCING
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  #else
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #endif
}
