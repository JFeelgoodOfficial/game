// Deep nebula additive sprite. Soft gaussian core with a hard corner clip so
// the square point never shows. Additive: the colour IS the light it adds, so
// overlapping low-brightness sprites accumulate into smooth gas. Shared by the
// gas, warm-emission, and star clouds — their aSize/aColor do the rest.

varying vec3 vColor;
varying float vAlpha;

void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0; // 0 centre .. 1 edge
  float a = exp(-r * r * 3.0);                 // soft gaussian falloff
  a *= smoothstep(1.0, 0.6, r);                // clip the corner
  gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
}
