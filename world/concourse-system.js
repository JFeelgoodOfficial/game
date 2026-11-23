// The free port: Season 1, chapters 4 and 5, as one system the light ship
// goes to (GDD 5.7.8 "Adding a chapter", 5.7.9; plans/season-1-arc.md).
//
// Two chapters are played here, one after the other, because they are in the
// same place: chapter 4 (the port, its money, the first paid cargo, the bar)
// and chapter 5 (the valuation, the theft, the hunt through the archive, the
// sealed forecast). The deck is world/concourse-hub.js; the mine's top end
// world/concourse-tender.js; the thieves' hold world/concourse-hold.js; the
// hunt aboard the light ship world/appraisal-archive.js. The words are
// world/concourse-dialogue.js and world/appraisal-dialogue.js.
//
// Chapter 4's stages, forward only:
//   arrived   the ship is here
//   docked    traffic's hail has been heard, on the first step out
//   met       the dockmaster has said what the money is; the coolant is aboard
//   hauled    it has been delivered to the Low Tender, and the fee paid over
//   paid      the fee has been kept, or split with the crew who mined it
//   traded    something bought cheap has been sold for more
//   done      the bar: the envoy knew the berth, the drink and the name
// Chapter 5's (it opens once chapter 4 has been talked over on the bridge):
//   idle      not begun
//   valued    the assessor has valued the archive above the port
//   robbed    the light ship has raised the alarm
//   tracked   the three touched plinths have been found, aboard: berth forty
//   found     the sealed forecast has been read, and the two thieves dealt with
//   done      back up on the deck
//
// The money. Prices are in the season's currency, kept as the season fact
// `ticks`. Four goods, each cheap at one end and dear at the other
// (CONC_GOODS), each price swinging about its base as the market's clock
// turns (one turn for every sale or purchase). The hold takes CONC_HOLD.
//
// Nothing here can kill the pilot, so the two decisions (the fee; the
// thieves) are offered, made and survived in one step (src/season.js).

import { C, CONC_GOODS, APPR_TOUCHED } from '../src/constants.js';
import { chapterHud } from '../src/chapterHud.js';
import { openHoloPanel } from '../src/holoPanel.js';
import { uiSound } from '../src/sfx.js';
import { createConcourseHub } from './concourse-hub.js';
import { createConcourseTender } from './concourse-tender.js';
import { createConcourseHold } from './concourse-hold.js';
import { createArchiveGuest } from './appraisal-archive.js';
import { CONC } from './concourse-dialogue.js';
import { APPR } from './appraisal-dialogue.js';
import { createLove, LOVE_STAGES } from './love.js'; // chapter 9: a third chapter in this place
import { LOVE } from './love-dialogue.js';

export const CONC_STAGES = ['arrived', 'docked', 'met', 'hauled', 'paid', 'traded', 'done'];
export const APPR_STAGES = ['idle', 'valued', 'robbed', 'tracked', 'found', 'done'];

// ctx: { scene, camera, chapter, voyage, sunDir, save(), crewTalk(captain), season, fixed }
export function createConcourseSystem(ctx) {
  const { season } = ctx;
  let s4 = 'arrived', s5 = 'idle';
  let s9 = 'idle'; // chapter 9 (world/love.js)
  const i9 = (s) => LOVE_STAGES.indexOf(s);
  let clock = 0; // the market's: one turn for every trade
  let cargo = {}, paid = {}; // what is in the hold, and what each unit of it cost
  let found = 0; // chapter 5: which touched plinths have been looked at (one bit each)
  let sealed = false; // ...and whether the case has been opened
  const i4 = (s) => CONC_STAGES.indexOf(s), i5 = (s) => APPR_STAGES.indexOf(s);
  const ticks = () => season.get('ticks') || 0;
  const held = () => Object.values(cargo).reduce((a, n) => a + n, 0);
  // what a thing costs, at a place, as the market stands
  const price = (place, i) => {
    const g = CONC_GOODS[i];
    // (once the cheap ticks have flooded the port, chapter 6, everything costs twice the ticks)
    const flood = ctx.fixed.resolved('flood') ? C.CONC_FLOOD : 1;
    return Math.max(1, Math.round(g[place] * flood * (1 + C.CONC_SWING * Math.sin(clock * 0.83 + i * 1.9 + (place === 'hub' ? 0 : 2.1)))));
  };

  function market(place) {
    const rows = [];
    CONC_GOODS.forEach((g, i) => {
      const p = price(place, i), n = cargo[g.id] || 0, name = CONC.goods[g.id];
      const can = ticks() >= p && held() < C.CONC_HOLD;
      rows.push({ id: `b:${i}`, label: `${CONC.market.buy} ${name}`, note: CONC.market.each.replace('{p}', p), unlocked: can, show: true, lockedNote: ticks() < p ? CONC.market.poor : CONC.market.full });
      rows.push({ id: `s:${i}`, label: `${CONC.market.sell} ${name}${n ? ` ×${n}` : ''}`, note: `+${CONC.market.each.replace('{p}', p)}`, unlocked: n > 0, show: true, lockedNote: CONC.market.none });
    });
    openHoloPanel(rows, (id) => {
      trade(place, id);
      market(place); // shown again, as it now stands (X closes it)
    }, {
      title: place === 'hub' ? CONC.market.title : CONC.market.titleTender,
      sub: CONC.market.sub.replace('{ticks}', ticks()).replace('{held}', held()).replace('{cap}', C.CONC_HOLD),
      foot: CONC.market.foot,
    });
  }
  function trade(place, id) {
    const [kind, n] = String(id).split(':');
    const i = Number(n), g = CONC_GOODS[i];
    if (!g) return false;
    const p = price(place, i), have = cargo[g.id] || 0;
    if (kind === 'b') {
      if (ticks() < p || held() >= C.CONC_HOLD) return false;
      season.set('ticks', ticks() - p);
      paid[g.id] = ((paid[g.id] || 0) * have + p) / (have + 1);
      cargo[g.id] = have + 1;
    } else {
      if (!have) return false;
      season.set('ticks', ticks() + p);
      cargo[g.id] = have - 1;
      // bought low, sold high: the whole of the trade, and the chapter's next step
      if (p > (paid[g.id] || 0) && s4 === 'paid') {
        S.adv4('traded');
        chapterHud.say(CONC.market.profit, 7);
      }
      if (!cargo[g.id]) {
        delete cargo[g.id];
        delete paid[g.id];
      }
    }
    clock++;
    uiSound('select');
    ctx.save();
    return true;
  }

  const S = {
    st4: () => s4,
    st5: () => s5,
    reached4: (s) => i4(s4) >= i4(s),
    reached5: (s) => i5(s5) >= i5(s),
    adv4(to) {
      if (i4(to) <= i4(s4)) return false;
      s4 = to;
      ctx.save();
      return true;
    },
    adv5(to) {
      if (i5(to) <= i5(s5)) return false;
      s5 = to;
      ctx.save();
      return true;
    },
    // chapter 5 opens once chapter 4 has been talked over on the bridge
    open5: () => s4 === 'done' && !!season.get('debrief.concourse'),
    // --- chapter 9: it opens once chapter 5 has been talked over on the bridge ---
    st9: () => s9,
    reached9: (s) => i9(s9) >= i9(s),
    adv9(to) {
      if (i9(to) <= i9(s9)) return false;
      s9 = to;
      ctx.save();
      return true;
    },
    open9: () => s5 === 'done' && !!season.get('debrief.appraisal'),
    held,
    market,
    // --- chapter 4 ---
    takeJob: () => s4 === 'docked' && S.adv4('met'),
    deliver() {
      if (s4 !== 'met') return false;
      season.set('ticks', ticks() + C.CONC_FEE);
      season.offer('ch4.fee', 'concourse:deck', { stage: 'hauled' });
      return S.adv4('hauled');
    },
    payFee(option) {
      if (s4 !== 'hauled' || (option !== 'keep' && option !== 'split')) return false;
      season.offer('ch4.fee', 'concourse:deck', { stage: 'hauled' });
      season.decide('ch4.fee', option === 'keep' ? 'kept' : 'split');
      season.survive('ch4.fee');
      if (option === 'split') season.set('ticks', Math.max(0, ticks() - Math.round(C.CONC_FEE / 2)));
      return S.adv4('paid');
    },
    // what the corner of the screen says, on the deck or at the tender
    panel(place) {
      const rows = [];
      if (S.reached4('hauled')) rows.push(`${CONC.hud.purse}${ticks()}`);
      if (S.reached4('paid')) rows.push(`${CONC.hud.hold}${held()} / ${C.CONC_HOLD}`);
      if (s4 === 'docked') rows.push(CONC.hud.seeVarn);
      else if (s4 === 'met') rows.push(CONC.hud.job, place === 'hub' ? CONC.hud.fly : CONC.hud.foreman);
      else if (s4 === 'hauled') rows.push(CONC.hud.foreman);
      else if (s4 === 'paid') rows.push(place === 'tender' && !held() ? CONC.hud.trade : CONC.hud.sell);
      else if (s4 === 'traded') rows.push(CONC.hud.bar);
      else if (s4 === 'done' && !S.open5()) rows.push(CONC.hud.done);
      else if (place === 'hub') {
        if (s5 === 'idle') rows.push(APPR.hud.assessor);
        else if (s5 === 'robbed') rows.push(APPR.hud.home);
        else if (s5 === 'tracked') rows.push(APPR.hud.berth);
        else if (s5 === 'done') rows.push((S.open9() && love.panel('hub')) || (s9 === 'done' ? LOVE.hud.done : S.open9() ? '' : APPR.hud.done));
      }
      return rows.filter(Boolean).length ? rows.filter(Boolean).join('\n') : null;
    },
    // --- chapter 5 ---
    touched: (i) => !!(found & (1 << i)),
    touchedCount: () => APPR_TOUCHED.filter((t, i) => found & (1 << i)).length,
    findTouched(i) {
      found |= 1 << i;
      ctx.save();
      return S.touchedCount();
    },
    sealedSeen: () => sealed,
    sawSealed() {
      sealed = true;
      ctx.save();
    },
    offerJudge: () => season.offer('ch5.thieves', 'concourse:hold', { stage: 'tracked' }),
    judge(option) {
      if (s5 !== 'tracked' || !sealed || (option !== 'held' && option !== 'freed')) return false;
      season.offer('ch5.thieves', 'concourse:hold', { stage: 'tracked' });
      season.decide('ch5.thieves', option);
      season.survive('ch5.thieves');
      return S.adv5('found');
    },
  };

  const hub = createConcourseHub(ctx, S);
  const tender = createConcourseTender(ctx, S);
  const guest = createArchiveGuest(ctx, S);
  const love = createLove(ctx, S); // chapter 9
  S.love = love;
  let hold = null, holdBroken = false;
  function getHold() {
    if (!hold && !holdBroken) {
      try {
        hold = createConcourseHold(ctx, S);
      } catch (err) {
        holdBroken = true;
        console.warn('[voyage] berth forty could not be built', err);
      }
    }
    return hold;
  }
  const pristine = () => s9 === 'idle' && s4 === 'arrived' && s5 === 'idle' && !clock && !held() && !found && !sealed;

  return {
    docks: [
      { id: 'port', label: CONC.hub.label, pos: [3000, -1500, -14000], site: hub, radius: 700, hover: 190, approach: CONC.hub.approach, welcome: CONC.hub.welcome, dockLabel: CONC.hub.dockLabel, color: '#ffd9a0' },
      { id: 'tender', label: CONC.tender.label, pos: [-9000, -2500, -30000], site: tender, radius: 420, hover: C.BASE_DOCK_HOVER, approach: CONC.tender.approach, welcome: CONC.tender.welcome, dockLabel: CONC.tender.dockLabel, color: '#ff9a4a' },
    ],
    planets: [],
    hop(key) {
      if (key === 'concourse:hold') {
        const s = getHold();
        return s ? { site: s, spawn: s.spawn, yaw: s.spawnYaw, look: 'dive' } : null;
      }
      const lh = love.hop(key);
      if (lh) return lh;
      if (key === 'concourse:deck') {
        ctx.voyage.place();
        return { site: hub, spawn: hub.fromHatch, yaw: 0, out: true };
      }
      return null;
    },
    door() {
      for (const s of [hub, tender, hold]) {
        if (!s || !s.inside() || !s.portal) continue;
        const to = s.portal;
        s.portal = null;
        return to;
      }
      return love.door();
    },
    // who of this chapter's is aboard the light ship (world/lightship.js asks, for its archive)
    aboard: (room) => (room === 'archive' && (s5 === 'robbed' || s5 === 'tracked') ? guest : love.aboard(room)),
    talk: (captainId) => (s4 === 'done' ? love.talk(captainId) : CONC.talk[captainId] || null),
    // one chapter's debrief at a time: chapter 4's, then (once it has been played) chapter 5's
    debrief() {
      if (s4 === 'done' && !season.get('debrief.concourse')) {
        const D = CONC.debrief;
        const fee = season.get('ch4.fee') === 'split' ? D.split : D.kept;
        return { key: 'concourse', title: D.title, complete: D.complete, lines: [D.open, ...D.body, fee, ...D.tail, D.close], nextCourse: D.nextNone, nextNone: D.nextNone };
      }
      if (s5 === 'done' && !season.get('debrief.appraisal')) {
        const D = APPR.debrief;
        const end = season.get('ch5.thieves') === 'freed' ? D.freed : D.held;
        return { key: 'appraisal', title: D.title, complete: D.complete, lines: [D.open, ...D.body, end, D.close], nextCourse: D.nextCourse, nextNone: D.nextNone };
      }
      if (s9 === 'done' && !season.get('debrief.love')) return love.debrief();
      return null;
    },
    serialize() {
      if (pristine()) return undefined;
      const rec = { s4 };
      if (s5 !== 'idle') rec.s5 = s5;
      if (s9 !== 'idle') rec.s9 = s9;
      if (clock) rec.clock = clock;
      if (held()) {
        rec.cargo = { ...cargo };
        rec.paid = { ...paid };
      }
      if (found) rec.found = found;
      if (sealed) rec.sealed = true;
      return rec;
    },
    restore(raw) {
      if (!raw || typeof raw !== 'object') return;
      if (CONC_STAGES.includes(raw.s4)) s4 = raw.s4;
      if (APPR_STAGES.includes(raw.s5)) s5 = raw.s5;
      if (LOVE_STAGES.includes(raw.s9)) s9 = raw.s9;
      if (Number.isFinite(raw.clock)) clock = Math.max(0, Math.floor(raw.clock));
      cargo = {};
      paid = {};
      if (raw.cargo && typeof raw.cargo === 'object') {
        for (const g of CONC_GOODS) {
          const n = Math.floor(raw.cargo[g.id]);
          if (n > 0 && held() + n <= C.CONC_HOLD) {
            cargo[g.id] = n;
            paid[g.id] = Number.isFinite(raw.paid?.[g.id]) ? raw.paid[g.id] : 0;
          }
        }
      }
      if (Number.isFinite(raw.found)) found = raw.found & ((1 << APPR_TOUCHED.length) - 1);
      sealed = !!raw.sealed;
    },
    state: () => ({
      s4, s5, open5: S.open5(), s9, open9: S.open9(), love: love.state(), ticks: ticks(), clock, cargo: { ...cargo }, held: held(), found, sealed,
      fee: season.get('ch4.fee'), thieves: season.get('ch5.thieves'),
      prices: { hub: CONC_GOODS.map((g, i) => price('hub', i)), tender: CONC_GOODS.map((g, i) => price('tender', i)) },
      hub: hub.info(), tender: tender.info(), hold: hold ? hold.info() : null, guest: guest.state(),
      places: { hub: hub.places, tender: tender.places, hold: hold ? hold.places : null },
    }),
    // --- dev (through __debug.tenretni.voyage().instance('concourse')) ---
    // jump chapter 4's stage, or chapter 5's, with the season's record made to agree
    go4(s, fee) {
      if (!CONC_STAGES.includes(s)) return false;
      s4 = s;
      if (i4(s) >= i4('paid')) season.decide('ch4.fee', fee === 'split' ? 'split' : season.get('ch4.fee') || 'kept');
      else season.set('ch4.fee', null);
      if (i4(s) >= i4('hauled') && !ticks()) season.set('ticks', C.CONC_FEE);
      if (s !== 'done') {
        s5 = 'idle';
        season.set('debrief.concourse', null);
      }
      ctx.save();
      return true;
    },
    go5(s, thieves) {
      if (!APPR_STAGES.includes(s)) return false;
      s4 = 'done';
      season.set('debrief.concourse', true);
      s5 = s;
      found = i5(s) >= i5('tracked') ? (1 << APPR_TOUCHED.length) - 1 : 0;
      sealed = i5(s) >= i5('found');
      if (i5(s) >= i5('found')) season.decide('ch5.thieves', thieves === 'freed' ? 'freed' : season.get('ch5.thieves') || 'held');
      else season.set('ch5.thieves', null);
      if (s !== 'done') season.set('debrief.appraisal', null);
      ctx.save();
      return true;
    },
    // chapter 9's stage, with the season's record made to agree. `how`: 'trusts' | 'wary'
    go9(s, how) {
      if (!LOVE_STAGES.includes(s)) return false;
      s4 = 'done';
      s5 = 'done';
      season.set('debrief.concourse', true);
      season.set('debrief.appraisal', true);
      s9 = s;
      if (i9(s) >= i9('patio')) {
        const h = how === 'wary' ? 'wary' : how === 'trusts' ? 'trusts' : ctx.fixed.outcome('defection')?.how || 'trusts';
        season.decide('ch9.why', h === 'trusts' ? 'nothing' : 'engine');
        ctx.fixed.resolve('defection', h, { asked: h === 'trusts' ? 'nothing' : 'engine' });
        season.set('ch9.ione', 'stayed');
      } else {
        season.set('ch9.why', null);
        season.set('ch9.ione', null);
        season.clearEvent('defection');
        if (i9(s) >= i9('forecast')) ctx.fixed.forecast('defection');
      }
      if (s !== 'done') season.set('debrief.love', null);
      ctx.save();
      return true;
    },
    love,
    trade,
    price,
    S,
    hub,
    tender,
    hold: () => hold,
    guest,
  };
}
