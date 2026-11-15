// The Sky City raceway (world/skycity.js builds the track; this drives it).
//
// Check in at the booth and you are put in a car on the grid with four others.
// Three laps. The track is a bare ribbon on pylons outside the city's rim:
// there are no barriers, so leaving it means going over the side. That is true
// for the player and for the other drivers, some of whom will misjudge a
// corner. Nobody dies of it: a recovery drone drops out of the mechanics' yard,
// gets a wire on the falling car, and tows it back to the yard for repairs.
// It does end that driver's race.
//
// Everything is in the city's local frame: +Y up, the road at track.y. A car
// is a point with a heading and a speed; "on the road" is city.trackAt().

import * as THREE from 'three';
import { C } from './constants.js';
import { input, moveAxes } from './input.js';

const R = {
  laps: 3,
  rivals: 4,
  maxSpeed: 46,
  accel: 20,
  brake: 44,
  drag: 0.35, // coast-down, 1/s
  reverse: 10,
  steer: 1.55, // rad/s at speed
  countdown: 3.2,
  rivalBase: 45, // u/s on a straight, before each driver's own pace
  rivalCorner: 850, // how hard a corner slows them (speed lost per unit curvature)
  fallGravity: 30,
  finishHold: 4, // seconds parked on the line before you are handed back
  fallMax: 42, // terminal velocity of a car in the air
  droneChase: 170, // u/s, diving after a falling car
  droneTow: 62, // u/s, with a car on the wire
  wire: 9, // length of the tow wire
  hookTime: 0.8, // seconds for the wire to take the weight and stop the fall
  towHeight: 34, // how far above the road the tow cruises
  shopHold: 2.2, // seconds in the bay before the player is handed back
};

const COLORS = [0xff3a4a, 0x3aa0ff, 0xffc83a, 0x5ae08a, 0xc86aff];

function buildCar(hex) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: hex, metalness: 0.5, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.8 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xff5040 });
  glow.color.multiplyScalar(1.8);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.6, 5), paint);
  body.position.y = 0.6;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 1.8), paint);
  nose.position.set(0, 0.5, 3.1);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 1.9), dark);
  cabin.position.set(0, 1.15, -0.3);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.12, 0.7), paint);
  wing.position.set(0, 1.5, -2.4);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.1), glow);
  tail.position.set(0, 0.7, -2.52);
  g.add(body, nose, cabin, wing, tail);
  for (const [x, z] of [[-1.25, 1.7], [1.25, 1.7], [-1.25, -1.7], [1.25, -1.7]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 10), dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.55, z);
    g.add(w);
  }
  return g;
}

// A recovery drone: a squat body, four ducted rotors, a winch lamp. One per
// car, built with it, parked on the yard's gantry until it is needed.
function buildDrone() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xe8b020, metalness: 0.4, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.7 });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xffd060 });
  lamp.color.multiplyScalar(2.2);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 2.2), hull);
  const winch = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 10), dark);
  winch.position.y = -0.7;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), lamp);
  eye.position.set(0, -0.2, 1.15);
  g.add(body, winch, eye);
  const rotors = [];
  for (const [x, z] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) {
    const duct = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.14, 6, 14), dark);
    duct.rotation.x = Math.PI / 2;
    duct.position.set(x, 0.25, z);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.22), lamp);
    blade.position.set(x, 0.25, z);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.9), dark);
    arm.position.set(x * 0.55, 0.2, z * 0.55);
    arm.rotation.y = Math.atan2(x, z);
    g.add(duct, blade, arm);
    rotors.push(blade);
  }
  // the wire: a unit cylinder stretched between winch and car each frame
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 5), dark);
  wire.visible = false;
  return { g, rotors, wire };
}

export const race = {
  active: false,
  phase: 'idle', // 'grid' | 'go' | 'done' | 'fell'
  t: 0,
  cars: [], // [0] is the player
  place: 0,
  message: '',
};

let city = null;
let seed = 1;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

function gridSlot(car, slot) {
  const tr = city.track;
  // two abreast, staggered back from the line
  const i = (tr.n - 4 - Math.floor(slot / 2) * 5) % tr.n;
  const p = tr.pts[i];
  const lane = slot % 2 ? 3.2 : -3.2;
  car.x = p.x - p.tz * lane;
  car.z = p.z + p.tx * lane;
  car.y = tr.y;
  car.heading = Math.atan2(p.tx, p.tz);
  car.i = i;
  car.lane = lane;
}

export function startRace(cityRef) {
  city = cityRef;
  endRace();
  seed = (performance.now() | 0) || 1;
  race.active = true;
  race.phase = 'grid';
  race.t = 0;
  race.place = 0;
  race.message = '';
  for (let k = 0; k <= R.rivals; k++) {
    const car = {
      mesh: buildCar(COLORS[k % COLORS.length]),
      player: k === 0,
      x: 0, z: 0, y: 0, heading: 0, speed: 0, vy: 0,
      i: 0, lane: 0, lap: 0, half: false, done: false, out: false, finishT: 0,
      pace: 0.9 + rnd() * 0.22,
      // Some rivals are going to get a corner wrong. Each picks a point of the
      // race (in laps) past which the next real bend takes them off.
      crashAt: rnd() < 0.4 ? 0.25 + rnd() * (R.laps - 0.5) : Infinity,
      spin: 0,
      drone: buildDrone(),
      rescue: null, // 'fall' | 'hook' | 'tow' | 'lower' | 'shop'
      rescueT: 0,
      bay: k,
    };
    gridSlot(car, k === 0 ? R.rivals : k - 1); // the player starts at the back
    city.group.add(car.mesh);
    car.drone.g.position.copy(city.shop.home);
    car.drone.g.position.x += (k - 2) * 0.01; // (stacked: they only show once launched)
    car.drone.g.visible = false;
    city.group.add(car.drone.g, car.drone.wire);
    race.cars.push(car);
    place(car);
  }
  return true;
}

export function endRace() {
  for (const c of race.cars) {
    for (const root of [c.mesh, c.drone.g, c.drone.wire]) {
      root.removeFromParent();
      root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
  }
  race.cars.length = 0;
  race.active = false;
  race.phase = 'idle';
}

function place(c) {
  c.mesh.position.set(c.x, c.y, c.z);
  c.mesh.rotation.set(c.spin, c.heading, c.spin * 0.6, 'YXZ');
}

// Lap bookkeeping off the centre-line sample: a lap counts when the car comes
// round to the line having been through the far side of the circuit.
function advance(c, i) {
  const n = city.track.n;
  if (i > n * 0.4 && i < n * 0.6) c.half = true;
  if (c.half && c.i > n * 0.75 && i < n * 0.25) {
    c.lap++;
    c.half = false;
    if (c.lap >= R.laps && !c.done) {
      c.done = true;
      c.finishT = race.t;
    }
  }
  c.i = i;
}

function progress(c) {
  return c.lap + c.i / city.track.n;
}

export function stepRace(dt) {
  if (!race.active) return;
  race.t += dt;
  const tr = city.track;
  const live = race.phase === 'go' || race.phase === 'done' || race.phase === 'fell';
  if (race.phase === 'grid' && race.t >= R.countdown) race.phase = 'go';

  for (const c of race.cars) {
    if (c.out) {
      stepRescue(c, dt);
      place(c);
      continue;
    }
    if (!live) { place(c); continue; }

    if (c.player) {
      if (race.phase === 'go') {
        const axes = moveAxes();
        const throttle = axes.fwd * axes.mag;
        if (throttle > 0) c.speed += R.accel * throttle * dt;
        else if (throttle < 0) c.speed -= (c.speed > 0 ? R.brake : R.accel * 0.5) * -throttle * dt;
        if (input.brake) c.speed -= Math.sign(c.speed) * R.brake * dt;
        c.speed -= c.speed * R.drag * dt;
        c.speed = Math.min(Math.max(c.speed, -R.reverse), R.maxSpeed);
        const grip = Math.min(Math.abs(c.speed) / 10, 1) * Math.sign(c.speed || 1);
        c.heading -= axes.strafe * axes.mag * R.steer * grip * dt;
      } else {
        c.speed *= Math.exp(-2.2 * dt); // finished: roll to a stop
      }
    } else {
      // Rivals steer for a point ahead on their lane and slow for the bends.
      const ahead = tr.pts[(c.i + 4) % tr.n];
      const tx = ahead.x - ahead.tz * c.lane, tz = ahead.z + ahead.tx * c.lane;
      const want = Math.atan2(tx - c.x, tz - c.z);
      const crashing = !c.done && progress(c) >= c.crashAt && Math.abs(tr.pts[c.i].curv) > 0.006;
      let d = want - c.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (!crashing) c.heading += Math.max(Math.min(d, 2.2 * dt), -2.2 * dt);
      const curve = Math.abs(tr.pts[(c.i + 6) % tr.n].curv);
      const target = c.done ? 0 : Math.max(R.rivalBase * c.pace - curve * R.rivalCorner, 24) * (crashing ? 1.25 : 1);
      c.speed += Math.max(Math.min(target - c.speed, R.accel * dt), -R.brake * dt);
    }

    c.x += Math.sin(c.heading) * c.speed * dt;
    c.z += Math.cos(c.heading) * c.speed * dt;
    const hit = city.trackAt(c.x, c.z);
    if (hit) advance(c, hit.i);
    else {
      c.out = true;
      c.vy = 0;
      c.rescue = 'fall';
      c.rescueT = 0;
      c.drone.g.visible = true;
      c.drone.g.position.copy(city.shop.home);
      if (c.player) race.phase = 'fell';
    }
    place(c);
  }

  // car-to-car: shove apart, nothing more
  for (let a = 0; a < race.cars.length; a++) {
    for (let b = a + 1; b < race.cars.length; b++) {
      const A = race.cars[a], B = race.cars[b];
      if (A.out || B.out) continue;
      const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
      if (d > 2.6 || d < 1e-4) continue;
      const push = (2.6 - d) / 2;
      A.x -= (dx / d) * push; A.z -= (dz / d) * push;
      B.x += (dx / d) * push; B.z += (dz / d) * push;
    }
  }

  const me = race.cars[0];
  if (race.phase === 'go' && me.done) {
    race.phase = 'done';
    race.place = 1 + race.cars.filter((c) => !c.player && c.done && c.finishT < me.finishT).length;
    race.doneT = race.t;
  }
}

// Over the side, and what happens next. The car falls and tumbles; its drone
// dives after it, puts the wire on, takes the weight, climbs clear of the road
// and carries it round to the mechanics' yard, where it is lowered into a bay.
const _to = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _yUp = new THREE.Vector3(0, 1, 0);
function flyDrone(d, x, y, z, speed, dt) {
  _to.set(x, y, z).sub(d.g.position);
  const dist = _to.length();
  const step = speed * dt;
  if (dist <= step) {
    d.g.position.set(x, y, z);
    return true;
  }
  d.g.position.addScaledVector(_to, step / dist);
  if (Math.abs(_to.x) + Math.abs(_to.z) > 0.5) d.g.rotation.y = Math.atan2(_to.x, _to.z);
  return false;
}

function stepRescue(c, dt) {
  const d = c.drone;
  const tr = city.track;
  const bay = city.shop.bays[c.bay];
  c.rescueT += dt;
  for (const r of d.rotors) r.rotation.y += dt * 38;

  if (c.rescue === 'fall') {
    c.vy = Math.max(c.vy - R.fallGravity * dt, -R.fallMax);
    c.speed *= Math.exp(-0.6 * dt);
    c.y += c.vy * dt;
    c.x += Math.sin(c.heading) * c.speed * dt;
    c.z += Math.cos(c.heading) * c.speed * dt;
    c.spin += dt * 2.4;
    // dive to a point just above the car; lead it a little, since it is falling
    if (flyDrone(d, c.x, c.y + R.wire + c.vy * 0.15, c.z, R.droneChase, dt)) {
      c.rescue = 'hook';
      c.rescueT = 0;
    }
  } else if (c.rescue === 'hook') {
    // the wire comes taut: the fall and the tumble die away under the drone
    const k = Math.exp(-5 * dt);
    c.vy *= k;
    c.speed *= k;
    c.y += c.vy * dt;
    c.spin *= Math.exp(-4 * dt);
    d.g.position.set(c.x, c.y + R.wire, c.z);
    if (c.rescueT >= R.hookTime) {
      c.rescue = 'tow';
      c.spin = 0;
      c.vy = 0;
      c.speed = 0;
    }
  } else if (c.rescue === 'tow' || c.rescue === 'lower') {
    const cruise = tr.y + R.towHeight + R.wire;
    let there = false;
    if (c.rescue === 'tow') {
      // straight up first if it is hanging below the road, then across
      if (d.g.position.y < cruise - 0.5 && Math.hypot(d.g.position.x - bay.x, d.g.position.z - bay.z) > 3) {
        const far = Math.hypot(d.g.position.x - bay.x, d.g.position.z - bay.z);
        const climb = Math.min(1, (cruise - d.g.position.y) / 40);
        // climb steeply while low, flattening out toward cruise height
        flyDrone(d,
          d.g.position.x + (bay.x - d.g.position.x) / far * 30 * (1 - climb * 0.8),
          d.g.position.y + 30 * climb + 1, d.g.position.z + (bay.z - d.g.position.z) / far * 30 * (1 - climb * 0.8),
          R.droneTow, dt);
      } else if (flyDrone(d, bay.x, cruise, bay.z, R.droneTow, dt)) {
        c.rescue = 'lower';
      }
    } else {
      there = flyDrone(d, bay.x, bay.y + R.wire, bay.z, R.droneTow * 0.4, dt);
    }
    // the car hangs under the winch, swinging a little, nose easing round to the bay
    const sway = Math.sin(c.rescueT * 2.1) * 0.5;
    c.x = d.g.position.x + sway;
    c.z = d.g.position.z + Math.cos(c.rescueT * 1.7) * 0.35;
    c.y = d.g.position.y - R.wire;
    let dh = city.shop.heading - c.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    c.heading += dh * Math.min(1, 1.5 * dt);
    if (there) {
      c.rescue = 'shop';
      c.rescueT = 0;
      c.x = bay.x; c.y = bay.y; c.z = bay.z;
      c.heading = city.shop.heading;
    }
  } else {
    // in the bay: the drone lets go and returns to the gantry
    flyDrone(d, city.shop.home.x, city.shop.home.y, city.shop.home.z, 20, dt);
  }

  // draw the wire from the winch to the car's roof while it is attached
  const wired = c.rescue === 'hook' || c.rescue === 'tow' || c.rescue === 'lower';
  d.wire.visible = wired;
  if (wired) {
    _to.set(c.x, c.y + 1.3, c.z).sub(d.g.position);
    _to.y += 0.7;
    const len = _to.length();
    _mid.copy(d.g.position).addScaledVector(_to, 0.5);
    _mid.y -= 0.35;
    d.wire.position.copy(_mid);
    d.wire.scale.set(1, len, 1);
    d.wire.quaternion.setFromUnitVectors(_yUp, _to.multiplyScalar(1 / len));
  }
}

// How long the player's car has been sitting in the shop, or -1.
export function raceTowedFor() {
  const me = race.cars[0];
  return race.active && me && me.rescue === 'shop' ? me.rescueT : -1;
}
export const RACE_SHOP_HOLD = R.shopHold;

const ORD = ['', '1ST', '2ND', '3RD', '4TH', '5TH'];

// One line of HUD, shown where the on-foot prompt goes.
export function raceHud() {
  if (!race.active) return null;
  const me = race.cars[0];
  if (race.phase === 'grid') {
    const left = Math.ceil(R.countdown - race.t - 0.2);
    return left > 0 ? `GET READY — ${left}` : 'GO!';
  }
  if (race.phase === 'fell') {
    return me.rescue === 'fall' ? 'OFF THE TRACK — RECOVERY DRONE INBOUND'
      : me.rescue === 'shop' ? 'IN THE SHOP — THE MECHANICS HAVE IT'
        : 'ON THE WIRE — TOWING YOU TO THE SHOP';
  }
  const running = race.cars.filter((c) => !c.out).length;
  if (race.phase === 'done') return `FINISHED ${ORD[race.place]} OF ${race.cars.length} · ${running} STILL ON THE TRACK`;
  const pos = 1 + race.cars.filter((c) => !c.player && !c.out && progress(c) > progress(me)).length;
  return `LAP ${Math.min(me.lap + 1, R.laps)}/${R.laps} · ${ORD[pos]} OF ${running} · ${Math.round(Math.abs(me.speed) * 3.6)} KM/H · G — QUIT`;
}

export function raceFinishedFor() {
  return race.phase === 'done' ? race.t - race.doneT : -1;
}
export const RACE_FINISH_HOLD = R.finishHold;
