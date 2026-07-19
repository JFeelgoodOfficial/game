// Shared passthrough vertex for the actuality world's flat shader planes
// (dragon hologram, city-in-the-box, mirror-room glass). UV out, standard MVP.
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
