// Independent pulse (and optional jittery neon flicker) per element, phase
// carried in a vertex/instance attribute so one material animates them all.
uniform float uTime;
uniform float uNight;
uniform float uBase;     // resting brightness
uniform float uAmp;      // pulse amplitude on top of uBase
uniform float uSpeed;    // pulse rate
uniform float uFlicker;  // 0 = smooth pulse; >0 adds hard neon dropout

varying float vPhase;
varying vec3 vTint;

float hash1(float p) { return fract(sin(p * 127.1) * 43758.5453); }

void main() {
  float pulse = 0.5 + 0.5 * sin(uTime * uSpeed + vPhase);
  // occasional single-beat dropout, per element, night only
  float flick = 1.0 - uFlicker * uNight * step(0.92, hash1(vPhase + floor(uTime * 9.0)));
  float level = (uBase + uAmp * pulse) * flick * mix(0.18, 1.0, uNight);
  gl_FragColor = vec4(vTint * level, 1.0);
}
