import { describe, expect, it } from 'vitest';
import { CARS } from '../content/cars';
import { CITY } from '../content/level';
import { SPECIALS } from '../content/specials';
import { MAX_LEVEL, UPGRADES } from '../content/upgrades';
import { canLaunch, pullFromDrag } from './aim';
import { courseParts } from './collisions';
import { buyUpgrade, canUnlock, recordRun, runReward, unlockNext, upgradeCost } from './economy';
import { buildLayout } from './layout';
import { launchSpeed, makeShot, stepShot, useSpecial } from './physics';
import { buildWorld, simulate } from './run';
import { freshLevels, freshSave, LEGACY_KEY, loadSave, migrate, SAVE_KEY, type Storage } from './save';

const world = buildWorld(CITY);
const maxed = () => ({ engine: 3, wheels: 3, wings: 3, boost: 3 });
const memStore = (init: Record<string, string> = {}): Storage & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, get: k => data[k] ?? null, set: (k, v) => { data[k] = v; } };
};

describe('aim', () => {
  it('a tiny pull does nothing', () => {
    expect(canLaunch(pullFromDrag(0, 10, 400, 800).power)).toBe(false);
    expect(canLaunch(pullFromDrag(0, 200, 400, 800).power)).toBe(true);
  });
  it('clamps power and aim', () => {
    const p = pullFromDrag(9999, 9999, 400, 800);
    expect(p.power).toBe(1);
    expect(p.heading).toBeCloseTo(.3);
  });
});

describe('physics', () => {
  it('matches the prototype launch speed formula', () => {
    // (BASE_SPEED + 6*engine) * (.32 + .68*power)
    expect(launchSpeed(CARS[0], freshLevels(), 1)).toBeCloseTo(22);
    expect(launchSpeed(CARS[5], { ...freshLevels(), engine: 2 }, .5)).toBeCloseTo((66 + 12) * (.32 + .34));
  });

  const flying = (s: { mode: string }) => s.mode === 'ramp' || s.mode === 'air';

  it('runs up the ramp, speeding up, and leaves the lip at launch speed', () => {
    const s = makeShot(CARS[0], freshLevels(), SPECIALS.swerve.effect, 1, 0, world.ramp);
    expect(s.mode).toBe('ramp');
    expect(s.z).toBeCloseTo(world.ramp.startZ);
    let lastV = 0, t = 0;
    while (s.mode === 'ramp') { stepShot(s, 1 / 120, null); expect(s.rampV).toBeGreaterThanOrEqual(lastV); lastV = s.rampV; t += 1 / 120; }
    expect(s.events).toContain('takeoff');
    expect(s.y).toBeCloseTo(CITY.ramp.height);
    expect(Math.hypot(s.vx, s.vy, s.vz)).toBeCloseTo(22);
    expect(t).toBeLessThan(1.6);   // the run-up is quick
  });

  it('flies forward (−z) and comes back down', () => {
    const s = makeShot(CARS[0], freshLevels(), SPECIALS.swerve.effect, 1, 0, world.ramp);
    let peak = 0;
    for (let i = 0; i < 3000 && flying(s); i++) { stepShot(s, 1 / 120, null); peak = Math.max(peak, s.y); }
    expect(s.z).toBeLessThan(-10);
    expect(peak).toBeGreaterThan(CITY.ramp.height + 2);
    expect(s.y).toBe(0);
  });

  it('wings make the car glide further', () => {
    const plain = makeShot(CARS[1], freshLevels(), SPECIALS.flameBoost.effect, 1, 0, world.ramp);
    const winged = makeShot(CARS[1], { ...freshLevels(), wings: 3 }, SPECIALS.flameBoost.effect, 1, 0, world.ramp);
    for (const s of [plain, winged]) for (let i = 0; i < 3000 && flying(s); i++) stepShot(s, 1 / 120, null);
    expect(-winged.z).toBeGreaterThan(-plain.z);
  });

  it('boost uses up its fuel (in the air only)', () => {
    const s = makeShot(CARS[0], { ...freshLevels(), boost: 2 }, SPECIALS.swerve.effect, 1, 0, world.ramp);
    while (s.mode === 'ramp') stepShot(s, 1 / 120, { boost: true });
    expect(s.fuel).toBeCloseTo(.64);
    for (let i = 0; i < 200; i++) stepShot(s, 1 / 120, { boost: true });
    expect(s.fuel).toBeLessThanOrEqual(0);
  });

  it('a special can only be used once, and not on the ramp', () => {
    const s = makeShot(CARS[1], freshLevels(), SPECIALS.flameBoost.effect, 1, 0, world.ramp);
    expect(useSpecial(s, CITY.course)).toBe(false);
    while (s.mode === 'ramp') stepShot(s, 1 / 120, null);
    expect(useSpecial(s, CITY.course)).toBe(true);
    expect(useSpecial(s, CITY.course)).toBe(false);
    expect(s.burn).toBeCloseTo(1.3);
  });
});

describe('course & collisions', () => {
  it('splits gapped obstacles into two pieces', () => {
    const parts = courseParts(CITY);
    const bus = parts.filter(p => p.item === 2);
    expect(bus).toHaveLength(2);
    expect(bus[0].x1).toBeCloseTo(-3.1);
    expect(bus[1].x0).toBeCloseTo(-.1);
    expect(parts.filter(p => p.item === CITY.course.length - 1)).toHaveLength(1);   // FINISH has no gap
  });

  it('a weak launch of the first car stops at or before the cones', () => {
    const run = simulate(world, 0, freshLevels(), .3);
    expect(run.finished).toBe(true);
    expect(-run.shot.z).toBeLessThanOrEqual(24);
  });

  it('a full launch of the first car hits something and stops', () => {
    const run = simulate(world, 0, freshLevels(), 1);
    expect(run.finished).toBe(true);
    expect(run.crashed).toBe(true);
    expect(-run.shot.z).toBeGreaterThan(20);
  });

  it('every launch finishes within 15 seconds', () => {
    CARS.forEach((_, i) => {
      for (const lv of [freshLevels(), maxed()]) {
        const run = simulate(world, i, lv, 1, 0, { boost: true, maxSeconds: 15 });
        expect(run.finished, `car ${i}`).toBe(true);
      }
    });
  });

  it('Chomp smashes through one obstacle', () => {
    const plain = simulate(world, 2, freshLevels(), 1);
    const chomp = simulate(world, 2, freshLevels(), 1, 0, { specialAt: .1 });
    expect(chomp.broken.size).toBe(1);
    expect(-chomp.shot.z).toBeGreaterThan(-plain.shot.z);
  });

  it('Lightning breaks the obstacle ahead', () => {
    const run = simulate(world, 5, freshLevels(), 1, 0, { specialAt: .1 });
    expect(run.broken.size).toBe(1);
  });

  it('the city layout is the same every time', () => {
    const a = buildLayout(CITY), b = buildLayout(CITY);
    expect(a.coins).toEqual(b.coins);
    expect(a.side.length).toBeGreaterThan(50);
    expect(a.coins.length % 3).toBe(0);
  });
});

describe('economy', () => {
  it('prices match the prototype formula', () => {
    const proto = (idx: number, l: number) => Math.round(30 * (l + 1) * (1 + idx * .75) / 5) * 5;
    CARS.forEach((_, i) => { for (let l = 0; l < MAX_LEVEL; l++) expect(upgradeCost(i, l)).toBe(proto(i, l)); });
    expect(upgradeCost(0, 3)).toBeNull();
  });

  it('every launch earns coins', () => {
    expect(runReward(0, 0).total).toBeGreaterThan(0);
    expect(runReward(100, 3)).toEqual({ distCoins: 150, coinCoins: 15, total: 165 });
  });

  it('banks a run and tracks the best distance', () => {
    const s = freshSave();
    const r1 = recordRun(s, 0, 40.4, 2);
    expect(r1).toMatchObject({ distance: 40, total: 70, isBest: true });
    const r2 = recordRun(s, 0, 30, 0);
    expect(r2.isBest).toBe(false);
    expect(s.coins).toBe(115);
    expect(s.best[0]).toBe(40);
  });

  it('buying needs enough coins', () => {
    const s = freshSave();
    expect(buyUpgrade(s, 0, 'engine')).toBe(false);
    s.coins = 30;
    expect(buyUpgrade(s, 0, 'engine')).toBe(true);
    expect(s.coins).toBe(0);
    expect(s.levels[0].engine).toBe(1);
  });

  it('maxing all 12 upgrades unlocks the next car', () => {
    const s = freshSave();
    s.coins = 1e6;
    expect(canUnlock(s, 0)).toBe(false);
    for (const u of UPGRADES) for (let l = 0; l < MAX_LEVEL; l++) buyUpgrade(s, 0, u.key);
    expect(canUnlock(s, 0)).toBe(true);
    expect(unlockNext(s)).toBe(true);
    expect(s.unlocked).toBe(2);
    expect(s.car).toBe(1);
  });
});

describe('saves', () => {
  it('starts fresh when nothing is stored', () => {
    expect(loadSave(memStore())).toEqual(freshSave());
  });

  it('migrates the prototype save instead of wiping it', () => {
    const old = { coins: 1234, unlocked: 2, car: 1, lv: [maxed(), { engine: 1, wheels: 0, wings: 2, boost: 0 }, ...Array(4).fill(freshLevels())], best: [210, 95, 0, 0, 0, 0] };
    const store = memStore({ [LEGACY_KEY]: JSON.stringify(old) });
    const s = loadSave(store);
    expect(s.version).toBe(1);
    expect(s.coins).toBe(1234);
    expect(s.car).toBe(1);
    expect(s.levels[1]).toEqual({ engine: 1, wheels: 0, wings: 2, boost: 0 });
    expect(s.best[0]).toBe(210);
    expect(JSON.parse(store.data[SAVE_KEY]).version).toBe(1);
  });

  it('survives junk and out-of-range values', () => {
    expect(loadSave(memStore({ [SAVE_KEY]: 'not json' }))).toEqual(freshSave());
    const s = migrate({ version: 1, coins: -5, unlocked: 99, car: 42, levels: [{ engine: 9 }], best: 'x' });
    expect(s.coins).toBe(0);
    expect(s.unlocked).toBe(CARS.length);
    expect(s.car).toBe(CARS.length - 1);
    expect(s.levels[0].engine).toBe(MAX_LEVEL);
    expect(s.levels).toHaveLength(CARS.length);
  });
});
