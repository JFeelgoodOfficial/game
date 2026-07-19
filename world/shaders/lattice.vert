// Hyper-holo-grid lattice of selves (actuality mirror room). Minimal
// instanced vertex: applies instanceMatrix manually (r165 auto-defines
// USE_INSTANCING and declares the attribute for ShaderMaterial on an
// InstancedMesh) and forwards the per-instance dim tint + flicker phase.
attribute float aPhase;
varying vec2 vUv;
varying float vPhase;
varying vec3 vTint;

void main() {
  vUv = uv;
  vPhase = aPhase;
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #else
    vTint = vec3(1.0);
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
