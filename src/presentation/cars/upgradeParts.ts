import * as THREE from 'three';
import { MAX_LEVEL } from '../../content/upgrades';
import type { UpgradeLevels } from '../../rules/save';
import { MAT, V3, cyl, finish, flameCone, lathe, mesh, orient, paint, rbox, slab, sphere } from './kit';
import type { CarModel } from './models';

/* What upgrades look like on the car: wings, booster tanks, bigger (and finally gold) wheels. */
export function fitUpgrades(m: CarModel, lv: UpgradeLevels, accent: number) {
  const mt = m.mounts;
  if (m.upgrades) m.group.remove(m.upgrades);
  const u = new THREE.Group(); m.upgrades = u; m.group.add(u);
  m.boostFlames = [];
  if (lv.wings > 0) {
    const sc = .6 + .22 * lv.wings;
    for (const side of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(side * mt.halfW * .92, mt.wingY, mt.wingZ - .45 * sc); piv.scale.setScalar(sc); u.add(piv);
      const w = slab(piv, [['m', 0, 0], ['q', .75, .12, 1.35, .58], ['l', 1.35, .86], ['l', 0, .98], ['l', 0, 0]], .07, .03, paint(accent));
      orient(w, V3(side, 0, 0), V3(0, 0, 1), V3(0, -side, 0));
      rbox(piv, .06, .3, .42, .03, paint(0xffd21f), side * 1.36, .08, .7);
      rbox(piv, .26, .14, .7, .06, MAT.chrome(), side * .05, 0, .5);
    }
  }
  if (lv.boost > 0) {
    const tankMat = paint(0xe8231c, { metalness: .4, roughness: .25 });
    for (const side of [-1, 1]) {
      const len = .55 + .15 * lv.boost;
      const x = side * mt.boostX, y = mt.boostY, z = mt.boostZ;
      cyl(u, .16, .16, len, tankMat, x, y, z, Math.PI / 2, 0, 0, 28);
      sphere(u, .16, tankMat, x, y, z - len / 2);
      const nz = finish(lathe([[.1, 0], [.16, .12], [.2, .24], [.17, .26], [.12, .12], [.08, 0]], MAT.chrome(), 28));
      nz.rotation.x = Math.PI / 2; nz.position.set(x, y, z + len / 2); u.add(nz);
      mesh(u, new THREE.TorusGeometry(.165, .025, 8, 28), MAT.chrome(), x, y, z - len * .15);
      const f = flameCone(u, .18, 1.0, x, y, z + len / 2 + .22); f.visible = false; m.boostFlames.push(f);
    }
  }
  const gold = lv.wheels >= MAX_LEVEL;
  for (const w of m.wheels) {
    for (const r of w.rims) {
      r.userData.base ??= r.material;
      r.material = gold ? MAT.gold() : r.userData.base;
    }
    const k = 1 + .03 * lv.wheels;
    w.spin.scale.set(1 + .04 * lv.wheels, k, k);
  }
}
