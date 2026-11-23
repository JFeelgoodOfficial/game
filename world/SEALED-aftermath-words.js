// SEALED. Chapter one of the voyage: every word of it. It answers the chapter
// of GDD 5.7.7, so it is sealed with it: nothing here may be quoted in an
// unsealed file. `{who}`, `{name}`, `{n}` and `{t}` are filled from the record.

export const AFTER1 = {
  title: 'CHAPTER 1 — AFTERMATH',
  speaker: { name: 'The light ship', species: 'what is left aboard', cityId: 'The light ship' },
  hud: { stock: 'TAKE STOCK  ', bridge: 'BACK TO THE BRIDGE', where: ['THE CREW DECK: A CABIN', 'THE CREW DECK: THE TABLE', 'THE ARCHIVE: THE HOLODECK'] },
  prompts: ['E — LOOK IN', 'E — COUNT THE PLACES', 'E — THE DARK ROW'],
  // the helm, before the count has been made and talked over
  notYet: ['THE CHART IS BLANK. IT WILL STAY BLANK UNTIL YOU KNOW WHO IS STILL ABOARD TO SEE IT.'],
  // ...and the first time after: the chart fills
  first: ['THE CHART IS BLANK. THEN IT IS NOT.', 'EVERY LIGHT ON IT IS SOMEWHERE NOBODY HAS BEEN. NONE OF THEM HAS A NAME YET.', 'IMAGINE ONE. THE SHIP GOES WHERE ITS PILOT IMAGINES.'],

  // --- the three things counted ---
  cabin: {
    lostHere: ['{who}\'S CABIN. KEPT AS IT WAS. ONE LIGHT LEFT ON.', '{who} IS IN THE HULL. ALL THROUGH IT. THE SHIP KEPT EVERY PART, AND THERE WAS NOBODY IN TIME TO LOOK.'],
    lostBefore: ['{who}\'S CABIN. KEPT AS IT WAS. ONE LIGHT LEFT ON.', '{who} DID NOT COME UP FROM THE FIRST WORLD. THE SHIP HAS CARRIED THE EMPTY CABIN THROUGH EVERYTHING SINCE.'],
    none: ['YOUR OWN CABIN. THE BED HAS NOT BEEN SLEPT IN.', 'EVERYONE WHO WENT IN CAME OUT. YOU HAD NOT LET YOURSELF COUNT UNTIL NOW.'],
  },
  table: {
    crew: ['THE LONG TABLE. PLACES LAID: {n}.'],
    alone: ['THE LONG TABLE. ONE PLACE LAID. YOURS.'],
    woke: ['AND ONE MORE, AT THE END, FOR SOMEONE WHO HAS NOT SAT DOWN IN A MILLION YEARS.'],
    kept: ['THE CORNER OF THE HULL IS STILL LIT. NO PLACE IS LAID FOR IT. IT WANTS NOTHING.'],
  },
  row: {
    plain: ['THE ROW FOR {name} IS DARK.', 'IT WAS PUT DOWN, SO THAT EVERYTHING ELSE COULD BE CARRIED. THERE IS NO COPY.', 'IT WENT PAST ON THE WAY OUT, IN ITS OWN COLOURS. IT IS OUT HERE SOMEWHERE NOW, FOR REAL, AND CHANGED.'],
    home: ['THE ROW FOR HOME IS DARK.', 'IT WAS YOURS. YOU PUT IT DOWN YOURSELF. IT IS KEPT NOWHERE NOW.', 'IT GOT OUT BEFORE THE SHIP DID. IT IS OUT HERE SOMEWHERE, FOR REAL, AND CHANGED.'],
  },

  // --- talked over on the bridge: [captain id, text]; said by whoever is aboard, or shown plain ---
  debrief: {
    open: ['vask', 'No count to run down any more. So I will count what there is.'],
    clock: ['vask', 'Three hours and eleven minutes, by the ship\'s clock. One thousand and twenty-four years, by everyone else\'s. Home is that far behind us.'],
    burnGood: ['vask', 'You let go when the burn was done. Hands off the helm. It bought us every second we had.'],
    burnLong: ['vask', 'You held the burn too long, and it cost us time. We came through anyway. I have noted both.'],
    fell: ['marrow', '{name} was put down so the rest could be carried. I heard it go past on the way out. It is not gone. It is only no longer ours.'],
    fellHome: ['marrow', 'You put down your own world so that ours could be carried. I do not have a hymn for that. I am writing one.'],
    lost: ['marrow', '{who} is in the hull, in every cell of it. Kept, and not here. I say good night to the wall.'],
    woke: ['lux', 'And we brought someone out who had been waiting a million years. It said thank you. It said it was terrible. I believe both.'],
    kept: ['lux', 'And we left the one in the corner in the light. It is everywhere at once and it wants nothing. I do not know if that was kind.'],
    awe: ['marrow', 'Look ahead. Plain stars. Nothing bent, nothing forecast, nothing that has ever had a name.'],
    close: ['lux', 'Where to? I do not mind. Listen to me, not minding.'],
    complete: 'COMPLETE',
    next: 'STAND AT THE HELM CHART, AND IMAGINE SOMEWHERE.',
  },
};
