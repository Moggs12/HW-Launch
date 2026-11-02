import { CARS } from '../content/cars';
import type { LevelDef } from '../content/level';
import { SPECIALS } from '../content/specials';
import { grabCoins } from './coins';
import { courseParts, hitTest, zapTarget, type Part } from './collisions';
import { buildLayout, type Layout } from './layout';
import { crashAt, makeShot, stepShot, useSpecial, type FlightInput, type Shot, type ShotEvent } from './physics';
import type { UpgradeLevels } from './save';

/* One launch from release to stop: physics + collisions + coins + specials.
   The 3D layer reads the shot and the events; it never decides anything itself. */

export interface World { level: LevelDef; layout: Layout; parts: Part[] }

export function buildWorld(level: LevelDef): World {
  return { level, layout: buildLayout(level), parts: courseParts(level) };
}

export type RunEvent =
  | { type: 'shot'; ev: ShotEvent }
  | { type: 'crash'; what: string }
  | { type: 'smash'; item: number; cause: 'smash' | 'zap' }
  | { type: 'zap'; part: Part }
  | { type: 'coin'; index: number };

export const STEP = 1 / 120;
const ZAP_DELAY = .12;

export class Run {
  readonly shot: Shot;
  readonly broken = new Set<number>();
  readonly taken: boolean[];
  coinsGrabbed = 0;
  crashed = false;
  events: RunEvent[] = [];
  private zap: { part: Part; at: number } | null = null;

  constructor(private world: World, readonly carIdx: number, lv: UpgradeLevels,
              power: number, heading: number, startX = 0, startZ = 0) {
    const car = CARS[carIdx];
    this.shot = makeShot(car, lv, SPECIALS[car.special].effect, power, heading);
    this.shot.x = startX; this.shot.z = startZ;
    this.taken = world.layout.coins.map(() => false);
  }

  get finished() { return this.shot.mode === 'stop'; }

  useSpecial() { return useSpecial(this.shot, this.world.level.course); }

  /* One fixed step of STEP seconds. */
  step(inp: FlightInput | null) {
    const s = this.shot, w = this.world;
    stepShot(s, STEP, inp);
    for (const ev of s.events.splice(0)) {
      this.events.push({ type: 'shot', ev });
      if (ev === 'zap') {
        const part = zapTarget(s, w.parts, this.broken);
        if (part) { this.zap = { part, at: s.t + ZAP_DELAY }; this.events.push({ type: 'zap', part }); }
      }
    }
    if (this.zap && s.t >= this.zap.at) {
      if (!this.broken.has(this.zap.part.item)) this.smash(this.zap.part.item, 'zap');
      this.zap = null;
    }
    if (s.mode !== 'crash' && s.mode !== 'stop' && !this.crashed) {
      const hit = hitTest(s, CARS[this.carIdx].halfWidth, w.parts, this.broken, w.layout.side, w.layout.sideX);
      if (hit?.type === 'smash') this.smash(hit.item, 'smash');
      else if (hit) { this.crashed = true; crashAt(s, hit.d); this.events.push({ type: 'crash', what: hit.what }); }
    }
    for (const index of grabCoins(s, w.layout.coins, this.taken)) { this.coinsGrabbed++; this.events.push({ type: 'coin', index }); }
  }

  private smash(item: number, cause: 'smash' | 'zap') {
    this.broken.add(item);
    this.events.push({ type: 'smash', item, cause });
  }

  takeEvents() { return this.events.splice(0); }
}

/* Run a launch to the end with no input (used by tests and tuning). */
export function simulate(world: World, carIdx: number, lv: UpgradeLevels, power: number, heading = 0,
                         opts: { boost?: boolean; specialAt?: number; maxSeconds?: number } = {}) {
  const run = new Run(world, carIdx, lv, power, heading);
  const max = (opts.maxSeconds ?? 60) / STEP;
  for (let i = 0; i < max && !run.finished; i++) {
    if (opts.specialAt !== undefined && Math.abs(run.shot.t - opts.specialAt) < STEP / 2) run.useSpecial();
    run.step({ boost: !!opts.boost });
  }
  return run;
}
