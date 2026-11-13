import { stepShot, type Shot } from './physics';

/* Turning a drag on the screen into a launch. */
export const AIM = {
  pullScreenShare: .32,   // drag this share of the screen height down for full power
  aimScreenShare: .45,    // drag this share of the width sideways for full aim
  maxHeading: .3,         // radians
  minPower: .12,          // a smaller pull than this does nothing
  pullBack: 1.6,          // metres the car slides back at full power
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const finite = (v: number) => (Number.isFinite(v) ? v : 0);

/* dx, dy: how far the finger has moved since it went down (down and right are positive).
   A zero-sized screen (mid-resize) or bad numbers give no pull rather than NaN. */
export function pullFromDrag(dx: number, dy: number, width: number, height: number) {
  const w = Math.max(1, finite(width)), h = Math.max(1, finite(height));
  const power = clamp(finite(dy) / (h * AIM.pullScreenShare), 0, 1);
  const heading = clamp(finite(dx) / (w * AIM.aimScreenShare) * AIM.maxHeading, -AIM.maxHeading, AIM.maxHeading);
  return { power, heading };
}

export const canLaunch = (power: number) => Number.isFinite(power) && power >= AIM.minPower;

/* The dotted arc: points along the flight (after the ramp, before the first landing stops it),
   stepped with exactly the same fixed step as the real launch so the dots sit on the real path.
   Ignores obstacles, coins, boost and specials. */
export function predictArc(shot: Shot, step: number, every: number, maxPoints: number, maxSeconds = 12) {
  const pts: { x: number; y: number; z: number }[] = [];
  let n = 0;
  for (let i = 0, max = maxSeconds / step; i < max && pts.length < maxPoints; i++) {
    stepShot(shot, step, null);
    if (shot.mode === 'ramp') continue;
    if (shot.mode !== 'air') break;
    if (n++ % every === 0) pts.push({ x: shot.x, y: shot.y, z: shot.z });
  }
  return pts;
}
