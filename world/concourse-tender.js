// The Low Tender: the top end of a tick mine (GDD 5.7.9; Season 1, chapter 4).
//
// A pad, a walk, a winch house, and a cable going down toward the neutron
// star. At the cable's lower end machines run where clocks run slow.
//
// The science. Real: a clock deep in a gravity well runs slow against one
// outside it (gravitational time dilation; at a neutron star's surface it is
// tens of per cent, where at the Sun's it is two parts in a million). A
// machine lowered there and hauled back has lived less time than the winch
// that hauled it. Past known physics: that the difference can be banked,
// carried and spent. That is the port's fiction, and its money.
//
// A site for the platform walker (src/capitalWalk.js), docked at by the
// freighter. `S` is the system's story (world/concourse-system.js).

import * as THREE from 'three';
import { sun } from '../src/sun.js';
import { chapterHud } from '../src/chapterHud.js';
import { isDialogueOpen } from '../src/dialogue.js';
import { uiSound } from '../src/sfx.js';
import { tint, box, cyl, mergedMesh, floorOf } from './capital.js';
import { buildRig, poseRig } from './aliens.js';
import { measureRig, standRig } from './rigGround.js';
import { crewSay } from './sceneClock.js';
import { createCrewFollow } from './crewFollow.js';
import { CONC } from './concourse-dialogue.js';

const ZERO = new THREE.Vector3();
const SNAP = 1.2;
const PAD_Z = 34, PAD_R = 22, WAY_HW = 5, HOUSE_Z = -38;
const BOSS = [4, HOUSE_Z + 9], STORES = [-5, HOUSE_Z + 8];

export function createConcourseTender(ctx, S) {
  const { chapter } = ctx;
  const group = new THREE.Group();
  const surfaces = [], colliders = [];
  {
    const lit = [], glow = [];
    lit.push(tint(cyl(PAD_R + 2, PAD_R + 4, 2, 0, -1, PAD_Z, 32), 0x3a3430), tint(cyl(PAD_R, PAD_R, 0.14, 0, 0.07, PAD_Z, 32), 0x5a5048));
    surfaces.push({ kind: 'disc', cx: 0, cz: PAD_Z, r: PAD_R + 1.6, y: 0.14 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      glow.push(tint(box(0.8, 0.12, 0.8, Math.cos(a) * (PAD_R + 0.6), 0.16, PAD_Z + Math.sin(a) * (PAD_R + 0.6)), 0xff9a4a, 1.5));
    }
    const z0 = PAD_Z - PAD_R + 2, z1 = HOUSE_Z - 4;
    lit.push(tint(box(WAY_HW * 2 + 12, 1.4, z0 - z1, 0, -0.56, (z0 + z1) / 2), 0x3a3430));
    surfaces.push({ kind: 'rect', cx: 0, cz: (z0 + z1) / 2, ux: 0, uz: 1, hl: (z0 - z1) / 2, hw: WAY_HW + 5, yA: 0.14, yB: 0.14 });
    // the winch house, and the drum the cable comes off
    lit.push(tint(box(20, 9, 8, 0, 4.5, HOUSE_Z - 6), 0x2a2622), tint(new THREE.CylinderGeometry(5, 5, 12, 20).rotateZ(Math.PI / 2).translate(0, 11, HOUSE_Z - 6), 0x4a4038));
    glow.push(tint(box(14, 0.5, 0.12, 0, 7.4, HOUSE_Z - 1.9), 0xff9a4a, 1.5));
    // the stores: crates, under a lamp
    for (const [x, y, w] of [[-7, 0.9, 1.8], [-4.6, 0.7, 1.4], [-6, 2.4, 1.2], [-8.6, 0.6, 1.2]]) lit.push(tint(box(w, w, w, x, y, HOUSE_Z + 4), 0x6a5a48));
    glow.push(tint(box(0.3, 0.3, 0.3, -6, 4.2, HOUSE_Z + 4), 0xfff0c8, 1.5));
    colliders.push({ x: -6.4, z: HOUSE_Z + 4, r: 2.6, top: Infinity });
    group.add(mergedMesh(lit, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x17130d })));
    group.add(mergedMesh(glow, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  }
  // the cable: down, toward the star, further than can be seen
  const DOWN = new THREE.Vector3(-0.2, -0.95, -0.24).normalize();
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 60000, 6).translate(0, -30000, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.8, 0.45), fog: false }));
  cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), DOWN);
  cable.position.set(0, 6, HOUSE_Z - 6);
  cable.frustumCulled = false;
  group.add(cable);
  // a light running down it: something being sent to where the clocks go wrong
  const car = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.6, 1), fog: false }));
  group.add(car);

  const boss = measureRig(buildRig(0xb055, 'concourse'));
  boss.group.scale.setScalar(1.1);
  boss.group.position.set(BOSS[0], 0.14, BOSS[1]);
  group.add(boss.group);
  const crew = createCrewFollow({
    group, floorY: 0.14,
    talk: (c) => ({ speaker: { name: c.name, species: c.species, cityId: CONC.tender.city }, lines: CONC.ground[c.id].early, cine: true }),
  });

  let walker = null, walkerLive = null, inside = false, prev = null, since = -1, said = -1, panelText = null;
  const later = [];
  const say = (line, sec) => crewSay(chapter, line, sec);
  const lines = (l) => ({ speaker: CONC.foreman, lines: l, cine: true });

  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: ctx.sunDir },
    surfaces,
    colliders,
    floorYAt: floorOf(surfaces, SNAP),
    snap: SNAP,
    pad: new THREE.Vector3(0, 0.14, PAD_Z),
    padR: PAD_R,
    spawn: new THREE.Vector3(8, 0.14, PAD_Z - 7),
    leaveHint: CONC.tender.leaveHint,
    npcs: [
      {
        x: BOSS[0], y: 0.14, z: BOSS[1], h: 2.8,
        talk() {
          const st = S.st4();
          if (st !== 'met' && st !== 'hauled') return lines(S.reached4('paid') ? CONC.foremanAfter : [CONC.deliver[0]]);
          // (delivered, and the question left unanswered: it is put again, shorter)
          const again = st === 'hauled';
          if (!again) S.deliver();
          return { ...lines(again ? CONC.deliver.slice(2) : CONC.deliver), offer: { kind: 'choice', prompt: CONC.fee.prompt, options: [{ label: CONC.fee.keep, outcomeTag: 'conc:keep' }, { label: CONC.fee.split, outcomeTag: 'conc:split' }] } };
        },
      },
      ...crew.npcs,
    ],
    consoles: [{ x: STORES[0], y: 0.14, z: STORES[1], r: 3, prompt: CONC.prompts.market, off: () => !S.reached4('paid'), use: () => (S.market('tender'), null) }],
    portal: null,
    onChoice(tag) {
      const option = tag === 'conc:keep' ? 'keep' : tag === 'conc:split' ? 'split' : null;
      if (!option || !S.payFee(option)) return null;
      uiSound('engage');
      later.push(CONC.feeCrew[option]);
      return lines(option === 'keep' ? CONC.kept : CONC.split);
    },
    mark: () => (S.st4() === 'met' || S.st4() === 'hauled' ? { x: BOSS[0], z: BOSS[1], label: CONC.marks.foreman } : null),
    setWalker(p, live) {
      walker = p || null;
      walkerLive = p ? live || null : null;
    },
    onEnter() {
      if (inside) return;
      inside = true;
      site.portal = null;
      prev = { ambColor: sun.ambient.color.clone(), ambI: sun.ambient.intensity };
      sun.ambient.color.setRGB(0.9, 0.75, 0.65);
      sun.ambient.intensity = 0.9;
      since = S.reached4('hauled') ? -1 : 0;
      said = -1;
      later.length = 0;
      panelText = null;
      crew.set(ctx.voyage.crew());
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      crew.set([]);
      chapterHud.clear();
      chapterHud.panel(null);
      panelText = null;
      sun.ambient.color.copy(prev.ambColor);
      sun.ambient.intensity = prev.ambI;
      prev = null;
    },
    inside: () => inside,
    update(dt, t) {
      const u = (t * 0.035) % 1;
      car.position.copy(cable.position).addScaledVector(DOWN, 4 + u * u * 2600);
      car.scale.setScalar(1 + u * 5);
    },
    tick(dt, t) {
      chapterHud.tick(dt);
      const d = Math.min(dt, 0.1);
      if (!walker) return;
      const near = Math.hypot(walker.x - BOSS[0], walker.z - BOSS[1]) < 9;
      boss.group.rotation.y = near ? Math.atan2(walker.x - BOSS[0], walker.z - BOSS[1]) : 0;
      poseRig(boss, d, t, 'idle', 0);
      standRig(boss, 0.14);
      if (since >= 0 && !isDialogueOpen()) {
        since += d;
        while (said + 1 < CONC.tenderArrive.length && since >= CONC.tenderArrive[said + 1][0]) say(CONC.tenderArrive[++said][1], 8);
      }
      if (later.length && !isDialogueOpen() && chapterHud.state().line == null) say(later.shift(), 7);
      crew.tick(dt, t, walkerLive);
      const text = S.panel('tender');
      if (text !== panelText) chapterHud.panel((panelText = text));
    },
    places: { pad: [8, PAD_Z - 7], boss: [BOSS[0] + 2.4, BOSS[1] + 1.6], stores: STORES },
    info: () => ({ inside, panel: panelText }),
  };
  return site;
}
