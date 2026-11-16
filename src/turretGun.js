// A warship's lance, manned from its bridge (src/capitalWalk.js hands over to
// this while `gun.active`; world/warships.js says where the gun is).
//
// The Sky City's Lance (src/skyWalk.js) rebuilt as a piece that stands alone:
// the mouse moves an aim point, the heavy barrel slews after it, a trigger
// winds the coil for half a second and then the beam goes. The Sky City's own
// gun is left as it is. This one fires at ships: `site.gun.targets()` lists
// what is out there as world-space spheres, and a hit is reported to
// `site.gun.onHit(id)`.
//
// Platform-local frame, as the walker's: yaw 0 looks along +Z (the bow).

import * as THREE from 'three';
import { input } from './input.js';
import { showViewToast } from './walkview.js';
import { playLanceCharge, playLanceFire, playDragonExplosion } from '../world/skycity-audio.js';

const SENS = 0.0011;
const SLEW = 0.9; // rad/s
const PITCH_MIN = -1.1;
const PITCH_MAX = 1.1;
const CHARGE = 0.55;
const COOLDOWN = 1.6;
const BEAM_TIME = 0.75;
const BEAM_LEN = 60000;
const SLACK = 30; // how wide of a hull a shot may pass and still count
export const GUN_FOV = 46;

export const gun = {
  active: false, yaw: 0, pitch: 0, aimYaw: 0, aimPitch: 0, charge: -1, cool: 0, shake: 0, flash: 0, kills: 0,
};

let site = null;
let beam = null;
let beamT = -1;
let held = true;
let reticle = null;
const _dir = new THREE.Vector3();
const _o = new THREE.Vector3();
const _v = new THREE.Vector3();
const _t = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);

const dirOf = (yaw, pitch, out) => {
  const c = Math.cos(pitch);
  return out.set(Math.sin(yaw) * c, Math.sin(pitch), Math.cos(yaw) * c);
};

function buildReticle() {
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;z-index:40;pointer-events:none;display:none;font-family:"Courier New",monospace';
  root.innerHTML = `
    <div data-ring style="position:absolute;left:50%;top:50%;width:90px;height:90px;margin:-45px 0 0 -45px;border:1px solid rgba(255,190,120,0.75);border-radius:50%"></div>
    <div data-pip style="position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;background:#ffd9a0;border-radius:50%"></div>
    <div data-line style="position:absolute;left:0;right:0;top:calc(50% + 70px);text-align:center;font-size:11px;letter-spacing:0.3em;color:#ffcf9a"></div>
    <div data-flash style="position:absolute;inset:0;background:#fff;opacity:0"></div>`;
  document.body.appendChild(root);
  return {
    root,
    ring: root.querySelector('[data-ring]'),
    pip: root.querySelector('[data-pip]'),
    line: root.querySelector('[data-line]'),
    flash: root.querySelector('[data-flash]'),
  };
}

export function enterGun(siteRef, yaw0 = 0) {
  site = siteRef;
  gun.active = true;
  gun.yaw = gun.aimYaw = yaw0;
  gun.pitch = gun.aimPitch = 0;
  gun.charge = -1;
  gun.cool = 0.4;
  held = true; // the press that sat us down is not a shot
  if (!reticle) reticle = buildReticle();
  reticle.root.style.display = 'block';
  showViewToast('THE LANCE — AIM, THEN FIRE (CLICK OR SPACE) · G — STAND DOWN', 6);
}

export function leaveGun() {
  if (!gun.active) return;
  gun.active = false;
  gun.charge = -1;
  if (reticle) reticle.root.style.display = 'none';
  if (beam) beam.visible = false;
  beamT = -1;
  site = null;
}

// The nearest thing the bore is on, or null.
function sight(originWorld, dirWorld) {
  let best = null;
  let bestAlong = Infinity;
  const list = site.gun.targets();
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    _t.copy(t.pos).sub(originWorld);
    const along = _t.dot(dirWorld);
    if (along < 0 || along > bestAlong) continue;
    const off = Math.sqrt(Math.max(_t.lengthSq() - along * along, 0));
    if (off < SLACK + t.r * 0.7) {
      best = t;
      bestAlong = along;
    }
  }
  return best;
}

function muzzle(toWorld, origin, dir) {
  dirOf(gun.yaw, gun.pitch, _dir);
  toWorld(site.gun.pivot, origin);
  dir.copy(_dir).applyQuaternion(site.group.quaternion);
}

function fire(toWorld) {
  gun.cool = COOLDOWN;
  gun.shake = 1;
  playLanceFire();
  if (!beam) {
    beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
      new THREE.MeshBasicMaterial({
        color: 0xffb060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    beam.frustumCulled = false;
    beam.material.color.multiplyScalar(2);
  }
  if (beam.parent !== site.group) site.group.add(beam);
  beam.position.copy(site.gun.pivot);
  beam.quaternion.setFromUnitVectors(_z, dirOf(gun.yaw, gun.pitch, _dir));
  beam.visible = true;
  beamT = 0;
  muzzle(toWorld, _o, _v);
  const hit = sight(_o, _v);
  if (hit) {
    gun.flash = 1;
    gun.kills++;
    playDragonExplosion(8, 0.06);
    site.gun.onHit(hit.id);
  }
}

export function stepGun(dt, toWorld) {
  gun.cool = Math.max(gun.cool - dt, 0);
  gun.aimYaw -= input.mouseX * SENS;
  gun.aimPitch = Math.min(Math.max(gun.aimPitch - input.mouseY * SENS, PITCH_MIN), PITCH_MAX);
  input.mouseX = 0;
  input.mouseY = 0;
  const step = SLEW * dt;
  let dy = gun.aimYaw - gun.yaw;
  gun.yaw += Math.max(-step, Math.min(step, dy));
  dy = gun.aimPitch - gun.pitch;
  gun.pitch += Math.max(-step, Math.min(step, dy));

  const trig = (input.fire && input.locked) || input.fireTouch || input.brake;
  if (trig && !held && gun.charge < 0 && gun.cool <= 0) {
    gun.charge = 0;
    playLanceCharge(CHARGE);
  }
  held = trig;
  if (gun.charge >= 0) {
    gun.charge += dt / CHARGE;
    if (gun.charge >= 1) {
      gun.charge = -1;
      fire(toWorld);
    }
  }
}

// E while seated is the trigger too.
export function pullTrigger() {
  if (gun.charge < 0 && gun.cool <= 0) {
    gun.charge = 0;
    playLanceCharge(CHARGE);
  }
}

export function updateGunVisuals(dt, toWorld) {
  gun.shake = Math.max(gun.shake - dt * 0.9, 0);
  gun.flash = Math.max(gun.flash - dt * 1.6, 0);
  if (beamT >= 0) {
    beamT += dt;
    const k = Math.min(beamT / BEAM_TIME, 1);
    const w = (1 - k) * (9 + 3 * Math.sin(beamT * 90));
    beam.scale.set(w, w, BEAM_LEN);
    beam.material.opacity = 1 - k * k;
    if (k >= 1) {
      beam.visible = false;
      beamT = -1;
    }
  }
  if (!gun.active || !reticle) return;
  // the pip shows where the aim is ahead of the barrel
  const px = (gun.yaw - gun.aimYaw) * (window.innerHeight / (GUN_FOV * Math.PI / 180));
  const py = (gun.pitch - gun.aimPitch) * (window.innerHeight / (GUN_FOV * Math.PI / 180));
  reticle.pip.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
  muzzle(toWorld, _o, _v);
  const on = sight(_o, _v);
  const hot = Math.max(gun.charge, 0);
  reticle.ring.style.borderColor = on ? '#ff5a3a' : 'rgba(255,190,120,0.75)';
  reticle.ring.style.transform = `scale(${(1 - hot * 0.35).toFixed(3)})`;
  reticle.line.textContent = on ? `LOCKED — ${on.label}` : gun.cool > 0 ? 'COIL COOLING' : 'NO TARGET';
  reticle.flash.style.opacity = String(gun.flash * 0.7);
}

// Camera: above and behind the breech, looking down the bore.
export function gunCamera(camera, toWorld, up) {
  dirOf(gun.yaw, gun.pitch, _dir);
  _o.copy(site.gun.pivot).addScaledVector(_dir, -34);
  _o.y += 13;
  _v.copy(site.gun.pivot).addScaledVector(_dir, 900);
  _v.y += 4;
  toWorld(_o, camera.position);
  toWorld(_v, _v);
  camera.up.copy(up);
  camera.lookAt(_v);
  if (gun.shake > 0) {
    const k = gun.shake * gun.shake * 2.2;
    const n = performance.now();
    camera.position.x += Math.sin(n * 0.093) * k;
    camera.position.y += Math.sin(n * 0.127 + 2.1) * k;
  }
  if (camera.fov !== GUN_FOV) {
    camera.fov = GUN_FOV;
    camera.updateProjectionMatrix();
  }
}
