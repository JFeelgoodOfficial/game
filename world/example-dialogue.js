// The Proving Ground (world/example-system.js; GDD 5.7.8): every word of the
// example system. It is not story. It is here so the shuttle, the docks and a
// chapter's own save record have something small to be tried against, and so
// the next chapter has a file to be copied from.

export const EXAMPLE = {
  id: 'proving',
  label: 'THE PROVING GROUND',
  // the relay: the one thing built here
  relay: {
    label: 'THE RELAY',
    approach: 'THE RELAY — AN OLD BEACON HAS YOUR HELM',
    welcome: 'THE RELAY — NOBODY HOME. THE PAD LIGHTS STILL WORK',
    dockLabel: 'AUTO-LANDING · THE RELAY',
    leaveHint: 'YOUR FREIGHTER IS ON THE PAD',
    logPrompt: 'E — READ THE LOG',
    speaker: { name: 'The relay', species: 'a beacon', cityId: 'The Proving Ground' },
    first: [
      'LOG OPEN. LAST ENTRY: UNDATED.',
      'THIS RELAY MARKS A SYSTEM WITH NOTHING IN IT WORTH A STORY: ONE STAR, ONE BARE WORLD, ONE PAD.',
      'A SHIP THAT CAN DOCK HERE, LAND THERE AND GET HOME AGAIN IS FIT TO GO ANYWHERE.',
      'YOUR VISIT IS LOGGED.',
    ],
    again: ['LOG OPEN.', 'YOUR VISIT IS ALREADY HERE. NOTHING ELSE IS.'],
  },
  planet: { label: 'CINDER' },
  // what the captains say on the bridge while the ship is here
  talk: {
    marrow: ['Nothing here was made to be looked at. I find I like looking at it.'],
    lux: ['An empty system. Good. I have been wanting one of those.'],
    vask: ['One star, one rock, one beacon. A count I can finish.'],
  },
};
