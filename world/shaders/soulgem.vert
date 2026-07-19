// Zone 2 soul-gems (actuality). Spherical-ized normals — normalize(position)
// instead of the face normal — give the faceted octahedron a smooth fresnel
// rim rather than hard per-face steps.
varying vec3 vN;
varying vec3 vV;

void main() {
  vN = normalize(normalMatrix * normalize(position));
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
