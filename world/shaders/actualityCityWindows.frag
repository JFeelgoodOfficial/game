// Procedural, animated window grid for the hub city in world/actuality.js.
//
// Replaces a baked CanvasTexture. A painted grid is the same frozen pattern for
// the life of the world, and with a handful of shared variants the repeat is
// obvious — it reads as printed wallpaper rather than as a city. Here every
// window cell is hashed from its own coordinates plus a per-building seed, so
// no two facades match, and each cell keeps its own slow on/off schedule so
// lights come and go while you stand there.
//
// Cost is one shader over the whole merged skyline: no textures, no per-block
// material, one draw call.

uniform float uTime;

varying vec2 vWinUv;
varying float vSeed;
varying float vFade;   // distance haze, computed in the vertex shader

// Cheap 2D hash. Three different constants give three uncorrelated streams
// from the same cell, which is enough for on/off, phase and colour.
float hash21(vec2 p, float salt) {
  vec3 p3 = fract(vec3(p.xyx) * (0.1031 + salt * 0.0007));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  // vWinUv already carries the per-building repeat, so one unit is one window.
  vec2 cell = floor(vWinUv);
  vec2 f = fract(vWinUv);

  // The pane itself, inset in its cell so there is mullion between windows.
  float pane = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.76);
  if (pane < 0.5) discard;

  float hOn = hash21(cell, vSeed);
  float hPhase = hash21(cell + 17.0, vSeed + 3.0);
  float hRate = hash21(cell + 41.0, vSeed + 7.0);
  float hWarm = hash21(cell + 91.0, vSeed + 11.0);

  // Whole storeys tend to be occupied or dark together — an office floor is lit
  // as a floor. Bias each cell by its row, then let the cell vary on top.
  float floorBias = hash21(vec2(3.0, cell.y), vSeed + 23.0);
  // Halved against the doubled grid density, so twice as many lights are on
  // rather than four times as many.
  float occupancy = mix(0.03, 0.28, floorBias * floorBias);

  // Each window keeps its own slow cycle: a long period, its own phase, and a
  // duty fraction set by occupancy. Windows switch independently over minutes,
  // which is what stops the facade reading as a still image.
  float period = 55.0 + hRate * 140.0;
  float cyc = fract(uTime / period + hPhase);
  float on = step(cyc, occupancy) * step(hOn, 0.72);
  if (on < 0.5) discard;

  // A brief warm-up/cool-down at the edges of a window's lit stretch, so
  // switches read as someone flicking a light rather than as popping.
  float edge = min(cyc, occupancy - cyc) / max(occupancy, 0.001);
  float settle = smoothstep(0.0, 0.06, edge);

  vec3 warm = mix(vec3(1.0, 0.80, 0.52), vec3(1.0, 0.93, 0.80), hWarm);
  float bright = (0.55 + hWarm * 0.65) * settle * vFade;
  gl_FragColor = vec4(warm * bright, bright);
}
