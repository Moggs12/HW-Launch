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
  | { type: 'crash'; d: number; what: ObstacleKind | 'side' }
  | { type: 'smash'; item: number };

const REACH = 1.9;        // how far in front/behind the car's centre counts as touching
const SIDE_MARGIN = .35;

/* broken: course items already smashed this launch */
export function hitTest(s: Shot, halfWidth: number, parts: readonly Part[], broken: ReadonlySet<number>,
                        side: readonly SideBlock[], sideX: number): Hit | null {
  const d = distanceOf(s), hw = halfWidth + SIDE_MARGIN;
  if (Math.abs(s.x) > sideX - hw) {
    const sx = Math.sign(s.x);
    for (const b of side) if (b.side === sx && d + 1.5 > b.z0 && d - 1.5 < b.z1 && s.y < b.h) return { type: 'crash', d: Math.max(0, d), what: 'side' };
  }
  for (const p of parts) {
    if (broken.has(p.item)) continue;
    if (d + REACH > p.z0 && d - REACH < p.z1 && s.y < p.h && s.x + hw > p.x0 && s.x - hw < p.x1) {
      if (s.smash) { s.smash = false; return { type: 'smash', item: p.item }; }
      return { type: 'crash', d: p.z0, what: p.kind };
    }
  }
  return null;
}

/* Lightning: the nearest unbroken piece ahead. */
export function zapTarget(s: Shot, parts: readonly Part[], broken: ReadonlySet<number>): Part | null {
  const d = distanceOf(s);
  return parts.filter(p => !broken.has(p.item) && p.z0 > d + 2).sort((a, b) => a.z0 - b.z0)[0] ?? null;
}
