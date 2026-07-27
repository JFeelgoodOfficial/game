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

let items = new Set(); // owned item ids (persisted)

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.items)) items = new Set(data.items.filter((i) => ITEMS[i]));
  } catch {
    /* corrupt or unavailable — start empty, session-only */
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ items: [...items] }));
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

// Debug/inspection hook (__debug.inventory()).
export function inventoryState() {
  return { items: [...items] };
}
