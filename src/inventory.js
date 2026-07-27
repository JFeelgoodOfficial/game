// Host-side persistent inventory. The governors' wonder-tour quests award
// exactly four items — personal vehicles the player can deploy on planet
// surfaces (src/walk.js vehicle modes, selector menu). Mirrors journal.js:
// localStorage persistence with graceful session-only degradation, and Set
// semantics so a repeat grant never re-toasts.

import { showViewToast } from './walkview.js';

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

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.items)) items = new Set(data.items.filter((i) => ITEMS[i]));
    if (data.selected === SNOWBOARD || ITEMS[data.selected]) selected = data.selected;
  } catch {
    /* corrupt or unavailable — start empty, session-only */
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ items: [...items], selected }));
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

// Debug/inspection hook (__debug.inventory()).
export function inventoryState() {
  return { items: [...items], selected };
}
