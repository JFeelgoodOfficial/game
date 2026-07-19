// Crystal spires: fresnel rim light over a slow internal energy swirl.
// Replaces 22 transmission materials with one draw call.
uniform float uTime;
uniform float uNight;
uniform vec3 uColorA;
uniform vec3 uColorB;

varying float vPhase;
varying float vTint;
varying vec3 vNormal;
varying vec3 vViewPos;
varying vec3 vLocal;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec3 viewDir = normalize(-vViewPos);
  float fres = pow(1.0 - abs(dot(viewDir, normalize(vNormal))), 2.0);
  vec3 tint = mix(uColorA, uColorB, vTint);
  float pulse = 0.5 + 0.5 * sin(uTime * 0.35 + vPhase);
  float swirl = vnoise(vec2(vLocal.y * 0.35 - uTime * 0.2, vPhase + vLocal.x * 0.2));
  float night = mix(0.35, 1.0, uNight);
  vec3 body = tint * (0.18 + 0.35 * swirl) * night;
  vec3 rim = tint * fres * (0.7 + pulse * 0.8) * night;
  gl_FragColor = vec4(vec3(0.05, 0.04, 0.09) + body + rim, 0.9);
}
