// Deep nebula sprite vertex shader. Unlike the starfield (which sizes points
// to stay roughly screen-constant because it wraps infinitely), these sprites
// are a FIXED WORLD SIZE, so they swell as you approach and stream past — the
// fly-through sensation. uScale maps a world radius to pixels:
//   uScale = 0.5 * viewportHeightPx / tan(fov/2)  (pushed per frame; fov moves
//   on boost/warp). gl_PointSize = aSize * uScale / distance.

uniform float uScale;
uniform float uPixelRatio;
uniform float uIntensity;

attribute vec3 aColor;
attribute float aSize; // sprite world radius

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = -mv.z;

  gl_PointSize = clamp(aSize * uScale / max(dist, 1.0), 1.0, 900.0) * uPixelRatio;

  // Near-fade: dissolve sprites the camera is passing through so flying inside
  // the cloud fades gas out instead of whiting the screen.
  vAlpha = smoothstep(aSize * 0.6, aSize * 3.0, dist);

  vColor = aColor * uIntensity;
  gl_Position = projectionMatrix * mv;
}
