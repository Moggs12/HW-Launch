import { describe, expect, it } from 'vitest';
import { CARS } from '../content/cars';
import { CITY } from '../content/level';
import { SPECIALS } from '../content/specials';
import { AIM, canLaunch, predictArc, pullFromDrag } from './aim';
import { makeShot, stepShot } from './physics';
import { STEP, buildWorld } from './run';
import { freshLevels } from './save';

const world = buildWorld(CITY);

describe('pullFromDrag', () => {
  it('dragging up or not at all gives no power', () => {
    expect(pullFromDrag(0, 0, 400, 800).power).toBe(0);
    expect(pullFromDrag(0, -300, 400, 800).power).toBe(0);
  });
  it('a tiny pull does nothing, a real one launches', () => {
    expect(canLaunch(pullFromDrag(0, 800 * AIM.pullScreenShare * AIM.minPower * .9, 400, 800).power)).toBe(false);
    expect(canLaunch(pullFromDrag(0, 800 * AIM.pullScreenShare * AIM.minPower * 1.1, 400, 800).power)).toBe(true);
  });
  it('clamps power and aim both ways', () => {
    expect(pullFromDrag(-9999, 9999, 400, 800)).toEqual({ power: 1, heading: -AIM.maxHeading });
    expect(pullFromDrag(9999, 9999, 400, 800).heading).toBe(AIM.maxHeading);
  });
  it('a zero-sized screen or bad numbers never give NaN', () => {
    for (const p of [pullFromDrag(10, 10, 0, 0), pullFromDrag(NaN, NaN, 400, 800), pullFromDrag(5, 5, NaN, Infinity)]) {
      expect(Number.isFinite(p.power)).toBe(true);
      expect(Number.isFinite(p.heading)).toBe(true);
    }
    expect(canLaunch(NaN)).toBe(false);
  });
});

describe('predictArc', () => {
  it('dots sit exactly on the real (unobstructed) flight path', () => {
    const car = CARS[0], lv = freshLevels(), effect = SPECIALS[car.special].effect;
    for (const [power, heading] of [[.5, 0], [1, .2], [.2, -.3]]) {
      const pull = power * AIM.pullBack;
      const dots = predictArc(makeShot(car, lv, effect, power, heading, world.ramp, pull), STEP, 10, 36);
      expect(dots.length).toBeGreaterThan(3);
      const real = makeShot(car, lv, effect, power, heading, world.ramp, pull);
      const path: { x: number; y: number; z: number }[] = [];
      for (let i = 0; i < 12 / STEP && real.mode !== 'stop'; i++) {
        stepShot(real, STEP, null);
        if (real.mode === 'air') path.push({ x: real.x, y: real.y, z: real.z });
      }
      for (const d of dots) {
        const near = Math.min(...path.map(p => Math.hypot(p.x - d.x, p.y - d.y, p.z - d.z)));
        expect(near).toBeLessThan(1e-9);
      }
    }
  });
});
