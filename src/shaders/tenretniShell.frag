// The inside of the hollowed world (src/tenretni.js): an inward-facing sphere
// seen only through the bore. Dark ribs and decks lit orange by the core in
// the middle, with the same green lights as everything else Tenretni builds.

varying vec3 vObj;

uniform float uTime;
uniform float uHeat;
uniform float uHdr;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec3 p = normalize(vObj);
  // latitude/longitude ribs about the bore axis (object +Y)
  float lat = acos(clamp(p.y, -1.0, 1.0));
  float lon = atan(p.z, p.x);
  vec2 g = vec2(lon * 14.0 / 6.2832 * 6.2832, lat * 9.0);
  vec2 id = floor(g);
  vec2 f = fract(g);
  float rib = max(1.0 - smoothstep(0.0, 0.07, min(f.x, 1.0 - f.x)), 1.0 - smoothstep(0.0, 0.09, min(f.y, 1.0 - f.y)));
  float plate = hash(id);
  vec3 base = vec3(0.05, 0.055, 0.05) * (0.5 + plate) * (1.0 - 0.6 * rib);
  // the core lights every wall evenly: it sits at the centre of the sphere
  vec3 lit = base * (0.4 + 3.2 * uHeat) * vec3(1.0, 0.5, 0.2);
  // decks: bands of windows on some plates
  vec2 wg = g * vec2(9.0, 5.0);
  float wh = hash(floor(wg) + 7.0);
  vec2 wf = fract(wg);
  float on = step(0.86, wh) * step(0.2, wf.x) * step(wf.x, 0.8) * step(0.3, wf.y) * step(wf.y, 0.7) * step(0.35, plate);
  lit += vec3(0.15, 1.0, 0.45) * on * uHdr * (0.7 + 0.3 * sin(uTime * 1.1 + wh * 40.0));
  lit += vec3(0.1, 0.9, 0.4) * rib * 0.12 * uHdr;
  gl_FragColor = vec4(lit, 1.0);
}
