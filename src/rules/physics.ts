import type { CarDef } from '../content/cars';
import type { CourseItem } from '../content/level';
import type { SpecialEffect } from '../content/specials';
import { rampPoint, type RampGeo } from './ramp';
import type { UpgradeLevels } from './save';

/* The flight of one launch. World axes: forward is -z, up is +y, ground is y = 0.
   No three.js here so it can be tested on its own. */

export const PHYSICS = {
  gravity: 24,
  launchAngle: 35 * Math.PI / 180,
  enginePerLevel: 6,          // extra launch speed per engine level
  minPowerFactor: .32,        // speed at the smallest launchable pull is this share of full
  boostFuelPerLevel: .32,     // seconds of BOOST per level
  boostPush: 14, boostLift: 7,
  burnPush: 16, burnLift: 8, burnRollPush: 20,
  wingGlidePerLevel: .16,     // gravity cut when falling, per wing level
  bounceMinSpeed: 5,
  bounceBase: .2, bouncePerWheel: .06,
  bounceKeepBase: .68, bounceKeepPerWheel: .05,
  rollFriction: 14, rollFrictionPerWheel: 2.2,
  stopSpeed: .25,
  swerveTurnRate: 1.6,
  rampStartShare: .5,         // the catapult flings the car up the ramp at this share of launch speed
};

export type ShotMode = 'ramp' | 'air' | 'roll' | 'crash' | 'stop';
export type ShotEvent = 'swerve' | 'burn' | 'armed' | 'zap' | 'takeoff' | 'bounce' | 'land' | 'stop';

export interface Shot {
  lv: UpgradeLevels;
  special: SpecialEffect;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  heading: number;            // radians, 0 = straight down the street, + = left
  mode: ShotMode;
  ramp: RampGeo;
  rampS: number;              // distance along the ramp surface
  rampV: number;              // speed along the ramp
  rampAccel: number;
  launchSpeed: number;
  pitch: number;              // nose-up angle while on the ramp
  impact: number;             // downward speed of the last bounce/landing
  fuel: number;               // BOOST seconds left
  burn: number;               // special flame seconds left
  smash: boolean;             // next obstacle hit breaks instead of stopping us
  swerve: { target: CourseItem; x: number } | null;
  specialUsed: boolean;
  boosting: boolean;
  t: number;
  events: ShotEvent[];
}

export interface FlightInput { boost: boolean }

export function launchSpeed(car: CarDef, lv: UpgradeLevels, power: number) {
  const P = PHYSICS;
  return (car.baseSpeed + P.enginePerLevel * lv.engine) * (P.minPowerFactor + (1 - P.minPowerFactor) * power);
}

/* A launch starts at the catapult (pulled back by pullBack metres) and runs up the ramp,
   speeding up until it leaves the lip at launch speed. */
export function makeShot(car: CarDef, lv: UpgradeLevels, special: SpecialEffect, power: number, heading: number,
                         ramp: RampGeo, pullBack = 0): Shot {
  const sp = launchSpeed(car, lv, power), v0 = sp * PHYSICS.rampStartShare;
  const s0 = -pullBack, p = rampPoint(ramp, s0);
  return {
    lv, special, x: Math.sin(heading) * pullBack, y: p.y, z: p.z,
    vx: 0, vy: 0, vz: -v0,
    heading, mode: 'ramp', ramp, rampS: s0, rampV: v0, rampAccel: (sp * sp - v0 * v0) / (2 * (ramp.length - s0)),
    launchSpeed: sp, pitch: 0, impact: 0,
    fuel: PHYSICS.boostFuelPerLevel * lv.boost, burn: 0, smash: false, swerve: null,
    specialUsed: false, boosting: false, t: 0, events: [],
  };
}

function stepRamp(s: Shot, dt: number) {
  const g = s.ramp;
  s.rampV = Math.min(s.launchSpeed, s.rampV + s.rampAccel * dt);
  s.rampS += s.rampV * dt;
  if (s.rampS >= g.length) {
    // take off from the lip, aimed where the player pulled
    const h = s.launchSpeed * Math.cos(g.angle);
    s.z = 0; s.y = g.height; s.pitch = g.angle;
    s.vx = -Math.sin(s.heading) * h; s.vz = -Math.cos(s.heading) * h; s.vy = s.launchSpeed * Math.sin(g.angle);
    s.mode = 'air';
    s.events.push('takeoff');
    return;
  }
  const p = rampPoint(g, s.rampS);
  s.z = p.z; s.y = p.y; s.pitch = p.pitch;
  s.vx = 0; s.vz = -s.rampV * Math.cos(p.pitch); s.vy = s.rampV * Math.sin(p.pitch);
}

export const distanceOf = (s: Shot) => -s.z;

export function nextBlocker(course: readonly CourseItem[], d: number) {
  return course.find(o => (o.kind === 'bld' || o.kind === 'bus') && o.z > d + 2);
}

/* Press the action button. Returns false if it can't be used now. */
export function useSpecial(s: Shot, course: readonly CourseItem[]): boolean {
  if (s.specialUsed || s.mode === 'ramp' || s.mode === 'stop' || s.mode === 'crash') return false;
  s.specialUsed = true;
  const e = s.special;
  if (e.kind === 'swerve') {
    const o = nextBlocker(course, distanceOf(s));
    s.swerve = o ? { target: o, x: o.gap ?? 0 } : null;
    s.events.push('swerve');
  } else if (e.kind === 'burn') {
    s.burn = e.seconds;
    if (s.mode === 'roll') s.mode = 'air';
    s.events.push('burn');
  } else if (e.kind === 'smash') {
    s.smash = true;
    s.events.push('armed');
  } else {
    s.events.push('zap');
  }
  return true;
}

function steerSwerve(s: Shot, dt: number) {
  if (!s.swerve || s.mode === 'crash') return;
  const o = s.swerve.target, d = distanceOf(s), past = d > o.z + o.d + 2;
  const want = past ? 0 : Math.atan2(-(s.swerve.x - s.x), Math.max(4, o.z - d));
  const step = PHYSICS.swerveTurnRate * dt;
  const diff = Math.max(-step, Math.min(step, want - s.heading));
  if (Math.abs(diff) > 1e-5) {
    const c = Math.cos(diff), n = Math.sin(diff);
    const vx = s.vx * c + s.vz * n, vz = -s.vx * n + s.vz * c;
    s.vx = vx; s.vz = vz; s.heading += diff;
  }
  if (past && Math.abs(s.heading) < .01) s.swerve = null;
}

/* Advance one fixed step. */
export function stepShot(s: Shot, dt: number, inp: FlightInput | null) {
  const P = PHYSICS, lv = s.lv;
  s.t += dt; s.boosting = false;
  if (s.mode === 'stop') return;
  if (s.mode === 'ramp') { stepRamp(s, dt); return; }
  steerSwerve(s, dt);
  const fx = -Math.sin(s.heading), fz = -Math.cos(s.heading);
  if (s.mode === 'air' || s.mode === 'crash') {
    let g = P.gravity;
    if (s.mode === 'air') {
      if (inp?.boost && s.fuel > 0) { s.fuel -= dt; s.vx += fx * P.boostPush * dt; s.vz += fz * P.boostPush * dt; s.vy += P.boostLift * dt; s.boosting = true; }
      if (s.burn > 0) { s.burn -= dt; s.vx += fx * P.burnPush * dt; s.vz += fz * P.burnPush * dt; s.vy += P.burnLift * dt; s.boosting = true; }
      if (s.vy < 0 && lv.wings > 0) g *= 1 - P.wingGlidePerLevel * lv.wings;
    }
    s.vy -= g * dt;
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    if (s.y <= 0) {
      s.y = 0;
      if (s.mode === 'crash') { s.vx = s.vz = s.vy = 0; s.mode = 'stop'; return; }
      s.impact = -s.vy;
      if (s.vy < -P.bounceMinSpeed) {
        s.events.push('bounce');
        s.vy = -s.vy * (P.bounceBase + P.bouncePerWheel * lv.wheels);
        const k = P.bounceKeepBase + P.bounceKeepPerWheel * lv.wheels;
        s.vx *= k; s.vz *= k;
      } else {
        s.vy = 0; s.mode = 'roll'; s.events.push('land');
      }
    }
  } else if (s.mode === 'roll') {
    let sp = Math.hypot(s.vx, s.vz);
    if (s.burn > 0) { s.burn -= dt; sp += P.burnRollPush * dt; s.boosting = true; }
    sp -= (P.rollFriction - P.rollFrictionPerWheel * lv.wheels) * dt;
    if (sp <= P.stopSpeed) { s.vx = s.vz = 0; s.mode = 'stop'; s.events.push('stop'); return; }
    const a = Math.atan2(s.vx, s.vz);
    s.vx = Math.sin(a) * sp; s.vz = Math.cos(a) * sp;
    s.x += s.vx * dt; s.z += s.vz * dt;
  }
}

/* Stop the car where it hit something: it drops straight down from there. */
export function crashAt(s: Shot, d: number) {
  s.mode = 'crash'; s.burn = 0;
  s.z = -d + 1.9; s.vx = 0; s.vz = 0; s.vy = Math.min(s.vy, 0);
}
