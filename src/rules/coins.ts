import type { CoinSpot } from './layout';

const GRAB_RADIUS_SQ = 3.2;
const CAR_CENTRE_Y = .8;

/* Mark coins the car is touching. Returns the indices newly grabbed. */
export function grabCoins(car: { x: number; y: number; z: number }, coins: readonly CoinSpot[], taken: boolean[]): number[] {
  const got: number[] = [], cy = car.y + CAR_CENTRE_Y;
  coins.forEach((c, i) => {
    if (taken[i]) return;
    const dx = c.x - car.x, dy = c.y - cy, dz = c.z - car.z;
    if (dx * dx + dy * dy + dz * dz < GRAB_RADIUS_SQ) { taken[i] = true; got.push(i); }
  });
  return got;
}
