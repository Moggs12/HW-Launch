import * as THREE from 'three';
import {
  MAT, V3, cyl, flameCone, lamp, lathe, finish, makeWheel, mesh, orient, paint, plate, rbox, slab, sphere, tube,
  type Cmd, type Wheel, type WheelOpts,
} from './kit';

/* The six procedural toy cars. Each builder returns a CarModel; the game only talks to that.
   To swap in a Blender model later, write a builder that loads a glTF and fills the same fields. */

export interface Mounts { halfW: number; wingY: number; wingZ: number; boostY: number; boostZ: number; boostX: number }

export interface CarModel {
  group: THREE.Group;
  body: THREE.Group;                 // everything but the wheels, so it can bounce on its suspension
  wheels: Wheel[];
  burnFlames: THREE.Object3D[];      // shown while a special burn is on (Flame Racer exhausts)
  mainFlame: THREE.Object3D | null;  // always-on engine flame (Rocket Rider)
  boostFlames: THREE.Object3D[];     // from the Boost upgrade
  upgrades: THREE.Group | null;
  mounts: Mounts;
}

function newCar(): CarModel {
  return { group: new THREE.Group(), body: new THREE.Group(), wheels: [], burnFlames: [], mainFlame: null, boostFlames: [], upgrades: null,
    mounts: { halfW: 1, wingY: 1, wingZ: 0, boostY: 1, boostZ: 2, boostX: .5 } };
}
function addWheel(m: CarModel, x: number, y: number, z: number, r: number, w: number, rim: number, opts?: WheelOpts) {
  const wh = makeWheel(r, w, rim, opts); wh.group.position.set(x, y, z); m.group.add(wh.group);
  m.wheels.push(wh); return wh;
}
const SIDES = [-1, 1] as const;

/* ---------- 1. BANANA BUGGY ---------- */
function buildBanana() {
  const m = newCar(), car = m.group, Y = paint(0xffd51f), BR = paint(0x5b3a16), SEAT = paint(0x23262d, { clearcoat: .3, roughness: .6 });
  const curve = new THREE.CatmullRomCurve3([V3(0, 1.32, -2.25), V3(0, .92, -1.45), V3(0, .74, -.2), V3(0, .8, .9), V3(0, 1.05, 1.6), V3(0, 1.42, 2.15)]);
  const body = mesh(car, new THREE.TubeGeometry(curve, 64, .56, 18, false), Y); body.scale.x = 1.22;
  // tips: tapered brown ends
  const tipF = curve.getPoint(0), tipB = curve.getPoint(1);
  sphere(car, .5, Y, 0, tipF.y, tipF.z, 1.22, 1, 1);
  sphere(car, .5, Y, 0, tipB.y, tipB.z, 1.22, 1, 1);
  cyl(car, .12, .26, .6, BR, 0, tipB.y + .32, tipB.z + .22, -.75, 0, 0);
  sphere(car, .18, BR, 0, tipF.y + .18, tipF.z - .36);
  // ridges along the peel
  SIDES.forEach(s => tube(car, [[s * .6, 1.25, -2.0], [s * .66, .86, -1.2], [s * .68, .74, 0], [s * .66, .82, 1.0], [s * .6, 1.2, 1.95]], .03, paint(0xf0b400)));
  // seat, backrest, steering, roll cage
  rbox(car, .86, .24, .7, .1, SEAT, 0, 1.28, .15);
  rbox(car, .86, .82, .2, .09, SEAT, 0, 1.66, .55, -.18, 0, 0);
  rbox(car, .5, .24, .16, .06, SEAT, 0, 2.14, .62, -.18, 0, 0);
  mesh(car, new THREE.TorusGeometry(.2, .035, 10, 28), MAT.dark(), 0, 1.6, -.45, -1.0, 0, 0);
  cyl(car, .03, .03, .45, MAT.chrome(), 0, 1.44, -.32, -1.0, 0, 0, 12);
  tube(car, [[-.58, 1.2, .82], [-.58, 2.2, .78], [-.4, 2.42, .74], [.4, 2.42, .74], [.58, 2.2, .78], [.58, 1.2, .82]], .055, MAT.chrome());
  tube(car, [[-.5, 2.3, .76], [-.45, 1.5, 1.45]], .045, MAT.chrome());
  tube(car, [[.5, 2.3, .76], [.45, 1.5, 1.45]], .045, MAT.chrome());
  // little engine + twin pipes at the back
  rbox(car, .7, .4, .55, .1, MAT.chrome(), 0, 1.48, 1.25);
  rbox(car, .5, .12, .4, .05, MAT.dark(), 0, 1.74, 1.25);
  SIDES.forEach(s => { tube(car, [[s * .25, 1.4, 1.5], [s * .32, 1.45, 1.85], [s * .36, 1.75, 2.05]], .07, MAT.chrome()); lamp(car, .065, MAT.dark(), s * .36, 1.82, 2.12); });
  // axles & wheels (chunky off-road)
  cyl(car, .07, .07, 2.2, MAT.chrome(), 0, .42, -1.3, 0, 0, Math.PI / 2, 14);
  cyl(car, .07, .07, 2.2, MAT.chrome(), 0, .46, 1.3, 0, 0, Math.PI / 2, 14);
  SIDES.forEach(s => {
    addWheel(m, s * 1.12, .42, -1.3, .42, .36, 0xffd51f, { tread: 18 });
    addWheel(m, s * 1.12, .46, 1.3, .46, .42, 0xffd51f, { tread: 18 });
    lamp(car, .09, MAT.red(), s * .42, 1.18, 2.05);
  });
  plate(car, 'BANANA', 0, 1.12, 2.0, .5).rotation.x = -.2;
  m.mounts = { halfW: .75, wingY: 1.0, wingZ: .1, boostY: 1.15, boostZ: 1.75, boostX: .5 };
  return m;
}

/* ---------- 2. FLAME RACER ---------- */
const FLAME_CMDS: Cmd[] = [['m', 0, -.16], ['q', 1.0, -.22, 2.0, -.1], ['q', 1.25, -.02, 2.2, .09], ['q', 1.35, .1, 1.8, .24], ['q', .9, .16, .25, .17], ['q', -.12, .02, 0, -.16]];
function buildFlame() {
  const m = newCar(), car = m.group, R = paint(0xe3221a), K = MAT.dark();
  // body
  slab(car, [['m', -2.0, .36], ['q', -2.18, .42, -2.08, .6], ['q', -1.4, .82, -.55, .86], ['l', 1.72, .9], ['q', 1.98, .9, 2.0, .68], ['l', 2.0, .46], ['q', 1.98, .36, 1.8, .36], ['l', -2.0, .36]], 1.86, .2, R);
  // cabin
  slab(car, [['m', -.62, .86], ['q', -.12, 1.36, .5, 1.4], ['q', 1.32, 1.38, 1.72, .9], ['l', -.62, .86]], 1.4, .14, MAT.glass());
  slab(car, [['m', -.08, 1.38], ['q', .5, 1.5, 1.22, 1.42], ['l', 1.22, 1.34], ['q', .5, 1.42, -.08, 1.3], ['l', -.08, 1.38]], 1.22, .06, R);
  // side scoops
  SIDES.forEach(s => rbox(car, .08, .24, .62, .06, K, s * .93, .66, .55));
  // flames (both sides)
  SIDES.forEach(s => {
    slab(car, FLAME_CMDS, .02, 0, paint(0xffd21f), s * .945, .62, -1.8).scale.setScalar(1.15);
    slab(car, FLAME_CMDS, .02, 0, paint(0xff8a1a), s * .955, .6, -1.55).scale.setScalar(.72);
  });
  // rear wing
  SIDES.forEach(s => rbox(car, .08, .48, .22, .03, K, s * .6, 1.14, 1.68, .15, 0, 0));
  slab(car, [['m', -.36, 0], ['q', -.08, .17, .4, .07], ['l', .4, .02], ['q', 0, -.05, -.36, 0]], 2.15, .03, R, 0, 1.36, 1.75);
  SIDES.forEach(s => rbox(car, .05, .42, .72, .02, K, s * 1.08, 1.4, 1.78));
  // rear: diffuser, lights, exhausts, plate
  rbox(car, 1.6, .26, .36, .06, K, 0, .42, 2.06);
  for (let i = -2; i <= 2; i++) rbox(car, .03, .24, .3, .01, K, i * .3, .4, 2.18);
  rbox(car, 1.5, .06, .04, .02, MAT.red(), 0, .82, 2.2);
  SIDES.forEach(s => { lamp(car, .11, MAT.red(), s * .62, .76, 2.2); lamp(car, .11, MAT.red(), s * .36, .76, 2.2); });
  [-.42, -.24, .24, .42].forEach(x => { cyl(car, .075, .075, .3, MAT.chrome(), x, .42, 2.2, Math.PI / 2, 0, 0, 20); lamp(car, .055, MAT.eyeBlack(), x, .42, 2.36); });
  plate(car, 'FLAME 01', 0, .6, 2.21, .6);
  m.burnFlames = [-.33, .33].map(x => { const f = flameCone(car, .17, 1.5, x, .42, 2.36); f.visible = false; return f; });
  SIDES.forEach(s => sphere(car, .09, R, s * .98, 1.02, -.35, .5, .6, 1));
  SIDES.forEach(s => {
    addWheel(m, s * .92, .44, -1.25, .44, .38, 0x30343c, { spokes: 6 });
    addWheel(m, s * .94, .48, 1.28, .48, .46, 0x30343c, { spokes: 6 });
  });
  m.mounts = { halfW: .93, wingY: .72, wingZ: .15, boostY: .95, boostZ: 1.95, boostX: .55 };
  return m;
}

/* ---------- 3. SHARK CHOMPER ---------- */
function buildShark() {
  const m = newCar(), car = m.group, BL = paint(0x2676e0), W = MAT.white();
  slab(car, [['m', -2.08, .44], ['q', -2.32, .82, -1.72, 1.06], ['q', -.7, 1.34, .4, 1.32], ['q', 1.72, 1.26, 1.94, .9], ['l', 1.94, .52], ['q', 1.9, .4, 1.72, .4], ['l', -2.08, .44]], 1.82, .28, BL);
  slab(car, [['m', -2.2, .36], ['l', 2.0, .36], ['l', 2.0, .64], ['q', 0, .76, -2.16, .7], ['l', -2.2, .36]], 1.88, .08, W);
  // face: mouth, teeth, eyes
  rbox(car, 1.5, .16, .12, .05, MAT.eyeBlack(), 0, .62, -2.36);
  for (let i = 0; i < 7; i++) mesh(car, new THREE.ConeGeometry(.08, .2, 12), W, -.6 + i * .2, .74, -2.37, Math.PI, 0, 0);
  for (let i = 0; i < 6; i++) mesh(car, new THREE.ConeGeometry(.07, .17, 12), W, -.5 + i * .2, .5, -2.37);
  SIDES.forEach(s => { sphere(car, .15, W, s * .7, 1.0, -1.72); sphere(car, .08, MAT.eyeBlack(), s * .74, 1.02, -1.84); });
  // bubble canopy
  sphere(car, .62, MAT.glass(), 0, 1.3, -.25, .95, .55, 1.3);
  // dorsal fin + tail fin
  slab(car, [['m', -.85, 0], ['q', .25, .3, 1.05, 1.6], ['q', .78, .6, 1.0, 0], ['l', -.85, 0]], .22, .07, BL, 0, 1.22, .25);
  slab(car, [['m', 0, 0], ['q', .38, .3, .78, 1.15], ['q', .5, .42, .42, 0], ['l', 0, 0]], .18, .06, BL, 0, .98, 1.55);
  slab(car, [['m', 0, 0], ['q', .38, -.2, .7, -.5], ['q', .45, -.15, .42, 0], ['l', 0, 0]], .16, .05, BL, 0, 1.02, 1.65);
  // gills
  SIDES.forEach(s => { for (let i = 0; i < 3; i++) slab(car, [['m', 0, 0], ['q', .14, .25, .06, .5], ['l', .14, .5], ['q', .22, .25, .08, 0], ['l', 0, 0]], .02, 0, W, s * .935, .58, -1.25 + i * .24); });
  // engine stacks behind the canopy
  rbox(car, .8, .24, .6, .08, MAT.chrome(), 0, 1.36, .85);
  [-.27, -.09, .09, .27].forEach(x => cyl(car, .07, .08, .38, MAT.chrome(), x, 1.62, .85, 0, 0, 0, 18));
  // rear lights + plate + exhaust
  SIDES.forEach(s => { rbox(car, .04, .14, .42, .04, MAT.red(), s * .6, .86, 2.24, 0, Math.PI / 2, 0); lamp(car, .09, MAT.amber(), s * .32, .86, 2.23); });
  plate(car, 'CHOMP', 0, .6, 2.25, .56);
  rbox(car, 1.5, .12, .08, .04, MAT.white(), 0, 1.12, 2.15);
  SIDES.forEach(s => { cyl(car, .07, .07, .25, MAT.chrome(), s * .35, .42, 2.12, Math.PI / 2, 0, 0, 18); });
  SIDES.forEach(s => {
    addWheel(m, s * .95, .44, -1.2, .44, .38, 0xf6f8fb);
    addWheel(m, s * .97, .47, 1.2, .47, .44, 0xf6f8fb);
  });
  m.mounts = { halfW: .95, wingY: .8, wingZ: .0, boostY: 1.0, boostZ: 1.95, boostX: .62 };
  return m;
}

/* ---------- 4. DINO STOMPER ---------- */
function buildDino() {
  const m = newCar(), car = m.group, GR = paint(0x5fcb2b), PU = paint(0x7b3fd1);
  // chassis + suspension
  rbox(car, 1.5, .3, 3.0, .1, PU, 0, 1.12, 0);
  SIDES.forEach(s => [-1.3, 1.3].forEach(z => {
    rbox(car, .7, .16, .2, .06, PU, s * .82, .98, z, 0, 0, s * .35);
    cyl(car, .07, .07, .75, MAT.chrome(), s * .75, 1.2, z + .25 * Math.sign(z), 0, 0, s * .5, 14);
    cyl(car, .1, .1, .35, paint(0xffd21f), s * .75, 1.2, z + .25 * Math.sign(z), 0, 0, s * .5, 14);
  }));
  // body
  slab(car, [['m', -2.0, 1.36], ['q', -2.24, 1.96, -1.48, 2.06], ['l', -.58, 2.08], ['q', -.36, 2.72, .35, 2.76], ['q', 1.26, 2.76, 1.44, 2.12], ['l', 1.86, 2.02], ['q', 2.06, 1.72, 1.96, 1.36], ['l', -2.0, 1.36]], 2.05, .26, GR);
  slab(car, [['m', -.34, 2.1], ['q', -.2, 2.58, .34, 2.6], ['q', 1.08, 2.6, 1.26, 2.14], ['l', -.34, 2.1]], 2.12, .03, MAT.glass());
  rbox(car, 1.5, .5, .04, .03, MAT.glass(), 0, 2.4, 1.55, .32, 0, 0);
  // snout
  rbox(car, 1.7, .14, .12, .05, MAT.eyeBlack(), 0, 1.58, -2.25);
  for (let i = 0; i < 6; i++) mesh(car, new THREE.ConeGeometry(.09, .22, 12), MAT.white(), -.62 + i * .25, 1.68, -2.26, Math.PI, 0, 0);
  SIDES.forEach(s => { sphere(car, .17, MAT.white(), s * .62, 2.02, -1.62); sphere(car, .09, MAT.eyeBlack(), s * .66, 2.05, -1.76); sphere(car, .06, paint(0x2c7a12), s * .3, 1.9, -2.27); });
  // spikes along the spine and tail
  const spike = (x: number, y: number, z: number, r: number, h: number, tilt = 0) => mesh(car, new THREE.ConeGeometry(r, h, 20), PU, x, y, z, tilt, 0, 0);
  spike(0, 3.2, -.15, .24, .55); spike(0, 3.2, .35, .26, .62); spike(0, 3.12, .85, .22, .5, -.25);
  spike(0, 2.5, 1.62, .2, .45, -.35); spike(0, 2.42, 1.95, .17, .38, -.45);
  mesh(car, new THREE.ConeGeometry(.42, 1.7, 28), GR, 0, 1.95, 2.55, 1.18, 0, 0);
  spike(0, 2.26, 2.55, .13, .3, -.5); spike(0, 2.12, 2.95, .1, .24, -.6);
  // rear bumper, lights
  rbox(car, 1.9, .18, .18, .07, MAT.chrome(), 0, 1.36, 2.02);
  SIDES.forEach(s => { lamp(car, .12, MAT.red(), s * .68, 1.7, 2.08); lamp(car, .07, MAT.amber(), s * .42, 1.7, 2.08); });
  plate(car, 'STOMP', 0, 1.62, 2.1, .5);
  SIDES.forEach(s => {
    addWheel(m, s * 1.24, .86, -1.3, .86, .74, 0x9cf05a, { tread: 22, rimRatio: .55 });
    addWheel(m, s * 1.24, .86, 1.3, .86, .74, 0x9cf05a, { tread: 22, rimRatio: .55 });
  });
  m.mounts = { halfW: 1.05, wingY: 1.75, wingZ: .1, boostY: 1.9, boostZ: 1.95, boostX: .62 };
  return m;
}

/* ---------- 5. ROCKET RIDER ---------- */
function buildRocket() {
  const m = newCar(), car = m.group, SI = paint(0xcfd6df, { metalness: .75, roughness: .22 }), OR = paint(0xff7417);
  const prof: [number, number][] = [[0, -2.42], [.16, -2.36], [.32, -2.18], [.46, -1.88], [.56, -1.5], [.63, -1.0], [.66, -.3], [.66, .6], [.63, 1.3], [.57, 1.82], [.5, 2.02], [.0, 2.02]];
  const body = finish(lathe(prof, SI, 48)); body.rotation.x = Math.PI / 2; body.position.y = .98; car.add(body);
  const nose = finish(lathe([[0, -2.44], [.165, -2.38], [.33, -2.2], [.47, -1.9], [.575, -1.45], [0, -1.45]], OR, 48));
  nose.rotation.x = Math.PI / 2; nose.position.y = .98; car.add(nose);
  [-.75, .95].forEach(z => mesh(car, new THREE.TorusGeometry(.66, .045, 12, 48), OR, 0, .98, z));
  // rivet rows
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; sphere(car, .025, MAT.chrome(), Math.cos(a) * .665, .98 + Math.sin(a) * .665, .2); }
  // canopy
  const can = finish(new THREE.Mesh(new THREE.SphereGeometry(.44, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), MAT.glass()));
  can.scale.set(1, .85, 1.55); can.position.set(0, 1.5, -.55); car.add(can);
  // big rear nozzle
  const noz = finish(lathe([[.4, 1.95], [.48, 2.12], [.66, 2.46], [.86, 2.78], [.82, 2.82], [.62, 2.52], [.42, 2.2], [.33, 2.0]], paint(0xff7417, { metalness: .6, roughness: .25, side: THREE.DoubleSide }), 48));
  noz.rotation.x = Math.PI / 2; noz.position.y = .98; car.add(noz);
  mesh(car, new THREE.TorusGeometry(.84, .04, 12, 48), MAT.chrome(), 0, .98, 2.8);
  mesh(car, new THREE.CircleGeometry(.5, 32), new THREE.MeshBasicMaterial({ color: 0xffe27a }), 0, .98, 2.3);
  m.mainFlame = flameCone(car, .52, 1.8, 0, .98, 2.5);
  // fins
  for (let i = 0; i < 3; i++) {
    const piv = new THREE.Group(); piv.position.set(0, .98, 1.05); piv.rotation.z = i * Math.PI * 2 / 3; car.add(piv);
    slab(piv, [['m', 0, 0], ['l', 1.0, 0], ['q', 1.3, .2, 1.3, .82], ['l', .92, .82], ['q', .45, .28, 0, 0]], .1, .04, OR, 0, .6, 0);
  }
  // wheel struts + wheels
  SIDES.forEach(s => [-1.2, 1.15].forEach(z => {
    rbox(car, .5, .12, .22, .05, SI, s * .68, .55, z);
    addWheel(m, s * 1.02, .44, z, .44, .32, 0xff7417);
  }));
  plate(car, 'ROCKET', 0, .4, 2.0, .5);
  m.mounts = { halfW: .7, wingY: .95, wingZ: -.1, boostY: .55, boostZ: 1.8, boostX: .55 };
  return m;
}

/* ---------- 6. LIGHTNING BOLT ---------- */
const BOLT_CMDS: Cmd[] = [['m', 0, .1], ['l', .75, .32], ['l', .64, .16], ['l', 1.5, .34], ['l', .68, -.06], ['l', .78, .1], ['l', 0, .1]];
function buildBolt() {
  const m = newCar(), car = m.group, BL = paint(0x1d57d6), YE = paint(0xffd21f);
  // long nose + rear pod
  slab(car, [['m', -3.7, .38], ['q', -3.86, .48, -3.6, .54], ['l', -.4, .74], ['q', 0, .96, .5, .96], ['l', 1.6, .96], ['l', 1.6, .38], ['l', -3.7, .38]], .62, .17, BL);
  slab(car, [['m', .15, .36], ['l', .15, .86], ['q', .48, 1.1, 1.0, 1.1], ['l', 1.85, 1.1], ['q', 2.08, 1.06, 2.08, .76], ['l', 2.08, .36], ['l', .15, .36]], 1.26, .2, BL);
  // bolts on the sides
  SIDES.forEach(s => {
    slab(car, BOLT_CMDS, .02, 0, YE, s * .325, .4, -3.0).scale.setScalar(1.4);
    slab(car, BOLT_CMDS, .02, 0, YE, s * .645, .62, .3).scale.setScalar(.9);
  });
  // cockpit + cage
  sphere(car, .34, MAT.glass(), 0, 1.0, -.2, .9, .75, 1.5);
  tube(car, [[-.3, .9, .25], [-.28, 1.35, .12], [.28, 1.35, .12], [.3, .9, .25]], .03, MAT.chrome());
  // supercharged engine
  rbox(car, .74, .44, .86, .08, MAT.chrome(), 0, 1.32, .95);
  rbox(car, .62, .34, .56, .07, paint(0xd8dde4, { metalness: .9, roughness: .15 }), 0, 1.7, .95);
  rbox(car, .5, .2, .34, .05, MAT.dark(), 0, 1.96, .85);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) cyl(car, .055, .065, .22, MAT.chrome(), -.18 + i * .12, 1.95, .98 + j * .14, 0, 0, 0, 16);
  // zoomie pipes
  SIDES.forEach(s => { for (let i = 0; i < 4; i++) cyl(car, .05, .06, .5, MAT.chrome(), s * .68, .95, .55 + i * .2, -.9, 0, s * .6, 14); });
  // tall rear wing
  SIDES.forEach(s => rbox(car, .07, 1.5, .14, .03, MAT.dark(), s * .44, 1.75, 1.88, .12, 0, 0));
  slab(car, [['m', -.48, 0], ['q', -.15, .22, .48, .08], ['l', .48, .02], ['q', 0, -.06, -.48, 0]], 2.3, .04, BL, 0, 2.5, 2.0);
  SIDES.forEach(s => rbox(car, .05, .7, 1.1, .03, YE, s * 1.16, 2.5, 2.02));
  const wb = slab(car, BOLT_CMDS, .02, 0, YE, 0, 2.6, 1.55); orient(wb, V3(0, 0, 1), V3(1, 0, 0), V3(0, 1, 0)); wb.scale.setScalar(.6);
  // rear end: lights, chute pack, wheelie bar
  rbox(car, .9, .06, .04, .02, MAT.red(), 0, .92, 2.2);
  rbox(car, .5, .3, .3, .08, paint(0x23262d, { clearcoat: .2, roughness: .7 }), 0, 1.22, 1.95);
  SIDES.forEach(s => tube(car, [[s * .3, .5, 2.1], [s * .28, .42, 2.9], [s * .25, .3, 3.5]], .035, MAT.chrome()));
  SIDES.forEach(s => addWheel(m, s * .32, .13, 3.55, .13, .08, 0xffd21f, { spokes: 4 }));
  plate(car, 'BOLT 25', 0, .62, 2.29, .5);
  // wheels: tiny fronts, giant slicks
  cyl(car, .04, .04, 1.1, MAT.chrome(), 0, .3, -3.0, 0, 0, Math.PI / 2, 12);
  SIDES.forEach(s => {
    addWheel(m, s * .5, .3, -3.0, .3, .12, 0xffd21f, { spokes: 8, rimRatio: .75 });
    addWheel(m, s * 1.14, .82, 1.45, .82, .8, 0xffd21f, { spokes: 5, rimRatio: .56 });
  });
  m.mounts = { halfW: .65, wingY: .7, wingZ: -.6, boostY: .62, boostZ: 2.15, boostX: .45 };
  return m;
}

export const MODELS: Record<string, () => CarModel> = {
  banana: buildBanana, flame: buildFlame, shark: buildShark, dino: buildDino, rocket: buildRocket, bolt: buildBolt,
};

export function buildCar(model: string): CarModel {
  const m = MODELS[model]();
  // move everything except the wheels into the body group
  const wheels = new Set<THREE.Object3D>(m.wheels.map(w => w.group));
  for (const c of [...m.group.children]) if (!wheels.has(c)) m.body.add(c);
  m.group.add(m.body);
  m.group.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return m;
}
