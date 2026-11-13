import { describe, expect, it } from 'vitest';
import { CARS } from '../content/cars';
import { CITY } from '../content/level';
import { SPECIALS } from '../content/specials';
import { courseParts, hitTest, REACH, zapTarget, type Part } from './collisions';
import { buildLayout } from './layout';
import { crashAt, makeShot, stepShot, type Shot } from './physics';
import { rampGeo } from './ramp';
import { PHYSICS } from './physics';
import { buildWorld, Run, STEP } from './run';
import { freshLevels } from './save';

const parts = courseParts(CITY);
const layout = buildLayout(CITY);
const ramp = rampGeo(CITY.ramp, PHYSICS.launchAngle);
const none = new Set<number>();
const maxed = { engine: 3, wheels: 3, wings: 3, boost: 3 };

/* A shot in the air (or rolling) at distance d, sideways x, height y. */
function shotAt(d: number, x = 0, y = 0, mode: Shot['mode'] = 'air'): Shot {
  const s = makeShot(CARS[0], freshLevels(), SPECIALS.swerve.effect, 1, 0, ramp);
  s.mode = mode; s.x = x; s.y = y; s.z = -d;
  return s;
}
const hit = (s: Shot, car = 0, broken: ReadonlySet<number> = none) =>
  hitTest(s, CARS[car].halfWidth, parts, broken, layout.side, layout.sideX);

/* Sweep a car straight through an obstacle's depth at height y and report the first hit. */
function sweep(item: number, x: number, car: number, y = 0, step = .1) {
  const o = CITY.course[item];
  for (let d = o.z - 6; d < o.z + o.d + 6; d += step) {
    const h = hit(shotAt(d, x, y), car);
    if (h) return h;
  }
  return null;
}
const gapped = CITY.course.map((o, i) => ({ o, i })).filter(({ o }) => o.gap != null);

describe('course pieces', () => {
  it('cones and parked cars fill the road', () => {
    for (const p of parts.filter(p => p.kind === 'cones' || p.kind === 'cars')) {
      expect(p.x0).toBe(-CITY.roadHalf); expect(p.x1).toBe(CITY.roadHalf);
    }
  });

  it('buses and buildings reach the side buildings, so nothing slips round the end', () => {
    CITY.course.forEach((o, i) => {
      if (o.kind !== 'bus' && o.kind !== 'bld') return;
      const mine = parts.filter(q => q.item === i);
      // the side-building check takes over at sideX - (halfWidth + .35); the widest car is ~1.4 of that
      expect(Math.min(...mine.map(q => q.x0))).toBeLessThanOrEqual(-(layout.sideX - 1.5));
      expect(Math.max(...mine.map(q => q.x1))).toBeGreaterThanOrEqual(layout.sideX - 1.5);
    });
  });

  it('every gap is centred on its gap x', () => {
    for (const { o, i } of gapped) {
      const [a, b] = parts.filter(p => p.item === i);
      expect((a.x1 + b.x0) / 2).toBeCloseTo(o.gap!);
    }
  });
});

describe('hitting vs flying over', () => {
  it('hits the cones on the ground and stops at their front face', () => {
    const h = hit(shotAt(24, 0, 0));
    expect(h).toEqual({ type: 'crash', d: 24, what: 'cones' });
  });

  it('flies over anything it is higher than', () => {
    CITY.course.forEach((o, i) => expect(sweep(i, 0, 0, o.h + .01), `${o.kind} ${i}`).toBeNull());
  });

  it('just under the top still hits', () => {
    CITY.course.forEach((o, i) => expect(sweep(i, 0, 0, o.h - .05)?.type, `${o.kind} ${i}`).toBe('crash'));
  });

  it('the nose touches first: a hit starts REACH before the face', () => {
    expect(hit(shotAt(24 - REACH + .05))).not.toBeNull();
    expect(hit(shotAt(24 - REACH - .05))).toBeNull();
  });

  it('only the tail over the back edge does not count (no yank back to the front face)', () => {
    const o = CITY.course[3];   // PIZZA, a 10 m deep building
    expect(hit(shotAt(o.z + o.d + .5, 0, 1))).toBeNull();
    expect(hit(shotAt(o.z + o.d - .5, 0, 1))?.type).toBe('crash');
  });

  it('broken pieces are ignored, smash breaks one item then is used up', () => {
    expect(hit(shotAt(24), 0, new Set([0]))).toBeNull();
    const s = shotAt(112.5, 5);
    s.smash = true;
    expect(hit(s)).toEqual({ type: 'smash', item: 3 });
    expect(s.smash).toBe(false);
    expect(hit(s, 0, new Set([3]))).toBeNull();
  });

  it('smash only bites buildings: cones, cars and buses crash as normal and it stays armed', () => {
    for (const [d, x] of [[24.5, 0], [48.5, 0], [78.5, 5]]) {
      const s = shotAt(d, x);
      s.smash = true;
      expect(hit(s)?.type, `at ${d}`).toBe('crash');
      expect(s.smash).toBe(true);
    }
  });
});

describe('gaps are fair', () => {
  it('every car passes every gap when centred on it', () => {
    CARS.forEach((_, c) => gapped.forEach(({ o, i }) => expect(sweep(i, o.gap!, c), `car ${c} item ${i}`).toBeNull()));
  });

  it('every car has some room to spare in every gap (not pixel-perfect)', () => {
    CARS.forEach((car, c) => gapped.forEach(({ o, i }) => {
      const room = o.kind === 'bus' ? .25 : .5;   // metres off-centre either way that still gets through
      expect(sweep(i, o.gap! - room, c), `${car.name} item ${i} left`).toBeNull();
      expect(sweep(i, o.gap! + room, c), `${car.name} item ${i} right`).toBeNull();
    }));
  });

  it('missing the gap by a car width still crashes', () => {
    CARS.forEach((car, c) => gapped.forEach(({ o, i }) => {
      const miss = (o.kind === 'bus' ? CITY.busGapHalf : CITY.alleyWidth / 2) + car.halfWidth;
      expect(sweep(i, o.gap! + miss, c)?.type).toBe('crash');
      expect(sweep(i, o.gap! - miss, c)?.type).toBe('crash');
    }));
  });
});

describe('road edges', () => {
  it('cones at the kerb still stop you', () => {
    for (const x of [-CITY.roadHalf + .1, CITY.roadHalf - .1]) expect(hit(shotAt(24, x))?.type).toBe('crash');
  });

  it('scraping the side buildings stops the car where it is', () => {
    const d = 60, x = layout.sideX - CARS[0].halfWidth;
    const s = shotAt(d, x, 0);
    const h = hit(s);
    expect(h).toMatchObject({ type: 'crash', what: 'side' });
    crashAt(s, (h as { d: number }).d);
    expect(-s.z).toBeCloseTo(d);
    expect(hit(shotAt(d, -x, 0))).toMatchObject({ what: 'side' });
  });

  it('down the middle there is no side crash', () => {
    for (let d = 0; d < 20; d += .5) expect(hit(shotAt(d, 0, 0))).toBeNull();
  });
});

describe('no tunnelling', () => {
  it('even far faster than any car, one step never skips the thinnest piece', () => {
    const fast = 200 * STEP;   // 200 m/s; the fastest maxed car with every boost is ~120
    for (const p of parts) {
      const o = CITY.course[p.item], x = (Math.max(p.x0, -8) + Math.min(p.x1, 8)) / 2;
      for (let off = 0; off < fast; off += fast / 7) {
        let found = false;
        for (let d = p.z0 - 10 + off; d < p.z1 + 2 && !found; d += fast) found = !!hit(shotAt(d, x, 0));
        expect(found, `${o.kind} ${p.item} off ${off}`).toBe(true);
      }
    }
  });

  it('a real launch never passes through a solid piece below its top', () => {
    const world = buildWorld(CITY), bad: string[] = [];
    CARS.forEach((car, c) => {
      for (const heading of [-.3, -.1, 0, .1, .3]) for (const boost of [false, true]) {
        const run = new Run(world, c, maxed, 1, heading);
        let prevD = 0;
        for (let i = 0; i < 30 / STEP && !run.finished; i++) {
          run.step({ boost: boost && run.shot.mode === 'air' });
          const s = run.shot, d = -s.z;
          if (s.mode !== 'ramp' && !run.crashed) {
            for (const p of parts) {
              if (run.broken.has(p.item)) continue;
              const crossed = prevD < p.z0 && d >= p.z0, inside = s.x - car.halfWidth * .5 > p.x0 && s.x + car.halfWidth * .5 < p.x1;
              if (crossed && inside && s.y < p.h) bad.push(`${car.name} h${heading} b${boost} through ${p.kind} ${p.item}`);
            }
          }
          if (s.mode !== 'ramp') prevD = d;
        }
        if (!run.finished) bad.push(`${car.name} h${heading} b${boost} never stopped`);
      }
    });
    expect(bad).toEqual([]);
  });
});

describe('rolling', () => {
  it('rolling along the ground always ends at the next obstacle, not past it', () => {
    for (const p of parts.filter(p => p.x0 <= 0 && p.x1 >= 0)) {
      const s = shotAt(p.z0 - 8, 0, 0, 'roll');
      s.vx = 0; s.vz = -60; s.vy = 0;
      let crashed = false;
      for (let i = 0; i < 2000 && s.mode !== 'stop'; i++) {
        stepShot(s, STEP, null);
        if (s.mode === 'roll') {
          const h = hit(s);
          if (h?.type === 'crash') { crashAt(s, h.d); crashed = true; }
        }
      }
      expect(crashed, `item ${p.item}`).toBe(true);
      expect(-s.z).toBeLessThanOrEqual(p.z0);
    }
  });
});

describe('lightning target', () => {
  it('picks the nearest unbroken building ahead', () => {
    expect(zapTarget(shotAt(10), parts, none)?.item).toBe(3);                  // PIZZA, not the cones, cars or bus
    expect(zapTarget(shotAt(10), parts, new Set([3]))?.item).toBe(5);
    expect(zapTarget(shotAt(111), parts, none)?.item).toBe(5);   // too close to PIZZA to zap it
    expect(zapTarget(shotAt(1000), parts, none)).toBeNull();
  });

  it('only ever picks a real piece', () => {
    const p = zapTarget(shotAt(70), parts, none) as Part;
    expect(parts).toContain(p);
  });
});
