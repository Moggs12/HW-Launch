import * as THREE from 'three';
import { THEME } from '../../content/theme';

/* Building blocks for the procedural toy cars.
   Smooth shapes: side profiles extruded across the width with deep bevels,
   lathes for round parts, tubes for bars. Clear-coated toy paint.
   Cars face -z (forward), rear at +z, ground at y = 0. */

export const V2 = (x: number, y: number) => new THREE.Vector2(x, y);
export const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export type P3 = [number, number, number];
export type Cmd = ['m' | 'l', number, number] | ['q', number, number, number, number] | ['b', number, number, number, number, number, number];

const cache: Record<string, THREE.Material> = {};
type PhysOpts = THREE.MeshPhysicalMaterialParameters;
type StdOpts = THREE.MeshStandardMaterialParameters;
export function paint(c: number, extra: PhysOpts = {}) {
  const k = 'p' + c + JSON.stringify(extra);
  return (cache[k] ??= new THREE.MeshPhysicalMaterial({ color: c, metalness: .12, roughness: .32, clearcoat: 1, clearcoatRoughness: .07, ...extra }));
}
export function std(c: number, extra: StdOpts = {}) {
  const k = 's' + c + JSON.stringify(extra);
  return (cache[k] ??= new THREE.MeshStandardMaterial({ color: c, roughness: .6, metalness: .05, ...extra }));
}
export const MAT = {
  glass: () => paint(0x0e1b33, { metalness: .4, roughness: .05 }),
  chrome: () => std(0xe9edf2, { metalness: 1, roughness: .14 }),
  rubber: () => std(0x1a1b1f, { roughness: .88 }),
  dark: () => std(0x23262d, { roughness: .55, metalness: .3 }),
  red: () => std(0xff2b2b, { emissive: 0xff1a1a, emissiveIntensity: 2.2 }),
  amber: () => std(0xffa31a, { emissive: 0xff8a00, emissiveIntensity: 1.8 }),
  gold: () => paint(0xffc21a, { metalness: .9, roughness: .22 }),
  white: () => paint(0xf6f8fb),
  eyeBlack: () => paint(0x111216),
};

export function shapeFrom(cmds: readonly Cmd[]) {
  const s = new THREE.Shape();
  for (const c of cmds) {
    if (c[0] === 'm') s.moveTo(c[1], c[2]);
    else if (c[0] === 'l') s.lineTo(c[1], c[2]);
    else if (c[0] === 'q') s.quadraticCurveTo(c[1], c[2], c[3], c[4]);
    else if (c[0] === 'b') s.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
  }
  return s;
}
/* re-aim a slab's inner mesh: where shape x, shape y and extrude-z should point */
export function orient(p: THREE.Object3D, xa: THREE.Vector3, ya: THREE.Vector3, za: THREE.Vector3) {
  p.children[0].quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xa, ya, za));
  return p;
}
export function finish<T extends THREE.Mesh>(m: T) { m.castShadow = true; m.receiveShadow = true; return m; }

/* side profile (shape x -> car z, shape y -> up), extruded across width (car x) */
export function slab(g: THREE.Object3D, cmds: readonly Cmd[], width: number, bevel: number, mat: THREE.Material,
                     x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const depth = Math.max(.002, width - 2 * bevel);
  const geo = new THREE.ExtrudeGeometry(shapeFrom(cmds), { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * .92, bevelSegments: bevel > 0 ? 6 : 0, curveSegments: 22 });
  geo.translate(0, 0, -depth / 2);
  const inner = finish(new THREE.Mesh(geo, mat)); inner.rotation.y = -Math.PI / 2;
  const p = new THREE.Group(); p.add(inner); p.position.set(x, y, z); p.rotation.set(rx, ry, rz);
  g.add(p); return p;
}
export function rbox(g: THREE.Object3D, w: number, h: number, d: number, r: number, mat: THREE.Material,
                     x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  r = Math.min(r, w / 2 - .001, h / 2 - .001, d / 2 - .001);
  const a = Math.max(.001, d / 2 - r), b = Math.max(.001, h / 2 - r);
  return slab(g, [['m', -a, -b], ['l', a, -b], ['l', a, b], ['l', -a, b], ['l', -a, -b]], w, r, mat, x, y, z, rx, ry, rz);
}
export function mesh(g: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = finish(new THREE.Mesh(geo, mat)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m;
}
export function tube(g: THREE.Object3D, pts: P3[], r: number, mat: THREE.Material, closed = false) {
  return mesh(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => V3(...p)), closed), 40, r, 12, closed), mat);
}
export function lathe(pts: [number, number][], mat: THREE.Material, segs = 40) {
  return new THREE.Mesh(new THREE.LatheGeometry(pts.map(p => V2(p[0], p[1])), segs), mat);
}
export function cyl(g: THREE.Object3D, rt: number, rb: number, h: number, mat: THREE.Material,
                    x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, segs = 28) {
  return mesh(g, new THREE.CylinderGeometry(rt, rb, h, segs), mat, x, y, z, rx, ry, rz);
}
export function sphere(g: THREE.Object3D, r: number, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) {
  const m = mesh(g, new THREE.SphereGeometry(r, 28, 18), mat, x, y, z); m.scale.set(sx, sy, sz); return m;
}
/* a lamp: glowing disc facing backwards */
export function lamp(g: THREE.Object3D, r: number, mat: THREE.Material, x: number, y: number, z: number) {
  return cyl(g, r, r, .06, mat, x, y, z, Math.PI / 2, 0, 0, 24);
}
export function plate(g: THREE.Object3D, text: string, x: number, y: number, z: number, w = .62) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
  const c = cv.getContext('2d')!;
  c.fillStyle = THEME.colors.sun; c.beginPath();
  if (c.roundRect) c.roundRect(4, 4, 248, 88, 14); else c.rect(4, 4, 248, 88);   // roundRect: Safari 16+
  c.fill();
  c.strokeStyle = THEME.colors.ink; c.lineWidth = 6; c.stroke();
  c.fillStyle = THEME.colors.ink; c.font = '900 52px Nunito, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, 128, 52);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 96 / 256), new THREE.MeshStandardMaterial({ map: t, roughness: .5 }));
  m.position.set(x, y, z); g.add(m); return m;
}

export interface Wheel { group: THREE.Group; spin: THREE.Group; rims: THREE.Mesh[]; r: number }
export interface WheelOpts { rimRatio?: number; tread?: number; spokes?: number }

/* rounded tyre + spoked rim. Axis along x. */
export function makeWheel(r: number, w: number, rimColor: number, opts: WheelOpts = {}): Wheel {
  const outer = new THREE.Group(), spin = new THREE.Group(); outer.add(spin);
  const ri = r * (opts.rimRatio ?? .6), e = Math.min(r * .28, w * .32);
  const pts: [number, number][] = [[ri * .98, -w / 2 + .01]];
  for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2; pts.push([r - e + Math.sin(a) * e, -w / 2 + e - Math.cos(a) * e]); }
  for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2; pts.push([r - e + Math.cos(a) * e, w / 2 - e + Math.sin(a) * e]); }
  pts.push([ri * .98, w / 2 - .01]);
  const tyre = finish(lathe(pts, MAT.rubber(), 48)); tyre.rotation.z = Math.PI / 2; spin.add(tyre);
  if (opts.tread) {
    const n = opts.tread, lug = new THREE.BoxGeometry(w * .8, r * .07, r * .14);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, k = finish(new THREE.Mesh(lug, MAT.rubber()));
      k.position.set((i % 2 ? .06 : -.06) * w, Math.cos(a) * (r - .005), Math.sin(a) * (r - .005)); k.rotation.x = -a; spin.add(k);
    }
  }
  const rimMat = paint(rimColor, { metalness: .55, roughness: .25 });
  const rims: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const dish = finish(new THREE.Mesh(new THREE.CylinderGeometry(ri * .98, ri * .98, .04, 36), MAT.dark()));
    dish.rotation.z = Math.PI / 2; dish.position.x = s * (w / 2 - .08); spin.add(dish);
    const lip = finish(new THREE.Mesh(new THREE.TorusGeometry(ri * .93, ri * .07, 10, 40), rimMat));
    lip.rotation.y = Math.PI / 2; lip.position.x = s * (w / 2 - .04); spin.add(lip); rims.push(lip);
    const spokes = opts.spokes ?? 5;
    for (let i = 0; i < spokes; i++) {
      const a = i / spokes * Math.PI * 2;
      const sp = finish(new THREE.Mesh(new THREE.BoxGeometry(.05, ri * .82, ri * .2), rimMat));
      sp.position.set(s * (w / 2 - .05), Math.cos(a) * ri * .45, Math.sin(a) * ri * .45); sp.rotation.x = -a; spin.add(sp); rims.push(sp);
    }
    const cap = finish(new THREE.Mesh(new THREE.CylinderGeometry(ri * .22, ri * .26, .08, 24), MAT.chrome()));
    cap.rotation.z = Math.PI / 2; cap.position.x = s * (w / 2 - .02); spin.add(cap);
  }
  return { group: outer, spin, rims, r };
}

/* engine glow flame (for boost + rocket) pointing +z */
export function flameCone(g: THREE.Object3D, r: number, len: number, x: number, y: number, z: number) {
  const grp = new THREE.Group(); grp.position.set(x, y, z);
  const flameMat = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const outer = new THREE.Mesh(new THREE.ConeGeometry(r, len, 20, 1, true), flameMat(0xff7a1a, .75));
  outer.rotation.x = Math.PI / 2; outer.position.z = len / 2; grp.add(outer);
  const inner = new THREE.Mesh(new THREE.ConeGeometry(r * .55, len * .62, 16, 1, true), flameMat(0xfff2a0, .95));
  inner.rotation.x = Math.PI / 2; inner.position.z = len * .31; grp.add(inner);
  g.add(grp); return grp;
}
