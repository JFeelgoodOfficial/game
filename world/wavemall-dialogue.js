// Authored dialogue for Wave Mall™ on wavemall prime (world/wavemallprime.js).
// Pure data, no THREE import — the pattern world/vendor-dialogue.js and
// world/actuality-dialogue.js established: every line below is hand-written,
// nothing is generated.
//
// The mall is themed on the Wave Collector album "Your Call is Important to
// Us", and the running joke is the transfer chain: you arrive as a caller
// whose call is FINALLY being answered in person, and every department head
// listens carefully and then transfers you to the next department up. Eight
// levels of it. Feluzia, on the top-floor stage, is where the hold queue ends.
//
// HEADS[level] — one named department head per level, pinned at `post`
// (level-local coordinates: the level slab is y=0, promenades 13<|x|<18.5,
// concourse/bridges |x|<11; L7's stage deck is +1.4). Shape:
//   { name, title,                    // speaker.name / speaker.species
//     post: { x, z, yaw, y? },        // fixed station; y only off-slab (L7)
//     prompt,                         // walkPromptText override ('E — ...')
//     greeting: { early, current, after, won? },  // lines[] per chain variant
//     nodes: { root: { prompt, options: [...] }, ... },
//     transferLines,                  // said when the transfer option is picked
//     winLines?,                      // L7 only — the end of the queue
//   }
// Option fields: label, lines, then AT MOST ONE of:
//   next: 'nodeKey'  — open that node's menu after the lines
//   codex: 'subject' — grant a codex entry (leaf: the thread ends here)
//   transfer: true   — advance the chain (tag wavemall:transfer:<level>)
//   win: true        — L7 only (tag wavemall:win)
// plus an optional `when` gate: 'current' | 'after' | 'won' | 'notWon'
// (default: always visible). Variants come from the chain stage vs the level:
// early = your call hasn't been transferred this far yet; current = this desk
// holds your call; after = you were already transferred onward; won = stage 8.
//
// DEPT_LINES[level] / PLAZA_LINES — flavor banks for the wandering employees
// and callers ({ employee, caller, farewell }); DEPT_CODEX[level] — ambient
// codex subjects the wanderers occasionally offer.

export const HEADS = [
  // ------------------------------------------------------------------ L0
  {
    name: 'Maribel',
    title: 'Home Decor Representative',
    post: { x: 4, z: 55, yaw: 0 },
    prompt: 'E — SPEAK TO MARIBEL',
    greeting: {
      early: [
        'Welcome to Home Decor. Furniture from across the universe, none of it touching the floor.',
      ],
      current: [
        'Caller #4,309,112? Oh, at LAST. You have been holding since 3041.',
        'I am Maribel, Home Decor. Your call is important to us. How may I complete your satisfaction today?',
      ],
      after: [
        'Caller #4,309,112! You were transferred UP, remember? Please continue holding — in person, on the correct floor.',
      ],
    },
    nodes: {
      root: {
        prompt: 'HOW MAY HOME DECOR SERVE YOU?',
        options: [
          { label: 'Why is the furniture floating?', lines: [
            'Grounded furniture is a policy failure. A sofa that hovers never scuffs, never settles, never admits defeat.',
            'The lamps bob because they are content. We check.',
          ], next: 'decor' },
          { label: 'About that big window...', lines: [
            'Three moons, yes. They orbit on the quarter hour. Corporate insists it is a window; I have never found the glass.',
          ], next: 'decor' },
          { label: 'I need to make a purchase.', lines: [
            'A purchase! Wonderful. Let me just pull up your file... oh. Oh dear.',
            'You\'ll need electronics for that! Let me transfer you to Glastelle.',
          ], transfer: true, when: 'current' },
          { label: 'Just admiring the sofas.', lines: [
            'They admire you back. Thank you for holding with Wave Mall.',
          ] },
        ],
      },
      decor: {
        prompt: 'ANYTHING ELSE?',
        options: [
          { label: 'What are those glowing plants?', lines: [
            'Venusian wall plants. Bioluminescent, self-watering, mildly opinionated. They drop a seed when they approve of a customer.',
            'They have never dropped one for me. Twelve years.',
          ], codex: 'Wave Mall: Venusian Wall Plants' },
          { label: 'Do the carpets really slow you down?', lines: [
            'The galaxy swirl is woven from patience fibre. Walk it slowly. The mall was designed to be held in, not hurried through.',
          ], next: 'root' },
          { label: 'That\'s all.', lines: ['Your satisfaction remains our directive.'] },
        ],
      },
    },
    transferLines: [
      'Transferring now. Do not hang up, do not put down your body.',
      'Glastelle is one level up — ride the escalator behind me and keep left at the singing lamps.',
      'She studied minds in orbit, so whatever you actually needed, she will know better. Hold music will follow you up. It always does.',
    ],
  },

  // ------------------------------------------------------------------ L1
  {
    name: 'Glastelle',
    title: 'Orbital Psychologist · Venusian Institute',
    post: { x: -16, z: 10, yaw: Math.PI / 2 },
    prompt: 'E — SPEAK TO GLASTELLE',
    greeting: {
      early: [
        'You are early. Your call has not reached this altitude yet. Sit anywhere — the chairs orbit back around.',
      ],
      current: [
        'Ah. Caller #4,309,112, transferred from Home Decor. Breathe in. Notice the gas. It is a SAFE gas environment.',
        'I am Glastelle. Orbital Psychology, Venusian Institute, class of 3042. Everything you feel in this department is intentional.',
      ],
      after: [
        'You again. Your call has moved on, but your orbit clearly decays back to me. Flattering. Keep holding.',
      ],
    },
    nodes: {
      root: {
        prompt: 'WHAT ORBITS YOUR MIND?',
        options: [
          { label: 'What is orbital psychology?', lines: [
            'Every mind is a satellite. It circles what it wants, at a distance it can survive.',
            'My job is adjusting the distance. The wanting takes care of itself.',
          ], next: 'orbit' },
          { label: 'The 3042 allegations?', lines: [
            'I want to be extremely clear: the Venusian gases in this department cause no brain damage of any kind.',
            'The Institute settled that matter in 3042, and the seventeen affected researchers are all, to my knowledge, very happy clouds now.',
            'Next question.',
          ], codex: 'Wave Mall: The 3042 Allegations' },
          { label: 'I was told you handle electronics.', lines: [
            'Electronics? No, no. I handle the psychology OF electronics. The devices themselves are a different desk.',
            'Electronics! You need to talk to Xavier. Let me transfer you.',
          ], transfer: true, when: 'current' },
          { label: 'End the session.', lines: [
            'Session logged. Your call remains important, whatever a call is.',
          ] },
        ],
      },
      orbit: {
        prompt: 'THE INSTITUTE…',
        options: [
          { label: 'What\'s in the floating orbs?', lines: [
            'Planetary atmospheres, bottled. Venus, mostly. The purple clouds outside the wall are also Venus. The wall itself may be Venus.',
            'The Institute recommends not asking which side of the glass you are on. It disrupts harmony.',
          ], codex: 'Wave Mall: The Venusian Institute' },
          { label: 'Why does gravity feel wrong here?', lines: [
            'It is not wrong, it is CURATED. The chambers cycle so your mind learns that up is negotiable.',
            'Understand. Harmonize. Ascend. Mostly ascend — the escalator is right there.',
          ], next: 'root' },
          { label: 'That\'s enough psychology.', lines: ['It is never enough. Goodbye.'] },
        ],
      },
    },
    transferLines: [
      'Transferring your call to Xavier, Electronics Department, one level up.',
      'A word of preparation: Xavier is from a world of fewer than one hundred thousand people, and he counts you as a rounding error he is fond of.',
      'While the hold music plays, remember: the gases are safe. The gases have always been safe.',
    ],
  },

  // ------------------------------------------------------------------ L2
  {
    name: 'Xavier',
    title: 'Electronics · World of Few',
    post: { x: 16, z: -10, yaw: -Math.PI / 2 },
    prompt: 'E — SPEAK TO XAVIER',
    greeting: {
      early: [
        'The signals said someone was coming, but not yet. The signals are rarely wrong. Browse quietly.',
      ],
      current: [
        'Caller #4,309,112. I knew before the transfer arrived — the star field behind me flagged an anomalous signal, and it was you.',
        'I am Xavier. Electronics. On my world we are fewer than one hundred thousand, so each visitor is statistically an event.',
      ],
      after: [
        'You were transferred onward. The circuits remember you fondly. That is not a figure of speech.',
      ],
    },
    nodes: {
      root: {
        prompt: 'WHAT DOES YOUR SIGNAL REQUIRE?',
        options: [
          { label: 'Where are you from?', lines: [
            'A small world. Under one hundred thousand of us, all told. No name you could carry — it does not compress.',
            'We build machines that miss people. Export quality.',
          ], next: 'world' },
          { label: 'What is Teletronic Psy Support?', lines: [
            'Our premium service tier. A trained teletronic empath rides the line with your call and feels the obstacles before they appear.',
            'You have had it since level one. Have you not noticed things going almost wrong, and then not?',
          ], codex: 'Wave Mall: Teletronic Psy Support' },
          { label: 'So — the electronics I need?', lines: [
            'Yes. I have reviewed your file, and the device you require is technically a gift.',
            'Gifts are a different department. Mine, also — but the OTHER mine. I am transferring you to Xavier.',
            'Do not be alarmed when he turns out to be me.',
          ], transfer: true, when: 'current' },
          { label: 'Sign off.', lines: [
            'Signing off. The boomboxes will hum your frequency until you return.',
          ] },
        ],
      },
      world: {
        prompt: 'THE WORLD OF FEW…',
        options: [
          { label: 'Why did you leave?', lines: [
            'When there are so few of you, everyone is essential, and being essential is heavy.',
            'Here I am one associate among thousands. It is the closest thing to floating I have found. Well — that, and the sofas downstairs.',
          ], codex: 'Wave Mall: Xavier\'s World' },
          { label: 'What are those humming gift boxes?', lines: [
            'Inventory from home. They arrive addressed to people who have not been born yet. We hold them. Retail is mostly holding.',
          ], next: 'root' },
          { label: 'Enough.', lines: ['The signal fades. It always returns.'] },
        ],
      },
    },
    transferLines: [
      'Transferring you… to myself. One level up. The paperwork insists we are two people, and the paperwork has never been wrong about anything else.',
      'Take the escalator under the hanging cables — they buzz, but only socially.',
      'Upstairs-me is expecting you. He has been expecting you longer than I have, which we do not discuss.',
    ],
  },

  // ------------------------------------------------------------------ L3
  {
    name: 'Xavier',
    title: 'Xavier\'s Gifts · Proprietor',
    post: { x: -16, z: 10, yaw: Math.PI / 2 },
    prompt: 'E — SPEAK TO XAVIER',
    greeting: {
      early: [
        'You have not been transferred to me yet. And yet here you are. The portal does that to schedules.',
      ],
      current: [
        'There you are. Downstairs-me spoke highly of you, which is to say, I did.',
        'Welcome to Xavier\'s Gifts. Everything here is from somewhere that does not officially exist, wrapped for occasions that have not officially happened.',
      ],
      after: [
        'Transferred onward, and still visiting? You may keep the feeling of a gift. That one is free.',
      ],
    },
    nodes: {
      root: {
        prompt: 'WHAT MAY THE GIFTS DO FOR YOU?',
        options: [
          { label: 'Are you the same Xavier?', lines: [
            'Legally, no. Personally, entirely. The mall required a proprietor on two levels and I have always been generous with myself.',
            'We split the memories evenly. He keeps the circuits; I keep the wrapping paper.',
          ], next: 'gifts' },
          { label: 'What\'s behind the portal?', lines: [
            'Home, probably. The star maps in this room chart planets nobody has claimed, and one of them hums when I stand near it.',
            'The clocks on the wall keep its time zones. All of them are 3042 there. Do not read into that.',
          ], next: 'gifts' },
          { label: 'A strange gift, for me?', lines: [
            'Yes — it chose you when you walked in. A small box, glowing runes, contents unknowable until needed. Standard.',
            'It reveals paths that were always there. Hidden platforms, if you like.',
          ], codex: 'Wave Mall: The Strange Gift' },
          { label: 'What I actually need is—', lines: [
            'Clothes. I know. The gift knew first.',
            'Men\'s Casualwear. You need clothes for your journey. Ramda is waiting.',
          ], transfer: true, when: 'current' },
          { label: 'Farewell.', lines: ['Farewell. The runes will dim politely until you pass again.'] },
        ],
      },
      gifts: {
        prompt: 'AND SO…',
        options: [
          { label: 'Who buys these artifacts?', lines: [
            'Nobody buys. They are all gifts, waiting. A sculpture rolled off its plinth last week and parked itself by the escalator — someone due upstairs, I assume.',
          ], next: 'root' },
          { label: 'Back to my errand.', lines: ['Of course. Errands are just gifts you give a queue.'] },
        ],
      },
    },
    transferLines: [
      'Transferring your call to Ramda, Men\'s Casualwear, one level up.',
      'She was born in the Ramda Quadrant, she is the most cheerful employee this mall has ever certified, and she will ask what your numbers are. Have numbers.',
      'Take the gift. It fits in the same pocket as the hold music.',
    ],
  },

  // ------------------------------------------------------------------ L4
  {
    name: 'Ramda',
    title: 'Men\'s Casualwear · Ramda Quadrant',
    post: { x: 16, z: -10, yaw: -Math.PI / 2 },
    prompt: 'E — SPEAK TO RAMDA',
    greeting: {
      early: [
        'Hello hello! You\'re a FOUR, I can tell from here. Fours always browse before their call arrives. Wonderful!',
      ],
      current: [
        'Caller #4,309,112! Add those digits — four, three, zero, nine, one, one, two — TWENTY! Two plus zero! TWO! A partnership number!',
        'I\'m Ramda! Born in the Ramda Quadrant, most cheerful employee eleven years running, and I am SO glad your call is finally a person.',
      ],
      after: [
        'You were transferred up already, you lovely two! But numbers circle back. That\'s what makes them numbers!',
      ],
    },
    nodes: {
      root: {
        prompt: 'WHAT DO YOUR NUMBERS NEED?',
        options: [
          { label: 'Why is everything numbered 1 to 9?', lines: [
            'Because those are all the numbers! Everything else is just ones through nines wearing coats.',
            'Every price tag here reduces to its true digit. The mirrors show your reflection from other worlds, but the NUMBERS are the same everywhere. Isn\'t that comforting?!',
          ], next: 'numbers' },
          { label: 'The Ramda Quadrant?', lines: [
            'Home! A whole quadrant, and every star in it counted and named by hand. My family did stars four through nine hundred.',
            'Out there, "Ramda" isn\'t a name, it\'s a UNIT. Of cheerfulness. I am several.',
          ], codex: 'Wave Mall: The Ramda Quadrant' },
          { label: 'Clothes for my journey, please.', lines: [
            'YES! Let me measure you numerologically... you\'re a two, traveling as a seven, holding since 3041 — carry the one—',
            'Oh! Oh, this is a NINE situation. I can\'t fit a nine here. But I know who can!',
            'Transferring you to Ramda. The department! Where everyone is me! You\'ll love it!',
          ], transfer: true, when: 'current' },
          { label: 'Goodbye, Ramda.', lines: [
            'Goodbye! Count your steps to the escalator — if it\'s a multiple of three, today is lucky! It will be!',
          ] },
        ],
      },
      numbers: {
        prompt: 'MORE NUMBERS?!',
        options: [
          { label: 'One plus two is...?', lines: [
            'THREE! Oh, you\'re a natural. That\'s the whole of numerology, you know. The rest is enthusiasm.',
          ], next: 'root' },
          { label: 'Do the mannequins rotate on purpose?', lines: [
            'Everything rotates on purpose! Orbits, mannequins, careers. The dressing room doors open and close on a nine-count. Mind the fours.',
          ], next: 'root' },
          { label: 'No more numbers.', lines: ['There are ALWAYS more numbers. But go, go!'] },
        ],
      },
    },
    transferLines: [
      'Transferring! One level up — that\'s a ONE, a beginning number, how PERFECT.',
      'The whole department is named Ramda and staffed by Ramdas. Ask for Ramda. You can\'t get it wrong!',
      'Sporting Goods comes after — Feluzia will help you. She\'s the best dancer! But numbers first! Transferring!',
    ],
  },

  // ------------------------------------------------------------------ L5
  {
    name: 'Ramda',
    title: 'RAMDA Dept. · Also Ramda',
    post: { x: -16, z: 10, yaw: Math.PI / 2 },
    prompt: 'E — SPEAK TO RAMDA',
    greeting: {
      early: [
        'Welcome to RAMDA! I\'m Ramda! Your call hasn\'t reached us yet, but pre-holding is still holding, and we cherish it!',
      ],
      current: [
        'Caller #4,309,112, transferred from Ramda, received by Ramda! The paperwork is a single beautiful circle!',
        'Everyone in this department is named Ramda. We have won "Most Cheerful Employee" every year it has existed. All of us. Collectively. It\'s on a plaque!',
      ],
      after: [
        'You moved on up, and we cheered! We cheer for everything here. It\'s in the handbook. Ramda wrote it! (All of us.)',
      ],
    },
    nodes: {
      root: {
        prompt: 'HOW MAY RAMDA HELP?',
        options: [
          { label: 'Which Ramda are you?', lines: [
            'The one you\'re talking to! Downstairs Ramda is Casualwear-Ramda; I\'m Timepieces-and-Numerals-Ramda; the one by the conveyor is Conveyor-Ramda.',
            'On payday the manager just shouts "Ramda!" once and we all feel appreciated. Efficient!',
          ], next: 'ramdas' },
          { label: 'What does this department sell?', lines: [
            'Timepieces, numerals, and curios! Mostly we sell the FEELING of numbers going up. Our conveyor belts carry the merchandise in ascending order and customers just watch. For hours!',
          ], next: 'ramdas' },
          { label: 'My clothes? My journey?', lines: [
            'Oh, your NINE situation! Casualwear-Ramda called up about you — well, she called herself, but we listened!',
            'The truth is, what you need was never clothes. It\'s momentum!',
            'Sporting Goods! Feluzia is the champion dancer. She\'ll help you shop! Going now!',
          ], transfer: true, when: 'current' },
          { label: 'Bye, all of you.', lines: [
            'Bye from ALL of us! That\'s a lot of goodbyes! Take as many as you need!',
          ] },
        ],
      },
      ramdas: {
        prompt: 'AND ALSO…',
        options: [
          { label: 'The glowing number stickers?', lines: [
            'Glow-in-the-dark ones through nines! We stick them on things that deserve encouragement. You have three on your back. They were EARNED.',
          ], codex: 'Wave Mall: Ramda (All of Them)' },
          { label: 'Solve me a puzzle: 1 + 2?', lines: [
            'Three! And three is the number of levels you have left! We did the math the moment you walked in. We\'re so excited for you!',
          ], next: 'root' },
          { label: 'That\'s plenty.', lines: ['It\'s never plenty, but it IS enough! Go go go!'] },
        ],
      },
    },
    transferLines: [
      'Transferring your call to Feluzia, Sporting Goods, one level up!',
      'She\'s from the World of Wundum and she is the CHAMPION dancer — not a champion, THE champion. There\'s an arena behind her wall that agrees!',
      'All of Ramda is cheering as you ride the escalator. You won\'t hear it over the hold music, but feel free to feel it!',
    ],
  },

  // ------------------------------------------------------------------ L6
  {
    name: 'Feluzia',
    title: 'Sporting Goods · World of Wundum',
    post: { x: 16, z: -10, yaw: -Math.PI / 2 },
    prompt: 'E — SPEAK TO FELUZIA',
    greeting: {
      early: [
        'Early! I like early. Early is just on time, with ambition. Stretch first. The balls bounce back on their own here.',
      ],
      current: [
        'Caller #4,309,112 — the one the whole building has been transferring! Welcome to Sporting Goods. I felt your footwork on the escalator. Promising.',
        'I am FELUZIA of the World of Wundum. Champion dancer. The crowds in that arena wall? They cheer when I restock shelves. It\'s a lot. I love it.',
      ],
      after: [
        'You\'re due upstairs, superstar. The stage doesn\'t warm itself. Well — it does, but only for you.',
      ],
    },
    nodes: {
      root: {
        prompt: 'READY TO MOVE?',
        options: [
          { label: 'The World of Wundum?', lines: [
            'A whole planet with one arena, and the arena is the planet. On Wundum, walking IS dancing done shy.',
            'I won the championship dancing against gravity itself. Gravity took it well. We still train together — that\'s what the zero-g aisle is for.',
          ], codex: 'Wave Mall: Feluzia of Wundum' },
          { label: 'Why is there a dance floor in Sporting Goods?', lines: [
            'Because sport IS dance with a scoreboard! The floor lights teach rhythm; the conveyor teaches timing; the bouncing balls teach humility.',
            'Customers who dance a full pattern get ten percent off. Nobody has finished one. The discount compounds. It waits.',
          ], next: 'root' },
          { label: 'I was told you\'d help me shop.', lines: [
            'And I will — but not here. Look at you: you\'ve held for a year, climbed seven floors, carried the music the whole way.',
            'What you need isn\'t equipment. It\'s a FINALE.',
            'Meet me on the top floor. The stage at the far end. I\'ll be there before you — champion\'s privilege.',
          ], transfer: true, when: 'current' },
          { label: 'Cool down. Goodbye.', lines: [
            'Cool-downs matter! Walk it off past the jerseys — duck, they hang low. See you at the top.',
          ] },
        ],
      },
    },
    transferLines: [
      'Transferring your call to... me. Final level. FELUZIA. The department is named after me because I earned the sign.',
      'Ride the last escalator and walk the length of the floor — the stage is at the far end, past the trophies.',
      'When you step onto that stage, caller, the hold music ends. I promise you. Now GO. Dance the escalator if you can!',
    ],
  },

  // ------------------------------------------------------------------ L7
  {
    name: 'Feluzia',
    title: 'Champion Dancer · Worlds\' Best',
    post: { x: 0, y: 1.4, z: -48, yaw: 0 },
    prompt: 'E — SPEAK TO FELUZIA',
    greeting: {
      early: [
        'The stage is warm and you are EARLY, caller. I admire it. But a finale needs its verses — go get transferred properly. I\'ll wait. Champions are patient.',
      ],
      current: [
        'AND HERE YOU ARE. Caller #4,309,112, escalated through every department, holding since 3041 — and STILL ON THE LINE.',
        'Do you hear that? The crowd. The confetti rig. The album, at full volume. This is what the end of a hold queue sounds like.',
      ],
      after: [
        'Look who came back to the stage! It remembers your win. Stages are sentimental like that.',
      ],
      won: [
        'The champion returns! The scoreboard still says YOU WIN, and I refuse to let anyone reset it.',
        'Feluzia keeps her promises: no more hold music. Ever. Listen — just the crowd, and you.',
      ],
    },
    nodes: {
      root: {
        prompt: 'THE FINAL DEPARTMENT.',
        options: [
          { label: 'So... what was I shopping for?', lines: [
            'Caller, nobody remembers. Not you, not the mall, not the seventeen departments that transferred you. That was never the point.',
            'You held. You climbed. You arrived. THAT was the order, and it is ready for pickup.',
          ], next: 'root', when: 'notWon' },
          { label: 'The trophies?', lines: [
            '"Worlds\' Best Dancer." Plural. You don\'t get the apostrophe there without beating more than one world.',
            'Wundum, the Ramda Quadrant invitational, the Venusian low-cloud circuit — undefeated. Glastelle reviewed my brain afterward. Perfectly safe. Allegedly.',
          ], codex: 'Wave Mall: Worlds\' Best Dancer' },
          { label: 'End this call. Complete my journey.', lines: [
            'Then take your mark, caller. Center stage. Spotlights up. Confetti armed.',
            'One. Two. Three-four-five-six-seven-EIGHT—',
          ], win: true, when: 'current' },
          { label: 'Dance with me sometime.', lines: [
            'Careful what you ask a champion. I\'ll pencil you in between worlds.',
          ], when: 'won' },
          { label: 'Just taking in the stage.', lines: [
            'Take it all in. Stages are the one place holding still counts as dancing.',
          ] },
        ],
      },
    },
    transferLines: [],
    winLines: [
      'You found what you need! I\'m Feluzia, champion dancer! YOU WIN!',
      'Caller #4,309,112, after one year, eight departments and six transfers — Wave Mall thanks you for holding. Your call was ALWAYS important to us.',
      'The confetti is yours. The crowd is yours. The silence after the hold music? Also yours. Wear it well, champion.',
    ],
  },
];

/* ----------------------------------------------------------------------
 * Flavor banks for the wandering crowds — employees speak their floor,
 * callers speak the queue. Farewells keep the hold-line register.
 * ------------------------------------------------------------------- */
export const DEPT_LINES = [
  { // L0 HOME DECOR
    employee: [
      'The sofas drift left in the morning and right after lunch. We let them.',
      'Please don\'t water the wall plants. They find that forward.',
      'Every rug is woven with a real galaxy pattern. Two are woven with real galaxies. We lost track of which.',
      'The coffee tables are from the 80s. Which 80s, the manifest doesn\'t say.',
      'If a lamp bobs toward you, it\'s bonding. Congratulations.',
    ],
    caller: [
      'I ordered a chair in 3041. I\'m starting to think the chair is holding for ME.',
      'The moons out that window did a full lap while I waited. Lovely, though.',
      'They said my satisfaction was their directive. I felt very seen, and then very transferred.',
      'This carpet slows you down on purpose. I\'ve made peace with it. I had time to.',
    ],
    farewell: [
      'Your call is important to us.',
      'Thank you for holding among the furniture.',
      'Please continue to browse in a state of hold.',
    ],
  },
  { // L1 GLASTELLE
    employee: [
      'The gas is safe. The gas has always been safe. Please enjoy the gas.',
      'Test tubes roll across the floor on a schedule. It\'s called ambiance, and also a hazard, and also science.',
      'Your mind is a satellite. Ask the desk about adjusting your orbit. Ask calmly.',
      'The 3042 posters are promotional, historical, and legally settled. In that order.',
      'If you feel briefly smaller in the gas clouds, that\'s the atmosphere being playful.',
    ],
    caller: [
      'I came in for headphones and got my orbit adjusted. I do feel more harmonious. Still no headphones.',
      'The purple clouds whispered something about Venusian gases. Or I did. We\'re very close now.',
      'I read every orbital diagram on that wall. I understand circles now. Deeply.',
      'A researcher told me she was "very happy clouds now." I didn\'t press.',
    ],
    farewell: [
      'Understand. Harmonize. Ascend.',
      'Your call remains in a stable orbit.',
      'Please hold. The gas will keep you company.',
    ],
  },
  { // L2 ELECTRONICS
    employee: [
      'The VCRs predate the mall, the planet, and possibly the concept of recording.',
      'That star field window flags anomalous signals. Today it flagged you, twice. Welcome!',
      'The digital watches all tick in unison except one. We\'re watching it. It\'s watching us.',
      'Teletronic Psy Support is included with every purchase and, frankly, with every non-purchase.',
      'Please don\'t answer the boombox if it addresses you by name.',
    ],
    caller: [
      'A holographic screen flashed my order number. From 3041. It\'s progress. It\'s SOMETHING.',
      'I bought a digital watch here once. It ticks backward on hold days. So, always.',
      'The cables hanging from the ceiling buzz when you walk under them. I think it\'s a greeting protocol.',
      'The gift boxes float. Nobody explains it. I stopped asking around box thirty.',
    ],
    farewell: [
      'Your signal is important to us.',
      'Please hold — your call is being compressed for quality.',
      'Transmission ends. The hum remains.',
    ],
  },
  { // L3 XAVIER'S GIFTS
    employee: [
      'Every artifact is labeled in a language that hasn\'t reached us yet. We shelve by glow.',
      'The portal in the back is decorative, load-bearing, and occasionally a door. Gift wrap is free.',
      'The clocks show different time zones. All of them say you should have been transferred by now.',
      'If a sculpture rolls past, it\'s restocking itself. Retail is mostly holding still while things happen.',
      'The runes flash when a gift finds its person. It\'s been flashing since you walked in.',
    ],
    caller: [
      'A gift box hummed at me and I said thank you. We\'re both embarrassed.',
      'I came to buy a present for my cousin. A present for me found itself instead. The system works.',
      'The star maps show planets nobody\'s named. One had a price tag. A NINE, reduced.',
      'Someone told me Xavier is two people. Someone else told me he\'s fewer than that.',
    ],
    farewell: [
      'Your gift is important to us.',
      'Please hold — your occasion is being wrapped.',
      'May your runes glow gently.',
    ],
  },
  { // L4 MEN'S CASUALWEAR
    employee: [
      'Every price reduces to a single digit. Every digit is on sale. It\'s a beautiful system.',
      'The mirrors show your reflection from other worlds. The other-you has better posture. Aspirational retail!',
      'The mannequins rotate to face the escalators. They like watching people ascend. It\'s sweet, mostly.',
      'Zero-G Denim never wrinkles. It never touches anything. That\'s the whole technology.',
      'The dressing room doors open on a nine-count. Fours are... transitional.',
    ],
    caller: [
      'I tried on a jacket from another world\'s mirror. It fit the other me perfectly.',
      'The clerk added up my caller number and hugged me. I\'m a two, apparently. A partnership number!',
      'I ducked under the hanging fabrics like everyone else. It\'s basically the department\'s handshake.',
      'The price tags only go one to nine. I asked about tax. She laughed for a long, cheerful time.',
    ],
    farewell: [
      'Your ensemble is important to us.',
      'Please hold — your size is being recalculated joyfully.',
      'Count your blessings. Then reduce them to one digit.',
    ],
  },
  { // L5 RAMDA
    employee: [
      'Yes, I\'m Ramda. She\'s Ramda. The one restocking threes is also Ramda. It saves SO much time!',
      'We won Most Cheerful Employee again this year! We\'re having a plaque made. For all of us. One plaque!',
      'The conveyor carries the numbers in ascending order. On slow days we ride it. Ascending!',
      'The murals go one through nine and then start over, like all good things!',
      'Would you like a glow-in-the-dark number sticker? You\'ve earned a seven! Everyone\'s earned a seven!',
    ],
    caller: [
      'I asked for the manager. Forty people said "yes?" It was the warmest moment of my year on hold.',
      'A Ramda solved my whole week on a numerology chart. I\'m due a lucky Thursday. THIS Thursday.',
      'The calendars here have numbered dates. I mean — they all do. But here they\'re PROUD of it.',
      'I watched the number murals flash for an hour. I can confirm: one through nine, every time.',
    ],
    farewell: [
      'Your digits are important to us!',
      'Please hold! Cheerfully! Like we do!',
      'One through nine, and back to you!',
    ],
  },
  { // L6 SPORTING GOODS
    employee: [
      'The balls bounce on their own after closing. We rack them anyway. It\'s a ritual by now.',
      'The arena crowd cheers when you pick anything up. Put it down slowly or they do the wave.',
      'Feluzia demonstrates the zero-g gear by dancing in it. Sales spike. Gravity sulks.',
      'The dance floor is regulation. The regulation is Wundum\'s. Wundum\'s regulations are dances.',
      'Jerseys from forty planets, and every single one hangs low. Duck. It\'s cardio.',
    ],
    caller: [
      'I dodged a bouncing ball into a net into a conveyor. The crowd on the wall gave me a standing ovation.',
      'I tried to walk across the dance floor normally. My feet had other choreography.',
      'Someone said the champion dancer works this floor. Then she dunked a restock from mid-air.',
      'I\'ve held so long I\'ve gotten FIT. This department is the only queue with a warm-up.',
    ],
    farewell: [
      'Your form is important to us.',
      'Please hold — stretching counts as holding.',
      'Hydrate. Ascend. Repeat.',
    ],
  },
  { // L7 FELUZIA
    employee: [
      'The stage lights find Feluzia wherever she stands. We just aim the leftovers at the merch.',
      'The confetti rig is armed at all times. Retail readiness, championship edition.',
      'Every trophy says Worlds\' Best. Plural. Check the apostrophe before you ask.',
      'The album plays start to finish, all day. By closing time the mannequins are in formation.',
      'The green room is for champions and callers who\'ve held over a year. You qualify, incidentally.',
    ],
    caller: [
      'I made it to the top floor. My hold music sounds... proud of me?',
      'I saw the stage from the escalator and my caller number started glowing. That\'s normal here, apparently.',
      'The crowd on the backdrop cheered my name. I never gave it to anyone. I\'ve stopped being scared of that.',
      'Eight levels. I counted. A Ramda helped.',
    ],
    farewell: [
      'Your finale is important to us.',
      'Please hold for the drop.',
      'The stage will remember you.',
    ],
  },
];

// The plaza outside the doors — the queue before the queue. Keeps the original
// generic register (some lines carried over from the old bank) plus doc flavor.
export const PLAZA_LINES = {
  employee: [
    'Your satisfaction is our directive.',
    'How may Wave Mall serve you today?',
    'Every transfer is an opportunity for excellence.',
    'The escalators run continuously. So do we.',
    'Eight departments, one queue, zero unanswered calls. Several unanswered questions.',
    'The heads of every department are at their posts. They are ALWAYS at their posts. Don\'t think about it.',
  ],
  caller: [
    'I was just on hold...',
    'I think I ordered something. I forget what.',
    'They said an operator was coming. That was a while ago.',
    'Do you know where Feluzia\'s stage is? I want to see how it ends.',
    'Eight levels. I have been to five. I think.',
    'Someone finished the whole queue once. They say she danced. They say there was confetti.',
    'The hold music follows you inside. It\'s better on the upper floors. More hopeful.',
  ],
  farewell: [
    'Your call is important to us.',
    'Please hold. Please hold. Please—',
    'Thank you for shopping at Wave Mall.',
  ],
};

/* ----------------------------------------------------------------------
 * Ambient codex pool — what a wandering shopper might point your codex at.
 * Replaces the old bare `wavemall-lore-<n>` subjects with authored ones.
 * ------------------------------------------------------------------- */
export const DEPT_CODEX = [
  ['Wave Mall: Furniture That Refuses the Floor', 'Wave Mall: The Three Moons Window'],
  ['Wave Mall: Safe Gas Environments', 'Wave Mall: Orbital Psychology'],
  ['Wave Mall: Anomalous Signals', 'Wave Mall: The Unison Watches'],
  ['Wave Mall: Gifts Addressed to the Unborn', 'Wave Mall: The Decorative Portal'],
  ['Wave Mall: Mirrors From Other Worlds', 'Wave Mall: Single-Digit Pricing'],
  ['Wave Mall: Most Cheerful Employee (Shared)', 'Wave Mall: The Ascending Conveyor'],
  ['Wave Mall: The Arena Behind the Wall', 'Wave Mall: Regulation Dance Floors'],
  ['Wave Mall: The Confetti Rig', 'Wave Mall: The End of the Hold Music'],
];

export const PLAZA_CODEX = [
  'Wave Mall: The Queue Before the Queue',
  'Wave Mall: Caller #4,309,112',
];
