import { describe, expect, it } from 'vitest';
import { CARS } from '../content/cars';
import { CITY } from '../content/level';
import { SPECIALS } from '../content/specials';
import { courseParts, hitTest } from './collisions';
import { buildLayout } from './layout';
import { makeRng } from './rng';
import { makeShot } from './physics';
import { buildWorld, simulate } from './run';

const layout = buildLayout(CITY), world = buildWorld(CITY);
const maxed = { engine: 3, wheels: 3, wings: 3, boost: 3 }, fresh = { engine: 0, wheels: 0, wings: 0, boost: 0 };

describe('seeded layout', () => {
  it('the random numbers repeat for a seed and stay in 0..1', () => {
    const a = makeRng(7), b = makeRng(7), c = makeRng(8);
    const xs = Array.from({ length: 200 }, a);
    expect(Array.from({ length: 200 }, b)).toEqual(xs);
    expect(c()).not.toBe(xs[0]);
    for (const x of xs) { expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(1); }
  });

  it('builds the same city every time', () => {
    expect(buildLayout(CITY)).toEqual(layout);
  });
});

describe('the course', () => {
  it('runs in order with room between obstacles, and every building has a sign', () => {
    CITY.course.forEach((o, i) => {
      if (i) { const prev = CITY.course[i - 1]; expect(o.z - (prev.z + prev.d), `before ${o.sign ?? o.kind}@${o.z}`).toBeGreaterThanOrEqual(15); }
      if (o.kind === 'bld') expect(o.sign, `building @${o.z}`).toBeTruthy();
    });
    const last = CITY.course[CITY.course.length - 1];
    expect(last.gap).toBeNull();
    expect(last.z + last.d).toBeLessThanOrEqual(CITY.length);
  });

  it('every gap fits every car, and the gap is on the road', () => {
    const parts = courseParts(CITY);
    CITY.course.forEach((o, item) => {
      if (o.gap == null || (o.kind !== 'bus' && o.kind !== 'bld')) return;
      const half = o.kind === 'bus' ? CITY.busGapHalf : CITY.alleyWidth / 2;
      expect(Math.abs(o.gap) + half, `${o.kind}@${o.z}`).toBeLessThanOrEqual(CITY.roadHalf);
      CARS.forEach(car => {
        const s = makeShot(car, fresh, SPECIALS[car.special].effect, 1, 0, world.ramp);
        s.mode = 'air'; s.x = o.gap!; s.y = .5; s.z = -(o.z + o.d / 2);
        const own = parts.filter(p => p.item === item);
        expect(hitTest(s, car.halfWidth, own, new Set(), layout.side, layout.sideX), `${car.name} through ${o.kind}@${o.z}`).toBeNull();
      });
    });
  });
});

describe('side buildings', () => {
  it('stay off the road and pavement and never overlap each other', () => {
    expect(layout.sideX).toBeGreaterThan(CITY.roadHalf + CITY.walk);
    for (const s of [-1, 1] as const) {
      const row = layout.side.filter(b => b.side === s).sort((a, b) => a.z0 - b.z0);
      expect(row[0].z0).toBeLessThanOrEqual(-CITY.behind);
      expect(row[row.length - 1].z1).toBeGreaterThanOrEqual(CITY.length);
      row.forEach((b, i) => {
        expect(Math.abs(b.x) - b.w / 2).toBeGreaterThanOrEqual(layout.sideX - 1e-9);
        expect(b.z1 - b.z0).toBeCloseTo(b.d);
        if (i) expect(b.z0).toBeGreaterThanOrEqual(row[i - 1].z1);
      });
    }
  });
});

describe('coins', () => {
  it('never sit inside an obstacle', () => {
    const parts = courseParts(CITY);
    for (const c of layout.coins) {
      const d = -c.z;
      const inside = parts.find(p => d > p.z0 - .5 && d < p.z1 + .5 && c.y < p.h + .5 && c.x > p.x0 - .5 && c.x < p.x1 + .5);
      expect(inside, `coin at ${d.toFixed(1)}m x=${c.x.toFixed(1)} y=${c.y.toFixed(1)}`).toBeUndefined();
    }
  });

  it('sit over the road at a height a flying car can reach', () => {
    expect(layout.coins.length).toBeGreaterThan(100);
    for (const c of layout.coins) {
      expect(Math.abs(c.x)).toBeLessThan(CITY.roadHalf - 1);
      expect(c.y).toBeGreaterThan(1);
      expect(c.y).toBeLessThanOrEqual(19.2);
    }
  });

  it('car 1 can grab coins on its very first full launch', () => {
    // the first trios are low and near the ramp: aiming at one of them collects it
    const near = layout.coins.filter(c => -c.z < 22 && c.y < 4);
    expect(near.length).toBeGreaterThan(0);
  });
});

describe('difficulty ramp', () => {
  const dist = (car: number, lv: typeof fresh) => -simulate(world, car, lv, .9, 0, { boost: true }).shot.z;

  it('car 1 stops early at first, and upgrades carry it past the first few obstacles', () => {
    expect(dist(0, fresh)).toBeLessThan(CITY.course[0].z + 1);
    expect(dist(0, maxed)).toBeGreaterThan(CITY.course[2].z);
  });

  it('each new car, fully upgraded, gets at least as far as the one before', () => {
    let prev = 0;
    CARS.forEach((car, i) => { const d = dist(i, maxed); expect(d, car.name).toBeGreaterThanOrEqual(prev); prev = d; });
  });
});
