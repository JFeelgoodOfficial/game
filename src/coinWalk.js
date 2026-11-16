// On-foot stevenlacey — the fifth walk mode, and the only flat one.
//
// The coin world (world/coinworld.js) is 3D. What happens ON it is not: when
// you step out, the ship is pressed flat against the face, the camera backs off
// onto a long lens until all depth is gone, and the rest of the visit is a
// side-scrolling game. Board again and the whole thing unfolds.
//
// How the 2D is done. The game is drawn every frame onto one small 2D canvas,
// and that canvas is the texture of a single quad standing just proud of the
// coin's face, sized to fill the long-lens view exactly. Nothing else about the
// renderer changes: the one global PerspectiveCamera stays (an orthographic one
// would have to be swapped into every pass that holds the camera), no pass is
// reconfigured, and the universe keeps running behind the quad, hidden by it.
// So there is nothing to hand back on the way out but the camera's FOV.
//
// The two faces. HEADS is the Sanctuary: wild creatures you meet, battle
// (src/coinBattle.js) and bring home. TAILS is the Claws: a cavern, a claw, a
// dash and a warden. You reach the other face by walking through the rim door,
// which flips the view over like the coin it is. Each face gates one thing on
// the other: the dash (tails) crosses the chasm to the old grove (heads), and a
// Lanternmoth (heads) clears the dark before the warden (tails).
//
// Units are tiles throughout: x to the right, y DOWN, a creature's (x, y) is
// the middle of its feet. 16 canvas pixels to the tile.
//
// walk.js dispatches its public surface here whenever coinActive().

import * as THREE from 'three';
import { C } from './constants.js';
import { input, moveAxes } from './input.js';
import { ship } from './ship.js';
import { createShip as createParkedShip } from '../world/ship.js';
import { HEADS, TAILS } from '../world/coinworld.js';
import { buildLevels, LEVEL_W, LEVEL_H } from '../world/coin-levels.js';
import { SPECIMENS, SPECIMEN_ORDER, ELEMENT_COLOR, drawMon } from '../world/coin-bestiary.js';
import { grantSpecimen, hasSpecimen, ownedSpecimens } from './inventory.js';
import { createBattle, makeFighter, drawText } from './coinBattle.js';
import { blip, closeCoinAudio } from '../world/coin-audio.js';
import { showViewToast, hideViewUI } from './walkview.js';

const STORE_KEY = 'fgsf.stevenlacey';

// ---- the view -----------------------------------------------------------------
const TILE = 16; // canvas px per tile
const VIEW_ROWS = 17;
const CANVAS_H = TILE * VIEW_ROWS; // 272
const VIEW_WORLD_H = 54; // world units the quad stands tall
const FLAT_FOV = 14; // the long lens
const QUAD_OFF = 26; // quad this far proud of the face (clear of the hull)
const T_IN = 1.9; // seconds: 3D -> 2D
const T_OUT = 1.5;
const T_FLIP = 1.3; // seconds for the rim crossing

// ---- the walker ---------------------------------------------------------------
const RUN = 9; // tiles/s
const ACCEL_GROUND = 90;
const ACCEL_AIR = 55;
const GRAVITY = 60;
const MAX_FALL = 28;
const JUMP = 21; // apex about 3.6 tiles
const JUMP_CUT = 8; // releasing the key early caps the rise at this
const COYOTE = 0.1;
const JUMP_BUFFER = 0.12;
const DASH_SPEED = 24;
const DASH_TIME = 0.18;
const DASH_COOL = 0.55;
const PW = 0.7, PH = 1.6; // the walker's box, tiles
const SLASH_TIME = 0.13;
const SLASH_COOL = 0.32;
const SLASH_REACH = 1.9;
const HURT_INVULN = 1.0;
const MAX_HP = 5;
const TALK = 2.4; // tiles: how near counts as "at" something

// thumbs have their own labelled buttons (src/touchControls.js)
const TOUCH = typeof window !== 'undefined' && ('ontouchstart' in window
  || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));

export const cWalk = { active: false };

let coin = null;
let landFace = HEADS;
let face = HEADS;
let mode = 'play'; // 'in' | 'play' | 'flip' | 'out' | 'gone'
let modeT = 0;
let flipped = false;

let quad = null, quadMat = null, quadTex = null;
let canvas = null, g = null;
let cw = 480; // canvas width, follows the window's aspect
let hull = null;
let levels = null;
let lvl = null; // the level of the current face
let clock = 0;

const camStartPos = new THREE.Vector3();
const camStartQuat = new THREE.Quaternion();
let camStartFov = C.FOV;
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _bearingOut = { angle: 0, dist: 0, label: 'SHIP' };

// what persists between visits (the creatures themselves live in inventory.js)
const save = { claw: false, dash: false, team: [], champion: false, boss: false, husk: false };
function loadSave() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!d || typeof d !== 'object') return;
    save.claw = !!d.claw;
    save.dash = !!d.dash;
    save.champion = !!d.champion;
    save.boss = !!d.boss;
    if (Array.isArray(d.team)) save.team = d.team.filter((i) => SPECIMENS[i]).slice(0, 3);
  } catch { /* corrupt or unavailable: start fresh, session-only */ }
}
function writeSave() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(save));
  } catch { /* session-only */ }
}

// the walker
const p = {
  x: 0, y: 0, vx: 0, vy: 0, dir: 1, grounded: false,
  coyote: 0, jumpBuf: 0, dashT: 0, dashCd: 0, airDash: true,
  slashT: 0, slashCd: 0, slashId: 0,
  hp: MAX_HP, inv: 0, safeX: 0, safeY: 0, safeT: 0, step: 0,
};
let respawn = { face: HEADS, x: 0, y: 0 };
const cam = { x: 0, y: 0 };
// input edges
const prev = { jump: false, up: false, down: false, left: false, right: false, claw: false, dash: false };
let ePressed = false;

// session state
const fighters = new Map(); // id -> { id, hp, max, atk, spd }, for creatures you own
let battle = null;
let battleFoe = null; // the level entity being fought (a wild one, or 'champion')
let teamMenu = null; // { sel }
let focus = null; // what E would act on right now: { kind, ref, text }
let signText = null;
let busyT = 0; // brief hold after a battle so the same E does not start another
const shots = []; // the warden's projectiles
let boss = null;

// ---------------------------------------------------------------------------
// Geometry: where the quad, the hull and the camera go
// ---------------------------------------------------------------------------

// Coin-local basis of a face (see the frames note in world/coinworld.js).
function faceBasisLocal(f) {
  _r.set(f, 0, 0);
  _u.set(0, 0, -1);
  _n.set(0, f, 0);
}

function placeQuad(f) {
  faceBasisLocal(f);
  quad.position.set(0, 0, 0)
    .addScaledVector(_r, C.COIN_PAD_X * f)
    .addScaledVector(_u, C.COIN_PAD_Y)
    .addScaledVector(_n, coin.thickness / 2 + QUAD_OFF);
  quad.quaternion.setFromRotationMatrix(_m.makeBasis(_r, _u, _n));
}

// The 2D camera pose in world space, for the face in play.
function flatPose(outPos, outQuat) {
  coin.group.updateMatrixWorld();
  coin.faceFrame(face, _r, _u, _n);
  quad.getWorldPosition(_c);
  const d = (VIEW_WORLD_H / 2) / Math.tan(THREE.MathUtils.degToRad(FLAT_FOV / 2));
  outPos.copy(_c).addScaledVector(_n, d);
  outQuat.setFromRotationMatrix(_m.makeBasis(_r, _u, _n));
}

// The pilot's-seat pose: where the cockpit camera is when the ship is parked.
function seatPose(outPos, outQuat) {
  coin.faceOffset(landFace, C.COIN_PAD_X * landFace, C.COIN_PAD_Y, C.COIN_PAD_OFF, outPos);
  outPos.add(coin.group.position);
  coin.faceFrame(landFace, _r, _u, _n);
  _p.copy(_r).multiplyScalar(-1);
  outQuat.setFromRotationMatrix(_m.makeBasis(_n, _u, _p));
}

function sizeCanvas(aspect) {
  const w = Math.min(640, Math.max(320, Math.round((CANVAS_H * aspect) / 2) * 2));
  if (canvas && w === cw && canvas.width === w) return;
  cw = w;
  canvas.width = cw;
  canvas.height = CANVAS_H;
  g.imageSmoothingEnabled = false;
  // a resized canvas needs a fresh GPU texture
  if (quadTex) quadTex.dispose();
  quadTex = new THREE.CanvasTexture(canvas);
  quadTex.colorSpace = THREE.SRGBColorSpace;
  quadTex.magFilter = THREE.NearestFilter;
  quadTex.minFilter = THREE.LinearFilter;
  quadTex.generateMipmaps = false;
  quadMat.map = quadTex;
  quadMat.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Enter / leave
// ---------------------------------------------------------------------------

export function coinActive() {
  return cWalk.active;
}

export function enterCoinWalk(coinRef, onFace, camera) {
  if (!coinRef) return false;
  if (cWalk.active) teardown();
  coin = coinRef;
  landFace = face = onFace === TAILS ? TAILS : HEADS;
  cWalk.active = true;
  loadSave();

  canvas = document.createElement('canvas');
  g = canvas.getContext('2d');
  quadMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
  quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), quadMat);
  quad.renderOrder = 10;
  coin.group.add(quad);
  sizeCanvas(camera ? camera.aspect : 16 / 9);
  placeQuad(face);

  // The freighter, standing where the cockpit left it. It flattens as we go in.
  hull = createParkedShip(coin.group, {});
  faceBasisLocal(face);
  hull.group.position.set(0, 0, 0)
    .addScaledVector(_r, C.COIN_PAD_X * face)
    .addScaledVector(_u, C.COIN_PAD_Y)
    .addScaledVector(_n, coin.thickness / 2 + C.COIN_PAD_OFF);
  _p.copy(_r).multiplyScalar(-1);
  hull.group.quaternion.setFromRotationMatrix(_m.makeBasis(_n, _u, _p));

  levels = buildLevels();
  for (const key of ['heads', 'tails']) populate(levels[key]);
  lvl = face === HEADS ? levels.heads : levels.tails;
  fighters.clear();
  for (const id of ownedSpecimens()) fighters.set(id, makeFighter(id));
  save.team = save.team.filter((i) => fighters.has(i));
  if (!save.team.length && fighters.size) save.team = [...fighters.keys()].slice(0, 3);

  // Step out beside the ship, on the side away from the rim door.
  const side = lvl.door.x < lvl.pad.x ? 1 : -1;
  spawnAt(lvl.pad.x + side * 4.5, lvl.pad.y + 1);
  p.dir = side;
  p.hp = MAX_HP;
  respawn = { face, x: p.x, y: p.y };
  cam.x = p.x - cw / TILE / 2;
  cam.y = p.y - VIEW_ROWS * 0.62;
  clampCam();

  battle = null;
  teamMenu = null;
  focus = null;
  signText = null;
  shots.length = 0;
  ePressed = false;
  clock = 0;

  if (camera) {
    camStartPos.copy(camera.position);
    camStartQuat.copy(camera.quaternion);
    camStartFov = camera.fov;
  }
  mode = 'in';
  modeT = 0;

  ship.velocity.set(0, 0, 0);
  ship.angularVelocity.set(0, 0, 0);
  ship.properAccel.set(0, 0, 0);
  return true;
}

function teardown() {
  if (quad) {
    quad.removeFromParent();
    quad.geometry.dispose();
    quadMat.dispose();
    if (quadTex) quadTex.dispose();
    quad = quadMat = quadTex = null;
  }
  if (hull) {
    hull.group.removeFromParent();
    hull.dispose();
    hull = null;
  }
  canvas = g = null;
  levels = lvl = null;
  battle = null;
  teamMenu = null;
  boss = null;
  shots.length = 0;
  closeCoinAudio();
  hideViewUI();
  cWalk.active = false;
  mode = 'play';
  coin = null;
}

// Every exit comes through here, the hard resets included, so the camera's
// lens is handed back whatever state the visit was in.
export function exitCoinWalk(camera) {
  if (camera) {
    camera.fov = C.FOV;
    camera.updateProjectionMatrix();
  }
  teardown();
}

// G at the ship: fold the world back up. game.js polls coinLeft() for the end.
export function coinBeginLeave() {
  if (mode !== 'play' || battle || teamMenu) return;
  mode = 'out';
  modeT = 0;
  blip('flip');
}
// The face the ship is on, once the fold-up has finished; 0 until then.
export function coinLeft() {
  return cWalk.active && mode === 'gone' ? landFace : 0;
}

// ---------------------------------------------------------------------------
// Level contents
// ---------------------------------------------------------------------------

function populate(L) {
  L.ents = [];
  for (const w of L.wild) {
    if (hasSpecimen(w.id)) continue; // it already came home with you
    L.ents.push({
      kind: 'wild', id: w.id, x: (w.x0 + w.x1) / 2 + 0.5, y: w.y + 1, x0: w.x0 + 0.5, x1: w.x1 + 0.5,
      dir: 1, flies: !!w.flies, wait: 0, alive: true,
    });
  }
  for (const e of L.enemies) {
    if (e.kind === 'crawler') {
      L.ents.push({ kind: 'crawler', x: e.x0 + 0.5, y: e.y + 1, x0: e.x0 + 0.5, x1: e.x1 + 0.5, dir: 1, hp: 2, alive: true, hurt: 0, hitId: 0 });
    } else if (e.kind === 'flyer') {
      L.ents.push({ kind: 'flyer', x: e.x + 0.5, y: e.y + 1, hx: e.x + 0.5, hy: e.y + 1, hp: 1, alive: true, hurt: 0, hitId: 0 });
    } else {
      L.ents.push({ kind: 'charger', x: e.x + 0.5, y: e.y + 1, hx: e.x + 0.5, dir: -1, st: 'idle', t: 0, hp: 3, alive: true, hurt: 0, hitId: 0 });
    }
  }
  if (L.huskling && !hasSpecimen('husk')) {
    L.ents.push({ kind: 'husk', x: L.huskling.x + 0.5, y: L.huskling.y + 1, alive: true });
  }
  if (L.boss && !save.boss) {
    L.bossEnt = {
      x: L.boss.x + 0.5, y: L.boss.y + 1, vx: 0, vy: 0, dir: 1, hp: 10, max: 10,
      st: 'sleep', t: 0, hurt: 0, hitId: 0, grounded: true, alive: true,
    };
  } else {
    L.bossEnt = null;
  }
}

function tileAt(L, tx, ty) {
  if (tx < 0 || tx >= LEVEL_W) return '#';
  if (ty < 0 || ty >= LEVEL_H) return ' ';
  return L.tiles[ty][tx];
}
function solidAt(tx, ty) {
  const c = tileAt(lvl, tx, ty);
  return c === '#' || (c === 'D' && !hasSpecimen('lantern'));
}

function spawnAt(x, y) {
  p.x = x;
  p.y = y;
  p.vx = p.vy = 0;
  p.grounded = false;
  p.dashT = 0;
  p.safeX = x;
  p.safeY = y;
}

function clampCam() {
  const vw = cw / TILE;
  cam.x = Math.min(Math.max(cam.x, 0), LEVEL_W - vw);
  cam.y = Math.min(Math.max(cam.y, 0), LEVEL_H - VIEW_ROWS);
}

// ---------------------------------------------------------------------------
// The team
// ---------------------------------------------------------------------------

function team() {
  return save.team.map((id) => fighters.get(id)).filter(Boolean);
}
function healAll() {
  for (const f of fighters.values()) f.hp = f.max;
  p.hp = MAX_HP;
}
function adopt(id) {
  if (!grantSpecimen(id)) return false;
  fighters.set(id, makeFighter(id));
  if (save.team.length < 3) save.team.push(id);
  writeSave();
  blip('gain');
  return true;
}

function startBattle(ent) {
  const t = team();
  if (!t.length) {
    showViewToast('YOU HAVE NO COMPANION YET — LOOK FOR THE NEST', 4);
    return;
  }
  if (!t.some((m) => m.hp > 0)) {
    showViewToast('YOUR TEAM IS SPENT — REST AT A SHRINE', 4);
    return;
  }
  let foes, opener, canRun = true;
  if (ent === 'champion') {
    foes = [makeFighter('burrow', 0.85), makeFighter('cinder', 0.85), makeFighter('crown', 0.8)];
    opener = 'THE KEEPER OF THE DAIS ACCEPTS YOUR CHALLENGE';
    canRun = false;
  } else {
    foes = [makeFighter(ent.id, ent.id === 'thorn' || ent.id === 'storm' ? 1 : 0.9)];
  }
  battleFoe = ent;
  battle = createBattle({ team: t, foes, canRun, opener });
  blip('battle');
}

function endBattle() {
  const result = battle.done;
  const ent = battleFoe;
  battle = null;
  battleFoe = null;
  busyT = 0.4;
  if (result === 'win') {
    blip('win');
    if (ent === 'champion') {
      save.champion = true;
      writeSave();
      if (!adopt('crown')) showViewToast('THE KEEPER BOWS', 4);
    } else {
      ent.alive = false;
      adopt(ent.id);
    }
  } else if (result === 'lose') {
    blip('lose');
    healAll();
    toShrine();
    showViewToast('YOU WAKE AT THE SHRINE, RESTED', 4);
  }
}

function toShrine() {
  if (respawn.face !== face) setFace(respawn.face);
  spawnAt(respawn.x, respawn.y);
  p.inv = HURT_INVULN;
  shots.length = 0;
  if (lvl.bossEnt && lvl.bossEnt.alive) {
    // the warden goes back to sleep, healed, so the fight starts fair
    const b = lvl.bossEnt;
    b.x = lvl.boss.x + 0.5;
    b.y = lvl.boss.y + 1;
    b.vx = b.vy = 0;
    b.hp = b.max;
    b.st = 'sleep';
    b.grounded = true;
  }
  cam.x = p.x - cw / TILE / 2;
  cam.y = p.y - VIEW_ROWS * 0.62;
  clampCam();
}

function setFace(f) {
  face = f;
  lvl = f === HEADS ? levels.heads : levels.tails;
  placeQuad(f);
}

// ---------------------------------------------------------------------------
// The controller
// ---------------------------------------------------------------------------

function edges() {
  const ax = moveAxes();
  const up = ax.fwd > 0.5, down = ax.fwd < -0.5, left = ax.strafe < -0.5, right = ax.strafe > 0.5;
  const jump = input.brake;
  const claw = input.warp || input.fire || input.fireTouch;
  // Shift is the dash. A touch stick pushed hard also sets `sprint` (it is the
  // run toggle elsewhere), so on touch the dash comes from its own button.
  const touching = input.moveX !== 0 || input.moveY !== 0;
  const dash = (input.sprint && !touching) || input.coinDash;
  const e = {
    ax: ax.strafe,
    jump, jumpHit: jump && !prev.jump,
    upHit: up && !prev.up, downHit: down && !prev.down,
    leftHit: left && !prev.left, rightHit: right && !prev.right,
    clawHit: claw && !prev.claw, dashHit: dash && !prev.dash,
    down, ok: ePressed,
  };
  prev.jump = jump; prev.up = up; prev.down = down; prev.left = left; prev.right = right;
  prev.claw = claw; prev.dash = dash;
  input.coinDash = false;
  ePressed = false;
  return e;
}

export function stepCoinWalk(dt) {
  // The mouse means nothing here. Eat it, so a visit's worth of stray motion
  // does not land on the ship's stick at take-off.
  input.mouseX = 0;
  input.mouseY = 0;
  input.wheel = 0;
  clock += dt;
  // ship.position is "where the player is" to the rest of the game (origin
  // rebases, nav, the compass): the ship's own spot, the whole visit.
  coin.faceOffset(landFace, C.COIN_PAD_X * landFace, C.COIN_PAD_Y, C.COIN_PAD_OFF, ship.position);
  ship.position.add(coin.group.position);
  ship.velocity.set(0, 0, 0);

  const e = edges();
  if (mode !== 'play') {
    modeT += dt;
    if (mode === 'in' && modeT >= T_IN) {
      mode = 'play';
      hull.group.visible = false;
      showViewToast(face === HEADS ? 'HEADS · THE SANCTUARY' : 'TAILS · THE CLAWS', 4);
    } else if (mode === 'flip') {
      if (!flipped && modeT >= T_FLIP / 2) {
        flipped = true;
        setFace(-face);
        spawnAt(lvl.door.x + (lvl.door.x < LEVEL_W / 2 ? 2.5 : -1.5), lvl.door.y + 1);
        p.dir = lvl.door.x < LEVEL_W / 2 ? 1 : -1;
        respawn = { face, x: p.x, y: p.y };
        cam.x = p.x - cw / TILE / 2;
        cam.y = p.y - VIEW_ROWS * 0.62;
        clampCam();
      }
      if (modeT >= T_FLIP) {
        mode = 'play';
        showViewToast(face === HEADS ? 'HEADS · THE SANCTUARY' : 'TAILS · THE CLAWS', 4);
      }
    } else if (mode === 'out' && modeT >= T_OUT) {
      mode = 'gone';
    }
    return;
  }

  if (battle) {
    const inp = { up: e.upHit || e.leftHit, down: e.downHit || e.rightHit, ok: e.ok || e.jumpHit };
    if (inp.up || inp.down) blip('select');
    battle.update(dt, inp);
    if (battle.over) endBattle();
    return;
  }
  if (teamMenu) {
    stepTeamMenu(e);
    return;
  }
  busyT = Math.max(0, busyT - dt);

  stepPlayer(dt, e);
  stepEntities(dt);
  if (face === TAILS) stepCombat(dt);
  findFocus();
  if (e.ok && busyT <= 0) interact();

  // camera: lead the walker a little, ease, stay inside the level
  const vw = cw / TILE;
  const tx = p.x + p.dir * 2.2 - vw / 2;
  const ty = p.y - VIEW_ROWS * 0.62;
  cam.x += (tx - cam.x) * Math.min(1, dt * 5);
  cam.y += (ty - cam.y) * Math.min(1, dt * 4);
  clampCam();
}

function stepPlayer(dt, e) {
  p.inv = Math.max(0, p.inv - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.slashCd = Math.max(0, p.slashCd - dt);
  p.slashT = Math.max(0, p.slashT - dt);
  p.jumpBuf = e.jumpHit ? JUMP_BUFFER : Math.max(0, p.jumpBuf - dt);
  p.coyote = p.grounded ? COYOTE : Math.max(0, p.coyote - dt);

  if (Math.abs(e.ax) > 0.2) p.dir = e.ax > 0 ? 1 : -1;

  // dash: a flat burst, once per time off the ground
  if (e.dashHit && save.dash && p.dashCd <= 0 && p.dashT <= 0 && (p.grounded || p.airDash)) {
    p.dashT = DASH_TIME;
    p.dashCd = DASH_COOL;
    if (!p.grounded) p.airDash = false;
    blip('dash');
  }
  if (e.clawHit && save.claw && face === TAILS && p.slashCd <= 0) {
    p.slashT = SLASH_TIME;
    p.slashCd = SLASH_COOL;
    p.slashId++;
    blip('slash');
  }

  if (p.dashT > 0) {
    p.dashT -= dt;
    p.vx = p.dir * DASH_SPEED;
    p.vy = 0;
  } else {
    const want = e.ax * RUN;
    const a = (p.grounded ? ACCEL_GROUND : ACCEL_AIR) * dt;
    p.vx += Math.min(Math.max(want - p.vx, -a), a);
    p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);
    if (p.jumpBuf > 0 && p.coyote > 0) {
      p.vy = -JUMP;
      p.jumpBuf = 0;
      p.coyote = 0;
      p.grounded = false;
      blip('jump');
    }
    if (!e.jump && p.vy < -JUMP_CUT) p.vy = -JUMP_CUT;
  }

  // --- move in x, then y, pushing out of solid tiles one axis at a time ---
  const hw = PW / 2;
  p.x += p.vx * dt;
  {
    const top = Math.floor(p.y - PH), bot = Math.floor(p.y - 0.01);
    const lead = Math.floor(p.x + (p.vx >= 0 ? hw : -hw));
    for (let ty = top; ty <= bot; ty++) {
      if (!solidAt(lead, ty)) continue;
      p.x = p.vx >= 0 ? lead - hw - 0.001 : lead + 1 + hw + 0.001;
      p.vx = 0;
      break;
    }
  }
  const feetBefore = p.y;
  p.y += p.vy * dt;
  const wasGrounded = p.grounded;
  p.grounded = false;
  const x0 = Math.floor(p.x - hw + 0.02), x1 = Math.floor(p.x + hw - 0.02);
  if (p.vy >= 0) {
    const ty = Math.floor(p.y);
    for (let tx = x0; tx <= x1; tx++) {
      const c = tileAt(lvl, tx, ty);
      // a one-way platform only catches feet that were above it, and lets you
      // through if you hold down
      const oneWay = c === '=' && feetBefore <= ty + 0.01 && !e.down;
      if (solidAt(tx, ty) || oneWay) {
        p.y = ty;
        p.vy = 0;
        p.grounded = true;
        if (c !== '=') p.onSolid = true; else p.onSolid = false;
        break;
      }
    }
  } else {
    const ty = Math.floor(p.y - PH);
    for (let tx = x0; tx <= x1; tx++) {
      if (!solidAt(tx, ty)) continue;
      p.y = ty + 1 + PH;
      p.vy = 0;
      break;
    }
  }
  if (p.grounded) {
    p.airDash = true;
    if (!wasGrounded) blip('land');
    p.step += Math.abs(p.vx) * dt;
    // remember firm ground, for putting you back after a fall
    p.safeT += dt;
    if (p.onSolid && p.safeT > 0.2) {
      p.safeT = 0;
      p.safeX = p.x;
      p.safeY = p.y;
    }
  }

  // spikes
  if (tileAt(lvl, Math.floor(p.x), Math.floor(p.y - 0.2)) === '^') hurt(p.x - p.dir);
  // off the bottom of the world
  if (p.y > LEVEL_H + 3) {
    if (face === TAILS) {
      p.inv = 0;
      hurt(p.x, true);
      if (p.hp > 0) spawnAt(p.safeX, p.safeY);
    } else {
      spawnAt(p.safeX, p.safeY);
    }
  }
}

// Take a hit from something at x `fromX`. Only the Claws face can hurt you.
function hurt(fromX, quiet = false) {
  // nothing lands mid-dash: it is the way through the warden's rush
  if (p.inv > 0 || (p.dashT > 0 && !quiet)) return;
  p.hp--;
  p.inv = HURT_INVULN;
  blip('hurt');
  if (!quiet) {
    p.vx = (p.x < fromX ? -1 : 1) * 9;
    p.vy = -11;
    p.dashT = 0;
  }
  if (p.hp <= 0) {
    healAll();
    toShrine();
    showViewToast('YOU WAKE AT THE SHRINE', 4);
  }
}

function stepEntities(dt) {
  for (const en of lvl.ents) {
    if (!en.alive || en.kind !== 'wild') continue;
    // amble between the ends of its patch, pausing now and then
    if (en.wait > 0) {
      en.wait -= dt;
      continue;
    }
    en.x += en.dir * (en.flies ? 1.6 : 1.1) * dt;
    if (en.x > en.x1) { en.x = en.x1; en.dir = -1; en.wait = 0.6 + ((en.x0 * 7) % 10) / 10; }
    if (en.x < en.x0) { en.x = en.x0; en.dir = 1; en.wait = 0.9; }
  }
}

// ---- the Claws: enemies, the warden, the claw ---------------------------------

function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
  // boxes given by feet-centre x, feet y, width, height
  return Math.abs(ax - bx) < (aw + bw) / 2 && ay > by - bh && ay - ah < by;
}

function slashHits(x, y, w, h) {
  if (p.slashT <= 0) return false;
  const sx = p.x + p.dir * (SLASH_REACH / 2);
  return overlaps(sx, p.y + 0.2, SLASH_REACH, PH + 0.5, x, y, w, h);
}

function strike(en) {
  if (en.hitId === p.slashId) return false; // one slash, one hit
  en.hitId = p.slashId;
  en.hp--;
  en.hurt = 0.18;
  blip('hit');
  return true;
}

function stepCombat(dt) {
  for (const en of lvl.ents) {
    if (!en.alive || en.kind === 'wild' || en.kind === 'husk') continue;
    en.hurt = Math.max(0, en.hurt - dt);
    const dx = p.x - en.x;
    if (en.kind === 'crawler') {
      en.x += en.dir * 2.4 * dt;
      if (en.x > en.x1) { en.x = en.x1; en.dir = -1; }
      if (en.x < en.x0) { en.x = en.x0; en.dir = 1; }
    } else if (en.kind === 'flyer') {
      const near = Math.abs(dx) < 8 && Math.abs(p.y - en.y) < 7;
      const tx = near ? p.x : en.hx;
      const ty = (near ? p.y - 0.8 : en.hy) + Math.sin(clock * 3 + en.hx) * 0.5;
      const d = Math.hypot(tx - en.x, ty - en.y) || 1;
      const sp = Math.min(near ? 3.4 : 2.2, d / dt);
      en.x += ((tx - en.x) / d) * sp * dt;
      en.y += ((ty - en.y) / d) * sp * dt;
    } else if (en.kind === 'charger') {
      en.t += dt;
      if (en.st === 'idle') {
        if (Math.abs(dx) < 9 && Math.abs(p.y - en.y) < 2) {
          en.st = 'wind';
          en.t = 0;
          en.dir = dx > 0 ? 1 : -1;
        }
      } else if (en.st === 'wind') {
        if (en.t > 0.5) { en.st = 'run'; en.t = 0; }
      } else if (en.st === 'run') {
        const nx = en.x + en.dir * 13 * dt;
        if (en.t > 0.8 || solidAt(Math.floor(nx + en.dir * 0.6), Math.floor(en.y - 0.5))
          || !solidAt(Math.floor(nx + en.dir * 0.6), Math.floor(en.y))) {
          en.st = 'rest';
          en.t = 0;
        } else en.x = nx;
      } else if (en.t > 1.0) en.st = 'idle';
    }
    const w = en.kind === 'charger' ? 1.4 : 0.9, h = en.kind === 'charger' ? 1.3 : 0.8;
    if (slashHits(en.x, en.y, w, h) && strike(en)) {
      if (en.hp <= 0) en.alive = false;
      else if (en.kind !== 'flyer') en.x += p.dir * 0.4;
    } else if (overlaps(p.x, p.y, PW, PH, en.x, en.y, w, h)) hurt(en.x);
  }
  stepBoss(dt);
  // the warden's shots
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    s.vy += s.g * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    const dead = s.life <= 0 || solidAt(Math.floor(s.x), Math.floor(s.y - 0.2));
    if (!dead && overlaps(p.x, p.y, PW, PH, s.x, s.y, 0.5, 0.5)) hurt(s.x);
    if (dead) shots.splice(i, 1);
  }
}

function shoot(x, y, vx, vy, grav) {
  if (shots.length < 12) shots.push({ x, y, vx, vy, g: grav, life: grav ? 3 : 1.3 });
}

function stepBoss(dt) {
  const b = lvl.bossEnt;
  if (!b || !b.alive) return;
  b.hurt = Math.max(0, b.hurt - dt);
  b.t += dt;
  const dx = p.x - b.x;
  const L = lvl.boss;
  if (b.st === 'sleep') {
    if (Math.abs(dx) < 11 && p.x < L.x1 + 2) {
      b.st = 'idle';
      b.t = 0;
      blip('boss');
      showViewToast('THE RIMWARDEN WAKES', 3);
    }
    return;
  }
  // gravity, floor
  if (!b.grounded) {
    b.vy += GRAVITY * 0.8 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const floor = L.y + 1;
    if (b.y >= floor) {
      b.y = floor;
      b.grounded = true;
      b.vx = b.vy = 0;
      blip('boss');
      // the slam throws a wave each way along the floor
      shoot(b.x + 1.6, floor, 8, 0, 0);
      shoot(b.x - 1.6, floor, -8, 0, 0);
      b.st = 'idle';
      b.t = 0;
    }
  } else if (b.st === 'idle') {
    b.dir = dx > 0 ? 1 : -1;
    if (b.t > 0.9) {
      // pick by where you are: far away, it spits; close, it leaps; else it rushes
      const far = Math.abs(dx) > 9;
      const pick = far ? 'spit' : Math.abs(dx) < 4 ? 'leap' : (Math.floor(clock * 7) % 2 ? 'rush' : 'leap');
      b.st = pick + 'Wind';
      b.t = 0;
    }
  } else if (b.st === 'leapWind') {
    if (b.t > 0.45) {
      b.grounded = false;
      b.vy = -20;
      b.vx = Math.max(-11, Math.min(11, dx / 0.85));
      b.st = 'leap';
    }
  } else if (b.st === 'rushWind') {
    if (b.t > 0.7) { b.st = 'rush'; b.t = 0; }
  } else if (b.st === 'rush') {
    b.x += b.dir * 13 * dt;
    if (b.x < L.x0 + 1.5 || b.x > L.x1 - 1.5 || b.t > 1.4) {
      b.x = Math.min(Math.max(b.x, L.x0 + 1.5), L.x1 - 1.5);
      b.st = 'idle';
      b.t = 0;
    }
  } else if (b.st === 'spitWind') {
    if (b.t > 0.6) {
      for (let i = 0; i < 3; i++) shoot(b.x, b.y - 2.4, b.dir * (6 + i * 3), -13, 34);
      blip('slash');
      b.st = 'idle';
      b.t = 0;
    }
  }
  b.x = Math.min(Math.max(b.x, L.x0 + 1.5), L.x1 - 1.5);

  if (slashHits(b.x, b.y, 2.8, 2.8) && strike(b)) {
    if (b.hp <= 0) {
      b.alive = false;
      shots.length = 0;
      save.boss = true;
      writeSave();
      blip('win');
      if (!adopt('whelp')) showViewToast('THE RIMWARDEN FALLS', 4);
    }
  } else if (overlaps(p.x, p.y, PW, PH, b.x, b.y, 2.6, 2.6)) hurt(b.x);
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

function near(x, y, r = TALK) {
  return Math.abs(p.x - (x + 0.5)) < r && Math.abs(p.y - (y + 1)) < r + 1;
}

function findFocus() {
  focus = null;
  signText = null;
  if (near(lvl.door.x, lvl.door.y, 1.6)) {
    focus = { kind: 'door', text: 'E — GO ROUND THE RIM' };
    return;
  }
  for (const s of lvl.shrines) {
    if (!near(s.x, s.y, 1.6)) continue;
    const first = lvl.clawShrine && s.x === lvl.clawShrine.x && !save.claw;
    focus = { kind: 'shrine', ref: s, text: first ? 'E — TAKE THE CLAW' : 'E — REST AT THE SHRINE' };
    return;
  }
  if (lvl.nest && near(lvl.nest.x, lvl.nest.y, 1.6)) {
    focus = { kind: 'nest', text: hasSpecimen('sprout') ? null : 'E — LOOK IN THE NEST' };
    if (focus.text) return;
    focus = null;
  }
  if (lvl.champion && near(lvl.champion.x, lvl.champion.y, 2.6)) {
    focus = { kind: 'champion', text: save.champion ? 'E — CHALLENGE THE KEEPER AGAIN' : 'E — CHALLENGE THE KEEPER' };
    return;
  }
  for (const en of lvl.ents) {
    if (!en.alive) continue;
    if (en.kind === 'wild' && Math.abs(p.x - en.x) < TALK && Math.abs(p.y - en.y) < 3.2) {
      focus = { kind: 'wild', ref: en, text: `E — BATTLE ${SPECIMENS[en.id].name.toUpperCase()}` };
      return;
    }
    if (en.kind === 'husk' && Math.abs(p.x - en.x) < TALK && Math.abs(p.y - en.y) < 2) {
      focus = { kind: 'husk', ref: en, text: 'E — HOLD OUT A HAND' };
      return;
    }
  }
  for (const s of lvl.signs) if (near(s.x, s.y, 2)) signText = s.text;
  // pickups you only have to touch
  if (lvl.dashOrb && !save.dash && near(lvl.dashOrb.x, lvl.dashOrb.y, 1.3)) {
    save.dash = true;
    writeSave();
    blip('gain');
    showViewToast('THE DASH IS YOURS — SHIFT TO DASH', 5);
  }
}

function interact() {
  if (!focus) return;
  if (focus.kind === 'door') {
    mode = 'flip';
    modeT = 0;
    flipped = false;
    blip('flip');
  } else if (focus.kind === 'shrine') {
    healAll();
    respawn = { face, x: focus.ref.x + 0.5, y: focus.ref.y + 1 };
    blip('rest');
    if (lvl.clawShrine && focus.ref.x === lvl.clawShrine.x && !save.claw) {
      save.claw = true;
      writeSave();
      showViewToast('THE CLAW IS YOURS — F TO SLASH', 5);
    } else if (fighters.size > 1) {
      teamMenu = { sel: 0 };
    } else {
      showViewToast('RESTED', 2.5);
    }
  } else if (focus.kind === 'nest') {
    if (adopt('sprout')) busyT = 0.4;
  } else if (focus.kind === 'champion') {
    startBattle('champion');
  } else if (focus.kind === 'wild') {
    startBattle(focus.ref);
  } else if (focus.kind === 'husk') {
    focus.ref.alive = false;
    adopt('husk');
  }
}

// At a shrine: choose who walks with you, and in what order.
function teamList() {
  return SPECIMEN_ORDER.filter((id) => fighters.has(id));
}
function stepTeamMenu(e) {
  const list = teamList();
  const n = list.length + 1; // + DONE
  if (e.upHit) { teamMenu.sel = (teamMenu.sel + n - 1) % n; blip('select'); }
  if (e.downHit) { teamMenu.sel = (teamMenu.sel + 1) % n; blip('select'); }
  if (!(e.ok || e.jumpHit)) return;
  if (teamMenu.sel === list.length) {
    teamMenu = null;
    writeSave();
    busyT = 0.4;
    return;
  }
  const id = list[teamMenu.sel];
  const at = save.team.indexOf(id);
  if (at >= 0) {
    if (save.team.length > 1) save.team.splice(at, 1);
  } else if (save.team.length < 3) save.team.push(id);
  blip('ok');
}

// walk.js routes E here (game.js consumes the key and calls walkInteract).
export function coinInteract() {
  ePressed = true;
}

export function coinPromptText() {
  if (mode !== 'play' || battle || teamMenu) return null;
  if (focus && focus.text) return focus.text;
  if (nearPad()) return 'G — BOARD';
  return signText;
}

export function nearPad() {
  if (!cWalk.active || mode !== 'play' || battle || teamMenu || face !== landFace) return false;
  return Math.abs(p.x - (lvl.pad.x + 0.5)) < 5.5 && Math.abs(p.y - (lvl.pad.y + 1)) < 3;
}

export function promptReturnToPad() {
  if (mode !== 'play' || battle || teamMenu) return;
  showViewToast(face === landFace ? 'RETURN TO THE SHIP TO LEAVE' : 'THE SHIP IS ON THE OTHER FACE', 3);
}

export function padBearing() {
  if (!cWalk.active || !lvl) return null;
  if (face !== landFace) {
    const dx = lvl.door.x - p.x;
    _bearingOut.angle = dx >= 0 ? Math.PI / 2 : -Math.PI / 2;
    _bearingOut.dist = Math.abs(dx) + 20;
    _bearingOut.label = 'RIM';
    return _bearingOut;
  }
  const dx = lvl.pad.x + 0.5 - p.x;
  _bearingOut.angle = dx >= 0 ? Math.PI / 2 : -Math.PI / 2;
  _bearingOut.dist = Math.abs(dx);
  _bearingOut.label = 'SHIP';
  return _bearingOut;
}

// ---------------------------------------------------------------------------
// Camera: the fold between 3D and 2D
// ---------------------------------------------------------------------------

const smooth = (k) => { const c = Math.min(Math.max(k, 0), 1); return c * c * (3 - 2 * c); };

export function updateCoinCamera(camera) {
  sizeCanvas(camera.aspect);
  quad.scale.set(VIEW_WORLD_H * (cw / CANVAS_H), VIEW_WORLD_H, 1);
  let fov = FLAT_FOV;
  if (mode === 'in' || mode === 'out' || mode === 'gone') {
    // 'in' runs seat -> flat; 'out' runs flat -> seat, to wherever the seat is now
    let k;
    if (mode === 'in') {
      k = smooth(modeT / T_IN);
      flatPose(_p, _q);
      camera.position.lerpVectors(camStartPos, _p, k);
      camera.quaternion.slerpQuaternions(camStartQuat, _q, k);
      fov = THREE.MathUtils.lerp(camStartFov, FLAT_FOV, k);
    } else {
      k = mode === 'gone' ? 0 : 1 - smooth(modeT / T_OUT);
      flatPose(_p, _q);
      seatPose(camStartPos, camStartQuat);
      camera.position.lerpVectors(camStartPos, _p, k);
      camera.quaternion.slerpQuaternions(camStartQuat, _q, k);
      fov = THREE.MathUtils.lerp(C.FOV, FLAT_FOV, k);
    }
    quadMat.opacity = smooth((k - 0.5) / 0.45);
    if (hull) {
      hull.group.visible = k < 0.98;
      hull.group.scale.set(1 - 0.97 * smooth(k / 0.75), 1, 1); // local X is the face normal
    }
  } else {
    flatPose(camera.position, camera.quaternion);
    quadMat.opacity = 1;
    if (mode === 'flip') {
      // turn the picture over, edge-on at the half-way point where the face changes
      const c = Math.abs(Math.cos(Math.PI * Math.min(modeT / T_FLIP, 1)));
      quad.scale.x *= Math.max(c, 0.002);
    }
  }
  if (camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

const hash = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 97;

function drawBackground(W) {
  if (face === HEADS) {
    const grd = g.createLinearGradient(0, 0, 0, CANVAS_H);
    grd.addColorStop(0, '#6ab8e8');
    grd.addColorStop(0.7, '#cfe8c8');
    grd.addColorStop(1, '#e8e0a8');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, CANVAS_H);
    g.fillStyle = '#fff6c8';
    g.fillRect(W - 70, 28, 22, 22);
    // far hills, then nearer trees, each sliding slower than the ground
    for (let layer = 0; layer < 2; layer++) {
      const par = layer ? 0.5 : 0.25;
      const off = cam.x * TILE * par;
      g.fillStyle = layer ? '#5f9a5a' : '#8fc49a';
      for (let x = 0; x < W; x += 4) {
        const wx = (x + off) * (layer ? 0.02 : 0.011);
        const h = (layer ? 70 : 110) + Math.sin(wx) * 22 + Math.sin(wx * 2.7 + 1) * 10;
        g.fillRect(x, CANVAS_H - h - cam.y * par * 2 + 20, 4, h + 40);
      }
    }
  } else {
    const grd = g.createLinearGradient(0, 0, 0, CANVAS_H);
    grd.addColorStop(0, '#0e0d16');
    grd.addColorStop(1, '#23212f');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, CANVAS_H);
    const off = cam.x * TILE * 0.4;
    g.fillStyle = '#191824';
    for (let x = -24; x < W + 24; x += 24) {
      const i = Math.floor((x + off) / 24);
      const sx = i * 24 - off;
      g.fillRect(sx, 0, 14, 30 + hash(i, 3) * 1.1);
      g.fillRect(sx + 6, CANVAS_H - 20 - hash(i, 9) * 0.7, 12, 120);
    }
    // drifting motes
    g.fillStyle = 'rgba(200,198,224,0.5)';
    for (let i = 0; i < 14; i++) {
      const mx = (hash(i, 1) * 7 + clock * (6 + (i % 3) * 4) - cam.x * TILE * 0.7) % (W + 20);
      g.fillRect(mx < 0 ? mx + W + 20 : mx, (hash(i, 5) * 3 + Math.sin(clock + i) * 6) % CANVAS_H, 1, 1);
    }
  }
}

function drawTiles(W) {
  const x0 = Math.floor(cam.x), y0 = Math.floor(cam.y);
  const ox = Math.round(-(cam.x - x0) * TILE), oy = Math.round(-(cam.y - y0) * TILE);
  const cols = Math.ceil(W / TILE) + 1;
  const heads = face === HEADS;
  for (let j = 0; j <= VIEW_ROWS; j++) {
    for (let i = 0; i <= cols; i++) {
      const tx = x0 + i, ty = y0 + j;
      const c = tileAt(lvl, tx, ty);
      if (c === ' ') continue;
      const sx = ox + i * TILE, sy = oy + j * TILE;
      if (c === '#') {
        const open = tileAt(lvl, tx, ty - 1) !== '#';
        const h = hash(tx, ty);
        g.fillStyle = heads ? (h % 3 ? '#7a5230' : '#6e4a2a') : (h % 3 ? '#34324a' : '#2e2c40');
        g.fillRect(sx, sy, TILE, TILE);
        g.fillStyle = heads ? '#5e3e22' : '#262436';
        g.fillRect(sx + (h % 11), sy + 5 + (h % 7), 3, 2);
        if (open) {
          g.fillStyle = heads ? '#4f9a3a' : '#6a6884';
          g.fillRect(sx, sy, TILE, heads ? 4 : 2);
          if (heads) {
            g.fillStyle = '#7fc45a';
            g.fillRect(sx + (h % 5), sy, 3, 1);
            g.fillRect(sx + 8 + (h % 4), sy - 2, 1, 2);
          }
        }
      } else if (c === '=') {
        g.fillStyle = heads ? '#8a5a30' : '#6a6884';
        g.fillRect(sx, sy, TILE, 4);
        g.fillStyle = heads ? '#58a85a' : '#4a4860';
        g.fillRect(sx, sy, TILE, 1);
      } else if (c === '~') {
        g.fillStyle = '#3f7fd0';
        g.fillRect(sx, sy + 3, TILE, TILE - 3);
        g.fillStyle = '#9fd0f4';
        if (tileAt(lvl, tx, ty - 1) !== '~') g.fillRect(sx + ((clock * 8 + tx * 5) % 12 | 0), sy + 3, 4, 1);
      } else if (c === '^') {
        g.fillStyle = '#c8c6e0';
        for (let k = 0; k < 4; k++) {
          g.fillRect(sx + k * 4 + 1, sy + 8, 2, 8);
          g.fillRect(sx + k * 4 + 1.5, sy + 5, 1, 3);
        }
      } else if (c === 'D' && !hasSpecimen('lantern')) {
        g.fillStyle = '#05040a';
        g.fillRect(sx, sy, TILE, TILE);
        g.fillStyle = 'rgba(90,80,140,0.5)';
        g.fillRect(sx + ((clock * 5 + ty * 3) % TILE | 0), sy + (hash(tx, ty) % TILE), 2, 1);
      }
    }
  }
}

// screen x / y of a tile-space point
const SX = (x) => Math.round((x - cam.x) * TILE);
const SY = (y) => Math.round((y - cam.y) * TILE);

function drawProps() {
  const heads = face === HEADS;
  // the rim door: an arch of milled gold
  {
    const x = SX(lvl.door.x + 0.5), y = SY(lvl.door.y + 1);
    g.fillStyle = '#d9a93a';
    g.fillRect(x - 12, y - 40, 24, 40);
    g.fillStyle = heads ? '#23212f' : '#cfe8c8'; // you can see the other side through it
    g.fillRect(x - 8, y - 34, 16, 34);
    g.fillStyle = '#8a6420';
    for (let k = 0; k < 5; k++) g.fillRect(x - 12, y - 40 + k * 8, 24, 1);
  }
  // the ship, flat: only on the face it landed on
  if (face === landFace) {
    const x = SX(lvl.pad.x + 0.5), y = SY(lvl.pad.y + 1);
    const f = lvl.door.x < lvl.pad.x ? 1 : -1; // nose away from the door, as it flew in
    g.save();
    g.translate(x, y);
    g.scale(f, 1);
    g.fillStyle = '#3a4250';
    g.fillRect(-34, -8, 4, 8);
    g.fillRect(18, -8, 4, 8);
    g.fillRect(-38, -2, 12, 2);
    g.fillRect(14, -2, 12, 2);
    g.fillStyle = '#c8d0dc';
    g.fillRect(-44, -30, 78, 20);
    g.fillRect(34, -26, 12, 14);
    g.fillRect(46, -22, 6, 8);
    g.fillStyle = '#8a94a4';
    g.fillRect(-44, -14, 78, 4);
    g.fillRect(-52, -40, 12, 22);
    g.fillStyle = '#82f7ff';
    g.fillRect(28, -26, 14, 7);
    g.fillStyle = '#d4408f';
    g.fillRect(-50, -28, 6, 12);
    g.fillRect(-20, -22, 30, 2);
    g.restore();
  }
  if (lvl.nest) {
    const x = SX(lvl.nest.x + 0.5), y = SY(lvl.nest.y + 1);
    g.fillStyle = '#8a6a3a';
    g.fillRect(x - 10, y - 5, 20, 5);
    g.fillRect(x - 12, y - 7, 4, 4);
    g.fillRect(x + 8, y - 7, 4, 4);
    if (!hasSpecimen('sprout')) drawMon(g, 'sprout', (clock * 2) & 1, x - 8, y - 19, 1);
  }
  for (const s of lvl.shrines) {
    const x = SX(s.x + 0.5), y = SY(s.y + 1);
    g.fillStyle = heads ? '#b8b0a0' : '#4a4860';
    g.fillRect(x - 7, y - 4, 14, 4);
    g.fillRect(x - 3, y - 20, 6, 16);
    g.fillRect(x - 6, y - 24, 12, 4);
    const glow = 0.5 + 0.5 * Math.sin(clock * 3 + s.x);
    g.fillStyle = `rgba(${heads ? '255,230,140' : '170,200,255'},${0.5 + glow * 0.5})`;
    g.fillRect(x - 2, y - 30 - glow * 2, 4, 4);
  }
  if (lvl.clawShrine && !save.claw) {
    const x = SX(lvl.clawShrine.x + 0.5), y = SY(lvl.clawShrine.y + 1);
    g.fillStyle = '#eef0ff';
    for (let k = 0; k < 3; k++) g.fillRect(x - 5 + k * 4, y - 42 + k, 2, 8);
  }
  if (lvl.dashOrb && !save.dash) {
    const x = SX(lvl.dashOrb.x + 0.5), y = SY(lvl.dashOrb.y + 1) + Math.round(Math.sin(clock * 3) * 2);
    g.fillStyle = '#82f7ff';
    g.fillRect(x - 3, y - 12, 6, 6);
    g.fillStyle = '#eaffff';
    g.fillRect(x - 1, y - 10, 2, 2);
    g.fillStyle = 'rgba(130,247,255,0.5)';
    g.fillRect(x - 10, y - 10, 5, 2);
  }
  if (lvl.champion) {
    const x = SX(lvl.champion.x + 0.5), y = SY(lvl.champion.y + 1);
    // the keeper: a robed figure with a crown, a Crownstag beside it
    g.fillStyle = '#3a2f5a';
    g.fillRect(x - 5, y - 20, 10, 20);
    g.fillStyle = '#e8d0a8';
    g.fillRect(x - 3, y - 27, 6, 7);
    g.fillStyle = '#ffd040';
    g.fillRect(x - 4, y - 30, 8, 3);
    g.fillRect(x - 4, y - 32, 2, 2);
    g.fillRect(x + 2, y - 32, 2, 2);
    drawMon(g, 'crown', (clock * 2) & 1, x + 8, y - 32, 2, true);
  }
  for (const s of lvl.signs) {
    const x = SX(s.x + 0.5), y = SY(s.y + 1);
    g.fillStyle = heads ? '#6b4423' : '#4a4860';
    g.fillRect(x - 1, y - 14, 2, 14);
    g.fillRect(x - 8, y - 20, 16, 9);
    g.fillStyle = heads ? '#e8d9b0' : '#c8c6e0';
    g.fillRect(x - 6, y - 18, 12, 1);
    g.fillRect(x - 6, y - 15, 9, 1);
  }
}

function drawEntities() {
  const frame = (clock * 3) & 1;
  for (const en of lvl.ents) {
    if (!en.alive) continue;
    const x = SX(en.x), y = SY(en.y);
    if (en.kind === 'wild') {
      const bob = en.flies ? Math.round(Math.sin(clock * 3 + en.x0) * 3) : 0;
      drawMon(g, en.id, frame, x - 16, y - 32 + bob, 2, en.dir < 0);
    } else if (en.kind === 'husk') {
      drawMon(g, 'husk', frame, x - 16, y - 32, 2, p.x < en.x);
    } else {
      const white = en.hurt > 0;
      if (en.kind === 'crawler') {
        g.fillStyle = white ? '#fff' : '#15131c';
        g.fillRect(x - 8, y - 8, 16, 8);
        g.fillRect(x - 6, y - 11, 12, 3);
        g.fillStyle = white ? '#fff' : '#eef0ff';
        g.fillRect(x + (en.dir > 0 ? 3 : -6), y - 7, 3, 3);
        g.fillStyle = '#6a6884';
        g.fillRect(x - 7 + frame * 2, y - 1, 3, 1);
        g.fillRect(x + 3 - frame * 2, y - 1, 3, 1);
      } else if (en.kind === 'flyer') {
        g.fillStyle = white ? '#fff' : '#2e2c3e';
        g.fillRect(x - 4, y - 12, 8, 8);
        g.fillStyle = white ? '#fff' : '#6a6884';
        g.fillRect(x - 12, y - 12 + frame * 3, 8, 3);
        g.fillRect(x + 4, y - 12 + frame * 3, 8, 3);
        g.fillStyle = '#ffd98a';
        g.fillRect(x - 2, y - 10, 1, 2);
        g.fillRect(x + 1, y - 10, 1, 2);
      } else {
        const wind = en.st === 'wind' && ((clock * 16) & 1);
        g.fillStyle = white || wind ? '#fff' : '#3a3850';
        g.fillRect(x - 11, y - 18, 22, 18);
        g.fillStyle = white ? '#fff' : '#eef0ff';
        g.fillRect(x + (en.dir > 0 ? 9 : -14), y - 14, 5, 3); // the horn
        g.fillStyle = '#ff5040';
        g.fillRect(x + (en.dir > 0 ? 4 : -7), y - 13, 3, 2);
      }
    }
  }
  const b = lvl.bossEnt;
  if (b && b.alive) {
    const x = SX(b.x), y = SY(b.y);
    const wind = b.st.endsWith('Wind') && ((clock * 14) & 1);
    const body = b.hurt > 0 || wind ? '#ffffff' : '#4a4860';
    // a great coin-collared beast: body, collar, horned head, one eye
    g.fillStyle = body;
    g.fillRect(x - 22, y - 34, 44, 34);
    g.fillRect(x - 16, y - 46, 32, 12);
    g.fillRect(x - 20, y - 54, 5, 12);
    g.fillRect(x + 15, y - 54, 5, 12);
    g.fillStyle = '#d9a93a';
    g.fillRect(x - 24, y - 30, 48, 6);
    g.fillStyle = '#8a6420';
    for (let k = 0; k < 8; k++) g.fillRect(x - 23 + k * 6, y - 30, 1, 6);
    g.fillStyle = b.st === 'sleep' ? '#2e2c3e' : '#ffd98a';
    g.fillRect(x - 9, y - 42, 18, b.st === 'sleep' ? 1 : 4);
    g.fillStyle = '#2e2c3e';
    g.fillRect(x - 20 + frame * 2, y - 3, 12, 3);
    g.fillRect(x + 8 - frame * 2, y - 3, 12, 3);
  }
  g.fillStyle = '#ffd98a';
  for (const s of shots) g.fillRect(SX(s.x) - 3, SY(s.y) - 6, 6, 6);
}

function drawPlayer() {
  if (p.inv > 0 && ((clock * 18) & 1)) return; // flicker while invulnerable
  const x = SX(p.x), y = SY(p.y);
  const run = p.grounded && Math.abs(p.vx) > 1 ? ((p.step * 1.6) & 1) : 0;
  g.save();
  g.translate(x, y);
  g.scale(p.dir, 1);
  if (p.dashT > 0) {
    g.fillStyle = 'rgba(130,247,255,0.45)';
    g.fillRect(-22, -20, 16, 3);
    g.fillRect(-18, -12, 12, 3);
  }
  // the astronaut: pack, suit, helmet, visor
  g.fillStyle = '#8a94a4';
  g.fillRect(-6, -19, 3, 10);
  g.fillStyle = '#eaf0f8';
  g.fillRect(-4, -18, 8, 11);
  g.fillStyle = '#d4408f';
  g.fillRect(-4, -11, 8, 2);
  g.fillStyle = '#eaf0f8';
  g.fillRect(-5, -26, 10, 9);
  g.fillStyle = '#16303a';
  g.fillRect(-1, -24, 6, 5);
  g.fillStyle = '#82f7ff';
  g.fillRect(3, -24, 1, 2);
  g.fillStyle = '#c8d0dc';
  if (p.grounded) {
    g.fillRect(-4 + run * 2, -7, 3, 7);
    g.fillRect(1 - run * 2, -7, 3, 7);
  } else {
    g.fillRect(-4, -7, 3, 5);
    g.fillRect(1, -8, 3, 5);
  }
  if (p.slashT > 0) {
    // the claw: three pale strokes ahead of you
    g.fillStyle = '#eef0ff';
    for (let k = 0; k < 3; k++) g.fillRect(8 + k * 6, -28 + k * 3, 3, 22 - k * 4);
    g.fillStyle = 'rgba(238,240,255,0.4)';
    g.fillRect(6, -26, 22, 20);
  }
  g.restore();
}

function drawHud(W) {
  if (face === TAILS) {
    for (let i = 0; i < MAX_HP; i++) {
      g.fillStyle = i < p.hp ? '#eef0ff' : '#34324a';
      g.fillRect(10 + i * 14, 10, 10, 12);
      g.fillStyle = '#0e0d14';
      if (i < p.hp) {
        g.fillRect(12 + i * 14, 14, 2, 4);
        g.fillRect(16 + i * 14, 14, 2, 4);
      }
    }
    const b = lvl.bossEnt;
    if (b && b.alive && b.st !== 'sleep') {
      g.fillStyle = '#1a1820';
      g.fillRect(W / 2 - 80, CANVAS_H - 16, 160, 6);
      g.fillStyle = '#d9a93a';
      g.fillRect(W / 2 - 80, CANVAS_H - 16, Math.round((160 * b.hp) / b.max), 6);
      drawText(g, 'THE RIMWARDEN', W / 2, CANVAS_H - 30, '#d9a93a', 'center');
    }
  } else {
    const t = team();
    for (let i = 0; i < t.length; i++) {
      const x = 10 + i * 40;
      g.fillStyle = 'rgba(4,12,20,0.7)';
      g.fillRect(x, 8, 36, 26);
      drawMon(g, t[i].id, 0, x + 2, 9, 1);
      g.fillStyle = '#1a2a34';
      g.fillRect(x + 2, 28, 32, 3);
      g.fillStyle = t[i].hp > 0 ? '#7fd65a' : '#ff5040';
      g.fillRect(x + 2, 28, Math.round((32 * t[i].hp) / t[i].max), 3);
      g.fillStyle = ELEMENT_COLOR[SPECIMENS[t[i].id].element];
      g.fillRect(x + 28, 11, 5, 5);
    }
  }
  drawText(g, `${ownedSpecimens().length} / ${SPECIMEN_ORDER.length}`, W - 10, 10, '#ffd040', 'right');
  // the controls, for the first while: there is no panel for them out here
  if (clock < 16 && !TOUCH) {
    drawText(g, 'A D  MOVE  ·  SPACE  JUMP  ·  S  DROP  ·  E  USE', W / 2, CANVAS_H - 14, '#eaffff', 'center');
  }
}

function drawTeamMenu(W) {
  const list = teamList();
  const h = 44 + list.length * 20;
  const x = Math.round(W / 2 - 130), y = Math.round((CANVAS_H - h) / 2);
  g.fillStyle = 'rgba(4,12,20,0.94)';
  g.fillRect(x, y, 260, h);
  g.strokeStyle = 'rgba(200,168,106,0.8)';
  g.strokeRect(x + 0.5, y + 0.5, 259, h - 1);
  drawText(g, 'WHO WALKS WITH YOU · UP TO THREE', x + 130, y + 8, '#e8d9b0', 'center');
  for (let i = 0; i < list.length; i++) {
    const id = list[i], s = SPECIMENS[id], ry = y + 26 + i * 20;
    const on = i === teamMenu.sel, slot = save.team.indexOf(id);
    if (on) { g.fillStyle = 'rgba(200,168,106,0.2)'; g.fillRect(x + 4, ry - 2, 252, 19); }
    drawMon(g, id, on ? (clock * 3) & 1 : 0, x + 8, ry, 1);
    g.fillStyle = ELEMENT_COLOR[s.element];
    g.fillRect(x + 30, ry + 5, 5, 5);
    drawText(g, s.name.toUpperCase(), x + 40, ry + 3, on ? '#ffd040' : '#eaffff');
    drawText(g, slot >= 0 ? `[${slot + 1}]` : '[ ]', x + 250, ry + 3, slot >= 0 ? '#7fd65a' : '#5a6a74', 'right');
  }
  const dy = y + 26 + list.length * 20;
  drawText(g, teamMenu.sel === list.length ? '▸ DONE' : '  DONE', x + 130, dy + 2,
    teamMenu.sel === list.length ? '#ffd040' : '#eaffff', 'center');
}

export function updateCoinVisuals() {
  if (!g) return;
  const W = cw;
  if (battle) {
    battle.draw(g, W, CANVAS_H, clock);
  } else {
    drawBackground(W);
    drawTiles(W);
    drawProps();
    drawEntities();
    drawPlayer();
    drawHud(W);
    if (teamMenu) drawTeamMenu(W);
  }
  quadTex.needsUpdate = true;
}

// dev/verification handle (walkSite().coin)
export function coinSite() {
  if (!cWalk.active) return null;
  return {
    mode, face, landFace, save: { ...save }, team: team().map((m) => ({ ...m })),
    player: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, grounded: p.grounded, hp: p.hp },
    focus: focus && focus.kind, prompt: coinPromptText(), battle: battle && { state: battle.state, msg: battle.msg, done: battle.done },
    teamMenu: !!teamMenu, boss: lvl.bossEnt && { hp: lvl.bossEnt.hp, st: lvl.bossEnt.st, alive: lvl.bossEnt.alive },
    canvas, level: lvl,
    // test hooks
    press() { ePressed = true; },
    setTeam(ids) { save.team = ids.filter((i) => fighters.has(i)).slice(0, 3); },
    heal: healAll,
    ents: lvl.ents,
    put(x, y) { spawnAt(x, y); cam.x = x - cw / TILE / 2; cam.y = y - VIEW_ROWS * 0.62; clampCam(); },
    give(what) { if (what === 'claw' || what === 'dash') { save[what] = true; writeSave(); } else adopt(what); },
    battleWith(id) { startBattle(id === 'champion' ? 'champion' : lvl.ents.find((en) => en.kind === 'wild' && en.id === id) || { id, alive: true }); },
    endBattle(result) { if (battle) { battle.done = result; endBattle(); } },
  };
}
