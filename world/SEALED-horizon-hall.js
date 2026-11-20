// SEALED: the owner has not played this yet. Do not open.
//
// The archive's hall, inside (GDD 5.7.7): stage bell4, and the first decision.
//
// Seven records hang on stands round a well: the six worlds of the archive and
// the pilot's home. The ship can carry what is aboard through the port roof
// only as light, written into its hull, and the hull is full. One record has
// to be put down the well, and it does not come back.
//
// The reason given is real physics used as a reason (X6): the most a region
// can hold goes by the area of its surface, not its volume (the Bekenstein
// bound; the holographic principle), and quantum information cannot be copied
// (no-cloning). A ship that writes matter into its skin and reads it back is
// the story's.
//
// The one certain death of the chapter is here: to cross with every record
// kept. It puts the pilot back at the well, with nothing chosen.

import * as THREE from 'three';
import { C, CH_TIER, HZ_TAU } from '../src/constants.js';
import { Q } from '../src/quality.js';
import { cWalk } from '../src/capitalWalk.js';
import { chapterHud } from '../src/chapterHud.js';
import { isDialogueOpen } from '../src/dialogue.js';
import { uiSound } from '../src/sfx.js';
import { tint, cyl, mergedMesh } from './capital.js';
import { createLayerPlanet } from './layerplanet.js';
import { createPlace } from './holoplace.js';
import { setHum, logChime } from './entryzero-audio.js';
import { WORLDS, HOME } from './chapter-dialogue.js';
import { crewSpeaker } from './sceneClock.js';
import { createSky } from './SEALED-horizon-sky.js';
import { ease, facts, fits, makeSite, cellUniforms, cellMaterial, showClocks } from './SEALED-horizon-ship.js';
import { RECORDS, S4, S4B, DX1, HALL, AFTER_DEATH } from './SEALED-horizon-words.js';

const HR = 16, STAND_R = 10, WELL_R = 2.2, LIP = 28;
const DOOR = { x: 0, z: -HR + 2.2 };

export function createHall(ctx) {
  const { chapter, memo } = ctx;
  const time = { value: 0 };
  const group = new THREE.Group();
  group.visible = false;
  ctx.scene.add(group);
  const sky = createSky();
  group.add(sky.mesh);

  // the floor (open at the well), the wall of cells, the stands
  const floor = new THREE.Mesh(new THREE.RingGeometry(WELL_R, HR + 0.5, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x10161b, emissive: 0x05080a }));
  group.add(floor);
  const wallU = cellUniforms(time, 0.5);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(HR + 0.5, HR + 0.5, 11, 48, 1, true).translate(0, 5.5, 0), cellMaterial(wallU, THREE.BackSide));
  wall.frustumCulled = false;
  group.add(wall);
  const solid = [];
  const stands = RECORDS.map((rec, i) => {
    const a = (i / RECORDS.length) * Math.PI * 2 + 0.45;
    const x = Math.sin(a) * STAND_R, z = Math.cos(a) * STAND_R;
    solid.push(tint(cyl(0.5, 0.8, 1.1, x, 0.55, z, 12), 0x1c262d));
    const layers = i < WORLDS.length ? WORLDS[i].layers : HOME.layers;
    const planet = createLayerPlanet(1.5, { life: Q.tier === 'low' ? 0 : 120, seg: 32, seed: 1.7 + i * 2.9 });
    planet.setAll(layers);
    planet.revealAll(1);
    if (Q.tier === 'low') planet.reveal('life', 0);
    planet.group.position.set(x, 3.0, z);
    group.add(planet.group);
    return { rec, i, x, z, layers, planet };
  });
  solid.push(tint(cyl(1.6, 1.6, 0.12, DOOR.x, 0.06, DOOR.z, 24), 0x24313a));
  group.add(mergedMesh(solid, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x05080a })));
  // the lip of the well: a ring of the hull's cells, every one lit (one goes out)
  const lip = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.16, 0.34), new THREE.MeshBasicMaterial({ fog: false }), LIP);
  const _m = new THREE.Matrix4(), _c = new THREE.Color();
  for (let i = 0; i < LIP; i++) {
    const a = (i / LIP) * Math.PI * 2;
    lip.setMatrixAt(i, _m.makeTranslation(Math.sin(a) * (WELL_R + 0.3), 0.1, Math.cos(a) * (WELL_R + 0.3)));
    lip.setColorAt(i, _c.setHSL((i * 0.618) % 1, 0.7, 0.6));
  }
  group.add(lip);
  const doorGlow = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.07, 6, 36).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7fe6ff, fog: false }));
  doorGlow.position.set(DOOR.x, 0.16, DOOR.z);
  group.add(doorGlow);
  const place = createPlace(15);
  place.uniforms.uSpeed.value = 0.15;
  group.add(place.mesh);

  let local = 0, carried = -1, looking = -1, fallen = -1, dead = false, afterDeath = 0;
  const c1 = () => chapter.hz.get('c1');
  const chosen = () => typeof c1() === 'number';
  function setStands() {
    const gone = chosen() ? c1() : fallen;
    for (const s of stands) {
      s.planet.group.visible = s.i !== gone;
      if (s.i !== carried) {
        s.planet.group.position.set(s.x, 3.0, s.z);
        s.planet.group.scale.setScalar(1);
      }
    }
    lip.setColorAt(3, _c.setHSL(0.11, 0.7, gone >= 0 ? 0 : 0.6));
    lip.instanceColor.needsUpdate = true;
    doorGlow.material.color.setHex(gone >= 0 ? 0x7fe6ff : 0x33464f);
  }
  // what is said at a stand: the first line of its list that this crew would say
  function standTalk(s) {
    const f = facts(chapter);
    const line = HALL.look[s.i].find((l) => fits(chapter, l, f) && (chapter.crew().length || l.solo));
    const who = line && chapter.crew().length ? crewSpeaker(chapter, line.by) : null;
    looking = s.i;
    place.paint(s.layers, s.i * 7.31 + 1.3);
    return {
      speaker: who ? { name: who.name, species: who.species, cityId: 'The light ship' } : HALL.speaker,
      lines: [who ? line.text : line ? line.solo : s.rec.name],
      offer: chosen() ? undefined : { kind: 'choice', prompt: HALL.lift.prompt.replace('{NAME}', s.rec.name), options: HALL.lift.options.map((o) => ({ label: o.label, outcomeTag: `${o.outcomeTag}:${s.i}` })) },
    };
  }
  function putBack() {
    carried = -1;
    setStands();
  }
  function askWell() {
    const rec = RECORDS[carried];
    site.st.ask({ speaker: HALL.speaker, lines: HALL.put.lines, offer: { kind: 'choice', prompt: HALL.put.prompt.replace('{NAME}', rec.name), options: HALL.put.options } }, (tag) => {
      if (tag !== 'hz:c1:fall') return putBack();
      fallen = carried;
      chapter.hz.decide('c1', fallen);
      uiSound('engage');
      const p = stands[fallen].planet.group;
      site.st.play(S4B, C.HZ_S4B, {
        pose(u) {
          const k = ease(0.5, 9, u);
          p.position.set(0, 1.3 - 70 * k * k, 0);
          p.scale.setScalar(0.25 * (1 - 0.8 * k));
          p.visible = u < 9.5;
        },
        cam(pos, target) {
          pos.set(3.4, 5.5, 3.4);
          target.set(0, -6, 0);
        },
        onEnd() {
          carried = -1;
          setStands();
          logChime();
        },
      });
      return null;
    });
  }
  function askDoor() {
    site.st.ask({ speaker: HALL.speaker, lines: HALL.full.lines, offer: { kind: 'choice', prompt: HALL.full.prompt, options: HALL.full.options } }, (tag) => {
      if (tag !== 'hz:c1:keep') return null;
      // the old order, obeyed: nothing is put down, and nothing aboard is made light
      if (carried >= 0) putBack();
      chapter.hz.decide('c1', 'keep');
      dead = true;
      memo.died = 'full';
      site.st.play(DX1, C.HZ_DEATH_FULL, {
        pose(u) {
          wallU.uWhite.value = ease(3, 10, u);
          sky.U.uPort.value = 4 * ease(4, 10, u);
          chapterHud.white(ease(8.5, 11.5, u));
        },
        cam(pos, target) {
          pos.set(0, 4.5, 11);
          target.set(0, 2, -4);
        },
        onEnd() {
          site.portal = 'hz:back';
        },
      });
      return null;
    });
  }

  const consoles = stands.map((s) => ({
    x: s.x, y: 0, z: s.z, r: 2.4,
    get prompt() {
      return carried === s.i ? HALL.back : HALL.stand.replace('{NAME}', s.rec.name);
    },
    off: () => dead || (carried >= 0 && carried !== s.i) || (chosen() && c1() === s.i) || fallen === s.i,
    use: () => (carried === s.i ? (putBack(), null) : standTalk(s)),
  }));
  consoles.push({ x: 0, y: 0, z: 0, r: WELL_R + 1.7, prompt: HALL.well, off: () => dead || carried < 0 || chosen(), use: () => (askWell(), null) });
  consoles.push({ x: DOOR.x, y: 0, z: DOOR.z, r: 1.9, prompt: HALL.door, off: () => dead || fallen >= 0 && !chosen(), use: () => (chosen() ? (site.portal = 'hz:helm') : askDoor(), null) });

  const site = makeSite(ctx, {
    group,
    surfaces: [{ kind: 'disc', cx: 0, cz: 0, r: HR - 0.6, y: 0 }],
    colliders: [{ x: 0, z: 0, r: WELL_R + 0.5, top: Infinity }, ...stands.map((s) => ({ x: s.x, z: s.z, r: 1.0, top: Infinity }))],
    spawn: new THREE.Vector3(0, 0, 6),
    spawnYaw: Math.PI,
    consoles,
    light: [[0.2, 1, 0.3], [0.85, 0.9, 1.0], 1.1, [0.5, 0.55, 0.7], 0.7],
    enter() {
      local = 0;
      carried = looking = fallen = -1;
      dead = false;
      wallU.uWhite.value = 0;
      sky.U.uPort.value = 0;
      sky.fall(C.HZ_FALL - HZ_TAU[3]);
      place.mesh.visible = false;
      chapter.advance('hz_bell4');
      setStands();
      afterDeath = memo.died ? 1.5 : 0;
      if (!chosen() && chapter.hz.pending() !== 'c1') {
        site.st.play(S4, C.HZ_S4, {
          cam(pos, target, u) {
            const a = 0.5 + u * 0.03;
            pos.set(Math.sin(a) * 12.5, 6.2, Math.cos(a) * 12.5);
            target.set(0, 2.6, 0);
          },
          onEnd() {
            chapter.hz.offer('c1', 'hz:hall');
          },
        });
      }
    },
    tick(d, t) {
      time.value = t;
      local += d;
      sky.U.uTime.value = t;
      const w = site.st.walker();
      if (w) {
        sky.mesh.position.copy(w);
        place.mesh.position.copy(w);
      }
      setHum(0.25);
      const tau = HZ_TAU[3] + local;
      showClocks(tau, C.HZ_TO_ROOF - (tau - HZ_TAU[2]), true);
      const px = (window.innerHeight * Q.pixelRatio * 0.5) / Math.tan((C.FOV * Math.PI) / 360);
      for (const s of stands) {
        if (!s.planet.group.visible) continue;
        s.planet.group.rotation.y = t * 0.1 + s.i;
        s.planet.tick(t, px);
      }
      // the world a stand holds closes round the pilot while it is looked at
      const show = looking >= 0 && isDialogueOpen();
      if (!show) looking = -1;
      place.mesh.visible = show;
      place.uniforms.uTime.value = t;
      // a record lifted off its stand is carried at the hand
      if (carried >= 0 && w && !site.st.busy()) {
        const p = stands[carried].planet.group;
        p.position.set(w.x + Math.sin(cWalk.yaw) * 0.9, w.y + 1.3, w.z + Math.cos(cWalk.yaw) * 0.9);
        p.scale.setScalar(0.25);
      }
      if (afterDeath > 0 && (afterDeath -= d) <= 0) {
        site.st.say(AFTER_DEATH[memo.died] || AFTER_DEATH.chart, null, 8);
        memo.died = null;
      }
    },
    info: () => ({ place: 'hall', stage: chapter.stage(), c1: c1(), carried, fallen, pending: chapter.hz.pending(), dead, planets: stands.filter((s) => s.planet.group.visible).length, tierCells: CH_TIER[Q.tier].hzCells }),
    dbg: {
      talk: (i) => standTalk(stands[i]),
      lift(i) {
        if (dead || chosen() || !stands[i] || site.st.busy()) return false;
        carried = i;
        return true;
      },
      well: () => (carried >= 0 && !chosen() && !site.st.busy() ? (askWell(), true) : false),
      door: () => (site.st.busy() || dead ? false : chosen() ? ((site.portal = 'hz:helm'), true) : (askDoor(), true)),
    },
  });
  site.onChoice = (tag) => {
    const m = /^hz:lift:(\d)$/.exec(tag || '');
    if (m && !chosen()) {
      carried = Number(m[1]);
      chapterHud.say(HALL.lifted, 5);
      uiSound('engage');
    }
    return null;
  };
  return site;
}
