// The Long Dusk (world/dusk-system.js, world/dusk-ground.js; GDD 5.7.9):
// every word of Season 1's second chapter, and every name in it. Rename
// freely: the code reads these and spells none of them.
//
// A crew line is { by, text, other, solo } (world/sceneClock.js crewSay): said
// by its captain if they are aboard, by whoever is if not (in `other[id]`'s
// words where given), and with nobody left it is `solo`, which is what the
// pilot sees for himself. Timed lines are [seconds, line].

export const DUSK = {
  id: 'dusk',
  label: 'THE LONG DUSK',
  world: 'THE SILL',

  camp: {
    label: 'THE WALKING CAMP',
    approach: 'THE SILL — A PAD OF PACKED ASH ON THE TWILIGHT LINE HAS YOUR HELM',
    welcome: 'THE WALKING CAMP — ONE FACE OF THIS WORLD BURNS AND ONE FREEZES. THEY LIVE BETWEEN',
    dockLabel: 'AUTO-LANDING · THE WALKING CAMP',
    leaveHint: 'YOUR FREIGHTER IS ON THE PAD',
  },
  elder: { name: 'Pace-Keeper Oda Renn', species: 'Sillwalker', cityId: 'The Walking Camp' },
  walker: { species: 'Sillwalker', cityId: 'The Walking Camp' },

  // --- the screen ---
  hud: {
    flareSoon: 'FLARE   TODAY',
    flare: 'FLARE   ',
    heat: 'HEAT    ',
    cold: 'COLD    ',
    seen: 'WARM    ',
    turned: 'TURNED  ',
    held: 'HELD    ',
    // after the flare: what is left to do, so it cannot be missed
    talk: 'TALK TO RENN',
    done: 'DONE — BACK TO THE LIGHT SHIP',
  },
  keys: 'Q — CHANGE BAND · L — LAMP',
  skip: 'E — SKIP',
  shelterPrompt: 'E — GET UNDER THE SLEDGES',
  marks: { elder: 'RENN', edge: 'EDGE', shelter: 'SLEDGES' },

  // --- the ground, before anything is asked ---
  arrive: [
    [3, { by: 'vask', text: 'The star does not rise here and it does not set. It leans. Call it a degree each way.', other: { marrow: 'The star does not rise. It leans, a little, and comes back.', lux: 'It just sits there on the edge. Leaning.' }, solo: 'THE STAR SITS ON THE HORIZON. IT LEANS A LITTLE, AND THE LIGHT MOVES.' }],
    [12, { by: 'marrow', text: 'So the dusk moves, and they move with it. A whole people who are never home and never lost.', other: { lux: 'The good ground moves, so they move. I could not live like that. I mostly have.', vask: 'The strip they can live in moves. They walk to stay in it. Every day of their lives.' }, solo: 'THE CAMP IS MOVING. THEY WALK TO STAY IN THE TWILIGHT.' }],
  ],
  // too far either way
  hot: { by: 'lux', text: 'That is far enough toward the star. It is cooking the ground.', other: { vask: 'Too far sunward. The suit is past its rating.', marrow: 'Come back. The light is not kind out there.' }, solo: 'SUIT TEMPERATURE CLIMBING. TURN BACK FROM THE STAR.' },
  cold: { by: 'vask', text: 'The suit is losing heat faster than it makes it. Find something warm or come back.', other: { lux: 'It is so cold my lights have gone blue. Come back.', marrow: 'The dark is taking the warmth out of you. Come back to the dusk.' }, solo: 'SUIT TEMPERATURE FALLING. FIND SOMETHING WARM, OR TURN BACK.' },
  vent: 'WARM GROUND. THE SUIT IS RECOVERING.',

  // --- Renn asks ---
  ask: [
    'You came down out of the leaning star. Nobody does that. Walk with me; the camp does not stop.',
    'We keep pace with the dusk. Sunward the ground burns. Nightward it kills slower.',
    'Something comes out of the night at our edge. Tall. It takes our pickets\' fires and scatters the line. Three walkers have not come back.',
    'You have a ship. Ships have weapons. Give us something that burns hotter than a fire.',
    'Go and look at the edge first, if you want. Then tell me yes.',
  ],
  askAgain: ['The edge is nightward of the camp. Follow the picket fires. Then come and tell me yes.'],
  askCrew: { by: 'lux', text: 'We have cutting torches in the hold. We could just hand them over and go. I am only saying it is possible.', other: { vask: 'There are six cutting torches in the hold. That is the count. What they are for is your decision.', marrow: 'She is afraid, and she is telling the truth about what she has seen. Those are different things.' }, solo: null },

  // --- the edge ---
  edge: [
    [1.5, { by: null, text: 'THE EDGE OF THE DUSK. THE PICKET FIRES END HERE.' }],
    [6, { by: 'lux', text: 'There. Something moved. Something tall moved and I did not like it.', other: { vask: 'Movement, nightward. Tall. More than one.', marrow: 'There. Past the last fire. They are standing just outside it.' }, solo: 'SOMETHING TALL MOVES JUST PAST THE LAST FIRE.' }],
    [12, { by: 'vask', text: 'They come to the fire and stop. Then back. Then to the fire again. That is not how a thing hunts.', other: { marrow: 'They keep coming to the light and turning away. As if it were a wall.', lux: 'They are not rushing us. Why are they not rushing us?' }, solo: 'THEY COME UP TO THE FIRELIGHT, STOP, AND TURN BACK. AGAIN AND AGAIN.' }],
    [18, { by: 'marrow', text: 'We cannot see them. So use the lamp. It sees what an eye does not.', other: { vask: 'Eyes are no use out there. The lamp has a band for warm things.', lux: 'The lamp. Please. I want to know what I am looking at.' }, solo: 'TOO DARK TO SEE THEM. THE LAMP HAS OTHER BANDS.' }],
  ],
  lampHint: 'Q — CHANGE BAND. INFRARED SHOWS WHAT IS WARM.',
  sawOne: 'WARM, AND TALL. HOLD THE LAMP ON THE OTHERS.',
  sawAll: { by: 'vask', text: 'Three groups. In each one, big shapes on the outside and small ones in the middle. Nine small.', other: { marrow: 'Each group has small ones at its heart. They are being walked.', lux: 'There are little ones. In the middle. Oh, I do not like where this is going.' }, solo: 'THREE GROUPS. THE BIG SHAPES WALK ON THE OUTSIDE. SMALL ONES IN THE MIDDLE.' },
  skyHint: 'WHAT ARE THEY WALKING AWAY FROM? TRY H-ALPHA ON THE NIGHT SKY.',

  // --- what the lamp shows ---
  seen: [
    [1.5, { by: null, text: 'HYDROGEN, GLOWING, IN A LINE ACROSS THE NIGHT SKY. FAINT. IT IS ALREADY STARTING.' }],
    [7, { by: 'marrow', text: 'That line is where the flare comes down. And every one of them is walking away from it.', other: { vask: 'The forecast band. That line is it. All three groups are headed off it.', lux: 'That is the band from the forecast. They are getting out from under it.' }, solo: 'THE LINE IS WHERE THE FLARE WILL COME DOWN. ALL THREE GROUPS ARE WALKING AWAY FROM IT.' }],
    [13, { by: 'vask', text: 'The only way round it is along this edge. Past the pickets. Past the fires.', other: { marrow: 'And their way out runs along this edge. Through the firelight.', lux: 'And the way out is right here. Right where the fires are.' }, solo: 'THEIR ONLY WAY ROUND IT RUNS ALONG THIS EDGE, THROUGH THE PICKET FIRES.' }],
    [19, { by: 'lux', text: 'They are not hunting. They are leaving. With the children. And we are standing in the door.', other: { marrow: 'They are not hunters tonight. They are parents.', vask: 'Not a hunt. An evacuation. The pickets are in the road.' }, solo: 'THEY ARE NOT HUNTING. THEY ARE EVACUATING THEIR YOUNG, AND THE CAMP IS IN THE WAY.' }],
  ],

  // --- the decision ---
  decide: {
    lines: [
      'You have looked. Good. Then you know how many there are.',
      'The star is about to throw something at us. My people will be under the sledges, under the water skins. We have done it before.',
      'What we have not done before is hold the edge while it happens. So. Your torches.',
    ],
    prompt: 'RENN IS WAITING',
    arm: 'ARM THEM — GIVE THE CUTTING TORCHES',
    warn: 'WARN BOTH SIDES — OPEN THE EDGE, TURN THE HERDS THROUGH IT',
  },
  armed: {
    lines: [
      'Six. Hotter than anything we have lit. Thank you.',
      'Stand the line with us. When they come at the fire, put your own light on them. They turn from light.',
    ],
    crew: { by: 'marrow', text: 'Pilot. We saw what they are carrying.', other: { vask: 'For the log: we knew what was in the middle of those groups.', lux: 'It is the safe thing. It is. Is it?' }, solo: null },
    hint: 'HOLD THE LINE. BLUE-GREEN ON ANYTHING THAT COMES AT THE FIRES.',
  },
  warned: {
    lines: [
      'Evacuating. With young. You saw this with your lamp.',
      '...We walk our own children out of the sun\'s way every day of our lives. I should have known the shape of it.',
      'I will pull the pickets and put the fires out. The edge is open. But they will not come through for me.',
      'They turn from light. Get behind them and put yours on their backs.',
    ],
    crew: { by: 'vask', text: 'Three groups, one lamp, and a clock. I will keep the clock.', other: { lux: 'Out there. In the dark. With those. Fine. I am coming. I am not happy.', marrow: 'They will not understand us. They will understand a door.' }, solo: null },
    hint: 'GET BEHIND EACH GROUP. BLUE-GREEN ON THEIR BACKS TURNS THEM TO THE EDGE.',
  },
  // out among them
  front: 'FROM THE FRONT THE BEAM ONLY DRIVES THEM BACK. GET BEHIND THEM.',
  turnedOne: 'THEY HAVE TURNED. THEY ARE MAKING FOR THE EDGE.',
  drove: 'THEY HAVE TURNED BACK INTO THE DARK.',
  broke: 'ONE GROUP IS THROUGH THE LINE. THE SMALL ONES ARE WITH IT.',
  minute: { by: 'vask', text: 'One minute. Wherever you are, start back.', other: { lux: 'One minute! Sledges! Now!', marrow: 'The line in the sky is brightening. Come back.' }, solo: 'ONE MINUTE. GET BACK TO THE SLEDGES.' },
  allDone: 'THAT IS ALL OF THEM. BACK TO THE SLEDGES.',

  // --- the flare (the fixed event) ---
  flare: {
    open: [
      [1.5, { by: null, text: 'THE FLARE.' }],
      [7, { by: 'vask', text: 'Light first. Half a minute old by the time it lands. The day side has it.', other: { marrow: 'The light comes first. All of the day side at once.', lux: 'That is just the light. That is just the light?' }, solo: 'THE LIGHT ARRIVES FIRST, AND FALLS ON THE DAY SIDE.' }],
      [16, { by: null, text: 'THEN THE PARTICLES, DOWN THE FIELD, ONTO THE NIGHT.' }],
    ],
    rerouted: [
      [23, { by: 'marrow', text: 'It is coming down where they were. Only where they were.', other: { vask: 'The band is empty. I have counted it twice.', lux: 'Nobody is under it. Tell me nobody is under it.' }, solo: 'THE BAND COMES DOWN ON EMPTY GROUND.' }],
      [31, { by: 'vask', text: 'Small shapes, out past the edge, in the lee. All moving.', other: { marrow: 'There, in the lee. The small ones. Moving.', lux: 'They are out. Look. They are all out.' }, solo: 'IN THE LEE BEYOND THE EDGE, THE SMALL SHAPES ARE MOVING.' }],
    ],
    partial: [
      [23, { by: 'marrow', text: 'Some of them are still under it.', other: { vask: 'Not all of them cleared the band.', lux: 'There are still some in there. There are still some in there.' }, solo: 'NOT EVERY GROUP IS CLEAR OF THE BAND.' }],
      [31, { by: 'vask', text: 'I have the ones in the lee. I will count the rest when it stops.', other: { marrow: 'Some are in the lee. Hold on to that.', lux: 'Some got out. Some got out.' }, solo: 'SOME ARE IN THE LEE. SOME ARE NOT.' }],
    ],
    unheeded: [
      [23, { by: 'marrow', text: 'They are all still under it.', other: { vask: 'No group cleared the band.', lux: 'We told them. We told them.' }, solo: 'NO GROUP IS CLEAR OF THE BAND.' }],
      [31, { by: null, text: 'THE EDGE WAS OPEN. NOTHING CAME THROUGH IT.' }],
    ],
    armed: [
      [23, { by: 'marrow', text: 'It is coming down on them. We sent them back into it.', other: { vask: 'The band is on the groups we turned.', lux: 'Do not look. I am not looking.' }, solo: 'THE BAND COMES DOWN ON THE GROUPS THAT WERE TURNED BACK.' }],
      [31, { by: 'vask', text: 'The line held. Nobody in the camp is hurt.', other: { marrow: 'The camp is whole. That is also true.', lux: 'Everyone here is fine. Everyone here is fine.' }, solo: 'THE LINE HELD. NOBODY IN THE CAMP IS HURT.' }],
    ],
    close: [38, { by: null, text: 'IT PASSES. IT WAS ALWAYS GOING TO.' }],
  },

  // --- afterwards ---
  done: {
    rerouted: [
      'They went past our fires close enough to touch, and touched nothing.',
      'There is an old word for the tall ones. I had only ever heard it used to frighten children. It means the ones who walk the other way.',
      'We will leave the edge open when the star leans. Go well, sky-walker.',
    ],
    partial: [
      'Some came through. I watched them pass. Not all.',
      'We will leave the edge open when the star leans. It is not much. It is what there is.',
      'Go well, sky-walker.',
    ],
    unheeded: [
      'The edge was open and they would not come through it.',
      'I pulled my pickets for nothing. I would pull them again.',
      'Go well, sky-walker.',
    ],
    armed: [
      'The line held. Not one walker lost. I asked you for that and you gave it.',
      'It is very quiet at the edge now.',
      'Go well, sky-walker.',
    ],
    again: ['The camp does not stop. Go well.'],
  },

  // --- dying, and where it puts the pilot ---
  death: {
    heat: 'TOO FAR INTO THE DAY. BACK TO THE DUSK.',
    cold: 'TOO LONG IN THE NIGHT. BACK TO THE DUSK.',
    trampled: 'THEY WENT THROUGH THE LINE WHERE YOU STOOD. RENN IS STILL WAITING FOR AN ANSWER.',
    flare: 'CAUGHT IN THE OPEN WHEN IT CAME DOWN. RENN IS STILL WAITING FOR AN ANSWER.',
    night: 'THE NIGHT TOOK YOU BEFORE THE FLARE COULD. RENN IS STILL WAITING FOR AN ANSWER.',
    left: 'THE CAMP WAS LEFT BEFORE THE FLARE. RENN IS STILL WAITING FOR AN ANSWER.',
  },

  // --- the captains on the ground (E), by where the chapter is ---
  ground: {
    marrow: {
      early: ['A people who are never in the same place twice and are never lost. I would like to learn how that is done.'],
      edge: ['Everyone here is afraid of the dark side. I have noticed that nobody here has looked at it.'],
      after: ['The star is leaning back the other way. They have already started walking.'],
    },
    lux: {
      early: ['One side burns you and one side freezes you and they live in the gap. I respect it. I hate it.'],
      edge: ['I know what I think is out there. I would like very much to be wrong.'],
      after: ['Can we go? I am glad we came. Can we go?'],
    },
    vask: {
      early: ['Forty sledges. Each one hauled by hand. Nobody rides who can walk.'],
      edge: ['Three walkers lost, she said. Nobody has said how. I would like that number explained.'],
      after: ['They count their days by the lean of the star. It is a good clock. It has one hand.'],
    },
  },
  // --- back aboard: the debrief on the bridge, the first time after Renn's goodbye ---
  // Plain on purpose: what happened, what the choice did, and how they feel
  // about it. One set per way the flare went. [captain id, line]; a line whose
  // captain is gone is said by whoever is left, and with nobody left it is
  // shown as the pilot's own thought.
  debrief: {
    title: 'CHAPTER 2 — THE LONG DUSK',
    open: ['vask', 'Before we go anywhere. What happened down there, in plain words.'],
    rerouted: [
      ['marrow', 'The tall ones were never attacking the camp. They were parents, walking their young out from under the flare.'],
      ['vask', 'Their only way out ran past Renn\'s fires. You got the fires put out and turned all three groups through. All nine young got out.'],
      ['lux', 'And the camp lost nobody. Nobody on either side. I did not think that was possible.'],
      ['marrow', 'Renn knows what they are now. Her people will leave the edge open whenever the star leans.'],
    ],
    partial: [
      ['marrow', 'The tall ones were never attacking the camp. They were parents, walking their young out from under the flare.'],
      ['vask', 'You opened the edge and turned some of the groups through. Not all of them. Some young were still under it when it came down.'],
      ['lux', 'We got some out. I keep telling myself that. It is true, and it is not enough.'],
      ['marrow', 'Renn\'s people will leave the edge open from now on. That much we changed for good.'],
    ],
    unheeded: [
      ['marrow', 'The tall ones were never attacking the camp. They were parents, walking their young out from under the flare.'],
      ['vask', 'You opened the edge, but none of the groups were turned in time. They were all still under it when it came down.'],
      ['lux', 'We did the right thing and it did not work. I hate that both of those are true.'],
      ['marrow', 'Renn says she would pull her pickets again. So would I.'],
    ],
    armed: [
      ['vask', 'You gave Renn the cutting torches. The line held, and nobody in the camp was hurt.'],
      ['marrow', 'But the tall ones were not attacking. They were walking their young out from under the flare, and we turned them back into it.'],
      ['lux', 'Everyone in the camp is safe. I keep saying that because it is the part I can say.'],
      ['vask', 'It was a real choice and it is made. The log has both halves of it.'],
    ],
    close: ['lux', 'Can we go somewhere now? Somewhere new?'],
    complete: 'COMPLETE',
    // what the card says underneath: where the story goes from here
    nextCourse: 'SET A NEW COURSE FROM THE CHART AT THE HELM.',
    nextNone: 'NOTHING NEW IS CHARTED YET. THE NEXT CHAPTER IS STILL BEING WRITTEN.',
  },

  // ...and on the light ship's bridge, while it is here and before the flare
  talk: {
    marrow: ['One face always burning, one always frozen, and a people in between. I want to see who lives in the dark.'],
    lux: ['A star that flares. A world with one safe strip. Somebody down there has learned to run on schedule.'],
    vask: ['Tidally locked. It turns once for every time it goes round, so the star never moves. Almost never.'],
  },
};
