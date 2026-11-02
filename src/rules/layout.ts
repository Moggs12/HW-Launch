import type { LevelDef } from '../content/level';
import { makeRng } from './rng';

/* Everything about a level that is placed at random: side buildings (which you can crash into),
   skyline, clouds, parked-car wobble and the coins. Made from the level seed so it is the same
   every launch. The 3D layer only draws what is listed here. */

export interface Block { x: number; zc: number; w: number; h: number; d: number; colour: number }
export interface SideBlock extends Block { side: -1 | 1; z0: number; z1: number }  // z0..z1: distance range
export interface Cloud { x: number; y: number; z: number; puffs: { r: number; x: number; y: number; z: number }[] }
export interface CoinSpot { x: number; y: number; z: number }

export interface Layout {
  sideX: number;               // x where the side buildings start
  side: SideBlock[];
  back: Block[];
  skyline: Block[];
  clouds: Cloud[];
  carJitter: number[][];       // per course item (cars rows only): yaw wobble per parked car
  carRowXs: number[];          // x of each parked car in a row
  coins: CoinSpot[];
}

export function buildLayout(level: LevelDef): Layout {
  const rnd = makeRng(level.seed), LEN = level.length;
  const sideX = level.roadHalf + level.walk + .3;
  const side: SideBlock[] = [], back: Block[] = [], skyline: Block[] = [], clouds: Cloud[] = [];

  for (const s of [-1, 1] as const) {
    let z = level.behind;
    while (z > -LEN - 60) {
      const d = 9 + rnd() * 10, w = 10 + rnd() * 8, h = 9 + rnd() * 30, colour = Math.floor(rnd() * 10);
      side.push({ side: s, x: s * (sideX + w / 2), zc: z - d / 2, w, h, d, colour, z0: -z, z1: -(z - d) });
      const h2 = 18 + rnd() * 45;
      back.push({ x: s * (sideX + w + 12), zc: z - d / 2, w: 12, h: h2, d, colour: colour + 3 });
      z -= d + (rnd() < .12 ? 8 : .6);
    }
  }
  for (let i = 0; i < 60; i++) {
    const s = i % 2 ? 1 : -1, x = s * (60 + rnd() * 200), zc = -rnd() * LEN - 40, h = 30 + rnd() * 90;
    const w = 14 + rnd() * 16, d = 14 + rnd() * 16, colour = Math.floor(rnd() * 10);
    skyline.push({ x, zc, w, h, d, colour });
  }
  for (let i = 0; i < 26; i++) {
    const n = 4 + Math.floor(rnd() * 4), puffs = [];
    for (let j = 0; j < n; j++) { const r = 6 + rnd() * 6; puffs.push({ r, x: j * 7 - n * 3.5, y: rnd() * 3, z: rnd() * 4 }); }
    clouds.push({ puffs, x: (rnd() - .5) * 500, y: 90 + rnd() * 80, z: -rnd() * LEN * 1.2 + 100 });
  }
  const carRowXs: number[] = [];
  for (let x = -level.roadHalf + 2.2; x < level.roadHalf; x += 4.3) carRowXs.push(x);
  const carJitter = level.course.map(o => o.kind === 'cars' ? carRowXs.map(() => (rnd() - .5) * .2) : []);

  const coins: CoinSpot[] = [];
  for (let z = level.coinSpacing; z < LEN - 40; z += level.coinSpacing) {
    const next = level.course.find(o => o.z > z) ?? { h: 6 };
    const y = 1.2 + rnd() * Math.min(18, next.h + 3), x = (rnd() - .5) * 10;
    for (let j = 0; j < 3; j++) coins.push({ x, y, z: -(z + j * 1.6) });
  }
  return { sideX, side, back, skyline, clouds, carJitter, carRowXs, coins };
}
