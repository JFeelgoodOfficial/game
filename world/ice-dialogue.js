// Under the Ice (world/ice-system.js, world/ice-surface.js, world/ice-ocean.js;
// GDD 5.7.9): every word of Season 1's third chapter, and every name in it.
// Rename freely: the code reads these and spells none of them.
//
// A crew line is { by, text, other, solo } (world/sceneClock.js crewSay): said
// by its captain if they are aboard, by whoever is if not (in `other[id]`'s
// words where given), and with nobody left it is `solo`. Timed lines are
// [seconds, line]. Debrief lines are [captain id, text] (world/basebridge.js).

export const ICE = {
  id: 'ice',
  label: 'UNDER THE ICE',
  world: 'THE ORPHAN',
  people: 'THE CALLERS',

  shelf: {
    label: 'THE BORE',
    approach: 'THE ORPHAN — NO STAR. YOUR OWN PAD LIGHTS HAVE YOUR HELM',
    welcome: 'THE BORE — A WORLD WITH NO SUN, AND AN OCEAN UNDER THE ICE THAT NEVER NEEDED ONE',
    dockLabel: 'AUTO-LANDING · THE BORE',
    leaveHint: 'YOUR FREIGHTER IS ON THE PAD',
    board: 'E — RIDE THE VESSEL DOWN',
    speaker: { name: 'The vessel', species: 'the submersible', cityId: 'The Bore' },
    boardLines: ['THE BORE IS MELTED THROUGH. FOUR KILOMETRES OF ICE, THEN WATER.', 'IT WILL START TO FREEZE SHUT BEHIND YOU. IT STAYS OPEN AS LONG AS THE VESSEL IS WARM.'],
    boardPrompt: 'GO DOWN?',
    go: 'GO DOWN',
    stay: 'NOT YET',
  },

  // --- the screen ---
  hud: {
    signal: 'SIGNAL  ',
    noRadio: 'SIGNAL  — SWITCH TO RADIO TO HEAR',
    answer: 'ANSWER  ',
    listen: 'LISTEN…',
    yours: 'YOUR TURN  1 · 2 · 3',
    follow: 'FOLLOW THEM',
    melt: 'ICE     ',
    pull: 'THE WATER IS GOING UP THE HOLE. PULL AWAY.',
    bore: 'BORE    ',
    toBore: 'BACK TO THE BORE',
    done: 'DONE — BACK TO THE LIGHT SHIP',
    board: 'BOARD THE VESSEL AT THE BORE',
  },
  keys: 'Q / E — BAND · L — LAMP · W A S D · SPACE / SHIFT',
  skip: 'E — SKIP',
  pads: ['LOW', 'MID', 'HIGH'],
  marks: { bore: 'BORE' },

  // --- on the ice ---
  arrive: [
    [3, { by: 'vask', text: 'No star. It was thrown out of wherever it was made and has been falling through the dark ever since.', other: { marrow: 'No sun at all. It left its star, or its star left it.', lux: 'There is no sun. There is just not a sun. Who lives like this?' }, solo: 'A WORLD WITH NO STAR. NOTHING HAS LIT THIS ICE IN A BILLION YEARS.' }],
    [12, { by: 'marrow', text: 'And still warm inside. Its own rock keeps the water liquid. It never needed anyone.', other: { vask: 'The core is still hot. Radioactive rock, mostly. Enough to keep an ocean.', lux: 'It is warm underneath? Under all that? On its own?' }, solo: 'ITS OWN CORE KEEPS AN OCEAN LIQUID UNDER THE ICE.' }],
  ],

  // --- the way down ---
  descent: [
    [1.5, { by: null, text: 'FOUR KILOMETRES OF ICE.' }],
    [7, { by: 'lux', text: 'I can hear the ice. Is it supposed to talk? It is talking.', other: { vask: 'The ice is under load. It will make noise. It is within tolerance.', marrow: 'Listen to it. It has never been touched before.' }, solo: 'THE ICE CREAKS ROUND THE HULL.' }],
    [14, { by: 'vask', text: 'Water under the keel. Black, and three degrees above freezing.', other: { marrow: 'We are through. There is a whole sea down here in the dark.', lux: 'We are in the water. There are no lights. Of course there are no lights.' }, solo: 'OPEN WATER. NO LIGHT IN IT BUT THE LAMP.' }],
  ],
  radioHint: 'NOTHING TO SEE DOWN HERE. STEP THE LAMP TO RADIO AND LISTEN.',
  turnHint: 'TURN THE VESSEL. THE SIGNAL IS STRONGEST WHERE IT POINTS AT THEM.',
  first: { by: 'marrow', text: 'That is not weather. That is a voice. Someone down here is calling.', other: { vask: 'Twenty-one centimetres. Regular. That is made, not natural.', lux: 'Something is calling. Out there. In the dark. Wonderful.' }, solo: 'A CALL ON THE 21 CM BAND. REGULAR. MADE BY SOMEONE.' },

  // --- the first one ---
  heard: [
    { by: 'vask', text: 'It has stopped. It knows we are here.', other: { marrow: 'It went quiet. It is listening to us.', lux: 'It stopped. Why did it stop?' }, solo: 'THE CALLING HAS STOPPED. IT KNOWS YOU ARE HERE.' },
    { by: 'marrow', text: 'It is calling in notes. Three of them. Give it its own notes back.', other: { vask: 'Three pitches, in a pattern. Repeat the pattern on the hull sounder.', lux: 'It is saying something. Say it back. Exactly the same. Please.' }, solo: 'IT CALLS IN THREE NOTES. ANSWER WITH THE SAME ONES: 1, 2, 3.' },
  ],
  wrong: 'NOT WHAT IT SAID. IT IS SAYING IT AGAIN.',
  right: ['IT HEARD ITS OWN CALL COME BACK.', 'A LONGER ONE.', 'AND AGAIN.'],
  answered: [
    [1.5, { by: null, text: 'IT ANSWERS. THEN OTHERS DO, FROM FURTHER OFF.' }],
    [7, { by: 'lux', text: 'There are more. There are a lot more. They are all coming here.', other: { vask: 'Eleven. Fourteen. All converging on us.', marrow: 'It has called its people to come and see.' }, solo: 'MORE OF THEM, COMING IN FROM THE DARK.' }],
    [14, { by: 'marrow', text: 'They think we are one of them. A stranger, from far water.', other: { vask: 'They are treating the hull as one of their own. A large one.', lux: 'They think we are from across the sea. Fine. Good. Let them.' }, solo: 'THEY TAKE THE VESSEL FOR ONE OF THEIR OWN, FROM FAR AWAY.' }],
    [20, { by: null, text: 'THEY ARE MOVING OFF, AND WAITING. FOLLOW THEM.' }],
  ],

  // --- where they live ---
  city: [
    [1.5, { by: null, text: 'VENTS IN THE SEA FLOOR. THE ONLY WARMTH FOR A THOUSAND KILOMETRES.' }],
    [7, { by: 'vask', text: 'Chimneys, cut and stacked. Gardens on every one. This was built.', other: { marrow: 'They have built on the warm places. Towers, and gardens on the towers.', lux: 'It is a town. It is an actual town. With gardens.' }, solo: 'THEY HAVE BUILT ON THE VENTS: TOWERS, AND GARDENS ON THE TOWERS.' }],
    [14, { by: 'marrow', text: 'Hear the long call? It goes out, touches the ice, and comes back. That is how they see their world.', other: { vask: 'They range with it. Out to the ice and back. The echo is their map.', lux: 'They shout at the ceiling and listen. That is their whole map.' }, solo: 'THEIR LONGEST CALL GOES OUT TO THE ICE AND COMES BACK. THE ECHO IS THEIR MAP.' }],
    [21, { by: 'lux', text: 'So to them the ice is the end of everything. There is water, and then there is the wall.', other: { marrow: 'And the map has an edge. The ice. Nothing in their world is past it.', vask: 'Their world is a closed shell. The ice is its outside. They have no word for beyond it.' }, solo: 'TO THEM THE ICE IS THE EDGE OF EVERYTHING. NOTHING IS BEYOND IT.' }],
    [27, { by: null, text: 'THEY ARE GOING UP. THEY WANT YOU TO SEE THE TOP OF THE WORLD.' }],
  ],

  // --- the roof of the world ---
  roof: [
    { by: 'vask', text: 'Thin here. A warm plume has been wearing at it. Eleven metres, where it is four kilometres everywhere else.', other: { marrow: 'The ice is thin here. They have brought us to the thinnest place they know.', lux: 'It is thin here. I can see how thin. I do not like that I can see it.' }, solo: 'THE ICE IS THIN HERE: ELEVEN METRES. A WARM PLUME HAS WORN IT AWAY.' },
  ],
  decide: {
    speaker: { name: 'The vessel', species: 'the submersible', cityId: 'The roof of the world' },
    lines: [
      'THE VESSEL\'S HEAT COULD OPEN THIS. THE PLUME UNDER IT WOULD KEEP IT OPEN.',
      'THROUGH THE HOLE: THE SKY. THEY HAVE NO WORD FOR IT.',
      'OPENED, IT STAYS OPEN. LEFT, NOTHING OF THEM GOES INTO THE ARCHIVE, AND NOTHING HERE SAYS YOU CAME.',
    ],
    // each captain's side, said before the question (Marrow and Lux are opposite; Vask counts)
    sides: [
      { by: 'marrow', text: 'Show them. They built a map with an edge on it. Nobody should live inside a map that is wrong.', solo: null },
      { by: 'lux', text: 'Leave them. They are not afraid of anything. Do you know what I would give for that? Do not take it from them.', solo: null },
      { by: 'vask', text: 'It cannot be undone either way. Open, it is open for good. Unseen, they stay as they are until someone else comes.', solo: null },
    ],
    prompt: 'THE ROOF OF THE WORLD',
    show: 'SHOW THEM THE SKY — OPEN THE ICE',
    leave: 'LEAVE THEM AS THEY ARE — ARCHIVE NOTHING',
  },
  show: {
    lines: ['NOSE UP, UNDER THE THIN PLACE. THE HULL DOES THE REST.'],
    hint: 'POINT THE VESSEL UP AT THE THIN ICE AND HOLD IT THERE.',
    crew: { by: 'lux', text: 'If this is wrong it is wrong forever. I am just saying it once.', other: { vask: 'Opening. Eleven metres. I will call it down.', marrow: 'Slowly. Let them see it open.' }, solo: null },
    breach: { by: 'vask', text: 'Through. The sea is going up the hole. Get clear of it.', other: { lux: 'It is pulling us! Back! Back!', marrow: 'It is open. The water is rushing to it. Pull away.' }, solo: 'THE ICE IS OPEN. THE WATER IS RUSHING UP THE HOLE.' },
  },
  leave: {
    lines: ['THE BORE IS FREEZING SHUT. THE VESSEL HAS BEEN AWAY FROM IT TOO LONG.'],
    hint: 'BACK TO THE BORE BEFORE IT CLOSES. ARCHIVE NOTHING.',
    crew: { by: 'marrow', text: 'They are following us. They do not know we are leaving.', other: { vask: 'They are keeping station on us. All of them.', lux: 'Do not look back at them. I am not looking back.' }, solo: null },
    minute: { by: 'vask', text: 'One minute of bore left.', other: { lux: 'One minute! The hole is closing!', marrow: 'The way out is closing. Hurry.' }, solo: 'ONE MINUTE BEFORE THE BORE FREEZES SHUT.' },
  },

  // --- how it ends, either way (the fixed event) ---
  sky: [
    [1.5, { by: null, text: 'THE SKY.' }],
    [8, { by: 'marrow', text: 'They have stopped calling. Every one of them. They are looking.', other: { vask: 'Radio silence, all bands. They have all turned to face it.', lux: 'They have gone quiet. All of them. Oh.' }, solo: 'THEY HAVE STOPPED CALLING. EVERY ONE OF THEM IS FACING THE HOLE.' }],
    [16, { by: 'vask', text: 'Their long call. It goes up the hole and it does not come back.', other: { marrow: 'They are calling up into it. And for the first time nothing answers.', lux: 'They shouted at it and nothing came back. There is no wall there.' }, solo: 'THEIR LONG CALL GOES UP THE HOLE, AND NO ECHO COMES BACK.' }],
    [24, { by: 'lux', text: 'I thought they would be afraid. They are not afraid. They are singing something new.', other: { marrow: 'Listen. That call is not on any of our recordings. They are making a word for it.', vask: 'A new pattern. Not in the log. I think they have just named it.' }, solo: 'A CALL YOU HAVE NOT HEARD BEFORE. THEY ARE MAKING A WORD FOR IT.' }],
    [31, { by: null, text: 'THEY KNOW NOW. THEY WERE ALWAYS GOING TO.' }],
  ],
  away: [
    [1.5, { by: null, text: 'UP THE BORE. IT CLOSES BEHIND THE HULL.' }],
    [8, { by: 'marrow', text: 'They are still calling. They think the stranger went home across the water.', other: { vask: 'They are still transmitting. Their pattern for us, repeated.', lux: 'They are still calling for us. Do not tell me what it means.' }, solo: 'THEY ARE STILL CALLING, FOR THE STRANGER WHO WENT HOME.' }],
    [16, { by: 'vask', text: 'We heard them from orbit through four kilometres of ice. So will the next ship.', other: { marrow: 'We found them by listening. Anyone can listen.', lux: 'We could hear them from space. So can anybody. So will somebody.' }, solo: 'YOU HEARD THEM FROM ORBIT. SO WILL THE NEXT SHIP THAT PASSES.' }],
    [24, { by: null, text: 'THEY WILL LEARN THEY ARE NOT ALONE. NOT TODAY. NOT FROM YOU.' }],
  ],

  // --- dying, and where it puts the pilot ---
  death: {
    vented: 'THE WATER TOOK THE VESSEL UP THE HOLE WITH IT. THE ROOF OF THE WORLD IS STILL SHUT.',
    sealed: 'THE BORE FROZE SHUT WITH THE VESSEL STILL UNDER IT. YOU ARE BACK AT THE ROOF OF THE WORLD.',
    left: 'THE VESSEL WAS TAKEN UP BEFORE IT WAS DONE. THE QUESTION IS STILL TO BE ANSWERED.',
  },

  // --- the captains on the ice (E), by where the chapter is ---
  ground: {
    marrow: {
      early: ['A whole world with nothing looking at it. I keep wanting to apologise to it for looking.'],
      after: ['I can still hear them, a little. I think I will for a while.'],
    },
    lux: {
      early: ['No sun, no neighbours, no schedule. It should feel safe. It does not feel safe.'],
      after: ['Can we go? I would like to be somewhere with a sun. Any sun.'],
    },
    vask: {
      early: ['Surface, forty kelvin. Ocean, two hundred and seventy-six. All of that difference is the planet\'s own.'],
      after: ['The bore is closed. I have logged where it was, and nothing else.'],
    },
  },
  // ...and on the light ship's bridge, while it is here and before the end
  talk: {
    marrow: ['A world with no star, and something is calling from inside it. I would like to answer.'],
    lux: ['A planet nobody owns, in a place nobody goes. If something lives there it has never had a bad day from outside.'],
    vask: ['Rogue planets outnumber stars, by some counts. Most are just cold. This one is transmitting.'],
  },

  // --- back aboard: the debrief on the bridge ---
  debrief: {
    title: 'CHAPTER 3 — UNDER THE ICE',
    open: ['vask', 'Before we set a course. What we did down there, in plain words.'],
    shown: [
      ['marrow', 'A people under four kilometres of ice thought the ice was the edge of everything. You opened it, and showed them the sky.'],
      ['vask', 'It cannot be closed. The warm plume under it will keep it open. They know there is an outside now, for good.'],
      ['lux', 'I said leave them. They were not afraid, and then they looked up, and they were still not afraid. I was wrong about what it would do to them.'],
      ['marrow', 'They made a new call for it. It is in the archive. The first word anyone ever had for our sky that was not ours.'],
    ],
    left: [
      ['lux', 'A people under the ice thought the ice was the edge of everything. You left them thinking it. They were happy, and they still are.'],
      ['vask', 'Nothing of them is in the archive. No recording, no chart. The bore is frozen shut.'],
      ['marrow', 'I said show them. I still think a map with a false edge is a kind of cage. But it was theirs, and you left it theirs.'],
      ['vask', 'They can be heard from orbit. Someone else will find them. We do not get to choose who.'],
    ],
    close: ['lux', 'Somewhere with a sun next. Please.'],
    complete: 'COMPLETE',
    nextCourse: 'SET A NEW COURSE FROM THE CHART AT THE HELM.',
    nextNone: 'NOTHING NEW IS CHARTED YET. THE NEXT CHAPTER IS STILL BEING WRITTEN.',
  },
};
