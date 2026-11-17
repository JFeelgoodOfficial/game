// The megaworld's towers (world/megaworld.js): one instanced box, a few
// thousand times, on a tile that wraps round the camera. The wrap is done
// here from per-instance attributes, so nothing is written per frame but two
// uniforms. Pairs with tenretniHull.frag, whose varyings it fills.
//
// CAGE_GLSL (world/megaworld.js) is prepended: uS and cage().

attribute vec2 aBase; // the tower's place on the tile, 0..uTile
attribute vec3 aDim; // width, height, depth
attribute float aSeed;

uniform vec2 uTileOff; // the camera's place, wrapped to the tile
uniform vec2 uOffCage; // ...and to the cage lattice's period
uniform float uTile;
uniform float uPad; // nothing stands on a cage's plate
uniform float uR;
uniform float uFade;

varying vec3 vPos;
varying vec3 vWorldNormal;
varying vec3 vView;
varying float vUp;

void main() {
  // where this tower is from the camera, on the nearest copy of the tile
  vec2 rel = mod(aBase - uTileOff + 0.5 * uTile, uTile) - 0.5 * uTile;
  float d = length(rel);
  // sinks into the roofscape toward the tile's edge, where the ground shader
  // takes over (and where the depth buffer stops telling them apart)
  float g = 1.0 - smoothstep(0.34 * uTile, 0.48 * uTile, d);
  vec2 L = rel + uOffCage;
  vec3 cg = cage(floor(L / uS));
  g *= mix(1.0, smoothstep(uPad, uPad * 1.2, distance(L, cg.xy)), cg.z);
  g *= uFade;

  vec3 pos = position * aDim;
  pos.y *= g;
  vUp = position.y;
  // windows are cut in the tower's own frame, a different stretch of it each
  vPos = pos + vec3(aSeed * 911.0, aSeed * 173.0, aSeed * 377.0);
  vWorldNormal = normal;
  vec4 world = modelMatrix * vec4(rel.x + pos.x, pos.y - d * d / (2.0 * uR), rel.y + pos.z, 1.0);
  vView = cameraPosition - world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  if (g <= 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
