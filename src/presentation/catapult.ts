import * as THREE from 'three';
import { THEME } from '../content/theme';
import { MAT, V3, orient, paint, rbox, slab, sphere, tube } from './cars/kit';
import { canvasTex } from './textures';

/* The catapult at the start line: a chunky toy slingshot. Blue base with chevrons and hazard-striped
   edges, red posts on yellow pedestals with chrome springs, and an elastic band with a pouch. */
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
    // a low plate, mostly sunk into the street: the car's wheels sit on the road, not inside the plate
    rbox(base, 6.4, .36, 5.2, .16, paint(hex(THEME.colors.blue)), 0, -.14, 2.4);
    for (let i = 0; i < 3; i++) {
      const ch = slab(base, [['m', 0, 0], ['l', .6, .5], ['l', 0, 1.0], ['l', -.3, 1.0], ['l', .3, .5], ['l', -.3, 0], ['l', 0, 0]], .03, 0, paint(hex(THEME.colors.sun)), 0, .05, .4 + i * 1.25);
      orient(ch, V3(0, 0, -1), V3(1, 0, 0), V3(0, 1, 0)); ch.scale.setScalar(1.2);
    }
    const hazard = canvasTex(256, 32, (c, w, h) => {
      c.fillStyle = '#ffd21f'; c.fillRect(0, 0, w, h); c.fillStyle = '#15171d';
      for (let x = -h; x < w + h; x += 32) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 16, h); c.lineTo(x + 16 + h, 0); c.lineTo(x + h, 0); c.fill(); }
    });
    const hzMat = new THREE.MeshStandardMaterial({ map: hazard, roughness: .5 });
    for (const z of [-.12, 4.92]) { const hz = new THREE.Mesh(new THREE.BoxGeometry(6.2, .06, .34), hzMat); hz.position.set(0, .06, z); base.add(hz); }

    const postMat = paint(hex(THEME.colors.red)), sunMat = paint(hex(THEME.colors.sun));
    for (const s of [-1, 1]) {
      rbox(base, 1.15, .55, 1.15, .16, sunMat, s * 2.6, .3, 3.6);                       // pedestal
      const coil: THREE.Vector3[] = [];
      for (let i = 0; i <= 120; i++) { const a = i / 120 * Math.PI * 2 * 5; coil.push(V3(s * 2.6 + Math.cos(a) * .34, .58 + i / 120 * 1.0, 3.6 + Math.sin(a) * .34)); }
      base.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 240, .055, 6), MAT.chrome()));
      tube(base, [[s * 2.6, .28, 3.6], [s * 2.55, 1.6, 3.52], [s * 2.3, 2.6, 3.3]], .25, postMat);
      for (const [y, x, z] of [[1.75, 2.53, 3.49], [2.25, 2.42, 3.4]] as const) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.27, .07, 10, 24), sunMat);
        ring.position.set(s * x, y, z); ring.rotation.x = Math.PI / 2; base.add(ring);
      }
      sphere(base, .38, sunMat, s * 2.3, 2.8, 3.3);                                      // knob with a red band
      const band = new THREE.Mesh(new THREE.TorusGeometry(.36, .06, 10, 24), postMat);
      band.position.set(s * 2.3, 2.8, 3.3); band.rotation.x = Math.PI / 2; base.add(band);
    }
    base.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true; });
    const bandMat = paint(0x1d1f24, { roughness: .7, clearcoat: .2 });
    this.bands = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 1, 12), bandMat); scene.add(m); return m; });
    scene.add(this.pouch); rbox(this.pouch, 1.25, .28, .24, .1, paint(0xc8140d, { roughness: .55, clearcoat: .3 }));
  }

  /* Band hugs the back of the car while aiming; snaps forward once launched. */
  update(carPos: THREE.Vector3, carYaw: number, carRear: number, launched: boolean) {
    // pouch sits behind the car's rear bumper, which swings round with the aim
    const back = carRear + .25;
    const pc = launched ? V3(0, .4, this.z0 + carRear + .5) : V3(carPos.x + Math.sin(carYaw) * back, .4, carPos.z + Math.cos(carYaw) * back);
    const yaw = launched ? 0 : carYaw;
    this.pouch.position.copy(pc); this.pouch.rotation.y = yaw;
    // band ends follow the pouch's ends as it turns with the aim (pouch is 1.25 wide)
    const ex = .58 * Math.cos(yaw), ez = -.58 * Math.sin(yaw);
    [-1, 1].forEach((s, i) => stretch(this.bands[i], V3(s * 2.3, 2.6, this.z0 + 3.3), V3(pc.x + s * ex, pc.y, pc.z + s * ez)));
  }
}
