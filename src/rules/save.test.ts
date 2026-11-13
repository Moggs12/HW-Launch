import { describe, expect, it } from 'vitest';
import { CARS } from '../content/cars';
import { MAX_LEVEL } from '../content/upgrades';
import { buyUpgrade, recordRun, unlockNext } from './economy';
import { BACKUP_KEY, freshLevels, freshSave, LEGACY_KEY, loadSave, migrate, SAVE_KEY, SAVE_VERSION, writeSave, type Storage } from './save';

const memStore = (init: Record<string, string> = {}): Storage & { data: Record<string, string>; writes: number } => {
  const data = { ...init };
  const s = { data, writes: 0, get: (k: string) => data[k] ?? null, set: (k: string, v: string) => { s.writes++; data[k] = v; } };
  return s;
};
const throwingStore = (): Storage => ({
  get() { throw new Error('SecurityError'); },
  set() { throw new Error('QuotaExceededError'); },
});
const readOnlyStore = (init: Record<string, string>): Storage => ({
  get: k => init[k] ?? null,
  set() { throw new Error('QuotaExceededError'); },
});
const maxed = () => ({ engine: MAX_LEVEL, wheels: MAX_LEVEL, wings: MAX_LEVEL, boost: MAX_LEVEL });
const v1 = (over: Record<string, unknown> = {}) => JSON.stringify({ ...freshSave(), ...over });

describe('save round trip', () => {
  it('writes and reads back the same progress', () => {
    const store = memStore();
    const s = freshSave();
    s.coins = 4321; s.unlocked = 3; s.car = 2;
    s.levels[0] = maxed(); s.levels[1] = maxed(); s.levels[2] = { engine: 1, wheels: 2, wings: 0, boost: 3 };
    s.best = CARS.map((_, i) => (i < 3 ? i * 50 + 10 : 0));
    expect(writeSave(store, s)).toBe(true);
    expect(loadSave(store)).toEqual(s);
  });

  it('persists best distance and unlocks through real game actions', () => {
    const store = memStore();
    const s = loadSave(store);
    s.coins = 1e6;
    for (const k of ['engine', 'wheels', 'wings', 'boost'] as const) for (let i = 0; i < MAX_LEVEL; i++) buyUpgrade(s, 0, k);
    expect(unlockNext(s)).toBe(true);
    recordRun(s, 1, 123.4, 2);
    writeSave(store, s);
    const back = loadSave(store);
    expect(back.unlocked).toBe(2);
    expect(back.car).toBe(1);
    expect(back.best[1]).toBe(123);
    expect(back.coins).toBe(s.coins);
  });

  it('always writes the current version number', () => {
    const store = memStore();
    writeSave(store, freshSave());
    expect(JSON.parse(store.data[SAVE_KEY]).version).toBe(SAVE_VERSION);
  });

  it('loading does not write when a current save exists', () => {
    const store = memStore({ [SAVE_KEY]: v1({ coins: 5 }) });
    loadSave(store);
    expect(store.writes).toBe(0);
  });
});

describe('migration', () => {
  it('migrates the prototype save and writes it in the new format', () => {
    const old = { coins: 900, unlocked: 2, car: 1, lv: [maxed(), { engine: 1, wheels: 0, wings: 0, boost: 0 }], best: [210, 95] };
    const store = memStore({ [LEGACY_KEY]: JSON.stringify(old) });
    const s = loadSave(store);
    expect(s.coins).toBe(900);
    expect(s.unlocked).toBe(2);
    expect(s.levels[0]).toEqual(maxed());
    expect(s.best.slice(0, 2)).toEqual([210, 95]);
    expect(s.levels).toHaveLength(CARS.length);
    expect(JSON.parse(store.data[SAVE_KEY]).coins).toBe(900);
    expect(store.data[LEGACY_KEY]).toBe(JSON.stringify(old));   // original left in place
  });

  it('prefers the current save over the prototype one', () => {
    const store = memStore({ [SAVE_KEY]: v1({ coins: 77 }), [LEGACY_KEY]: JSON.stringify({ coins: 5 }) });
    expect(loadSave(store).coins).toBe(77);
  });

  it('falls back to the prototype save when the current one is corrupt', () => {
    const store = memStore({ [SAVE_KEY]: '{"coins": 12', [LEGACY_KEY]: JSON.stringify({ coins: 300, unlocked: 1, car: 0, lv: [], best: [] }) });
    expect(loadSave(store).coins).toBe(300);
  });

  it('falls back to the prototype save when the current one is a bare value', () => {
    for (const junk of ['5', '"hi"', 'true', '[]', '[1,2]', 'null']) {
      const store = memStore({ [SAVE_KEY]: junk, [LEGACY_KEY]: JSON.stringify({ coins: 300 }) });
      expect(loadSave(store).coins).toBe(300);
    }
  });

  it('reads a versionless save that already uses the new field names', () => {
    const s = migrate({ coins: 10, unlocked: 2, car: 1, levels: [maxed(), freshLevels()], best: [5, 6] });
    expect(s.levels[0]).toEqual(maxed());
    expect(s.best[1]).toBe(6);
  });

  it('keeps what it understands from a newer version and backs the original up', () => {
    const future = JSON.stringify({ version: 7, coins: 555, unlocked: 3, car: 2, levels: [maxed(), maxed()], best: [1, 2, 3], hats: ['red'] });
    const store = memStore({ [SAVE_KEY]: future });
    const s = loadSave(store);
    expect(s.version).toBe(1);
    expect(s.coins).toBe(555);
    expect(s.unlocked).toBe(3);
    expect(s.car).toBe(2);
    expect(store.data[BACKUP_KEY]).toBe(future);
    writeSave(store, s);
    expect(store.data[BACKUP_KEY]).toBe(future);
  });

  it('fills in cars added since the save was written', () => {
    const s = migrate({ version: 1, coins: 0, unlocked: 1, car: 0, levels: [maxed()], best: [40] });
    expect(s.levels).toHaveLength(CARS.length);
    expect(s.best).toHaveLength(CARS.length);
    expect(s.levels[CARS.length - 1]).toEqual(freshLevels());
  });

  it('drops entries for cars and upgrades this build does not know', () => {
    const s = migrate({ version: 1, levels: [{ engine: 2, turbo: 3, __proto__x: 1 }, ...Array(CARS.length + 3).fill(maxed())], best: Array(CARS.length + 3).fill(9) });
    expect(Object.keys(s.levels[0]).sort()).toEqual(['boost', 'engine', 'wheels', 'wings']);
    expect(s.levels[0].engine).toBe(2);
    expect(s.levels).toHaveLength(CARS.length);
    expect(s.best).toHaveLength(CARS.length);
  });
});

describe('bad data never crashes or loses more than it must', () => {
  it('corrupt JSON gives a fresh save and is backed up', () => {
    const store = memStore({ [SAVE_KEY]: 'not json' });
    expect(loadSave(store)).toEqual(freshSave());
    expect(store.data[BACKUP_KEY]).toBe('not json');
  });

  it('does not overwrite an existing backup', () => {
    const store = memStore({ [SAVE_KEY]: 'junk 2', [BACKUP_KEY]: 'junk 1' });
    loadSave(store);
    expect(store.data[BACKUP_KEY]).toBe('junk 1');
  });

  it('handles every kind of non-object', () => {
    for (const raw of [null, undefined, 0, 42, 'save', true, [], [1, 2, 3], NaN]) expect(migrate(raw)).toEqual(freshSave());
  });

  it('fills missing fields with defaults', () => {
    expect(migrate({ version: 1 })).toEqual(freshSave());
    const s = migrate({ version: 1, coins: 50 });
    expect(s.coins).toBe(50);
    expect(s.levels).toHaveLength(CARS.length);
  });

  it('clamps negative, NaN, infinite and fractional numbers', () => {
    expect(migrate({ version: 1, coins: -5 }).coins).toBe(0);
    expect(migrate({ version: 1, coins: NaN }).coins).toBe(0);
    expect(migrate({ version: 1, coins: Infinity }).coins).toBe(0);
    expect(migrate({ version: 1, coins: 12.9 }).coins).toBe(12);
    expect(migrate(JSON.parse('{"version":1,"coins":null}')).coins).toBe(0);
    expect(migrate({ version: 1, coins: 1e300 }).coins).toBe(Number.MAX_SAFE_INTEGER);
    expect(migrate({ version: 1, best: [-10, NaN, 1e9] }).best.slice(0, 3)).toEqual([0, 0, 1e6]);
  });

  it('accepts numbers stored as strings, rejects other wrong types', () => {
    const s = migrate({ version: 1, coins: '250', unlocked: '2', levels: [{ engine: '2', wheels: {}, wings: [], boost: true }] });
    expect(s.coins).toBe(250);
    expect(s.unlocked).toBe(2);
    expect(s.levels[0]).toEqual({ engine: 2, wheels: 0, wings: 0, boost: 0 });
    expect(migrate({ version: 1, coins: 'lots' }).coins).toBe(0);
    expect(migrate({ version: 1, coins: '' }).coins).toBe(0);
  });

  it('wrong-typed containers are ignored', () => {
    const s = migrate({ version: 1, coins: 9, levels: 'x', best: { 0: 100 } });
    expect(s.coins).toBe(9);
    expect(s.levels).toEqual(freshSave().levels);
    expect(s.best).toEqual(freshSave().best);
    expect(migrate({ version: 1, levels: [null, 5, 'a', [3]] }).levels[0]).toEqual(freshLevels());
  });

  it('clamps unlocked and selected car into range', () => {
    expect(migrate({ version: 1, unlocked: 0 }).unlocked).toBe(1);
    expect(migrate({ version: 1, unlocked: 99 }).unlocked).toBe(CARS.length);
    expect(migrate({ version: 1, unlocked: 2, car: 5 }).car).toBe(1);
    expect(migrate({ version: 1, unlocked: 2, car: -3 }).car).toBe(0);
  });

  it('a car that has been played counts as unlocked even if the count is lost', () => {
    const s = migrate({ version: 1, levels: [maxed(), maxed(), { engine: 1 }], best: [10, 20, 30] });
    expect(s.unlocked).toBe(3);
    expect(migrate({ version: 1, unlocked: 1, best: [0, 0, 0, 44] }).unlocked).toBe(4);
  });

  it('a strange version value is treated as a current save', () => {
    for (const version of ['1', null, 0, -1, 'banana']) expect(migrate({ version, coins: 8 }).coins).toBe(8);
  });
});

describe('storage that fails', () => {
  it('a store that throws on every call still loads and saves without crashing', () => {
    const store = throwingStore();
    expect(loadSave(store)).toEqual(freshSave());
    expect(writeSave(store, freshSave())).toBe(false);
  });

  it('a full store (quota) still loads the existing save', () => {
    const store = readOnlyStore({ [SAVE_KEY]: v1({ coins: 99 }) });
    expect(loadSave(store).coins).toBe(99);
    expect(writeSave(store, freshSave())).toBe(false);
  });

  it('a full store still migrates the prototype save into memory', () => {
    const store = readOnlyStore({ [LEGACY_KEY]: JSON.stringify({ coins: 40 }) });
    expect(loadSave(store).coins).toBe(40);
  });

  it('a store returning a non-string is treated as empty', () => {
    const store: Storage = { get: () => 42 as unknown as string, set() {} };
    expect(loadSave(store)).toEqual(freshSave());
  });
});
