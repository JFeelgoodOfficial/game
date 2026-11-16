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
// What is left — the new star, the wormhole, the ships that survived — is the
// system from then on. The star's place is kept in absolute coordinates, so
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

const T_JUMP = 20, T_FIRE = 30, T_KILL = 34, T_FALL = 38, T_BH = 62, T_END = 74;
const CALL_RANGE = 9000; // how close to the worldship's surface the pilot must be
const STAR_R = 1500;

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const seg = (u, a, b) => clamp01((u - a) / (b - a));
const ease = (x) => x * x * (3 - 2 * x);

// ctx: { scene, camera, terra, fx, setRumble(r), fleets() -> fleets | null,
//        explode(pos, scale), comms: {faction: true}, worldshipAlive() -> bool,
//        extra — worlds that are not planets (the coin),
//        killWorldship() — take the worldship out of space,
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

  // every world still in space: the planets, and the coin (ctx.extra)
  const worlds = () => planets.concat(ctx.extra || []).filter((w) => w && !w.removed);
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
    star.visible = true;
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
    addNavBody({
      id: 'newstar', label: 'THE NEW STAR', pos: star.position, dot: 9,
      radius: STAR_R, logDist: STAR_R * 5, color: '#fff0c0', star: true, kind: 'star',
    });
    const F = ctx.fleets();
    if (F) F.muster(star.position, STAR_R * 3 + 2500, 1, true);
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
      if (starAbs) applyEnd();
    },
    update(dt, t, flying) {
      if (done) {
        // light the ship from the new star
        if (sun.light) sun.light.position.copy(star.position).sub(ship.position).normalize();
        burst.material.rotation = t * 0.02;
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
        showNavToast('A NEW STAR, A WORMHOLE, AND WHOEVER IS LEFT.', 12);
      }
    },
    seek(u) {
      if (v >= 0) v = lastV = u;
    },
    state: () => ({ v, done, ready: ready(), missing: missing(), star: starAbs }),
  };
}
