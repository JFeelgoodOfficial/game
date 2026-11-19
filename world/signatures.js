// What a people carry on the body (world/species.js).
//
// Each signature is a dress-style function: world/aliens.js buildRig calls it
// once the figure is built and before it is fused, with
//   { joints, dims, mats: { skinMat, eyeMat }, rng, species, over }
// and it hangs its pieces on the joints (or on joints of its own, which then
// become bones) in one lit material of its own, so a signature costs a figure
// one more draw. It returns the handle kept as `rig.signature`.
//
//   emberSeams     Rustia: thin lit fissures on cheekbone, collarbone,
//                  forearm and knuckle. Nobody living has none.
//   headRing       Saturnia: a thin ring of light round the head, tilted
//                  16 degrees, part of the body. Nothing covers it.
//   shiftLights    Wavemall Prime: panels under the skin at temple, cheek and
//                  the back of the hand, cycling pink, cyan, amber. The
//                  pupils take the colour.
//   gillsWebbing   Neptunia: three gill slits each side of the neck that open
//                  when speaking, and hands webbed to the second knuckle.
//
//   liveSignature(rig, dt, t, talking, afraid)   every frame, after poseRig
//   setLightSpeed(rig, k)                        a scene slowing (or racing)
//                                                one Wavemaller's lights

import * as THREE from 'three';

const lerp = THREE.MathUtils.lerp;
const draw = (rng, v) => (Array.isArray(v) ? lerp(v[0], v[1], rng()) : v);

function add(joint, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  joint.add(m);
  return m;
}
const glow = (color, k) => new THREE.MeshStandardMaterial({ color: 0x120c0a, emissive: color, emissiveIntensity: k, roughness: 0.5 });

// The figures of world/aliens.js end at the wrist. A people known by their
// hands need hands: a palm on each forearm joint, `wide` across.
function hands(j, d, skinMat, wide = 1) {
  const l = d.limbScale * d.scaleY;
  for (const arm of [j.armL, j.armR]) {
    add(arm.elbow, new THREE.SphereGeometry(1, 8, 6).scale(0.026 * l, 0.05 * l, 0.042 * l * wide), skinMat, 0, -0.305 * l, 0);
  }
}

const SIGNATURES = {
  emberSeams({ joints: j, dims: d, mats, rng, species, over }) {
    const s = d.scaleY, w = d.buildWidth * s, l = d.limbScale * s, h = d.headScale * s;
    const sig = species.signature;
    // those who work the face burn bright; those who do not, 0.2 to 0.4
    const works = rng() < 0.7;
    const roll = rng();
    const bright = over.seamBrightness ?? (works ? lerp(sig.brightness[0], sig.brightness[1], roll) : lerp(0.2, 0.4, roll));
    const mat = glow(sig.color, 0);
    hands(j, d, mats.skinMat);
    for (const side of [-1, 1]) {
      // cheekbone
      add(j.head, new THREE.BoxGeometry(0.062 * h, 0.009 * h, 0.03 * h), mat, side * 0.082 * h, 0.118 * h, 0.128 * h, 0, side * 0.5, side * 0.42);
      add(j.head, new THREE.BoxGeometry(0.03 * h, 0.007 * h, 0.03 * h), mat, side * 0.112 * h, 0.15 * h, 0.1 * h, 0, side * 0.8, side * 1.0);
      // collarbone
      add(j.torso, new THREE.BoxGeometry(0.15 * w, 0.011 * s, 0.03 * s), mat, side * 0.105 * w, 0.505 * s, 0.205 * w, 0, 0, -side * 0.16);
      // forearm, and a branch off it
      const arm = side < 0 ? j.armL : j.armR;
      add(arm.elbow, new THREE.BoxGeometry(0.009 * l, 0.17 * l, 0.03 * l), mat, side * 0.012 * l, -0.14 * l, 0.026 * l, 0, 0, side * 0.06);
      add(arm.elbow, new THREE.BoxGeometry(0.008 * l, 0.06 * l, 0.03 * l), mat, side * 0.026 * l, -0.19 * l, 0.02 * l, 0, 0, side * 0.6);
      // knuckles
      for (let k = -1; k <= 1; k++) add(arm.elbow, new THREE.BoxGeometry(0.03 * l, 0.007 * l, 0.012 * l), mat, side * 0.012 * l, -0.33 * l, k * 0.022 * l);
    }
    return { type: 'emberSeams', mat, bright, base: 1.7 };
  },

  headRing({ joints: j, dims: d, mats, rng, species, over }) {
    const h = d.headScale * d.scaleY;
    const sig = species.signature;
    // 0.7 on the young, 1.0 grown, up to 1.4 on the old
    const width = over.ringWidth ?? draw(rng, sig.width);
    const mat = glow(sig.color, 1.35);
    hands(j, d, mats.skinMat);
    // it is on a joint of its own: it turns with the head and can drift on it
    const ring = new THREE.Group();
    ring.position.set(0, 0.3 * h, 0);
    ring.rotation.x = -THREE.MathUtils.degToRad(sig.tiltDeg); // high over the brow, low behind
    j.head.add(ring);
    const R = 0.215 * h;
    add(ring, new THREE.TorusGeometry(R, 0.0085 * h * width, 6, 30).rotateX(Math.PI / 2).scale(1, 0.55, 1), mat);
    j.ring = ring;
    return { type: 'headRing', mat, width, ring, radius: R, base: 1.35 };
  },

  shiftLights({ joints: j, dims: d, mats, species, over }) {
    const l = d.limbScale * d.scaleY, h = d.headScale * d.scaleY;
    const sig = species.signature;
    const mat = glow(sig.colors[0], 1.1);
    hands(j, d, mats.skinMat);
    for (const side of [-1, 1]) {
      add(j.head, new THREE.BoxGeometry(0.012 * h, 0.05 * h, 0.075 * h), mat, side * 0.134 * h, 0.2 * h, 0.035 * h); // temple
      add(j.head, new THREE.BoxGeometry(0.05 * h, 0.028 * h, 0.012 * h), mat, side * 0.082 * h, 0.075 * h, 0.134 * h); // cheek
      const arm = side < 0 ? j.armL : j.armR;
      add(arm.elbow, new THREE.BoxGeometry(0.012 * l, 0.042 * l, 0.036 * l), mat, side * 0.022 * l, -0.3 * l, 0); // back of the hand
    }
    const colors = sig.colors.map((c) => new THREE.Color(c));
    return {
      type: 'shiftLights', mat, colors, eyeMat: mats.eyeMat,
      calm: sig.periodCalmS, afraid: sig.periodAfraidS,
      speed: over.lightSpeed ?? 1, flicker: !!over.flicker, phase: 0, base: 1.1,
    };
  },

  gillsWebbing({ joints: j, dims: d, mats, species }) {
    const l = d.limbScale * d.scaleY, h = d.headScale * d.scaleY;
    const sig = species.signature;
    const mat = glow(sig.color, 0.9);
    hands(j, d, mats.skinMat, 1.75); // broad, for the webbing
    const gills = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < sig.slits; i++) {
        // each slit hinges at its front edge
        const g = new THREE.Group();
        g.position.set(side * 0.118 * h, 0.03 * h + i * 0.03 * h, 0.035 * h - i * 0.012 * h);
        g.userData.side = side;
        j.head.add(g);
        add(g, new THREE.BoxGeometry(0.012 * h, 0.011 * h, 0.075 * h), mat, side * 0.008 * h, 0, -0.04 * h);
        gills.push(g);
      }
      // the web, to the second knuckle
      const arm = side < 0 ? j.armL : j.armR;
      add(arm.elbow, new THREE.BoxGeometry(0.008 * l, 0.045 * l, 0.14 * l), mat, 0, -0.335 * l, 0);
    }
    return { type: 'gillsWebbing', mat, gills, open: 0, base: 0.9 };
  },
};

export function buildSignature(ctx) {
  const type = ctx.species.signature?.type;
  const fn = SIGNATURES[type];
  if (!fn) return null;
  const sig = fn(ctx);
  sig.seed = ctx.rng() * 6.283;
  if (sig.type === 'emberSeams') sig.mat.emissiveIntensity = sig.base * sig.bright ** 1.5;
  return sig;
}

const _c = new THREE.Color();

// After poseRig. Nothing here allocates.
export function liveSignature(rig, dt, t, talking = false, afraid = false) {
  const sig = rig.signature;
  if (!sig) return;
  if (sig.type === 'shiftLights') {
    sig.phase += (dt * sig.speed) / (afraid ? sig.afraid : sig.calm);
    if (sig.phase > 1e4) sig.phase -= 1e4;
    const n = sig.colors.length;
    const f = (sig.phase % 1) * n;
    const i = Math.floor(f) % n;
    _c.copy(sig.colors[i]).lerp(sig.colors[(i + 1) % n], THREE.MathUtils.smoothstep(f - Math.floor(f), 0.15, 0.85));
    let k = 1;
    if (afraid || sig.flicker) {
      // a tube that will not quite hold
      const a = Math.sin(t * 31 + sig.seed) * Math.sin(t * 12.7 + sig.seed * 3);
      k = a > 0.55 ? 0.35 : 0.85 + 0.15 * Math.sin(t * 47 + sig.seed);
    }
    sig.mat.emissive.copy(_c);
    sig.mat.emissiveIntensity = sig.base * k;
    sig.eyeMat.color.copy(_c);
    sig.eyeMat.emissive.copy(_c);
    if (sig.eyeMat.emissiveIntensity < 0.7) sig.eyeMat.emissiveIntensity = 0.7; // (lit from behind, day or night)
  } else if (sig.type === 'gillsWebbing') {
    const want = talking ? 0.6 + 0.4 * Math.sin(t * 9 + sig.seed) : 0.12 + 0.08 * Math.sin(t * 1.4 + sig.seed);
    sig.open += (want - sig.open) * Math.min(1, dt * 10);
    for (let i = 0; i < sig.gills.length; i++) {
      const g = sig.gills[i];
      g.rotation.y = g.userData.side * sig.open * 0.55;
    }
    sig.mat.emissiveIntensity = sig.base * (0.7 + 0.6 * sig.open);
  } else if (sig.type === 'emberSeams') {
    sig.mat.emissiveIntensity = sig.base * sig.bright ** 1.5 * (0.9 + 0.1 * Math.sin(t * 2.3 + sig.seed) * Math.sin(t * 0.7 + sig.seed * 2));
  } else if (sig.type === 'headRing') {
    sig.ring.rotation.y = Math.sin(t * 0.25 + sig.seed) * 0.5;
    sig.mat.emissiveIntensity = sig.base * (0.92 + 0.08 * Math.sin(t * 1.1 + sig.seed));
  }
}

// 1 is this figure's own pace; a scene may slow a frightened one or stop her.
export function setLightSpeed(rig, k) {
  if (rig.signature && rig.signature.type === 'shiftLights') rig.signature.speed = k;
}
