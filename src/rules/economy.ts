import { CARS } from '../content/cars';
import { MAX_LEVEL, REWARDS, UPGRADES, type UpgradeKey } from '../content/upgrades';
import type { SaveData } from './save';

/* Coins, upgrades and unlocking. All changes go through here. */

/* Price of the next level, or null when maxed. */
export function upgradeCost(carIdx: number, level: number): number | null {
  const car = CARS[carIdx];
  if (!car || !(level >= 0) || level >= MAX_LEVEL) return null;
  return car.upgradePrices[Math.floor(level)] ?? null;
}

/* Only unlocked cars can be upgraded. */
function nextCost(save: SaveData, carIdx: number, key: UpgradeKey) {
  if (!(carIdx >= 0 && carIdx < save.unlocked) || !save.levels[carIdx]) return null;
  return upgradeCost(carIdx, save.levels[carIdx][key]);
}

export function canBuy(save: SaveData, carIdx: number, key: UpgradeKey) {
  const cost = nextCost(save, carIdx, key);
  return cost !== null && save.coins >= cost;
}

export function buyUpgrade(save: SaveData, carIdx: number, key: UpgradeKey): boolean {
  const cost = nextCost(save, carIdx, key);
  if (cost === null || !(save.coins >= cost)) return false;
  save.coins -= cost;
  save.levels[carIdx][key]++;
  return true;
}

export const upgradesDone = (save: SaveData, carIdx: number) =>
  UPGRADES.reduce((n, u) => n + save.levels[carIdx][u.key], 0);
export const upgradesTotal = UPGRADES.length * MAX_LEVEL;

export const anyAffordable = (save: SaveData, carIdx: number) => UPGRADES.some(u => canBuy(save, carIdx, u.key));

/* The newest car is fully upgraded and there's another to unlock. */
export function canUnlock(save: SaveData, carIdx: number) {
  return upgradesDone(save, carIdx) === upgradesTotal && save.unlocked < CARS.length && carIdx === save.unlocked - 1;
}

/* Works from the newest car, whichever car is selected. */
export function unlockNext(save: SaveData): boolean {
  if (!canUnlock(save, save.unlocked - 1)) return false;
  save.unlocked++;
  save.car = save.unlocked - 1;
  return true;
}

export interface RunResult { distance: number; distCoins: number; coinCoins: number; total: number; isBest: boolean }

/* Whole, non-negative and finite, whatever comes in. */
const whole = (n: number, max: number) => Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : 0;
const MAX_DISTANCE = 1e5, MAX_GRABBED = 1e4;

export function runReward(distance: number, coinsGrabbed: number) {
  const distCoins = Math.round(whole(distance, MAX_DISTANCE) * REWARDS.perMetre);
  const coinCoins = whole(coinsGrabbed, MAX_GRABBED) * REWARDS.perCoin;
  return { distCoins, coinCoins, total: Math.max(REWARDS.minimum, distCoins + coinCoins) };
}

/* Bank a finished launch. */
export function recordRun(save: SaveData, carIdx: number, rawDistance: number, coinsGrabbed: number): RunResult {
  const distance = whole(rawDistance, MAX_DISTANCE);
  const r = runReward(distance, coinsGrabbed);
  save.coins = (Number.isFinite(save.coins) ? Math.max(0, save.coins) : 0) + r.total;
  const isBest = distance > (save.best[carIdx] ?? 0);
  if (isBest && carIdx >= 0 && carIdx < save.best.length) save.best[carIdx] = distance;
  return { distance, ...r, isBest };
}
