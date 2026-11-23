// Season 1's shared words (GDD 5.7.9): the fixed events.
//
// The big events of the season happen whatever the pilot does (plans/
// season-1-arc.md, "How history works"). This file is what each one is called,
// what its forecast says before it happens, and what the captains say about
// how it went, afterwards, wherever the ship is.
//
// One row per event, in the order the season meets them. `chapter` is the
// chapter that plays it. A row with no `forecast` yet belongs to a chapter
// that has not been built; nothing reads it until then.
//
//   forecast   { from, lines, certain, open }   shown before the event, as a
//              transmission (src/cineTalk.js). `certain` is the line that says
//              what will happen whatever is done; `open` the line that says
//              what is still the pilot's.
//   remember   { '<how it went>': { marrow, lux, vask } }   one line each

import { SEASON_NAMES as N } from './season-names.js';

export const FIXED = [
  {
    id: 'flare', chapter: 2, label: 'THE FLARE',
    forecast: {
      from: 'FORECAST',
      speaker: { name: 'The light ship', species: 'her instruments', cityId: 'The Long Dusk' },
      lines: [
        'THE STAR IS A RED DWARF. STARS LIKE IT FLARE. THIS ONE IS ABOUT TO.',
        'THE FIELD OVER ITS FACE IS TWISTED TIGHT AND STILL WINDING. WHEN IT LETS GO, IT LETS GO AT THIS WORLD.',
        'THE LIGHT ARRIVES FIRST AND FALLS ON THE DAY SIDE. THE PARTICLES ARRIVE LATER AND GO WHERE THE WORLD\'S FIELD LEADS THEM: DOWN ONTO THE NIGHT SIDE, IN ONE BAND.',
      ],
      certain: 'CERTAIN: THE FLARE COMES TODAY. NOTHING ABOARD CAN STOP IT.',
      open: 'NOT CERTAIN: WHO IS STANDING UNDER THAT BAND WHEN IT DOES.',
    },
    remember: {
      rerouted: {
        marrow: 'They walked their young round the line and we walked beside them. I keep seeing how small the small ones were.',
        lux: 'I wanted to hand over the cutters and go. I am telling you so you know I know.',
        vask: 'Every small shape I counted going in, I counted coming out. That has not happened to me often.',
      },
      partial: {
        marrow: 'Some of them came through the door we opened. I am trying to see those, and not only the others.',
        lux: 'Some got out. I say it to myself like a price I talked down.',
        vask: 'I have two counts from that night. One went in. One came out. They are not the same number.',
      },
      unheeded: {
        marrow: 'We knew, and we said so, and it was not enough. I am still seeing that.',
        lux: 'We warned them. I keep saying it. It does not help as much as I thought it would.',
        vask: 'I counted the small shapes at the edge. I have not finished the other count.',
      },
      armed: {
        marrow: 'They were carrying their children out of the way. We saw it, and we gave the other side fire.',
        lux: 'It was the safe thing. I was sure of it. I would like to be sure of it again.',
        vask: 'I counted them before the flare. I have not counted since. I know the number anyway.',
      },
    },
  },
  {
    id: 'contact', chapter: 3, label: 'NOT ALONE',
    forecast: {
      from: 'FORECAST',
      speaker: { name: 'The light ship', species: 'her instruments', cityId: 'Under the Ice' },
      lines: [
        'A PLANET WITH NO STAR. UNDER ITS ICE, AN OCEAN ITS OWN CORE KEEPS WARM.',
        'THERE IS A SIGNAL COMING UP THROUGH THE ICE, ON THE 21 CENTIMETRE BAND. IT REPEATS. IT IS MADE.',
        'IT CAN BE HEARD FROM ORBIT, BY ANY SHIP THAT LISTENS. THIS ONE DID. ANOTHER WILL.',
      ],
      certain: 'CERTAIN: WHOEVER IS CALLING WILL LEARN THEY ARE NOT ALONE.',
      open: 'NOT CERTAIN: WHO THEY LEARN IT FROM, AND WHAT THAT ONE WANTS.',
    },
    remember: {
      shown: {
        marrow: 'They named our sky. I have the call. I play it, some nights, with the lights down.',
        lux: 'I wanted to leave them alone. They looked up and they were fine. I am still working out what that says about me.',
        vask: 'One hole, eleven metres deep, open for good. It is the smallest thing we have done and I think the largest.',
      },
      left: {
        marrow: 'They are still calling for the stranger who went home. I hear it when it is quiet.',
        lux: 'They are happy. I keep that. Whoever finds them next, they had this long.',
        vask: 'Nothing in the archive. I check the empty entry anyway. It is still empty.',
      },
    },
  },
  {
    id: 'flood', chapter: 6, label: `THE ${N.hub.toUpperCase()} FLOODS`,
    forecast: {
      from: 'FORECAST',
      speaker: { name: 'The light ship', species: 'her instruments', cityId: 'Futures' },
      lines: [
        `THE ${N.rival.toUpperCase()} HAVE OPENED A MINE DEEPER THAN ANY NEUTRON STAR. IT MAKES ${N.currency.toUpperCase()}S FASTER THAN THE ${N.hub.toUpperCase()} CAN SPEND THEM.`,
        'MORE MONEY CHASING THE SAME GOODS. PRICES CLIMB. WHAT WAS SAVED BUYS HALF OF WHAT IT DID.',
        'NOTHING IS FIRED. NOBODY IS BOARDED. IT IS STILL THE FIRST MOVE OF A WAR.',
      ],
      certain: `CERTAIN: THE ${N.hub.toUpperCase()} FLOODS WITH CHEAP ${N.currency.toUpperCase()}S. PRICES THERE DOUBLE.`,
      open: 'NOT CERTAIN: WHETHER THE LIGHT SHIP GOES INTO WHAT FOLLOWS BOUND BY A FORECAST OF ITS OWN.',
    },
    remember: {
      bound: {
        marrow: 'We have a forecast now. I find I listen less. I am trying to stop that.',
        lux: 'I signed us onto a schedule. Some nights it is the only reason I sleep. Some nights it is the reason I do not.',
        vask: 'Everything we do is on a page somewhere that we may not read. I count anyway. It may not be the same number.',
      },
      free: {
        marrow: 'Nobody knows what we will do tomorrow. I had not known that was a thing a ship could own.',
        lux: 'I wanted that forecast. You said no. I am frightened every day, and it is mine.',
        vask: 'Prices doubled and our savings halved, and we still said no to knowing. It was the dearer choice. I would make it again.',
      },
    },
  },
  { id: 'defection', chapter: 9, label: 'THE ENVOY CROSSES' },
  {
    id: 'siege', chapter: 10, label: 'THE OUTER RING FALLS',
    forecast: {
      from: 'FORECAST',
      speaker: { name: 'The light ship', species: 'her instruments', cityId: `The ${N.hub}` },
      lines: [
        `A ${N.rival.toUpperCase()} FLEET IS INBOUND ON THE ${N.hub.toUpperCase()}. ITS COURSE WAS FILED A YEAR AGO, AS A NOTICE.`,
        'EVERY MOVE OF IT IS ALREADY FORECAST, AND SO IS EVERY MOVE OF THE DEFENCE.',
        'ONE SHIP IS ON NOBODY\'S FORECAST. THIS ONE.',
      ],
      certain: 'CERTAIN: THE SIEGE COMES TODAY, AND THE OUTER RING FALLS.',
      open: 'NOT CERTAIN: WHO FIGHTS BESIDE YOU, AND WHO IS STILL IN THE RING WHEN IT GOES.',
    },
    remember: {
      evacuated: {
        marrow: 'I watched the lifeboats leave the ring. I counted lights. I do not usually count.',
        lux: 'I said run, and you let them run. It is the only order I have ever been proud of.',
        vask: 'We gave up the ring to get them out. It cost the fleet. I have never minded a cost less.',
      },
      held: {
        marrow: 'The line held and the ring went dark with people in it. I saw which sections. I still see them.',
        lux: 'I said get them out. I keep saying it. It was a long time ago now and I keep saying it.',
        vask: 'We kept the fleet. We lost the people in the ring. Both numbers are in the log and neither is small.',
      },
    },
  },
  { id: 'refugees', chapter: 11, label: 'A HOME IS NEEDED' },
  { id: 'merger', chapter: 13, label: 'THE MERGER' },
];
