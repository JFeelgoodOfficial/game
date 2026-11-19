// Entry Zero's lamp (GDD 5.7.5): one instrument, six bands, one band at a time.
//
// The Tenretni see everything at once, which is why they cannot find what they
// are looking for. The lamp does the opposite: it lights (or listens to) one
// band, and while it is on that band the pilot is blind to the other five.
// Everything in the hollow answers in the band its matter answers in, and
// nothing exists at one wavelength only: a thing shows because of what it is
// made of. The six, and why something shows in each:
//
//   blue-green   lit. Water passes 450-550 nm best, so the beam goes furthest
//                there; living light (luciferin) is tuned to the same window.
//   ultraviolet  lit. Pigments and minerals fluoresce: they take in UV and
//                give back visible light, so patterns appear that white light
//                does not show.
//   infrared     not lit: seen. Anything warm glows at about 10 µm by itself.
//                The lamp is only the eye here, so there is no cone, just a
//                range, and water swallows it within metres.
//   H-alpha      not lit: seen. Excited hydrogen gives off one line, 656.3 nm;
//                the lamp is a filter one line wide.
//   X-ray        lit, and it goes through: soft matter is thin to it and dense
//                matter is not, so what shows is what is inside. It costs dose.
//   radio        neither. Nothing is drawn. It is heard, from the way the lamp
//                is pointed (world/entryzero-audio.js).
//
// One set of uniforms (LAMP_U), shared by reference by every material that
// answers the lamp, and one GLSL chunk (LAMP_GLSL) that reads them. The lamp
// is carried by the submersible and later by hand; whoever carries it writes
// `lamp.pos` / `lamp.dir` and calls stepLamp once a frame.

import * as THREE from 'three';
import { C, EZ_REACH } from './constants.js';
import { BANDS } from '../world/entryzero-dialogue.js';

const idx = (id) => BANDS.findIndex((b) => b.id === id);
export const BAND = { BLUEGREEN: idx('bluegreen'), UV: idx('uv'), IR: idx('ir'), HALPHA: idx('halpha'), XRAY: idx('xray'), RADIO: idx('radio') };
// which bands are a beam (the rest are an eye, or an ear)
const LIT = BANDS.map((b) => b.id === 'bluegreen' || b.id === 'uv' || b.id === 'xray');
const TINTS = BANDS.map((b) => new THREE.Color(b.tint));
const WHITE = new THREE.Color(1, 1, 1);

export const lamp = {
  band: 0,
  on: true,
  all: false, // every band at once (held)
  canAll: false, // ...which has to be learned first
  energy: 1, // 0..1
  dose: 0, // 0..1, from the X-ray band; it does not come back down by itself
  cabin: 1, // 0..1, the warmth aboard (heat leeches take it)
  eaters: 0, // 0..1, how much of the beam light eaters are drinking
  feeders: 0, // 0..1, radiation feeders at the glass: the X-ray band costs more
  lineBeam: false, // at the firewall the H-alpha band is a beam too (world/hollow.js says why)
  power: 1, // how far it reaches against what the medium allows (the one carried by hand is weaker)
  medium: 'void', // 'void' | 'water' | 'fog': what the lamp is shining through
  pos: new THREE.Vector3(),
  dir: new THREE.Vector3(0, 0, 1),
  reach: 0, // of the band it is on, in this medium
  changed: 0, // counts band changes (the HUD and the sound watch it)
};

export const LAMP_U = {
  uBand: { value: 0 },
  uAll: { value: 0 },
  uLampOn: { value: 1 },
  uLampLit: { value: 1 }, // 1 on a band that is a beam, 0 on one that only sees
  uLampPos: { value: lamp.pos },
  uLampDir: { value: lamp.dir },
  uLampReach: { value: 0 },
  uLampCone: { value: Math.cos(C.EZ_LAMP_CONE) },
  uLampTint: { value: new THREE.Color() },
};

// For any shader that answers the lamp. World-space points throughout.
export const LAMP_GLSL = /* glsl */ `
  uniform float uBand;
  uniform float uAll;
  uniform float uLampOn;
  uniform float uLampLit;
  uniform vec3 uLampPos;
  uniform vec3 uLampDir;
  uniform float uLampReach;
  uniform float uLampCone;
  uniform vec3 uLampTint;
  // 1 while the lamp is on band b (or on every band at once)
  float lampBand(float b) { return uLampOn * max(uAll, 1.0 - step(0.5, abs(uBand - b))); }
  // how much reaches p at all: the medium takes the rest
  float lampRange(vec3 p) { return 1.0 - smoothstep(uLampReach * 0.55, uLampReach, distance(p, uLampPos)); }
  // how much of the beam falls on p: inside the cone, fading with range
  float lampBeam(vec3 p) {
    vec3 d = p - uLampPos;
    float c = dot(d / max(length(d), 1e-3), uLampDir);
    return smoothstep(uLampCone, mix(uLampCone, 1.0, 0.4), c) * lampRange(p);
  }
  // something at p that has to be lit to show in band b (blue-green, UV, X-ray)
  float lampLit(float b, vec3 p) { return lampBand(b) * lampBeam(p); }
  // something at p that gives off band b by itself (infrared, H-alpha): no cone
  float lampSeen(float b, vec3 p) { return lampBand(b) * lampRange(p); }
`;

function refresh() {
  const R = EZ_REACH[lamp.medium] || EZ_REACH.void;
  let reach = R[lamp.band];
  if (lamp.all) {
    // every band at once goes only as far as the band that goes least far
    reach = Infinity;
    for (let i = 0; i < R.length; i++) if (i !== BAND.RADIO && R[i] < reach) reach = R[i];
  }
  lamp.reach = reach * lamp.power;
  reach = lamp.reach;
  LAMP_U.uBand.value = lamp.band;
  LAMP_U.uAll.value = lamp.all ? 1 : 0;
  LAMP_U.uLampOn.value = lamp.on && lamp.energy > 0 ? 1 : 0;
  LAMP_U.uLampLit.value = lamp.all || LIT[lamp.band] || (lamp.lineBeam && lamp.band === BAND.HALPHA) ? 1 : 0;
  LAMP_U.uLampReach.value = reach;
  LAMP_U.uLampCone.value = Math.cos(C.EZ_LAMP_CONE);
  LAMP_U.uLampTint.value.copy(lamp.all ? WHITE : TINTS[lamp.band]);
}

export function setBand(i) {
  const n = BANDS.length;
  const b = ((i % n) + n) % n;
  if (b === lamp.band) return;
  lamp.band = b;
  lamp.changed++;
}
export const nextBand = (d) => setBand(lamp.band + d);
export function toggleLamp() {
  lamp.on = !lamp.on;
  lamp.changed++;
}
export const lampLive = () => lamp.on && lamp.energy > 0;
export const bandIsBeam = (i) => LIT[i];

// Once a frame, by whoever carries it. `all`: the every-band key is down.
export function stepLamp(dt, all) {
  lamp.all = !!all && lamp.canAll && lamp.on && lamp.energy > 0;
  if (lamp.on && lamp.energy > 0) {
    const rate = C.EZ_LAMP_DRAIN * (lamp.all ? C.EZ_LAMP_ALL : 1) * (1 + lamp.eaters * C.EZ_LAMP_EATEN);
    lamp.energy = Math.max(0, lamp.energy - rate * dt);
    // X-rays are the one band that costs the crew something
    if (lamp.all || lamp.band === BAND.XRAY) lamp.dose = Math.min(1, lamp.dose + C.EZ_DOSE_RATE * (1 + lamp.feeders * C.EZ_FEEDER_DOSE) * dt);
  } else if (!lamp.on) {
    lamp.energy = Math.min(1, lamp.energy + C.EZ_LAMP_RECHARGE * dt);
  }
  refresh();
}

// The same test the shaders make, for the log: does the lamp, as it is now,
// show something at `p` that answers in band `b`? 0..1.
const _d = new THREE.Vector3();
export function lampShows(b, p) {
  if (!lampLive() || !(lamp.all || lamp.band === b)) return 0;
  _d.subVectors(p, lamp.pos);
  const r = _d.length();
  if (r > lamp.reach) return 0;
  const c = r > 1e-3 ? _d.dot(lamp.dir) / r : 1;
  if (b === BAND.RADIO) return c > 0.9 ? 1 : 0; // heard along the way it points
  if (LIT[b]) return c > Math.cos(C.EZ_LAMP_CONE) ? 1 : 0;
  return c > 0.5 ? 1 : 0; // seen, not lit: anywhere ahead
}

// A fresh lamp (boarding, or pulled back along the lattice).
export function resetLamp(keepBand) {
  if (!keepBand) lamp.band = 0;
  lamp.on = true;
  lamp.all = false;
  lamp.energy = 1;
  lamp.dose = 0;
  lamp.cabin = 1;
  lamp.eaters = 0;
  lamp.feeders = 0;
  lamp.changed++;
  refresh();
}

export const lampState = () => ({ band: BANDS[lamp.band].id, on: lamp.on, all: lamp.all, canAll: lamp.canAll, energy: +lamp.energy.toFixed(3), dose: +lamp.dose.toFixed(3), cabin: +lamp.cabin.toFixed(3), medium: lamp.medium, reach: lamp.reach });
