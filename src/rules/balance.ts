import { CARS } from '../content/cars';
import { CITY } from '../content/level';
import { UPGRADES } from '../content/upgrades';
import { buyUpgrade, canUnlock, recordRun, unlockNext, upgradeCost } from './economy';
import { buildWorld, simulate, STEP } from './run';
import { freshSave } from './save';

/* Plays the whole game like a typical child would (full pulls, straight, boost held, action in
   the air, cheapest upgrade bought whenever possible) to check the pacing. Used by the tests. */
const world = buildWorld(CITY);

export interface CarPacing { car: string; launches: number; firstDist: number; lastDist: number; maxSeconds: number }

export function playThrough(power = .9, specialAt = .6): CarPacing[] {
  const save = freshSave(), out: CarPacing[] = [];
  for (let c = 0; c < CARS.length; c++) {
    let launches = 0, firstDist = 0, lastDist = 0, maxSeconds = 0;
    while (launches < 200) {
      const run = simulate(world, c, save.levels[c], power, 0, { boost: true, specialAt });
      const r = recordRun(save, c, -run.shot.z, run.coinsGrabbed);
      launches++; lastDist = r.distance; if (launches === 1) firstDist = r.distance;
      maxSeconds = Math.max(maxSeconds, run.shot.t + .9);
      for (;;) {   // buy the cheapest upgrade we can afford
        const opts = UPGRADES.map(u => ({ k: u.key, cost: upgradeCost(c, save.levels[c][u.key]) })).filter(o => o.cost !== null && o.cost <= save.coins);
        if (!opts.length) break;
        opts.sort((a, b) => a.cost! - b.cost!);
        buyUpgrade(save, c, opts[0].k);
      }
      if (canUnlock(save, c)) { unlockNext(save); break; }
      if (c === CARS.length - 1 && UPGRADES.every(u => save.levels[c][u.key] === 3)) break;
    }
    out.push({ car: CARS[c].name, launches, firstDist, lastDist, maxSeconds: Math.round(maxSeconds * 10) / 10 });
  }
  return out;
}

export { STEP };
