// Static, hand-authored branching dialogue trees for the permanent-city
// vendor NPCs (world/vendors.js). Adapted from the game's citizen dialogue
// reference (Greeting -> player choices -> responses, nested follow-ups,
// always a way to say goodbye), with one voice variant per world mood so a
// neon-port merchant and a dust-flat merchant never share a mouth.
//
// NO generated dialogue anywhere: every line below is authored text. Dynamic
// state enters ONLY through {{placeholders}}, filled at interact time by
// world/vendors.js fill() — {{cityName}}, {{worldName}}, {{wonderName}},
// {{vendorName}}, {{goods}}, {{craft}}, {{crop}}, {{lowCrop}}, {{stock}},
// {{daypart}}.
//
// Shape:
//   VENDOR_TREES[role][voice] = {
//     greeting: [line, ...],           // said once when talked to
//     nodes: {
//       root: { prompt, options: [{ label, lines: [...], next }] },
//       ...                            // next: another node key, or null = close
//     },
//   }
// Every node keeps a 'Say goodbye' option (next: null). Roles carry only the
// voices their cities actually use (world/cityRegistry.js) plus 'default'
// for any future city. Labels stay short — the dialogue panel is 620 px.

export const ROLE_TITLES = {
  merchant: 'Merchant',
  farmer: 'Farmer',
  gardener: 'Gardener',
  artisan: 'Artisan',
  caretaker: 'Caretaker',
  scholar: 'Scholar',
  guide: 'Tourist Guide',
  apprentice: 'Apprentice',
  elite: 'Patron',
  entertainer: 'Entertainer',
};

// Role-default {{var}} nouns, overridden per vendor by registry `vars`.
export const ROLE_DEFAULT_VARS = {
  merchant: { goods: 'trade goods' },
  artisan: { craft: 'craftwork' },
  farmer: { crop: 'the main crop', lowCrop: 'the late rows' },
};

export const VENDOR_TREES = {
  // =========================================================================
  // MERCHANT
  // =========================================================================
  merchant: {
    default: {
      greeting: ['Buying, selling, haggling — welcome to the only honest chaos in {{cityName}}.'],
      nodes: {
        root: {
          prompt: 'WHAT DO YOU NEED?',
          options: [
            { label: 'What do you sell?', lines: ['{{stock}} crates of {{goods}}, counted fresh at {{daypart}}. Prices shift with the seasons — buy low, sell high.'], next: 'root' },
            { label: 'Ask about the market', lines: ['Coin is the lifeblood of this place. No currency, no expansion, no new towers. Simple as that.'], next: 'trade' },
            { label: 'Heard anything strange?', lines: ['Only what the pilots bring in. Ask me about the roads instead — those I trust.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Pleasure doing business. Come back when your hold is full.'], next: null },
          ],
        },
        trade: {
          prompt: 'THE MARKET…',
          options: [
            { label: 'What moves fastest?', lines: ['Staples move fast, luxuries move far. {{goods}} does both, which is why I stock it.'], next: 'root' },
            { label: 'Who sets the prices?', lines: ['The caretakers take their tenth for roads and water. The rest is honest argument between me and you.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Fair skies, pilot.'], next: null },
          ],
        },
      },
    },
    neon: {
      greeting: ['Fresh off the pad and straight to my stall — {{cityName}} teaches fast.'],
      nodes: {
        root: {
          prompt: 'WHAT DO YOU NEED?',
          options: [
            { label: 'What do you sell?', lines: ['{{stock}} crates of {{goods}}, counted at {{daypart}}. In this city, if it glows, it sells.'], next: 'root' },
            { label: 'Ask about the towers', lines: ['Every sign you see up there is rented by somebody like me. The skyline is a ledger, pilot — learn to read it.'], next: 'rumors' },
            { label: 'Heard anything strange?', lines: ['Strange is our biggest import.'], next: 'rumors' },
            { label: 'Say goodbye', lines: ['Clear skies. Mind the grav-car lanes.'], next: null },
          ],
        },
        rumors: {
          prompt: 'RUMORS…',
          options: [
            { label: 'About {{wonderName}}?', lines: ['They say it was here before the first pad was poured. We just built the city where the view was best.'], next: 'root' },
            { label: 'About the market?', lines: ['Someone cornered the ceramic supply last season and the whole street went dark for a week. Never again, we said. It will absolutely happen again.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Watch the lantern hours. Best deals after dark.'], next: null },
          ],
        },
      },
    },
    tide: {
      greeting: ['Mind the wet crates. Everything in {{cityName}} arrives dripping and leaves shining.'],
      nodes: {
        root: {
          prompt: 'WHAT DO YOU NEED?',
          options: [
            { label: 'What do you sell?', lines: ['{{stock}} crates of {{goods}} as of {{daypart}}. The tide brings it in; I make it presentable.'], next: 'root' },
            { label: 'Ask about the harbor', lines: ['Kelp barges at dawn, night-market skiffs after dark. The sea keeps this whole economy breathing.'], next: 'sea' },
            { label: 'Say goodbye', lines: ['Dry landings, pilot.'], next: null },
          ],
        },
        sea: {
          prompt: 'THE SEA…',
          options: [
            { label: 'Ever lose stock to it?', lines: ['Every year. The sea takes a tithe like the caretakers do. You budget for it or you leave.'], next: 'root' },
            { label: 'About {{wonderName}}?', lines: ['Sailors salute it on the way out. I do not ask them why. Some customs are older than commerce.'], next: 'root' },
            { label: 'Say goodbye', lines: ['May your hold stay dry.'], next: null },
          ],
        },
      },
    },
    frost: {
      greeting: ['Close the wind out, quick. Now — trading, or just warming your hands?'],
      nodes: {
        root: {
          prompt: 'WHAT DO YOU NEED?',
          options: [
            { label: 'What do you sell?', lines: ['{{stock}} crates of {{goods}}, all cold-rated. Nothing on my shelves cracks below freezing — that is the whole business model.'], next: 'root' },
            { label: 'Ask about the caravans', lines: ['Sledge trains cross the ice sheet when the light is long. We are the last warm doorway before three days of white.'], next: 'ice' },
            { label: 'Say goodbye', lines: ['Keep your seals tight out there.'], next: null },
          ],
        },
        ice: {
          prompt: 'THE ICE ROAD…',
          options: [
            { label: 'Is it safe?', lines: ['The ice is honest — it creaks before it gives. People who listen come back. People in a hurry become cautionary tales.'], next: 'root' },
            { label: 'About {{wonderName}}?', lines: ['On still nights you can hear it from the gate. The caravaners set their departure by it.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Warm hearths, pilot.'], next: null },
          ],
        },
      },
    },
    frontier: {
      greeting: ['Water is coin and coin is water out here. Everything else is negotiable.'],
      nodes: {
        root: {
          prompt: 'WHAT DO YOU NEED?',
          options: [
            { label: 'What do you sell?', lines: ['{{stock}} lots of {{goods}} as of {{daypart}}. Out on the flats you buy what keeps you alive, not what looks pretty.'], next: 'root' },
            { label: 'Ask about the junction', lines: ['Every track on this world crosses here eventually. Stand still long enough and the whole planet walks past your stall.'], next: 'flats' },
            { label: 'Say goodbye', lines: ['Watch your filters on the way out.'], next: null },
          ],
        },
        flats: {
          prompt: 'THE FLATS…',
          options: [
            { label: 'Anything worth seeing?', lines: ['{{wonderName}}, if your boots are good. The pilgrims swear by it. The dust swears back.'], next: 'root' },
            { label: 'Hard living out here?', lines: ['Low pay, honest work. Nobody on this rock pretends to be anything they are not — dust strips paint and pretense alike.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Mind the oxide storms.'], next: null },
          ],
        },
      },
    },
    alpine: {
      greeting: ['Wax, edges, pingers, soup. In that order of importance.'],
      nodes: {
        root: {
          prompt: 'WHAT DO YOU NEED?',
          options: [
            { label: 'What do you sell?', lines: ['{{stock}} bins of {{goods}}. Everything a ridge rider forgets to pack until it matters.'], next: 'root' },
            { label: 'Ask about the descents', lines: ['Every window in {{cityName}} faces a fall line. That is not an accident — that is town planning.'], next: 'ridge' },
            { label: 'Say goodbye', lines: ['Keep your edges sharp.'], next: null },
          ],
        },
        ridge: {
          prompt: 'THE RIDGE…',
          options: [
            { label: 'Best run on the mountain?', lines: ['Off the saddle, past {{wonderName}}, into the cirque. Long, clean and cold. You will hear the strings sing on the way down.'], next: 'root' },
            { label: 'Avalanche trouble?', lines: ['That is what the pingers are for. Buy two. The mountain does not do refunds.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Ride safe, pilot.'], next: null },
          ],
        },
      },
    },
  },

  // =========================================================================
  // FARMER
  // =========================================================================
  farmer: {
    default: {
      greeting: ['Another day, another row. The soil has been kind to us this {{daypart}}.'],
      nodes: {
        root: {
          prompt: 'ASK THE FARMER…',
          options: [
            { label: 'Ask about the crops', lines: ['{{crop}} is coming in strong. {{lowCrop}} needs more water than this world wants to give.'], next: 'crops' },
            { label: 'Ask about life here', lines: ['Low pay, honest work. Without us nobody eats — not even the merchants who think they run this place.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Mind the fences on your way out. Come back when the harvest is in.'], next: null },
          ],
        },
        crops: {
          prompt: 'THE CROPS…',
          options: [
            { label: 'What sells best?', lines: ['Staple crops always move at market. The fancy stuff pays more, but that is the gardener\'s game, not mine.'], next: 'root' },
            { label: 'Offer to help', lines: ['Bless you. Keep your eyes open for good water and I will owe you a favor.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Go gently on the rows.'], next: null },
          ],
        },
      },
    },
    garden: {
      greeting: ['Careful where you step — the terraces flood at {{daypart}} and the paths get honest.'],
      nodes: {
        root: {
          prompt: 'ASK THE FARMER…',
          options: [
            { label: 'Ask about the terraces', lines: ['{{crop}} on the sun side, {{lowCrop}} in the shade rows. The whole valley eats from these steps.'], next: 'crops' },
            { label: 'Ask about the city', lines: ['{{cityName}} feeds the capital and never brags about it. That suits us.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Take an apple from the low bough. The high ones are for the birds.'], next: null },
          ],
        },
        crops: {
          prompt: 'THE TERRACES…',
          options: [
            { label: 'What sells best?', lines: ['Bread grain moves fast, perfume flowers pay more. We grow both and argue about the ratio every season.'], next: 'root' },
            { label: 'About {{wonderName}}?', lines: ['The grove glows brighter after a good harvest. Old-timers say it is thanking us. I say it is coincidence, quietly, in case it is listening.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Mind the irrigation gates.'], next: null },
          ],
        },
      },
    },
    frost: {
      greeting: ['Welcome to the only green room on the ice. Shut the door — the tomatoes are sensitive.'],
      nodes: {
        root: {
          prompt: 'ASK THE FARMER…',
          options: [
            { label: 'Ask about the greenhouses', lines: ['The vents keep the domes warm. {{crop}} loves it; {{lowCrop}} sulks whatever I do.'], next: 'vents' },
            { label: 'Ask about winter', lines: ['Winter is not a season here, it is the landlord. The vents are how we pay rent.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Take some greens for the road. Eat them before they freeze.'], next: null },
          ],
        },
        vents: {
          prompt: 'THE VENTS…',
          options: [
            { label: 'About {{wonderName}}?', lines: ['Same plumbing that plays those chimneys keeps my seedlings alive. The planet exhales and we all make a living off the breath.'], next: 'root' },
            { label: 'Ever lose a dome?', lines: ['One, the year before I came. They still call it the salad funeral. We check the seals twice now.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Stay warm out there.'], next: null },
          ],
        },
      },
    },
    frontier: {
      greeting: ['Everything you smell is nutrient vat. You get used to it. Dinner does not care.'],
      nodes: {
        root: {
          prompt: 'ASK THE FARMER…',
          options: [
            { label: 'Ask about the vats', lines: ['{{crop}} grows in tanks under glass — no soil worth the name out here. {{lowCrop}} we trade for from the terraced worlds.'], next: 'vats' },
            { label: 'Ask about life here', lines: ['The claim feeds the miners and the miners fund the claim. A closed loop, like the water. Everything out here is a closed loop.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Mind the airlock on the dome. The melon row hates the dust.'], next: null },
          ],
        },
        vats: {
          prompt: 'THE VAT DOMES…',
          options: [
            { label: 'Does it taste like anything?', lines: ['Better than it smells, worse than it looks. Third generation vat greens — my grandmother would weep, then ask for seconds.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Water discipline, pilot.'], next: null },
          ],
        },
      },
    },
    alpine: {
      greeting: ['Snow barley. Hardiest grain in the system. Almost as stubborn as the people who grow it.'],
      nodes: {
        root: {
          prompt: 'ASK THE FARMER…',
          options: [
            { label: 'Ask about the crops', lines: ['{{crop}} on the sheltered ledges, {{lowCrop}} where nothing else takes. Short season, long days, no complaints anyone can hear over the wind.'], next: 'crops' },
            { label: 'Ask about the cirque', lines: ['The granite walls keep the worst wind off. {{cityName}} sits in the calmest bowl on the mountain — that is why it exists.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Watch the ice near the shore rows.'], next: null },
          ],
        },
        crops: {
          prompt: 'THE HIGH FIELDS…',
          options: [
            { label: 'What is it all for?', lines: ['Bread for the lodge, malt for the long nights, and seed for next year. Everything else is export.'], next: 'root' },
            { label: 'About {{wonderName}}?', lines: ['When the bell tolls its light, the barley leans toward it. My mother said I imagined that. I have watched it forty years.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Warm bread at the lodge if you hurry.'], next: null },
          ],
        },
      },
    },
  },

  // =========================================================================
  // GARDENER
  // =========================================================================
  gardener: {
    default: {
      greeting: ['Careful where you step — those buds are nearly ready to open.'],
      nodes: {
        root: {
          prompt: 'ASK THE GARDENER…',
          options: [
            { label: 'Ask about the gardens', lines: ['Every bloom raises the whole district. People pay good coin just to walk through here.'], next: 'blooms' },
            { label: 'Ask about happiness', lines: ['Farmers feed bodies. I feed spirits. Do not let anyone tell you gardens are decoration.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Go gently. Try not to trample the borders.'], next: null },
          ],
        },
        blooms: {
          prompt: 'THE BLOOMS…',
          options: [
            { label: 'How does it work?', lines: ['Plant, water, prune, repeat. Slow work — but nothing brings people joy like a garden in full color.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Come back at golden hour. That is when it is worth living here.'], next: null },
          ],
        },
      },
    },
    garden: {
      greeting: ['You caught the lavender at its best hour. Stand there a moment. Just there.'],
      nodes: {
        root: {
          prompt: 'ASK THE GARDENER…',
          options: [
            { label: 'Ask about the gardens', lines: ['The hillside beds are the valley\'s pride. Every bloom point we earn lifts the land value of the whole terrace.'], next: 'blooms' },
            { label: 'Ask about the grove', lines: ['{{wonderName}} is the only garden here I do not tend. It manages, somehow. I try not to take it personally.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Go gently. The borders remember.'], next: null },
          ],
        },
        blooms: {
          prompt: 'THE BLOOMS…',
          options: [
            { label: 'What do you grow?', lines: ['Perfume flowers for the artisans, cut stems for the market, and one bed of impractical things purely for the soul.'], next: 'root' },
            { label: 'Offer seeds or tools', lines: ['For me? Then you are a friend of the flowers now. Take some rare seed stock in return — plant it somewhere that needs it.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Golden hour is soon. Stay if you can.'], next: null },
          ],
        },
      },
    },
    tide: {
      greeting: ['Mind the tanks — the kelp fronds bruise easier than they look.'],
      nodes: {
        root: {
          prompt: 'ASK THE GARDENER…',
          options: [
            { label: 'Ask about the kelp gardens', lines: ['Rows of it, down where the light goes green. I prune by feel at {{daypart}}. Underwater gardening is gardening with extra steps and better silence.'], next: 'kelp' },
            { label: 'Ask about happiness', lines: ['The divers say the swaying rows calm them better than shore leave. Beauty works underwater too.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Swim gently over the beds, if you swim.'], next: null },
          ],
        },
        kelp: {
          prompt: 'THE KELP BEDS…',
          options: [
            { label: 'What is it used for?', lines: ['Food, cordage, dye, and the salt-cured sheets the merchants brag about. Nothing goes to waste — the sea checks.'], next: 'root' },
            { label: 'Say goodbye', lines: ['May the current be kind.'], next: null },
          ],
        },
      },
    },
  },

  // =========================================================================
  // ARTISAN
  // =========================================================================
  artisan: {
    default: {
      greeting: ['Flour on my hands, dye under my nails — business is good.'],
      nodes: {
        root: {
          prompt: 'ASK THE ARTISAN…',
          options: [
            { label: 'Ask about the work', lines: ['I turn raw {{craft}} into things worth shelf space. Nothing goes to waste in my shop.'], next: 'craft' },
            { label: 'Ask about supply', lines: ['If the farms or gardens have a bad season, my shelves go empty fast. We are all connected here.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Come back when you have something worth processing.'], next: null },
          ],
        },
        craft: {
          prompt: 'THE CRAFT…',
          options: [
            { label: 'What pays best?', lines: ['The luxury pieces. Raw material in, pure profit out — when the supply holds.'], next: 'root' },
            { label: 'Offer a trade', lines: ['Bring me raw stock and I will cut you in on the finished goods. Fair trade, always.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Mind the kiln on your way out.'], next: null },
          ],
        },
      },
    },
    tide: {
      greeting: ['Pearl-glass takes a steady hand and wet weather. I have both, permanently.'],
      nodes: {
        root: {
          prompt: 'ASK THE ARTISAN…',
          options: [
            { label: 'Ask about pearl-glass', lines: ['Reef pearl, ground and fired until it holds the sea\'s own shimmer. Every lantern on the quay came through this bench.'], next: 'craft' },
            { label: 'Ask about supply', lines: ['The divers bring the pearl, the tide sets the schedule. A rough week on the water is a quiet week at my kiln.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Handle anything you bought like it is a soap bubble. Because it nearly is.'], next: null },
          ],
        },
        craft: {
          prompt: 'PEARL-GLASS…',
          options: [
            { label: 'Hardest piece you made?', lines: ['A chandelier for the harbormaster shaped like a breaking wave. Two hundred hours. She hung it in a stairwell nobody uses. Artists endure.'], next: 'root' },
            { label: 'Say goodbye', lines: ['May your cargo webbing be padded.'], next: null },
          ],
        },
      },
    },
    frost: {
      greeting: ['Ice holds a curve better than marble, if you respect it. Gloves are by the door.'],
      nodes: {
        root: {
          prompt: 'ASK THE ARTISAN…',
          options: [
            { label: 'Ask about ice-carving', lines: ['I carve {{craft}} from lake cores. In this cold a good piece outlives its carver — there is a serenity in that.'], next: 'craft' },
            { label: 'Ask about the vents', lines: ['The vent heat is the enemy and the studio rent is cheap because of it. Art thrives on contradiction.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Do not hug the sculptures.'], next: null },
          ],
        },
        craft: {
          prompt: 'THE CARVING…',
          options: [
            { label: 'About {{wonderName}}?', lines: ['The organ\'s chimneys are the planet\'s own carving. I take students there to humble them. Works every time, including on me.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Cold hands, warm heart, sharp chisel.'], next: null },
          ],
        },
      },
    },
    frontier: {
      greeting: ['Oxide-glass. The dust that ruins everything else out here makes the best glass in the system.'],
      nodes: {
        root: {
          prompt: 'ASK THE ARTISAN…',
          options: [
            { label: 'Ask about oxide-glass', lines: ['Red dust, fired hot — comes out the color of sunset holding its breath. The miners trade me raw oxide by the sack.'], next: 'craft' },
            { label: 'Ask about supply', lines: ['Supply is the one thing this world has infinite of. It is customers we import.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Wrap it twice for the flight out.'], next: null },
          ],
        },
        craft: {
          prompt: 'THE GLASSWORK…',
          options: [
            { label: 'What do you make?', lines: ['Lenses for the observatory, bottles for the claim, and one impractical sculpture a year to prove the dust has not won.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Mind the kiln heat on the way out.'], next: null },
          ],
        },
      },
    },
    neon: {
      greeting: ['Every stone I cut fell out of the sky first. Try saying that about any other jewelry bench.'],
      nodes: {
        root: {
          prompt: 'ASK THE ARTISAN…',
          options: [
            { label: 'Ask about diamond-cutting', lines: ['The netting fields catch the rain, I give it facets. {{stock}} raw stones on the bench as of {{daypart}}.'], next: 'craft' },
            { label: 'Ask about the resort', lines: ['The casinos buy the flawless ones. The flawed ones are more interesting — like the clientele.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Do not gamble the cufflinks.'], next: null },
          ],
        },
        craft: {
          prompt: 'THE STONES…',
          options: [
            { label: 'About {{wonderName}}?', lines: ['The Veil sheds glitter all night over the pool. Free advertising for my whole profession. I sweep my share at dawn.'], next: 'root' },
            { label: 'Say goodbye', lines: ['May your pockets sparkle responsibly.'], next: null },
          ],
        },
      },
    },
    alpine: {
      greeting: ['Granite for the body, bone for the neck, gut for the strings. The mountain provides.'],
      nodes: {
        root: {
          prompt: 'ASK THE ARTISAN…',
          options: [
            { label: 'Ask about the lutherie', lines: ['I build instruments from what the mountain gives: {{craft}}. They sound like the wind through the saddle — which is the point.'], next: 'craft' },
            { label: 'Ask about the camp', lines: ['The glaciologists hum while they core-drill. Someone had to give them something in tune.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Keep your strings out of the cold snap.'], next: null },
          ],
        },
        craft: {
          prompt: 'THE INSTRUMENTS…',
          options: [
            { label: 'About {{wonderName}}?', lines: ['I tune everything to the cascade. It froze mid-note a century ago; the least I can do is match its pitch.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Play something kind tonight.'], next: null },
          ],
        },
      },
    },
  },

  // =========================================================================
  // CARETAKER
  // =========================================================================
  caretaker: {
    default: {
      greeting: ['The roads, the wells, the tower roof — someone has to keep it all standing.'],
      nodes: {
        root: {
          prompt: 'ASK THE CARETAKER…',
          options: [
            { label: 'Ask about taxes', lines: ['A tenth of what the merchants earn keeps {{cityName}} running. Fair trade for clean water and safe streets.'], next: 'civic' },
            { label: 'Ask about the city', lines: ['We are doing well, all things considered. Morale is up since the last public works went in.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Stay safe out there. The city thanks you, even if it never says so.'], next: null },
          ],
        },
        civic: {
          prompt: 'CIVIC MATTERS…',
          options: [
            { label: 'Where does it all go?', lines: ['Repairs, gardens, new roads. Every improvement raises the land under it — the ledger balances if you are patient.'], next: 'root' },
            { label: 'Offer civic help', lines: ['Keep the peace between the farmers and the merchants and you will have done more than most.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Mind the wet paint on the rails.'], next: null },
          ],
        },
      },
    },
    garden: {
      greeting: ['Terrace walls do not repoint themselves. Ask quick, my mortar is drying.'],
      nodes: {
        root: {
          prompt: 'ASK THE CARETAKER…',
          options: [
            { label: 'Ask about the terraces', lines: ['Four hundred years of walls holding four hundred years of soil. My whole job is making sure gravity keeps losing.'], next: 'civic' },
            { label: 'Ask about taxes', lines: ['The growers tithe a share of harvest instead of coin. The town eats its taxes here. Better system, in my view.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Walk the wall tops if you like — they hold. I checked. I always check.'], next: null },
          ],
        },
        civic: {
          prompt: 'THE WALLS…',
          options: [
            { label: 'Ever had a collapse?', lines: ['One terrace, forty years back, before my time. They rebuilt it in a season and named it Humility Row. We maintain it hardest of all.'], next: 'root' },
            { label: 'Say goodbye', lines: ['The valley thanks you.'], next: null },
          ],
        },
      },
    },
    frost: {
      greeting: ['Heat tape, roof rakes, and vigilance. That is how a town survives an ice sheet.'],
      nodes: {
        root: {
          prompt: 'ASK THE CARETAKER…',
          options: [
            { label: 'Ask about the gate', lines: ['{{cityName}} is the last services before the white. Caravans check in with me going out and I count them coming back. I like when the numbers match.'], next: 'civic' },
            { label: 'Ask about taxes', lines: ['A tenth, same as anywhere. Out here it buys heat and light, and no one grumbles paying for those.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Check your seals before the ice road. That is free advice, which is the best tax bracket.'], next: null },
          ],
        },
        civic: {
          prompt: 'THE GATE…',
          options: [
            { label: 'Numbers ever not match?', lines: ['Twice in my years. We rang the crystals and lit the wall, and one of the two walked in at dawn. We keep the light on for the other still.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Warm doorways, traveler.'], next: null },
          ],
        },
      },
    },
    frontier: {
      greeting: ['Pilgrims in, dust out. Somebody has to sweep the sundial. It is me. It is always me.'],
      nodes: {
        root: {
          prompt: 'ASK THE CARETAKER…',
          options: [
            { label: 'Ask about the town', lines: ['{{cityName}} runs on visitors and starlight. My job is keeping the water topped and the walkways clear of oxide drift.'], next: 'civic' },
            { label: 'Ask about {{wonderName}}', lines: ['I sweep its ring plaza every morning before the pilgrims arrive. Best hour of my day — just me, the shadow, and no questions.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Refill your water before you lift. No exceptions, not even heroes.'], next: null },
          ],
        },
        civic: {
          prompt: 'TOWN MATTERS…',
          options: [
            { label: 'What needs doing?', lines: ['The dome seals, the well filters, the flag lines. A town this small is one neglected chore from being a ruin, and I do not neglect.'], next: 'root' },
            { label: 'Say goodbye', lines: ['The dust thanks you for visiting. It will follow you home.'], next: null },
          ],
        },
      },
    },
    alpine: {
      greeting: ['Snow load is the silent tax. I collect it off every roof in the hollow before it collects the roofs.'],
      nodes: {
        root: {
          prompt: 'ASK THE CARETAKER…',
          options: [
            { label: 'Ask about the village', lines: ['{{cityName}} sits snug in the cirque, which means everything that falls, stays. Managing snow is the whole civic budget.'], next: 'civic' },
            { label: 'Ask about the lake ice', lines: ['I drill and measure it every morning. Green flag means solid. You will never see any other flag while I hold this job.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Knock the snow off your boots at every door. That is the only law we truly enforce.'], next: null },
          ],
        },
        civic: {
          prompt: 'THE HOLLOW…',
          options: [
            { label: 'About {{wonderName}}?', lines: ['When the bell swings its light, the whole cirque glows for a breath. I time my rounds to it. Some maintenance is for the spirit.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Mind the icicles under the eaves.'], next: null },
          ],
        },
      },
    },
  },

  // =========================================================================
  // SCHOLAR / RESEARCHER
  // =========================================================================
  scholar: {
    default: {
      greeting: ['Ah, a visitor. Perfect — I could use a second opinion on this data.'],
      nodes: {
        root: {
          prompt: 'ASK THE SCHOLAR…',
          options: [
            { label: 'Ask about the research', lines: ['I study how this world works so the rest of the city does not have to. Slow work, but it pays off for everyone.'], next: 'research' },
            { label: 'Offer resources', lines: ['Excellent. With this I can accelerate the next result considerably.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Go on, then. I have theories to test.'], next: null },
          ],
        },
        research: {
          prompt: 'THE RESEARCH…',
          options: [
            { label: 'What have you found?', lines: ['Every discovery banks a little understanding for the whole city. Enough of those and everyone benefits.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Mind the instruments on your way out.'], next: null },
          ],
        },
      },
    },
    tide: {
      greeting: ['You hear that chime? Third one since {{daypart}}. The trench is talkative today.'],
      nodes: {
        root: {
          prompt: 'ASK THE SCHOLAR…',
          options: [
            { label: 'Ask about the trench', lines: ['Deeper than any instrument we have dared send down. The pressure readings come back looking like poetry with a grudge.'], next: 'deep' },
            { label: 'Ask about the sonar chimes', lines: ['We map the deep by listening. The city built its streets around the hydrophone lines — science as town planning.'], next: 'root' },
            { label: 'Say goodbye', lines: ['If you dive, log your depth with the port office. Data is safety and safety is data.'], next: null },
          ],
        },
        deep: {
          prompt: 'THE DEEP…',
          options: [
            { label: 'About {{wonderName}}?', lines: ['The ribs predate every record we hold. Whatever grew that skeleton sang below the crush depth of our best hulls. I would give tenure to hear it once.'], next: 'root' },
            { label: 'Anything alive down there?', lines: ['The honest answer is: the readings say yes and the funding committee says do not put that in writing.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Shallow waters to you.'], next: null },
          ],
        },
      },
    },
    frost: {
      greeting: ['Careful with the core samples. That rack is ten thousand winters, oldest at the bottom.'],
      nodes: {
        root: {
          prompt: 'ASK THE SCHOLAR…',
          options: [
            { label: 'Ask about the ice cores', lines: ['Every layer is a year this world remembers. I read them like the caravaners read the sky — slowly, and twice.'], next: 'research' },
            { label: 'Ask about the crystals', lines: ['{{wonderName}} resonates at frequencies the ice sheet carries for miles. I have charts. I have SO many charts.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Close the cold-room door. The centuries prefer it dark.'], next: null },
          ],
        },
        research: {
          prompt: 'THE CORES…',
          options: [
            { label: 'What do they say?', lines: ['That this world has thawed before, and refrozen, and thawed again. Patience on a scale that makes empires look like weather.'], next: 'root' },
            { label: 'Say goodbye', lines: ['May your instruments stay calibrated.'], next: null },
          ],
        },
      },
    },
    frontier: {
      greeting: ['Best seeing in the system, this plateau. No water in the sky to blur the stars. The dust, we forgive.'],
      nodes: {
        root: {
          prompt: 'ASK THE SCHOLAR…',
          options: [
            { label: 'Ask about the observatory', lines: ['We chart everything from here — planets, stations, the deep nebulae. If it is up there, someone in {{cityName}} has argued about it.'], next: 'sky' },
            { label: 'Ask about {{wonderName}}', lines: ['A timepiece the size of a plaza. The builders understood: on a world with no seasons, the shadow IS the calendar.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Come back after dark. The sky here does not disappoint.'], next: null },
          ],
        },
        sky: {
          prompt: 'THE SKY…',
          options: [
            { label: 'Seen anything odd?', lines: ['Weekly. The trick of this profession is telling the odd from the merely unexplained. The pilgrims conflate the two; we sell them star charts anyway.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Clear skies — I mean that professionally.'], next: null },
          ],
        },
      },
    },
    alpine: {
      greeting: ['Glacier flow is one meter a year. My deadlines, regrettably, are faster.'],
      nodes: {
        root: {
          prompt: 'ASK THE SCHOLAR…',
          options: [
            { label: 'Ask about the glacier', lines: ['We drill, we core, we listen to the ice creak. The canyon lakes freeze from the shore inward — I can tell you the date within a week from a single sample.'], next: 'research' },
            { label: 'Ask about {{wonderName}}', lines: ['A waterfall that froze faster than it fell. The thermodynamics should not work. My thesis says they do. One of us is wrong and I check daily.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Rope up past the moraine. Science says so.'], next: null },
          ],
        },
        research: {
          prompt: 'THE ICE…',
          options: [
            { label: 'Why does it matter?', lines: ['The glacier is the mountain\'s memory and its water tower. Everything downstream of us — literally everything — depends on reading it right.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Mind the crevasse flags.'], next: null },
          ],
        },
      },
    },
  },

  // =========================================================================
  // TOURIST GUIDE
  // =========================================================================
  guide: {
    default: {
      greeting: ['First time in {{cityName}}? Trust me, words do not do it justice.'],
      nodes: {
        root: {
          prompt: 'ASK THE GUIDE…',
          options: [
            { label: 'Ask about tours', lines: ['I walk groups through the best of it every day. Best job in the city, if you ask me.'], next: 'tour' },
            { label: 'Ask about visitors', lines: ['Every traveler who walks through spends on food, crafts and lodging. A whole second economy built on wonder alone.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Tell your friends. We can always use more visitors.'], next: null },
          ],
        },
        tour: {
          prompt: 'THE TOUR…',
          options: [
            { label: 'What is the highlight?', lines: ['{{wonderName}}, no contest. People travel days for it and stand there speechless. I never tire of watching that.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Safe travels — and look up more often.'], next: null },
          ],
        },
      },
    },
    tide: {
      greeting: ['Welcome to {{cityName}}! You are standing where I start every tour, so you have excellent instincts.'],
      nodes: {
        root: {
          prompt: 'ASK THE GUIDE…',
          options: [
            { label: 'Ask about the tour', lines: ['Harbor walk, kelp gardens, then {{wonderName}} at {{daypart}} when the light hits the water. Bring something waterproof and an open mind.'], next: 'tour' },
            { label: 'Ask about the city', lines: ['Everything here arrived by sea or grew in it. Even the architecture looks like it is about to swim.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Tell your friends! The tide brings everyone eventually.'], next: null },
          ],
        },
        tour: {
          prompt: 'THE TOUR…',
          options: [
            { label: 'Is it worth it?', lines: ['I have given this tour a thousand times and I still stop talking at the same spot every day. You will know the spot when we reach it.'], next: 'root' },
            { label: 'Say goodbye', lines: ['May your boots stay dry — or not. Live a little.'], next: null },
          ],
        },
      },
    },
    frontier: {
      greeting: ['Here for the sundial? Everyone is here for the sundial. Let me tell you what they miss.'],
      nodes: {
        root: {
          prompt: 'ASK THE GUIDE…',
          options: [
            { label: 'Ask about the pilgrimage', lines: ['Pilgrims cross half the flats to watch the shadow complete its circuit. I walk them up at dawn when the first marker lights. Grown pilots weep. Regularly.'], next: 'tour' },
            { label: 'What do they miss?', lines: ['The silence. Everyone photographs the gnomon and forgets to just stand in the quietest place in the system for one minute.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Water first, wonder second. Guide rules.'], next: null },
          ],
        },
        tour: {
          prompt: 'THE PILGRIM ROUTE…',
          options: [
            { label: 'Join the dawn walk', lines: ['Meet at the plaza edge before first light. Wear layers — the flats give you all four seasons in an hour.'], next: 'root' },
            { label: 'Say goodbye', lines: ['The shadow keeps its schedule. Try to keep yours.'], next: null },
          ],
        },
      },
    },
    neon: {
      greeting: ['Welcome to the only resort where the sky pays for your souvenirs. Ask me how!'],
      nodes: {
        root: {
          prompt: 'ASK THE GUIDE…',
          options: [
            { label: 'Ask about the resort', lines: ['Diamond rain on the netting fields, casinos on the shore, and {{wonderName}} floating over its pool like a promise. That is the postcard and it is all true.'], next: 'tour' },
            { label: 'Ask about the rain', lines: ['When the storm cells roll in, the whole sky glitters. We pause the tours and just watch. Even the croupiers come out.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Bet small, tip your guide, look up often.'], next: null },
          ],
        },
        tour: {
          prompt: 'THE TOUR…',
          options: [
            { label: 'What does it cost?', lines: ['For pilots, the sunset walk is free. House rule — you people bring the best stories.'], next: 'root' },
            { label: 'Say goodbye', lines: ['May the odds and the weather favor you.'], next: null },
          ],
        },
      },
    },
    alpine: {
      greeting: ['You can see six descents from this spot. I have ridden five. We do not discuss the sixth.'],
      nodes: {
        root: {
          prompt: 'ASK THE GUIDE…',
          options: [
            { label: 'Ask about the mountain', lines: ['Ridge walks at dawn, board runs till {{daypart}}, and the harp singing overhead all day. {{cityName}} is the easiest sell in my profession.'], next: 'tour' },
            { label: 'Ask about safety', lines: ['Respect the flags, carry a pinger, never ride alone past the saddle. The mountain is friendly the way the sea is friendly.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Snow is best before the light flattens. Move quick!'], next: null },
          ],
        },
        tour: {
          prompt: 'THE RIDGE…',
          options: [
            { label: 'About {{wonderName}}?', lines: ['Two pylons, twelve strings, and the wind for a musician. I time every tour so we crest the saddle mid-song. Never once been a bad show.'], next: 'root' },
            { label: 'The sixth descent?', lines: ['...You will hear about it from someone eventually. Not from me. I promised my knees.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Ride the fall line, not your luck.'], next: null },
          ],
        },
      },
    },
  },

  // =========================================================================
  // APPRENTICE
  // =========================================================================
  apprentice: {
    default: {
      greeting: ['I am still learning the ropes — but ask me anything, I will try to help!'],
      nodes: {
        root: {
          prompt: 'ASK THE APPRENTICE…',
          options: [
            { label: 'Ask about their training', lines: ['I am deciding what to become. Everyone in {{cityName}} says something different, which does not help at all.'], next: 'paths' },
            { label: 'Offer encouragement', lines: ['Really? Thanks — that means a lot. Maybe I will stop second-guessing for a whole day.'], next: 'root' },
            { label: 'Say goodbye', lines: ['See you around! I have a lot to learn still.'], next: null },
          ],
        },
        paths: {
          prompt: 'THE CHOICE…',
          options: [
            { label: 'Which path is best?', lines: ['Farmers are steady, gardeners are joyful, artisans are clever. Merchants get rich, but they work for it. See my problem?'], next: 'root' },
            { label: 'Say goodbye', lines: ['Wish me luck picking!'], next: null },
          ],
        },
      },
    },
    neon: {
      greeting: ['I run manifests for half the pad by {{daypart}} and nobody has noticed I am sixteen kinds of unqualified!'],
      nodes: {
        root: {
          prompt: 'ASK THE APPRENTICE…',
          options: [
            { label: 'Ask about the work', lines: ['I log every ship that sets down in {{cityName}}. Yours was the best landing this week. I keep a ranking. It is not official but it is CORRECT.'], next: 'paths' },
            { label: 'Offer encouragement', lines: ['You think so? The pad chief says I have promise. She says it like a threat, but still.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Fly something interesting next time — my ranking rewards style!'], next: null },
          ],
        },
        paths: {
          prompt: 'THE FUTURE…',
          options: [
            { label: 'What do you want to be?', lines: ['Merchant, maybe. Or a guide. Or a pilot like you. Ask me at {{daypart}} tomorrow and get a fourth answer.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Clear skies! That is pilot-talk. I am practicing.'], next: null },
          ],
        },
      },
    },
    frontier: {
      greeting: ['Boss says sweep the stall, watch the water gauge, and stop asking travelers about the stars. Two out of three!'],
      nodes: {
        root: {
          prompt: 'ASK THE APPRENTICE…',
          options: [
            { label: 'Ask about the junction', lines: ['Everything crosses here — caravans, pilgrims, pilots like you. I have a list of every world I have heard about. Yours is on it now.'], next: 'paths' },
            { label: 'Offer encouragement', lines: ['Thanks! The dust gets in your ears out here, but so do the stories. I prefer the stories.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Safe crossing! Tell someone about us out there!'], next: null },
          ],
        },
        paths: {
          prompt: 'THE FUTURE…',
          options: [
            { label: 'Will you stay here?', lines: ['Long enough to earn passage. Then I want to see one of the water worlds. Just to stand in rain once. Real rain.'], next: 'root' },
            { label: 'Say goodbye', lines: ['May your tanks stay full!'], next: null },
          ],
        },
      },
    },
    alpine: {
      greeting: ['I have shoveled four roofs since dawn and the caretaker says that was the warm-up!'],
      nodes: {
        root: {
          prompt: 'ASK THE APPRENTICE…',
          options: [
            { label: 'Ask about the village', lines: ['Everyone in {{cityName}} does three jobs. I am apprenticed to all of them at once, which the caretaker insists is efficient.'], next: 'paths' },
            { label: 'Offer encouragement', lines: ['Thanks! One day I will ring the bell myself. Officially. Not like the incident. We agreed not to mention the incident.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Mind the ice on the boardwalk!'], next: null },
          ],
        },
        paths: {
          prompt: 'THE FUTURE…',
          options: [
            { label: 'The incident?', lines: ['We AGREED. ...It echoed for a full minute. It was glorious. You heard nothing from me.'], next: 'root' },
            { label: 'Say goodbye', lines: ['See you around the hollow!'], next: null },
          ],
        },
      },
    },
  },

  // =========================================================================
  // ELITE / PATRON
  // =========================================================================
  elite: {
    default: {
      greeting: ['You have built quite the reputation, pilot. I am always looking for a sound investment.'],
      nodes: {
        root: {
          prompt: 'THE PATRON WAITS…',
          options: [
            { label: 'Ask about investment', lines: ['Show me a thriving district or a well-run market, and I will gladly fund its next expansion.'], next: 'money' },
            { label: 'Ask about their wealth', lines: ['Currency finds its way to those who use it wisely. I simply choose where it flows next.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Until our paths cross again. Do keep this city beautiful.'], next: null },
          ],
        },
        money: {
          prompt: 'INVESTMENT…',
          options: [
            { label: 'Pitch a project', lines: ['Interesting. Bring me a proposal with real numbers, and we will talk terms.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Do not disappoint me.'], next: null },
          ],
        },
      },
    },
    neon: {
      greeting: ['A pilot with dust still on the hull. Good. The interesting ones never polish it off.'],
      nodes: {
        root: {
          prompt: 'THE PATRON WAITS…',
          options: [
            { label: 'Ask about investment', lines: ['I hold paper on half the skyline of {{cityName}} and appetite for the other half. What I lack is people who go places. You go places.'], next: 'money' },
            { label: 'Ask about the view', lines: ['From this balcony I can see every sign I own flicker on at {{daypart}}. It never gets old. Wealth is mostly a viewing angle.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Do come back solvent. It is your most charming quality.'], next: null },
          ],
        },
        money: {
          prompt: 'INVESTMENT…',
          options: [
            { label: 'What would you fund?', lines: ['A trade run past {{wonderName}}, a new lobby on the west avenue, a scandal or two. Bring me numbers and nerve, in that order.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Mind the doorman. He judges everyone. It is why I keep him.'], next: null },
          ],
        },
      },
    },
    frontier: {
      greeting: ['Baron is a courtesy title. The claim, however, is entirely real. Sit, if you can find a chair without core samples on it.'],
      nodes: {
        root: {
          prompt: 'THE BARON WAITS…',
          options: [
            { label: 'Ask about the claim', lines: ['Redline produces more ore per head than any operation this side of the belt. The vat domes feed the crews; the crews feed the ledger. Tidy.'], next: 'money' },
            { label: 'Ask about the Ring', lines: ['{{wonderName}} hangs over my claim like a creditor. Whoever built it went broke building it. I find the reminder... motivating.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Fly straight, pilot. Crooked costs extra out here.'], next: null },
          ],
        },
        money: {
          prompt: 'BUSINESS…',
          options: [
            { label: 'Pitch a haul contract', lines: ['Ore out, water in — the eternal equation. Prove your hold is honest and the route is yours to lose.'], next: 'root' },
            { label: 'Say goodbye', lines: ['The dust respects nothing. Be unlike the dust.'], next: null },
          ],
        },
      },
    },
  },

  // =========================================================================
  // ENTERTAINER
  // =========================================================================
  entertainer: {
    default: {
      greeting: ['Life is too short for long faces! A song, a story, or a laugh — pick one!'],
      nodes: {
        root: {
          prompt: 'THE SHOW…',
          options: [
            { label: 'Ask for a song', lines: ['For you? A little tune about the founding of {{cityName}} itself. Half of it is even true!'], next: 'root' },
            { label: 'Ask about their role', lines: ['I grow nothing and sell nothing — I keep spirits high. Happy citizens work harder and stay longer. Ask the caretaker!'], next: 'craft' },
            { label: 'Say goodbye', lines: ['Go on now, smile a little. It is contagious.'], next: null },
          ],
        },
        craft: {
          prompt: 'THE CRAFT…',
          options: [
            { label: 'Does it really matter?', lines: ['Food fills the belly, beauty fills the eyes, but laughter fills the heart. All three matter. I merely picked the loudest.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Exit humming, please. House rule.'], next: null },
          ],
        },
      },
    },
    neon: {
      greeting: ['You are just in time — I go on at {{daypart}} and the warm-up crowd is YOU!'],
      nodes: {
        root: {
          prompt: 'THE SHOW…',
          options: [
            { label: 'Ask for a preview', lines: ['A ballad about a pilot who landed on the wrong pad and founded a dynasty. Any resemblance to persons living is aspirational.'], next: 'root' },
            { label: 'Ask about the circuit', lines: ['Every plaza in {{cityName}} has a stage and every stage has a rivalry. It keeps the art sharp and the feuds delicious.'], next: 'craft' },
            { label: 'Say goodbye', lines: ['Tip your vendors! Try the balcony view! I am here every night!'], next: null },
          ],
        },
        craft: {
          prompt: 'THE SCENE…',
          options: [
            { label: 'Sing about {{wonderName}}?', lines: ['Everyone sings about it, darling. The trick is finding a rhyme nobody has used. I have three in reserve and I guard them like jewels.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Exit stage anywhere, superstar.'], next: null },
          ],
        },
      },
    },
    tide: {
      greeting: ['Shanties at the quay, ballads at the deep bar. I do requests and I do warnings-set-to-music.'],
      nodes: {
        root: {
          prompt: 'THE SHOW…',
          options: [
            { label: 'Ask for a shanty', lines: ['One about the barge that raced the tide and ALMOST won. The chorus is mostly bailing instructions. Crowd loves it.'], next: 'root' },
            { label: 'Ask about their role', lines: ['Sailors need songs like hulls need sealant — it keeps the dark out. That is not a metaphor. Ask any diver.'], next: 'craft' },
            { label: 'Say goodbye', lines: ['May your keel stay wet and your socks stay dry!'], next: null },
          ],
        },
        craft: {
          prompt: 'THE REPERTOIRE…',
          options: [
            { label: 'A song about {{wonderName}}?', lines: ['The oldest one we have. Nobody knows who wrote it and nobody dares change a note. Some songs own the singer, friend.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Hum the chorus on your way out — it is good luck.'], next: null },
          ],
        },
      },
    },
    frost: {
      greeting: ['The nights here are long enough for three encores and an intermission soup. Welcome!'],
      nodes: {
        root: {
          prompt: 'THE SHOW…',
          options: [
            { label: 'Ask for a story', lines: ['The one about the caravaner who followed the aurora home. I only tell it when the lights are out — which here is most of the time. Lucky you.'], next: 'root' },
            { label: 'Ask about their role', lines: ['On the ice, morale is infrastructure. The caretaker fixes roofs; I fix the mood under them. Same trade, warmer tools.'], next: 'craft' },
            { label: 'Say goodbye', lines: ['Keep a song in your suit heater, traveler.'], next: null },
          ],
        },
        craft: {
          prompt: 'THE LONG NIGHT…',
          options: [
            { label: 'About {{wonderName}}?', lines: ['I once played a duet with it — waited for the vents and answered each chimney in key. Half the town swears it answered back. I let them swear.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Warm hands, warm hearts, warm applause.'], next: null },
          ],
        },
      },
    },
    alpine: {
      greeting: ['Apres-descent entertainment, best in the saddle! The harp does the day shift; I do the night.'],
      nodes: {
        root: {
          prompt: 'THE SHOW…',
          options: [
            { label: 'Ask for a tune', lines: ['A riding song — the beat matches your turns on the long run down. Riders swear it shaves seconds. Physics disagrees. Riders outvote physics.'], next: 'root' },
            { label: 'Ask about their role', lines: ['Cold legs empty a resort fast; a full lodge with music keeps everyone one more night. I am, economically speaking, load-bearing.'], next: 'craft' },
            { label: 'Say goodbye', lines: ['Last run of the day is for singing on. Try it!'], next: null },
          ],
        },
        craft: {
          prompt: 'THE REPERTOIRE…',
          options: [
            { label: 'Duet with {{wonderName}}?', lines: ['Every windy night, whether I plan it or not. Twelve strings against my one voice. I have learned to pick keys it agrees with.'], next: 'root' },
            { label: 'Say goodbye', lines: ['Ride loose, sing louder.'], next: null },
          ],
        },
      },
    },
  },
};
