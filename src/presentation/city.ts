import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CourseItem } from '../content/level';
import { THEME } from '../content/theme';
import type { Block, SideBlock } from '../rules/layout';
import type { World } from '../rules/run';
import { MAT, V2, makeWheel, mergeStatic, paint, rbox, slab } from './cars/kit';
import { awningTexture, canvasTex, roadTexture, shopTexture, signTexture, walkTexture, windowTexture } from './textures';

/* Draws the toy city from the level data and its layout. No game decisions here. */

const BLD_COLORS = [0xff8a65, 0xffc94d, 0x7fc8f8, 0x9ad66b, 0xc89bf0, 0xff9fc4, 0x5fd3c3, 0xf2f2ee, 0x8fa8ff, 0xffb36b];
const SIGN_COLS: [string, string][] = [[THEME.colors.red, THEME.colors.sun], [THEME.colors.blue, '#ffffff'], [THEME.colors.flame, '#ffffff'], ['#7b3fd1', THEME.colors.sun], ['#0f9d58', '#ffffff']];
const SHOP_FRAMES = [0x2b3a67, 0x8a2b2b, 0x1f6b52, 0x5a3d8a];
const AWNING_COLS = ['#e8231c', '#1440c4', '#0f9d58', '#ff7a1a', '#7b3fd1'];
const PARKED_COLS = [0x2bb3ff, 0xff4fa0, 0x7bd34a, 0xffd21f, 0xa36bff];

export interface CityView {
  obstacles: THREE.Object3D[];   // per course item
  coins: THREE.Object3D[];       // per coin in layout.coins: move / hide these, then call updateCoins()
  updateCoins(): void;
}

export function buildCity(scene: THREE.Scene, world: World): CityView {
  const { level, layout } = world, LEN = level.length, R = level.roadHalf, WALK = level.walk;
  const city = new THREE.Group(); scene.add(city);
  const winTex = windowTexture();
  // vertex colours darken each building towards its base: a cheap stand-in for ambient occlusion
  const bldMats = BLD_COLORS.map(c => new THREE.MeshStandardMaterial({ color: c, map: winTex, roughness: .75, metalness: .02, vertexColors: true }));
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xfff8ea, roughness: .7 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x7d838f, roughness: .9 });
  const shopTex = shopTexture();
  const shopMats = SHOP_FRAMES.map(c => new THREE.MeshStandardMaterial({ color: c, map: shopTex, roughness: .35, metalness: .1 }));
  const awnMats = AWNING_COLS.map(c => new THREE.MeshStandardMaterial({ map: awningTexture(c), roughness: .8, side: THREE.DoubleSide }));
  const acMat = new THREE.MeshStandardMaterial({ color: 0xd9dde4, roughness: .5, metalness: .3 });
  const tankMat = new THREE.MeshStandardMaterial({ color: 0xa8714a, roughness: .85 });

  /* Static scenery is merged into one mesh per material: a few draw calls instead of hundreds. */
  const CHUNK = 150;               // metres of street per merged piece, so off-screen pieces are skipped
  const batches = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  const placer = new THREE.Object3D();
  function put(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rz = 0, group?: THREE.Object3D) {
    if (group) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.z = rz; m.receiveShadow = m.castShadow = true; group.add(m); return; }
    placer.position.set(x, y, z); placer.rotation.set(0, 0, rz); placer.updateMatrix();
    geo.applyMatrix4(placer.matrix);
    const key = mat.uuid + ':' + Math.floor(z / CHUNK);
    let b = batches.get(key); if (!b) batches.set(key, b = { mat, geos: [] });
    b.geos.push(geo);
  }
  // box with its texture tiled to size: one tile per (tx, ty) metres on the side faces
  function tiledBox(w: number, h: number, d: number, tx: number, ty: number) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv as THREE.BufferAttribute;
    const faceDims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      if (f === 2 || f === 3) { uv.setXY(k, .02, .95); continue; }
      uv.setXY(k, uv.getX(k) * Math.max(1, Math.round(faceDims[f][0] / tx)), uv.getY(k) * Math.max(1, Math.round(faceDims[f][1] / ty)));
    }
    return g;
  }
  function bodyGeo(w: number, h: number, d: number) {
    const g = tiledBox(w, h, d, 3.6, 3.2), pos = g.attributes.position, cols: number[] = [];
    for (let i = 0; i < pos.count; i++) { const v = pos.getY(i) < 0 ? .7 : 1; cols.push(v, v, v); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    return g;
  }
  function building(x: number, z: number, w: number, h: number, d: number, ci: number, group?: THREE.Object3D, roofProps = false) {
    put(bodyGeo(w, h, d), bldMats[ci % bldMats.length], x, h / 2, z, 0, group);
    put(new THREE.BoxGeometry(w + .5, .45, d + .5), trimMat, x, h + .22, z, 0, group);
    put(new THREE.BoxGeometry(w - .3, .12, d - .3), roofMat, x, h + .5, z, 0, group);
    if (!roofProps) return;
    const r = (ci * 7919 + Math.round(z * 13)) % 10;   // stable per building
    if (r < 3) put(new THREE.BoxGeometry(1.8, 1, 1.3), acMat, x + (r - 1) * w * .2, h + 1.05, z + d * .15);
    else if (r < 5) {
      put(new THREE.CylinderGeometry(1, 1, 1.8, 14), tankMat, x, h + 2.1, z - d * .2);
      put(new THREE.ConeGeometry(1.15, .7, 14), tankMat, x, h + 3.35, z - d * .2);
      put(new THREE.BoxGeometry(1.6, 1.2, 1.6), acMat, x, h + .65, z - d * .2);
    }
  }
  const block = (b: Block, props = false) => building(b.x, b.zc, b.w, b.h, b.d, b.colour, undefined, props);

  // shop fronts and awnings on the street side of the buildings beside the road
  function shopfront(b: SideBlock) {
    const faceX = b.x - b.side * b.w / 2, len = b.d - .8, k = (b.colour * 31 + Math.round(b.zc)) >>> 0;
    put(tiledBox(.3, 3, len, 4, 3), shopMats[k % shopMats.length], faceX - b.side * .1, 1.5, b.zc);
    if (k % 5 < 3) put(tiledBox(1.6, .06, len - .4, 1.6, 1), awnMats[k % awnMats.length], faceX - b.side * .75, 3.35, b.zc, b.side * .32);
  }
  // ground, road, pavements
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 2200), new THREE.MeshStandardMaterial({ color: 0x9ccf72, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.02, -LEN / 2); ground.receiveShadow = true; city.add(ground);
  // the street runs from behind the start area (level.behind) to the end of the course
  const SPAN = LEN + level.behind + 20, MID = (level.behind + 20 - LEN) / 2;
  const roadTex = roadTexture(); roadTex.repeat.set(1, SPAN / 14);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, SPAN), new THREE.MeshStandardMaterial({ map: roadTex, roughness: .85 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, MID); road.receiveShadow = true; city.add(road);
  const walkTex = walkTexture(); walkTex.repeat.set(1, SPAN / WALK);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(WALK, .24, SPAN), new THREE.MeshStandardMaterial({ map: walkTex, roughness: .9 }));
    w.position.set(s * (R + WALK / 2), .12, MID); w.receiveShadow = true; city.add(w);
    const kerb = new THREE.Mesh(new THREE.BoxGeometry(.25, .28, SPAN), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: .8 }));
    kerb.position.set(s * (R + .12), .14, MID); city.add(kerb);
  }

  layout.side.forEach(b => { block(b, true); shopfront(b); });
  layout.back.forEach(b => block(b, true));
  layout.skyline.forEach(b => block(b));
  for (const { mat, geos } of batches.values()) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.receiveShadow = true; m.castShadow = true; city.add(m);
    geos.forEach(g => g.dispose());
  }

  // soft dark band on the pavement where it meets the buildings (grounds them)
  const aoTex = canvasTex(64, 4, (c, w, h) => { const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(20,24,40,.55)'); g.addColorStop(1, 'rgba(20,24,40,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
  for (const s of [-1, 1]) {
    const ao = new THREE.Mesh(new THREE.PlaneGeometry(2.4, SPAN), new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false }));
    ao.rotation.x = -Math.PI / 2; if (s < 0) ao.rotation.z = Math.PI;
    ao.position.set(s * (layout.sideX - 1.2), .245, MID); city.add(ao);
  }

  // trees + lamps along the pavements (instanced)
  {
    const n = (Math.ceil((LEN + level.behind) / 16) + 2) * 2;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.14, .18, 1.6, 10), new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: .9 }), n);
    const crown = new THREE.InstancedMesh(new THREE.SphereGeometry(1.15, 12, 8), new THREE.MeshStandardMaterial({ color: 0x48b34a, roughness: .8 }), n);
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(.07, .09, 5.2, 10), new THREE.MeshStandardMaterial({ color: 0x3a4a6b, roughness: .4, metalness: .6 }), n);
    const bulb = new THREE.InstancedMesh(new THREE.SphereGeometry(.26, 8, 6), new THREE.MeshStandardMaterial({ color: 0xfff2c2, emissive: 0xffe08a, emissiveIntensity: 6 }), n);
    crown.castShadow = true;
    const m = new THREE.Matrix4(); let k = 0;
    for (let z = level.behind; z > -LEN; z -= 16) {
      for (const s of [-1, 1]) {
        const x = s * (R + WALK - .9), tz = z - (s > 0 ? 8 : 0);
        m.makeTranslation(x, 1.0, tz); trunk.setMatrixAt(k, m);
        m.makeTranslation(x, 2.4, tz); crown.setMatrixAt(k, m);
        m.makeTranslation(s * (R + .7), 2.6, tz - 4); pole.setMatrixAt(k, m);
        m.makeTranslation(s * (R + .7), 5.25, tz - 4); bulb.setMatrixAt(k, m);
        k++;
      }
    }
    for (const x of [trunk, crown, pole, bulb]) { x.count = k; x.frustumCulled = false; x.instanceMatrix.needsUpdate = true; city.add(x); }
  }

  // clouds
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xdfe9ff, emissiveIntensity: .35 });
  const sky = new THREE.Group();
  for (const c of layout.clouds) {
    const cl = new THREE.Group();
    for (const p of c.puffs) { const s = new THREE.Mesh(new THREE.SphereGeometry(p.r, 10, 7), cloudMat); s.position.set(p.x, p.y, p.z); s.scale.y = .6; cl.add(s); }
    cl.position.set(c.x, c.y, c.z); sky.add(cl);
  }
  scene.add(sky); mergeStatic(sky);

  // distance signs every 50 m (left pavement)
  const signs = new THREE.Group(); city.add(signs);
  for (let d = 50; d < LEN; d += 50) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 3, 10), new THREE.MeshStandardMaterial({ color: 0xdfe3ea, metalness: .6, roughness: .3 })); post.position.y = 1.5; g.add(post);
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, .9, .12), new THREE.MeshStandardMaterial({ map: signTexture(d + ' m', THEME.colors.blue, THEME.colors.sun), roughness: .5 }));
    b.position.y = 3.1; g.add(b); g.position.set(-(R + 1.6), .24, -d); g.rotation.y = .35; signs.add(g);
  }
  mergeStatic(signs);

  /* ---------- course: things across the road ---------- */
  const coneGeo = new THREE.LatheGeometry(([[0, .9], [.08, .88], [.3, .06], [.42, .06], [.42, 0], [0, 0]] as const).map(p => V2(p[0], p[1])), 24);
  function coneRow() {
    const g = new THREE.Group(), cm = paint(0xff6a13), wm = paint(0xffffff);
    for (let x = -R + .8; x <= R - .6; x += 1.35) {
      const c = new THREE.Mesh(coneGeo, cm); c.position.set(x, 0, 0); c.castShadow = true; g.add(c);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(.2, .25, .16, 24, 1, true), wm); r.position.set(x, .5, 0); g.add(r);
    }
    return g;
  }
  function toyCar(color: number) {
    const g = new THREE.Group(), p = paint(color);
    slab(g, [['m', -1.7, .35], ['q', -1.85, .7, -1.4, .75], ['l', -.7, .8], ['q', -.3, 1.35, .35, 1.35], ['q', 1.1, 1.35, 1.3, .8], ['l', 1.62, .75], ['q', 1.8, .6, 1.7, .35], ['l', -1.7, .35]], 1.7, .2, p);
    slab(g, [['m', -.55, .82], ['q', -.25, 1.25, .3, 1.25], ['q', .95, 1.25, 1.15, .82], ['l', -.55, .82]], 1.74, .03, MAT.glass());
    for (const s of [-1, 1]) for (const z of [-1.05, 1.05]) { const w = makeWheel(.36, .28, 0xdfe3ea, { seg: 14, spokes: 3 }); w.group.position.set(s * .8, .36, z); g.add(w.group); }
    g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    return g;
  }
  function carRow(jitter: number[]) {
    const g = new THREE.Group();
    layout.carRowXs.forEach((x, i) => { const c = toyCar(PARKED_COLS[i % PARKED_COLS.length]); c.rotation.y = Math.PI / 2 + jitter[i]; c.position.x = x; g.add(c); });
    return g;
  }
  function bus(gap: number) {
    const g = new THREE.Group(), Y = paint(0xffc21a), hg = level.busGapHalf;
    for (const x of [gap - hg - 4.4, gap + hg + 4.4]) {
      const b = new THREE.Group(); b.position.x = x; b.rotation.y = Math.PI / 2; g.add(b);
      rbox(b, 2.4, 2.8, 8.6, .45, Y, 0, 1.75, 0);
      rbox(b, 2.46, .9, 7.8, .2, MAT.glass(), 0, 2.35, 0);
      rbox(b, 2.5, .18, 8.62, .08, paint(0x1d1f24), 0, 1.35, 0);
      for (const s of [-1, 1]) for (const z of [-2.8, 2.6]) { const w = makeWheel(.5, .36, 0xdfe3ea, { seg: 16, spokes: 4 }); w.group.position.set(s * 1.15, .5, z); b.add(w.group); }
      b.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    }
    return g;
  }
  function blockAcross(o: CourseItem, i: number) {
    const group = new THREE.Group();
    const span = R + WALK + .4, gw = level.alleyWidth;
    const pieces = o.gap == null ? [[-span, span]] : [[-span, o.gap - gw / 2], [o.gap + gw / 2, span]];
    pieces.forEach(([x0, x1], j) => building((x0 + x1) / 2, 0, x1 - x0, o.h, o.d, i * 3 + j, group));
    const [bg, fg] = SIGN_COLS[i % SIGN_COLS.length];
    const sw = Math.min(12, o.h * 1.1 + 4);
    const sg = new THREE.Mesh(new THREE.BoxGeometry(sw, Math.min(3, 1.4 + o.h * .06), .3), new THREE.MeshStandardMaterial({ map: signTexture(o.sign ?? '', bg, fg), roughness: .5, emissive: 0x222222 }));
    sg.position.set(o.gap == null ? 0 : (o.gap < 0 ? 3.5 : -3.5), o.h + 1.6 + o.h * .03, o.d / 2 - .3); group.add(sg);
    for (const s of [-1, 1]) { const pp = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 1.4, 8), MAT.chrome()); pp.position.set(sg.position.x + s * sw * .35, o.h + .7, o.d / 2 - .3); group.add(pp); }
    if (o.gap != null) {  // a little arch over the alley so kids can see it's a way through
      const arch = new THREE.Mesh(new THREE.TorusGeometry(gw / 2, .18, 10, 24, Math.PI), paint(0xffd21f)); arch.position.set(o.gap, 3.4, o.d / 2 + .05); group.add(arch);
    }
    return group;
  }
  const obstacles = level.course.map((o, i) => {
    const g = o.kind === 'cones' ? coneRow() : o.kind === 'cars' ? carRow(layout.carJitter[i]) : o.kind === 'bus' ? bus(o.gap ?? 0) : blockAcross(o, i);
    g.position.z = -(o.z + o.d / 2);
    city.add(g); mergeStatic(g);
    return g;
  });

  /* ---------- coins ---------- */
  const coinGeo = new THREE.CylinderGeometry(.55, .55, .14, 18), coinMat = paint(0xffc21a, { metalness: .95, roughness: .18, emissive: 0x7a4a00, emissiveIntensity: .6 });
  const coinRim = new THREE.TorusGeometry(.55, .05, 5, 18).toNonIndexed();
  coinRim.deleteAttribute('uv'); const face = coinGeo.toNonIndexed(); face.deleteAttribute('uv');
  const coinShape = mergeGeometries([face, coinRim]); coinShape.rotateX(Math.PI / 2);
  const coinMesh = new THREE.InstancedMesh(coinShape, coinMat, layout.coins.length);
  coinMesh.frustumCulled = false; scene.add(coinMesh);
  const coins = layout.coins.map(c => { const g = new THREE.Object3D(); g.position.set(c.x, c.y, c.z); return g; });
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  function updateCoins() {
    coins.forEach((c, i) => { if (c.visible) { c.updateMatrix(); coinMesh.setMatrixAt(i, c.matrix); } else coinMesh.setMatrixAt(i, hidden); });
    coinMesh.instanceMatrix.needsUpdate = true;
  }
  updateCoins();

  return { obstacles, coins, updateCoins };
}
