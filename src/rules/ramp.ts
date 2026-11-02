import type { RampDef } from '../content/level';

/* The launch ramp: a flat run-up, then a curve that ends at the launch angle.
   It sits behind the start line: the lip is at z = 0, y = height, and the car starts at z = startZ.
   s is the distance travelled along the ramp surface from the catapult (negative = pulled back). */
export interface RampGeo {
  run: number; height: number; angle: number;
  radius: number;   // of the curve
  arcZ: number;     // z where the curve starts
  length: number;   // surface length from the catapult to the lip
  startZ: number;   // z of the catapult start line
}

export function rampGeo(def: RampDef, angle: number): RampGeo {
  const radius = def.height / (1 - Math.cos(angle));
  const arcZ = radius * Math.sin(angle);
  return { run: def.run, height: def.height, angle, radius, arcZ, length: def.run + radius * angle, startZ: arcZ + def.run };
}

export function rampPoint(g: RampGeo, s: number) {
  if (s <= g.run) return { z: g.startZ - s, y: 0, pitch: 0 };
  const a = Math.min(g.angle, (s - g.run) / g.radius);
  return { z: g.arcZ - g.radius * Math.sin(a), y: g.radius * (1 - Math.cos(a)), pitch: a };
}

/* Points along the top surface, for drawing. */
export function rampProfile(g: RampGeo, steps = 24) {
  const pts: { z: number; y: number }[] = [{ z: g.startZ, y: 0 }];
  for (let i = 0; i <= steps; i++) pts.push(rampPoint(g, g.run + (g.length - g.run) * i / steps));
  return pts;
}
