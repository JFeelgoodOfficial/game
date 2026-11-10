// Host-side persistent inventory. The governors' wonder-tour quests award
// exactly four items — personal vehicles the player can deploy on planet
// surfaces (src/walk.js vehicle modes, selector menu). Mirrors journal.js:
// localStorage persistence with graceful session-only degradation, and Set
// semantics so a repeat grant never re-toasts.
//
// It also keeps the combat record: which weapons have been found (arsenal.js —
// they carry across planets and sessions), the titan trophies taken per
// world, and the best wave / lifetime kills. The freighter's lounge reads all
// three for its trophy wall and weapon rack.

import { showViewToast } from './walkview.js';
import { WEAPONS, WEAPON_ORDER, STARTER_WEAPON } from './arsenal.js';

const STORE_KEY = 'fgsf.inventory';

// The full catalog. `id` is what the registry quest blocks name in `reward`.
export const ITEMS = {
  plane: { name: 'Meridian Ultralight', hint: 'Taxi, throttle up, and fly the valley below the clouds.' },
  motorcycle: { name: 'Redline Runner', hint: 'Eats dust roads. Leans hard, jumps crests.' },
  jetpack: { name: 'Reach Expedition Pack', hint: 'Hold jump to climb; trench thermals hold you like water.' },
  hangglider: { name: 'Saddle Kite', hint: 'Deploy in a leap; dive for speed, flare to land.' },
};

// The snowboard isn't a quest reward — it's always available on boardable
// worlds — but it IS equipment, so it appears in the panel and can be the
// selection. Kept out of ITEMS, which is keyed by quest `reward` ids.
export const SNOWBOARD = 'snowboard';

let items = new Set(); // owned item ids (persisted)
let selected = null; // equipment the B key acts on (persisted)
let weapons = new Set([STARTER_WEAPON]); // owned weapon ids (persisted)
let trophies = {}; // world name -> titans killed there (persisted)
let record = { bestWave: 0, kills: 0 }; // (persisted)
let recordDirty = false;

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.items)) items = new Set(data.items.filter((i) => ITEMS[i]));
    if (data.selected === SNOWBOARD || ITEMS[data.selected]) selected = data.selected;
    if (Array.isArray(data.weapons)) {
      for (const w of data.weapons) if (WEAPONS[w]) weapons.add(w);
    }
    if (data.trophies && typeof data.trophies === 'object') {
      for (const k of Object.keys(data.trophies)) {
        const n = Math.floor(Number(data.trophies[k]));
        if (n > 0) trophies[k] = n;
      }
    }
    if (data.record && typeof data.record === 'object') {
      record.bestWave = Math.max(0, Math.floor(Number(data.record.bestWave) || 0));
      record.kills = Math.max(0, Math.floor(Number(data.record.kills) || 0));
    }
  } catch {
    /* corrupt or unavailable — start empty, session-only */
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      items: [...items], selected, weapons: [...weapons], trophies, record,
    }));
  } catch {
    /* session-only */
  }
}

export function initInventory() {
  load();
}

// Returns false (and stays quiet) when the item was already owned, so a
// repeat quest completion never re-rewards.
export function grantItem(id) {
  if (!ITEMS[id] || items.has(id)) return false;
  items.add(id);
  save();
  showViewToast('ITEM ACQUIRED — ' + ITEMS[id].name.toUpperCase(), 5);
  return true;
}

export function hasItem(id) {
  return items.has(id);
}

export function ownedItems() {
  return [...items];
}

// What B activates. null means "no selection" — B then falls back to its
// original snowboard behaviour, so the key means the same thing until the
// player deliberately picks something.
export function selectedItem() {
  return selected;
}

export function setSelectedItem(id) {
  selected = id;
  save();
}

// ---- combat record -------------------------------------------------------

// Returns false when the weapon was already owned (the crate then just
// restocks it), so a repeat find never re-toasts.
export function grantWeapon(id) {
  if (!WEAPONS[id] || weapons.has(id)) return false;
  weapons.add(id);
  save();
  showViewToast('WEAPON ACQUIRED — ' + WEAPONS[id].name, 6);
  return true;
}

export function hasWeapon(id) {
  return weapons.has(id);
}

// In slot order, so 1-5 always mean the same guns.
export function ownedWeapons() {
  return WEAPON_ORDER.filter((id) => weapons.has(id));
}

export function addTrophy(world) {
  trophies[world] = (trophies[world] || 0) + 1;
  save();
}

// Called per kill and per wave: cheap in memory, written out by flushRecord
// (leaving the town) rather than on every kill.
export function noteCombat(kills, wave) {
  if (kills) record.kills += kills;
  if (wave > record.bestWave) record.bestWave = wave;
  recordDirty = true;
}

export function flushRecord() {
  if (!recordDirty) return;
  recordDirty = false;
  save();
}

export function combatRecord() {
  return { bestWave: record.bestWave, kills: record.kills, trophies: { ...trophies } };
}

// Debug/inspection hook (__debug.inventory()).
export function inventoryState() {
  return {
    items: [...items], selected,
    weapons: ownedWeapons(), trophies: { ...trophies }, record: { ...record },
  };
}
