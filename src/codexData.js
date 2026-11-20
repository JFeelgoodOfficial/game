// What the CODEX (codexPanel.js) shows, worked out fresh each time it opens
// from what is already saved: the journal's quest stages, codex subjects and
// the people spoken to (journal.js), and the chart's logged bodies (nav.js).
// There is no quest engine here — each feature still advances its own stage;
// this only turns a stage into a sentence and, where it can, a place to fly.
//
//   objectives() -> { next: [{ text, detail?, progress?, target? }], done: [text] }
//   places()     -> [{ title, rows: [{ label, color }] }]
//   lore()       -> [{ title, text }]
//
// `target` is a nav body (SET COURSE flies there).

import { CITIES } from '../world/cityRegistry.js';
import { allQuestStages, codexSubjects, peopleMet } from './journal.js';
import { errandObjective, errandWorld, relicWaiting, isAlly, ALLY_WAVEMALL, ALLY_SATURNIA, emberdeepJustOpened } from './crownErrand.js';
import { getBodies, isLogged } from './nav.js';
import { farStory } from './tenretniLazy.js';
import { BANDS } from '../world/entryzero-dialogue.js';

const body = (id) => getBodies().find((b) => b.id === id && isLogged(b.id)) || null;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const governorOf = (def) => (def.citizens || []).find((c) => c.role === 'governor')?.name || 'the governor';

export function objectives() {
  const q = allQuestStages();
  const next = [];
  const done = [];

  // --- the war (src/tenretni.js): first, because it is the urgent one ---
  const fl = q.fleets;
  if (fl === 'over') done.push('The war of the three fleets');
  if (typeof fl === 'number') {
    if (fl >= 3) {
      next.push({
        text: 'Stand before the worldship and call the fleets',
        detail: 'All three fleets are on your word. Fly close to the worldship, then call them (H, or the CALL button).',
        target: body('terra'),
      });
    } else {
      const ship = getBodies().find((b) => b.objective && isLogged(b.id)) || null;
      next.push({
        text: 'Open a channel with each of the three fleets',
        detail: 'Rustia, Saturnia and Wavemall Prime have each launched warships. Fly to one (NAV, under FLEETS, marked ◆), step aboard and ask its captain for a channel.',
        progress: `${fl} / 3`,
        target: ship,
      });
    }
  }

  // --- past the wormhole: the City of Light, the light ship, Entry Zero ---
  // (Nothing here used to be written down at all: the CODEX went blank the
  // moment the pilot came through, which is where it is most needed.)
  const fs = farStory();
  if (fs && fs.ended === 'far') farObjectives(fs, next, done);

  // --- the governor's secret and what came of it ---
  const t = q.tenretni;
  if (t === 'armed') {
    next.push({ text: 'See what Baron Rynva meant', detail: 'He said to set a course for Terra. Choose Terra in NAV and watch.', target: body('terra') });
  } else if (t === 'done') {
    next.push({ text: 'Go and look at what is left of Terra', detail: 'Something came through and took the planet apart. A city has been left in it.', target: body('terra') });
  } else if (t === 'ship' && fl === undefined) {
    next.push({ text: 'Speak to the Warden on the worldship', detail: 'Terra moves now. Land at its capital; the Warden wants a heading from your log.', target: body('terra') });
  }

  // --- the Crown errand (src/crownErrand.js): Patron Axilo's long way round ---
  const er = q['terra-errand'];
  const terraGone = t === 'done' || t === 'ship';
  if (er === 'done') done.push('The Crown Seal, brought home to Meridian Crown');
  else if (terraGone && (er !== undefined || relicWaiting())) done.push('The Crown Seal: no one left to give it to');
  else {
    const line = errandObjective();
    if (line) {
      next.push({
        text: line,
        detail: 'Patron Axilo’s errand. He is in the penthouse of the governor’s tower in Meridian Crown; your own suite is at the top of the taller tower beside it.',
        target: body(errandWorld()),
      });
    }
  }
  if (isAlly(ALLY_WAVEMALL)) done.push('WaveMall Prime stands with Terra');
  if (isAlly(ALLY_SATURNIA)) done.push('Saturnia stands with Terra: Vex Halcyon beaten');
  if (emberdeepJustOpened()) next.push({ text: 'The Emberdeep on Rustia has reopened', detail: 'The blast woke the seam. The cage at Redline Claim is unchained.', target: body('rustia') });

  // --- each town's governor: the wonder tour, then anything after it ---
  for (const def of CITIES) {
    if (!def.quest) continue;
    const st = q[def.id];
    // Nobody is left on the Reach to meet or to finish a survey for.
    if (def.charge && (q['neptunia-charge'] ?? q.charge) === 'blown' && st !== 'done') continue;
    const gov = governorOf(def);
    const world = body(def.world);
    const total = (def.wonders || []).length;
    if (st === undefined) {
      // only worth saying once the world is on the chart
      if (world) next.push({ text: `Meet ${gov} at ${def.name}`, detail: `${cap(def.world)}'s governor receives pilots in the penthouse, up the elevator.`, target: world });
    } else if (st === 'done') {
      done.push(`${gov}'s tour of ${def.name}`);
    } else if (st >= total) {
      next.push({ text: `Return to ${gov} for your reward`, detail: `You have stood under every wonder of ${def.name}.`, progress: `${total} / ${total}`, target: world });
    } else {
      next.push({ text: `Walk ${gov}'s tour: ${def.wonders[st].title}`, detail: `On ${cap(def.world)}, out from ${def.name}. The beacon and the compass point the way on foot.`, progress: `${st} / ${total}`, target: world });
    }
  }

  // --- Rustia: the Emberdeep ---
  const em = q['rustia-emberdeep'];
  if (em === 'found') next.push({ text: 'Bring up ember ore from the Emberdeep', detail: 'The mine head is beside the pad at Redline Claim. The ore is in a crate in the stope.', target: body('rustia') });
  else if (em === 'ore') next.push({ text: 'Take the ember ore to Baron Rynva', detail: 'He is in the penthouse at Redline Claim.', target: body('rustia') });
  else if (em === 'done') done.push('The Emberdeep: ore delivered, aft patio fitted');

  // --- Neptunia: the Reach's charge ---
  const ch = q['neptunia-charge'] ?? q.charge;
  if (ch === 'go' && er === 'sent') { /* the errand's own line already says it */ } else
  if (ch === 'go') next.push({ text: 'Arm the charge under the Reach', detail: 'Ride the riser down amidships, arm the charge, then report to Madame Ossva.', target: body('neptunia') });
  else if (ch === 'blown') done.push('The Reach: the charge was fired');

  // --- Wavemall Prime: the transfer chain ---
  const wm = q['wavemall prime'];
  if (typeof wm === 'number') {
    if (wm >= 8) done.push('WaveMall Flagship: the transfer chain');
    else next.push({ text: 'Follow the transfers at the WaveMall Flagship', detail: 'Each department head sends you to the next. Keep asking.', progress: `${wm} / 8`, target: body('wavemall prime') });
  }

  return { next, done };
}

const EZ_ORDER = ['ez_offer', 'ez_descent', 'ez_firewall', 'ez_deep', 'ez_centre', 'ez_relics', 'ez_reveal', 'ez_ascent', 'ez_era', 'ez_launch', 'ez_beyond'];
function farObjectives(fs, next, done) {
  const c = fs.ch, st = c.stage;
  const one = (text, detail, progress) => next.unshift({ text, detail, progress, target: null });
  done.push('Led the fleets through the wormhole');
  if (!fs.landed) return one('Land on the platform under the fleet', 'The far side is one machine with no end to it. A lit platform stands below where the fleet is holding: fly down to it and the ship lands itself.');
  if (!fs.met) return one('Go through the door and meet the Keeper', 'Step out (G), walk through the white door at the end of the platform into the City of Light, and speak to the tall figure on the terrace.');
  const ez = EZ_ORDER.indexOf(st);
  if (ez < 0) {
    // the light ship chapter
    if (st === 'suite') return one('Hear the Archivist out in your suite', 'East of the terrace a bridge runs to the Pavilion. Take its lift up to your suite. The Archivist waits by the window with an offer: fly their ship, and everyone they took comes back.');
    if (st === 'demo') return one('Watch the light ship fly', 'The hangar is west of the terrace. Stand at the rail (E) and watch one of the Tenretni try to fly it and fail. Then board it.');
    if (st === 'holo') {
      if (fs.ready) return one('Go forward to the bridge of the light ship', 'You have enough. The door at the far end of the walk is open.');
      return one('Take one thing from five of the six worlds', 'Each round room on the light ship shows one world that was taken, with five things from it moving in the light. Walk to a pedestal and press E to take that thing. One per world. They become the planet that follows you.', `${fs.picks} / 5`);
    }
    if (st === 'dive') return one('Take the helm and dive', 'The helm is at the front of the bridge. The ship goes down toward the black hole, where time runs fast for you and slow for the city.');
    if (st === 'shuttle' || st === 'stall' || st === 'canvas' || st === 'birth') return one('Draw something that has never existed', 'The shuttle goes the last of the way down. The ship can copy any world it has seen and cannot finish one. When the pad opens, draw one new thing with your finger or the mouse.');
    if (st === 'return' && !c.home) return one('Take the light ship home', 'Take the helm on the bridge again (E). Nothing in the city changes while you are down here. It changes when you are back.');
    if (st === 'return') return one('Speak to the Keeper on the terrace', 'You were gone minutes. The city has been waiting far longer. The Keeper is where you first met it.');
    if (!c.epilogue) return one('Go up to your suite', 'The captains want you to see what the city built while you were away. Take the Pavilion lift.');
    // settled in, or settling
    const s = fs.settling;
    if (!fs.offer) {
      const seen = s.sites.length;
      if (!s.raced) one('Fly a race to the end', 'The Starter stands on the terrace. Any world, any place: finish both laps. The course goes through the monument built from your drawing.');
      if (seen < s.need) one('See the four sights of the City of Light', 'The three quarters off the terrace each hold one thing to find (press E at it): the Wall of Names in the Seam, the Ninth Bell, and Saturday. The fourth is the monument, which the race flies through.', `${seen} / ${s.need}`);
      if (!s.slept) one('Sleep a night in your suite', 'Up the Pavilion lift. The bed is on the west side of the room.');
      return;
    }
    return one('The Archivist is at the balcony rail', 'It has come down from your suite with something to ask. The balcony is just inside the door from the landing.');
  }
  done.push('The light ship: flown, and brought home');
  const log = c.ez.log || 0;
  const missing = (bits) => BANDS.filter((b, i) => bits & (1 << i) && !(log & (1 << i))).map((b) => b.label).join(', ');
  if (st === 'ez_offer') return one('Board the vessel and go down the well', 'The vessel is at the east end of the balcony (E). Its lamp shows one kind of light at a time: Q and E change the band, L turns it on. Point it at each of the six marks in the well to open the way down.');
  if (st === 'ez_descent') {
    const zone = c.ez.node || 1, need = zone <= 1 ? 3 : 63, miss = missing(need);
    return one(miss ? 'Log what lives in the hollow' : 'Take the lower node down', miss
      ? `Each kind of creature shows in one band of the lamp. Light one and hold the lamp on it until it is logged. The lower node will not take the vessel until this layer's are done. Still to log: ${miss}.`
      : 'Everything in this layer is logged. The nodes are the bright cages on the lattice: the lower one carries the vessel down.');
  }
  if (st === 'ez_firewall') return one('Burn a way through the firewall', 'A sheet of light bars the way down. Hold the H-ALPHA band on one place until it opens, then sink through the hole before it shuts.');
  if (st === 'ez_deep') return one('Go down through the old rock', 'Something down here listens for the engine and comes. When it does, stop thrusting and drift until it loses you. Follow the lattice to where it ends, and go past.');
  if (st === 'ez_centre') return one('Set down on the world at the centre', 'It is only there while it is looked at. Hold Z for every band at once, keep the light on it until the ground is solid, and choose who stays with the vessel.');
  if (st === 'ez_relics') return one('Find the three relics before the light fails', 'On foot, inside the pool of light. Q changes the band, L is the lamp. Each relic shows in one band only.', `${[1, 2, 4].filter((b) => (c.ez.frags || 0) & b).length} / 3`);
  if (st === 'ez_reveal') return one('Go back up', 'Rise from the centre. Under the firewall, hold Z: every band together opens it from below.');
  if (st === 'ez_ascent') return one('Board the vessel and surface', 'It is on the balcony, as before.');
  if (st === 'ez_era') return one('See what a million years did', 'Speak to the Archivist at the rail, then board the light ship at the gallery, west of the terrace.');
  done.push('Entry Zero: found');
}

const GROUPS = [
  { title: 'WORLDS', kinds: ['planet', 'star', 'anomaly'] },
  { title: 'NEBULAS', kinds: ['nebula'] },
  { title: 'STATIONS', kinds: ['station'] },
  { title: 'FLEETS', kinds: ['ship'] },
];
export function places() {
  const all = getBodies().filter((b) => isLogged(b.id));
  return GROUPS.map((g) => ({
    title: g.title,
    rows: all.filter((b) => g.kinds.includes(b.kind)).sort((a, b) => a.label.localeCompare(b.label)),
  })).filter((g) => g.rows.length);
}

export const people = () => peopleMet().sort((a, b) => a.name.localeCompare(b.name));

// A few words on the subjects that carry the story; anything else is listed
// by its own name (most subjects are a sentence already).
const NOTES = {
  Tenretni: 'A machine world that came through a wormhole and took Terra apart. It keeps whatever it takes, whole. It found the other worlds in your navigation log.',
  'The Kept': 'Nobody on the taken worlds is dead. Tenretni holds every world and every person on it, asleep, exactly as they were. It does not know how to wake them or give them back. It thinks you can teach it.',
  'The Three Captains': 'Shift-Captain Orrin Vask of Rustia (flagship Emberwright) will not forgive Tenretni and comes along to watch it. Cantor Ilse Marrow of Saturnia (Halo of Morning) thinks helping is the only way to get anyone back. Floor Manager Brandi Lux of Wavemall Prime (Saturday Forever) is frightened and ashamed of it.',
  'The Offer': 'The Archivist asked you to fly the light ship: it goes where its pilot imagines, and Tenretni can only remember. Bring back one thing that never existed, and they believe they can wake everyone they keep.',
  'The Shuttle': 'The last of the way down beside the black hole is in a one-seat shuttle. A minute there is a year in the city. Nothing in the city changes until you bring what you made home.',
  'The First Entry': 'Your drawing. The first thing in the archive that was given, not taken. From it Tenretni learned to finish a thing and to wake the sleepers.',
  'A New Idea': 'A thousand years passed in the city while you were gone minutes. The kept were woken, and their children built the city with the fleets\' crews.',
  'Entry Zero': 'The one dark record in the archive: the first world, where Tenretni was made. It is at the centre of the megaworld, down the well under the city. Each thing down there shows in one band of the lamp only.',
  'The Lattice': 'The frame that runs down through the hollow. Its nodes are the bright cages on it: the upper one refills the lamp, the lower one carries the vessel down a layer once everything living in that layer has been logged.',
  'What Was Feared': 'Tenretni was built on a dying world by someone who could not bear to lose it, and told to keep everything. Its makers made their peace and let their last fire go out. Nobody told the machine it could stop.',
  'The Worldship': 'What Terra became: a hollowed planet with an engine for a core and a capital on its skin. It moves where its pilot points it.',
  'The Worldship, departed': 'It left through the hole it came by.',
  'The New Star': 'Where the worldship died there is a small new light.',
  'Through the Wormhole': 'You followed it through. The far side is not empty.',
  'The City of Light': 'The place on the far side of the hole.',
};
export function lore() {
  return codexSubjects().map((s) => ({
    title: s,
    text: NOTES[s] || (/, assimilated$/.test(s) ? 'Taken in by the worldship. It is not on the chart any more.' : ''),
  }));
}
