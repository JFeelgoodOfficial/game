// Tenretni's beams (src/tenretni.js): line segments in the sphere's own unit
// space, each from the hull straight out. aEnd is 0 at the hull, 1 at the tip.

attribute float aEnd;
attribute float aSeed;

uniform float uT;
uniform float uOn; // 0..1

varying float vA;

void main() {
  float pulse = 0.7 + 0.3 * sin(uT * (2.0 + aSeed * 5.0) + aSeed * 60.0);
  // each beam switches on at its own moment as uOn rises
  float mine = smoothstep(aSeed * 0.7, aSeed * 0.7 + 0.3, uOn);
  float len = (0.35 + 1.5 * fract(aSeed * 7.31)) * pulse * mine;
  vec3 pos = normalize(position) * (1.0 + aEnd * len);
  vA = mine * (1.0 - aEnd * 0.92) * pulse;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
