// The ending (src/tenretni.js owns the story; same lazy chunk).
//
// Three captains have each opened a channel (src/fleets.js boarding). With all
// three open, and the pilot's ship within sight of the worldship, a CALL THE
// FLEETS control appears (H, or a tap). Calling it runs one last script:
//
//   0–20   every surviving warship jumps in to a ring round the worldship
//   20–30  the lances charge
//   30–34  they all fire at once
//   34     white. The worldship is gone and a new star burns where it was
//   38–62  what planets remain fall into the old sun, one after another
//   62–74  the black hole crosses to the sun and swallows it
//
// Then the rally, on its own clock:
//
//   cheer   every channel is open at once: the three fleets celebrate, and with
//           no worlds left to go home to they put themselves under the pilot
//   offer   a second control: WE GO INTO THE WORMHOLE, TOGETHER
//   go      the fleet forms on the pilot's ship, the autopilot flies to the
//           wormhole's mouth and hands back the helm, and the pilot takes
//           everyone in. Through it is the far side (src/farside.js): the
//           Tenretni megaworld, and no way back. From then on this module is
//           `far`: it keeps the old system removed and shows nothing of its own.
//
// What is left — the new star, the wormhole, the ships that survived — is the
// system until then. The star's place is kept in absolute coordinates, so
// the end state is rebuilt the same on every load and after every world reset.

import * as THREE from 'three';
import { ship } from './ship.js';
import { sun } from './sun.js';
import { blackhole } from './blackhole.js';
import { originOffset, addShiftable } from './origin.js';
import { removePlanet, planets } from './planet.js';
import { setNavHidden, addNavBody, showNavToast } from './nav.js';
import { makeGlowSprite, makeStarburstSprite } from './starburst.js';
import { uiSound } from './sfx.js';
import { startAutoWarp } from './autopilot.js';
import { isTouch } from './touchText.js';

const T_JUMP = 20, T_FIRE = 30, T_KILL = 34, T_FALL = 38, T_BH = 62, T_END = 74;
const CALL_RANGE = 9000; // how close to the worldship's surface the pilot must be
const STAR_R = 1500;

// The rally's lines, by second. `cheer`: the roar goes up with this one.
const RALLY = [
  [1, 'A NEW STAR, A WORMHOLE, AND WHOEVER IS LEFT.'],
  [7, 'RUSTIA — IT IS DEAD! EVERY HAND ON EVERY DECK IS CHEERING!', true],
  [13, 'WAVEMALL — BEST. CLOSING. EVENT. EVER. THE WHOLE FLEET IS DANCING!', true],
  [19, 'SATURNIA — EVERY BELL ON EVERY HALO IS RINGING!', true],
  [26, 'OUR WORLDS ARE GONE. THREE PEOPLES, NO HOME, ONE FLEET.'],
  [33, 'YOU CALLED AND WE CAME. WE ARE YOURS NOW. LEAD US, PILOT.', true],
];
const RALLY_END = 40;

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const seg = (u, a, b) => clamp01((u - a) / (b - a));
const ease = (x) => x * x * (3 - 2 * x);

// ctx: { scene, camera, terra, fx, setRumble(r), fleets() -> fleets | null,
//        explode(pos, scale), comms: {faction: true}, worldshipAlive() -> bool,
//        extra — worlds that are not planets (the coin),
//        killWorldship() — take the worldship out of space,
//        openWormhole() -> its nav body { pos (live), radius, ... },
//        save() }
export function createEndgame(ctx) {
  const { terra, fx } = ctx;
  let v = -1; // script clock, -1 when not running
  let lastV = 0;
  let done = false;
  let starAbs = null; // [x, y, z], absolute
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const Z = new THREE.Vector3(0, 0, 1);
  let rally = null; // null | 'cheer' | 'offer' | 'go'
  let rallyT = 0, rallyLast = 0;
  let wormBody = null; // the wormhole's nav body, once it has been opened
  let far = false; // the pilot has gone through: nothing here is shown again
  const falls = []; // planets on their way into the sun: { p, from: Vector3 (rel. to sun), t0 }
  const bhFrom = new THREE.Vector3();

  // the star
  const star = new THREE.Group();
  star.visible = false;
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshBasicMaterial({ color: 0xfff4dc }));
  core.material.color.multiplyScalar(3.2);
  star.add(core);
  const glow = makeGlowSprite(0xffe6b0, STAR_R * 6, 0.55);
  const burst = makeStarburstSprite(0xfff2d8, STAR_R * 14, 0.9);
  star.add(glow, burst);
  ctx.scene.add(star);
  addShiftable(star);

  // the volley: one beam per warship
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const beams = new THREE.InstancedMesh(beamGeo, new THREE.MeshBasicMaterial({
    color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }), 12);
  beams.material.color.multiplyScalar(2);
  beams.frustumCulled = false;
  beams.visible = false;
  ctx.scene.add(beams);

  // the control
  const btn = document.createElement('button');
  btn.textContent = 'H — CALL THE FLEETS';
  btn.style.cssText = 'position:fixed;left:50%;bottom:18%;transform:translateX(-50%);z-index:30;display:none;' +
    'padding:12px 22px;font:13px "Courier New",monospace;letter-spacing:0.3em;color:#fff0c0;' +
    'background:rgba(40,20,6,0.8);border:1px solid #ffb36a;box-shadow:0 0 24px rgba(255,160,80,0.4);cursor:pointer';
  document.body.appendChild(btn);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    call();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH' && btn.style.display !== 'none') call();
  });

  // the second control: the pilot's answer to "lead us"
  const btn2 = btn.cloneNode(false);
  btn2.textContent = (isTouch ? '' : 'H — ') + 'WE GO INTO THE WORMHOLE, TOGETHER';
  btn2.style.borderColor = '#9fe8ff';
  btn2.style.color = '#e6fbff';
  btn2.style.background = 'rgba(6,24,40,0.82)';
  btn2.style.boxShadow = '0 0 24px rgba(120,220,255,0.45)';
  document.body.appendChild(btn2);
  btn2.addEventListener('click', (e) => {
    e.stopPropagation();
    together();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH' && btn2.style.display !== 'none') together();
  });

  function together() {
    if (rally !== 'offer') return false;
    rally = 'go';
    rallyT = rallyLast = 0;
    btn2.style.display = 'none';
    uiSound('engage');
    uiSound('cheer');
    showNavToast('WE GO INTO THE WORMHOLE. TOGETHER.', 7);
    wormBody = ctx.openWormhole();
    const F = ctx.fleets();
    if (F) {
      F.cheer(0.6);
      F.follow(ship, wormBody.pos, wormBody.radius);
    }
    // the autopilot takes the fleet to the mouth, then the helm is the pilot's
    startAutoWarp(wormBody, () => showNavToast('THE WORMHOLE. THROTTLE UP AND TAKE US IN.', 12));
    return true;
  }

  // every world still in space: the planets, and the coin (ctx.extra)
  // (`away`: a later chapter's world, not in space here at all; src/voyage.js)
  const worlds = () => planets.concat(ctx.extra || []).filter((w) => w && !w.removed && w.away === undefined);
  const drop = (w) => {
    if (w.surface) removePlanet(w, true);
    else {
      w.removed = true;
      w.group.visible = false;
    }
    setNavHidden(w.group.position, true);
  };

  const factions = ['rustia', 'saturnia', 'wavemall prime'];
  const allOpen = () => factions.every((f) => ctx.comms[f]);
  const missing = () => {
    const F = ctx.fleets();
    return F ? factions.filter((f) => F.alive(f).length === 0) : factions;
  };
  function ready() {
    if (v >= 0 || done || !allOpen() || !ctx.worldshipAlive() || missing().length) return false;
    return ship.position.distanceTo(terra.group.position) < terra.radius + CALL_RANGE;
  }

  function call() {
    if (!ready()) return false;
    v = 0;
    lastV = 0;
    btn.style.display = 'none';
    uiSound('engage');
    showNavToast('ALL THREE FLEETS ANSWER. THEY ARE COMING.', 8);
    ctx.save(); // a reload from here on finds it finished
    return true;
  }

  function placeStar() {
    star.position.set(starAbs[0] - originOffset.x, starAbs[1] - originOffset.y, starAbs[2] - originOffset.z);
    star.visible = !far;
  }

  // The system as the ending leaves it. Idempotent: load, world reset.
  function applyEnd() {
    done = true;
    v = -1;
    btn.style.display = 'none';
    beams.visible = false;
    for (const p of worlds()) drop(p);
    // the black hole sits where the sun was; the sun is gone
    blackhole.group.position.copy(sun.group.position);
    sun.group.visible = false;
    sun.gone = true;
    if (sun.body) sun.body.mass = 0;
    setNavHidden(sun.group.position, true);
    placeStar();
    core.scale.setScalar(STAR_R);
    // (and its floor goes with it: an 8,000 u ball of drag nobody can see is
    // not a thing to leave in space)
    if (sun.body) sun.body.radius = 0;
    if (!far) {
      addNavBody({
        id: 'newstar', label: 'THE NEW STAR', pos: star.position, dot: 9,
        radius: STAR_R, logDist: STAR_R * 5, color: '#fff0c0', star: true, kind: 'star',
      });
    }
    const F = ctx.fleets();
    if (F) F.muster(star.position, STAR_R * 3 + 2500, 1, true);
  }

  // The far side (src/tenretni.js enterFar / hideOldSystem). Idempotent.
  function setFar() {
    far = true;
    rally = null;
    star.visible = false;
    setNavHidden(star.position, true);
    btn.style.display = 'none';
    btn2.style.display = 'none';
  }

  function pose(u) {
    const F = ctx.fleets();
    // the fleets come in
    if (F && u < T_KILL) F.muster(terra.group.position, terra.radius * 2.2 + 2200, ease(seg(u, 2, T_JUMP)), false);
    // the volley
    const firing = u >= T_FIRE && u < T_KILL + 1.5;
    beams.visible = firing;
    if (firing && F) {
      const list = F.alive();
      const w = 14 + 26 * seg(u, T_FIRE, T_KILL) + 6 * Math.sin(u * 70);
      for (let i = 0; i < 12; i++) {
        const s = list[i];
        if (!s) {
          _m.makeScale(0, 0, 0);
        } else {
          _a.copy(s.cls.gun).applyQuaternion(s.group.quaternion).add(s.group.position);
          _b.subVectors(terra.group.position, _a);
          const len = _b.length();
          _q.setFromUnitVectors(Z, _b.divideScalar(len));
          _m.compose(_a, _q, _s.set(w, w, len));
        }
        beams.setMatrixAt(i, _m);
      }
      beams.instanceMatrix.needsUpdate = true;
    }
    // the star
    if (u >= T_KILL) {
      if (!starAbs) {
        starAbs = [
          originOffset.x + terra.group.position.x,
          originOffset.y + terra.group.position.y,
          originOffset.z + terra.group.position.z,
        ];
        ctx.killWorldship();
        if (F) F.muster(star.position, STAR_R * 3 + 2500, 1, true);
        // everything still out there starts its fall
        let i = 0;
        for (const p of worlds()) {
          falls.push({ p, from: new THREE.Vector3().subVectors(p.group.position, sun.group.position), t0: T_FALL + i * 5 });
          i++;
        }
        bhFrom.subVectors(blackhole.group.position, sun.group.position);
      }
      placeStar();
      core.scale.setScalar(STAR_R * (0.2 + 0.8 * ease(seg(u, T_KILL, T_KILL + 8))));
    }
    // the planets fall into the old sun
    for (const f of falls) {
      if (f.p.removed) continue;
      const k = seg(u, f.t0, f.t0 + 12);
      f.p.group.position.copy(sun.group.position).addScaledVector(f.from, 1 - k * k);
      if (k >= 1) {
        ctx.explode(f.p.group.position, 9000);
        drop(f.p);
        fx.flash = Math.max(fx.flash, 0.35);
      }
    }
    // the black hole takes the sun
    if (u >= T_BH) {
      const k = ease(seg(u, T_BH, T_END - 3));
      blackhole.group.position.copy(sun.group.position).addScaledVector(bhFrom, 1 - k);
      sun.group.scale.setScalar(Math.max(1 - ease(seg(u, T_END - 6, T_END)), 0.001));
    }
  }

  function beats(u0, u1) {
    const hit = (t) => u0 < t && u1 >= t;
    if (hit(T_JUMP)) fx.kick = 0.6;
    if (hit(T_FIRE)) {
      fx.kick = 1;
      uiSound('impact');
    }
    if (hit(T_KILL)) {
      fx.kick = 1;
      fx.flash = 1;
      uiSound('impact');
      showNavToast('IT IS GONE. SOMETHING IS BURNING WHERE IT WAS.', 9);
    }
    if (hit(T_FALL)) showNavToast('THE WORLDS ARE FALLING INTO THE SUN.', 8);
    if (hit(T_BH)) showNavToast('THE BLACK HOLE IS MOVING.', 8);
  }

  return {
    active: () => v >= 0,
    done: () => done,
    starAbs: () => starAbs,
    call,
    ready,
    // Rebuild the finished state (load / world reset). `abs`: the star's place.
    restore(abs) {
      if (abs) starAbs = abs;
      if (starAbs) {
        applyEnd();
        // a save from after the star: the fleets have had their cheer and are
        // waiting on the pilot. (A rally already under way is left alone.)
        if (!rally && !far) rally = 'offer';
      }
    },
    together,
    setFar,
    far: () => far,
    // The pilot has led the fleet to the wormhole and is in its mouth.
    through: (pos) => !far && rally === 'go' && !!wormBody && pos.distanceTo(wormBody.pos) < wormBody.radius * 0.4,
    update(dt, t, flying) {
      if (far) return; // the far side lights the ship and owns the fleet
      if (done) {
        // light the ship from the new star
        if (sun.light) sun.light.position.copy(star.position).sub(ship.position).normalize();
        burst.material.rotation = t * 0.02;
        const F = ctx.fleets();
        if (rally === 'cheer' && flying) {
          rallyT += dt;
          for (const [at, text, roar] of RALLY) {
            if (rallyLast < at && rallyT >= at) {
              showNavToast(text, 6);
              if (roar) uiSound('cheer');
            }
          }
          if (F) F.cheer(clamp01(seg(rallyT, 6, 9)) * (1 - 0.5 * seg(rallyT, RALLY_END - 6, RALLY_END)));
          rallyLast = rallyT;
          if (rallyT >= RALLY_END) rally = 'offer';
        }
        btn2.style.display = rally === 'offer' && flying && F && F.alive(null, 'warship').length ? 'block' : 'none';
        return;
      }
      if (v < 0) {
        const show = flying && ready();
        btn.style.display = show ? 'block' : 'none';
        return;
      }
      v = Math.min(v + dt, T_END);
      pose(v);
      beats(lastV, v);
      ctx.setRumble(clamp01(0.3 * seg(v, 0, T_JUMP) + 0.6 * seg(v, T_FIRE - 6, T_KILL) * (1 - seg(v, T_KILL, T_KILL + 6)) + 0.3 * seg(v, T_BH, T_END)));
      lastV = v;
      if (v >= T_END) {
        ctx.setRumble(0);
        applyEnd();
        ctx.save();
        rally = 'cheer';
        rallyT = rallyLast = 0;
      }
    },
    seek(u) {
      if (v >= 0) v = lastV = u;
    },
    state: () => ({ v, done, far, ready: ready(), missing: missing(), star: starAbs, rally, rallyT, worm: wormBody ? wormBody.pos.toArray() : null }),
    // skip the rally's lines (verification)
    skipRally() {
      if (rally === 'cheer') rallyT = RALLY_END - 0.01;
    },
  };
}
