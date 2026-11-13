import { describe, expect, it } from 'vitest';
import { CARS } from '../content/cars';
import { CITY } from '../content/level';
import { REWARDS } from '../content/upgrades';
import { AIM, canLaunch } from './aim';
import { runReward } from './economy';
import { buildWorld, Run, simulate, STEP, type RunEvent } from './run';
import type { UpgradeLevels } from './save';

/* Playability sweep: many launches played headlessly, the way game.ts drives a Run. */
const world = buildWorld(CITY);
const lvAt = (n: number): UpgradeLevels => ({ engine: n, wheels: n, wings: n, boost: n });
const tag = (e: RunEvent) => e.type === 'shot' ? e.ev : e.type;

interface Played { run: Run; events: RunEvent[]; seconds: number; backwards: string | null; zapCrash: boolean }

/* specialAt: seconds after take-off. Steps on a little past the stop, like the game's end pause. */
function play(car: number, lv: UpgradeLevels, power: number, heading: number, boost: boolean, specialAt?: number): Played {
  const run = new Run(world, car, lv, power, heading, power * AIM.pullBack);
  const events: RunEvent[] = [];
  let takeoff = -1, prevD = -Infinity, backwards: string | null = null, i = 0;
  for (; i < 30 / STEP && !run.finished; i++) {
    if (takeoff < 0 && run.shot.mode !== 'ramp') takeoff = run.shot.t;
    if (specialAt !== undefined && takeoff >= 0 && !run.shot.specialUsed && run.shot.t - takeoff >= specialAt) run.useSpecial();
    run.step({ boost: boost && run.shot.mode === 'air' });
    const got = run.takeEvents(); events.push(...got);
    const d = -run.shot.z;
    if (run.shot.mode !== 'ramp') {
      // distance only goes forward, except a crash puts the car just in front of what it hit
      if (d < prevD - 1e-9 && !got.some(e => e.type === 'crash')) backwards ??= `${prevD.toFixed(2)} -> ${d.toFixed(2)}`;
      prevD = d;
    }
  }
  for (let j = 0; j < 120; j++) { run.step(null); events.push(...run.takeEvents()); }   // end pause
  // crashed into the very building a bolt was already on its way to (crashing into a side building meanwhile is fine)
  const ci = events.findIndex(e => e.type === 'crash'), zi = events.findIndex(e => e.type === 'smash' && e.cause === 'zap');
  const zap = events.find(e => e.type === 'zap');
  const zapCrash = ci >= 0 && zi > ci && zap?.type === 'zap' && Math.abs(-run.shot.z - (zap.part.z0 - 1.9)) < .01;
  return { run, events, seconds: i * STEP, backwards, zapCrash };
}

describe('one launch, end to end', () => {
  it('playability sweep: every car, level, pull, aim, boost and special', () => {
    const problems: string[] = [];
    let n = 0, longest = 0;
    for (let car = 0; car < CARS.length; car++) for (let L = 0; L <= 3; L++)
      for (const power of [AIM.minPower, .35, .65, 1]) for (const heading of [-AIM.maxHeading, 0, AIM.maxHeading])
        for (const boost of [false, true]) for (const specialAt of [undefined, .3, 1.2]) {
          const p = play(car, lvAt(L), power, heading, boost, specialAt), { run, events } = p;
          const key = `car ${car} L${L} power ${power} aim ${heading} boost ${boost} special ${specialAt}`;
          const count = (t: string) => events.filter(e => tag(e) === t).length;
          const d = -run.shot.z;
          n++; longest = Math.max(longest, p.seconds);
          if (!run.finished) problems.push(`never ends: ${key}`);
          if (p.seconds > 14) problems.push(`too long ${p.seconds.toFixed(1)}s: ${key}`);
          if (!Number.isFinite(d) || d < 0 || d > CITY.length) problems.push(`odd distance ${d}: ${key}`);
          if (p.backwards) problems.push(`went backwards ${p.backwards}: ${key}`);
          if (count('takeoff') !== 1) problems.push(`takeoff x${count('takeoff')}: ${key}`);
          if (count('crash') > 1) problems.push(`crash x${count('crash')}: ${key}`);
          if (run.crashed !== (count('crash') === 1)) problems.push(`crashed flag mismatch: ${key}`);
          if (!run.crashed && count('stop') !== 1) problems.push(`stop x${count('stop')}: ${key}`);
          if (count('land') > 1) problems.push(`land x${count('land')}: ${key}`);
          if (count('smash') > 1) problems.push(`smash x${count('smash')}: ${key}`);
          if (specialAt === undefined && (count('smash') || run.shot.specialUsed)) problems.push(`special without a press: ${key}`);
          if (p.zapCrash) problems.push(`crashed into the building the bolt was hitting: ${key}`);
          const coins = events.flatMap(e => e.type === 'coin' ? [e.index] : []);
          if (new Set(coins).size !== coins.length || coins.length !== run.coinsGrabbed) problems.push(`coin events wrong: ${key}`);
          if (runReward(Math.max(0, Math.round(d)), run.coinsGrabbed).total < REWARDS.minimum) problems.push(`no coins: ${key}`);
          if (power === AIM.minPower && d < 5) problems.push(`flop at the smallest pull (${d.toFixed(1)} m): ${key}`);
        }
    expect(n).toBe(CARS.length * 4 * 4 * 3 * 2 * 3);
    expect(problems.slice(0, 20)).toEqual([]);
    expect(longest).toBeLessThan(14);
  }, 120_000);

  it('a pull too small to launch does nothing; the smallest real pull clears the ramp', () => {
    expect(canLaunch(AIM.minPower * .9)).toBe(false);
    expect(canLaunch(0)).toBe(false);
    for (let car = 0; car < CARS.length; car++) {
      const run = simulate(world, car, lvAt(0), AIM.minPower);
      expect(run.finished).toBe(true);
      expect(-run.shot.z, CARS[car].name).toBeGreaterThan(5);
    }
  });

  it('the same inputs give the same launch', () => {
    for (const [car, specialAt] of [[0, .4], [2, .2], [4, .5], [5, .1]] as const) {
      const a = play(car, lvAt(2), .8, .15, true, specialAt), b = play(car, lvAt(2), .8, .15, true, specialAt);
      expect(b.events).toEqual(a.events);
      expect([b.run.shot.x, b.run.shot.z, b.run.shot.t, b.run.coinsGrabbed]).toEqual([a.run.shot.x, a.run.shot.z, a.run.shot.t, a.run.coinsGrabbed]);
    }
  });

  it('a clean landing fires takeoff, land and stop in order, once each', () => {
    const { events, run } = play(0, lvAt(0), .3, 0, false);
    expect(run.crashed).toBe(false);
    const flight = events.map(tag).filter(t => t !== 'coin' && t !== 'bounce');
    expect(flight).toEqual(['takeoff', 'land', 'stop']);
  });

  it('a crash fires once and the car stops in front of what it hit', () => {
    const { events, run } = play(0, lvAt(0), 1, 0, false);
    expect(run.crashed).toBe(true);
    expect(events.filter(e => e.type === 'crash')).toHaveLength(1);
    const hitZ = Math.min(...world.parts.filter(p => p.z0 > -run.shot.z).map(p => p.z0));
    expect(hitZ - -run.shot.z).toBeCloseTo(1.9, 1);
  });

  it('Lightning: the bolt lands before the car can crash into its building, and the run waits for it', () => {
    for (let L = 0; L <= 3; L++) for (const specialAt of [0, .3, .8, 1.5, 2.5]) {
      const p = play(5, lvAt(L), .7, 0, false, specialAt);
      expect(p.zapCrash, `L${L} special ${specialAt}`).toBe(false);
      const zap = p.events.filter(e => e.type === 'zap'), smash = p.events.filter(e => e.type === 'smash');
      expect(smash.length).toBe(zap.length);
    }
  });

  it('an action button press is one use per launch', () => {
    const run = new Run(world, 1, lvAt(0), 1, 0);
    expect(run.useSpecial()).toBe(true);                    // works on the ramp too
    expect(run.useSpecial()).toBe(false);
    while (run.shot.mode === 'ramp') run.step(null);
    expect(run.useSpecial()).toBe(false);
  });

  it('bad inputs are clamped rather than breaking the launch', () => {
    for (const [power, heading] of [[NaN, 0], [5, 0], [-1, 0], [1, NaN]]) {
      const run = simulate(world, 0, lvAt(0), power, heading);
      expect(run.finished).toBe(true);
      expect(Number.isFinite(run.shot.z)).toBe(true);
    }
  });
});
