// The far side of the wormhole: the Tenretni megaworld (GDD 5.7.3).
//
// The ending's last act takes the pilot and what is left of three fleets into
// the wormhole (src/endgame.js). This is where they come out: over a machine
// world so large its surface is flat to the horizon, with captive stars held
// above it in cages. The wormhole closes behind them. There is no way back and
// nothing here resets: src/tenretni.js keeps `end: 'far'` in the save and lays
// this out again on every load and world reset (apply, below).
//
// The world is a plane in the game's absolute frame (originOffset + local,
// src/origin.js). The arrival point is absolute (0, 0, 0), where every world
// reset puts the ship; the surface is absolute y = -FAR_ARRIVE_ALT. Everything
// drawn is placed each frame from where the camera is, so a floating-origin
// rebase and a world reset need no handling of their own:
//
//   lattice space   absolute xz + SHIFT, the space the cage lattice and the
//                   ground patterns are defined in. Kept in doubles here; the
//                   shaders are only ever handed it wrapped to a pattern's
//                   period (see megaGround.frag).
//   SHIFT           chosen once so the first caged star stands ahead and to
//                   port of the arrival point.
//
// Physics is the game's own. The megaworld is one gravity body: a sphere of
// radius FAR_RADIUS whose centre is kept straight under the ship, so "up" is
// always +y, the pull does not fall off with height, and the altitude floor
// (src/gravity.js) holds the ship off the roofs by drag, as it does over any
// planet. Each caged star in view has a floor of its own and no pull.
//
// Built by createFarside() as the wormhole opens, a system away, and shown by
// apply(): nothing here may be visible or weigh anything until apply() says so.

import * as THREE from 'three';
import { C } from './constants.js';
import { ship } from './ship.js';
import { sun } from './sun.js';
import { Q } from './quality.js';
import { originOffset, addShiftable } from './origin.js';
import { addBody } from './gravity.js';
import { setFarFieldExtra } from './isolate.js';
import { addNavBody, setNavHidden, showNavToast } from './nav.js';
import { buildMegaworld, cageAt, CAGE_PERIOD, PATTERN_PERIOD } from '../world/megaworld.js';
import commonVert from './shaders/tenretni.vert?raw';
import wormFrag from './shaders/wormhole.frag?raw';

const RESLOT = 0.25; // seconds between looks at which cages are nearest
// What the fleets say on the way out, by second after the white clears.
const ARRIVAL = [
  [3, 'WE ARE THROUGH. EVERY SHIP THAT WENT IN CAME OUT.'],
  [11, 'THERE IS NO PLANET UNDER US. IT DOES NOT CURVE. IT IS ALL MACHINE.'],
  [20, 'THE WORMHOLE HAS CLOSED BEHIND US.'],
  [29, 'THOSE ARE STARS. IT KEEPS THEM IN CAGES.'],
];

const wrap = (v, p) => ((v % p) + p) % p;

// ctx: { scene, camera, sunWorld — tenretni's live unit vector toward the
//        light, shared by its hull materials and the fleets' decks }
export function createFarside(ctx) {
  const { scene, camera, sunWorld } = ctx;
  const S = C.FAR_CAGE_SPACING;
  const K = C.FAR_CAGE_FULL;
  const REACH = C.FAR_CAGE_REACH;

  const mega = buildMegaworld(sunWorld);
  scene.add(mega.root);

  // SHIFT: the first present cell out from the lattice's middle holds the
  // star the pilot arrives beside.
  const _c = { x: 0, z: 0 };
  let sx = 0, sz = 0;
  for (let i = 20; i < CAGE_PERIOD; i++) {
    if (cageAt(i, i, _c)) {
      sx = _c.x + C.FAR_ARRIVE_DX;
      sz = _c.z + C.FAR_ARRIVE_DZ;
      break;
    }
  }

  // --- physics ---
  const body = addBody({
    position: new THREE.Vector3(0, -C.FAR_RADIUS, 0),
    mass: 0,
    radius: 0,
    noHeat: true,
    ceiling: C.FAR_CEIL,
    ceilSoft: C.FAR_CEIL_SOFT,
    groundAt: () => C.FAR_CANOPY,
  });
  addShiftable(body); // a rebase between two updates moves it with the world
  const mass = (C.FAR_SURFACE_G * C.FAR_RADIUS * C.FAR_RADIUS) / C.G;

  // --- the cages in full: slots ---
  // A slot keeps its cage until that cage is no longer one of the nearest, so
  // an autopilot course laid to a slot's star does not swap stars under way.
  const slots = [];
  for (let i = 0; i < K; i++) {
    const slot = {
      on: false, ix: 0, iz: 0, lx: 0, lz: 0, keep: false,
      star: new THREE.Vector3(), // the star's centre, local: nav and physics read it live
      cage: mega.cage.cages[i],
      body: null,
      nav: null,
    };
    slot.body = addBody({ position: slot.star, mass: 0, radius: 0, noHeat: true });
    addShiftable(slot.body);
    slot.nav = {
      id: `cagedstar${i}`, label: 'CAGED STAR', pos: slot.star, dot: 8,
      radius: C.FAR_CAGE_RING_R, logDist: C.FAR_CAGE_RING_R * 3.2, color: '#ffc27a', star: true, kind: 'star',
    };
    slots.push(slot);
  }
  // scratch for the look-round: the nearest K present cages inside the range
  const near = [];
  for (let i = 0; i < K; i++) near.push({ ix: 0, iz: 0, lx: 0, lz: 0, d2: Infinity });

  // --- the wormhole, closing (this session's arrival only) ---
  const wormU = { uTime: { value: 0 }, uPower: { value: 0 }, uHdr: { value: C.TENRETNI_HDR } };
  const worm = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: commonVert,
      fragmentShader: wormFrag,
      uniforms: wormU,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  worm.frustumCulled = false;
  worm.visible = false;
  mega.root.add(worm);
  const WORM_R = C.TENRETNI_WORM_RADIUS * C.TENRETNI_WORM_REST;

  let active = false;
  let registered = false;
  let fade = 0;
  let closeT = -1; // seconds since the arrival, -1 when the mouth is long shut
  let sayT = -1, sayLast = 0;
  let slotT = 0;
  let cellX = NaN, cellZ = NaN;
  let pointCount = 0;
  let alt = C.FAR_ARRIVE_ALT;
  const light = new THREE.Vector3(-0.35, 0.25, -0.9).normalize();
  const _d = new THREE.Vector3();

  // The plane, in the frame the ship flies in right now.
  const groundY = () => -C.FAR_ARRIVE_ALT - originOffset.y;
  // The fleets' floor (src/fleets.js follow): read live, so a pose taken
  // straight after a rebase is clamped against where the roofs are now.
  const floor = {
    get y() {
      return groundY() + C.FAR_CANOPY;
    },
  };

  function placeBody() {
    body.position.set(ship.position.x, groundY() - C.FAR_RADIUS, ship.position.z);
  }

  // Which cages are nearest: K in full, the rest as points. `lx, lz`: the
  // camera in lattice space.
  function reslot(lx, lz) {
    const cx = Math.floor(lx / S), cz = Math.floor(lz / S);
    cellX = cx;
    cellZ = cz;
    for (let i = 0; i < K; i++) near[i].d2 = Infinity;
    const lod2 = C.FAR_CAGE_LOD * C.FAR_CAGE_LOD;
    // pass one: the nearest K inside the full-detail range
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!cageAt(cx + dx, cz + dz, _c)) continue;
        const d2 = (_c.x - lx) * (_c.x - lx) + (_c.z - lz) * (_c.z - lz);
        if (d2 > lod2) continue;
        // insertion into the short sorted list
        let at = K;
        while (at > 0 && near[at - 1].d2 > d2) at--;
        if (at >= K) continue;
        const last = near[K - 1];
        for (let j = K - 1; j > at; j--) near[j] = near[j - 1];
        near[at] = last;
        last.ix = cx + dx;
        last.iz = cz + dz;
        last.lx = _c.x;
        last.lz = _c.z;
        last.d2 = d2;
      }
    }
    // slots: keep what is still wanted, free the rest, fill from the list
    for (const s of slots) s.keep = false;
    for (let i = 0; i < K; i++) {
      const n = near[i];
      if (n.d2 === Infinity) continue;
      n.taken = false;
      for (const s of slots) {
        if (s.on && s.ix === n.ix && s.iz === n.iz) {
          s.keep = true;
          n.taken = true;
        }
      }
    }
    for (const s of slots) {
      if (s.on && !s.keep) {
        s.on = false;
        s.cage.group.visible = false;
        s.body.radius = 0;
        setNavHidden(s.star, true);
      }
    }
    for (let i = 0; i < K; i++) {
      const n = near[i];
      if (n.d2 === Infinity || n.taken) continue;
      const s = slots.find((x) => !x.on);
      if (!s) break;
      s.on = true;
      s.ix = n.ix;
      s.iz = n.iz;
      s.lx = n.lx;
      s.lz = n.lz;
      s.cage.group.visible = true;
      s.body.radius = C.FAR_CAGE_STAR_R * 1.12;
      addNavBody(s.nav);
      setNavHidden(s.star, false);
    }
    // pass two: every other cage in reach, as a point. Positions are held
    // from the camera's own cell corner, so fp32 has tens of km to carry and
    // not the whole world.
    const arr = mega.stars.attr.array;
    let n = 0;
    for (let dz = -REACH; dz <= REACH && n < C.FAR_CAGE_POINTS; dz++) {
      for (let dx = -REACH; dx <= REACH && n < C.FAR_CAGE_POINTS; dx++) {
        if (!cageAt(cx + dx, cz + dz, _c)) continue;
        let full = false;
        for (const s of slots) if (s.on && s.ix === cx + dx && s.iz === cz + dz) full = true;
        if (full) continue;
        arr[n * 3] = _c.x - cx * S;
        arr[n * 3 + 1] = 0;
        arr[n * 3 + 2] = _c.z - cz * S;
        n++;
      }
    }
    pointCount = n;
    mega.stars.attr.needsUpdate = true;
    mega.stars.points.geometry.setDrawRange(0, n);
  }

  // Place everything from where the camera is. Runs after the frame's origin
  // rebase and camera update, so what it writes is what is drawn.
  function place(t) {
    const gy = groundY();
    const cam = camera.position;
    const lx = originOffset.x + cam.x + sx;
    const lz = originOffset.z + cam.z + sz;
    alt = Math.max(cam.y - gy, 1);

    // ground and towers ride under the camera
    const g = mega.ground;
    g.mesh.position.set(cam.x, gy, cam.z);
    const gu = g.uniforms;
    gu.uOffPlate.value.set(wrap(lx, C.FAR_PLATE * PATTERN_PERIOD), wrap(lz, C.FAR_PLATE * PATTERN_PERIOD));
    gu.uOffBlock.value.set(wrap(lx, C.FAR_BLOCK * PATTERN_PERIOD), wrap(lz, C.FAR_BLOCK * PATTERN_PERIOD));
    gu.uOffDistrict.value.set(wrap(lx, C.FAR_DISTRICT * PATTERN_PERIOD), wrap(lz, C.FAR_DISTRICT * PATTERN_PERIOD));
    gu.uOffCage.value.set(wrap(lx, S * CAGE_PERIOD), wrap(lz, S * CAGE_PERIOD));
    gu.uHorizon.value = Math.sqrt(2 * C.FAR_RADIUS * alt);
    gu.uTime.value = t;
    gu.uFade.value = fade;
    const tw = mega.towers;
    tw.mesh.position.set(cam.x, gy, cam.z);
    tw.uniforms.uTileOff.value.set(wrap(lx, C.FAR_TILE), wrap(lz, C.FAR_TILE));
    tw.uniforms.uOffCage.value.copy(gu.uOffCage.value);
    tw.uniforms.uTime.value = t;
    tw.uniforms.uFade.value = fade;

    // the cages
    if (Math.floor(lx / S) !== cellX || Math.floor(lz / S) !== cellZ || slotT >= RESLOT) {
      slotT = 0;
      reslot(lx, lz);
    }
    let wsum = 0;
    _d.set(0, 0, 0);
    for (const s of slots) {
      if (!s.on) continue;
      const rx = s.lx - lx, rz = s.lz - lz;
      // on the same curve the ground is drawn with
      const y = gy - (rx * rx + rz * rz) / (2 * C.FAR_RADIUS);
      s.cage.group.position.set(cam.x + rx, y, cam.z + rz);
      s.star.set(cam.x + rx, y + C.FAR_CAGE_HEIGHT, cam.z + rz);
      // the ship is lit by the stars it is near, the nearest most
      const dx = s.star.x - ship.position.x, dy = s.star.y - ship.position.y, dz = s.star.z - ship.position.z;
      const w = 1 / Math.max(dx * dx + dy * dy + dz * dz, 1e6);
      _d.x += dx * w;
      _d.y += dy * w;
      _d.z += dz * w;
      wsum += w;
    }
    if (wsum > 0 && _d.lengthSq() > 0) light.copy(_d).normalize();
    sunWorld.copy(light);
    if (sun.light) sun.light.position.copy(light);
    mega.cage.starU.uTime.value = t;
    mega.cage.starU.uFade.value = fade;
    mega.cage.frameU.uTime.value = t;

    // the stars beyond
    const st = mega.stars;
    st.points.position.set(cam.x + (cellX * S - lx), gy, cam.z + (cellZ * S - lz));
    st.uniforms.uScale.value = (window.innerHeight * Q.pixelRatio * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
    st.uniforms.uCamAlt.value = alt;
    st.uniforms.uFade.value = fade;

    // the mouth they came out of, closing
    if (worm.visible) {
      worm.position.set(-originOffset.x, -originOffset.y, C.FAR_WORM_BACK - originOffset.z);
      worm.lookAt(cam);
      wormU.uTime.value = t;
    }
  }

  return {
    floor,
    // The far side as it stands: this session's arrival (`first`), a load, a
    // world reset. Idempotent.
    apply(first) {
      if (!registered) {
        registered = true;
        setFarFieldExtra(mega.root); // on foot in a holodeck program, it is not out there
      }
      active = true;
      mega.root.visible = true;
      body.mass = mass;
      body.radius = C.FAR_RADIUS;
      placeBody();
      cellX = NaN; // look round again from wherever the reset put the ship
      if (first) {
        // arrived under the white: nothing fades up, the mouth is still open
        fade = 1;
        closeT = 0;
        sayT = 0;
        sayLast = 0;
        worm.visible = true;
      }
      place(performance.now() / 1000);
    },
    update(dt, t, flying) {
      if (!active) return;
      fade = Math.min(fade + dt / C.FAR_FADE_IN, 1);
      slotT += dt;
      placeBody();
      if (closeT >= 0) {
        closeT += dt;
        const k = Math.min(closeT / C.FAR_WORM_CLOSE, 1);
        // it holds for a breath, then draws shut
        const open = 1 - k * k * (3 - 2 * k);
        worm.scale.setScalar(Math.max(WORM_R * open, 0.001));
        wormU.uPower.value = 1.25 * Math.min(open * 3, 1);
        if (k >= 1) {
          closeT = -1;
          worm.visible = false;
        }
      }
      if (sayT >= 0 && flying) {
        sayT += dt;
        for (const [at, text] of ARRIVAL) if (sayLast < at && sayT >= at) showNavToast(text, 7);
        sayLast = sayT;
        if (sayT > ARRIVAL[ARRIVAL.length - 1][0]) sayT = -1;
      }
      place(t);
    },
    state: () => ({
      active,
      fade,
      altitude: alt,
      groundY: groundY(),
      cell: [cellX, cellZ],
      shift: [sx, sz],
      cages: slots.filter((s) => s.on).map((s) => ({
        cell: [s.ix, s.iz],
        // absolute, so it can be compared across a rebase
        abs: [s.star.x + originOffset.x, s.star.y + originOffset.y, s.star.z + originOffset.z].map(Math.round),
        dist: Math.round(s.star.distanceTo(ship.position)),
      })),
      points: pointCount,
      towers: mega.towers.count(),
      wormhole: worm.visible,
      light: light.toArray(),
      bodyRadius: body.radius,
    }),
  };
}
