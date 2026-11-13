import { describe, expect, it } from 'vitest';
import { CARS } from '../content/cars';
import { MAX_LEVEL, UPGRADES } from '../content/upgrades';
import { playMixed, playThrough } from './balance';
import { buyUpgrade, canBuy, canUnlock, recordRun, unlockNext } from './economy';
import { freshSave } from './save';

describe('balance', () => {
  const pacing = playThrough();
  it('prints the pacing table', () => { console.table(pacing); });

  it('each car takes a handful of launches to max out, not dozens', () => {
    expect(pacing).toHaveLength(CARS.length);
    for (const p of pacing) expect(p.launches, p.car).toBeLessThanOrEqual(10);
    for (const p of pacing) expect(p.launches, p.car).toBeGreaterThanOrEqual(4);
  });

  it('upgrades make you go further', () => {
    for (const p of pacing) expect(p.lastDist, p.car).toBeGreaterThan(p.firstDist);
  });

  it('every launch is under about 15 seconds', () => {
    for (const p of pacing) expect(p.maxSeconds, p.car).toBeLessThanOrEqual(15);
  });
});

describe('balance with a real child playing (mixed pulls)', () => {
  const seeds = [1, 7, 42, 99, 2024];
  const runs = seeds.map(s => playMixed(s));
  it('prints the pacing table', () => { console.table(runs[1].pacing); });

  it('reaches every car and maxes the last one', () => {
    for (const { pacing, save } of runs) {
      expect(pacing).toHaveLength(CARS.length);
      expect(save.unlocked).toBe(CARS.length);
      for (const u of UPGRADES) expect(save.levels[CARS.length - 1][u.key]).toBe(MAX_LEVEL);
    }
  });

  it('first upgrade comes within 3 launches on every car', () => {
    for (const { pacing } of runs) for (const p of pacing) {
      expect(p.firstBuyAt, p.car).toBeGreaterThanOrEqual(1);
      expect(p.firstBuyAt, p.car).toBeLessThanOrEqual(3);
    }
  });

  it('no grind walls: a few minutes per car and never long without buying', () => {
    for (const { pacing } of runs) for (const p of pacing) {
      expect(p.launches, p.car).toBeLessThanOrEqual(16);
      expect(p.minutes, p.car).toBeLessThanOrEqual(5);
      expect(p.longestDry, p.car).toBeLessThanOrEqual(3);
    }
  });

  it('coins stay whole and never negative', () => {
    for (const { save } of runs) {
      expect(Number.isInteger(save.coins)).toBe(true);
      expect(save.coins).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('economy edge cases', () => {
  it('cannot buy past level 3', () => {
    const s = freshSave(); s.coins = 1e6;
    for (let i = 0; i < 5; i++) buyUpgrade(s, 0, 'wings');
    expect(s.levels[0].wings).toBe(MAX_LEVEL);
    expect(canBuy(s, 0, 'wings')).toBe(false);
    expect(s.coins).toBe(1e6 - CARS[0].upgradePrices.reduce((a, b) => a + b, 0));
  });

  it('cannot buy one coin short, and nothing changes', () => {
    const s = freshSave(); s.coins = CARS[0].upgradePrices[0] - 1;
    expect(canBuy(s, 0, 'engine')).toBe(false);
    expect(buyUpgrade(s, 0, 'engine')).toBe(false);
    expect(s).toEqual({ ...freshSave(), coins: CARS[0].upgradePrices[0] - 1 });
  });

  it('cannot buy for a locked or unknown car', () => {
    const s = freshSave(); s.coins = 1e6;
    expect(buyUpgrade(s, 1, 'engine')).toBe(false);
    expect(buyUpgrade(s, 99, 'engine')).toBe(false);
    expect(canBuy(s, 99, 'engine')).toBe(false);
    expect(s.coins).toBe(1e6);
  });

  it('11 of 12 upgrades is not enough to unlock', () => {
    const s = freshSave(); s.coins = 1e6;
    for (const u of UPGRADES) for (let l = 0; l < MAX_LEVEL; l++) buyUpgrade(s, 0, u.key);
    s.levels[0].boost = 2;
    expect(canUnlock(s, 0)).toBe(false);
    expect(unlockNext(s)).toBe(false);
  });

  it('unlocks the next car even when an older car is selected; the last car unlocks nothing', () => {
    const s = freshSave(); s.coins = 1e7;
    for (let c = 0; c < CARS.length; c++) {
      for (const u of UPGRADES) for (let l = 0; l < MAX_LEVEL; l++) expect(buyUpgrade(s, c, u.key)).toBe(true);
      s.car = 0;
      expect(unlockNext(s)).toBe(c < CARS.length - 1);
    }
    expect(s.unlocked).toBe(CARS.length);
    expect(canUnlock(s, CARS.length - 1)).toBe(false);
    expect(Number.isInteger(s.coins) && s.coins >= 0).toBe(true);
  });

  it('bad run numbers never make coins NaN or negative', () => {
    const s = freshSave();
    for (const [d, c] of [[NaN, 0], [Infinity, 1], [-50, -3], [10, NaN], [-Infinity, Infinity], [12.5, 1.5]]) {
      const r = recordRun(s, 0, d, c);
      expect(Number.isInteger(r.total), `${d},${c}`).toBe(true);
      expect(r.total).toBeGreaterThan(0);
    }
    expect(Number.isInteger(s.coins)).toBe(true);
    expect(s.best.every(Number.isFinite)).toBe(true);
  });
});
