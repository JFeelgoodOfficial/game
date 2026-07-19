// Phased emissive elements: rooftop signs (instanced), grove lantern pods
// and titan runes (merged, per-vertex attributes). aPhase offsets each
// element's pulse; aTint gives it its own neon colour — one material and
// draw call serves a whole family of independently animated glows.
attribute float aPhase;
attribute vec3 aTint;

varying float vPhase;
varying vec3 vTint;

void main() {
  vPhase = aPhase;
  vTint = aTint;
  #ifdef USE_INSTANCING
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  #else
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #endif
}
