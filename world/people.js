/**
 * people.js — realistic human crowds for any world.
 *
 * Born as shadowreach-people.js for the confession circle and the desert queue —
 * the two places in Shadowreach where the player walks in among a hundred and
 * eighty strangers and has to believe they are strangers. Nothing in it was
 * shadowreach-specific, so it now serves every world that wants real people
 * (wavemall prime's shoppers, wyattmattoe's basecamp riders). Callers that
 * move their people drive setPersonPose(); everyone else is exactly as before.
 *
 * They were a cone with a sphere on top, and a capsule with a sphere on top.
 * From across the zone that reads as bollards; from two metres away it reads as
 * nothing at all. This module builds people instead.
 *
 * HOW IT STAYS CHEAP. A crowd is drawn as three co-located InstancedMeshes over
 * one shared set of per-instance matrices — skin (head, neck, hands), garment
 * (torso, sleeves, legs) and hair. Three draw calls for sixty people, not sixty
 * objects, and because each layer carries its own instanceColor every person
 * gets an independent skin tone, an independent set of clothes and independent
 * hair. That last part is the whole reason for the split: one InstancedMesh
 * tints a whole body uniformly, and a crowd where hair and skin and cloth are
 * the same colour is a crowd of mannequins.
 *
 * HOW IT GETS CLOSE. Instanced bodies cannot bend, so the nearest handful
 * promote to real articulated rigs — breathing, weight shifting from one foot to
 * the other, and a head that turns to follow you past. Promotion writes a
 * zero-scale matrix into that person's instance slot and shows the rig in its
 * place; demotion puts the matrix back, and the instance buffers are otherwise
 * never rewritten. This is the promote/demote pattern world/aliens.js
 * established for its citizens, with hysteresis on the two distances so nobody
 * flickers on the boundary. Each rig owns its own three materials, because the
 * promoted people are the ones close enough to compare and they cannot all
 * suddenly share a skin tone.
 *
 * world/aliens.js's own buildRig is deliberately NOT reused. It makes aliens —
 * antennae, crests, one to four eyes, emissive trim. The pattern is the model
 * here; the anatomy is not.
 *
 * Proportions are ordinary human canon against a 1.75 m reference: head an
 * eighth of stature, shoulders a quarter across, hip joint just under halfway
 * up, elbow at the waist, fingertips mid-thigh. Every measurement is a fraction
 * of stature, so a 1.55 m person and a 1.95 m one are the same body at different
 * sizes rather than two different designs. Height, build, hair, skin, clothing
 * and posture phase all come off mulberry32, so no two silhouettes match.
 *
 * Materials come from the caller (the Actuality PBR registry, see
 * world/actuality-materials.js). The registry OWNS what it hands out and
 * memoizes it, so everything this module needs to modify — every material here
 * takes either an idle-motion vertex hook or a fade-out opacity ramp — is cloned
 * first. The clones are ours and are disposed here.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ----------------------------------------------------------------------
 * Tunables
 * ------------------------------------------------------------------- */
const C = {
  // Reference stature, metres — per-person scale rides on this. Matched to the
  // player: the astronaut is ~1.8 to the top of the helmet (src/astronaut.js)
  // and the on-foot camera sits at C.WALK_EYE_HEIGHT. At the old 1.75 (and a
  // spread that went down to 1.54) the townsfolk read as a head shorter than
  // you everywhere in town.
  height: 1.9,
  // Wide enough to reach the confession circle's inner ring from its centre —
  // standing in the middle of that ring is the dramatic position in the zone,
  // and it is the one place nobody must still be a statue. The ring sits at
  // 12-15 m.
  promoteDist: 16,     // inside this, an instance becomes an articulated rig
  demoteDist: 19,      // outside this it goes back (hysteresis: never equal)
  maxRigs: 12,         // articulated bodies alive at once, per crowd
  headTurnMax: 1.15,   // radians a head will turn to follow the player
};

// Skin and hair ranges. Varied in tone and value rather than in hue — a crowd
// where everyone is a different colour is as wrong as one where everyone is the
// same. Clothing tints are the caller's, since they belong to the zone.
const SKIN = [
  0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0xffdbac,
  0x6b4423, 0xa9704b, 0xd9a066, 0x5c3a21, 0xecc9a0,
];
const HAIR = [0x1c1512, 0x2b1d15, 0x4a2f1c, 0x6b4a2f, 0x8a6a44, 0x3a3a3c, 0x9a9a98, 0x5a2f1a];
// Eyes and brows take the hair colour, darkened — brows match hair on a real
// head, and an iris read at three metres is a dark spot whatever its colour.
const FEATURE_DARKEN = 0.45;
// ...except when that lands on the same value as the skin it sits on, which is
// how a face disappears. Grey hair (0x9a9a98) darkens to 0x454544, and against
// the darkest skin (0x5c3a21) that is a 0.02 luminance gap — invisible. Note
// the failure is DARK-on-DARK, so darkening the tint further makes it worse;
// the fix is a contrast floor, and a skin-derived near-black when it trips.
const FEATURE_MIN_CONTRAST = 0.12;

// Four material layers, because four is what it takes for a crowd to read.
// skin / garment / hair carry the three things that vary person to person, and
// `features` is the face: eyes, brows, mouth, all one dark tint. It earns its
// draw call at conversational range, where a smooth sphere for a head is the
// difference between a person and a shop dummy — and the player walks into the
// middle of both of these crowds.
const LAYERS = ['skin', 'garment', 'hair', 'features'];

// Which per-person colour each layer takes.
const LAYER_COLOR = {
  skin: (spec) => spec.skin,
  garment: (spec) => spec.cloth,
  hair: (spec) => spec.hair,
  features: (spec) => {
    const f = darken(spec.hair, FEATURE_DARKEN);
    return Math.abs(luma(f) - luma(spec.skin)) < FEATURE_MIN_CONTRAST
      ? darken(spec.skin, 0.18) // a near-black struck from their own skin tone
      : f;
  },
};

// Rec. 709 luma on the sRGB values — good enough to tell "these two colours are
// the same value" apart, which is all the contrast floor above needs.
function luma(hex) {
  return (0.2126 * ((hex >> 16) & 255)
    + 0.7152 * ((hex >> 8) & 255)
    + 0.0722 * (hex & 255)) / 255;
}

function darken(hex, k) {
  return (Math.round(((hex >> 16) & 255) * k) << 16)
    | (Math.round(((hex >> 8) & 255) * k) << 8)
    | Math.round((hex & 255) * k);
}

// Module scratch — no per-frame allocation.
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const _scale = new THREE.Vector3(1, 1, 1);
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _toPlayer = new THREE.Vector3();
const _invQ = new THREE.Quaternion();
const _yUp = new THREE.Vector3(0, 1, 0);

/* ----------------------------------------------------------------------
 * Geometry
 * ------------------------------------------------------------------- */
// Merge parts into one non-indexed BufferGeometry. Mixed indexed and
// non-indexed sources (capsules and spheres and boxes) will not merge otherwise.
function merge(parts) {
  if (!parts.length) return new THREE.BufferGeometry();
  const flat = parts.map((g) => {
    if (!g.index) return g;
    const ni = g.toNonIndexed();
    g.dispose();
    return ni;
  });
  const out = mergeGeometries(flat, false);
  for (const g of flat) g.dispose();
  return out;
}

// The body, feet at y = 0, built at C.height.
//
// Returned split at the neck: `body` is everything the pelvis carries, `head` is
// everything that turns with the skull. The instanced path merges the two back
// together; the articulated path hangs them on separate pivots, which is what
// lets a promoted person look at you.
function buildBodyParts(opts = {}) {
  const H = C.height;
  const build = opts.build ?? 1;
  const robed = !!opts.robed;
  const headR = H * 0.068;
  const shoulderY = H * 0.82;
  const hipY = H * 0.47;
  const shoulderX = H * 0.105 * build;
  const NECK_Y = H * 0.86; // the pivot the head turns about

  const bodySkin = [], bodyGarment = [];
  const headSkin = [], headHair = [], headFeatures = [];

  // --- head: a slightly tall sphere plus a jaw wedge, so the profile is not a
  // ball on a stick. Wider than deep, like a skull.
  const head = new THREE.SphereGeometry(headR, 10, 8);
  head.scale(0.92, 1.12, 1.0);
  head.translate(0, H * 0.935 - NECK_Y, 0);
  headSkin.push(head);
  const jaw = new THREE.SphereGeometry(headR * 0.72, 8, 6);
  jaw.scale(0.86, 0.78, 1.05);
  jaw.translate(0, H * 0.9 - NECK_Y, headR * 0.16);
  headSkin.push(jaw);

  // --- face. Every feature must sit PROUD OF the skull, and the skull is an
  // ELLIPSOID, not a sphere: scaled (0.92, 1.12, 1.0), its front surface pulls
  // back toward the middle of the face and further still out at the temples. A
  // flat "push everything to z = headR" is not enough — at the eye line the
  // surface is only 0.91 headR, at the brow's inner end 0.93, at the mouth
  // 0.94. The original pass placed the whole face at 0.76-0.80 headR and buried
  // it, which is why a citizen read as a smooth ball with a nose. So: solve the
  // ellipsoid for its own surface z under each feature, then stand the feature
  // off THAT. Build-time only — a handful of calls per body variant.
  const skullCY = H * 0.935 - NECK_Y;
  const surfaceZ = (semiX, semiY, semiZ, x, dy) => {
    const k = 1 - (x * x) / (semiX * semiX) - (dy * dy) / (semiY * semiY);
    return k > 0 ? semiZ * Math.sqrt(k) : 0;
  };
  // z of the skull surface at (x, y), both measured from the head's own centre.
  const skullZ = (x, y) => surfaceZ(0.92 * headR, 1.12 * headR, headR, x, y - skullCY);
  const EYE_PROUD = headR * 0.11; // how far the eyeball domes out of its socket
  const FLAT_PROUD = headR * 0.06; // ... and how far a brow/mouth bar stands off

  const EYE_Y = H * 0.945 - NECK_Y;
  const eyeX = headR * 0.36;
  for (const side of [-1, 1]) {
    // Barely up from the old 0.145: at 0.155 headR this is ~40 mm across on a
    // 1.9 m person, a shade over the ~30 mm of a real eye opening. Being buried
    // was the whole problem, not the scale, so it does not need to be a doll's.
    const eyeR = headR * 0.155;
    const eyeHalfZ = eyeR * 0.78;
    const eye = new THREE.SphereGeometry(eyeR, 6, 5);
    eye.scale(1, 0.82, 0.78); // domed, not a lens — it has to catch a highlight
    eye.translate(side * eyeX, EYE_Y, skullZ(eyeX, EYE_Y) + EYE_PROUD - eyeHalfZ);
    headFeatures.push(eye);
    // Brow: a flattened bar angled slightly down toward the nose, which is what
    // gives a face any expression at all at this scale. Also swept back around
    // Y so it FOLLOWS the skull instead of chording across it — the temple is
    // where the ellipsoid falls away fastest, and a straight bar seated on the
    // inner end stands 46 mm off the head out there, which reads as a twig
    // glued to the face rather than a brow ridge.
    const browW = headR * 0.52, browD = headR * 0.14;
    const browY = EYE_Y + headR * 0.26;
    const brow = new THREE.BoxGeometry(browW, headR * 0.10, browD);
    brow.rotateZ(side * -0.13);
    brow.rotateY(side * 0.5);
    brow.translate(side * eyeX, browY, skullZ(eyeX, browY) + FLAT_PROUD - browD / 2);
    headFeatures.push(brow);
  }
  // The mouth straddles the skull and the jaw wedge; at this height the skull
  // is the more forward of the two (0.94 headR vs the jaw's 0.89), so clearing
  // the skull clears both. Seated against x = 0, its most forward point.
  const mouthD = headR * 0.12;
  const mouthY = EYE_Y - headR * 0.53;
  const mouth = new THREE.BoxGeometry(headR * 0.50, headR * 0.075, mouthD);
  mouth.translate(0, mouthY, skullZ(0, mouthY) + FLAT_PROUD - mouthD / 2);
  headFeatures.push(mouth);
  // A nose, so the profile is not flat — the silhouette is what reads first when
  // someone is turned away from you, which in the queue is almost everyone.
  // Seated the same way, so the base stays buried in the face (noses attach)
  // while the tip clears the skull by a real amount instead of the 4 mm the
  // old flat placement left it with.
  const noseLen = headR * 0.30;
  const noseY = EYE_Y - headR * 0.20;
  const nose = new THREE.ConeGeometry(headR * 0.13, noseLen, 5).rotateX(Math.PI / 2);
  nose.translate(0, noseY, skullZ(0, noseY) + headR * 0.10 - noseLen / 2);
  headSkin.push(nose);
  // Ears.
  for (const side of [-1, 1]) {
    const ear = new THREE.SphereGeometry(headR * 0.16, 5, 4);
    ear.scale(0.42, 1, 0.72);
    ear.translate(side * headR * 0.88, EYE_Y - headR * 0.08, 0);
    headSkin.push(ear);
  }

  // --- hair: a cap on the skull, plus one of three silhouettes.
  const cap = new THREE.SphereGeometry(headR * 1.05, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
  cap.scale(0.94, 1.16, 1.02);
  cap.translate(0, H * 0.938 - NECK_Y, -headR * 0.04);
  headHair.push(cap);
  if (opts.hairStyle === 'bun') {
    headHair.push(new THREE.SphereGeometry(headR * 0.46, 8, 6)
      .translate(0, H * 0.975 - NECK_Y, -headR * 0.92));
  } else if (opts.hairStyle === 'long') {
    const fall = new THREE.CylinderGeometry(headR * 0.9, headR * 0.66, H * 0.13, 8, 1, true);
    fall.scale(1, 1, 0.72);
    fall.translate(0, H * 0.875 - NECK_Y, -headR * 0.3);
    headHair.push(fall);
  }

  // --- neck stays with the body: it should not swing when the head turns.
  bodySkin.push(new THREE.CylinderGeometry(headR * 0.42, headR * 0.5, H * 0.06, 7)
    .translate(0, H * 0.845, 0));

  // --- torso: chest tapering to waist, then hips. Three stacked capsules read
  // as a ribcage over a waist far better than one barrel does.
  const chest = new THREE.CapsuleGeometry(H * 0.088 * build, H * 0.10, 4, 10);
  chest.scale(1.16, 1, 0.68); // people are wider than they are deep
  chest.translate(0, H * 0.735, 0);
  bodyGarment.push(chest);
  const waist = new THREE.CapsuleGeometry(H * 0.073 * build, H * 0.07, 4, 10);
  waist.scale(1.1, 1, 0.7);
  waist.translate(0, H * 0.60, 0);
  bodyGarment.push(waist);
  const hips = new THREE.CapsuleGeometry(H * 0.082 * build, H * 0.045, 4, 10);
  hips.scale(1.12, 1, 0.72);
  hips.translate(0, H * 0.495, 0);
  bodyGarment.push(hips);
  // Shoulders: a cross-bar, so arms hang off a line rather than sprouting from
  // the ribs.
  bodyGarment.push(new THREE.CapsuleGeometry(H * 0.048 * build, shoulderX * 1.5, 4, 8)
    .rotateZ(Math.PI / 2)
    .translate(0, shoulderY, 0));

  for (const side of [-1, 1]) {
    // --- arms: upper to the elbow at the waist, forearm to fingertips mid-thigh,
    // both angled a few degrees out so they clear the body as real arms do.
    const upper = new THREE.CapsuleGeometry(H * 0.032 * build, H * 0.16, 4, 8);
    upper.translate(0, -H * 0.09, 0);
    upper.rotateZ(side * 0.10);
    upper.translate(side * shoulderX, shoulderY, 0);
    bodyGarment.push(upper);

    const fore = new THREE.CapsuleGeometry(H * 0.026 * build, H * 0.145, 4, 8);
    fore.translate(0, -H * 0.085, 0);
    fore.rotateZ(side * 0.055);
    fore.translate(side * (shoulderX + H * 0.028), shoulderY - H * 0.185, 0);
    // Bare forearms on plain clothes, sleeved under a robe.
    (robed ? bodyGarment : bodySkin).push(fore);

    const hand = new THREE.SphereGeometry(H * 0.028, 7, 5);
    hand.scale(0.78, 1.22, 0.56);
    hand.translate(side * (shoulderX + H * 0.038), shoulderY - H * 0.345, 0);
    bodySkin.push(hand);

    // --- legs. A robe replaces both with a skirt below, so only build them when
    // there is nothing draped over them.
    if (!robed) {
      const hipX = H * 0.048 * build;
      const thigh = new THREE.CapsuleGeometry(H * 0.045 * build, H * 0.17, 4, 8);
      thigh.translate(0, -H * 0.10, 0);
      thigh.rotateZ(side * 0.035);
      thigh.translate(side * hipX, hipY, 0);
      bodyGarment.push(thigh);

      const calf = new THREE.CapsuleGeometry(H * 0.034 * build, H * 0.165, 4, 8);
      calf.translate(0, -H * 0.095, 0);
      calf.translate(side * hipX * 1.06, hipY - H * 0.205, 0);
      bodyGarment.push(calf);

      bodyGarment.push(new THREE.BoxGeometry(H * 0.052, H * 0.032, H * 0.115)
        .translate(side * hipX * 1.06, H * 0.016, H * 0.022));
    }
  }

  if (robed) {
    // Waist to floor. Open-ended so the inside is not a lid; the garment
    // material is DoubleSide and carries the backfaces.
    bodyGarment.push(new THREE.CylinderGeometry(
      H * 0.088 * build, H * 0.20 * build, H * 0.53, 12, 1, true
    ).translate(0, H * 0.265, 0));
  }

  return {
    neckY: NECK_Y,
    bodySkin: merge(bodySkin),
    bodyGarment: merge(bodyGarment),
    headSkin: merge(headSkin),
    headHair: merge(headHair),
    headFeatures: merge(headFeatures),
  };
}

// The instanced form: everything above the neck welded back onto the body, so
// each layer is a single geometry.
function flattenForInstancing(parts) {
  const headSkin = parts.headSkin.clone().translate(0, parts.neckY, 0);
  return {
    skin: merge([parts.bodySkin.clone(), headSkin]),
    garment: parts.bodyGarment.clone(),
    hair: parts.headHair.clone().translate(0, parts.neckY, 0),
    features: parts.headFeatures.clone().translate(0, parts.neckY, 0),
  };
}

/* ----------------------------------------------------------------------
 * Idle motion, in the vertex shader
 *
 * Sixty people breathing is sixty matrix recompositions a frame on the CPU.
 * Done here it is free: the phase comes off the instance's own origin so the
 * crowd never inhales in unison, and displacement grows with height so feet
 * stay planted while the shoulders and head carry the movement.
 * ------------------------------------------------------------------- */
function addIdleMotion(mat, timeUniform) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float ph = ip.x * 1.31 + ip.z * 0.87;
        float breath = sin(uTime * 0.9 + ph) * 0.5 + 0.5;
        // A slow lean from one foot to the other, well under a step. This is
        // standing still, not swaying.
        float shift = sin(uTime * 0.31 + ph * 0.7);
        float up = clamp(transformed.y / ${C.height.toFixed(2)}, 0.0, 1.0);
        float hi = up * up;
        transformed.y += breath * 0.006 * hi;
        transformed.x += shift * 0.022 * hi;
        transformed.z += sin(uTime * 0.23 + ph * 1.9) * 0.012 * hi;
      }`
    );
  };
  mat.needsUpdate = true;
}

/* ----------------------------------------------------------------------
 * An articulated body — the same parts, hung on pivots so they can move.
 * ------------------------------------------------------------------- */
function buildPersonRig(parts, mats) {
  const root = new THREE.Group();

  // Body pivot: breath and weight shift happen here, in the figure's own local
  // frame. They cannot go on `root` — that carries the position and orientation
  // on the planet's surface, where "up" is not +Y.
  const body = new THREE.Group();
  root.add(body);
  for (const [geo, mat] of [[parts.bodySkin, mats.skin], [parts.bodyGarment, mats.garment]]) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    body.add(mesh);
  }

  // Neck pivot: the head and hair turn about it, independent of the body. That
  // is the tell that something is alive rather than placed.
  const neck = new THREE.Group();
  neck.position.y = parts.neckY;
  body.add(neck);
  for (const [geo, mat] of [
    [parts.headSkin, mats.skin], [parts.headHair, mats.hair], [parts.headFeatures, mats.features],
  ]) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    neck.add(mesh);
  }

  return { group: root, body, neck, mats, phase: 0, spec: null };
}

// Idle pose for one articulated body. Breath and weight shift are matched to the
// shader above so nobody visibly changes gait when they promote, plus the head
// turn the instances cannot do. A moving person (rig.speed01, fed through
// setPersonPose) trades the idle sway for a walking carriage: forward lean,
// step-frequency roll, the stride bob riding in via the group position. The
// legs are merged geometry and cannot swing — at crowd range the carriage is
// what sells the walk, and the stationary rig is the documented fallback.
function posePerson(rig, t, playerLocal) {
  const ph = rig.phase;
  const speed = rig.speed01 ?? 0;
  const breath = Math.sin(t * 0.9 + ph) * 0.5 + 0.5;
  const shift = Math.sin(t * 0.31 + ph * 0.7);
  if (speed > 0.05) {
    rig.body.position.y = breath * 0.004;
    rig.body.position.x = 0;
    rig.body.rotation.x = -0.10 * speed;
    rig.body.rotation.z = Math.sin(t * 7.2 + ph) * 0.055 * speed;
  } else {
    rig.body.position.y = breath * 0.006;
    rig.body.position.x = shift * 0.022;
    rig.body.rotation.x = 0;
    rig.body.rotation.z = -shift * 0.012;
  }

  // The head follows the player, but only as far as a neck goes. Past that a
  // person turns their body or lets you pass; a head tracking you round the back
  // of the skull is worse than no tracking at all.
  _toPlayer.copy(playerLocal).sub(rig.group.position)
    .applyQuaternion(_invQ.copy(rig.group.quaternion).invert());
  const yaw = Math.atan2(_toPlayer.x, _toPlayer.z);
  const wantYaw = THREE.MathUtils.clamp(yaw, -C.headTurnMax, C.headTurnMax);
  const flat = Math.hypot(_toPlayer.x, _toPlayer.z);
  const wantPitch = THREE.MathUtils.clamp(
    -Math.atan2(_toPlayer.y - C.height * 0.9 * rig.group.scale.y, Math.max(flat, 0.01)),
    -0.32, 0.4
  );
  rig.neck.rotation.y += (wantYaw - rig.neck.rotation.y) * 0.09;
  rig.neck.rotation.x += (wantPitch - rig.neck.rotation.x) * 0.09;
  rig.neck.rotation.z = shift * 0.05;
}

/* ----------------------------------------------------------------------
 * createCrowd — one call per crowd.
 *
 * `place(i)` returns { pos, quat, scale? } in the caller's local frame, which is
 * the only thing this module needs to know about the world it stands in.
 * `cloth(rng)` returns a clothing tint per person.
 * ------------------------------------------------------------------- */
export function createCrowd(opts) {
  const {
    count, rng, materials, place,
    cloth = () => 0xffffff,
    robedFraction = 0,
    maxRigs = C.maxRigs,
  } = opts;

  const group = new THREE.Group();
  const owned = [];                 // geometries + materials disposed here
  const fadeMats = [];              // every material the dissolve has to ramp
  const timeUniform = { value: 0 };

  // Layer materials for the instanced bodies. Cloned off the registry — it owns
  // and memoizes the originals, and these take a vertex hook. White base colour
  // so instanceColor carries the whole tint.
  const mkMat = (family, o) => {
    const m = materials.make(family, { color: 0xffffff, ...o }).clone();
    m.transparent = true;
    owned.push(m);
    fadeMats.push(m);
    return m;
  };
  const mkSet = () => ({
    skin: mkMat('plaster', { repeat: 1.5, roughness: 0.72 }),
    garment: mkMat('groundCover', { repeat: 2.2, roughness: 0.94, side: THREE.DoubleSide }),
    hair: mkMat('plaster', { repeat: 3, roughness: 0.58 }),
    // Eyes and mouth are wet; the brows are not, but one material for the face
    // is worth more than the distinction. Low roughness reads as a catchlight.
    features: mkMat('plaster', { repeat: 4, roughness: 0.34 }),
  });

  const layerMats = mkSet();
  for (const k of LAYERS) addIdleMotion(layerMats[k], timeUniform);

  // Two silhouettes — plain and robed — so a crowd is not one shape repeated.
  const variants = [];
  for (const robed of robedFraction > 0 ? [false, true] : [false]) {
    const parts = buildBodyParts({ build: 1, robed });
    const inst = flattenForInstancing(parts);
    owned.push(parts.bodySkin, parts.bodyGarment, parts.headSkin, parts.headHair,
      parts.headFeatures, inst.skin, inst.garment, inst.hair, inst.features);
    variants.push({ robed, parts, inst, slots: [], meshes: null });
  }

  // --- Per-person spec.
  const people = [];
  for (let i = 0; i < count; i++) {
    const robed = rng() < robedFraction;
    const p = place(i);
    const spec = {
      robed,
      // 0.94-1.06 of 1.9 m is about 1.79-2.01 m. A narrow spread on purpose:
      // wide enough that a crowd doesn't read cloned, tight enough that nobody
      // is noticeably shorter than the player standing next to them.
      scale: (0.94 + rng() * 0.12) * (p.scale ?? 1),
      hairStyle: ['cap', 'bun', 'long'][Math.floor(rng() * 3)],
      skin: SKIN[Math.floor(rng() * SKIN.length)],
      hair: HAIR[Math.floor(rng() * HAIR.length)],
      cloth: cloth(rng),
      phase: rng() * Math.PI * 2,
    };
    const v = variants.find((x) => x.robed === robed) ?? variants[0];
    people.push({
      spec, pos: p.pos.clone(), quat: p.quat.clone(),
      variant: v, slot: v.slots.length, rig: null, matrix: null, speed01: 0,
    });
    v.slots.push(i);
  }

  // --- Instanced layers, one set per variant.
  for (const v of variants) {
    const n = v.slots.length;
    if (!n) continue;
    v.meshes = {};
    for (const layer of LAYERS) {
      const mesh = new THREE.InstancedMesh(v.inst[layer], layerMats[layer], n);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      v.meshes[layer] = mesh;
      group.add(mesh);
    }
    for (const idx of v.slots) {
      const person = people[idx];
      person.matrix = new THREE.Matrix4().compose(
        person.pos, person.quat, _scale.setScalar(person.spec.scale)
      );
      for (const layer of LAYERS) {
        v.meshes[layer].setMatrixAt(person.slot, person.matrix);
        v.meshes[layer].setColorAt(person.slot, _c.setHex(LAYER_COLOR[layer](person.spec)));
      }
    }
    for (const layer of LAYERS) {
      v.meshes[layer].instanceMatrix.needsUpdate = true;
      if (v.meshes[layer].instanceColor) v.meshes[layer].instanceColor.needsUpdate = true;
    }
  }

  /* --- Promotion pool -------------------------------------------------
   * Pools are keyed by silhouette, because a robed body and a bare-legged one
   * are different geometry. Each rig owns its own three materials: the promoted
   * people are the ones standing close enough to compare, and they cannot all
   * share a skin tone. That is 3 materials per rig, at most maxRigs per pool.
   * Hair style is the one thing a pooled rig cannot re-fit — the bun is real
   * geometry — so a pool is built from the first spec that needs it and hands
   * back whatever silhouette it has. At a dozen bodies out of sixty, nobody is
   * comparing hairlines across a promote.
   * ----------------------------------------------------------------- */
  const pools = new Map(); // key -> rig[]
  const poolKey = (spec) => `${spec.robed ? 'r' : 'p'}|${spec.hairStyle}`;

  function acquireRig(spec) {
    const key = poolKey(spec);
    let pool = pools.get(key);
    if (!pool) { pool = []; pools.set(key, pool); }
    const existing = pool.pop();
    if (existing) return existing;
    const parts = buildBodyParts({ build: 1, robed: spec.robed, hairStyle: spec.hairStyle });
    owned.push(parts.bodySkin, parts.bodyGarment, parts.headSkin, parts.headHair,
      parts.headFeatures);
    const mats = mkSet();
    const rig = buildPersonRig(parts, mats);
    rig.poolKey = key;
    group.add(rig.group);
    return rig;
  }

  function setInstanceShown(person, shown) {
    const v = person.variant;
    if (!v.meshes) return;
    for (const layer of LAYERS) {
      v.meshes[layer].setMatrixAt(person.slot, shown ? person.matrix : _zero);
      v.meshes[layer].instanceMatrix.needsUpdate = true;
    }
  }

  function promote(person) {
    const rig = acquireRig(person.spec);
    rig.spec = person.spec;
    rig.phase = person.spec.phase;
    for (const layer of LAYERS) rig.mats[layer].color.setHex(LAYER_COLOR[layer](person.spec));
    rig.group.position.copy(person.pos);
    rig.group.quaternion.copy(person.quat);
    rig.group.scale.setScalar(person.spec.scale);
    rig.group.visible = true;
    rig.speed01 = person.speed01;
    person.rig = rig;
    setInstanceShown(person, false);
  }

  function demote(person) {
    const rig = person.rig;
    if (!rig) return;
    rig.group.visible = false;
    pools.get(rig.poolKey).push(rig);
    person.rig = null;
    setInstanceShown(person, true);
  }

  let fade = -1;
  let fadeTime = 2.5;
  let gone = false;

  function update(t, dt, playerLocal) {
    if (gone) return;
    timeUniform.value = t;

    if (fade >= 0) {
      fade += dt;
      const k = Math.max(0, 1 - fade / fadeTime);
      for (const m of fadeMats) m.opacity = k;
      if (fade > fadeTime) {
        // Everybody: the instanced layers AND anyone currently promoted, or a
        // dozen articulated bodies are left standing in an empty circle.
        for (const person of people) if (person.rig) demote(person);
        group.visible = false;
        gone = true;
      }
      return;
    }

    // Promote and demote by distance, with hysteresis so the boundary does not
    // flicker. A linear sweep is cheap at these counts and allocates nothing.
    let live = 0;
    for (const person of people) if (person.rig) live++;
    for (const person of people) {
      const d = person.pos.distanceTo(playerLocal);
      if (person.rig) {
        if (d > C.demoteDist) { demote(person); live--; }
      } else if (d < C.promoteDist && live < maxRigs) {
        promote(person); live++;
      }
    }
    for (const person of people) {
      if (person.rig) {
        person.rig.speed01 = person.speed01;
        posePerson(person.rig, t, playerLocal);
      }
    }
  }

  // Mobile crowds (a citizen sim that owns positions — wavemall's shoppers):
  // re-seat person `i` at (x, y, z) facing `yaw` (about local +Y), moving at
  // speed01 of walking pace. The stride bob rides the position, so instances
  // and promoted rigs stay in step through a promote/demote. Call every frame
  // for people that move; stationary people never need it.
  function setPersonPose(i, x, y, z, yaw, speed01 = 0, t = 0) {
    const person = people[i];
    if (!person) return;
    const bob = speed01 > 0.02
      ? Math.abs(Math.sin(t * 7.2 + person.spec.phase)) * 0.05 * speed01
      : 0;
    person.pos.set(x, y + bob, z);
    person.quat.setFromAxisAngle(_yUp, yaw);
    person.speed01 = speed01;
    person.matrix.compose(person.pos, person.quat, _scale.setScalar(person.spec.scale));
    if (person.rig) {
      person.rig.group.position.copy(person.pos);
      person.rig.group.quaternion.copy(person.quat);
    } else {
      setInstanceShown(person, true);
    }
  }

  return {
    group,
    update,
    setPersonPose,
    // Start the dissolve. The circle vanishes when its confession ends and the
    // queue breaks when the girl takes your hand; both need everyone gone.
    startFade(seconds = 2.5) { if (fade < 0 && !gone) { fade = 0; fadeTime = seconds; } },
    get faded() { return gone; },
    // Articulated bodies currently standing, for headless verification.
    get rigCount() { return people.reduce((n, p) => n + (p.rig ? 1 : 0), 0); },
    dispose() {
      for (const o of owned) { try { o.dispose(); } catch (e) { /* already gone */ } }
      owned.length = 0;
      fadeMats.length = 0;
      pools.clear();
    },
  };
}
