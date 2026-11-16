// The sea patch around Neptunia's factory ship (world/seapatch.js): a ring
// grid of flat (x, z) points in the ship's anchor frame, lifted onto the sea
// and displaced by a sum of Gerstner waves. The wave statements and
// constants are generated from the JS wave table, so this surface and the CPU
// mirror the hull and swimmers ride are the same function.

varying vec2 vFlat;        // undisplaced anchor-frame (x, z)
varying vec3 vObjPos;      // planet-object position of the still sea (noise continuity with water.frag)
varying vec3 vWorldNormal; // still-sea normal, world
varying vec3 vTx;          // anchor +X and +Z in world: the slope basis
varying vec3 vTz;
varying vec3 vViewDir;

uniform float uTime;
uniform float uRw;    // water sphere radius
uniform float uScale; // 0 far .. 1 near
uniform mat4 uLocal;  // anchor frame -> planet object frame

//#CONSTS

void main() {
  vec2 p = position.xz;
  float r = length(p);
  float t = uTime;
  float amp = (1.0 - smoothstep(RELIEF_START, RELIEF_END, r)) * uScale;
  float h = 0.0, fold = 0.0;
  vec2 d = vec2(0.0), g = vec2(0.0);
//#WAVES

  // Still sea: a plane near the ship, easing onto the sphere farther out.
  float s = smoothstep(FLAT_IN, FLAT_OUT, r);
  float ys = sqrt(max(uRw * uRw - r * r, 0.0));
  vec3 base = vec3(p.x, mix(uRw, ys, s), p.y);
  vec3 n0 = normalize(mix(vec3(0.0, 1.0, 0.0), vec3(p.x, ys, p.y) / uRw, s));
  vec3 pos = base + vec3(d.x, h, d.y);

  vFlat = p;
  vObjPos = (uLocal * vec4(base, 1.0)).xyz;
  mat3 m = mat3(modelMatrix);
  vWorldNormal = normalize(m * n0);
  vTx = m * vec3(1.0, 0.0, 0.0);
  vTz = m * vec3(0.0, 0.0, 1.0);
  vec4 world = modelMatrix * vec4(pos, 1.0);
  vViewDir = cameraPosition - world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
