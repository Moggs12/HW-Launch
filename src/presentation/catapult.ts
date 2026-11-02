import * as THREE from 'three';
import { THEME } from '../content/theme';
import { V3, orient, paint, rbox, slab, sphere, tube } from './cars/kit';

/* The catapult at the start line: a base with chevrons, two posts and an elastic band with a pouch. */
const hex = (css: string) => parseInt(css.slice(1), 16);

export function stretch(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  m.position.copy(a).addScaledVector(d, .5); m.scale.set(1, L, 1);
  m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
}

export class Catapult {
  private bands: THREE.Mesh[];
  private pouch = new THREE.Group();

  /* z0: the start line (where the car sits before a pull) */
  constructor(scene: THREE.Scene, private z0: number) {
    const base = new THREE.Group(); scene.add(base); base.position.z = z0;
    rbox(base, 6.4, .36, 5.2, .16, paint(hex(THEME.colors.blue)), 0, .18, 2.4);
    for (let i = 0; i < 3; i++) {
      const ch = slab(base, [['m', 0, 0], ['l', .6, .5], ['l', 0, 1.0], ['l', -.3, 1.0], ['l', .3, .5], ['l', -.3, 0], ['l', 0, 0]], .03, 0, paint(hex(THEME.colors.sun)), 0, .37, .4 + i * 1.25);
      orient(ch, V3(0, 0, -1), V3(1, 0, 0), V3(0, 1, 0)); ch.scale.setScalar(1.2);
    }
    const postMat = paint(hex(THEME.colors.red));
    for (const s of [-1, 1]) {
      tube(base, [[s * 2.6, .3, 3.6], [s * 2.5, 1.6, 3.5], [s * 2.3, 2.6, 3.3]], .2, postMat);
      sphere(base, .3, paint(hex(THEME.colors.sun)), s * 2.3, 2.75, 3.3);
    }
    const bandMat = paint(0x1d1f24, { roughness: .7, clearcoat: .2 });
    this.bands = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 1, 12), bandMat); scene.add(m); return m; });
    scene.add(this.pouch); rbox(this.pouch, 1.2, .22, .2, .08, bandMat);
  }

  /* Band hugs the back of the car while aiming; snaps forward once launched. */
  update(carPos: THREE.Vector3, carYaw: number, carRear: number, launched: boolean) {
    const pc = launched ? V3(0, .4, this.z0 + carRear + .5) : V3(carPos.x, .4, carPos.z + carRear + .25);
    this.pouch.position.copy(pc); this.pouch.rotation.y = launched ? 0 : carYaw;
    [-1, 1].forEach((s, i) => stretch(this.bands[i], V3(s * 2.3, 2.6, this.z0 + 3.3), V3(pc.x + s * .58, pc.y, pc.z)));
  }
}
