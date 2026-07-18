// On-foot station mode: dock at the Orbital Art Gallery (G at the berth)
// and walk its interior in low gravity — the spine rooms, the viewing
// promenade, and the four gallery decks of the Grand Hall tower.
//
// The planet walker (walk.js) is radial: up is pos - planetCenter and the
// floor is a sphere. The station never tilts — its transform is only ever
// rotation.y = t * spin plus the orbital translation (stations.js) — so
// this walker runs in the station group's flat LOCAL frame: sWalk.pos is
// station-local with y = feet, and every frame the world position is
// re-derived as rotateY(pos, spin) + group.position and written into
// ship.position. That one write keeps origin rebases, nav, music, and the
// captain's log working unchanged (the walk.js convention), and makes the
// orbit + spin carry the player for free — terra sweeps past the windows
// while your feet stay put.
//
// Collision reuses the duck-typed {surfaceYAt, resolveWalls} contract the
// city lobbies established: makeStructure (world/city.js) covers the
// rectangular spine rooms, and a bespoke radial structure (polar math —
// annular decks, spiral ramps, shell clamp, jumpable rails) covers the
// cylindrical tower. Layout numbers come from galleryLayout.js, the same
// module stations.js builds the visible geometry from.
//
// walk.js dispatches its public surface here whenever stationActive() —
// game.js keeps using phase 'walk' and never knows the difference.

import * as THREE from 'three';
import { C } from './constants.js';
import { input } from './input.js';
import { ship } from './ship.js';
import { updateStations } from './stations.js';
import * as GL from './galleryLayout.js';
import { makeStructure } from '../world/city.js';
import { createCrowd } from '../world/aliens.js';
import { createShip as createParkedShip } from '../world/ship.js';
import {
  getViewPref,
  showViewChooser,
  showViewToast,
  hideViewUI,
  toggleViewPref,
} from './walkview.js';
import {
  openDialogue,
  advanceDialogue,
  isDialogueOpen,
  closeDialogue,
} from './dialogue.js';

const LOOK_SENS = 0.0022;
const MAX_PITCH = 1.483;
const FACE_TURN = 12.0;
const CAM_SMOOTH = 9.0;
const PLAYER_RADIUS = 0.7;
const TALK_DIST = 2.6;
const TALK_BREAK_DIST = 8;
const CAM_MIN = 2.5; // interior third-person zoom clamp (hallways are ~6 wide)
const CAM_MAX = 7;
const HEAD_ROOM = 2.05; // spine rooms cap jumps here below the ceiling
const VOID_FLOOR = -25; // fell out of the station: safety-field respawn
const SUN_DOT = 0.55; // interior lighting stands in for the day cycle

const D2R = Math.PI / 180;

export const sWalk = {
  active: false,
  station: null, // the gallery's stations[] entry
  pos: new THREE.Vector3(), // station-local, y = feet height
  yaw: 0, // station-local look heading (0 = local +Z)
  pitch: 0,
  vel: new THREE.Vector3(), // station-local horizontal velocity (y unused)
  vUp: 0,
  jumpHeld: false,
  grounded: true,
  mode: 'idle', // 'idle' | 'run' | 'jump' — drives astronaut + HUD
  speed01: 0,
  view: 'tp',
  camDist: 5,
  facingYaw: 0, // body heading, follows the velocity
};

let astronaut = null; // shared with walk.js (initStationWalk)
let structures = null; // collision, built once on first dock
let parked = null; // the player's docked ship mesh
let crowds = []; // [{ module, deckY }]
let camSnap = true;

// Interaction focus (world/interaction.js contract, host side — same shape
// as walk.js's scan loop, minus quests: gallery crowds are questChance 0).
let focusEntity = null;
let focusModule = null;
let focusD2 = Infinity;
let talkEntity = null;
let talkModule = null;

// Scratch — zero allocation in the per-frame paths.
const _yAxis = new THREE.Vector3(0, 1, 0);
const _world = new THREE.Vector3();
const _look = new THREE.Vector3();
const _target = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _move = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _camOffset = new THREE.Vector3();
const _out = new THREE.Vector3();
const _bearingOut = { angle: 0, dist: 0 };

export function initStationWalk(astronautRef) {
  astronaut = astronautRef;
}

export function stationActive() {
  return sWalk.active;
}

// ---------------------------------------------------------------------------
// Collision structures
// ---------------------------------------------------------------------------

// The spine rooms: one makeStructure in the shared contract. Coordinates are
// local to (ROOMS.ox, ROOMS.oz); baseY 0 keeps y values absolute. Window
// openings collide full-height (invisible glass) so nobody hops a sill into
// hard vacuum; the visual sill/header band is stations.js's job.
function buildRoomStructure() {
  const R = GL.ROOMS;
  const oz = R.oz;
  const lz = (z) => z - oz;
  const bp = R.berthPad;
  const al = R.airlock;
  const pr = R.promenade;
  const bay = R.bay;
  const cw = R.crew;
  const vs = R.vestibule;
  const surfaces = [
    { x0: bp.x0, x1: bp.x1, z0: lz(bp.z0), z1: lz(bp.z1), y: bp.topY },
    { x0: al.x0, x1: al.x1, z0: lz(al.z0), z1: lz(al.z1), y: R.floorY },
    { x0: pr.x0, x1: pr.x1, z0: lz(pr.z0), z1: lz(pr.z1), y: R.floorY },
    { x0: bay.x0, x1: pr.x0, z0: lz(bay.z0), z1: lz(bay.z1), y: R.floorY },
    { x0: cw.x0, x1: cw.x1, z0: lz(cw.z0), z1: lz(cw.z1), y: R.floorY },
    {
      ramp: true,
      x0: vs.x0, x1: vs.x1, z0: lz(vs.z0), z1: lz(vs.z1),
      zA: lz(vs.z0), zB: lz(vs.z1), yA: R.floorY, yB: 0,
    },
  ];
  const y0 = R.floorY - 0.5;
  const y1 = R.ceilY;
  const walls = [
    // airlock: north, west segments around the pad door, east, aft doorway
    { x0: al.x0 - 0.6, x1: al.x1 + 0.6, z0: lz(al.z0) - 0.6, z1: lz(al.z0), y0, y1 },
    { x0: al.x0 - 0.6, x1: al.x0, z0: lz(al.z0), z1: lz(R.padDoor.z0), y0, y1 },
    { x0: al.x0 - 0.6, x1: al.x0, z0: lz(R.padDoor.z1), z1: lz(al.z1), y0, y1 },
    { x0: al.x1, x1: al.x1 + 0.6, z0: lz(al.z0), z1: lz(al.z1), y0, y1 },
    { x0: al.x0, x1: R.aftDoor.x0, z0: lz(al.z1), z1: lz(al.z1) + 0.6, y0, y1 },
    { x0: R.aftDoor.x1, x1: al.x1, z0: lz(al.z1), z1: lz(al.z1) + 0.6, y0, y1 },
    // promenade west glass (full height) outside the bay span, bay glass, returns
    { x0: pr.x0 - 0.6, x1: pr.x0, z0: lz(pr.z0), z1: lz(bay.z0), y0, y1 },
    { x0: pr.x0 - 0.6, x1: pr.x0, z0: lz(bay.z1), z1: lz(pr.z1), y0, y1 },
    { x0: bay.x0 - 0.6, x1: bay.x0, z0: lz(bay.z0), z1: lz(bay.z1), y0, y1 },
    { x0: bay.x0, x1: pr.x0, z0: lz(bay.z0) - 0.6, z1: lz(bay.z0), y0, y1 },
    { x0: bay.x0, x1: pr.x0, z0: lz(bay.z1), z1: lz(bay.z1) + 0.6, y0, y1 },
    // promenade east wall around the crew door
    { x0: pr.x1, x1: pr.x1 + 0.6, z0: lz(pr.z0), z1: lz(R.crewDoor.z0), y0, y1 },
    { x0: pr.x1, x1: pr.x1 + 0.6, z0: lz(R.crewDoor.z1), z1: lz(pr.z1), y0, y1 },
    // crew bay shell + furniture
    { x0: pr.x1 + 0.6, x1: cw.x1, z0: lz(cw.z0) - 0.6, z1: lz(cw.z0), y0, y1 },
    { x0: pr.x1 + 0.6, x1: cw.x1, z0: lz(cw.z1), z1: lz(cw.z1) + 0.6, y0, y1 },
    { x0: cw.x1, x1: cw.x1 + 0.6, z0: lz(cw.z0), z1: lz(cw.z1), y0, y1 },
    { x0: cw.x1 - 0.8, x1: cw.x1, z0: lz(74), z1: lz(80), y0, y1: R.floorY + 2.9 }, // console
    { x0: 10.8, x1: 12.2, z0: lz(69.8), z1: lz(71.2), y0, y1: R.floorY + 2.7 }, // crates
    { x0: 12.65, x1: 13.75, z0: lz(71.65), z1: lz(72.75), y0, y1: R.floorY + 1.7 },
    // vestibule side walls (tall band covers the whole ramp descent)
    { x0: vs.x0 - 0.6, x1: vs.x0, z0: lz(vs.z0), z1: lz(vs.z1), y0: -1, y1 },
    { x0: vs.x1, x1: vs.x1 + 0.6, z0: lz(vs.z0), z1: lz(vs.z1), y0: -1, y1 },
  ];
  return makeStructure(R.ox, oz, 0, surfaces, walls, R.halfExtent);
}

// The tower: same two-method contract in polar coordinates about the tower
// axis. Floors are the atrium disc, the notched deck annuli, and the spiral
// ramps; walls are the shell clamp (with the vestibule door gap), the
// jumpable inner-edge rails, the ramp edge clamps, and the atrium furniture.
function buildTowerStructure() {
  const TX = GL.TOWER.x;
  const TZ = GL.TOWER.z;
  const notches = GL.DECK_NOTCH.map((n) => (n ? [n[0] * D2R, n[1] * D2R] : null));
  const ramps = GL.RAMPS.map((r) => ({
    th0: r.th0 * D2R,
    th1: r.th1 * D2R,
    yA: r.yA,
    yB: r.yB,
  }));
  const doorTh = GL.SHELL_DOOR.thDeg * D2R;
  const doorHalf = GL.SHELL_DOOR.halfDeg * D2R;
  const circles = [
    { x: GL.DAIS.x, z: GL.DAIS.z, r: GL.DAIS.r },
    { x: GL.DESK.x, z: GL.DESK.z, r: GL.DESK.r },
    { x: GL.EASELS[0].x, z: GL.EASELS[0].z, r: GL.EASELS[0].r },
    { x: GL.EASELS[1].x, z: GL.EASELS[1].z, r: GL.EASELS[1].r },
  ];
  const rampY = (rp, th) => rp.yA + ((rp.yB - rp.yA) * (th - rp.th0)) / (rp.th1 - rp.th0);

  return {
    surfaceYAt(x, z, feetY) {
      const dx = x - TX;
      const dz = z - TZ;
      const r = Math.hypot(dx, dz);
      if (r > GL.towerR(140) + 4) return null;
      let th = Math.atan2(dz, dx);
      if (th < 0) th += Math.PI * 2;
      let best = null;
      const consider = (y) => {
        if (y <= feetY + 0.7 && (best === null || y > best)) best = y;
      };
      if (r <= GL.ATRIUM_FLOOR_R + 0.4) consider(GL.DECKS[0]);
      for (let d = 1; d < GL.DECKS.length; d++) {
        const y = GL.DECKS[d];
        if (r < GL.DECK_INNER_R || r > GL.towerR(y) - 0.3) continue;
        const n = notches[d];
        const inNotch =
          r >= GL.RAMP_R_IN && r <= GL.RAMP_R_OUT && th >= n[0] && th <= n[1];
        if (!inNotch) consider(y);
      }
      for (const rp of ramps) {
        if (r < GL.RAMP_R_IN - 0.35 || r > GL.RAMP_R_OUT + 0.35) continue;
        if (th < rp.th0 || th > rp.th1) continue;
        consider(rampY(rp, th));
      }
      return best;
    },
    resolveWalls(p, radius) {
      const dx = p.x - TX;
      const dz = p.z - TZ;
      let r = Math.hypot(dx, dz);
      if (r < 1e-6 || r > GL.towerR(140) + 6 || p.y < -4) return false;
      let th = Math.atan2(dz, dx);
      if (th < 0) th += Math.PI * 2;
      let newR = r;
      // shell clamp — the tapered wall, with the vestibule door sector open
      const shell = GL.towerR(p.y) - 1.2;
      if (r > shell && r < shell + 2.7) {
        let dTh = Math.abs(th - doorTh);
        if (dTh > Math.PI) dTh = Math.PI * 2 - dTh;
        const inDoor = dTh < doorHalf && p.y < GL.SHELL_DOOR.top;
        if (!inDoor) newR = shell;
      }
      // inner-edge rails on decks B/C/D: a low band — blocked on foot,
      // cleared by a low-g jump (drop into the atrium is allowed)
      for (let d = 1; d < GL.DECKS.length; d++) {
        const y = GL.DECKS[d];
        if (p.y < y - 0.3 || p.y > y + GL.RAIL_HEIGHT) continue;
        const lo = GL.DECK_INNER_R - 0.3 - radius;
        const hi = GL.DECK_INNER_R + 0.3 + radius;
        if (newR > lo && newR < hi) {
          newR = newR < GL.DECK_INNER_R ? lo : hi;
        }
      }
      // ramp edge clamps, active while actually on that ramp's surface
      for (const rp of ramps) {
        if (th < rp.th0 || th > rp.th1) continue;
        if (Math.abs(p.y - rampY(rp, th)) > 2) continue;
        const lo = GL.RAMP_R_IN + 0.35;
        const hi = GL.RAMP_R_OUT - 0.35;
        if (newR < lo) newR = lo;
        else if (newR > hi) newR = hi;
      }
      let pushed = false;
      if (newR !== r) {
        const s = newR / r;
        p.x = TX + dx * s;
        p.z = TZ + dz * s;
        pushed = true;
        r = newR;
      }
      // atrium furniture push-out (only near the floor)
      if (p.y < GL.DECKS[0] + 3) {
        for (const c of circles) {
          const cx = p.x - c.x;
          const cz = p.z - c.z;
          const rr = c.r + radius;
          const dd = cx * cx + cz * cz;
          if (dd < rr * rr && dd > 1e-6) {
            const dist = Math.sqrt(dd);
            p.x = c.x + (cx / dist) * rr;
            p.z = c.z + (cz / dist) * rr;
            pushed = true;
          }
        }
      }
      return pushed;
    },
  };
}

// ---------------------------------------------------------------------------
// Dock / undock
// ---------------------------------------------------------------------------

function writeShipPos() {
  const st = sWalk.station;
  _world
    .copy(sWalk.pos)
    .applyAxisAngle(_yAxis, st.group.rotation.y)
    .add(st.group.position);
  ship.position.copy(_world);
  ship.velocity.set(0, 0, 0);
}

function spawnCrowds(station) {
  const TX = GL.TOWER.x;
  const TZ = GL.TOWER.z;
  const pt = (deg, r) => ({
    x: TX + Math.cos(deg * D2R) * r,
    z: TZ + Math.sin(deg * D2R) * r,
    r: 2.5,
  });
  const mk = (plazaCenters, colliders, groundY, opts) => {
    const m = createCrowd(
      {
        cityId: 'art-gallery',
        plazaCenters,
        colliders,
        groundHeightAt: () => groundY,
      },
      { questChance: 0, ...opts }
    );
    station.group.add(m.group);
    crowds.push({ module: m, deckY: groundY });
  };
  const furniture = [
    { x: GL.DAIS.x, z: GL.DAIS.z, radius: GL.DAIS.r },
    { x: GL.DESK.x, z: GL.DESK.z, radius: GL.DESK.r },
    { x: GL.EASELS[0].x, z: GL.EASELS[0].z, radius: GL.EASELS[0].r },
    { x: GL.EASELS[1].x, z: GL.EASELS[1].z, radius: GL.EASELS[1].r },
  ];
  // the curator, planted by the atrium desk
  mk([{ x: GL.DESK.x, z: GL.DESK.z + 2.2, r: 1 }], furniture, 0, {
    population: 1, maxRigs: 1, seed: 501, culture: 'curator', stationaryFirst: true,
  });
  // atrium gallery-goers drifting between the wall pieces
  mk([pt(100, 50), pt(205, 50), pt(320, 50)], furniture, 0, {
    population: 3, maxRigs: 3, seed: 502, culture: 'gallerygoer',
  });
  // deck B gallery-goers
  mk([pt(30, 50), pt(250, 50), pt(300, 50)], [], GL.DECKS[1], {
    population: 3, maxRigs: 3, seed: 503, culture: 'gallerygoer',
  });
  // the roaming deck C technician
  mk([pt(60, 48), pt(200, 48)], [], GL.DECKS[2], {
    population: 1, maxRigs: 1, seed: 504, culture: 'technician',
  });
  // crew-bay technicians, the first planted at the console
  mk([{ x: 9, z: 76, r: 2 }], [], GL.ROOMS.floorY, {
    population: 2, maxRigs: 2, seed: 505, culture: 'technician', stationaryFirst: true,
  });
}

// Tear down everything a dock spawned. Safe to call twice (reset hardening).
function teardown() {
  closeDialogue(); // onClose runs endInteract against live modules
  focusEntity = null;
  focusModule = null;
  talkEntity = null;
  talkModule = null;
  const st = sWalk.station;
  for (const c of crowds) {
    if (st) st.group.remove(c.module.group);
    c.module.dispose();
  }
  crowds = [];
  if (parked) {
    parked.dispose(); // removes its own group from the station group
    parked = null;
  }
  if (astronaut) astronaut.group.visible = false;
  hideViewUI();
  sWalk.active = false;
  sWalk.station = null;
}

// G at the gallery berth (game.js gate). Returns true when the dock takes —
// walkLazy's facade returns false before the walk chunk has loaded.
export function enterStationWalk(station) {
  if (!station || !station.dock) return false;
  if (sWalk.active) teardown(); // self-cleaning (reset hardening)
  if (!structures) structures = [buildRoomStructure(), buildTowerStructure()];

  sWalk.active = true;
  sWalk.station = station;
  sWalk.pos.set(GL.SPAWN.x, GL.SPAWN.y, GL.SPAWN.z);
  sWalk.yaw = 0; // facing local +Z, down the airlock toward the promenade
  sWalk.pitch = 0;
  sWalk.vel.set(0, 0, 0);
  sWalk.vUp = 0;
  sWalk.jumpHeld = false;
  sWalk.grounded = true;
  sWalk.mode = 'idle';
  sWalk.speed01 = 0;
  sWalk.facingYaw = 0;
  sWalk.camDist = 5;
  camSnap = true;

  ship.velocity.set(0, 0, 0);
  ship.angularVelocity.set(0, 0, 0);
  ship.properAccel.set(0, 0, 0);
  writeShipPos();

  // The player's ship, parked on the berth pad, nose out along -X.
  parked = createParkedShip(station.group, {});
  parked.group.position.set(GL.BERTH_LOCAL.x, GL.BERTH_LOCAL.y, GL.BERTH_LOCAL.z);
  parked.group.rotation.y = -Math.PI / 2;

  spawnCrowds(station);

  // First time on foot ever: offer the view choice (walk.js idiom).
  const pref = getViewPref();
  if (pref) {
    sWalk.view = pref;
    showViewToast('T — TOGGLE VIEW');
  } else {
    sWalk.view = 'tp';
    showViewChooser((v) => {
      sWalk.view = v;
      camSnap = true;
    });
  }
  return true;
}

// G at the airlock: undock — the ship reappears off the spine, drifting
// gently away; the station recedes on its orbit behind you.
export function exitStationDock(camera) {
  const st = sWalk.station;
  if (!st) return;
  const rotY = st.group.rotation.y;
  _out.set(-1, 0, 0).applyAxisAngle(_yAxis, rotY); // world outward, off the pad
  ship.position
    .set(-C.STATION_UNDOCK_OFFSET, GL.BERTH_LOCAL.y + 5, GL.BERTH_LOCAL.z)
    .applyAxisAngle(_yAxis, rotY)
    .add(st.group.position);
  ship.velocity.copy(_out).multiplyScalar(C.STATION_UNDOCK_SPEED);
  ship.angularVelocity.set(0, 0, 0);
  ship.properAccel.set(0, 0, 0);
  ship.quaternion.setFromUnitVectors(_look.set(0, 0, -1), _out);

  if (camera) {
    camera.position.copy(ship.position);
    camera.quaternion.copy(ship.quaternion);
    camera.fov = C.FOV;
    camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();
  }
  teardown();
}

// ---------------------------------------------------------------------------
// The controller
// ---------------------------------------------------------------------------

export function stepStationWalk(dt) {
  // mouse look (station-local heading)
  sWalk.yaw -= input.mouseX * LOOK_SENS;
  sWalk.pitch -= input.mouseY * LOOK_SENS;
  sWalk.pitch = Math.min(Math.max(sWalk.pitch, -MAX_PITCH), MAX_PITCH);
  input.mouseX = 0;
  input.mouseY = 0;

  const sinY = Math.sin(sWalk.yaw);
  const cosY = Math.cos(sWalk.yaw);
  const fwd = (input.forward ? 1 : 0) - (input.reverse ? 1 : 0);
  const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  // heading (sinY, cosY); right = heading x up = (-cosY, sinY) in xz
  _wish.set(
    sinY * fwd + -cosY * strafe,
    0,
    cosY * fwd + sinY * strafe
  );
  const targetSpeed = input.boost ? C.WALK_RUN_SPEED : C.WALK_SPEED;
  if (_wish.lengthSq() > 0) _wish.normalize().multiplyScalar(targetSpeed);

  const accel = sWalk.grounded ? C.WALK_ACCEL_GROUND : C.WALK_ACCEL_AIR;
  _move.subVectors(_wish, sWalk.vel);
  const gap = _move.length();
  const step = accel * dt;
  if (gap > step && gap > 1e-6) sWalk.vel.addScaledVector(_move, step / gap);
  else sWalk.vel.copy(_wish);
  sWalk.pos.x += sWalk.vel.x * dt;
  sWalk.pos.z += sWalk.vel.z * dt;

  // walls, then the highest walkable floor under the feet
  for (const s of structures) s.resolveWalls(sWalk.pos, PLAYER_RADIUS);
  let gy = null;
  for (const s of structures) {
    const y = s.surfaceYAt(sWalk.pos.x, sWalk.pos.z, sWalk.pos.y);
    if (y !== null && y !== undefined && (gy === null || y > gy)) gy = y;
  }

  // vertical: low-g jump/fall (stepWalk's model on a flat frame)
  if (gy !== null && sWalk.vUp <= 0 && sWalk.pos.y <= gy + C.STATION_GROUND_SNAP) {
    sWalk.pos.y = gy;
    sWalk.grounded = true;
    sWalk.vUp = 0;
    if (input.brake && !sWalk.jumpHeld) sWalk.vUp = C.WALK_JUMP;
  } else {
    sWalk.grounded = false;
    sWalk.vUp -= C.WALK_GRAVITY * C.STATION_GRAVITY_SCALE * dt;
    sWalk.pos.y += sWalk.vUp * dt;
    if (gy !== null && sWalk.pos.y <= gy) {
      sWalk.pos.y = gy;
      sWalk.grounded = true;
      sWalk.vUp = 0;
    }
  }
  sWalk.jumpHeld = input.brake;

  // spine rooms have real ceilings — cap the jump so heads stay indoors
  const R = GL.ROOMS;
  if (
    sWalk.pos.z >= R.airlock.z0 - 2 && sWalk.pos.z <= R.promenade.z1 &&
    sWalk.pos.x >= -8 && sWalk.pos.x <= 16 && sWalk.pos.y < R.ceilY
  ) {
    const maxY = R.ceilY - HEAD_ROOM;
    if (sWalk.pos.y > maxY) {
      sWalk.pos.y = maxY;
      if (sWalk.vUp > 0) sWalk.vUp = 0;
    }
  }

  // stepped off the berth pad / out a notch into space: the safety field
  if (sWalk.pos.y < VOID_FLOOR) {
    sWalk.pos.set(GL.SPAWN.x, GL.SPAWN.y, GL.SPAWN.z);
    sWalk.vel.set(0, 0, 0);
    sWalk.vUp = 0;
    showViewToast('STATION SAFETY FIELD — RETURNED TO THE AIRLOCK');
  }

  // animation state
  const hSpeed = sWalk.vel.length();
  sWalk.mode = !sWalk.grounded ? 'jump' : hSpeed > 0.6 ? 'run' : 'idle';
  sWalk.speed01 = Math.min(hSpeed / C.WALK_RUN_SPEED, 1);
  if (hSpeed > 0.4) {
    const targetYaw = Math.atan2(sWalk.vel.x, sWalk.vel.z);
    let d = targetYaw - sWalk.facingYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    sWalk.facingYaw += d * Math.min(1, FACE_TURN * dt);
  }

  writeShipPos();
}

// ---------------------------------------------------------------------------
// Visuals + interaction (render rate)
// ---------------------------------------------------------------------------

export function updateStationVisuals(dt, t) {
  if (!sWalk.active || !astronaut) return;
  const rotY = sWalk.station.group.rotation.y;

  astronaut.group.position.copy(ship.position);
  astronaut.group.quaternion.setFromAxisAngle(_yAxis, sWalk.facingYaw + rotY);
  astronaut.update(dt, sWalk.mode, sWalk.speed01);
  astronaut.group.visible = sWalk.view === 'tp';

  if (parked) parked.update(dt, t, SUN_DOT);

  // interaction focus: crowds live in the station-local frame sWalk.pos is
  // already in; the deck gate keeps E — TALK from reaching through floors
  focusEntity = null;
  focusModule = null;
  focusD2 = Infinity;
  for (const c of crowds) {
    c.module.update(dt, sWalk.pos, SUN_DOT);
    if (Math.abs(sWalk.pos.y - c.deckY) > 3) continue;
    scanModule(c.module);
  }
}

function entityDistSq(entity) {
  if (entity.pos.isVector2) {
    const dx = entity.pos.x - sWalk.pos.x;
    const dz = entity.pos.y - sWalk.pos.z;
    return dx * dx + dz * dz;
  }
  return entity.pos.distanceToSquared(sWalk.pos);
}

function scanModule(module) {
  if (isDialogueOpen()) {
    if (
      talkModule === module && talkEntity &&
      entityDistSq(talkEntity) > TALK_BREAK_DIST * TALK_BREAK_DIST
    ) {
      closeDialogue();
    }
    return;
  }
  const e = module.nearestInteractable(sWalk.pos, TALK_DIST);
  if (!e) return;
  const d2 = entityDistSq(e);
  if (d2 < focusD2) {
    focusEntity = e;
    focusModule = module;
    focusD2 = d2;
  }
}

export function stationInteract() {
  if (isDialogueOpen()) {
    advanceDialogue();
    return;
  }
  if (!focusEntity || !focusModule) return;
  const entity = focusEntity;
  const module = focusModule;
  const payload = module.interact(entity);
  if (!payload || !payload.lines || !payload.lines.length) {
    module.endInteract?.(entity);
    return;
  }
  openDialogue(payload, {
    onOffer: () => {}, // gallery crowds are questChance 0 — nothing to offer
    onClose: () => {
      talkModule?.endInteract?.(talkEntity);
      talkEntity = null;
      talkModule = null;
    },
  });
  talkEntity = entity;
  talkModule = module;
}

export function stationPromptText() {
  if (isDialogueOpen()) return null;
  if (focusEntity) return 'E — TALK';
  if (nearAirlock()) return 'G — UNDOCK';
  return null;
}

export function nearAirlock() {
  const a = GL.AIRLOCK_POINT;
  const dxa = sWalk.pos.x - a.x;
  const dya = sWalk.pos.y - a.y;
  const dza = sWalk.pos.z - a.z;
  if (dxa * dxa + dya * dya + dza * dza < C.STATION_AIRLOCK_RADIUS ** 2) return true;
  const b = GL.BERTH_LOCAL;
  const dxb = sWalk.pos.x - b.x;
  const dyb = sWalk.pos.y - b.y;
  const dzb = sWalk.pos.z - b.z;
  return dxb * dxb + dyb * dyb + dzb * dzb < C.WALK_BOARD_RADIUS ** 2;
}

export function promptReturnToAirlock() {
  showViewToast('RETURN TO THE AIRLOCK TO UNDOCK');
}

export function toggleStationView() {
  sWalk.view = toggleViewPref();
  camSnap = true;
  return sWalk.view;
}

// Compass arrow back to the airlock, mirroring walk.js's shipBearing.
export function airlockBearing() {
  if (!sWalk.active) return null;
  const a = GL.AIRLOCK_POINT;
  const dx = a.x - sWalk.pos.x;
  const dz = a.z - sWalk.pos.z;
  _bearingOut.dist = Math.hypot(dx, dz, a.y - sWalk.pos.y);
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) {
    _bearingOut.angle = 0;
    return _bearingOut;
  }
  // angle of the target relative to the look heading (local frame — both
  // rotate with the station together, so world conversion cancels out)
  const sinY = Math.sin(sWalk.yaw);
  const cosY = Math.cos(sWalk.yaw);
  const fx = dx / len;
  const fz = dz / len;
  _bearingOut.angle = Math.atan2(fx * -cosY + fz * sinY, fx * sinY + fz * cosY);
  return _bearingOut;
}

export function currentStationGravityScale() {
  return C.STATION_GRAVITY_SCALE;
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

export function updateStationCamera(camera, delta = 0) {
  const st = sWalk.station;
  // Re-place the station for THIS frame before deriving the camera — the
  // game.js updateStations call happens later in the loop, and the station
  // moves ~0.4u/frame on its orbit; without this the interior would swim.
  // updateStations is absolute-time idempotent, so the later call just
  // recomputes the same transform.
  updateStations(performance.now() / 1000, ship.position);
  writeShipPos();

  const rotY = st.group.rotation.y;
  const wYaw = sWalk.yaw + rotY;
  const cosP = Math.cos(sWalk.pitch);
  _look.set(Math.sin(wYaw) * cosP, Math.sin(sWalk.pitch), Math.cos(wYaw) * cosP);

  if (sWalk.view === 'fp') {
    camera.position.copy(ship.position);
    camera.position.y += C.WALK_EYE_HEIGHT;
    _target.copy(camera.position).add(_look);
    camera.up.set(0, 1, 0);
    camera.lookAt(_target);
    if (camera.fov !== C.FOV) {
      camera.fov = C.FOV;
      camera.updateProjectionMatrix();
    }
    return;
  }

  // third person: orbit behind, clamped tight for the hallways
  if (input.wheel !== 0) {
    sWalk.camDist = Math.min(
      Math.max(sWalk.camDist + input.wheel * 0.004, CAM_MIN),
      CAM_MAX
    );
    input.wheel = 0;
  }
  _target.copy(ship.position);
  _target.y += C.WALK_TP_EYE;
  _desired.copy(_target).addScaledVector(_look, -sWalk.camDist);
  // keep the camera from diving under the deck the player stands on
  if (_desired.y < ship.position.y - 3) _desired.y = ship.position.y - 3;

  _desired.sub(ship.position);
  if (camSnap) {
    _camOffset.copy(_desired);
    camSnap = false;
  } else {
    _camOffset.lerp(_desired, 1 - Math.exp(-CAM_SMOOTH * delta));
  }
  camera.position.copy(ship.position).add(_camOffset);
  camera.up.set(0, 1, 0);
  camera.lookAt(_target);
  if (camera.fov !== C.FOV) {
    camera.fov = C.FOV;
    camera.updateProjectionMatrix();
  }
}

// dev/verification handle (__debug via walk.js walkSite)
export function stationSite() {
  return { crowds, parked, structures, sWalk };
}
