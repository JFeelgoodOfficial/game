varying float vA;
uniform float uHdr;
void main() {
  gl_FragColor = vec4(vec3(0.25, 1.0, 0.5) * vA * uHdr, 1.0);
}
