import { describe, expect, it } from 'vitest';
import { CARS } from '../content/cars';
import { CITY } from '../content/level';
import { SPECIALS } from '../content/specials';
import { MAX_LEVEL } from '../content/upgrades';
import { buildWorld, Run, STEP, type RunEvent } from './run';
import { freshLevels, type UpgradeLevels } from './save';

/* The six action buttons, driven through the public Run API the game uses. */

const world = buildWorld(CITY);
const maxed = (): UpgradeLevels => ({ engine: MAX_LEVEL, wheels: MAX_LEVEL, wings: MAX_LEVEL, boost: MAX_LEVEL });
const car = (special: string) => CARS.findIndex(c => c.special === special);
const BANANA = car('swerve'), FLAME = car('flameBoost'), SHARK = car('chomp'),
      DINO = car('stomp'), ROCKET = car('rocketBoost'), BOLT = car('lightning');

interface Played { run: Run; events: RunEvent[]; pressedAt: number; accepted: boolean | null; steps: number }

/* Play one full-power launch. press(run, step) says when to tap the action button;
   it is tapped once, the first time press returns true. */
function play(carIdx: number, lv: UpgradeLevels, press?: (run: Run, step: number) => boolean, maxSeconds = 20, boost = false): Played {
  const run = new Run(world, carIdx, lv, 1, 0);
  const events: RunEvent[] = [];
  let pressedAt = -1, accepted: boolean | null = null, i = 0;
  for (; i < maxSeconds / STEP && !run.finished; i++) {
    if (press && pressedAt < 0 && press(run, i)) { pressedAt = i; accepted = run.useSpecial(); }
    run.step({ boost: boost && run.shot.mode === 'air' });
    events.push(...run.takeEvents());
  }
  return { run, events, pressedAt, accepted, steps: i };
}

const dist = (p: Played) => -p.run.shot.z;
function stepOfCrash(carIdx: number, lv: UpgradeLevels) {
  const run = new Run(world, carIdx, lv, 1, 0);
  for (let i = 0; i < 20 / STEP; i++) { run.step(null); if (run.crashed) return i; }
  return -1;
}
const afterTakeoff = (secs: number) => {
  let t0 = -1;
  return (run: Run) => {
    if (t0 < 0 && run.shot.mode !== 'ramp') t0 = run.shot.t;
    return t0 >= 0 && run.shot.t - t0 >= secs;
  };
};
const specialEvents = (p: Played) => p.events.filter(e => e.type === 'shot' && ['swerve', 'burn', 'armed', 'zap'].includes(e.ev));

describe('special content', () => {
  it('each car has the action button from the brief', () => {
    expect(CARS.map(c => SPECIALS[c.special].name)).toEqual(
      ['Swerve', 'Flame Boost', 'Chomp', 'Stomp', 'Rocket Boost', 'Lightning Strike']);
  });

  it('boost specials last the right time', () => {
    expect(SPECIALS.flameBoost.effect).toEqual({ kind: 'burn', seconds: 1.3 });
    expect(SPECIALS.rocketBoost.effect).toEqual({ kind: 'burn', seconds: 2 });
  });
});

describe('every special', () => {
  it('is one use per launch', () => {
    CARS.forEach((_, c) => {
      const p = play(c, freshLevels(), afterTakeoff(.1));
      expect(p.accepted, CARS[c].name).toBe(true);
      expect(p.run.useSpecial(), CARS[c].name).toBe(false);
      expect(specialEvents(p), CARS[c].name).toHaveLength(1);
    });
  });

  it('never leaves the run stuck, whenever it is pressed', () => {
    CARS.forEach((_, c) => {
      for (const lv of [freshLevels(), maxed()]) {
        const plain = play(c, lv).steps;
        for (let at = 0; at <= plain + 10; at += 23) {
          const p = play(c, lv, (_r, i) => i >= at, 15);
          expect(p.run.finished, `${CARS[c].name} pressed at step ${at}`).toBe(true);
        }
      }
    });
  });

  it('can be pressed after landing', () => {
    CARS.forEach((_, c) => {
      const p = play(c, maxed(), r => r.shot.mode === 'roll');
      if (p.pressedAt < 0) return;           // crashed before ever rolling
      expect(p.accepted, CARS[c].name).toBe(true);
      expect(p.run.finished, CARS[c].name).toBe(true);
    });
  });

  it('does nothing once the run has stopped', () => {
    CARS.forEach((_, c) => {
      const p = play(c, freshLevels());
      expect(p.run.finished).toBe(true);
      expect(p.run.useSpecial(), CARS[c].name).toBe(false);
    });
  });

  // BUG: useSpecial() refuses on the ramp, so a tap there is silently lost (the button stays lit).
  // Enable once physics.ts useSpecial() no longer rejects mode 'ramp'.
  it('works when pressed on the ramp', () => {
    CARS.forEach((_, c) => {
      const p = play(c, freshLevels(), r => r.shot.mode === 'ramp' && r.shot.t > .1);
      expect(p.accepted, CARS[c].name).toBe(true);
      expect(specialEvents(p), CARS[c].name).toHaveLength(1);
      expect(p.run.finished).toBe(true);
    });
  });
});

describe('Swerve', () => {
  it('curves towards the gap of the next bus', () => {
    const p = play(BANANA, maxed(), afterTakeoff(.1));
    const bus = CITY.course.find(o => o.kind === 'bus')!;
    expect(p.run.shot.specialUsed).toBe(true);
    // it heads left towards the bus gap (x = -1.6)
    const run = new Run(world, BANANA, maxed(), 1, 0);
    const press = afterTakeoff(.1);
    let used = false;
    while (!run.finished && -run.shot.z < bus.z) { if (!used && press(run)) used = run.useSpecial(); run.step(null); }
    expect(run.shot.x).toBeLessThan(-.5);
  });

  // BUG: Swerve locks onto the next bus/building at the moment of the press. If the car then
  // flies over that one, the swerve is spent and the car hits the building it actually meets.
  it('saves itself for the building the car actually meets', () => {
    const plain = play(BANANA, maxed(), undefined, 20, true);
    const swerve = play(BANANA, maxed(), afterTakeoff(.1), 20, true);   // flies over the bus, meets PIZZA
    expect(dist(swerve)).toBeGreaterThan(dist(plain));
  });
});

describe('Flame Boost and Rocket Boost', () => {
  const burnTime = (p: Played) => {
    let n = 0;
    const run = new Run(world, p.run.carIdx, freshLevels(), 1, 0), press = afterTakeoff(.1);
    let used = false;
    while (!run.finished) {
      if (!used && press(run)) used = run.useSpecial();
      run.step(null);
      if (run.shot.boosting) n++;
      if (run.crashed) break;
    }
    return n * STEP;
  };

  it('Flame Boost blasts for about 1.3 s and helps a little', () => {
    const p = play(FLAME, freshLevels(), afterTakeoff(.1));
    expect(burnTime(p)).toBeCloseTo(1.3, 1);
    expect(dist(p)).toBeGreaterThan(dist(play(FLAME, freshLevels())));
  });

  it('Rocket Boost blasts for about 2 s and helps a little', () => {
    const p = play(ROCKET, freshLevels(), afterTakeoff(.1));
    expect(burnTime(p)).toBeCloseTo(2, 1);
    expect(dist(p)).toBeGreaterThan(dist(play(ROCKET, freshLevels())));
  });

  it('pressed while rolling it keeps pushing the car', () => {
    const plain = play(ROCKET, maxed());
    const p = play(ROCKET, maxed(), r => r.shot.mode === 'roll');
    if (p.pressedAt < 0) return;
    expect(p.run.finished).toBe(true);
    expect(dist(p)).toBeGreaterThanOrEqual(dist(plain));
  });

  it('pressed while rolling it does not fake a landing', () => {
    let tried = 0;
    for (const c of [FLAME, ROCKET]) for (const lv of [freshLevels(), maxed()]) {
      const p = play(c, lv, r => r.shot.mode === 'roll');
      if (p.pressedAt < 0) continue;
      tried++;
      expect(p.events.filter(e => e.type === 'shot' && e.ev === 'land'), CARS[c].name).toHaveLength(1);
    }
    expect(tried).toBeGreaterThan(0);
  });
});

describe('Chomp and Stomp', () => {
  const crashedInto = (p: Played) => p.events.flatMap(e => e.type === 'crash' ? [e.what] : [])[0];
  const cases = [['Chomp', SHARK], ['Stomp', DINO]] as const;
  const levels = [freshLevels(), { ...freshLevels(), engine: 1 }, { ...freshLevels(), engine: 2 }, maxed()];

  it('smash through one building, then the car is normal again', () => {
    let seen = 0;
    for (const [name, c] of cases) for (const lv of levels) {
      const plain = play(c, lv);
      if (crashedInto(plain) !== 'bld') continue;
      seen++;
      const p = play(c, lv, afterTakeoff(.1));
      expect(p.run.broken.size, name).toBe(1);
      expect(CITY.course[[...p.run.broken][0]].kind, name).toBe('bld');
      expect(p.events.filter(e => e.type === 'smash'), name).toHaveLength(1);
      expect(p.run.shot.smash, name).toBe(false);
      expect(dist(p), name).toBeGreaterThan(dist(plain));
    }
    expect(seen).toBeGreaterThan(1);
  });

  it('cones, cars and buses crash as normal and the bite stays ready for a building', () => {
    let seen = 0;
    for (const [name, c] of cases) for (const lv of levels) {
      const plain = play(c, lv);
      if (crashedInto(plain) === 'bld' || crashedInto(plain) === undefined) continue;
      seen++;
      const p = play(c, lv, afterTakeoff(.1));
      expect(p.run.crashed, name).toBe(true);
      expect(p.run.broken.size, name).toBe(0);
      expect(p.run.shot.smash, name).toBe(true);
      expect(dist(p), name).toBeCloseTo(dist(plain), 3);
    }
    expect(seen).toBeGreaterThan(0);
  });

  for (const [name, c] of cases) {
    it(`${name} works when pressed just before crashing into a building`, () => {
      const lv = levels.find(l => crashedInto(play(c, l)) === 'bld')!;
      expect(lv).toBeDefined();
      const at = stepOfCrash(c, lv);
      const p = play(c, lv, (_r, i) => i >= at - 1);
      expect(p.run.broken.size).toBe(1);
      expect(dist(p)).toBeGreaterThan(dist(play(c, lv)));
    });
  }
});

describe('Lightning Strike', () => {
  it('destroys one building ahead and the run still ends', () => {
    const p = play(BOLT, freshLevels(), afterTakeoff(.1));
    expect(p.run.broken.size).toBe(1);
    expect(p.events.filter(e => e.type === 'zap')).toHaveLength(1);
    expect(p.run.finished).toBe(true);
  });

  // BUG: zapTarget() picks the nearest piece of anything (usually the cones the car flies over),
  // not "the building ahead". Enable once collisions.ts zapTarget() only picks kind 'bld'.
  it('hits a building, not cones or cars', () => {
    const p = play(BOLT, freshLevels(), afterTakeoff(.1));
    const zap = p.events.find(e => e.type === 'zap');
    expect(zap && zap.type === 'zap' && zap.part.kind).toBe('bld');
  });

  it('works when pressed just before a crash', () => {
    const at = stepOfCrash(BOLT, freshLevels());
    const p = play(BOLT, freshLevels(), (_r, i) => i >= at - 4);
    expect(dist(p)).toBeGreaterThan(dist(play(BOLT, freshLevels())));
  });
});
