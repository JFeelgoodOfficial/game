// The Vault: Season 1, chapter 11 (GDD 5.7.9; plans/season-1-arc.md).
//
// The free port's outer ring has fallen, and the people who lived on it are on
// the deck. The port cannot pay to house them. Both ways of paying come out of
// the light ship's archive, and both are permanent.
//
// It is played in the port's system, as chapters 4 and 5 are (world/
// concourse-system.js): this file is a guest of that system (`S.guest`), with
// a stage machine of its own, and of the light ship's archive (`aboard`).
//
//   idle       not begun
//   forecast   the fixed event's forecast has been shown: they need a home
//   asked      the dockmaster has put the two offers; what is on the table is settled
//   walked     the pilot has walked it once more (the holodeck program; or, with
//              a captain lost, read that captain's record in the archive)
//   decided    chosen (`ch11.choice`), and the fixed event resolved
//   done       the ring's people have gone to where they are to live
//
// Two cases, and how they map. With every captain alive, a WORLD is on the
// table: the pilot picks which of the archive's worlds, walks its program,
// and chooses SELL (`sold`: the port buys it; it is shut in the holodeck for
// good) or RECOMPILE (`recompiled`: the ship makes it real, it is the
// refugees', and it is shut in the holodeck for good). With a captain lost, a
// PERSON is on the table instead (the first lost, in the roster's order): the
// port wants proof that recompiling works before it stakes four thousand
// lives on it, and the one complete record small enough to prove it on is
// that captain's. RECOMPILE THEM (`friend`: the port pays for the housing on
// the strength of it) or LET THEM REST (`rest`: the ring's people go to the
// lower docks, on credit). No world is lost in that case: `ch11.world` is null.
//
// What "made real" amounts to here: a recompiled world is a body in the port's
// sky from then on, its holodeck row is shut, and the crew say so. It cannot
// be flown to or landed on yet. A recompiled captain is a season fact
// (`ch11.friend`) for a later chapter to stand in their quarters: `chapter.
// lost()` is not changed, so every scene written for who is aboard still
// counts them as gone.
//
// Nothing here can kill the pilot, so the decision is survived as it is made
// (src/season.js).
//
// Past known physics: all of it. Recompiling a world, or a person, from a
// record is the Tenretni's art, and the saga's invention.

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { chapterHud } from '../src/chapterHud.js';
import { openDialogue, isDialogueOpen } from '../src/dialogue.js';
import { mulberry32 } from '../src/noise2.js';
import { uiSound } from '../src/sfx.js';
import { tint, box, mergedMesh } from './capital.js';
import { buildRig, poseRig } from './aliens.js';
import { measureRig, standRig } from './rigGround.js';
import { createSceneClock, crewSay } from './sceneClock.js';
import { CAPTAINS } from './chapter-dialogue.js';
import { CONC } from './concourse-dialogue.js';
import { VAULT } from './vault-dialogue.js';

export const VAULT_STAGES = ['idle', 'forecast', 'asked', 'walked', 'decided', 'done'];
const KEY = 'ch11.choice';
const HOWS = ['sold', 'recompiled', 'friend', 'rest'];
const CAMP = [38, 70]; // where the ring's people are, on the deck
const AWAY = { sold: [0, -100], recompiled: [0, 92], friend: [0, -100], rest: [-44, -84] }; // where they go: the inner rings, the boats, the lower-dock hatch
const SKY = new THREE.Vector3(0.66, 0.36, -0.66).normalize(); // where a recompiled world stands in the port's sky
const RECORD_AT = [-3.7, 25]; // in the archive, across the walk from the holodeck's plinth
const ease = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

// ctx: the system's. S: its story (world/concourse-system.js). hub: its deck (world/concourse-hub.js).
export function createVault(ctx, S, hub) {
  const { chapter, season, fixed } = ctx;
  let st = 'idle';
  let world = null; // the archive's id for the world on the table (the holodeck catalogue's)
  let label = null; // ...and what it is called
  let friend = null; // or the lost captain the question is about
  const at = (s) => VAULT_STAGES.indexOf(s);
  const reached = (s) => at(st) >= at(s);
  const advance = (to) => {
    if (at(to) <= at(st)) return false;
    st = to;
    ctx.save();
    return true;
  };
  const how = () => season.get(KEY);
  const friendName = () => (CAPTAINS.find((c) => c.id === friend) || {}).name || '';
  // (a line written in capitals gets the name in capitals; a spoken one gets it as it is said)
  const title = (s) => String(s || '').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  const fmt = (s) => {
    const bare = String(s).replace(/\{\w+\}/g, '');
    const caps = bare === bare.toUpperCase();
    return String(s).replace(/\{world\}/g, caps ? label || '' : title(label)).replace(/\{friend\}/g, caps ? friendName().toUpperCase() : friendName());
  };
  const fmtLine = (l) => (l && l.by !== undefined ? { ...l, text: l.text && fmt(l.text), solo: l.solo && fmt(l.solo), other: l.other && Object.fromEntries(Object.entries(l.other).map(([k, v]) => [k, fmt(v)])) } : l);
  const say = (line, sec) => crewSay(chapter, fmtLine(line), sec);
  // the archive's worlds that can still be walked: what can be put on the table
  const worlds = () => (ctx.voyage.archive ? ctx.voyage.archive() : []).filter((r) => r.kind === 'world' && r.unlocked);
  const lostOne = () => (CAPTAINS.find((c) => chapter.lost(c.id)) || {}).id || null;

  // --- the ring's people, on the deck ---
  const camp = new THREE.Group();
  const people = [];
  {
    const rng = mulberry32(0x7a017);
    const lit = [];
    for (let i = 0; i < Math.round(C.VAULT_PEOPLE); i++) {
      const x = CAMP[0] + (rng() * 2 - 1) * 13, z = CAMP[1] + (rng() * 2 - 1) * 13;
      const rig = measureRig(buildRig(0x9000 + i * 5413, 'concourse'));
      rig.group.scale.setScalar(i % 4 === 3 ? 0.62 : 0.84 + rng() * 0.2); // (some of them are small)
      rig.group.position.set(x, 0, z);
      rig.group.rotation.y = rng() * 6.28;
      camp.add(rig.group);
      people.push({ rig, x, z, yaw: rig.group.rotation.y, lag: rng() * 5 });
      // what they carried off the ring: a roll, a box
      if (i % 2 === 0) lit.push(tint(box(1.6, 0.3, 0.7, x + 1.1, 0.15, z + 0.4, rng() * 3), [0x6a5a7a, 0x7a6a4a, 0x4a6a6a][i % 3]));
      else lit.push(tint(box(0.7, 0.6, 0.7, x - 0.9, 0.3, z + 0.6, rng() * 3), 0x5a4a3a));
    }
    camp.add(mergedMesh(lit, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x10131a })));
  }
  camp.visible = false;
  hub.group.add(camp);
  // a recompiled world: a body in this sky that was a record
  const newWorld = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), new THREE.MeshLambertMaterial({ color: 0x6aa8c8, emissive: 0x0a1a24 }));
  const cloud = new THREE.Mesh(new THREE.SphereGeometry(1.012, 40, 28), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 }));
  newWorld.add(cloud);
  newWorld.position.copy(SKY).multiplyScalar(C.VAULT_WORLD_DIST);
  newWorld.visible = false;
  newWorld.frustumCulled = cloud.frustumCulled = false;
  hub.group.add(newWorld);
  const showWorld = (k) => {
    newWorld.visible = k > 0.001;
    newWorld.scale.setScalar(C.VAULT_WORLD_R * Math.max(0.001, k));
  };

  // --- the end: they go to where they are to live ---
  let scene = null, pendingEnd = false, forecastOpen = false, saidWalked = false;
  let endClock = null;
  function beginEnd() {
    const h = how();
    if (!HOWS.includes(h)) return false;
    const to = AWAY[h];
    endClock = createSceneClock({
      T: C.VAULT_END_T, lines: VAULT.end[h].map(([s, l]) => [s, fmtLine({ ...l, text: l.text && fmt(l.text) })]), say: (l) => crewSay(chapter, l, 6.5),
      pose(u) {
        for (const p of people) {
          const k = ease(3 + p.lag, C.VAULT_END_T - 2 + p.lag * 0.4, u);
          const g = p.rig.group;
          g.position.x = p.x + (to[0] - p.x) * k;
          g.position.z = p.z + (to[1] - p.z) * k;
          g.rotation.y = k > 0 && k < 1 ? Math.atan2(to[0] - p.x, to[1] - p.z) : p.yaw;
          p.moving = k > 0.001 && k < 0.999;
        }
        if (h === 'recompiled') showWorld(ease(1, 9, u));
      },
      onEnd() {
        scene = null;
        chapterHud.cine(false);
        camp.visible = false;
        advance('done');
      },
    });
    scene = { clock: endClock };
    chapterHud.panel(null);
    chapterHud.cine(true);
    endClock.begin();
    return true;
  }

  // --- the dockmaster ---
  const lines = (l) => ({ speaker: CONC.dockmaster, lines: l.map(fmt), cine: true });
  function settle(id) {
    // what is on the table: a person, if one was lost; else the world that was picked
    friend = lostOne();
    if (friend) {
      world = label = null;
    } else {
      const row = worlds().find((r) => r.id === id);
      if (!row) return false;
      world = row.id;
      label = row.label;
    }
    advance('asked');
    return true;
  }
  function decide(h) {
    if (st !== 'walked' || !HOWS.includes(h) || (friend ? h === 'sold' || h === 'recompiled' : h === 'friend' || h === 'rest')) return false;
    season.offer(KEY, 'concourse:deck', { stage: 'walked' });
    season.decide(KEY, h);
    season.set('ch11.world', friend ? null : world);
    season.set('ch11.friend', h === 'friend' ? friend : null);
    season.survive(KEY); // (nothing here can kill: the choice is lived through as it is made)
    fixed.resolve('refugees', h, friend ? { friend } : { world });
    advance('decided');
    uiSound('engage');
    pendingEnd = true;
    return true;
  }
  function talk() {
    if (!S.open11() || st === 'idle') return null;
    if (st === 'forecast') {
      if (lostOne()) {
        settle(null);
        return lines(VAULT.askFriend);
      }
      const ws = worlds();
      if (!ws.length) return null; // (no world left to offer: the port's own lines stand)
      return { ...lines(VAULT.ask), offer: { kind: 'choice', prompt: VAULT.which, options: ws.slice(0, 9).map((r) => ({ label: r.label, outcomeTag: `vault:w:${r.id}` })) } };
    }
    if (st === 'asked') return lines(friend ? VAULT.askedFriendAgain : VAULT.askedAgain);
    if (st === 'walked') {
      season.offer(KEY, 'concourse:deck', { stage: 'walked' }); // the checkpoint, as the decision is shown
      // each captain aboard says their side first
      const crew = chapter.crew();
      const sides = (friend ? VAULT.sidesFriend : VAULT.sides).filter((s) => crew.some((c) => c.id === s.by)).map((s) => `${crew.find((c) => c.id === s.by).short} — ${s.text}`);
      const options = friend
        ? [{ label: fmt(VAULT.choice.friend), outcomeTag: 'vault:friend' }, { label: fmt(VAULT.choice.rest), outcomeTag: 'vault:rest' }]
        : [{ label: fmt(VAULT.choice.sell), outcomeTag: 'vault:sold' }, { label: fmt(VAULT.choice.recompile), outcomeTag: 'vault:recompiled' }];
      return { speaker: CONC.dockmaster, lines: [...sides, ...(friend ? VAULT.decideFriend : VAULT.decide).map(fmt)], cine: true, offer: { kind: 'choice', prompt: VAULT.choice.prompt, options } };
    }
    return lines(VAULT.varnAfter);
  }
  function choice(tag) {
    const m = /^vault:(w:)?(.+)$/.exec(tag || '');
    if (!m) return undefined;
    if (m[1]) return st === 'forecast' && settle(m[2]) ? lines(VAULT.asked) : null;
    return decide(m[2]) ? lines(VAULT.after[m[2]]) : null;
  }

  // --- aboard the light ship: the archive (src/voyage.js `aboard`) ---
  let archive = null, guestPanel = null;
  const laterAboard = [];
  const guest = {
    active: () => S.open11() && st === 'asked',
    consoles: () => (friend ? [{
      x: RECORD_AT[0], y: 0, z: RECORD_AT[1], r: 2.4, prompt: VAULT.prompts.record, off: () => st !== 'asked',
      use() {
        advance('walked');
        laterAboard.push(VAULT.recordCrew);
        return { speaker: VAULT.record, cine: { kind: 'comm', from: VAULT.recordFrom }, lines: VAULT.friendRecord.map(fmt) };
      },
    }] : []),
    enter(site) {
      archive = site;
      laterAboard.length = 0;
      guestPanel = null;
    },
    leave() {
      archive = null;
      if (guestPanel != null) chapterHud.panel(null);
      guestPanel = null;
    },
    tick() {
      if (!archive) return;
      if (laterAboard.length && !isDialogueOpen() && chapterHud.state().line == null) say(laterAboard.shift(), 7);
      const text = st === 'asked' ? fmt(friend ? VAULT.hud.plinth : VAULT.hud.holo) : null;
      if (text !== guestPanel) chapterHud.panel((guestPanel = text));
    },
  };

  const api = {
    // --- for world/concourse-system.js ---
    stage: () => st,
    reached,
    guest,
    // a holodeck program has been started from the light ship (src/homebase.js): walking the world on the table counts
    holo(id) {
      if (S.open11() && st === 'asked' && !friend && id === world) advance('walked');
    },
    debrief() {
      if (st !== 'done' || season.get('debrief.vault')) return null;
      const D = VAULT.debrief, h = how();
      const f = ([id, text]) => [id, fmt(text)];
      return { key: 'vault', title: D.title, complete: D.complete, lines: [D.open, D.lead, ...(D[h] || D.sold).map(f), D.close], nextCourse: D.nextCourse, nextNone: D.nextNone };
    },
    serialize: () => (st === 'idle' ? undefined : { st, world: world || undefined, label: label || undefined, friend: friend || undefined }),
    restore(raw) {
      if (!raw || typeof raw !== 'object' || !VAULT_STAGES.includes(raw.st)) return;
      st = raw.st;
      world = typeof raw.world === 'string' ? raw.world : null;
      label = typeof raw.label === 'string' ? raw.label : null;
      friend = CAPTAINS.some((c) => c.id === raw.friend) ? raw.friend : null;
      // (a save past the choice with no choice on record: back to the asking)
      if (reached('decided') && !HOWS.includes(how())) st = 'walked';
    },
    state: () => ({ stage: st, open: S.open11(), world, label, friend, how: how(), event: fixed.outcome('refugees'), camp: camp.visible, newWorld: newWorld.visible, scene: scene ? +scene.clock.u().toFixed(2) : null, pendingEnd, worlds: worlds().map((r) => r.id), places: { camp: CAMP, record: RECORD_AT } }),
    // dev: jump the stage, with the season's record made to agree.
    // `opt`: for decided / done one of 'sold' | 'recompiled' | 'friend' | 'rest'; `id`: the world on the table
    go(s, opt, id) {
      if (!VAULT_STAGES.includes(s)) return false;
      if (scene) {
        scene.clock.stop();
        scene = null;
        chapterHud.cine(false);
      }
      pendingEnd = false;
      st = s;
      friend = at(s) >= at('asked') ? (opt === 'friend' || opt === 'rest' ? lostOne() || friend || CAPTAINS[0].id : opt ? null : lostOne()) : null;
      if (at(s) >= at('asked') && !friend) {
        const row = worlds().find((r) => r.id === id) || worlds()[0] || { id: id || 'wyattmattoe', label: (id || 'wyattmattoe').toUpperCase() };
        world = world && !id ? world : row.id;
        label = world === row.id ? row.label : label || world.toUpperCase();
      } else world = label = null;
      if (at(s) >= at('decided')) {
        const h = HOWS.includes(opt) ? opt : friend ? 'rest' : 'sold';
        season.decide(KEY, h);
        season.set('ch11.world', friend ? null : world);
        season.set('ch11.friend', h === 'friend' ? friend : null);
        if (season.pending()?.key === KEY) season.survive(KEY);
        fixed.resolve('refugees', h, friend ? { friend } : { world });
        pendingEnd = s === 'decided';
      } else {
        if (season.pending()?.key === KEY) season.survive(KEY);
        season.set(KEY, null);
        season.set('ch11.world', null);
        season.set('ch11.friend', null);
        season.clearEvent('refugees');
        if (at(s) >= at('forecast')) fixed.forecast('refugees');
      }
      if (s !== 'done') season.set('debrief.vault', null);
      api.enter();
      ctx.save();
      return true;
    },
    skip: () => (scene ? scene.clock.skip() : false),
    decide,
    settle,

    // --- the deck's hooks (world/concourse-hub.js reads `S.guest`) ---
    talk: (who) => (who === 'varn' ? talk() : null),
    choice,
    mark() {
      if (!S.open11() || st === 'done' || st === 'idle') return undefined;
      if (scene) return null;
      return st === 'forecast' || st === 'walked' ? { x: hub.places.varn[0], z: hub.places.varn[1], label: VAULT.marks.varn } : null;
    },
    panel(place) {
      if (!S.open11() || st === 'idle' || place !== 'hub') return undefined;
      if (st === 'forecast') return VAULT.hud.varn;
      if (st === 'asked') return fmt(friend ? VAULT.hud.record : VAULT.hud.walk);
      if (st === 'walked') return VAULT.hud.back;
      if (st === 'done') return season.get('debrief.vault') ? undefined : VAULT.hud.done;
      return null;
    },
    held: () => !!scene,
    act() {
      if (scene) scene.clock.skip();
    },
    heldPrompt: () => (scene ? VAULT.skip : ''),
    camera(pos, target) {
      if (!scene) return false;
      const u = Math.max(0, scene.clock.u()), h = how();
      // close by them, a little above their heads
      pos.set(CAMP[0] - 15 - u * 0.12, 2.7 + u * 0.05, CAMP[1] + 17);
      if (h === 'recompiled' && u > 2) {
        // up, from the people to what is now in their sky
        const k = ease(2, 7, u) * (1 - ease(13, 18, u));
        target.set(CAMP[0] + (pos.x + SKY.x * 400 - CAMP[0]) * k, 1.6 + (pos.y + SKY.y * 400 - 1.6) * k, CAMP[1] + (pos.z + SKY.z * 400 - CAMP[1]) * k);
      } else target.set(CAMP[0], 1.6, CAMP[1]);
      return true;
    },
    enter() {
      camp.visible = S.open11() && st !== 'done';
      for (const p of people) {
        p.rig.group.position.set(p.x, 0, p.z);
        p.rig.group.rotation.y = p.yaw;
        p.moving = false;
      }
      showWorld(how() === 'recompiled' && reached('done') ? 1 : 0);
      scene = null;
      forecastOpen = false;
      if (st === 'decided') pendingEnd = true; // (left before they were seen to go: it is seen now)
      if (st === 'walked' && !saidWalked && !friend) {
        saidWalked = true;
        hub.queue(fmtLine(VAULT.walkedCrew));
      }
    },
    leave() {
      if (scene) {
        scene.clock.stop();
        scene = null;
      }
    },
    // every frame the deck is walked. True while this chapter has the frame (its scene is showing).
    tick(d, t) {
      if (!S.open11()) return false;
      if (camp.visible) {
        for (const p of people) {
          poseRig(p.rig, d, t, p.moving ? 'walk' : 'idle', 0.2);
          standRig(p.rig, 0);
        }
      }
      if (scene) {
        scene.clock.tick(d);
        return true;
      }
      // the forecast: before anything else of this chapter (src/fixedEvents.js)
      if (st === 'idle' && !forecastOpen && !isDialogueOpen()) {
        forecastOpen = true;
        camp.visible = true;
        openDialogue(fixed.forecast('refugees'), {
          onClose: () => {
            forecastOpen = false;
            advance('forecast');
            hub.queue(fmtLine(VAULT.arrive));
          },
        });
      }
      if (pendingEnd && !isDialogueOpen() && chapterHud.state().line == null) {
        pendingEnd = false;
        return beginEnd();
      }
      return false;
    },
  };
  return api;
}
