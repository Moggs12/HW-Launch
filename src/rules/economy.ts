import { CARS } from '../content/cars';
import { MAX_LEVEL, REWARDS, UPGRADES, type UpgradeKey } from '../content/upgrades';
import type { SaveData } from './save';

/* Coins, upgrades and unlocking. All changes go through here. */

/* Price of the next level, or null when maxed. */
export function upgradeCost(carIdx: number, level: number): number | null {
  return level >= MAX_LEVEL ? null : CARS[carIdx].upgradePrices[level];
}

export function canBuy(save: SaveData, carIdx: number, key: UpgradeKey) {
  const cost = upgradeCost(carIdx, save.levels[carIdx][key]);
  return cost !== null && save.coins >= cost;
}

export function buyUpgrade(save: SaveData, carIdx: number, key: UpgradeKey): boolean {
  const cost = upgradeCost(carIdx, save.levels[carIdx][key]);
  if (cost === null || save.coins < cost) return false;
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

export function unlockNext(save: SaveData): boolean {
  if (!canUnlock(save, save.car)) return false;
  save.unlocked++;
  save.car = save.unlocked - 1;
  return true;
}

export interface RunResult { distance: number; distCoins: number; coinCoins: number; total: number; isBest: boolean }

export function runReward(distance: number, coinsGrabbed: number) {
  const distCoins = Math.round(distance * REWARDS.perMetre), coinCoins = coinsGrabbed * REWARDS.perCoin;
  return { distCoins, coinCoins, total: Math.max(REWARDS.minimum, distCoins + coinCoins) };
}

/* Bank a finished launch. */
export function recordRun(save: SaveData, carIdx: number, rawDistance: number, coinsGrabbed: number): RunResult {
  const distance = Math.max(0, Math.round(rawDistance));
  const r = runReward(distance, coinsGrabbed);
  save.coins += r.total;
  const isBest = distance > save.best[carIdx];
  if (isBest) save.best[carIdx] = distance;
  return { distance, ...r, isBest };
}
