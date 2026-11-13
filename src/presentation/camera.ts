import * as THREE from 'three';

/* Rear chase camera: a fixed distance behind the car the whole flight.
   While aiming it sits behind the catapult looking up the ramp.

   In flight the camera is placed relative to the car (car + smoothed offset),
   so it never drifts further back at high speed; only the offset's direction
   and height are smoothed. All smoothing is exponential in dt, so it feels
   the same at 30 or 120 fps. */
const BACK = 8.8, UP = 3.2, LOOK_AHEAD = 8, LOOK_UP = 1.2;
const MIN_Y = 1.6;               // never dip under the street
const BASE_FOV = 55, PORTRAIT_FOV = 68, PORTRAIT_EXTRA = 13;
const OFFSET_RATE = 9;           // how fast the camera swings in behind (per second)
const HEIGHT_RATE = 10;          // vertical follow, softens landing jolts
const AIM_RATE = 4.6;            // drift into the aiming view
const FOV_RATE = 6;
const KICK_DECAY = 2.5;
const SHAKE_AMP = .32;

const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export class ChaseCamera {
  private pos = new THREE.Vector3(0, 3.4, 10);
  private look = new THREE.Vector3(0, 1.4, -8);
  private rel = new THREE.Vector3();       // smoothed camera offset from the car while flying
  private relLook = new THREE.Vector3();   // smoothed look offset from the car while flying
  private camY = 0;
  private wasFlying = false;
  private snapNext = true;
  private kickFov = 0;
  private t = 0;
  private gp = new THREE.Vector3();
  private gl = new THREE.Vector3();

  constructor(private cam: THREE.PerspectiveCamera, private startZ: number) {}

  snap() { this.snapNext = true; }

  /* a quick zoom-out, e.g. at take-off */
  kick(deg: number) { this.kickFov = Math.max(this.kickFov, deg); }

  resize(w: number, h: number) {
    if (w <= 0 || h <= 0) return;
    this.cam.aspect = w / h;
    this.cam.fov = this.portrait ? PORTRAIT_FOV : BASE_FOV;
    this.cam.updateProjectionMatrix();
  }

  private get portrait() { return this.cam.aspect < .8; }

  update(dt: number, flying: boolean, car: THREE.Vector3, heading: number, speed: number, shake: number) {
    this.t += dt;
    const { gp, gl } = this;
    if (!flying) {
      gp.set(0, 3.6, this.startZ + 9.5); gl.set(0, 2.2, this.startZ - 16);
      if (this.snapNext) { this.pos.copy(gp); this.look.copy(gl); this.snapNext = false; }
      const k = damp(AIM_RATE, dt);
      this.pos.lerp(gp, k); this.look.lerp(gl, k);
      this.wasFlying = false;
    } else {
      const sx = Math.sin(heading), cz = Math.cos(heading);
      gp.set(sx * BACK, 0, cz * BACK);              // horizontal offset behind the car
      gl.set(-sx * LOOK_AHEAD, LOOK_UP, -cz * LOOK_AHEAD);
      const wantY = Math.max(MIN_Y, car.y + UP);
      if (this.snapNext) {
        this.rel.copy(gp); this.relLook.copy(gl); this.camY = wantY; this.snapNext = false;
      } else if (!this.wasFlying) {
        // take over smoothly from wherever the aiming camera was
        this.rel.set(this.pos.x - car.x, 0, this.pos.z - car.z);
        this.relLook.subVectors(this.look, car);
        this.camY = this.pos.y;
      }
      this.wasFlying = true;
      const k = damp(OFFSET_RATE, dt);
      this.rel.lerp(gp, k); this.relLook.lerp(gl, k);
      // keep the fixed distance even while swinging round
      const len = Math.hypot(this.rel.x, this.rel.z);
      if (len > 1e-3) { const f = 1 + (BACK / len - 1) * k; this.rel.x *= f; this.rel.z *= f; }
      this.camY += (wantY - this.camY) * damp(HEIGHT_RATE, dt);
      this.camY = Math.max(MIN_Y, this.camY);
      this.pos.set(car.x + this.rel.x, this.camY, car.z + this.rel.z);
      this.look.addVectors(car, this.relLook);
    }

    this.cam.position.copy(this.pos);
    if (shake > 0) {
      // smooth, low-frequency wobble (not per-frame random noise) that eases out as shake runs down
      const a = SHAKE_AMP * shake * Math.min(1, shake * 2.5), t = this.t;
      this.cam.position.x += a * (Math.sin(t * 37) * .6 + Math.sin(t * 23 + 1.3) * .4);
      this.cam.position.y += a * (Math.sin(t * 31 + .7) * .6 + Math.sin(t * 19 + 2.1) * .4);
      this.cam.position.y = Math.max(MIN_Y - .3, this.cam.position.y);
    }
    this.cam.lookAt(this.look);

    this.kickFov *= Math.exp(-KICK_DECAY * dt);
    const base = this.portrait ? PORTRAIT_FOV : BASE_FOV;
    const target = flying ? BASE_FOV + Math.min(14, speed * .15) + (this.portrait ? PORTRAIT_EXTRA : 0) + this.kickFov : base;
    const fov = this.cam.fov + (target - this.cam.fov) * damp(FOV_RATE, dt);
    if (Math.abs(fov - this.cam.fov) > 1e-4) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
  }
}
