// What can be taken from the light ship's rooms, each drawn as the thing it is.
//
// A fragment used to be shown as a planet with one of its five layers filled
// in (world/layerplanet.js): "A DRAGON" was a ball of orange specks and "AN
// ESCALATOR" a ball of lines, and nobody could tell what they were choosing.
// Here every fragment is a small hologram of the thing itself, moving: riders
// coming down a slope, a dragon flying a circle, steps going up.
//
//   buildHoloProp(worldId, layer, frag, layers, o) -> { group, tick(t), glow(k) }
//
// A prop fills about a unit of radius and stands on y = 0. Each is built
// twice: once at the size of the place, out in the world the room projects
// round the pilot (the aurora in its sky, the riders on a slope beyond the
// pedestals, the dragon over the far city), and once small, on the pedestal
// it is taken from. Both are this. `frag` is the fragment's entry in WORLDS (world/chapter-dialogue.js),
// `layers` the whole world's, for a second colour.

import * as THREE from 'three';

// One prop's own two materials: a translucent fill and a bright line. Not
// additive: each room closes a bright sky round the pilot, and light added to
// a bright sky is no picture at all.
function kit(color, second, o) {
  const world = !!o.world, S = o.scale || 1;
  const c = new THREE.Color(color), c2 = new THREE.Color(second ?? color);
  const fills = [], lines = [];
  const fill = (col = c, op = 0.5) => {
    // Out in the room's world a thing is the thing: solid, lit by the room's
    // sun, standing in the landscape. What is light itself (the layer called
    // light, and anything in a sky) is drawn as light. Only the one on the
    // pedestal is a hologram.
    let m;
    if (world && !o.lightlike) m = new THREE.MeshLambertMaterial({ color: col, emissive: col.clone().multiplyScalar(0.3), flatShading: true, fog: false, side: THREE.DoubleSide });
    else if (world) m = new THREE.MeshBasicMaterial({ color: col.clone().lerp(WHITE, 0.25), transparent: true, opacity: o.sky ? 0.8 : 0.95, depthWrite: !o.sky, fog: false, side: THREE.DoubleSide });
    else m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, fog: false, side: THREE.DoubleSide });
    if (world) op = m.opacity;
    m.userData.op = op;
    fills.push(m);
    return m;
  };
  const line = (col = c) => {
    // a pale thing is outlined dark and a deep-coloured one light: either way
    // its edge stands off whatever sky the room has put behind it
    const lum = col.r * 0.3 + col.g * 0.59 + col.b * 0.11;
    const edge = lum > 0.62 ? col.clone().multiplyScalar(0.28).lerp(INK, 0.5) : col.clone().lerp(WHITE, 0.55);
    const m = new THREE.LineBasicMaterial({ color: edge, transparent: true, opacity: 1, depthWrite: false, fog: false });
    lines.push(m);
    return m;
  };
  const mA = fill(c), mB = fill(c2), lA = line(c), lB = line(c2);
  const group = new THREE.Group();
  const anim = [];
  // a solid with its edges drawn: the edges are what make it read at a distance
  const add = (geo, x = 0, y = 0, z = 0, b = false, parent = group) => {
    const mesh = new THREE.Mesh(geo, b ? mB : mA);
    mesh.position.set(x, y, z);
    if (!world) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 24), b ? lB : lA)); // (a hologram's edges; a real thing has none)
    parent.add(mesh);
    return mesh;
  };
  const box = (w, h, d, x, y, z, b, p) => add(new THREE.BoxGeometry(w, h, d), x, y, z, b, p);
  const cyl = (rt, rb, h, x, y, z, b, p, seg = 12) => add(new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, b, p);
  const ball = (r, x, y, z, b, p) => add(new THREE.SphereGeometry(r, world ? 18 : 10, world ? 12 : 7), x, y, z, b, p);
  const cone = (r, h, x, y, z, b, p, seg = 8) => add(new THREE.ConeGeometry(r, h, seg), x, y, z, b, p);
  const torus = (R, r, x, y, z, b, p) => add(new THREE.TorusGeometry(R, r, 6, 28), x, y, z, b, p);
  const sub = (x = 0, y = 0, z = 0, parent = group) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  // a person, about `h` tall, feet at the group's origin
  const figure = (h, parent, b = false) => {
    const g = sub(0, 0, 0, parent);
    cyl(h * 0.13, h * 0.2, h * 0.62, 0, h * 0.31, 0, b, g, 6);
    ball(h * 0.15, 0, h * 0.8, 0, b, g);
    return g;
  };
  // loose points: snow, stars, notes
  const dots = (n, place, size = 0.05, b = false) => {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p = place(i);
      pos.set(p, i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: (b ? c2 : c).clone().lerp(WHITE, 0.5), size: size * (world ? S * 0.3 : 1), transparent: true, opacity: 0.95, depthWrite: false, fog: false });
    fills.push(m);
    m.userData.op = 0.95;
    const pts = new THREE.Points(g, m);
    group.add(pts);
    return pts;
  };
  // the half dome a sky is shown under
  // (out in the room's world the room's own sky is the dome, and its floor the ground: neither is drawn)
  const dome = (b = false) => (world ? sub() : add(new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0, 0, b));
  // the ground a thing stands on
  const pad = (r = 1, b = true) => (world ? sub() : cyl(r, r, 0.04, 0, 0.02, 0, b, group, 24));
  // light that is a glow and not a body (an aurora, a haze): see-through and added to what is behind it
  const soft = (op = 0.5) => {
    for (const m of [mA, mB]) {
      m.transparent = true;
      m.opacity = m.userData.op = op;
      m.blending = THREE.AdditiveBlending;
      m.depthWrite = false;
    }
  };
  return { group, anim, add, box, cyl, ball, cone, torus, sub, figure, dots, dome, pad, soft, world, fills, lines, c, c2 };
}

const WHITE = new THREE.Color(0xffffff), INK = new THREE.Color(0x0b1c33);
const rnd = (i, k = 1) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// --- the thirty: world id, then layer ---------------------------------------------
const PROPS = {
  wyattmattoe: {
    // a grey-white sky with snow coming out of it
    sky(k) {
      k.dome();
      for (let i = 0; i < 3; i++) {
        const cl = k.ball(0.26, -0.5 + i * 0.5, 0.62 + (i % 2) * 0.12, -0.1 + i * 0.1, true);
        cl.scale.set(1.5, 0.45, 0.9);
        k.anim.push((t) => (cl.position.x = ((-0.5 + i * 0.5 + t * 0.05 + 1.2) % 1.6) - 0.8));
      }
      const snow = k.dots(60, (i) => [rnd(i) * 1.5 - 0.75, rnd(i, 2) * 0.9, rnd(i, 3) * 1.5 - 0.75], 0.045, true);
      k.anim.push((t) => (snow.position.y = -((t * 0.18) % 0.3)));
    },
    // a mountain with one long white run down it
    ground(k) {
      k.pad();
      k.cone(0.8, 1.25, -0.15, 0.62, -0.1, false, k.group, 5);
      k.cone(0.5, 0.8, 0.5, 0.4, 0.3, false, k.group, 5);
      const run = k.box(0.3, 0.03, 1.3, 0.12, 0.55, 0.42, true);
      run.rotation.x = 0.82;
    },
    // pylons, a cable, and chairs going up it
    structures(k) {
      k.pad();
      const a = new THREE.Vector3(-0.8, 0.3, 0), b = new THREE.Vector3(0.8, 1.25, 0);
      for (const u of [0, 0.5, 1]) {
        const p = a.clone().lerp(b, u);
        k.cyl(0.035, 0.05, p.y, p.x, p.y / 2, 0, false);
        k.box(0.3, 0.04, 0.04, p.x, p.y, 0, false);
      }
      const cable = k.cyl(0.012, 0.012, a.distanceTo(b), 0, 0.775, 0, true, k.group, 4);
      cable.rotation.z = -Math.atan2(b.x - a.x, b.y - a.y);
      for (let i = 0; i < 4; i++) {
        const ch = k.sub();
        k.box(0.02, 0.2, 0.02, 0, -0.1, 0, true, ch);
        k.box(0.18, 0.03, 0.12, 0, -0.2, 0, true, ch);
        k.anim.push((t) => ch.position.lerpVectors(a, b, (t * 0.12 + i / 4) % 1));
      }
    },
    // three riders carving down a slope
    life(k) {
      const slope = k.box(1.7, 0.03, 1.7, 0, 0.5, 0, true);
      slope.rotation.x = 0.5;
      for (let i = 0; i < 3; i++) {
        const r = k.sub();
        const f = k.figure(0.34, r);
        k.box(0.09, 0.02, 0.36, 0, 0, 0, false, r);
        k.anim.push((t) => {
          const u = (t * 0.22 + i / 3) % 1;
          const x = Math.sin(u * 9 + i * 2) * 0.5, z = -0.75 + u * 1.5;
          r.position.set(x, 0.5 - z * Math.tan(0.5) * 0.92 + 0.03, z);
          r.rotation.y = Math.cos(u * 9 + i * 2) * 0.7;
          f.rotation.z = -Math.cos(u * 9 + i * 2) * 0.35;
        });
      }
    },
    // curtains of light over a dark horizon
    light(k) {
      k.pad(1, true);
      if (k.world) k.soft(0.55);
      for (let i = 0; i < 5; i++) {
        const geo = new THREE.PlaneGeometry(0.34, 1.1, 1, 8);
        const m = k.add(geo, -0.68 + i * 0.34, 0.85, 0);
        const base = geo.attributes.position.array.slice();
        k.anim.push((t) => {
          const p = geo.attributes.position;
          for (let j = 0; j < p.count; j++) p.setZ(j, Math.sin(t * 1.4 + i * 0.9 + base[j * 3 + 1] * 3.2) * 0.14);
          p.needsUpdate = true;
          m.scale.y = 0.85 + 0.15 * Math.sin(t * 0.8 + i);
        });
      }
    },
  },
  shadowreach: {
    // a sky with the sun just gone and the first stars
    sky(k) {
      k.dome();
      const sun = k.add(new THREE.CircleGeometry(0.3, 20, 0, Math.PI), 0, 0.03, -0.9, true);
      k.anim.push((t) => sun.scale.setScalar(1 + 0.05 * Math.sin(t * 1.2)));
      k.dots(40, (i) => {
        const a = rnd(i) * 6.28, e = 0.3 + rnd(i, 2) * 1.1;
        return [Math.cos(a) * Math.cos(e) * 0.96, Math.sin(e) * 0.96, Math.sin(a) * Math.cos(e) * 0.96];
      }, 0.05, true);
    },
    // a floor of black glass, cracked into slabs
    ground(k) {
      k.pad(1, false);
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9, r = 0.25 + rnd(i) * 0.55;
        const s = k.box(0.42, 0.03 + rnd(i, 2) * 0.05, 0.3, Math.cos(a) * r, 0.1 + rnd(i, 3) * 0.12, Math.sin(a) * r, i % 2 === 0);
        s.rotation.set(rnd(i, 4) * 0.5 - 0.25, a, rnd(i, 5) * 0.5 - 0.25);
        k.anim.push((t) => (s.position.y = 0.1 + rnd(i, 3) * 0.12 + 0.03 * Math.sin(t * 0.9 + i)));
      }
    },
    // one thin tower, far too tall
    structures(k) {
      k.pad(0.7);
      k.cone(0.2, 1.7, 0, 0.85, 0, false, k.group, 5);
      for (let i = 0; i < 3; i++) {
        const r = k.torus(0.34 - i * 0.08, 0.012, 0, 0.5 + i * 0.4, 0, true);
        r.rotation.x = Math.PI / 2;
        k.anim.push((t) => (r.rotation.z = t * (0.5 + i * 0.3)));
      }
    },
    // someone asleep in the air, breathing
    life(k) {
      k.pad(0.8);
      const s = k.sub(0, 0.6, 0);
      const body = k.cyl(0.13, 0.16, 0.9, 0, 0, 0, false, s, 8);
      body.rotation.z = Math.PI / 2;
      k.ball(0.17, 0.58, 0.03, 0, false, s);
      const z = k.dots(5, (i) => [0.6 + i * 0.07, 0.25 + i * 0.16, 0], 0.07, true);
      k.anim.push((t) => {
        s.position.y = 0.6 + 0.06 * Math.sin(t * 0.8);
        body.scale.x = 1 + 0.08 * Math.sin(t * 0.8);
        z.position.y = ((t * 0.12) % 0.16) + 0.6;
        s.rotation.y = t * 0.15;
      });
    },
    // a moon, and a second one going round it
    light(k) {
      k.ball(0.5, 0, 0.9, 0);
      const o = k.sub(0, 0.9, 0);
      k.ball(0.17, 0.95, 0, 0, true, o);
      const ring = k.torus(0.95, 0.006, 0, 0.9, 0, true);
      ring.rotation.x = Math.PI / 2;
      k.anim.push((t) => (o.rotation.y = t * 0.6));
    },
  },
  actuality: {
    // a low gold sun and long clouds
    sky(k) {
      k.dome();
      k.ball(0.17, 0.55, 0.38, -0.55, true);
      for (let i = 0; i < 3; i++) {
        const cl = k.box(0.75, 0.035, 0.16, 0, 0.5 + i * 0.14, 0.1 - i * 0.25, true);
        k.anim.push((t) => (cl.position.x = Math.sin(t * 0.12 + i * 2) * 0.25));
      }
    },
    // a lawn mown in stripes
    ground(k) {
      for (let i = 0; i < 8; i++) k.box(0.21, 0.05 + (i % 2) * 0.03, 1.7, -0.74 + i * 0.212, 0.04, 0, i % 2 === 0);
      const mower = k.box(0.16, 0.1, 0.22, 0, 0.14, 0);
      k.anim.push((t) => mower.position.set(-0.74 + (Math.floor(t * 0.25) % 8) * 0.212, 0.14, ((t * 0.25) % 1) * 1.5 - 0.75));
    },
    // walls of hedge, one inside another, with the gaps you get through
    structures(k) {
      k.pad();
      for (let i = 0; i < 3; i++) {
        const s = 0.85 - i * 0.28, gap = i % 2 ? 1 : -1;
        for (let e = 0; e < 4; e++) {
          const a = (e * Math.PI) / 2;
          const open = e === (i + 1) % 4;
          for (const half of open ? [-1, 1] : [0]) {
            const len = open ? s * 0.62 : s * 2;
            const w = k.box(len, 0.3, 0.07, 0, 0, 0, i === 1);
            const off = half * (s - len / 2) * gap;
            w.position.set(Math.cos(a) * s - Math.sin(a) * off, 0.18, Math.sin(a) * s + Math.cos(a) * off);
            w.rotation.y = -a + Math.PI / 2;
          }
        }
      }
    },
    // a dragon, flying a circle
    life(k) {
      const d = k.sub(0, 0.95, 0);
      const segs = [];
      for (let i = 0; i < 7; i++) segs.push(k.ball(0.15 - i * 0.015, 0, 0, 0, i > 4, d));
      k.cone(0.09, 0.26, 0, 0, 0, true, segs[0]).rotation.z = -Math.PI / 2;
      const wings = [-1, 1].map((s) => {
        const w = k.add(new THREE.PlaneGeometry(0.6, 0.34), 0, 0.05, s * 0.3, true, segs[2]);
        w.rotation.x = Math.PI / 2;
        return w;
      });
      k.anim.push((t) => {
        for (let i = 0; i < segs.length; i++) {
          const a = t * 0.9 - i * 0.2;
          segs[i].position.set(Math.cos(a) * 0.72, Math.sin(a * 2 + i * 0.3) * 0.1, Math.sin(a) * 0.72);
          segs[i].rotation.y = -a - Math.PI / 2;
        }
        wings.forEach((w, i) => (w.rotation.x = Math.PI / 2 + (i ? 1 : -1) * Math.sin(t * 6) * 0.7));
      });
    },
    // the sun straight overhead, with its rays
    light(k) {
      const s = k.sub(0, 1.0, 0);
      k.ball(0.36, 0, 0, 0, false, s);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * 6.283;
        const ray = k.box(0.3, 0.035, 0.035, Math.cos(a) * 0.64, Math.sin(a) * 0.64, 0, true, s);
        ray.rotation.z = a;
      }
      k.anim.push((t) => {
        s.rotation.z = t * 0.3;
        s.scale.setScalar(1 + 0.05 * Math.sin(t * 2));
      });
    },
  },
  stevenlacey: {
    // a flat sky in eight bands, and square clouds
    sky(k) {
      for (let i = 0; i < 8; i++) k.box(1.9, 0.15, 0.03, 0, 0.1 + i * 0.16, -0.95, i % 2 === 1);
      for (let i = 0; i < 3; i++) {
        const cl = k.sub(0, 0.75 + i * 0.25, 0.1 * i);
        k.box(0.42, 0.14, 0.1, 0, 0, 0, true, cl);
        k.box(0.2, 0.12, 0.1, -0.04, 0.12, 0, true, cl);
        k.anim.push((t) => (cl.position.x = (((t * 0.1 + i * 0.55) % 1.8) - 0.9)));
      }
    },
    // the heads side of a coin, big enough to stand on
    ground(k) {
      const coin = k.cyl(0.95, 0.95, 0.12, 0, 0.3, 0, false, k.group, 28);
      coin.rotation.x = 0.35;
      const star = k.add(new THREE.CircleGeometry(0.45, 5), 0, 0.08, 0, true, coin);
      star.rotation.x = -Math.PI / 2;
      k.torus(0.8, 0.02, 0, 0.07, 0, true, coin).rotation.x = Math.PI / 2;
      k.anim.push((t) => (coin.rotation.y = t * 0.2));
    },
    // a row of bricks in the air, and the one worth hitting
    structures(k) {
      for (let i = 0; i < 5; i++) {
        if (i === 2) continue;
        const b = k.box(0.3, 0.3, 0.3, -0.64 + i * 0.32, 0.85, 0);
        k.box(0.3, 0.02, 0.31, 0, 0, 0, true, b);
      }
      const q = k.box(0.3, 0.3, 0.3, 0, 0.85, 0, true);
      const j = k.figure(0.34, k.group);
      k.anim.push((t) => {
        const u = (t * 0.7) % 1, hop = Math.sin(u * Math.PI);
        j.position.set(0, hop * 0.38, 0);
        q.position.y = 0.85 + (u > 0.42 && u < 0.6 ? 0.07 : 0);
      });
    },
    // a round thing with two eyes, hopping
    life(k) {
      k.pad(0.8);
      const m = k.sub();
      const body = k.ball(0.36, 0, 0.36, 0, false, m);
      for (const s of [-1, 1]) {
        k.ball(0.09, s * 0.14, 0.14, 0.3, true, body);
        k.cone(0.07, 0.2, s * 0.2, 0.36, 0, true, body);
      }
      k.anim.push((t) => {
        const u = (t * 1.1) % 1, hop = Math.abs(Math.sin(u * Math.PI));
        m.position.set(Math.sin(t * 0.5) * 0.4, hop * 0.4, Math.cos(t * 0.5) * 0.25);
        body.scale.set(1 + (1 - hop) * 0.15, 0.85 + hop * 0.25, 1 + (1 - hop) * 0.15);
        m.rotation.y = Math.sin(t * 0.5) * 0.8;
      });
    },
    // one coin, on its edge, turning
    light(k) {
      const coin = k.cyl(0.5, 0.5, 0.09, 0, 0.95, 0, false, k.group, 24);
      coin.rotation.x = Math.PI / 2;
      const sp = k.sub(0, 0.95, 0);
      const inner = k.cyl(0.3, 0.3, 0.1, 0, 0, 0, true, sp, 4);
      inner.rotation.x = Math.PI / 2;
      k.anim.push((t) => {
        coin.rotation.z = t * 2.2;
        sp.rotation.y = t * 2.2;
        coin.position.y = sp.position.y = 0.95 + 0.06 * Math.sin(t * 1.6);
      });
    },
  },
  saturnia: {
    // banded gold cloud, each band going its own way
    sky(k) {
      k.dome();
      for (let i = 0; i < 4; i++) {
        const r = Math.cos(0.15 + i * 0.3) * 0.94;
        const b = k.torus(r, 0.035, 0, Math.sin(0.15 + i * 0.3) * 0.94, 0, i % 2 === 0);
        b.rotation.x = Math.PI / 2;
        k.anim.push((t) => (b.rotation.z = t * (i % 2 ? 0.25 : -0.18)));
      }
    },
    // the top of the clouds: a floor that is not one
    ground(k) {
      for (let i = 0; i < 12; i++) {
        const a = i * 2.4, r = Math.sqrt(i / 12) * 0.85;
        const p = k.ball(0.26, Math.cos(a) * r, 0.2, Math.sin(a) * r, i % 3 === 0);
        p.scale.y = 0.55;
        k.anim.push((t) => (p.position.y = 0.2 + 0.05 * Math.sin(t * 0.7 + i)));
      }
    },
    // a city standing on a disc, with nothing under the disc
    structures(k) {
      const c = k.sub(0, 0.75, 0);
      k.cyl(0.8, 0.55, 0.1, 0, 0, 0, true, c, 20);
      k.cone(0.3, 0.42, 0, -0.26, 0, true, c, 12).rotation.x = Math.PI;
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9, r = i ? 0.45 : 0, h = i ? 0.3 + rnd(i) * 0.35 : 0.8;
        k.cone(0.07, h, Math.cos(a) * r, 0.05 + h / 2, Math.sin(a) * r, false, c, 6);
      }
      k.anim.push((t) => {
        c.position.y = 0.75 + 0.07 * Math.sin(t * 0.6);
        c.rotation.y = t * 0.1;
      });
    },
    // a choir in a ring, and what it sings going up
    life(k) {
      k.pad(0.9);
      const singers = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * 6.283;
        const f = k.figure(0.42, k.group, i % 2 === 1);
        f.position.set(Math.cos(a) * 0.55, 0.04, Math.sin(a) * 0.55);
        singers.push(f);
      }
      const bell = k.cone(0.16, 0.22, 0, 1.05, 0, true, k.group, 10);
      const notes = k.dots(10, (i) => [Math.cos(i * 2.2) * 0.4, 0.5 + (i / 10) * 0.9, Math.sin(i * 2.2) * 0.4], 0.07, true);
      k.anim.push((t) => {
        singers.forEach((f, i) => (f.rotation.z = Math.sin(t * 1.2 + i) * 0.14));
        bell.rotation.z = Math.sin(t * 2.4) * 0.5;
        notes.position.y = ((t * 0.15) % 0.09);
        notes.rotation.y = t * 0.3;
      });
    },
    // the planet and its rings
    light(k) {
      const p = k.sub(0, 0.95, 0);
      p.rotation.z = 0.42;
      k.ball(0.38, 0, 0, 0, false, p);
      const rings = [0.6, 0.72, 0.86].map((r) => {
        const g = k.torus(r, 0.02, 0, 0, 0, true, p);
        g.rotation.x = Math.PI / 2;
        g.scale.z = 0.3;
        return g;
      });
      k.anim.push((t) => rings.forEach((g, i) => (g.rotation.z = t * (0.4 - i * 0.1))));
    },
  },
  'wavemall prime': {
    // a pink evening and a striped sun going down in it
    sky(k) {
      k.dome();
      for (let i = 0; i < 5; i++) {
        const w = Math.sqrt(1 - (i / 5) ** 2) * 0.72;
        k.box(w, 0.07, 0.02, 0, 0.1 + i * 0.11, -0.86, true);
      }
      if (k.world) return; // (the lines on the floor are the pedestal's picture of it; the room has a floor)
      const grid = k.sub();
      for (let i = -3; i <= 3; i++) k.box(0.012, 0.012, 1.6, i * 0.24, 0.02, 0, false, grid);
      k.anim.push((t) => (grid.position.x = ((t * 0.08) % 0.24) - 0.12));
    },
    // a floor of tiles that light in turn
    ground(k) {
      const tiles = [];
      for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) tiles.push(k.box(0.3, 0.05, 0.3, -0.66 + x * 0.33, 0.05, -0.66 + z * 0.33, (x + z) % 2 === 0));
      k.anim.push((t) => tiles.forEach((m, i) => (m.position.y = 0.05 + (Math.floor(t * 3) % tiles.length === i || Math.floor(t * 3 + 9) % tiles.length === i ? 0.12 : 0))));
    },
    // steps going up, for ever, with someone on them
    structures(k) {
      k.pad();
      const a = new THREE.Vector3(-0.7, 0.08, 0), b = new THREE.Vector3(0.7, 1.15, 0);
      for (const s of [-1, 1]) {
        const rail = k.box(a.distanceTo(b), 0.04, 0.03, 0, 0.85, s * 0.28, true);
        rail.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
      }
      for (let i = 0; i < 9; i++) {
        const st = k.box(0.2, 0.05, 0.5, 0, 0, 0);
        k.anim.push((t) => st.position.lerpVectors(a, b, (t * 0.14 + i / 9) % 1));
      }
      const rider = k.figure(0.3, k.group, true);
      k.anim.push((t) => (rider.position.lerpVectors(a, b, (t * 0.14 + 0.02) % 1).y += 0.03));
    },
    // shoppers, with their bags, going round
    life(k) {
      k.pad(0.9);
      for (let i = 0; i < 5; i++) {
        const g = k.sub();
        const f = k.figure(0.4, g, i % 2 === 1);
        k.box(0.1, 0.13, 0.05, 0.12, 0.14, 0, true, g);
        const r = 0.35 + (i % 2) * 0.35, sp = (i % 2 ? -1 : 1) * (0.5 + i * 0.07);
        k.anim.push((t) => {
          const a = t * sp + i * 1.4;
          g.position.set(Math.cos(a) * r, 0.04, Math.sin(a) * r);
          g.rotation.y = -a + (sp > 0 ? 0 : Math.PI);
          f.position.y = Math.abs(Math.sin(t * 5 + i)) * 0.03;
        });
      }
    },
    // a sign in tubes of light: an arrow, and it flickers
    light(k) {
      k.cyl(0.03, 0.03, 0.6, 0, 0.3, 0, true);
      const sign = k.sub(0, 1.0, 0);
      k.box(1.5, 0.75, 0.04, 0, 0, 0, true, sign);
      const tubes = [k.box(0.8, 0.07, 0.07, -0.12, 0, 0.05, false, sign)];
      for (const s of [-1, 1]) {
        const h = k.box(0.36, 0.07, 0.07, 0.38, s * 0.12, 0.05, false, sign);
        h.rotation.z = -s * 0.75;
        tubes.push(h);
      }
      k.anim.push((t) => {
        const on = Math.sin(t * 13) > -0.6 || Math.sin(t * 1.7) > 0;
        for (const m of tubes) m.visible = on;
        sign.rotation.y = Math.sin(t * 0.4) * 0.35;
      });
    },
  },
};

// `o.world`: this one stands out in the room's projected world, at `o.scale`,
// not on a pedestal: no dome or pad of its own, and its loose points sized to match.
export function buildHoloProp(worldId, layer, frag, layers, o = {}) {
  const col = frag.col ?? frag.land ?? frag.a;
  const second = frag.b ?? frag.high ?? (layer === 'light' || layer === 'life' ? layers.sky.a : layers.ground.land);
  const k = kit(col, second, { ...o, lightlike: layer === 'light' || layer === 'sky', sky: layer === 'sky' });
  const make = PROPS[worldId] && PROPS[worldId][layer];
  if (make) make(k);
  else k.ball(0.5, 0, 0.6, 0); // (a world added to the list before it is drawn here)
  let lit = -1;
  return {
    group: k.group,
    tick(t) {
      for (const f of k.anim) f(t);
    },
    // 0 at rest .. 1 the one being looked at: brighter
    glow(g) {
      if (Math.abs(g - lit) < 0.02) return;
      lit = g;
      if (o.world) return; // (a real thing does not brighten for being looked at)
      for (const m of k.fills) m.opacity = Math.min(1, m.userData.op * (0.85 + g * 0.6));
      for (const m of k.lines) m.opacity = 0.75 + g * 0.25;
    },
    dispose() {
      k.group.traverse((o) => o.geometry && o.geometry.dispose());
      for (const m of k.fills) m.dispose();
      for (const m of k.lines) m.dispose();
    },
  };
}

// A fragment's name, over it: as wide as the words need (the dash's label
// sprite is a fixed 512 wide, and "A CITY ON NOTHING" runs off the end of it).
// `h`: the height of the letters' line, in the room's units.
export function holoName(text, color, h = 0.5) {
  const c = document.createElement('canvas');
  const g0 = c.getContext('2d');
  const font = '600 64px "Courier New", ui-monospace, monospace';
  g0.font = font;
  c.width = Math.ceil(g0.measureText(text).width) + 72;
  c.height = 128;
  const g = c.getContext('2d');
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // a dark slip behind the words, so they read over a bright room
  g.fillStyle = 'rgba(4,8,14,0.55)';
  g.beginPath();
  g.roundRect(4, 14, c.width - 8, 100, 26);
  g.fill();
  g.shadowColor = color;
  g.shadowBlur = 14;
  g.fillStyle = color;
  g.fillText(text, c.width / 2, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
  s.scale.set((h * c.width) / c.height, h, 1);
  s.renderOrder = 9;
  return s;
}
