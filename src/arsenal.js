// The on-foot arsenal: pure data, no three.js. It lives in src/ (the boot
// chunk) because two things read it that never load the combat code: the
// persistent inventory (which weapons you own) and the freighter's lounge
// (the weapon rack on the wall). The viewmodels, ballistics and sounds that
// act on these numbers are in world/warzone*.js.
//
// mode      — how the trigger works:
//   auto    hold to fire at `rpm`
//   semi    one shot per pull, no faster than `rpm`
//   charge  hold to charge (chargeTime), release to fire; damage scales
// ballistic — what a shot IS once it leaves the muzzle:
//   hitscan     one instant ray
//   pellets     `pellets` instant rays in a `pelletSpread` cone
//   pierce      one instant ray that passes through every monster on it
//   projectile  a slow arcing shell: splash on impact, then a burning patch
//   chain       an instant bolt that jumps on to nearby monsters
//
// `dmg` is per ray / per bolt / at the centre of a blast, before `crit`
// (weak-point multiplier) and range falloff. `world` is where the weapon's
// crate sits; null means you start with it.

const BASE = {
  crit: 2.5,
  reloadTime: 2.2, // empty
  tacReloadTime: 1.75, // round still chambered
  // spread: radians, half-angle of the cone
  hipSpread: 0.032,
  adsSpread: 0.0025,
  moveSpread: 0.03,
  airSpread: 0.06,
  bloomPerShot: 0.005,
  bloomMax: 0.03,
  bloomDecay: 0.09, // rad/s
  // recoil: aim actually climbs (pitch, yaw), the gun visibly kicks
  kickPitch: 0.0125,
  kickYaw: 0.0035,
  kickBack: 1, // viewmodel shove, relative to the carbine
  adsKickScale: 0.6,
  recoverRate: 5.5,
  recoverShare: 0.55,
  adsTime: 0.17,
  adsFov: 52,
  falloffStart: 60,
  falloffMul: 0.8,
  range: 300,
  tracerWidth: 0.022,
};

const def = (o) => Object.freeze({ ...BASE, ...o });

export const WEAPONS = {
  carbine: def({
    id: 'carbine', slot: 1, name: 'KV-9 CARBINE', world: null,
    blurb: 'Full-auto. Accurate in the sights. The gun you know.',
    mode: 'auto', ballistic: 'hitscan',
    dmg: 34, crit: 3.2, rpm: 660,
    magSize: 30, reserveStart: 210, reserveMax: 330, pickup: 45,
    tint: 0xff2a1a,
  }),
  scatter: def({
    id: 'scatter', slot: 2, name: 'BRAKK-8 SCATTERGUN', world: 'terra',
    blurb: 'Nine pellets a pull. Murder inside ten metres, noise beyond twenty.',
    mode: 'semi', ballistic: 'pellets', pellets: 9, pelletSpread: 0.06,
    dmg: 26, crit: 1.6, rpm: 78,
    magSize: 6, reserveStart: 36, reserveMax: 60, pickup: 12,
    reloadTime: 2.7, tacReloadTime: 2.3,
    hipSpread: 0.006, adsSpread: 0.004, moveSpread: 0.008, bloomPerShot: 0, bloomMax: 0,
    kickPitch: 0.062, kickYaw: 0.012, kickBack: 3.2, adsFov: 60,
    falloffStart: 14, falloffMul: 0.35, range: 70, tracerWidth: 0.016,
    tint: 0xffa040,
  }),
  lance: def({
    id: 'lance', slot: 3, name: 'HELIX RAIL LANCE', world: 'rustia',
    blurb: 'Hold to charge, release to fire. The slug goes through everything in line.',
    mode: 'charge', ballistic: 'pierce', chargeTime: 1.15, minCharge: 0.3,
    dmg: 540, crit: 2.5, rpm: 46,
    magSize: 4, reserveStart: 20, reserveMax: 32, pickup: 6,
    reloadTime: 2.9, tacReloadTime: 2.5,
    hipSpread: 0.012, adsSpread: 0.0004, moveSpread: 0.02, bloomPerShot: 0, bloomMax: 0,
    kickPitch: 0.075, kickYaw: 0.008, kickBack: 4, adsFov: 30, adsTime: 0.26,
    falloffStart: 1e9, falloffMul: 1, tracerWidth: 0.09,
    tint: 0x60f4ff,
  }),
  plasma: def({
    id: 'plasma', slot: 4, name: 'SUNSPOT PLASMA LAUNCHER', world: 'neptunia',
    blurb: 'Lobs a shell that bursts and leaves the ground burning. Mind your feet.',
    mode: 'semi', ballistic: 'projectile',
    proj: { speed: 48, gravity: 12, splash: 6.5, burnTime: 5, burnDps: 60, burnRadius: 3.6 },
    dmg: 340, crit: 1, rpm: 52,
    magSize: 3, reserveStart: 15, reserveMax: 24, pickup: 5,
    reloadTime: 3.0, tacReloadTime: 2.6,
    hipSpread: 0.008, adsSpread: 0.003, moveSpread: 0.012, bloomPerShot: 0, bloomMax: 0,
    kickPitch: 0.05, kickYaw: 0.006, kickBack: 3.4, adsFov: 58,
    falloffStart: 1e9, falloffMul: 1,
    tint: 0xff5ad0,
  }),
  arc: def({
    id: 'arc', slot: 5, name: 'TEMPEST ARC CASTER', world: 'wyattmattoe',
    blurb: 'A stream of lightning that jumps from one target to the next. Short reach.',
    mode: 'auto', ballistic: 'chain', chain: { hops: 4, range: 16, falloff: 0.72 },
    dmg: 30, crit: 1.5, rpm: 420,
    magSize: 60, reserveStart: 240, reserveMax: 360, pickup: 60,
    hipSpread: 0.02, adsSpread: 0.012, moveSpread: 0.01, bloomPerShot: 0, bloomMax: 0,
    kickPitch: 0.0035, kickYaw: 0.004, kickBack: 0.35, adsFov: 58,
    falloffStart: 1e9, falloffMul: 1, range: 42, tracerWidth: 0.05,
    tint: 0xb48cff,
  }),
};

export const WEAPON_ORDER = ['carbine', 'scatter', 'lance', 'plasma', 'arc'];
export const STARTER_WEAPON = 'carbine';

// The weapon whose crate sits in a given world's town, or null.
export function weaponForWorld(world) {
  for (const id of WEAPON_ORDER) if (WEAPONS[id].world === world) return id;
  return null;
}

// The four warzone worlds, for the trophy wall in the freighter's lounge: a
// titan killed on a world hangs its skull there in that brood's colour
// (matching world/monsters.js SKINS, which the boot chunk cannot import).
export const TROPHY_WORLDS = [
  { world: 'terra', name: 'CRIMSON BROOD', tint: 0xff3b2f },
  { world: 'rustia', name: 'DUSTJAW HORDE', tint: 0xff8a1f },
  { world: 'neptunia', name: 'TRENCH LEVIATHANS', tint: 0x3df0ff },
  { world: 'wyattmattoe', name: 'WHITEOUT MAULERS', tint: 0xc46bff },
];
