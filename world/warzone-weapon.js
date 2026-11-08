// Warzone viewmodel — the first-person rifle and the gloved hands holding it.
//
// Same split Claude of Duty uses for its weapons subsystem: weapon STATE
// (magazine, reserve, fire cadence, reload timeline, spread, recoil) is plain
// numbers advanced in update(), and the VIEWMODEL is a procedural mesh posed
// from that state every frame. All geometry is primitives built at load — no
// models.
//
// Also borrowed from Claude of Duty: the viewmodel lives in its OWN scene with
// its own near-plane camera and light rig, drawn over the finished frame with
// the depth buffer cleared (render()). In the world scene the rifle sat 0.3 u
// from the eye and vanished into any wall, slope or doorway jamb closer than
// that; drawn separately it can never clip, and the world's depth texture (fog,
// AO) never sees it.
//
// Frame: viewmodel-local, camera convention — -Z forward, +Y up, +X right.
// The gun's own origin is the pistol grip; the muzzle is at -Z.

import * as THREE from 'three';
import { playShot, playReload, playDryFire } from './warzone-audio.js';

export const RIFLE = {
  name: 'KV-9 CARBINE',
  magSize: 30,
  reserveStart: 210,
  reserveMax: 330,
  rpm: 660,
  reloadTime: 2.2, // empty
  tacReloadTime: 1.75, // round still chambered
  // Spread (radians, half-angle of the cone).
  hipSpread: 0.032,
  adsSpread: 0.0025,
  moveSpread: 0.03,
  airSpread: 0.06,
  bloomPerShot: 0.005,
  bloomMax: 0.03,
  bloomDecay: 0.09, // rad/s
  // Recoil: aim actually climbs (pitch, yaw), the gun visibly kicks.
  kickPitch: 0.0125,
  kickYaw: 0.0035,
  adsKickScale: 0.6,
  recoverRate: 5.5, // per-second fraction of the climb pulled back after firing
  recoverShare: 0.55, // how much of the climb is ever pulled back
  adsTime: 0.17, // seconds hip -> sights
  adsFov: 52,
};

const SHOT_INTERVAL = 60 / RIFLE.rpm;

// The sight's dot in gun-local space — ADS puts exactly this point on the
// camera axis.
const SIGHT_Y = 0.152;
const HIP = new THREE.Vector3(0.17, -0.2, -0.4);
const ADS = new THREE.Vector3(0, -SIGHT_Y, -0.3);
const SPRINT_POS = new THREE.Vector3(0.1, -0.2, -0.27);

function mat(color, rough, metal, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
}

// Cylinder between two points (for forearms and sleeves).
function strut(geoList, a, b, r0, r1, matKey, seg = 8) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()
  );
  g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
  geoList.push([g, matKey]);
}

function box(geoList, w, h, d, x, y, z, matKey, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.rotateX(rx).rotateY(ry).rotateZ(rz);
  g.translate(x, y, z);
  geoList.push([g, matKey]);
}

function cyl(geoList, r, len, x, y, z, matKey, seg = 12) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2); // along Z
  g.translate(x, y, z);
  geoList.push([g, matKey]);
}

// A radial star for the muzzle flash, drawn once into a canvas.
function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,250,220,1)');
  grad.addColorStop(0.18, 'rgba(255,210,120,0.95)');
  grad.addColorStop(0.45, 'rgba(255,130,40,0.35)');
  grad.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(255,220,150,0.8)';
  for (let i = 0; i < 6; i++) {
    g.save();
    g.translate(64, 64);
    g.rotate((i / 6) * Math.PI * 2);
    g.beginPath();
    g.moveTo(0, -4);
    g.lineTo(60, 0);
    g.lineTo(0, 4);
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createWeapon() {
  const scene = new THREE.Scene();
  const viewCam = new THREE.PerspectiveCamera(75, 1, 0.01, 10);
  // Light rig: a sky/ground fill plus a key that tracks the planet's sun
  // (setLight), so the rifle is lit like the street it's in.
  const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x4a4036, 1.1);
  const key = new THREE.DirectionalLight(0xfff1dd, 2.2);
  scene.add(hemi, key, key.target);
  // Fill from above-left of the view itself (a child of the camera-anchored
  // root, below), so the rifle never goes black with the sun under the horizon.
  const fill = new THREE.DirectionalLight(0xcfd8e6, 0.9);
  const mats = {
    polymer: mat(0x2a2d31, 0.6, 0.05),
    metal: mat(0x3a3d42, 0.4, 0.8),
    worn: mat(0x3b3d40, 0.3, 0.9),
    tan: mat(0x6a5a44, 0.7, 0.05),
    glove: mat(0x26231f, 0.85, 0.0),
    knuckle: mat(0x3a352d, 0.7, 0.0),
    sleeve: mat(0x434b37, 0.92, 0.0),
    glass: mat(0x0a1210, 0.05, 0.2, { transparent: true, opacity: 0.25 }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
  };
  // Hot enough to read as an emitter after tone mapping.
  mats.dot.color.multiplyScalar(2.5);

  const root = new THREE.Group(); // = camera transform
  root.name = 'warzone-viewmodel';
  const pose = new THREE.Group(); // hip/ADS/sprint offset + recoil + sway
  root.add(pose);
  const gun = new THREE.Group(); // gun origin at the grip
  pose.add(gun);
  const mag = new THREE.Group(); // animated in reloads
  gun.add(mag);

  // --- rifle ---
  const parts = [];
  // receiver
  box(parts, 0.052, 0.07, 0.3, 0, 0.045, -0.06, 'metal');
  box(parts, 0.048, 0.035, 0.26, 0, 0.092, -0.07, 'polymer'); // upper
  // top rail with ribs
  box(parts, 0.026, 0.012, 0.36, 0, 0.115, -0.1, 'metal');
  for (let i = 0; i < 12; i++) box(parts, 0.03, 0.006, 0.012, 0, 0.123, -0.26 + i * 0.03, 'worn');
  // handguard
  box(parts, 0.058, 0.062, 0.28, 0, 0.055, -0.34, 'tan');
  for (let i = 0; i < 5; i++) box(parts, 0.06, 0.012, 0.03, 0, 0.03, -0.25 - i * 0.045, 'polymer'); // vents
  // barrel + muzzle device
  cyl(parts, 0.011, 0.24, 0, 0.06, -0.56, 'metal');
  cyl(parts, 0.017, 0.07, 0, 0.06, -0.69, 'worn', 8);
  // gas block + front sight post folded
  box(parts, 0.03, 0.03, 0.03, 0, 0.075, -0.49, 'metal');
  // pistol grip
  box(parts, 0.04, 0.11, 0.05, 0, -0.035, 0.03, 'polymer', -0.3);
  // trigger guard + trigger
  box(parts, 0.008, 0.006, 0.07, 0, -0.005, -0.03, 'metal');
  box(parts, 0.006, 0.03, 0.006, 0, 0.005, -0.03, 'worn', 0.3);
  // stock
  box(parts, 0.036, 0.05, 0.12, 0, 0.07, 0.15, 'polymer');
  box(parts, 0.045, 0.11, 0.08, 0, 0.05, 0.26, 'tan');
  box(parts, 0.048, 0.12, 0.012, 0, 0.05, 0.305, 'polymer'); // butt pad
  // charging handle + ejection port
  box(parts, 0.018, 0.012, 0.03, 0.028, 0.08, 0.06, 'worn');
  box(parts, 0.004, 0.022, 0.06, 0.027, 0.05, -0.04, 'worn');
  // fore grip
  box(parts, 0.03, 0.075, 0.032, 0, -0.012, -0.38, 'polymer', 0.12);
  // red-dot housing
  box(parts, 0.04, 0.012, 0.075, 0, 0.128, -0.06, 'polymer');
  box(parts, 0.006, 0.05, 0.065, -0.019, 0.152, -0.06, 'polymer');
  box(parts, 0.006, 0.05, 0.065, 0.019, 0.152, -0.06, 'polymer');
  box(parts, 0.044, 0.008, 0.065, 0, 0.18, -0.06, 'polymer');

  // magazine (own group, curved by two angled boxes)
  const magParts = [];
  box(magParts, 0.034, 0.1, 0.06, 0, -0.03, -0.11, 'polymer', 0.12);
  box(magParts, 0.034, 0.08, 0.058, 0, -0.11, -0.125, 'polymer', 0.32);
  box(magParts, 0.038, 0.012, 0.064, 0, -0.152, -0.142, 'worn', 0.32);

  // --- hands & sleeves (gun-local, so they ride every gun motion) ---
  const handParts = [];
  // right hand on the grip
  box(handParts, 0.06, 0.07, 0.09, 0.008, -0.03, 0.035, 'glove', -0.3);
  box(handParts, 0.062, 0.022, 0.05, 0.004, 0.012, -0.012, 'knuckle', -0.2);
  box(handParts, 0.016, 0.018, 0.05, -0.03, 0.035, -0.01, 'glove'); // thumb over
  strut(handParts, new THREE.Vector3(0.02, -0.06, 0.07), new THREE.Vector3(0.11, -0.2, 0.36), 0.036, 0.046, 'glove');
  strut(handParts, new THREE.Vector3(0.09, -0.17, 0.3), new THREE.Vector3(0.18, -0.3, 0.6), 0.052, 0.062, 'sleeve');
  // left hand on the fore grip / handguard
  box(handParts, 0.064, 0.06, 0.1, -0.012, 0.0, -0.37, 'glove', 0.1);
  box(handParts, 0.07, 0.022, 0.07, -0.008, 0.035, -0.36, 'knuckle');
  box(handParts, 0.018, 0.018, 0.06, 0.03, 0.06, -0.33, 'glove'); // thumb along the rail
  strut(handParts, new THREE.Vector3(-0.03, -0.02, -0.33), new THREE.Vector3(-0.13, -0.17, -0.06), 0.036, 0.044, 'glove');
  strut(handParts, new THREE.Vector3(-0.11, -0.14, -0.1), new THREE.Vector3(-0.24, -0.3, 0.25), 0.05, 0.06, 'sleeve');

  const geos = [];
  function addMerged(list, parent) {
    // One mesh per material per group keeps the viewmodel to ~12 draw calls.
    const byMat = new Map();
    for (const [g, k] of list) {
      if (!byMat.has(k)) byMat.set(k, []);
      byMat.get(k).push(g);
    }
    for (const [k, arr] of byMat) {
      const merged = mergeList(arr);
      geos.push(merged);
      const m = new THREE.Mesh(merged, mats[k]);
      m.frustumCulled = false; // the root sits at the camera; never cull it
      m.renderOrder = 10;
      parent.add(m);
      for (const g of arr) g.dispose();
    }
  }
  addMerged(parts, gun);
  addMerged(magParts, mag);
  addMerged(handParts, gun);

  // red-dot glass + reticle
  const glassGeo = new THREE.PlaneGeometry(0.034, 0.04);
  geos.push(glassGeo);
  const glass = new THREE.Mesh(glassGeo, mats.glass);
  glass.position.set(0, 0.152, -0.06);
  glass.renderOrder = 11;
  gun.add(glass);
  const dotGeo = new THREE.CircleGeometry(0.0016, 10);
  geos.push(dotGeo);
  const dot = new THREE.Mesh(dotGeo, mats.dot);
  dot.position.set(0, SIGHT_Y, -0.059);
  dot.renderOrder = 12;
  gun.add(dot);

  // muzzle flash: a front-facing star + two crossed side planes
  const flashTex = flashTexture();
  const flashMat = new THREE.MeshBasicMaterial({
    map: flashTex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, color: new THREE.Color(3, 2.4, 1.6),
    side: THREE.DoubleSide,
  });
  const flash = new THREE.Group();
  flash.position.set(0, 0.06, -0.74);
  const fGeo = new THREE.PlaneGeometry(0.16, 0.16);
  const sGeo = new THREE.PlaneGeometry(0.1, 0.32);
  sGeo.rotateX(-Math.PI / 2);
  sGeo.translate(0, 0, -0.12);
  geos.push(fGeo, sGeo);
  const fFront = new THREE.Mesh(fGeo, flashMat);
  const fSide1 = new THREE.Mesh(sGeo, flashMat);
  const fSide2 = new THREE.Mesh(sGeo, flashMat);
  fSide2.rotation.z = Math.PI / 2;
  for (const m of [fFront, fSide1, fSide2]) {
    m.renderOrder = 13;
    m.frustumCulled = false;
    flash.add(m);
  }
  flash.visible = false;
  gun.add(flash);

  fill.position.set(-1.2, 2, 1.5);
  root.add(fill, fill.target);
  root.visible = false;
  scene.add(root);

  // --- state ---
  const s = {
    mag: RIFLE.magSize,
    reserve: RIFLE.reserveStart,
    cooldown: 0,
    reloading: false,
    reloadT: 0,
    reloadDur: 0,
    reloadEmpty: false,
    reloadSfx: 0,
    ads: 0, // 0 hip .. 1 sights
    sprint: 0,
    bloom: 0,
    shotCount: 0,
    climb: 0, // accumulated recoil pitch not yet recovered
    sinceShot: 9,
    flashT: 0,
    // springs (position z kick, rotation x kick)
    kickZ: 0, kickZv: 0,
    kickR: 0, kickRv: 0,
    swayX: 0, swayY: 0,
    bobPhase: 0,
    retract: 0,
    holster: 1, // 1 = lowered out of view
    triggerHeld: false,
  };

  const out = { shots: 0, pitchKick: 0, yawKick: 0 };
  const _e = new THREE.Euler();

  function startReload() {
    if (s.reloading || s.mag >= RIFLE.magSize || s.reserve <= 0) return;
    s.reloading = true;
    s.reloadEmpty = s.mag === 0;
    s.reloadDur = s.reloadEmpty ? RIFLE.reloadTime : RIFLE.tacReloadTime;
    s.reloadT = 0;
    s.reloadSfx = 0;
  }

  function finishReload() {
    // Tactical reloads keep the chambered round: 30 + 1.
    const cap = s.reloadEmpty ? RIFLE.magSize : RIFLE.magSize + 1;
    const need = cap - s.mag;
    const take = Math.min(need, s.reserve);
    s.mag += take;
    s.reserve -= take;
    s.reloading = false;
  }

  // in: { fire, ads, reload, sprinting, move01, airborne, holstered, blocked,
  //       lookDX, lookDY, wallDist }
  function update(dt, inp) {
    out.shots = 0;
    out.pitchKick = 0;
    out.yawKick = 0;

    const holsterWant = inp.holstered ? 1 : 0;
    s.holster += (holsterWant - s.holster) * Math.min(1, dt * 8);
    const usable = !inp.holstered && s.holster < 0.3;

    if (inp.reload && usable) startReload();
    if (s.reloading) {
      s.reloadT += dt;
      const p = s.reloadT / s.reloadDur;
      if (s.reloadSfx === 0 && p > 0.18) { playReload(0); s.reloadSfx = 1; }
      if (s.reloadSfx === 1 && p > 0.58) { playReload(1); s.reloadSfx = 2; }
      if (s.reloadSfx === 2 && s.reloadEmpty && p > 0.8) { playReload(2); s.reloadSfx = 3; }
      if (p >= 1) finishReload();
      if (!usable) s.reloading = false; // holstering cancels
    }

    const sprinting = inp.sprinting && !s.reloading;
    s.sprint += ((sprinting ? 1 : 0) - s.sprint) * Math.min(1, dt * 9);
    const adsWant = inp.ads && usable && !s.reloading && !sprinting ? 1 : 0;
    const adsStep = dt / RIFLE.adsTime;
    s.ads = adsWant ? Math.min(1, s.ads + adsStep) : Math.max(0, s.ads - adsStep);

    s.cooldown = Math.max(0, s.cooldown - dt);
    s.sinceShot += dt;
    const canFire = usable && !s.reloading && s.sprint < 0.35 && !inp.blocked;
    if (inp.fire && canFire) {
      if (s.mag <= 0) {
        if (!s.triggerHeld) { playDryFire(); startReload(); }
      } else {
        // Fire as many rounds as the cadence allows this frame (a long frame
        // at 660 rpm can owe two).
        while (s.cooldown <= 0 && s.mag > 0) {
          s.cooldown += SHOT_INTERVAL;
          s.mag--;
          s.shotCount++;
          out.shots++;
          s.sinceShot = 0;
          const k = 1 - (1 - RIFLE.adsKickScale) * s.ads;
          const pk = RIFLE.kickPitch * k * (0.85 + 0.3 * ((s.shotCount * 0.618) % 1));
          // Yaw drifts in a slow deterministic S — learnable, like a real pattern.
          const yk = RIFLE.kickYaw * k * Math.sin(s.shotCount * 0.9);
          out.pitchKick += pk;
          out.yawKick += yk;
          s.climb += pk;
          s.bloom = Math.min(RIFLE.bloomMax, s.bloom + RIFLE.bloomPerShot);
          s.kickZv += 1.6 * k;
          s.kickRv += 9 * k;
          s.flashT = 0.045;
          playShot();
        }
      }
    }
    s.triggerHeld = inp.fire;

    // Recovery: after the trigger lets go, pull part of the climb back down.
    if (s.sinceShot > SHOT_INTERVAL * 1.5 && s.climb > 1e-5) {
      const r = Math.min(s.climb, s.climb * RIFLE.recoverRate * dt);
      s.climb -= r;
      out.pitchKick -= r * RIFLE.recoverShare;
    }
    s.bloom = Math.max(0, s.bloom - RIFLE.bloomDecay * dt);

    // Springs: stiff, near-critically damped. Semi-implicit Euler in fixed
    // 4 ms substeps — a single step at a hitchy frame's dt diverges to NaN.
    const n = Math.min(40, Math.ceil(dt / 0.004));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      s.kickZv += (-s.kickZ * 420 - s.kickZv * 34) * h;
      s.kickZ += s.kickZv * h;
      s.kickRv += (-s.kickR * 380 - s.kickRv * 30) * h;
      s.kickR += s.kickRv * h;
    }

    // Sway lags the look; ADS steadies it.
    const swayK = 1 - 0.75 * s.ads;
    s.swayX += (THREE.MathUtils.clamp(-inp.lookDX * 0.0009, -0.06, 0.06) * swayK - s.swayX) * Math.min(1, dt * 10);
    s.swayY += (THREE.MathUtils.clamp(inp.lookDY * 0.0009, -0.06, 0.06) * swayK - s.swayY) * Math.min(1, dt * 10);

    s.bobPhase += dt * (6 + 5 * s.sprint) * Math.min(1, inp.move01 * 1.4);
    s.flashT = Math.max(0, s.flashT - dt);

    // Pull the gun back and up when the muzzle would poke into a wall.
    const want = inp.wallDist < 1.25 ? THREE.MathUtils.clamp((1.25 - inp.wallDist) / 0.7, 0, 1) : 0;
    s.retract += (want - s.retract) * Math.min(1, dt * 10);

    return out;
  }

  // Current cone half-angle for the shot about to be fired.
  function spread(move01, airborne) {
    const hip = RIFLE.hipSpread + RIFLE.moveSpread * move01 + (airborne ? RIFLE.airSpread : 0);
    const ads = RIFLE.adsSpread + RIFLE.moveSpread * 0.25 * move01 + (airborne ? RIFLE.airSpread * 0.5 : 0);
    return THREE.MathUtils.lerp(hip, ads, s.ads) + s.bloom * (1 - 0.6 * s.ads);
  }

  // Copy the camera transform and pose the gun inside it. Call after the walk
  // camera has been placed for this frame.
  function sync(camera, t) {
    root.visible = s.holster < 0.98;
    if (!root.visible) return;
    // The view scene is camera-anchored: root at the origin, the view camera
    // with it, both carrying the world camera's orientation (lighting is
    // direction-only, so position doesn't matter).
    root.position.set(0, 0, 0);
    root.quaternion.copy(camera.quaternion);
    viewCam.position.set(0, 0, 0);
    viewCam.quaternion.copy(camera.quaternion);
    if (viewCam.fov !== camera.fov || viewCam.aspect !== camera.aspect) {
      viewCam.fov = camera.fov;
      viewCam.aspect = camera.aspect;
      viewCam.updateProjectionMatrix();
    }

    const a = s.ads;
    const sp = s.sprint * (1 - a);
    pose.position.copy(HIP).lerp(ADS, a).lerp(SPRINT_POS, sp);
    // bob: figure-eight, mostly gone in ADS
    const bobK = (1 - 0.82 * a) * (1 + sp);
    pose.position.x += Math.sin(s.bobPhase) * 0.007 * bobK;
    pose.position.y += -Math.abs(Math.cos(s.bobPhase)) * 0.009 * bobK;
    // idle breathing
    pose.position.y += Math.sin(t * 1.6) * 0.0018 * (1 - 0.7 * a);
    // recoil push-back
    pose.position.z += s.kickZ * 0.03;
    // holster: drop out of frame
    pose.position.y -= s.holster * 0.35;
    // wall retract
    pose.position.z += s.retract * 0.16;
    pose.position.y -= s.retract * 0.04;

    let rx = s.kickR * 0.012 + s.swayY + s.retract * 0.55 - sp * 0.35;
    let ry = s.swayX + sp * 0.75;
    let rz = s.swayX * 0.6 - sp * 0.25 + Math.sin(s.bobPhase) * 0.01 * bobK;

    // Reload: tilt the gun in, drop the mag, seat a fresh one, rack if empty.
    mag.position.set(0, 0, 0);
    mag.visible = true;
    if (s.reloading) {
      const p = s.reloadT / s.reloadDur;
      const tilt = Math.sin(Math.min(1, p / 0.92) * Math.PI);
      rz += tilt * 0.55;
      rx += tilt * 0.18;
      pose.position.y -= tilt * 0.03;
      if (p < 0.3) {
        const k = Math.max(0, (p - 0.12) / 0.18);
        mag.position.y = -k * 0.35;
        mag.position.z = k * 0.05;
        mag.visible = k < 0.99;
      } else if (p < 0.6) {
        const k = 1 - (p - 0.3) / 0.3;
        mag.position.y = -k * 0.22;
        mag.position.z = k * 0.03;
      }
      if (s.reloadEmpty && p > 0.72 && p < 0.88) {
        rx -= Math.sin(((p - 0.72) / 0.16) * Math.PI) * 0.12;
      }
    }
    _e.set(rx, ry, rz, 'YXZ');
    pose.quaternion.setFromEuler(_e);

    flash.visible = s.flashT > 0;
    if (flash.visible) {
      flash.rotation.z = (s.shotCount * 1.37) % (Math.PI * 2);
      const sc = 0.8 + ((s.shotCount * 0.731) % 1) * 0.5;
      flash.scale.setScalar(sc);
    }
  }

  // sunDir: world-space unit vector to the sun; day 0..1 scales the key.
  function setLight(sunDir, day, envMap) {
    key.position.copy(sunDir).multiplyScalar(5);
    key.intensity = 0.7 + 1.7 * day;
    hemi.intensity = 0.8 + 0.5 * day;
    scene.environment = envMap ?? null;
  }

  // Draw over the composited frame. Called after the composer has finished.
  function render(renderer) {
    if (!root.visible) return;
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(null);
    renderer.clearDepth();
    renderer.render(scene, viewCam);
    renderer.autoClear = auto;
  }

  function addReserve(n) {
    const before = s.reserve;
    s.reserve = Math.min(RIFLE.reserveMax, s.reserve + n);
    return s.reserve - before;
  }

  function refill() {
    s.mag = RIFLE.magSize;
    s.reserve = RIFLE.reserveStart;
    s.reloading = false;
  }

  function dispose() {
    scene.remove(root);
    hemi.dispose();
    key.dispose();
    fill.dispose();
    for (const g of geos) g.dispose();
    for (const k in mats) mats[k].dispose();
    flashMat.dispose();
    flashTex.dispose();
  }

  return {
    state: s,
    update,
    sync,
    setLight,
    render,
    spread,
    addReserve,
    refill,
    dispose,
    get adsBlend() { return s.ads; },
    get reloading() { return s.reloading; },
  };
}

// Minimal merge for primitive geometries that all carry position/normal/uv
// (Box, Cylinder), indexed or not.
export function mergeList(arr) {
  let vCount = 0, iCount = 0;
  for (const g of arr) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of arr) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) {
      const src = g.index.array;
      for (let i = 0; i < src.length; i++) idx[io + i] = src[i] + vo;
      io += src.length;
    } else {
      for (let i = 0; i < n; i++) idx[io + i] = vo + i;
      io += n;
    }
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
