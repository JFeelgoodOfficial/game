// The Sky City's governor: High Cantor Oriel Vane, who meets the pilot on the
// pad pier. Saturnia's part in the Crown errand (src/crownErrand.js): she takes
// the WaveMall's race car, and names the price of an alliance with Terra, which
// is beating Vex Halcyon on the Rim Circuit (src/skyRace.js).
//
// Words only; src/skyWalk.js stands her on the deck and opens the dialogue.

export const CANTOR = {
  name: 'High Cantor Oriel Vane',
  title: 'Governor of the Sky City',
  // city-local, on the pier between the pad and the gardens, facing the pad
  spot: { x: 6, y: 0, z: 191 },
  yaw: 0,
  seed: 0x5a7c0a17,
  prompt: 'E — SPEAK TO THE HIGH CANTOR',
  stranger: [
    'A Terran on my pier. Saturnia and Terra are sworn enemies, pilot; you will have heard.',
    'Enjoy the view, and mind the rim. The drones are busy enough.',
  ],
  car: [
    'A Terran on my pier. And that shape in your hold... so the WaveMall built it after all.',
    'I am Oriel Vane, High Cantor of this city. I will take the car. I am pleased, and I will not pretend otherwise.',
    'But know where you stand. Saturnia and Terra are sworn enemies. A gift does not unswear that.',
    'A race might. Beat the best driver we have, Vex Halcyon, on the Rim Circuit, and you may tell your Patron that Saturnia is Terra’s ally.',
    'The booth is on the rim, under the start line. Halcyon is already on the poster.',
  ],
  race: [
    'Vex Halcyon is still on the poster, Terran. The booth is on the rim, under the start line.',
  ],
  won: [
    'You beat Halcyon. On our own ribbon, in our own car.',
    'Then the oath is unsworn. Tell Patron Axilo that Saturnia stands with Terra.',
  ],
  ally: [
    'Terra’s pilot. The pier is yours whenever you want it.',
  ],
};
