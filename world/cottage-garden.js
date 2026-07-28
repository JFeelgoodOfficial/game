// cottage-garden.js — the garden assembly: where everything goes, what it is
// allowed to grow on, and what stops you walking through it.
//
// world/cottage.js owns the place; this owns the planting. It is a separate
// file because the placement constants are all expressed against the cottage's
// own frame (HX, HZ, pathX, PAD_*) and there are a lot of them, and because
// keeping the four ported modules behind one call keeps cottage.js's diff to a
// handful of lines.
//
// THE REJECT PREDICATE IS THE LOAD-BEARING PART. It is the only thing keeping
// flowers off the stone slabs, off the landing pad, out of the vegetable plot
// and out of the house. It is shared with the butterflies so they work the
// drifts rather than hovering over bare path.
//
// DISPOSAL. The ported modules keep module-level material caches, which outlive
// createCottage's dispose() — and re-entry is a real path, since
// cottageWalk.enterCottageWalk tears down before it builds. Each module takes a
// `sink` (the cottage's track()) at construction and drops it on dispose, so
// nothing it keeps survives into the next visit. Note that InstancedMesh
// .dispose() frees NEITHER geometry NOR material in three — it dispatches the
// event and frees morphTexture, nothing else — so track() really is the only
// thing standing between this and a leak per sun-dive.
import * as THREE from 'three';
import * as F from './cottage-flowers.js';
import * as V from './cottage-vegbeds.js';
import { createGardener } from './cottage-gardener.js';
import { createButterflies } from './cottage-butterflies.js';

/* ---------------------------------------------------------------- placement */
// The vegetable plot sits behind the cottage and off to +X. The offset is not
// decoration: the sun is over the +X shoulder, so the cottage throws its ridge
// ~13.5 u along (-0.85, -0.53) and a plot centred on x = 0 would spend the
// morning in its own house's shadow.
export const VEG = { cx: 1.6, cz: -10.6, hx: 5.45, hz: 3.8, gate: 0.9 };

// She stands clear of the +X shrub bed, on the lit side, turned away down the
// garden — you come down the path from the pad and see her back, which is what
// the figure is built for.
const HER = { x: 7.8, y: -0.03, z: 1.6, yaw: Math.PI + 0.28 };

const BOUQUET_TYPES = ['cosmos', 'daisy', 'queenannes', 'seedhead', 'cornflower', 'scabiosa'];

/**
 * Build the whole garden into `parent`.
 *
 * @param frame the cottage's own constants — HX/HZ, the pad, and pathX, so the
 *              exclusion zones are expressed in terms of the real layout rather
 *              than copies of its numbers that can drift out of step.
 */
export function createKitchenGarden({
  parent, rand, low = false, track, collide, frame,
}) {
  const { HX, HZ, PAD_Z, PAD_R, pathX, pathZ0, pathZ1 } = frame;
  const group = new THREE.Group();
  parent.add(group);

  F.useFlowerRandom(rand);
  F.useMaterialSink(track);
  V.useVegRandom(rand);
  V.useVegSink(track);

  /* ---------------------------------------------------------------- reject */
  const inVeg = (x, z) => Math.abs(x - VEG.cx) < VEG.hx + 0.3 && Math.abs(z - VEG.cz) < VEG.hz + 0.3;
  function reject(x, z) {
    if (Math.abs(x) < HX + 0.5 && Math.abs(z) < HZ + 0.5) return true;      // house + plinth
    if (Math.abs(x) < 1.8 && z > HZ && z < HZ + 1.6) return true;           // porch and steps
    if (x * x + (z - PAD_Z) * (z - PAD_Z) < (PAD_R + 1.5) * (PAD_R + 1.5)) return true;
    if (inVeg(x, z)) return true;
    if (Math.abs(z - 18) < 0.6) return true;                               // dry-stone wall
    const dx = x - HER.x, dz = z - HER.z;
    if (dx * dx + dz * dz < 0.45 * 0.45) return true;                      // her skirt
    if (z > pathZ0 - 0.7 && z < pathZ1 + 0.7) {
      // Invert the path: cottage.js lays its slabs at pathX(t * 1.35) for
      // t running 0..1 over [pathZ0, pathZ1]. Drop the 1.35 and flowers grow
      // straight through the stones the whole way to the pad.
      const t = (z - pathZ0) / (pathZ1 - pathZ0);
      if (Math.abs(x - pathX(t * 1.35)) < 1.0) return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- flowers */
  const protos = F.buildPrototypes({
    types: low
      ? ['daisy', 'cosmos', 'cornflower', 'scabiosa']
      : F.FLOWER_TYPES,
    variants: low ? 1 : 2,
    detail: low ? 0.5 : 0.7,
  });

  const s = low ? 0.45 : 1;
  const field = F.scatterFlowers({
    protos,
    reject,
    patches: [
      // Sampled as inner + (radius-inner)*u^falloff, not the source's sqrt:
      // uniform-by-area would put ~88% of the flowers past r=17, which is a
      // meadow with a bald patch where the garden should be.
      { cz: 0, inner: 5, radius: 18, count: Math.round(700 * s), clumps: 26, falloff: 0.55 },
      { cz: 0, inner: 18, radius: 46, count: Math.round(500 * s), clumps: 34, falloff: 0.7 },
      { cz: 12, inner: 1.2, radius: 6, count: Math.round(140 * s), clumps: 8 },
      { cz: 6.2, inner: 1.8, radius: 3.5, count: Math.round(90 * s), clumps: 5 },
      // The bed she is actually cutting from — tall stems only, so the heads
      // come up to the hand at the top of the reach.
      {
        cx: 7.4, cz: 1.2, inner: 0.3, radius: 1.5, count: 110, clumps: 5,
        types: F.TALL_TYPES, scale: 1.15,
      },
    ],
  });
  group.add(field);
  group.add(F.createBloomDots({
    inner: 12, radius: 46, count: low ? 1200 : 2400, reject,
  }));

  /* ---------------------------------------------------------------- veg plot */
  const cropTypes = low
    ? ['lettuce', 'cabbage', 'kale', 'onion']
    : ['lettuce', 'redlettuce', 'romaine', 'cabbage', 'broccoli', 'kale', 'chard', 'tomato', 'pepper', 'carrot', 'onion', 'seedling'];
  const cropProtos = V.buildCropPrototypes({
    types: cropTypes, variants: low ? 1 : 2, detail: low ? 0.6 : 0.85,
  });
  const plot = V.createBedPlot({
    protos: cropProtos, low,
    bedsPerRow: 3, rows: 3, bedX: 2.0, bedZ: 0.9,
    aisle: 1.35, pathWidth: 1.35, fencePad: 1.1, gateGap: VEG.gate,
    plan: ['lettuce', 'cabbage', 'broccoli', 'redlettuce', 'kale', 'tomato',
      'romaine', 'chard', 'pepper'],
  });
  plot.position.set(VEG.cx, 0, VEG.cz);
  group.add(plot);

  // Colliders. The walker reads nothing but these, and GROUND_SNAP is 1.2 —
  // without a box per bed it would climb onto the cedar and then drop through,
  // because floorYAt knows only three decks and none of them is a lettuce.
  for (const r of plot.userData.bedRects) collide(VEG.cx + r.x, VEG.cz + r.z, r.w, r.d);
  for (const r of plot.userData.fenceRects) collide(VEG.cx + r.x, VEG.cz + r.z, r.w, r.d);

  /* ---------------------------------------------------------------- gardener */
  const sprigGeo = F.buildSprig('cosmos', { detail: 0.7, height: 0.3 });
  const gardener = createGardener({
    rand, low, track,
    bouquet: { geo: sprigGeo, material: F.flowerMaterial(), max: 12 },
  });
  gardener.group.position.set(HER.x, HER.y, HER.z);
  gardener.group.rotation.y = HER.yaw;
  gardener.group.traverse((o) => {
    if (o.isMesh) { o.castShadow = !low; o.receiveShadow = false; }
  });
  group.add(gardener.group);
  collide(HER.x, HER.z, 0.9, 0.9);

  /* ---------------------------------------------------------------- butterflies */
  const flutter = createButterflies({
    count: low ? 14 : 34, reject, rand, track,
    inner: 3, radius: 30, y: [0.35, 2.1],
    extra: [{ x: HER.x - 0.5, z: HER.z + 0.4, r: 1.0 }, { x: HER.x + 0.6, z: HER.z - 0.6, r: 1.1 }],
  });
  group.add(flutter.group);

  /* ---------------------------------------------------------------- lifecycle */
  let alive = true;
  function update(dt, elapsed) {
    if (!alive) return;
    gardener.update(elapsed, dt, { cycle: 7.5 });
    flutter.update(dt, elapsed);
  }

  function dispose() {
    if (!alive) return;
    alive = false;
    gardener.dispose();
    flutter.dispose();
    // Everything else went through track() and is freed by the cottage. These
    // two calls drop the module-level caches so the next visit builds clean.
    F.disposeShared();
    V.disposeShared();
  }

  return { group, update, dispose, gardener, plot, inVeg, reject, bouquetTypes: BOUQUET_TYPES };
}

export default createKitchenGarden;
