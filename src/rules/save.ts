import { CARS } from '../content/cars';
import { MAX_LEVEL, UPGRADES, type UpgradeKey } from '../content/upgrades';

/* Saved progress. Every save carries a version; older saves are migrated, never wiped. */
export type UpgradeLevels = Record<UpgradeKey, number>;

export interface SaveData {
  version: 1;
  coins: number;
  unlocked: number;          // how many cars are unlocked (1..CARS.length)
  car: number;               // selected car
  levels: UpgradeLevels[];   // per car
  best: number[];            // best distance per car
}

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'launch-garage-save';
export const LEGACY_KEY = 'launch-garage-v2';   // the prototype's save, no version number

export interface Storage { get(key: string): string | null; set(key: string, value: string): void }

export const freshLevels = (): UpgradeLevels => ({ engine: 0, wheels: 0, wings: 0, boost: 0 });

export function freshSave(): SaveData {
  return { version: 1, coins: 0, unlocked: 1, car: 0, levels: CARS.map(freshLevels), best: CARS.map(() => 0) };
}

const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : fallback;

/* Tidy any save shape into the current one. Fills in cars added since it was written. */
function normalise(raw: { coins?: unknown; unlocked?: unknown; car?: unknown; levels?: unknown; best?: unknown }): SaveData {
  const s = freshSave();
  s.coins = num(raw.coins, 0, Number.MAX_SAFE_INTEGER, 0);
  s.unlocked = num(raw.unlocked, 1, CARS.length, 1);
  const lv = Array.isArray(raw.levels) ? raw.levels : [];
  const best = Array.isArray(raw.best) ? raw.best : [];
  s.levels = CARS.map((_, i) => {
    const l = freshLevels(), r = lv[i] as Partial<Record<UpgradeKey, unknown>> | undefined;
    if (r && typeof r === 'object') for (const u of UPGRADES) l[u.key] = num(r[u.key], 0, MAX_LEVEL, 0);
    return l;
  });
  s.best = CARS.map((_, i) => num(best[i], 0, 1e6, 0));
  s.car = num(raw.car, 0, s.unlocked - 1, 0);
  return s;
}

/* Turn whatever was stored into a current save. */
export function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') return freshSave();
  const r = raw as Record<string, unknown>;
  if (r.version === undefined) {
    // prototype save: {coins, unlocked, car, lv: [...], best: [...]}
    return normalise({ coins: r.coins, unlocked: r.unlocked, car: r.car, levels: r.lv, best: r.best });
  }
  if (r.version === 1) return normalise(r);
  // a save from a newer version than this build: keep what we understand
  return normalise(r);
}

function parse(text: string | null): unknown {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export function loadSave(store: Storage): SaveData {
  const current = parse(store.get(SAVE_KEY));
  if (current) return migrate(current);
  const legacy = parse(store.get(LEGACY_KEY));
  if (legacy) { const s = migrate(legacy); writeSave(store, s); return s; }
  return freshSave();
}

export function writeSave(store: Storage, save: SaveData) {
  store.set(SAVE_KEY, JSON.stringify(save));
}
