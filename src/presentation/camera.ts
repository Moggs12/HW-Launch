import * as THREE from 'three';
import { V3 } from './cars/kit';

/* Rear chase camera: a fixed distance behind the car the whole flight. */
const BACK = 8.8, UP = 3.2, LOOK_AHEAD = 8;
const BASE_FOV = 55, PORTRAIT_FOV = 68, PORTRAIT_EXTRA = 13;

export class ChaseCamera {
  private pos = V3(0, 3.4, 10);
  private look = V3(0, 1.4, -8);
  private snapNext = true;

  constructor(private cam: THREE.PerspectiveCamera) {}

  snap() { this.snapNext = true; }

  resize(w: number, h: number) {
    this.cam.aspect = w / h;
    this.cam.fov = this.portrait ? PORTRAIT_FOV : BASE_FOV;
    this.cam.updateProjectionMatrix();
  }

  private get portrait() { return this.cam.aspect < .8; }

  update(dt: number, flying: boolean, car: THREE.Vector3, heading: number, speed: number, shake: number) {
    let gp: THREE.Vector3, gl: THREE.Vector3;
    if (!flying) { gp = V3(0, 3.1, 9.0); gl = V3(0, 1.2, -14); }
    else {
      const sx = Math.sin(heading), cz = Math.cos(heading);
      gp = V3(car.x + sx * BACK, Math.max(1.6, car.y + UP), car.z + cz * BACK);
      gl = V3(car.x - sx * LOOK_AHEAD, car.y + 1.2, car.z - cz * LOOK_AHEAD);
    }
    if (this.snapNext) { this.pos.copy(gp); this.look.copy(gl); this.snapNext = false; }
    const k = flying ? 1 - Math.pow(.00002, dt) : 1 - Math.pow(.01, dt);
    this.pos.lerp(gp, k); this.look.lerp(gl, k);
    this.cam.position.copy(this.pos);
    if (shake > 0) { this.cam.position.x += (Math.random() - .5) * shake * .6; this.cam.position.y += (Math.random() - .5) * shake * .6; }
    this.cam.lookAt(this.look);
    if (flying) {  // widen a little with speed
      const target = BASE_FOV + Math.min(14, speed * .15) + (this.portrait ? PORTRAIT_EXTRA : 0);
      this.cam.fov += (target - this.cam.fov) * .08;
      this.cam.updateProjectionMatrix();
    }
  }
}
