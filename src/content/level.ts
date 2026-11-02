/* The toy city street. Distances are metres from the catapult.
   Course: things across the road. z = where it starts, d = depth, h = height,
   gap = x of the alley through it (null = no way through). */
export type ObstacleKind = 'cones' | 'cars' | 'bus' | 'bld';

export interface CourseItem {
  z: number;
  d: number;
  h: number;
  kind: ObstacleKind;
  gap?: number | null;
  sign?: string;
}

/* The launch ramp behind the start line: a flat run-up then a curve up to the lip. */
export interface RampDef {
  run: number;      // flat run-up length (m)
  height: number;   // height of the lip (m)
  width: number;
}

export interface LevelDef {
  id: string;
  ramp: RampDef;
  seed: number;          // drives the side buildings, coins and decoration
  roadHalf: number;      // half the road width
  walk: number;          // pavement width
  length: number;
  behind: number;        // how far the street and buildings carry on behind the ramp lip (start area)
  alleyWidth: number;    // gap width through buildings
  busGapHalf: number;    // half the gap between the two buses
  coinSpacing: number;
  course: readonly CourseItem[];
}

export const CITY: LevelDef = {
  id: 'toy-city',
  ramp: { run: 9, height: 3.5, width: 7 },
  seed: 7,
  roadHalf: 9,
  walk: 3.2,
  length: 960,
  behind: 60,
  alleyWidth: 3.8,
  busGapHalf: 1.5,
  coinSpacing: 14,
  course: [
    { z: 24,  d: 1,   h: .9,  kind: 'cones' },
    { z: 48,  d: 2.2, h: 1.6, kind: 'cars' },
    { z: 78,  d: 3,   h: 3.4, kind: 'bus', gap: -1.6 },
    { z: 112, d: 10,  h: 6,   kind: 'bld', gap: -5, sign: 'PIZZA' },
    { z: 142, d: 1,   h: .9,  kind: 'cones' },
    { z: 170, d: 12,  h: 8,   kind: 'bld', gap: 5, sign: 'TOYS' },
    { z: 205, d: 3,   h: 3.4, kind: 'bus', gap: -1.6 },
    { z: 235, d: 12,  h: 10,  kind: 'bld', gap: -3, sign: 'BURGERS' },
    { z: 272, d: 2.2, h: 1.6, kind: 'cars' },
    { z: 305, d: 14,  h: 12,  kind: 'bld', gap: 6, sign: 'CINEMA' },
    { z: 345, d: 1,   h: .9,  kind: 'cones' },
    { z: 380, d: 14,  h: 14,  kind: 'bld', gap: -6, sign: 'HOTEL' },
    { z: 425, d: 3,   h: 3.4, kind: 'bus', gap: -1.6 },
    { z: 465, d: 16,  h: 17,  kind: 'bld', gap: 2, sign: 'SWEETS' },
    { z: 560, d: 16,  h: 20,  kind: 'bld', gap: -4, sign: 'ARCADE' },
    { z: 665, d: 18,  h: 24,  kind: 'bld', gap: 5, sign: 'MUSEUM' },
    { z: 780, d: 20,  h: 28,  kind: 'bld', gap: -2, sign: 'TOWER' },
    { z: 900, d: 30,  h: 90,  kind: 'bld', gap: null, sign: 'FINISH' },
  ],
};
