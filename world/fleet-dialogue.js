// The three fleets: every word their captains and crews say on their own
// decks (src/fleetHost.js before Tenretni comes, src/tenretni.js after).
// Nothing here is logic. The first name in each list commands the flagship,
// and the flagships are the only ships a pilot can board.

export const CAPTAINS = {
  rustia: { title: 'Shift-Captain', names: ['Orrin Vask', 'Dela Roon', 'Haim Kett'] },
  saturnia: { title: 'Cantor', names: ['Ilse Marrow', 'Teo Vandry', 'Suvi Aln'] },
  'wavemall prime': { title: 'Floor Manager', names: ['Brandi Lux', 'Chad Meridian', 'Tawny Voss'] },
};

export const VOICE = {
  rustia: {
    truce: ['We have stopped shooting at each other. All three fleets saw what came through, and what it did to Terra.', 'Nobody knows what happens next. If it moves on another world, come and find me.'],
    // before Tenretni: the three worlds are at war with each other
    war: [
      'You picked a day to visit. That is Saturnia off the port bow and the mall fleet behind it, and all three of us are shooting.',
      'It started over ore prices and nobody remembers the rest. Rustia does not start wars. We finish shifts.',
      'Stay off the gun deck, freighter. Come back when one of us has won.',
    ],
    warCrew: ['Forty years of this. My father shot at the same ships.', 'Hold on to something. They are coming round again.'],
    hello: [
      'You are the pilot off that freighter. Wipe your boots. This deck was a smelter floor before it was a warship.',
      'We watched that thing drink two oceans. Rustia has no ocean, and it is coming anyway.',
      'Three fleets, three peoples who do not like each other much. Nobody has got us all in one place.',
    ],
    ask: 'Open a channel to this ship?',
    yes: ['Done. One word from you and every furnace I have is pointed where you say.', 'Get the other two. Then get close to it, and call.'],
    open: ['Channel is open. We are listening for you. Do not waste it.'],
    crew: ['Seam pressure is holding. Mostly.', 'My brother went down the Emberdeep and came up a gunner. Strange days.'],
  },
  saturnia: {
    truce: ['The war is stopped. Not ended: stopped. We all saw Terra taken apart, and it silenced every gun.', 'If that thing moves again, come to me. We will need someone who belongs to none of us.'],
    war: [
      'Be welcome, though you find us at our worst. We are at war with Rustia and with Wavemall Prime, and they with each other.',
      'It is an old quarrel. Each of us is certain the other two began it.',
      'We would stop if anything gave us a reason. Nothing has, in my lifetime. Go safely.',
    ],
    warCrew: ['We sing before every pass. It does not make it better.', 'I have never met one of the iron people. I have only shot at them.'],
    hello: [
      'Be welcome. You have come a long way through a great deal of noise.',
      'We have sung over every world it has taken. We are tired of that song.',
      'Our lances are true but they are few. It would take all of us, at once, at its heart.',
    ],
    ask: 'Ask for a channel to this ship?',
    yes: ['It is given. When you call, the halos will answer.', 'Go to the iron people, and to the bright ones. Then stand before it and call.'],
    open: ['We hold the channel open and we hold you in mind.'],
    crew: ['The rings ring true today.', 'I have never fired in anger. I am practising the anger.'],
  },
  'wavemall prime': {
    truce: ['Hi! The pricing dispute is suspended until further notice. Something ate a planet and corporate has no policy for that.', 'If it starts moving, come back. We may need a neutral third party!'],
    war: [
      'Hi! Welcome aboard! Sorry about the noise, we are in a hostile pricing dispute with two competitors.',
      'It has been going on for three generations. Corporate calls it a promotion.',
      'We cannot offer you a channel at this time. Please check back after the conflict!',
    ],
    warCrew: ['Incoming on deck nine. It is always deck nine.', 'I applied for the sales floor. They gave me a turret.'],
    hello: [
      'Hi! Welcome aboard the fleet, are you finding everything okay?',
      'So that planet thing is technically a competitor now. Corporate has approved a response.',
      'We cannot coordinate with the other fleets without a customer-side point of contact. That could be you!',
    ],
    ask: 'Sign up for a direct channel?',
    yes: ['Amazing. You are all signed up. Call us any time and the whole fleet attends, no purchase necessary.', 'Get the other two on board and we will see you at the event.'],
    open: ['Your channel is active! Is there anything else I can help you with today?'],
    crew: ['Clean up on deck nine. It is always deck nine.', 'These lights were for the sales floor. Now they are targeting. Same lights.'],
  },
};
