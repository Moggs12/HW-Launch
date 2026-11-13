import { CARS } from '../content/cars';
import { CITY } from '../content/level';
import { UPGRADES } from '../content/upgrades';
import { AIM } from './aim';
import { buyUpgrade, canUnlock, recordRun, unlockNext, upgradeCost, upgradesDone, upgradesTotal } from './economy';
import { makeRng } from './rng';
import { buildWorld, simulate, STEP } from './run';
import { freshSave, type SaveData } from './save';

/* Plays the whole game like a child would, buying the cheapest upgrade whenever possible, to check
   the pacing. Used by the tests. */
const world = buildWorld(CITY);

/* Rough seconds a child spends around each launch that is not flight: dragging, the result card,
   the coins flying in, a quick look in the garage. */
export const OVERHEAD_SECONDS = 12;

export interface CarPacing {
  car: string; launches: number; firstDist: number; lastDist: number; maxSeconds: number;
  firstBuyAt: number;       // launch number of the first upgrade bought on this car (0 = none)
  minutes: number;          // rough play time to max the car
  longestDry: number;       // most launches in a row with nothing bought
}

export interface Pull { power: number; heading: number; boost: boolean; specialAt?: number }

/* Spend everything on the cheapest upgrades. Returns how many were bought. */
function buyAll(save: SaveData, c: number) {
  let n = 0;
  for (;;) {
    const opts = UPGRADES.map(u => ({ k: u.key, cost: upgradeCost(c, save.levels[c][u.key]) }))
      .filter(o => o.cost !== null && o.cost <= save.coins);
    if (!opts.length) return n;
    opts.sort((a, b) => a.cost! - b.cost!);
    if (!buyUpgrade(save, c, opts[0].k)) return n;
    n++;
  }
}

export function playWith(nextPull: (car: number) => Pull, maxLaunches = 200): { pacing: CarPacing[]; save: SaveData } {
  const save = freshSave(), out: CarPacing[] = [];
  for (let c = 0; c < CARS.length; c++) {
    let launches = 0, tries = 0, firstDist = 0, lastDist = 0, maxSeconds = 0, seconds = 0, firstBuyAt = 0, dry = 0, longestDry = 0;
    while (launches < maxLaunches && tries++ < maxLaunches * 2) {
      const p = nextPull(c);
      if (p.power < AIM.minPower) { seconds += 2; continue; }   // the game ignores tiny pulls
      const run = simulate(world, c, save.levels[c], p.power, p.heading, { boost: p.boost, specialAt: p.specialAt });
      const r = recordRun(save, c, -run.shot.z, run.coinsGrabbed);
      launches++; lastDist = r.distance; if (launches === 1) firstDist = r.distance;
      const t = run.shot.t + .9;
      maxSeconds = Math.max(maxSeconds, t); seconds += t + OVERHEAD_SECONDS;
      const bought = buyAll(save, c);
      if (bought && !firstBuyAt) firstBuyAt = launches;
      dry = bought ? 0 : dry + 1; longestDry = Math.max(longestDry, dry);
      if (upgradesDone(save, c) === upgradesTotal) break;
    }
    out.push({ car: CARS[c].name, launches, firstDist, lastDist, maxSeconds: Math.round(maxSeconds * 10) / 10,
      firstBuyAt, minutes: Math.round(seconds / 6) / 10, longestDry });
    if (canUnlock(save, c)) unlockNext(save);
    else if (c < CARS.length - 1) break;   // stuck: the tests will notice the missing cars
  }
  return { pacing: out, save };
}

/* A steady player: full pulls, straight, boost held, action in the air. */
export function playThrough(power = .9, specialAt = .6): CarPacing[] {
  return playWith(() => ({ power, heading: 0, boost: true, specialAt })).pacing;
}

/* A real four-year-old: pulls anywhere from weak to full, aims a bit off, sometimes forgets
   boost or the action button, and now and then lets go of a tiny pull that does nothing. */
export function playMixed(seed = 7): { pacing: CarPacing[]; save: SaveData } {
  const rnd = makeRng(seed);
  return playWith(() => {
    const r = rnd();
    const power = r < .08 ? rnd() * AIM.minPower : r < .3 ? .3 + rnd() * .3 : .6 + rnd() * .4;
    return {
      power, heading: (rnd() - .5) * AIM.maxHeading,
      boost: rnd() < .6,
      specialAt: rnd() < .6 ? .2 + rnd() * 1.2 : undefined,
    };
  });
}

export { STEP };
