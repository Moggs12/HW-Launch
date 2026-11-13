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
/* Where a save we could not read (corrupt, or from a newer build) is parked before it is overwritten. */
export const BACKUP_KEY = 'launch-garage-save-backup';

export interface Storage { get(key: string): string | null; set(key: string, value: string): void }

export const freshLevels = (): UpgradeLevels => ({ engine: 0, wheels: 0, wings: 0, boost: 0 });

export function freshSave(): SaveData {
  return { version: 1, coins: 0, unlocked: 1, car: 0, levels: CARS.map(freshLevels), best: CARS.map(() => 0) };
}

/* A whole number in [lo, hi]. Numeric strings are accepted; anything else (NaN, null, objects) falls back. */
const num = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.floor(n))) : fallback;
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/* Tidy any save shape into the current one. Fills in cars added since it was written. */
function normalise(raw: { coins?: unknown; unlocked?: unknown; car?: unknown; levels?: unknown; best?: unknown }): SaveData {
  const s = freshSave();
  s.coins = num(raw.coins, 0, Number.MAX_SAFE_INTEGER, 0);
  const lv = Array.isArray(raw.levels) ? raw.levels : [];
  const best = Array.isArray(raw.best) ? raw.best : [];
  s.levels = CARS.map((_, i) => {
    const l = freshLevels(), r = lv[i];
    if (isObject(r)) for (const u of UPGRADES) l[u.key] = num(r[u.key], 0, MAX_LEVEL, 0);
    return l;
  });
  s.best = CARS.map((_, i) => num(best[i], 0, 1e6, 0));
  // A car with upgrades or a best distance was clearly unlocked, even if the count got lost.
  let played = 0;
  CARS.forEach((_, i) => { if (s.best[i] > 0 || UPGRADES.some(u => s.levels[i][u.key] > 0)) played = i + 1; });
  s.unlocked = Math.max(num(raw.unlocked, 1, CARS.length, 1), played);
  s.car = num(raw.car, 0, s.unlocked - 1, 0);
  return s;
}

/* Turn whatever was stored into a current save. */
export function migrate(raw: unknown): SaveData {
  if (!isObject(raw)) return freshSave();
  if (raw.version === undefined) {
    // prototype save: {coins, unlocked, car, lv: [...], best: [...]}
    return normalise({ coins: raw.coins, unlocked: raw.unlocked, car: raw.car, levels: raw.lv ?? raw.levels, best: raw.best });
  }
  // version 1, or a save from a newer build: keep everything we understand
  return normalise(raw);
}

/* The stored version number, when it is newer than this build understands. */
function futureVersion(raw: unknown): number | null {
  if (!isObject(raw)) return null;
  const v = Number(raw.version);
  return Number.isFinite(v) && v > SAVE_VERSION ? v : null;
}

function parse(text: string | null): unknown {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/* Storage that never throws: a broken store means "nothing saved", never a crash. */
function safeGet(store: Storage, key: string): string | null {
  try { const v = store.get(key); return typeof v === 'string' ? v : null; } catch { return null; }
}
function safeSet(store: Storage, key: string, value: string): boolean {
  try { store.set(key, value); return true; } catch { return false; }
}

export function loadSave(store: Storage): SaveData {
  const text = safeGet(store, SAVE_KEY);
  const current = parse(text);
  if (isObject(current)) {
    // Newer build's save: keep a copy before we write our own version over it.
    if (futureVersion(current) !== null && !safeGet(store, BACKUP_KEY)) safeSet(store, BACKUP_KEY, text!);
    return migrate(current);
  }
  // Something unreadable is stored: park it rather than silently overwrite it later.
  if (text && !safeGet(store, BACKUP_KEY)) safeSet(store, BACKUP_KEY, text);
  const legacy = parse(safeGet(store, LEGACY_KEY));
  if (isObject(legacy)) { const s = migrate(legacy); writeSave(store, s); return s; }
  return freshSave();
}

/* Save progress (called on events: a finished launch, a purchase, a car pick; never per frame).
   Returns false if the device would not store it; the game plays on from memory. */
export function writeSave(store: Storage, save: SaveData): boolean {
  return safeSet(store, SAVE_KEY, JSON.stringify({ ...save, version: SAVE_VERSION }));
}
