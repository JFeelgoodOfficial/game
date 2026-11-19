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
  Tenretni: 'A machine world that came through a wormhole and took Terra apart. It counts. It does not explain.',
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
