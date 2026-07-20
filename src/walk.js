// On-foot planet mode: disembark the ship over a rocky planet and explore its
// surface as an astronaut — walk, sprint (Shift), jump (Space), and swim in
// the ocean. First or third person (chosen once, toggled with T).
//
// The walker reuses ship.position as its world-space position (floating-origin
// frame), so origin rebasing, the atmosphere/skyfog passes, and gravity
// bookkeeping all keep working with no changes — control simply switches from
// flight to the walker.
//
// Ground collision is a snap-to-ground: each tick the walker's radial distance
// is pinned to planet.radius + groundAt(up), where groundAt (planet.js /
// terrain.js) is the exact CPU mirror of the surface.vert displacement. So
// your feet land on the same relief the surface shader draws. Water: the sea
// mesh sits at radius + WALK_WATER_LEVEL and the seabed is the base sphere, so
// water depth = WALK_WATER_LEVEL - groundAt; deep enough and the walker swims,
// riding the surface on buoyancy. Glacia's frozen sea is walkable ground.

import * as THREE from 'three';
import { C } from './constants.js';
import { input } from './input.js';
import { ship } from './ship.js';
import { planets, SUN } from './planet.js';
import { Astronaut } from './astronaut.js';
import { createDressing } from './dressing.js';
// World entities spawned around the landing site. All parented (directly or
// via the city group) to planet.surface, so planet spin and floating-origin
// rebases carry them — the world never moves without them. Aliased import:
// world/ship.js is the parked-ship MESH, unrelated to ./ship.js (flight model).
import { createShip as createParkedShip } from '../world/ship.js';
import { createCity, CITY_STYLES } from '../world/city.js';
import { createCrowd } from '../world/aliens.js';
import { createWonderField } from '../world/wonders.js';
import { createCreatures } from '../world/creatures.js';
import { createWavemallPrime } from '../world/wavemallprime.js';
import { createActuality } from '../world/actuality.js';
import { createShadowreach } from '../world/shadowreach.js';
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
import {
  addCodex,
  addOutcome,
  setWaypoint,
  completeWaypoint,
  clearWaypoint,
} from './journal.js';
// Station-interior walk (Orbital Art Gallery). Same public surface, flat
// station-local frame. Every export below dispatches there while a dock is
// active, so game.js keeps driving phase 'walk' and never knows which
// walker is underneath. Re-exported so walkLazy can reach it.
import * as stationWalk from './stationWalk.js';
export { enterStationWalk } from './stationWalk.js';

const LOOK_SENS = 0.0022; // radians of look per pixel of mouse travel
const MAX_PITCH = 1.483; // ~85°, so you never flip past straight up/down
const GROUND_SNAP = 8.0; // max step-down (units) that still counts as "grounded"
const SWIM_SETTLE = 6.0; // buoyancy: per-second approach rate to the ride depth
const SHORE_HOP = 6.5; // upward kick when jumping out of shallow water
const FACE_TURN = 12.0; // per-second rate the body turns toward the velocity
const CAM_SMOOTH = 9.0; // third-person camera offset approach rate
const SPRINT_FOV_KICK = 6.0; // extra FOV at full sprint, third person

// Scratch vectors — reused every tick, never allocated in the loop.
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _look = new THREE.Vector3();
const _target = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _camOffset = new THREE.Vector3();
const _basis = new THREE.Matrix4();

export const walk = {
  active: false,
  planet: null, // a terra entry from planets[]
  heading: new THREE.Vector3(0, 0, -1), // world-space tangent forward (look)
  pitch: 0, // camera-only, radians
  vUp: 0, // vertical velocity along the local up axis (jump/fall)
  jumpHeld: false, // for edge-triggered jump
  vel: new THREE.Vector3(), // world-space tangent velocity (persistent)
  mode: 'idle', // 'idle' | 'run' | 'jump' | 'swim' — drives astronaut + HUD
  speed01: 0, // horizontal speed / sprint speed, 0..1
  grounded: true,
  swimming: false,
  view: 'tp', // 'fp' | 'tp'
  camDist: 7.6, // third-person orbit distance (scroll wheel)
  facing: new THREE.Vector3(0, 0, -1), // astronaut body heading (follows vel)
};

let astronaut = null; // the visible third-person body (initWalk)
let dressing = null; // active surface-dressing patch, spawned per disembark
let camSnap = true; // snap (don't lerp) the TP camera on the next frame
let fovKick = 0; // eased 0..1 sprint FOV widen
let lastSpinAngle = 0; // surface.rotation.y at the previous walk tick (co-rotation)

// Landing-site world entities, spawned per disembark like dressing.
let parked = null; // parked ship mesh (world/ship.js) — takeoff anchor
let city = null; // procedural city (world/city.js)
let crowd = null; // citizens inside the city (world/aliens.js)
let wonders = null; // megastructure field (world/wonders.js)
let creatures = null; // planet wildlife (world/creatures.js)
let wavemall = null; // total-conversion content for 'wavemall prime' only
let actuality = null; // total-conversion content for 'actuality' only
let shadowreach = null; // total-conversion narrative world for 'shadowreach' only
// Interior occupants: one small crowd per enterable lobby (+ tower balcony).
// Each rides city.group's local frame, so it shares the crowd's player-local.
let interiorCrowds = []; // [{ module, groupParent }]

// Interaction state (world/interaction.js contract, host side). The focus is
// re-scanned every frame from the modules' nearestInteractable(); the talk
// refs live only while a dialogue is open and are released in its onClose.
let focusEntity = null; // this-frame nearest interactable (null = none in range)
let focusModule = null; // the handle (crowd | creatures) that owns focusEntity
let focusD2 = Infinity; // its squared distance, to pick the closer module
let talkEntity = null; // entity with the open dialogue
let talkModule = null;
let beacon = null; // waypoint marker mesh, parented in its source module's frame
let beaconParent = null;
let beaconGeo = null; // shared, built on first use, disposed on exitWalk
const TALK_DIST_CROWD = 2.6; // ~ aliens talkTriggerDist
const TALK_DIST_CREATURE = 6; // ~ creatures interactRadius
const TALK_DIST_ACTUALITY = 3.2; // seated NPCs behind tables / the dragon box
const TALK_BREAK_DIST = 8; // walk-away hangup (inside demote/deactivate radii)
const PLAYER_RADIUS = 0.7; // body radius for building push-out

// Scratch for the entity transforms (never allocated per frame).
const _yAxisV = new THREE.Vector3(0, 1, 0);
const _xAxisV = new THREE.Vector3(1, 0, 0);
const _cityLocal = new THREE.Vector3();
const _cityPt = new THREE.Vector3();
const _localUp = new THREE.Vector3();
const _siteT1 = new THREE.Vector3();
const _siteT2 = new THREE.Vector3();
const _patchUp = new THREE.Vector3();
const _bestUp = new THREE.Vector3();
const _parkPos = new THREE.Vector3();
const _playerLocal = new THREE.Vector3();
const _qTmp = new THREE.Quaternion();
const _cityInvQuat = new THREE.Quaternion();
const _creatInvQuat = new THREE.Quaternion();
const _wavemallInvQuat = new THREE.Quaternion();
const _actualityInvQuat = new THREE.Quaternion();
const _identityQuat = new THREE.Quaternion(); // shadowreach group sits at identity

// Convert a world-space (post-spin) direction into planet.surface's UNROTATED
// local frame — the frame all surface children live in. Same math as
// body.groundAt's internal un-rotation (planet.js).
function toSurfaceLocal(planet, worldDir, out) {
  return out.copy(worldDir).applyAxisAngle(_yAxisV, -planet.surface.rotation.y);
}

// ship.position (world) -> a surface-child patch group's local frame.
// Manual transform (not worldToLocal) so it never reads a one-frame-stale
// matrixWorld, and stays allocation-free via the out vector.
function playerLocalInto(group, invQuat, out) {
  const planet = walk.planet;
  out
    .subVectors(ship.position, planet.body.position)
    .applyAxisAngle(_yAxisV, -planet.surface.rotation.y) // world -> surface-local
    .sub(group.position)
    .applyQuaternion(invQuat); // surface-local -> patch-local
  return out;
}

// Build the astronaut once and keep it hidden until a disembark. Called from
// main.js after the scene exists.
export function initWalk(scene) {
  astronaut = new Astronaut();
  astronaut.group.visible = false;
  scene.add(astronaut.group);
  stationWalk.initStationWalk(astronaut); // the station walker shares the body
}

// The nearest rocky (terra) planet you could stand on, and your altitude above
// its local terrain floor. Null if there are no terra planets. Mirrors the
// altitude math in gravity.js:altitudeAboveFloor.
export function nearestTerraFloor(pos) {
  let best = null;
  let bestAlt = Infinity;
  for (const p of planets) {
    if (p.cfg.type !== 'terra') continue;
    _up.subVectors(pos, p.body.position);
    const r = _up.length();
    _up.normalize();
    const ground = p.body.groundAt ? p.body.groundAt(_up) : 0;
    const altitude = r - p.radius - ground;
    if (altitude < bestAlt) {
      bestAlt = altitude;
      best = p;
    }
  }
  return best ? { planet: best, altitude: bestAlt } : null;
}

// Radial distance of the walkable floor: the terrain (signed — real seafloor
// relief on divable worlds), or the ice sheet where the sea is frozen
// (glacia — you stand on it, never swim under it).
function floorRadius(planet, up) {
  let r = planet.radius + planet.body.terrainAt(up);
  if (planet.water && planet.water.frozen && r < planet.water.r) r = planet.water.r;
  return r;
}

// Liquid water depth under this direction (0 on dry or frozen worlds). On
// ordinary worlds the seabed is the base sphere so depth tops out at
// WALK_WATER_LEVEL just offshore; divable worlds carve real trenches below.
function waterDepth(planet, up) {
  if (!planet.water || planet.water.frozen) return 0;
  return Math.max(planet.water.r - (planet.radius + planet.body.terrainAt(up)), 0);
}

// Drop out of the ship onto the given terra planet, directly below where the
// ship was. Feet snap to the ground (or the body to the sea surface when
// disembarking over open water); the heading seeds from the ship's nose.
export function enterWalk(planet) {
  walk.active = true;
  walk.planet = planet;
  walk.pitch = 0;
  walk.vUp = 0;
  walk.jumpHeld = false;
  walk.vel.set(0, 0, 0);
  walk.mode = 'idle';
  walk.speed01 = 0;
  walk.grounded = true;
  walk.swimming = false;
  walk.camDist = C.WALK_CAM_DIST;
  camSnap = true;
  // Seed the spin tracker so the first stepWalk delta is ~0 (no jump on entry).
  lastSpinAngle = planet.surface.rotation.y;

  _up.subVectors(ship.position, planet.body.position).normalize();

  // Seed heading from the ship's forward (-Z), projected onto the tangent
  // plane. Fall back to an arbitrary tangent if it was pointing straight up.
  walk.heading.set(0, 0, -1).applyQuaternion(ship.quaternion);
  projectTangent(walk.heading, _up);
  if (walk.heading.lengthSq() < 1e-6) {
    walk.heading.set(1, 0, 0);
    projectTangent(walk.heading, _up);
  }
  walk.heading.normalize();
  walk.facing.copy(walk.heading);

  // Snap onto the surface directly below: feet on the ground, or afloat at
  // the sea surface when the water is deep enough to swim.
  const depth = waterDepth(planet, _up);
  const r =
    depth > C.WALK_SWIM_DEPTH
      ? planet.water.r - C.WALK_BUOYANCY
      : floorRadius(planet, _up);
  ship.position.copy(planet.body.position).addScaledVector(_up, r);
  ship.velocity.set(0, 0, 0);
  ship.angularVelocity.set(0, 0, 0);
  ship.properAccel.set(0, 0, 0);

  // First disembark ever: offer the view choice (the game keeps running
  // behind the overlay). Afterwards the stored preference decides silently.
  const pref = getViewPref();
  if (pref) {
    walk.view = pref;
    showViewToast('T — TOGGLE VIEW');
  } else {
    walk.view = 'tp'; // watch your astronaut while the chooser is up
    showViewChooser((v) => {
      walk.view = v;
      camSnap = true;
    });
  }

  // Dress the landing site (terra/oceana get the full valley; ice and rock
  // worlds get boulders; gasless of course never reach here).
  dressing = createDressing(planet, _up);

  // Populate the site: parked ship, city + citizens, wonders, wildlife.
  // _up still holds the world-space landing dir here.
  spawnWorldEntities(planet);
}

// Wonder types that suit each world's character (fallback for any new planet).
const WONDER_TYPES = {
  terra: ['arch', 'grove', 'monoliths', 'elevator'],
  oceana: ['crystals', 'titan', 'arch'],
  glacia: ['crystals', 'monoliths'],
  rustia: ['titan', 'arch', 'monoliths', 'ringworld'],
};

// Spawn the landing-site world entities, all riding planet.surface so they
// spin (and origin-shift) with the planet. Placement happens in the surface's
// unrotated local frame; sampling helpers take world-space dirs (groundAt) —
// the two frames differ by surface.rotation.y (see toSurfaceLocal).
// Spawn-time allocations are fine — this is the dressing precedent. Note the
// creatures dispatcher also covers gas giants (sky ecology), but only terra
// planets are landable, so that branch stays unreachable this pass.
function spawnWorldEntities(planet) {
  // --- parked ship: PARK_OFFSET behind the disembark point, on the floor ---
  parked = createParkedShip(planet.surface, {});
  _target.copy(ship.position).addScaledVector(walk.heading, -C.PARK_OFFSET);
  _patchUp.subVectors(_target, planet.body.position).normalize();
  const depth = waterDepth(planet, _patchUp);
  const parkR =
    depth > C.WALK_SWIM_DEPTH ? planet.water.r : floorRadius(planet, _patchUp);
  toSurfaceLocal(planet, _patchUp, _localUp);
  parked.group.position.copy(_localUp).multiplyScalar(parkR + C.PARK_LIFT);
  parked.group.quaternion.setFromUnitVectors(_yAxisV, _localUp);
  // Nose (+Z) along the direction the ship was flying when it set down.
  toSurfaceLocal(planet, walk.heading, _siteT1)
    .applyQuaternion(_qTmp.copy(parked.group.quaternion).invert());
  parked.group.rotateY(Math.atan2(_siteT1.x, _siteT1.z));

  // Total conversion: the wavemall module replaces the stock city / crowd /
  // wonders / creatures wholesale for this world. The parked ship above is
  // still the boarding point as usual (the module's own boardingPad is unused).
  // Early return leaves those four handles null — every `if (city)` / etc.
  // guard downstream short-circuits.
  if (planet.cfg.name === 'wavemall prime') {
    toSurfaceLocal(planet, _up, _localUp);
    wavemall = createWavemallPrime(planet, _localUp.clone(), {});
    planet.surface.add(wavemall.group);
    _wavemallInvQuat.copy(wavemall.crowd.group.quaternion).invert();
    // Shopkeepers inside the enterable department stores: one tiny bounded
    // crowd per lobby, living in its wing's district-local frame (each entry
    // carries the wing group + inverse quaternion for playerLocalInto).
    interiorCrowds = [];
    for (const l of wavemall.lobbies ?? []) {
      const m = createCrowd(
        {
          cityId: planet.cfg.name,
          plazaCenters: [{ x: l.x, z: l.z, r: 1 }],
          colliders: [],
          groundHeightAt: () => l.floorY,
        },
        {
          population: 2, maxRigs: 3, seed: l.seed, questChance: 0,
          culture: 'shopkeeper', stationaryFirst: true,
        }
      );
      l.group.add(m.group);
      m.hostGroup = l.group;
      m.hostInvQuat = l.invQuat;
      interiorCrowds.push(m);
    }
    wavemall.holdMusic.initAudio(); // the G keypress that landed us is fresh user activation
    return;
  }

  // Total conversion: the actuality module (hub-and-spoke narrative world)
  // replaces the stock city/crowd/wonders/creatures. Same early-return shape as
  // wavemall above — the parked ship is still the boarding point.
  if (planet.cfg.name === 'actuality') {
    toSurfaceLocal(planet, _up, _localUp);
    actuality = createActuality(planet, _localUp.clone(), {});
    planet.surface.add(actuality.group);
    _actualityInvQuat.copy(actuality.anchor.quaternion).invert();
    actuality.initAudio(); // the landing G keypress is fresh user activation
    // The module builds its own floors flush with the terra ground (it OWNS the
    // ground via groundRadiusAt), so the terrain sphere and every module floor
    // are coplanar and z-fight — the whole plain shimmers/"vibrates" as the
    // camera moves. Bias the terrain's depth backward so the opaque module
    // floors always win the depth test; the plain still shows beyond their
    // edges. Restored in exitWalk. (Each planet owns its surface material.)
    const sm = planet.surface.material;
    sm.polygonOffset = true;
    sm.polygonOffsetFactor = 3;
    sm.polygonOffsetUnits = 3;
    return; // city/crowd/wonders/creatures stay null (guards short-circuit)
  }

  // Total conversion: 'shadowreach' is a linear narrative world (its module owns
  // all geometry, NPCs, collision and audio). Early return leaves city/crowd/
  // wonders/creatures null so every downstream guard short-circuits.
  if (planet.cfg.name === 'shadowreach') {
    toSurfaceLocal(planet, _up, _localUp);
    shadowreach = createShadowreach(planet, _localUp.clone(), {});
    planet.surface.add(shadowreach.group);
    shadowreach.initAudio(); // the G keypress that landed us is fresh user activation
    return;
  }

  // Tangent frame at the landing dir, for placing the city and wonders.
  const ref = Math.abs(_up.y) < 0.94 ? _yAxisV : _xAxisV;
  _siteT1.crossVectors(_up, ref).normalize();
  _siteT2.crossVectors(_up, _siteT1).normalize();

  // --- city: probe two rings of directions around the site, stop at the
  // first dry spot; in a fully wet region (open ocean) keep the driest probe
  // — the city itself clamps its deck to the sea surface, so it still works.
  let bestGround = -Infinity;
  outer: for (let ring = 1; ring <= 2; ring++) {
    const span = (C.CITY_DISTANCE * ring) / planet.radius;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + (ring - 1) * (Math.PI / 8);
      _patchUp
        .copy(_up)
        .addScaledVector(_siteT1, Math.cos(a) * span)
        .addScaledVector(_siteT2, Math.sin(a) * span)
        .normalize();
      const g = planet.body.groundAt(_patchUp);
      if (g > bestGround) {
        bestGround = g;
        _bestUp.copy(_patchUp);
      }
      const dry =
        !planet.water || planet.water.frozen || g > C.WALK_WATER_LEVEL + 2;
      if (dry) break outer;
    }
  }
  // Each world gets its own city character — stable across landings. Known
  // worlds map to a fitting preset (terra is the neon-ad metropolis); any
  // future terra world falls back to cycling the presets by index.
  const CITY_STYLE_BY_WORLD = {
    terra: 'neonMetropolis',
    oceana: 'verdantTerrace',
    glacia: 'frostHaven',
    rustia: 'dustOutpost',
  };
  const terraWorlds = planets.filter((p) => p.cfg.type === 'terra');
  const styleIdx = Math.max(0, terraWorlds.indexOf(planet));
  const style =
    CITY_STYLES.find((s) => s.name === CITY_STYLE_BY_WORLD[planet.cfg.name]) ??
    CITY_STYLES[styleIdx % CITY_STYLES.length];
  city = createCity(planet, _bestUp, { radius: C.CITY_RADIUS, style });
  planet.surface.add(city.group);
  _cityInvQuat.copy(city.group.quaternion).invert();

  // Citizens live inside the city group, in its flat local x/z space.
  crowd = createCrowd(
    {
      groundHeightAt: city.groundLocalYAt,
      plazaCenters: city.plazaCenters,
      colliders: city.collidersLocal,
      cityId: planet.cfg.name,
    },
    {}
  );
  city.group.add(crowd.group);

  // Interior occupants: a tiny bounded crowd per enterable lobby — a shopkeeper
  // (stationary) and a browser in shops, a couple of loungers otherwise — plus
  // a lone caretaker on the tower balcony. Each shares the city's local frame.
  interiorCrowds = [];
  for (const l of city.lobbies ?? []) {
    const isShop = l.flavor === 'shop';
    const m = createCrowd(
      {
        cityId: planet.cfg.name,
        plazaCenters: [{ x: l.x, z: l.z, r: 1 }],
        colliders: [],
        groundHeightAt: () => l.floorY,
      },
      {
        population: isShop ? 2 : 3, maxRigs: 3, seed: l.seed, questChance: 0,
        culture: isShop ? 'shopkeeper' : 'lounge', stationaryFirst: isShop,
      }
    );
    city.group.add(m.group);
    interiorCrowds.push(m);
  }
  if (city.balconySpot) {
    const b = city.balconySpot;
    const m = createCrowd(
      {
        cityId: planet.cfg.name,
        plazaCenters: [{ x: b.x, z: b.z, r: 1 }],
        colliders: [],
        groundHeightAt: () => b.y,
      },
      { population: 1, maxRigs: 1, seed: (city.lobbies?.length ?? 0) + 101, questChance: 0, culture: 'caretaker', stationaryFirst: true }
    );
    city.group.add(m.group);
    interiorCrowds.push(m);
  }

  // --- wonders: mirrored to the far side of the landing site from the city ---
  _siteT1.subVectors(_bestUp, _up); // tangent offset toward the city
  _patchUp
    .copy(_up)
    .addScaledVector(_siteT1, -C.WONDER_DISTANCE / C.CITY_DISTANCE)
    .normalize();
  wonders = createWonderField(planet, _patchUp, {
    count: C.WONDER_COUNT,
    types: WONDER_TYPES[planet.cfg.name] ?? ['arch', 'crystals', 'monoliths'],
    // Wonders share the city's neon identity: glacia goes ice-blue, rustia
    // amber, oceana teal (wonders.js palette.accent/secondary hooks).
    palette: {
      accent: style.palette.neonPrimary,
      secondary: style.palette.neonSecondaryA,
    },
  }); // adds its group to planet.surface itself

  // --- creatures: scattered around the landing site itself ---
  creatures = createCreatures(planet, _up, { radius: C.DRESS_RADIUS });
  toSurfaceLocal(planet, _up, _localUp);
  creatures.group.quaternion.setFromUnitVectors(_yAxisV, _localUp);
  let creatR = planet.radius + planet.body.groundAt(_up);
  if (planet.water && creatR < planet.water.r) creatR = planet.water.r; // never sunk
  creatures.group.position.copy(_localUp).multiplyScalar(creatR);
  planet.surface.add(creatures.group);
  _creatInvQuat.copy(creatures.group.quaternion).invert();
}

// Board the ship: lift back to disembark altitude, nose pointed away from the
// planet so thrust climbs, at rest. (Near-planet gravity still needs boost to
// climb out — that's the flight model, unchanged.)
export function exitWalk(camera) {
  if (stationWalk.stationActive()) return stationWalk.exitStationDock(camera);
  const planet = walk.planet;
  _up.subVectors(ship.position, planet.body.position).normalize();
  const ground = planet.body.groundAt(_up);
  const liftR = planet.radius + ground + C.WALK_LAND_ALTITUDE;
  ship.position.copy(planet.body.position).addScaledVector(_up, liftR);
  ship.velocity.set(0, 0, 0);
  ship.angularVelocity.set(0, 0, 0);
  ship.properAccel.set(0, 0, 0);
  // Point the nose along "up" so W thrust climbs away from the surface.
  ship.quaternion.setFromUnitVectors(_look.set(0, 0, -1), _up);

  // Snap the lagging camera to the ship so it doesn't slerp across the sky.
  if (camera) {
    camera.position.copy(ship.position);
    camera.quaternion.copy(ship.quaternion);
    camera.fov = C.FOV;
    camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();
  }

  if (dressing) {
    dressing.dispose();
    dressing = null;
  }
  // Close any open dialogue BEFORE disposing the modules: its onClose calls
  // talkModule.endInteract(), which must run against a live handle. Then drop
  // the beacon (its parent group is about to be torn down) and the waypoint.
  closeDialogue();
  removeBeacon();
  clearWaypoint();
  focusEntity = null;
  focusModule = null;
  if (beaconGeo) {
    beaconGeo.dispose();
    beaconGeo = null;
  }
  // Tear down the landing-site entities. dispose() clears children but (except
  // ship/wonders) doesn't detach from planet.surface — remove explicitly so
  // empty groups don't accumulate across repeated landings.
  if (crowd) {
    city.group.remove(crowd.group);
    crowd.dispose();
    crowd = null;
  }
  for (const m of interiorCrowds) {
    m.group.parent?.remove(m.group); // city lobby or wavemall wing group
    m.dispose();
  }
  interiorCrowds = [];
  if (city) {
    city.dispose();
    planet.surface.remove(city.group);
    city = null;
  }
  if (wonders) {
    wonders.dispose(); // removes its own group from planet.surface
    wonders = null;
  }
  if (creatures) {
    creatures.dispose();
    planet.surface.remove(creatures.group);
    creatures = null;
  }
  if (wavemall) {
    wavemall.dispose(); // stops the hold-music oscillator + closes its AudioContext
    planet.surface.remove(wavemall.group); // dispose() clears children but doesn't detach
    wavemall = null;
  }
  if (actuality) {
    actuality.dispose(); // closes its AudioContext, frees geometries/render targets
    planet.surface.remove(actuality.group);
    // Undo the terrain depth bias set in spawnWorldEntities.
    const sm = planet.surface.material;
    sm.polygonOffset = false;
    sm.polygonOffsetFactor = 0;
    sm.polygonOffsetUnits = 0;
    actuality = null;
  }
  if (shadowreach) {
    shadowreach.dispose(); // frees geometry/materials, stops the drone, closes its AudioContext
    planet.surface.remove(shadowreach.group);
    shadowreach = null;
  }
  if (parked) {
    parked.dispose(); // removes its own group from planet.surface
    parked = null;
  }
  if (astronaut) astronaut.group.visible = false;
  hideViewUI();
  fovKick = 0;

  walk.active = false;
  walk.planet = null;
}

// T — switch first/third person on foot. Persists as the new preference.
export function toggleWalkView() {
  if (stationWalk.stationActive()) return stationWalk.toggleStationView();
  walk.view = toggleViewPref();
  camSnap = true;
  return walk.view;
}

export function stepWalk(dt) {
  if (stationWalk.stationActive()) return stationWalk.stepStationWalk(dt);
  const planet = walk.planet;

  // Co-rotate with the planet's spin so the ground doesn't slide underfoot —
  // you turn with the planet's day, the way standing on a world works. The
  // surface (and sea/clouds) spin about world +Y (planet.js: rotation.y =
  // t * spin; the group has no axial tilt); without this the walker holds a
  // fixed world direction and the terrain streams past. We rotate by the exact
  // delta of surface.rotation.y — the same angle groundAt() un-rotates by — so
  // the walker's total turn always equals the surface's, framerate-independent.
  // The world-space position and every world-space heading/velocity ride along.
  const spinAngle = planet.surface.rotation.y;
  const dphi = spinAngle - lastSpinAngle;
  lastSpinAngle = spinAngle;
  if (dphi !== 0) {
    const c = Math.cos(dphi), s = Math.sin(dphi);
    const px = ship.position.x - planet.body.position.x;
    const pz = ship.position.z - planet.body.position.z;
    ship.position.x = planet.body.position.x + px * c + pz * s;
    ship.position.z = planet.body.position.z - px * s + pz * c;
    rotateXZ(walk.heading, c, s);
    rotateXZ(walk.facing, c, s);
    rotateXZ(walk.vel, c, s);
  }

  // Current up (radial, planet center → walker).
  _up.subVectors(ship.position, planet.body.position).normalize();

  // --- mouse look ---
  const yaw = -input.mouseX * LOOK_SENS; // mouse right → turn right
  walk.pitch -= input.mouseY * LOOK_SENS; // mouse up → look up
  walk.pitch = Math.min(Math.max(walk.pitch, -MAX_PITCH), MAX_PITCH);
  input.mouseX = 0;
  input.mouseY = 0;

  // Re-project heading onto the (possibly changed) tangent plane, then yaw it.
  projectTangent(walk.heading, _up);
  if (walk.heading.lengthSq() < 1e-6) walk.heading.copy(_right); // degenerate guard
  walk.heading.normalize();
  walk.heading.applyAxisAngle(_up, yaw);
  projectTangent(walk.heading, _up);
  walk.heading.normalize();

  // --- environment at the current spot ---
  let r = ship.position.distanceTo(planet.body.position);
  let depth = waterDepth(planet, _up);
  // Swimming: deep water and the body at (or under) the surface.
  walk.swimming =
    depth > C.WALK_SWIM_DEPTH && planet.water && r <= planet.water.r + 0.05;
  const wading = !walk.swimming && depth > C.WALK_WADE_DEPTH;

  // --- planar movement: velocity approaches the wish direction ---
  _right.crossVectors(walk.heading, _up).normalize();
  const fwd = (input.forward ? 1 : 0) - (input.reverse ? 1 : 0);
  const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  _wish.set(0, 0, 0);
  _wish.addScaledVector(walk.heading, fwd);
  _wish.addScaledVector(_right, strafe);
  const targetSpeed = walk.swimming
    ? C.WALK_SWIM_SPEED
    : wading
      ? C.WALK_WADE_SPEED
      : input.boost
        ? C.WALK_RUN_SPEED
        : C.WALK_SPEED;
  if (_wish.lengthSq() > 0) _wish.normalize().multiplyScalar(targetSpeed);

  // Keep the persistent velocity in the current tangent plane (the plane
  // tilts as you move around the sphere), then move it toward the wish at a
  // state-dependent acceleration: crisp on the ground, weak in the air,
  // syrupy in the water.
  projectTangent(walk.vel, _up);
  const accel = walk.swimming
    ? C.WALK_ACCEL_SWIM
    : walk.grounded
      ? C.WALK_ACCEL_GROUND
      : C.WALK_ACCEL_AIR;
  _move.subVectors(_wish, walk.vel);
  const gap = _move.length();
  const step = accel * dt;
  if (gap > step && gap > 1e-6) walk.vel.addScaledVector(_move, step / gap);
  else walk.vel.copy(_wish);
  ship.position.addScaledVector(walk.vel, dt);

  // --- city: building push-out + unified ground, in the city's flat frame ---
  // The walker can't pass through tower walls (slide along them instead), and
  // inside the footprint it walks the same flattened deck the buildings and
  // citizens use — plus rooftops and the landmark tower's stairs/floors.
  let cityGroundR = -1;
  let wavemallGroundR = -1;
  let actualityGroundR = -1;
  let cityD = Infinity;
  if (city) {
    playerLocalInto(city.group, _cityInvQuat, _cityLocal);
    cityD = Math.hypot(_cityLocal.x, _cityLocal.z);
    if (cityD < C.CITY_RADIUS + 8) {
      let pushed = false;
      const cols = city.collidersLocal;
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (c.npcOnly) continue; // landmark: real walls handled below
        // Feet above the roof: no wall push (rooftop landings resolve below).
        if (c.baseY !== undefined && _cityLocal.y > c.baseY + c.height - 0.3) continue;
        const dx = _cityLocal.x - c.x;
        const dz = _cityLocal.z - c.z;
        const rr = c.radius + PLAYER_RADIUS;
        const dd = dx * dx + dz * dz;
        if (dd < rr * rr && dd > 1e-6) {
          const dist = Math.sqrt(dd);
          const push = rr - dist;
          _cityLocal.x += (dx / dist) * push;
          _cityLocal.z += (dz / dist) * push;
          pushed = true;
        }
      }
      // Enterable buildings (landmark tower + lobbies): real walls with a
      // doorway gap, so only the player can walk in.
      if (city.structures) {
        for (let i = 0; i < city.structures.length; i++) {
          if (city.structures[i].resolveWalls(_cityLocal, PLAYER_RADIUS)) pushed = true;
        }
      }
      if (pushed) {
        // city-local -> surface-local -> world (inverse of playerLocalInto)
        _cityPt.copy(_cityLocal)
          .applyQuaternion(city.group.quaternion)
          .add(city.group.position)
          .applyAxisAngle(_yAxisV, planet.surface.rotation.y)
          .add(planet.body.position);
        ship.position.copy(_cityPt);
        cityD = Math.hypot(_cityLocal.x, _cityLocal.z);
      }
      if (cityD < C.CITY_RADIUS) {
        let gy = city.groundLocalYAt(_cityLocal.x, _cityLocal.z);
        // Rooftop standing: inside a tower footprint with feet at roof level.
        for (let i = 0; i < cols.length; i++) {
          const c = cols[i];
          if (c.npcOnly || c.baseY === undefined) continue;
          const dx = _cityLocal.x - c.x;
          const dz = _cityLocal.z - c.z;
          const roofY = c.baseY + c.height;
          if (dx * dx + dz * dz < c.radius * c.radius &&
              _cityLocal.y > roofY - 0.4 && roofY > gy) {
            gy = roofY;
          }
        }
        // Enterable buildings: highest slab/stair/floor beneath the feet wins.
        if (city.structures) {
          for (let i = 0; i < city.structures.length; i++) {
            const sy = city.structures[i].surfaceYAt(_cityLocal.x, _cityLocal.z, _cityLocal.y);
            if (sy !== null && sy !== undefined && sy > gy) gy = sy;
          }
        }
        _cityPt.set(_cityLocal.x, gy, _cityLocal.z)
          .applyQuaternion(city.group.quaternion)
          .add(city.group.position);
        cityGroundR = _cityPt.length(); // surface frame is planet-centered
      }
    }
  } else if (wavemall || shadowreach) {
    // Total-conversion collision: hand the module the player in surface-local
    // space and write back any wall push-out; its walkable floors/steps then
    // override the terrain floor via groundRadiusAt. wavemall = storefront
    // footprints; shadowreach = story gates + the round-room shell.
    const tc = wavemall ?? shadowreach;
    _cityLocal
      .subVectors(ship.position, planet.body.position)
      .applyAxisAngle(_yAxisV, -planet.surface.rotation.y); // world -> surface-local
    if (tc.resolveCollisions(_cityLocal, PLAYER_RADIUS)) {
      _cityPt.copy(_cityLocal)
        .applyAxisAngle(_yAxisV, planet.surface.rotation.y) // surface-local -> world
        .add(planet.body.position);
      ship.position.copy(_cityPt);
    }
    wavemallGroundR = tc.groundRadiusAt(_cityLocal);
  } else if (actuality) {
    // Same surface-local push-out as wavemall, but the actuality floors OWN the
    // ground (replace, not max) so Zone 9's shaft can descend below terrain.
    _cityLocal
      .subVectors(ship.position, planet.body.position)
      .applyAxisAngle(_yAxisV, -planet.surface.rotation.y); // world -> surface-local
    if (actuality.resolveCollisions(_cityLocal, PLAYER_RADIUS)) {
      _cityPt.copy(_cityLocal)
        .applyAxisAngle(_yAxisV, planet.surface.rotation.y) // surface-local -> world
        .add(planet.body.position);
      ship.position.copy(_cityPt);
    }
    actualityGroundR = actuality.groundRadiusAt(_cityLocal);
    // Portal teleport: the module queues a surface-local destination; the host
    // moves the player (the module never touches ship.position itself).
    const tp = actuality.consumeTeleport();
    if (tp) {
      ship.position.copy(tp.pos)
        .applyAxisAngle(_yAxisV, planet.surface.rotation.y)
        .add(planet.body.position);
      if (tp.heading) {
        walk.heading.copy(tp.heading).applyAxisAngle(_yAxisV, planet.surface.rotation.y);
        projectTangent(walk.heading, _up.subVectors(ship.position, planet.body.position).normalize());
        walk.heading.normalize();
        walk.facing.copy(walk.heading);
      }
      walk.vel.set(0, 0, 0);
      walk.vUp = 0;
      camSnap = true; // don't slerp the camera across the teleport
    }
  }

  // Recompute up / radius after the horizontal step.
  _up.subVectors(ship.position, planet.body.position);
  r = _up.length();
  _up.normalize();
  let surfaceR = floorRadius(planet, _up);
  if (cityGroundR > 0) {
    // City deck inside, blending back to raw terrain across the outer rim.
    const t = THREE.MathUtils.smoothstep(cityD, C.CITY_RADIUS * 0.92, C.CITY_RADIUS);
    surfaceR = THREE.MathUtils.lerp(cityGroundR, surfaceR, t);
  } else if (actualityGroundR > 0) {
    // Interiors own the floor outright (incl. below-grade shafts): replace,
    // don't max. Footprints stay strictly inside their walls so stepping off
    // returns -1 and falls back to raw terrain.
    surfaceR = actualityGroundR;
  } else if (wavemallGroundR > 0) {
    // Store floors/steps sit at most a step-height above terrain: max() lets
    // the walker climb onto them and drop back to raw ground past the edge.
    surfaceR = Math.max(surfaceR, wavemallGroundR);
  }
  depth = waterDepth(planet, _up);
  walk.swimming =
    depth > C.WALK_SWIM_DEPTH && planet.water && r <= planet.water.r + 0.05;

  // --- vertical: swim buoyancy / ground snap / jump-fall integration ---
  if (walk.swimming) {
    walk.grounded = false;
    walk.vUp = 0;
    // Buoyancy eases the body to its ride depth just under the surface.
    const rideR = planet.water.r - C.WALK_BUOYANCY;
    r += (rideR - r) * Math.min(1, SWIM_SETTLE * dt);
    if (r < surfaceR + 0.1) r = surfaceR + 0.1; // never through the seabed
    // Near the shore a jump hops the swimmer out of the water.
    if (input.brake && !walk.jumpHeld && depth < C.WALK_SWIM_DEPTH + 0.35) {
      walk.vUp = SHORE_HOP;
      r += walk.vUp * dt;
    }
  } else if (walk.vUp <= 0 && r <= surfaceR + GROUND_SNAP) {
    r = surfaceR; // grounded: follow the terrain up and down
    walk.grounded = true;
    walk.vUp = 0;
    if (input.brake && !walk.jumpHeld) walk.vUp = C.WALK_JUMP; // edge-triggered jump
  } else {
    walk.grounded = false;
    // Per-world gravity: a low-gravity world jumps higher and falls softly.
    walk.vUp -= C.WALK_GRAVITY * (planet.cfg?.walkGravityScale ?? 1) * dt;
    r += walk.vUp * dt;
    if (r <= surfaceR) {
      r = surfaceR;
      walk.grounded = true;
      walk.vUp = 0;
    }
  }
  walk.jumpHeld = input.brake;

  ship.position.copy(planet.body.position).addScaledVector(_up, r);
  ship.velocity.set(0, 0, 0);

  // --- animation state: mode, speed fraction, body facing ---
  const hSpeed = walk.vel.length();
  walk.mode = walk.swimming
    ? 'swim'
    : !walk.grounded
      ? 'jump'
      : hSpeed > 0.6
        ? 'run'
        : 'idle';
  walk.speed01 = Math.min(hSpeed / C.WALK_RUN_SPEED, 1);
  if (hSpeed > 0.4) {
    // The body turns smoothly toward where it's actually moving.
    _fwd.copy(walk.vel).multiplyScalar(1 / hSpeed);
    walk.facing.lerp(_fwd, Math.min(1, FACE_TURN * dt));
  }
  projectTangent(walk.facing, _up);
  if (walk.facing.lengthSq() < 1e-6) walk.facing.copy(walk.heading);
  walk.facing.normalize();
}

// Once per render frame: pose the astronaut on the walker point and advance
// its procedural animation + the dressing (grass sway, night dimming).
// `t` is wall-clock seconds.
export function updateWalkVisuals(dt, t) {
  if (stationWalk.stationActive()) return stationWalk.updateStationVisuals(dt, t);
  if (!walk.active || !astronaut) return;
  const planet = walk.planet;
  _up.subVectors(ship.position, planet.body.position).normalize();

  astronaut.group.position.copy(ship.position);
  // Tangent basis with the model's +Z on the body facing and +Y on planet-up.
  _right.crossVectors(_up, walk.facing).normalize();
  _fwd.crossVectors(_right, _up).normalize();
  _basis.makeBasis(_right, _up, _fwd);
  astronaut.group.quaternion.setFromRotationMatrix(_basis);
  astronaut.update(dt, walk.mode, walk.speed01);
  // The body is only drawn in third person: the FP camera sits inside the
  // helmet and the rig has no first-person-safe arms.
  astronaut.group.visible = walk.view === 'tp';

  const sunDot = Math.max(_up.dot(SUN), 0);
  if (dressing) dressing.update(t, sunDot);
  if (parked) parked.update(dt, t, sunDot);
  if (wonders) wonders.update(t, sunDot);

  // Interaction focus: re-scanned below in each module's own player-local
  // frame, while _playerLocal still holds it (the frames are rigid transforms
  // of world space, so the two squared distances compare directly).
  focusEntity = null;
  focusModule = null;
  focusD2 = Infinity;

  if (city) {
    city.update(t, sunDot);
    // Citizens want the player in the city's flat local x/z frame.
    if (crowd) {
      crowd.update(dt, playerLocalInto(city.group, _cityInvQuat, _playerLocal), sunDot);
      scanModule(crowd, TALK_DIST_CROWD);
      if (beacon && beaconParent === city.group) updateBeacon(t);
    }
    // Interior occupants share the same city-local player position — reuse it.
    for (const m of interiorCrowds) {
      m.update(dt, _playerLocal, sunDot);
      scanModule(m, TALK_DIST_CROWD);
    }
  }
  if (creatures) {
    creatures.update(
      dt,
      playerLocalInto(creatures.group, _creatInvQuat, _playerLocal),
      sunDot
    );
    scanModule(creatures, TALK_DIST_CREATURE);
    if (beacon && beaconParent === creatures.group) updateBeacon(t);
    // Sky ecologies (gas giants) flag a passive codex discovery instead of
    // talking. Unreachable until those become landable, but one cheap poll.
    if (creatures.onCodexDiscovery && creatures.onCodexDiscovery())
      addCodex(`Sky ecology of ${walk.planet?.cfg?.name ?? 'a gas giant'}`);
  }
  if (wavemall) {
    // crowd.group carries the surface-local anchor transform (its parent
    // wavemall.group is identity), so playerLocalInto lands the player in the
    // crowd's local frame — exactly what the crowd's nearestInteractable wants.
    playerLocalInto(wavemall.crowd.group, _wavemallInvQuat, _playerLocal);
    wavemall.update(t, dt, _playerLocal, sunDot);
    scanModule(wavemall, TALK_DIST_CROWD);
    // Lobby shopkeepers each live in their wing's district-local frame.
    for (const m of interiorCrowds) {
      m.update(dt, playerLocalInto(m.hostGroup, m.hostInvQuat, _playerLocal), sunDot);
      scanModule(m, TALK_DIST_CROWD);
    }
  }
  if (actuality) {
    // anchor carries the surface-local landing transform (its parent group is
    // identity), so playerLocalInto lands the player in the anchor frame — the
    // one frame every hub/zone interactable position lives in.
    playerLocalInto(actuality.anchor, _actualityInvQuat, _playerLocal);
    actuality.update(t, dt, _playerLocal, sunDot);
    scanModule(actuality, TALK_DIST_ACTUALITY);
    const toast = actuality.pendingToast();
    if (toast) showViewToast(toast.text, toast.seconds);
  }
  if (shadowreach) {
    // The module group sits at identity under planet.surface, so playerLocalInto
    // with an identity quaternion yields the raw surface-local player point —
    // exactly the frame the module's triggers, followers and collision expect.
    playerLocalInto(shadowreach.group, _identityQuat, _playerLocal);
    shadowreach.update(t, dt, _playerLocal, sunDot);
    scanModule(shadowreach, TALK_DIST_CROWD);
    const toast = shadowreach.pendingToast();
    if (toast) showViewToast(toast.text, toast.seconds);
  }
}

// Squared distance from _playerLocal (the module's frame) to an entity.
// Citizens store (x, z) in a Vector2; creatures use a group-local Vector3.
function entityDistSq(entity) {
  if (entity.pos.isVector2) {
    const dx = entity.pos.x - _playerLocal.x;
    const dz = entity.pos.y - _playerLocal.z;
    return dx * dx + dz * dz;
  }
  return entity.pos.distanceToSquared(_playerLocal);
}

// One module's slice of the per-frame interaction pass. With a dialogue open
// it only watches the speaker's distance (the walk-away hangup); otherwise it
// bids the module's nearest interactable for this frame's focus.
function scanModule(module, maxDist) {
  if (isDialogueOpen()) {
    if (talkModule === module && talkEntity &&
        entityDistSq(talkEntity) > TALK_BREAK_DIST * TALK_BREAK_DIST) {
      closeDialogue(); // onClose fires endInteract and clears the talk refs
    }
    return;
  }
  const e = module.nearestInteractable(_playerLocal, maxDist);
  if (!e) return;
  const d2 = entityDistSq(e);
  if (d2 < focusD2) {
    focusEntity = e;
    focusModule = module;
    focusD2 = d2;
  }
}

// E on foot (routed from main.js): advance the open dialogue, or start one
// with this frame's focused entity. The module's interact() supplies the
// payload and starts its own talk pose; endInteract() releases it on close.
export function walkInteract() {
  if (stationWalk.stationActive()) return stationWalk.stationInteract();
  if (isDialogueOpen()) {
    advanceDialogue();
    return;
  }
  if (!focusEntity || !focusModule) return;
  const entity = focusEntity;
  const module = focusModule;
  const payload = module.interact(entity);
  if (!payload || !payload.lines || !payload.lines.length) {
    // interact() already flagged the entity as talking — release it, since no
    // dialogue will open (and so no onClose will ever fire).
    module.endInteract?.(entity);
    return;
  }
  openDialogue(payload, {
    onOffer: (offer) => applyOffer(offer, module),
    onClose: () => {
      talkModule?.endInteract?.(talkEntity);
      talkEntity = null;
      talkModule = null;
    },
  });
  talkEntity = entity;
  talkModule = module;
}

// Bottom-center prompt line for main.js ("C — STAND UP" idiom). The dialogue
// panel owns its own hints while open.
export function walkPromptText() {
  if (stationWalk.stationActive()) return stationWalk.stationPromptText();
  if (isDialogueOpen() || !focusEntity) return null;
  return 'E — TALK';
}

// An accepted Quest offer (interaction.js): the module only described intent;
// the journal records it, and waypoints also get a visible beacon.
function applyOffer(offer, module) {
  if (!offer) return;
  if (offer.kind === 'codex') {
    addCodex(offer.subject);
  } else if (offer.kind === 'choice') {
    addOutcome(offer.outcomeTag);
    module.onOutcome?.(offer.outcomeTag); // module learns which option resolved
  } else if (offer.kind === 'waypoint') {
    setWaypoint(offer.targetHint);
    spawnBeacon(offer.marker, module);
  }
}

// Waypoint beacon: an emissive column at the quest marker. The marker is a
// Vector3 in the SOURCE module's group-local frame (contract), so the beacon
// is parented there — planet spin and origin rebases carry it for free, and
// the reach check runs in the same frame _playerLocal is computed in.
function spawnBeacon(marker, module) {
  if (!marker || !marker.isVector3) return;
  removeBeacon();
  // Interior crowds (quest-free) never reach here; crowd and any interior
  // module live under city.group, creatures under its own group, and the
  // wavemall crowd under its own (its quests are codex-only today, but stay safe).
  beaconParent =
    module === creatures ? creatures.group
    : module === wavemall?.crowd ? wavemall.crowd.group
    : city.group;
  if (!beaconGeo) beaconGeo = new THREE.CylinderGeometry(0.25, 0.6, 30, 6, 1, true);
  beacon = new THREE.Mesh(
    beaconGeo,
    new THREE.MeshStandardMaterial({
      color: 0xd4408f,
      emissive: 0xd4408f,
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  beacon.position.copy(marker);
  beacon.position.y += 15; // column centered on its base at the marker
  beaconParent.add(beacon);
}

// Per-frame while its parent frame is current in _playerLocal: pulse, and
// complete the waypoint when the player reaches the column's base.
function updateBeacon(t) {
  beacon.material.emissiveIntensity = 1.0 + Math.sin(t * 3) * 0.4;
  const dx = beacon.position.x - _playerLocal.x;
  const dz = beacon.position.z - _playerLocal.z;
  if (dx * dx + dz * dz < 9) {
    completeWaypoint();
    removeBeacon();
  }
}

function removeBeacon() {
  if (!beacon) return;
  beacon.material.dispose(); // geometry is shared; freed in exitWalk
  beaconParent.remove(beacon);
  beacon = null;
  beaconParent = null;
}

// True when the walker is close enough to the parked ship to board (G).
// Fails open when there's no parked ship, so the player is never trapped.
export function nearParkedShip() {
  if (stationWalk.stationActive()) return stationWalk.nearAirlock();
  // Shadowreach gates boarding to the story's endpoints: you may leave at the
  // very start (in the field, before the flower) or once the dream completes in
  // the garden — never mid-journey. Completed lets you "wake" from anywhere.
  if (shadowreach) {
    if (shadowreach.isComplete()) return true;
    if (!shadowreach.canBoard()) return false;
  }
  if (!parked || !walk.planet) return true;
  _parkPos
    .copy(parked.group.position)
    .applyAxisAngle(_yAxisV, walk.planet.surface.rotation.y) // surface-local -> world
    .add(walk.planet.body.position);
  return _parkPos.distanceTo(ship.position) <= C.WALK_BOARD_RADIUS;
}

export function promptReturnToShip() {
  if (stationWalk.stationActive()) return stationWalk.promptReturnToAirlock();
  if (shadowreach && !shadowreach.canBoard()) {
    showViewToast('THE DREAM IS NOT FINISHED');
    return;
  }
  showViewToast('RETURN TO YOUR SHIP TO TAKE OFF');
}

// dev/verification handle (main.js __debug): the landing-site entities.
export function walkSite() {
  return {
    city, parked, crowd, dressing, wavemall, actuality, shadowreach, interiorCrowds,
    station: stationWalk.stationSite(),
  };
}

// Pre-composer render hook (game.js, before composer.render()). Lets a world
// module draw to its own render targets — only the actuality mirror room does.
export function walkPreRender(renderer) {
  if (walk.active && actuality) actuality.preRender(renderer);
}

// The actuality world's hyper-holo-grid finale asks the host to loop the whole
// game back to its start (0 = repeat program). Consumed once; game.js does the
// exitWalk + resetToStart.
export function walkPendingReset() {
  return walk.active && actuality ? actuality.consumeReset() : false;
}

// Gravity scale of the world underfoot (1 = normal). For the walk-hint UI.
export function currentGravityScale() {
  if (stationWalk.stationActive()) return C.STATION_GRAVITY_SCALE;
  return walk.active ? (walk.planet?.cfg?.walkGravityScale ?? 1) : 1;
}

// Bearing from the walker to the parked ship, for the on-foot compass.
// angle: radians relative to the look heading (0 = dead ahead, + = right);
// dist: world units. Null when there's nothing to point at.
const _bearingOut = { angle: 0, dist: 0 };
export function shipBearing() {
  if (stationWalk.stationActive()) return stationWalk.airlockBearing();
  if (!walk.active || !parked || !walk.planet) return null;
  _parkPos
    .copy(parked.group.position)
    .applyAxisAngle(_yAxisV, walk.planet.surface.rotation.y) // surface -> world
    .add(walk.planet.body.position);
  _up.subVectors(ship.position, walk.planet.body.position).normalize();
  _target.subVectors(_parkPos, ship.position);
  _bearingOut.dist = _target.length();
  projectTangent(_target, _up);
  if (_target.lengthSq() < 1e-6) {
    _bearingOut.angle = 0;
    return _bearingOut;
  }
  _target.normalize();
  _right.crossVectors(walk.heading, _up).normalize();
  _bearingOut.angle = Math.atan2(_target.dot(_right), _target.dot(walk.heading));
  return _bearingOut;
}

// The on-foot camera. First person: eye-level, rolled so the planet's up is
// screen-up. Third person: an orbit behind the astronaut in the same tangent
// frame, smoothed rebase-safely (the lerp state is an OFFSET from
// ship.position — absolute positions would smear across a floating-origin
// rebase, which does fire on foot).
export function updateWalkCamera(camera, delta = 0) {
  if (stationWalk.stationActive()) return stationWalk.updateStationCamera(camera, delta);
  const planet = walk.planet;
  _up.subVectors(ship.position, planet.body.position).normalize();
  _right.crossVectors(walk.heading, _up).normalize();
  _look.copy(walk.heading).applyAxisAngle(_right, walk.pitch);

  if (walk.view === 'fp') {
    const eye = walk.swimming ? C.WALK_TP_SWIM_EYE : C.WALK_EYE_HEIGHT;
    camera.position.copy(ship.position).addScaledVector(_up, eye);
    _target.copy(camera.position).add(_look);
    camera.up.copy(_up);
    camera.lookAt(_target);
    if (camera.fov !== C.FOV) {
      camera.fov = C.FOV;
      camera.updateProjectionMatrix();
    }
    return;
  }

  // --- third person ---
  // Scroll zoom (accumulated in input.js; consumed here).
  if (input.wheel !== 0) {
    walk.camDist = Math.min(
      Math.max(walk.camDist + input.wheel * 0.004, C.WALK_CAM_MIN),
      C.WALK_CAM_MAX
    );
    input.wheel = 0;
  }

  const eyeH = walk.mode === 'swim' ? C.WALK_TP_SWIM_EYE : C.WALK_TP_EYE;
  _target.copy(ship.position).addScaledVector(_up, eyeH);
  _desired.copy(_target).addScaledVector(_look, -walk.camDist);

  // Keep the camera above the terrain and out of the water.
  _camDir.subVectors(_desired, planet.body.position);
  const camR = _camDir.length();
  _camDir.multiplyScalar(1 / camR);
  let minR = planet.radius + planet.body.terrainAt(_camDir) + 1.15;
  if (planet.water && minR < planet.water.r + 0.4) minR = planet.water.r + 0.4;
  // Actuality's Zone 9 descends into an open pit below the terrain. When the
  // walker is underground the terrain clamp would shove the third-person camera
  // back up to the surface — so the walkway down to the dragon was only visible
  // in first person. Let the camera follow the walker into the pit instead.
  if (actuality) {
    const wr = ship.position.distanceTo(planet.body.position);
    const terraR = planet.radius + planet.body.groundAt(_up) + 1.15;
    if (wr < terraR - 1.5) minR = Math.min(minR, wr - 4);
  }
  if (camR < minR) _desired.copy(planet.body.position).addScaledVector(_camDir, minR);

  // Rebase-safe smoothing: ease the offset-from-walker, then re-anchor.
  _desired.sub(ship.position);
  if (camSnap) {
    _camOffset.copy(_desired);
    camSnap = false;
  } else {
    _camOffset.lerp(_desired, 1 - Math.exp(-CAM_SMOOTH * delta));
  }
  camera.position.copy(ship.position).add(_camOffset);
  camera.up.copy(_up);
  camera.lookAt(_target);

  // A touch of extra FOV at full sprint — the demo's speed rush.
  const wantKick =
    walk.mode === 'run' && input.boost && walk.speed01 > 0.55 ? 1 : 0;
  fovKick += (wantKick - fovKick) * Math.min(1, 5 * delta);
  const fov = C.FOV + SPRINT_FOV_KICK * fovKick;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

// Remove v's component along the (unit) up vector, leaving it in the tangent
// plane. Does not renormalize.
function projectTangent(v, up) {
  v.addScaledVector(up, -v.dot(up));
}

// Rotate v about world +Y by the angle whose cos/sin are (c, s) — matches
// THREE's rotation.y (planet.js spins the surface about +Y), so co-rotating
// the walker glues it to the ground rather than counter-rotating.
function rotateXZ(v, c, s) {
  const x = v.x, z = v.z;
  v.x = x * c + z * s;
  v.z = -x * s + z * c;
}
