// One swarm ship: a soft green point, a few of them white-hot.

varying float vAlpha;
varying float vHot;

uniform float uHdr;

void main() {
  if (vAlpha <= 0.0) discard;
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = dot(q, q);
  if (d > 1.0) discard;
  float core = exp(-d * 3.5);
  vec3 col = mix(vec3(0.2, 1.0, 0.45), vec3(0.85, 1.0, 0.9), step(0.9, vHot));
  gl_FragColor = vec4(col * core * vAlpha * uHdr * 0.8, 1.0);
}
