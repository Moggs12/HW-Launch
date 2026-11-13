import type { CourseItem, LevelDef, ObstacleKind } from '../content/level';
import type { SideBlock } from './layout';
import type { Shot } from './physics';
import { distanceOf } from './physics';

/* Solid pieces of the course. One course item can be several pieces (e.g. two buses with a gap). */
export interface Part {
  x0: number; x1: number;    // across the road
  z0: number; z1: number;    // distance range
  h: number;
  item: number;              // index into level.course
  kind: ObstacleKind;
}

export function courseParts(level: LevelDef): Part[] {
  const parts: Part[] = [], R = level.roadHalf;
  level.course.forEach((o: CourseItem, item) => {
    const add = (x0: number, x1: number) => parts.push({ x0, x1, z0: o.z, z1: o.z + o.d, h: o.h, item, kind: o.kind });
    if (o.kind === 'cones' || o.kind === 'cars') add(-R, R);
    else if (o.kind === 'bus') {
      const g = o.gap ?? 0, hg = level.busGapHalf;
      add(-R - 3, g - hg); add(g + hg, R + 3);
    } else {
      const span = R + level.walk + .4, hw = level.alleyWidth / 2;
      if (o.gap == null) add(-span, span);
      else { add(-span, o.gap - hw); add(o.gap + hw, span); }
    }
  });
  return parts;
}

export type Hit =
  | { type: 'crash'; d: number; what: ObstacleKind | 'side'; item?: number }
  | { type: 'smash'; item: number };

export const REACH = 1.9;  // how far in front of the car's centre counts as touching (its nose)
const TAIL_GRACE = .3;    // once the car's centre is this far past an obstacle, only its tail is over it: let it go
const SIDE_MARGIN = .35;  // side buildings: a little wider than the car, so it never scrapes through the wall
const PART_MARGIN = -.15; // course obstacles: a little narrower, so a gap needn't be hit pixel-perfect (age 4)

/* broken: course items already smashed this launch.
   Runs every fixed step (1/120 s); the hit window (REACH + depth + TAIL_GRACE >= 3.2 m) is far longer
   than the fastest car moves in one step (~1 m), so nothing can tunnel through a thin row of cones. */
export function hitTest(s: Shot, halfWidth: number, parts: readonly Part[], broken: ReadonlySet<number>,
                        side: readonly SideBlock[], sideX: number): Hit | null {
  const d = distanceOf(s), hw = halfWidth + SIDE_MARGIN, pw = halfWidth + PART_MARGIN;
  if (Math.abs(s.x) > sideX - hw) {
    const sx = Math.sign(s.x);
    // crash.d is where the car's nose stops; a side scrape stops the car where it is, not 1.9 m back
    for (const b of side) if (b.side === sx && d + 1.5 > b.z0 && d - 1.5 < b.z1 && s.y < b.h) return { type: 'crash', d: Math.max(0, d) + REACH, what: 'side' };
  }
  for (const p of parts) {
    if (broken.has(p.item)) continue;
    if (d + REACH > p.z0 && d < p.z1 + TAIL_GRACE && s.y < p.h && s.x + pw > p.x0 && s.x - pw < p.x1) {
      if (s.smash && p.kind === 'bld') { s.smash = false; return { type: 'smash', item: p.item }; }
      return { type: 'crash', d: p.z0, what: p.kind, item: p.item };
    }
  }
  return null;
}

/* Lightning: the nearest unbroken building ahead (cones, cars and buses are left alone). */
export function zapTarget(s: Shot, parts: readonly Part[], broken: ReadonlySet<number>): Part | null {
  const d = distanceOf(s);
  return parts.filter(p => p.kind === 'bld' && !broken.has(p.item) && p.z0 > d + 2).sort((a, b) => a.z0 - b.z0)[0] ?? null;
}
