import { describe, expect, it } from 'vitest';
import { CARS } from '../content/cars';
import { CITY } from '../content/level';
import { SPECIALS } from '../content/specials';
import { PHYSICS, launchSpeed, makeShot, stepShot, useSpecial, type Shot } from './physics';
import { AIM } from './aim';
import { rampGeo, rampPoint } from './ramp';
import { buildWorld, simulate, STEP } from './run';
import { freshLevels, type UpgradeLevels } from './save';

const ramp = rampGeo(CITY.ramp, PHYSICS.launchAngle);
const world = buildWorld(CITY);
const maxed = (): UpgradeLevels => ({ engine: 3, wheels: 3, wings: 3, boost: 3 });
const finite = (s: Shot) => [s.x, s.y, s.z, s.vx, s.vy, s.vz, s.heading, s.rampS, s.rampV].every(Number.isFinite);

/* Fly with no obstacles until stopped; checks invariants every step. */
function flyOpen(s: Shot, dt: number, boost = false, maxT = 60) {
  let peak = 0, d = 0;
  for (let t = 0; t < maxT && s.mode !== 'stop'; t += dt) {
    stepShot(s, dt, { boost });
    expect(finite(s)).toBe(true);
    expect(s.y).toBeGreaterThanOrEqual(0);
    if (s.mode !== 'ramp') {
      expect(-s.z).toBeGreaterThanOrEqual(d - 1e-9);   // never rolls backwards
      d = -s.z;
    }
    peak = Math.max(peak, s.y);
  }
  return { peak, d: -s.z, t: s.t };
}

describe('ramp geometry', () => {
  it('is continuous and ends at the lip at the launch angle', () => {
    expect(rampPoint(ramp, 0).z).toBeCloseTo(ramp.startZ);
    const end = rampPoint(ramp, ramp.length);
    expect(end.z).toBeCloseTo(0); expect(end.y).toBeCloseTo(CITY.ramp.height); expect(end.pitch).toBeCloseTo(PHYSICS.launchAngle);
    let prev = rampPoint(ramp, -2);
    for (let s = -2; s <= ramp.length; s += .05) {
      const p = rampPoint(ramp, s);
      expect(Math.hypot(p.z - prev.z, p.y - prev.y)).toBeLessThan(.051);
      expect(p.y).toBeGreaterThanOrEqual(prev.y - 1e-9);
      prev = p;
    }
  });
});

describe('flight physics', () => {
  it('leaves the lip at exactly launch speed and angle, at any frame rate', () => {
    for (const dt of [1 / 240, 1 / 120, 1 / 60, 1 / 20]) {
      const s = makeShot(CARS[2], freshLevels(), SPECIALS.chomp.effect, .7, .2, ramp, 1);
      while (s.mode === 'ramp') stepShot(s, dt, null);
      const sp = launchSpeed(CARS[2], freshLevels(), .7);
      expect(Math.hypot(s.vx, s.vy, s.vz)).toBeCloseTo(sp, 6);
      expect(Math.atan2(s.vy, Math.hypot(s.vx, s.vz))).toBeCloseTo(PHYSICS.launchAngle, 6);
      expect(s.y).toBeCloseTo(CITY.ramp.height); expect(s.z).toBe(0);
    }
  });

  it('the ramp run-up stays short: quick at full pull, never a long crawl at the smallest pull', () => {
    const upRamp = (power: number) => {
      const s = makeShot(CARS[0], freshLevels(), SPECIALS.swerve.effect, power, 0, ramp, power * AIM.pullBack);
      while (s.mode === 'ramp') stepShot(s, STEP, null);
      return s.t;
    };
    expect(upRamp(1)).toBeLessThan(1.5);
    expect(upRamp(AIM.minPower)).toBeLessThan(3.5);
  });

  it('a whole weakest launch (smallest pull, first car) is still well under 15 s', () => {
    const run = simulate(world, 0, freshLevels(), AIM.minPower);
    expect(run.finished).toBe(true);
    expect(run.shot.t).toBeLessThan(15);
  });

  it('weakest launch still clears the ramp and rolls forward', () => {
    const s = makeShot(CARS[0], freshLevels(), SPECIALS.swerve.effect, 0, 0, ramp);
    const r = flyOpen(s, STEP);
    expect(r.d).toBeGreaterThan(5);
  });

  it('distance hardly depends on frame rate', () => {
    const go = (dt: number) => flyOpen(makeShot(CARS[1], maxed(), SPECIALS.flameBoost.effect, 1, 0, ramp), dt, true).d;
    const ref = go(1 / 240);
    for (const dt of [1 / 120, 1 / 60, 1 / 30]) expect(Math.abs(go(dt) - ref) / ref).toBeLessThan(.05);
  });

  it('ignores zero, negative and NaN dt, and caps a huge frame hitch', () => {
    const s = makeShot(CARS[0], freshLevels(), SPECIALS.swerve.effect, 1, 0, ramp);
    for (const dt of [0, -1, NaN]) { stepShot(s, dt, null); expect(finite(s)).toBe(true); }
    expect(s.t).toBe(0);
    while (s.mode === 'ramp') stepShot(s, STEP, null);
    const z = s.z;
    stepShot(s, 5, null);
    expect(finite(s)).toBe(true); expect(s.y).toBeGreaterThanOrEqual(0);
    expect(z - s.z).toBeLessThan(launchSpeed(CARS[0], freshLevels(), 1) * .11);
  });

  it('tiny dt behaves the same as normal dt', () => {
    const a = flyOpen(makeShot(CARS[0], freshLevels(), SPECIALS.swerve.effect, .5, 0, ramp), 1 / 2000).d;
    const b = flyOpen(makeShot(CARS[0], freshLevels(), SPECIALS.swerve.effect, .5, 0, ramp), STEP).d;
    expect(Math.abs(a - b) / b).toBeLessThan(.03);
  });

  it('bad power/heading inputs never make NaN', () => {
    for (const [p, h, pb] of [[NaN, 0, 0], [-1, 0, 0], [5, 0, 0], [1, NaN, NaN]]) {
      const s = makeShot(CARS[0], freshLevels(), SPECIALS.swerve.effect, p, h, ramp, pb);
      flyOpen(s, STEP);
      expect(finite(s)).toBe(true);
    }
  });

  it('each upgrade helps: engine speed, wings glide, wheels roll, boost push', () => {
    const d = (lv: Partial<UpgradeLevels>, boost = false) =>
      flyOpen(makeShot(CARS[0], { ...freshLevels(), ...lv }, SPECIALS.swerve.effect, 1, 0, ramp), STEP, boost).d;
    const base = d({});
    expect(d({ engine: 3 })).toBeGreaterThan(base);
    expect(d({ wings: 3 })).toBeGreaterThan(base);
    expect(d({ wheels: 3 })).toBeGreaterThan(base);
    expect(d({ boost: 3 }, true)).toBeGreaterThan(base);
  });

  it('boost fuel runs out and never goes negative', () => {
    const s = makeShot(CARS[0], { ...freshLevels(), boost: 3 }, SPECIALS.swerve.effect, 1, 0, ramp);
    flyOpen(s, STEP, true);
    expect(s.fuel).toBe(0);
  });

  it('flame boost while rolling pushes forward without a fake landing thud', () => {
    const s = makeShot(CARS[1], freshLevels(), SPECIALS.flameBoost.effect, .3, 0, ramp);
    while (s.mode !== 'roll') stepShot(s, STEP, null);
    s.events.length = 0;
    const v0 = Math.hypot(s.vx, s.vz);
    expect(useSpecial(s, CITY.course)).toBe(true);
    for (let i = 0; i < 30; i++) stepShot(s, STEP, null);
    expect(s.events).not.toContain('land');
    expect(Math.hypot(s.vx, s.vz)).toBeGreaterThan(v0);
  });

  it('a stalled roll with flames goes forward, never backwards', () => {
    const s = makeShot(CARS[1], freshLevels(), SPECIALS.flameBoost.effect, 1, 0, ramp);
    while (s.mode === 'ramp') stepShot(s, STEP, null);
    s.mode = 'roll'; s.y = 0; s.vx = s.vy = s.vz = 0; s.burn = 1;
    const z = s.z;
    for (let i = 0; i < 10; i++) stepShot(s, .05, null);
    expect(s.z).toBeLessThanOrEqual(z);
  });

  it('every car, maxed, on the real street, finishes under 15 s from release', () => {
    for (let i = 0; i < CARS.length; i++) for (const sp of [undefined, 0, .5, 1.5]) {
      const run = simulate(world, i, maxed(), 1, 0, { boost: true, specialAt: sp });
      expect(run.finished, CARS[i].name).toBe(true);
      expect(run.shot.t, CARS[i].name).toBeLessThan(15);
      expect(finite(run.shot)).toBe(true);
    }
  });
});
