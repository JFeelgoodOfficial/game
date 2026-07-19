// Crystal spire field, merged into one geometry: per-vertex phase and tint
// select each spire's pulse timing and colour (primary vs secondary neon).
attribute float aPhase;
attribute float aTint;

varying float vPhase;
varying float vTint;
varying vec3 vNormal;
varying vec3 vViewPos;
varying vec3 vLocal;

void main() {
  vPhase = aPhase;
  vTint = aTint;
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vLocal = position;
  gl_Position = projectionMatrix * mv;
}
