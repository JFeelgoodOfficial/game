// Tenretni's swarm (src/tenretni.js): every ship is one point, and its whole
// life is a function of the event clock uT (seconds, on the 90 s script) and
// a per-point seed — no CPU work per ship, no state. Leave the sphere, cross
// to terra on a bowed path, circle it, half of them settle on the city site,
// and all of them go home when the tunnel lets go.

attribute vec4 aSeed;

uniform float uT;
uniform vec3 uSphere; // sphere centre, event frame
uniform float uRs;
uniform vec3 uTerra;
uniform float uRt;
uniform vec3 uCity; // city site, event frame
uniform float uCitySpan; // world units
uniform float uScale; // px per unit at distance 1
uniform float uSize;

varying float vAlpha;
varying float vHot;

vec3 rotAxis(vec3 v, vec3 k, float a) {
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}

void main() {
  vec3 d0 = normalize(position);
  float launch = 27.0 + aSeed.x * 15.0;
  float a = uT - launch;

  vec3 p0 = uSphere + d0 * uRs;
  vec3 burst = uSphere + d0 * uRs * (1.4 + 0.9 * aSeed.y);

  // a place over terra, biased to the hemisphere facing the sphere, then
  // carried round the planet on its own axis
  vec3 toS = normalize(uSphere - uTerra);
  vec3 dT = normalize((aSeed.yzw - 0.5) * 2.0 + toS * 0.55);
  vec3 ax = normalize(cross(dT, vec3(aSeed.z - 0.5, aSeed.x - 0.5, aSeed.w - 0.5)) + 1e-4);
  dT = rotAxis(dT, ax, max(a, 0.0) * (0.03 + 0.07 * aSeed.w));
  vec3 over = uTerra + dT * uRt * (1.04 + 0.3 * aSeed.z * aSeed.z);

  float trav = 8.0 + 7.0 * aSeed.w;
  float k1 = smoothstep(0.0, 2.5, a);
  float k2 = smoothstep(1.2, 1.2 + trav, a);
  vec3 pos = mix(mix(p0, burst, k1), over, k2);
  pos += (aSeed.xyz - 0.5) * 900.0 * sin(3.14159 * k2);

  // builders: half the swarm comes down on the site
  float kc = step(aSeed.y, 0.5) * smoothstep(57.0 + aSeed.x * 6.0, 66.0 + aSeed.x * 6.0, uT);
  vec3 site = uCity + (aSeed.zwx - 0.5) * uCitySpan * (0.6 + 1.2 * (0.5 + 0.5 * sin(uT * 0.8 + aSeed.w * 30.0)));
  pos = mix(pos, site, kc);

  // recall
  float kr = smoothstep(72.0 + aSeed.x * 5.0, 79.0 + aSeed.x * 5.0, uT);
  pos = mix(pos, uSphere + d0 * uRs * 0.6, kr);

  vAlpha = step(0.0, a) * smoothstep(0.0, 0.6, a) * (1.0 - smoothstep(0.9, 1.0, kr));
  vHot = aSeed.z;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = vAlpha > 0.0 ? clamp(uSize * (0.6 + aSeed.w) * uScale / max(-mv.z, 1.0), 1.4, 9.0) : 0.0;
}
