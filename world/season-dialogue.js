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
  { id: 'contact', chapter: 3, label: 'THE SKY IS LEARNED OF' },
  { id: 'flood', chapter: 6, label: `THE ${N.hub.toUpperCase()} FLOODS` },
  { id: 'defection', chapter: 9, label: 'THE ENVOY CROSSES' },
  { id: 'siege', chapter: 10, label: 'THE OUTER RING FALLS' },
  { id: 'refugees', chapter: 11, label: 'A HOME IS NEEDED' },
  { id: 'merger', chapter: 13, label: 'THE MERGER' },
];
