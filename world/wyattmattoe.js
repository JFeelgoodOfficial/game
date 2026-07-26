/**
 * wyattmattoe.js — the Highline Basecamp.
 *
 * A dedicated, registry-textured alpine scene for the snowboarder's planet:
 * a timber-and-granite lodge with a warm glass front, a fire ring on the
 * deck, board racks, and a gondola lift climbing the fall line on steel
 * lattice towers — staffed and visited by real people (world/people.js) in
 * linechaser parkas. ADDITIVE, not a total conversion: the pop-up city,
 * the snowboard, the Ridge Kites and the dressing all still spawn; this
 * module adds the place they'd all hang out.
 *
 * Coordinate conventions match city.js/creatures.js: everything is parented
 * to planet.surface and built in UNROTATED object space; the anchor group's
 * +Y aligns to the site's radial up. update() receives the player in this
 * module's anchor-local frame; the interaction surface follows
 * world/interaction.js.
 *
 * Site pick: a flattish shelf 100-140 m from the landing point, on a bearing
 * rotated away from the pop-up city probe (opts.avoidDir) so the two never
 * collide — the wonders already took the opposite bearing, so the basecamp
 * takes the perpendicular with the least slope.
 *
 * Materials come from the walk-session registry (opts.materials). The
 * registry owns what it hands out — nothing from it goes into `owned`.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createCrowd } from './people.js';

const _yAxis = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

const PARKAS = [0xff7a1a, 0x59d8e6, 0xe8f0f8, 0x5a6272, 0x2e4f42, 0xffb347];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWyattmattoe(planet, worldUp, opts = {}) {
  const materials = opts.materials ?? null;
  const rng = mulberry32(0x8a51de);
  const group = new THREE.Group();
  group.name = 'wyattmattoe-basecamp';
  const owned = []; // geometries + materials built here (never the registry's)

  const radius = planet.radius ?? 1050;
  const rotY = planet.surface?.rotation?.y ?? 0;
  const landUp = worldUp.clone().applyAxisAngle(_yAxis, -rotY).normalize();
  const groundAt = (dir) =>
    radius + (planet.body?.terrainAtLocal ? planet.body.terrainAtLocal(dir) : 0);

  /* --- Site probe: flattest shelf on the bearing band perpendicular to the
   * city (the wonders already hold the opposite bearing). --- */
  const ref = Math.abs(landUp.y) < 0.94 ? _yAxis : new THREE.Vector3(1, 0, 0);
  const t1 = new THREE.Vector3().crossVectors(landUp, ref).normalize();
  const t2 = new THREE.Vector3().crossVectors(landUp, t1).normalize();
  let cityBearing = null;
  if (opts.avoidDir) {
    const av = opts.avoidDir.clone().applyAxisAngle(_yAxis, -rotY).normalize();
    _v.subVectors(av, landUp);
    cityBearing = Math.atan2(_v.dot(t2), _v.dot(t1));
  }
  const slopeAt = (dir) => {
    const e = 3 / radius;
    const hx1 = groundAt(_v2.copy(dir).addScaledVector(t1, e).normalize());
    const hx0 = groundAt(_v2.copy(dir).addScaledVector(t1, -e).normalize());
    const hz1 = groundAt(_v2.copy(dir).addScaledVector(t2, e).normalize());
    const hz0 = groundAt(_v2.copy(dir).addScaledVector(t2, -e).normalize());
    return Math.hypot(hx1 - hx0, hz1 - hz0) / 6;
  };
  let siteDir = null;
  let bestSlope = Infinity;
  const baseBearing = cityBearing !== null ? cityBearing + Math.PI / 2 : rng() * Math.PI * 2;
  for (let k = 0; k < 10; k++) {
    const bearing = baseBearing + (k % 2 ? 1 : -1) * Math.floor(k / 2) * 0.35;
    for (const dist of [100, 120, 140]) {
      const span = dist / radius;
      _v.copy(landUp)
        .addScaledVector(t1, Math.cos(bearing) * span)
        .addScaledVector(t2, Math.sin(bearing) * span)
        .normalize();
      const s = slopeAt(_v);
      if (s < bestSlope) {
        bestSlope = s;
        siteDir = _v.clone();
      }
      if (s < 0.14) break;
    }
    if (bestSlope < 0.14) break;
  }
  const siteR = groundAt(siteDir);
  const anchor = new THREE.Group();
  anchor.position.copy(siteDir).multiplyScalar(siteR + 0.05);
  anchor.quaternion.setFromUnitVectors(_yAxis, siteDir);
  // Face the deck (+Z) back toward the landing point.
  _v.subVectors(landUp, siteDir).applyQuaternion(_q.copy(anchor.quaternion).invert());
  anchor.rotateY(Math.atan2(_v.x, _v.z));
  group.add(anchor);

  /* --- Materials -------------------------------------------------------- */
  const mk = (fallback, family, o = {}) => {
    if (materials) return materials.make(family, o);
    const m = new THREE.MeshStandardMaterial({ color: o.color ?? fallback, roughness: o.roughness ?? 0.9 });
    owned.push(m);
    return m;
  };
  const timber = mk(0x6b4a2f, 'wood', { repeat: 2, color: 0x9a7a55, roughness: 0.8 });
  const plinth = mk(0x5a616e, 'stone', { repeat: 2, roughness: 0.9 });
  const steel = mk(0x4a4f58, 'steel', { repeat: 2, color: 0xb8bec8, roughness: 0.5, metalness: 0.7 });
  const snowPack = mk(0xeef4fb, 'groundCover', { repeat: 3, color: 0xeef4fb, roughness: 0.85 });
  const deckWood = mk(0x7a5a3a, 'wood', { repeat: 3, color: 0x8a6a48, roughness: 0.85 });

  const emberMat = new THREE.MeshStandardMaterial({
    color: 0x2a160a,
    emissive: new THREE.Color(0xff7a2a),
    emissiveIntensity: 1.4,
  });
  owned.push(emberMat);
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x241a10,
    emissive: new THREE.Color(0xffc87a),
    emissiveIntensity: 1.1,
  });
  owned.push(windowMat);
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6 });
  owned.push(accentMat);

  const addMesh = (geo, mat, x, y, z, ry = 0) => {
    owned.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    anchor.add(m);
    return m;
  };

  /* --- Terrace pad: packed snow over a stone rim ------------------------ */
  addMesh(new THREE.CylinderGeometry(15, 15.8, 0.5, 28), plinth, 0, -0.05, 0);
  addMesh(new THREE.CylinderGeometry(14.6, 14.6, 0.36, 28), snowPack, 0, 0.14, 0);
  const PAD_Y = 0.32; // walking surface of the pad

  /* --- Lodge: granite plinth, timber walls, gabled roof, warm glass ----- */
  const lodge = new THREE.Group();
  lodge.position.set(0, PAD_Y, -6.5);
  anchor.add(lodge);
  const addLodge = (geo, mat, x, y, z, rx = 0, rz = 0) => {
    owned.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.rotation.z = rz;
    m.castShadow = true;
    m.receiveShadow = true;
    lodge.add(m);
    return m;
  };
  addLodge(new THREE.BoxGeometry(11, 0.9, 7.5), plinth, 0, 0.45, 0);
  addLodge(new THREE.BoxGeometry(10.2, 3.1, 6.8), timber, 0, 2.4, 0);
  // Gabled roof: two pitched slabs meeting at a ridge along X.
  const roofL = new THREE.BoxGeometry(11.4, 0.22, 4.4);
  const roofR = new THREE.BoxGeometry(11.4, 0.22, 4.4);
  addLodge(roofL, timber, 0, 4.9, -1.85, 0.62, 0);
  addLodge(roofR, timber, 0, 4.9, 1.85, -0.62, 0);
  addLodge(new THREE.BoxGeometry(0.8, 1.6, 0.8), plinth, -3.6, 5.6, 0); // chimney
  // Glass front (deck side, +Z): pane + warm scrim, the registry's two-layer
  // pattern when available.
  const glassGeo = new THREE.PlaneGeometry(8.6, 2.2);
  owned.push(glassGeo);
  if (materials) {
    const g = materials.glassFor(0xffb347);
    const pane = new THREE.Mesh(glassGeo, g.pane);
    pane.position.set(0, 2.5, 3.42);
    lodge.add(pane);
    const scrim = new THREE.Mesh(glassGeo, g.scrim);
    scrim.position.set(0, 2.5, 3.41);
    lodge.add(scrim);
  }
  // Interior glow strips behind the glass — the warmth you see from outside.
  const glowGeo = new THREE.PlaneGeometry(8.2, 1.8);
  owned.push(glowGeo);
  const glow = new THREE.Mesh(glowGeo, windowMat);
  glow.position.set(0, 2.4, 3.35);
  lodge.add(glow);

  /* --- Deck, fire ring, board racks ------------------------------------- */
  addMesh(new THREE.BoxGeometry(11, 0.3, 5), deckWood, 0, PAD_Y + 0.05, 0.6);
  // Fire ring on the open pad, forward of the deck.
  addMesh(new THREE.CylinderGeometry(1.15, 1.3, 0.5, 12), plinth, 4.5, PAD_Y + 0.25, 5.2);
  const ember = addMesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 12), emberMat, 4.5, PAD_Y + 0.52, 5.2);
  // Board racks: leaning decks in linechaser tints.
  for (let i = 0; i < 6; i++) {
    const bg = new THREE.BoxGeometry(0.34, 1.5, 0.07);
    owned.push(bg);
    const bm = new THREE.Mesh(bg, i % 2 ? accentMat : steel);
    bm.position.set(-5.2 + i * 0.5, PAD_Y + 0.75, 3.6);
    bm.rotation.x = -0.22;
    bm.castShadow = true;
    anchor.add(bm);
  }
  // Snow drifts against the lodge.
  for (let i = 0; i < 4; i++) {
    const dg = new THREE.IcosahedronGeometry(1.1 + rng() * 0.8, 1);
    dg.scale(1.4, 0.5, 1.2);
    owned.push(dg);
    const dm = new THREE.Mesh(dg, snowPack);
    dm.position.set(-5 + i * 3.4, PAD_Y + 0.15, -9.6 - rng() * 0.6);
    dm.receiveShadow = true;
    anchor.add(dm);
  }

  /* --- The lift: lattice towers up the fall line, cable, gondolas ------- */
  // Towers march away from the pad on the uphill bearing (local -X side),
  // each footed on the real terrain.
  const towerBase = [];
  const invAnchorQ = anchor.quaternion.clone().invert();
  const anchorPos = anchor.position.clone();
  const towerGeoParts = [];
  const cablePts = [];
  for (let i = 0; i < 4; i++) {
    const dist = 14 + i * 22;
    // uphill = local -X in anchor frame -> surface-local dir
    _v.set(-dist, 0, -4 - i * 2).applyQuaternion(anchor.quaternion).add(anchorPos);
    const dir = _v.clone().normalize();
    const r = groundAt(dir);
    // back into anchor-local
    _v.copy(dir).multiplyScalar(r).sub(anchorPos).applyQuaternion(invAnchorQ);
    towerBase.push(_v.clone());
    const h = 7 + i * 1.2;
    const leg = new THREE.CylinderGeometry(0.16, 0.24, h, 6);
    leg.translate(_v.x, _v.y + h / 2, _v.z);
    towerGeoParts.push(leg);
    const arm = new THREE.BoxGeometry(2.6, 0.18, 0.18);
    arm.translate(_v.x, _v.y + h, _v.z);
    towerGeoParts.push(arm);
    cablePts.push(new THREE.Vector3(_v.x, _v.y + h + 0.15, _v.z));
  }
  // Cable starts at the lodge-side terminal.
  cablePts.unshift(new THREE.Vector3(6.5, PAD_Y + 4.2, -3));
  const terminal = new THREE.BoxGeometry(2.6, 4.4, 2.2);
  addMesh(terminal, steel, 6.5, PAD_Y + 2.2, -3);
  const towerFlat = towerGeoParts.map((g) => (g.index ? g.toNonIndexed() : g));
  const towersGeo = mergeGeometries(towerFlat, false);
  towerFlat.forEach((g) => g.dispose());
  owned.push(towersGeo);
  const towers = new THREE.Mesh(towersGeo, steel);
  towers.castShadow = true;
  anchor.add(towers);
  const cableCurve = new THREE.CatmullRomCurve3(cablePts);
  const cableGeo = new THREE.TubeGeometry(cableCurve, 40, 0.05, 5, false);
  owned.push(cableGeo);
  const cable = new THREE.Mesh(cableGeo, steel);
  anchor.add(cable);
  // Gondola cabins ping-pong along the cable.
  const cabins = [];
  const cabinGeo = new THREE.BoxGeometry(1.1, 1.2, 1.1);
  owned.push(cabinGeo);
  for (let i = 0; i < 4; i++) {
    const cab = new THREE.Mesh(cabinGeo, i % 2 ? accentMat : steel);
    cab.castShadow = true;
    anchor.add(cab);
    cabins.push({ mesh: cab, u: i / 4, dirSign: i % 2 ? 1 : -1, speed: 0.014 + rng() * 0.006 });
  }

  /* --- People: riders and staff around the fire, deck and lift queue ---- */
  const spots = [];
  // fire ring circle
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    spots.push({ x: 4.5 + Math.cos(a) * 2.1, z: 5.2 + Math.sin(a) * 2.1, face: Math.atan2(4.5 - (4.5 + Math.cos(a) * 2.1), 5.2 - (5.2 + Math.sin(a) * 2.1)) });
  }
  // deck loungers
  for (let i = 0; i < 4; i++) {
    spots.push({ x: -3.5 + i * 2.2, z: 1.2 + (rng() - 0.5), face: Math.PI + (rng() - 0.5) * 0.8 });
  }
  // lift queue
  for (let i = 0; i < 3; i++) {
    spots.push({ x: 4.6 - i * 1.1, z: -2.6 - i * 0.6, face: 0.6 });
  }
  // the two named hosts stand at fixed spots
  const KEEPER_SPOT = { x: -1.2, z: 2.9, face: Math.PI };
  const OPERATOR_SPOT = { x: 6.0, z: -1.4, face: 0.4 };
  spots.push(KEEPER_SPOT, OPERATOR_SPOT);

  let crowd = null;
  if (materials) {
    crowd = createCrowd({
      count: spots.length,
      rng: mulberry32(0x77a3c1),
      materials,
      place: (i) => {
        const s = spots[i];
        _v.set(s.x, PAD_Y, s.z);
        _q.setFromAxisAngle(_yAxis, s.face);
        return { pos: _v, quat: _q };
      },
      cloth: (r) => PARKAS[Math.floor(r * PARKAS.length)],
      maxRigs: 8,
    });
    anchor.add(crowd.group);
  }

  /* --- Named interactables ---------------------------------------------- */
  const keeper = {
    id: 'lodge-keeper',
    name: 'Maren, Lodge Keeper',
    pos: new THREE.Vector3(KEEPER_SPOT.x, PAD_Y, KEEPER_SPOT.z),
    seed: 0x11a,
    _talking: false,
  };
  const operator = {
    id: 'lift-operator',
    name: 'Vasko, Lift Operator',
    pos: new THREE.Vector3(OPERATOR_SPOT.x, PAD_Y, OPERATOR_SPOT.z),
    seed: 0x22b,
    _talking: false,
  };
  // Positions are anchor-local; the host's playerLocal is group-local — the
  // anchor sits inside `group` with its own transform, so precompute the
  // entity positions in GROUP-local space for the distance scan.
  for (const e of [keeper, operator]) {
    e.pos.applyQuaternion(anchor.quaternion).add(anchor.position);
  }

  function nearestInteractable(playerPos, maxDist = 5) {
    let best = null;
    let bestD2 = maxDist * maxDist;
    for (const e of [keeper, operator]) {
      const d2 = e.pos.distanceToSquared(playerPos);
      if (d2 < bestD2) { bestD2 = d2; best = e; }
    }
    return best;
  }

  function interact(entity) {
    entity._talking = true;
    if (entity === keeper) {
      return {
        speaker: { name: keeper.name, species: 'human', cityId: 'wyattmattoe' },
        lines: [
          'Kettle\'s on. Boards on the rack, boots by the fire — you know the drill.',
          'The linechasers came down off the north couloir at noon, grinning like the mountain owed them money.',
          'If you ride past dark, keep an eye out for the Ridge Kites. They\'ll fly your line with you if they like the look of it.',
        ],
        offer: { kind: 'codex', subject: 'The Highline Basecamp' },
      };
    }
    return {
      speaker: { name: operator.name, species: 'human', cityId: 'wyattmattoe' },
      lines: [
        'Cable\'s singing today — wind\'s out of the canyon, so she hums a third higher.',
        'Top station opens onto the long fall line. Straight run, no cliffs, if you hold the crest.',
        'B drops the board. Everything else the mountain teaches you on the way down.',
      ],
      offer: { kind: 'codex', subject: 'The Highline Gondola' },
    };
  }

  function endInteract(entity) {
    if (entity) entity._talking = false;
  }

  /* --- Per-frame --------------------------------------------------------- */
  const _cabPos = new THREE.Vector3();
  function update(t, dt, playerLocal, sunDot) {
    const night = 1 - Math.max(sunDot, 0);
    // Fire flickers; windows come up as the light goes down.
    ember.material.emissiveIntensity = 1.1 + Math.sin(t * 7.3) * 0.25 + Math.sin(t * 13.7) * 0.15;
    windowMat.emissiveIntensity = 0.5 + night * 1.1;
    // Gondolas ping-pong along the cable, hanging under it.
    for (const c of cabins) {
      c.u += c.dirSign * c.speed * dt * 60 * 0.016;
      if (c.u > 0.98) { c.u = 0.98; c.dirSign = -1; }
      if (c.u < 0.02) { c.u = 0.02; c.dirSign = 1; }
      cableCurve.getPointAt(c.u, _cabPos);
      c.mesh.position.set(_cabPos.x, _cabPos.y - 0.85, _cabPos.z);
    }
    if (crowd) {
      // The crowd lives in anchor-local space; bring the player across.
      _v2.copy(playerLocal).sub(anchor.position).applyQuaternion(invAnchorQ);
      crowd.update(t, dt, _v2);
    }
  }

  function dispose() {
    if (crowd) crowd.dispose();
    for (const o of owned) { try { o.dispose(); } catch (e) { /* shared */ } }
    owned.length = 0;
    group.clear();
  }

  return {
    group,
    update,
    nearestInteractable,
    interact,
    endInteract,
    dispose,
    // Verification handles.
    get crowd() { return crowd; },
    site: { dir: siteDir, slope: bestSlope },
  };
}
