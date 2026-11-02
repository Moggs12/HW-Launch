import { describe, expect, it } from 'vitest';
import { playThrough } from './balance';

describe('balance', () => {
  const pacing = playThrough();
  it('prints the pacing table', () => { console.table(pacing); });

  it('each car takes a handful of launches to max out, not dozens', () => {
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
