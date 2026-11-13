import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CourseItem } from '../content/level';
import { THEME } from '../content/theme';
import type { Block, SideBlock } from '../rules/layout';
import type { World } from '../rules/run';
import { MAT, V2, makeWheel, mergeStatic, paint, rbox, slab } from './cars/kit';
import { awningTexture, canvasTex, roadTexture, shopTextures, signTexture, tintWalls, walkTexture, windowTextures } from './textures';

/* Draws the toy city from the level data and its layout. No game decisions here. */

// bold toy-box colours; each building's cornice uses a contrasting trim (TRIM_FOR picks it)
const BLD_COLORS = [0xff4a2e, 0xffc414, 0x2f8cff, 0x5fcf3a, 0x9b5cff, 0xff5fa8, 0x14c2b0, 0xff8a14, 0xfff3dc, 0x4f6dff];
const TRIMS = [0xffffff, 0xffd21f, 0xe8231c, 0x1440c4];
const TRIM_FOR = [1, 3, 1, 0, 1, 3, 0, 3, 2, 1];
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
  const win = windowTextures();
  // vertex colours darken each building towards its base: a cheap stand-in for ambient occlusion.
  // Only the wall takes the colour (tintWalls), so windows stay glossy blue.
  const bldMats = BLD_COLORS.map(c => tintWalls(new THREE.MeshStandardMaterial({ color: c, map: win.map, alphaMap: win.mask, roughness: .55, metalness: .02, vertexColors: true })));
  const trimMats = TRIMS.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .45 }));
  const ledgeMat = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: .6 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x7d838f, roughness: .9 });
  const shop = shopTextures();
  const shopMats = SHOP_FRAMES.map(c => tintWalls(new THREE.MeshStandardMaterial({ color: c, map: shop.map, alphaMap: shop.mask, roughness: .35, metalness: .1 })));
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
    const c = ci % bldMats.length, trim = trimMats[TRIM_FOR[c]];
    put(bodyGeo(w, h, d), bldMats[c], x, h / 2, z, 0, group);
    // chunky layered cornice in a contrasting colour, a slim ledge under it, a band over the ground floor
    put(new THREE.BoxGeometry(w + .35, .3, d + .35), ledgeMat, x, h - .15, z, 0, group);
    put(new THREE.BoxGeometry(w + .9, .75, d + .9), trim, x, h + .37, z, 0, group);
    put(new THREE.BoxGeometry(w + .5, .25, d + .5), trim, x, h + .87, z, 0, group);
    if (h > 7) put(new THREE.BoxGeometry(w + .3, .45, d + .3), trim, x, 3.85, z, 0, group);
    put(new THREE.BoxGeometry(w - .3, .12, d - .3), roofMat, x, h + 1.0, z, 0, group);
    if (!roofProps) return;
    const r = (ci * 7919 + Math.round(z * 13)) % 10;   // stable per building
    if (r < 3) put(new THREE.BoxGeometry(1.8, 1, 1.3), acMat, x + (r - 1) * w * .2, h + 1.55, z + d * .15);
    else if (r < 5) {
      put(new THREE.CylinderGeometry(1, 1, 1.8, 14), tankMat, x, h + 2.6, z - d * .2);
      put(new THREE.ConeGeometry(1.15, .7, 14), tankMat, x, h + 3.85, z - d * .2);
      put(new THREE.BoxGeometry(1.6, 1.2, 1.6), acMat, x, h + 1.15, z - d * .2);
    }
  }
  const block = (b: Block, props = false) => building(b.x, b.zc, b.w, b.h, b.d, b.colour, undefined, props);

  // shop fronts and awnings on the street side of the buildings beside the road
  function shopfront(b: SideBlock) {
    const faceX = b.x - b.side * b.w / 2, len = b.d - .8, k = (b.colour * 31 + Math.round(b.zc)) >>> 0;
    put(tiledBox(.3, 3, len, 4, 3), shopMats[k % shopMats.length], faceX - b.side * .1, 1.5, b.zc);
    if (k % 5 < 3) put(awningGeo(1.6, .06, len - .4), awnMats[k % awnMats.length], faceX - b.side * .75, 3.35, b.zc, b.side * .32);
  }
  // awning slab: stripes run out from the wall, repeating along the street, on the top and underside too
  function awningGeo(w: number, h: number, d: number) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv as THREE.BufferAttribute, pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getZ(i) + d / 2) / 2.4, .5);
    return g;
  }
  // ground, road, pavements
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 2200), new THREE.MeshStandardMaterial({ color: 0x9ccf72, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.02, -LEN / 2); ground.receiveShadow = true; city.add(ground);
  // the street runs from behind the start area (level.behind) to the end of the course
  const SPAN = LEN + level.behind + 20, MID = (level.behind + 20 - LEN) / 2;
  const roadTex = roadTexture(); roadTex.repeat.set(1, SPAN / 14);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, SPAN), new THREE.MeshStandardMaterial({ map: roadTex, roughness: .85 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, MID); road.receiveShadow = true; city.add(road);
  // the pavement runs right up to the building line (layout.sideX) so no grass strip shows at their feet
  const PAVE = layout.sideX - R;
  const walkTex = walkTexture(); walkTex.repeat.set(1, SPAN / PAVE);
  const walkMat = new THREE.MeshStandardMaterial({ map: walkTex, roughness: .9 }), kerbMat = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: .8 });
  const walkGeo = new THREE.BoxGeometry(PAVE, .24, SPAN), kerbGeo = new THREE.BoxGeometry(.27, .28, SPAN);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(walkGeo, walkMat);
    w.position.set(s * (R + PAVE / 2), .12, MID); w.receiveShadow = true; city.add(w);
    // kerb pokes 1 cm out past the pavement edge so their road-facing sides are not coplanar
    const kerb = new THREE.Mesh(kerbGeo, kerbMat);
    kerb.position.set(s * (R + .125), .14, MID); city.add(kerb);
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
  const aoMat = new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  const aoGeo = new THREE.PlaneGeometry(2.4, SPAN);
  for (const s of [-1, 1]) {
    // texture is dark at u = 0 (local -x); turn it so the dark edge sits against the buildings
    const ao = new THREE.Mesh(aoGeo, aoMat);
    ao.rotation.x = -Math.PI / 2; if (s > 0) ao.rotation.z = Math.PI;
    ao.position.set(s * (layout.sideX - 1.2), .245, MID); city.add(ao);
  }

  // street furniture must not stand inside the buildings that cross the road
  const acrossBlds = level.course.filter(o => o.kind === 'bld');
  const underBuilding = (dist: number, margin: number) => acrossBlds.some(o => dist > o.z - margin && dist < o.z + o.d + margin);

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
        if (underBuilding(-tz, 1.3) || underBuilding(4 - tz, .4)) continue;   // would poke out of a building across the road
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
    if (underBuilding(d, 1.3)) continue;
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
    const g = new THREE.Group(), xs = layout.carRowXs;
    g.position.x = -(xs[0] + xs[xs.length - 1]) / 2;   // centre the row so neither kerb end looks like a way round
    // parked side-on, bumper to bumper: the row is a solid wall in the rules, so it must not show gaps,
    // and side-on (1.7 m deep) matches its 2.2 m collision depth where nose-on (3.4 m) overhung it
    layout.carRowXs.forEach((x, i) => { const c = toyCar(PARKED_COLS[i % PARKED_COLS.length]); c.rotation.y = (i % 2 ? Math.PI : 0) + jitter[i] * .5; c.position.x = x; g.add(c); });
    return g;
  }
  function bus(gap: number) {
    const g = new THREE.Group(), Y = paint(0xffc21a), hg = level.busGapHalf;
    // buses are 8.6 m long: their inner ends sit exactly on the rules' gap edges (gap ± busGapHalf)
    for (const x of [gap - hg - 4.3, gap + hg + 4.3]) {
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
    // rooftop sign over the wider piece, kept off the alley so its posts stand on the roof, not on air
    const [bg, fg] = SIGN_COLS[i % SIGN_COLS.length];
    const [px0, px1] = pieces.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
    const sw = Math.min(12, o.h * 1.1 + 4, px1 - px0 - .6), sh = Math.min(3, 1.4 + o.h * .06);
    const sx = THREE.MathUtils.clamp(0, px0 + sw / 2 + .3, px1 - sw / 2 - .3);
    const sy = o.h + 1.6 + o.h * .03, roofTop = o.h + 1.0, postLen = sy - sh / 2 - roofTop + .3;
    const sg = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, .3), new THREE.MeshStandardMaterial({ map: signTexture(o.sign ?? '', bg, fg), roughness: .5, emissive: 0x222222 }));
    sg.position.set(sx, sy, o.d / 2 - .3); group.add(sg);
    for (const s of [-1, 1]) { const pp = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, postLen, 8), MAT.chrome()); pp.position.set(sx + s * sw * .35, roofTop - .1 + postLen / 2, o.d / 2 - .3); group.add(pp); }
    if (o.gap != null) {  // a yellow gateway round the alley mouth so kids can see it's a way through
      const r = gw / 2 + .18, gate = paint(0xffd21f), fz = o.d / 2 + .25;
      const arch = new THREE.Mesh(new THREE.TorusGeometry(r, .18, 10, 24, Math.PI), gate); arch.position.set(o.gap, 3.4, fz); group.add(arch);
      for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.18, .2, 3.4, 12), gate); leg.position.set(o.gap + s * r, 1.7, fz); group.add(leg); }
    }
    return group;
  }
  const obstacles = level.course.map((o, i) => {
    const g = o.kind === 'cones' ? coneRow() : o.kind === 'cars' ? carRow(layout.carJitter[i]) : o.kind === 'bus' ? bus(o.gap ?? 0) : blockAcross(o, i);
    g.position.z = -(o.z + o.d / 2);
    city.add(g); mergeStatic(g);
    return g;
  });

  // green "go" arrows painted on the road in front of each bus gap and alley: one merged mesh, one draw call
  {
    const arrows: THREE.BufferGeometry[] = [];
    level.course.forEach(o => {
      if (o.gap == null || (o.kind !== 'bus' && o.kind !== 'bld')) return;
      const gapW = o.kind === 'bus' ? level.busGapHalf * 2 : level.alleyWidth;
      const a = new THREE.PlaneGeometry(1, 1.5); a.rotateX(-Math.PI / 2); a.scale(Math.min(2.4, gapW * .8), 1, 2.4);
      a.translate(o.gap, .02, -(o.z - 2.6)); arrows.push(a);
    });
    if (arrows.length) {
      const tex = canvasTex(128, 192, (c, w, h) => {
        c.lineJoin = 'round';
        const path = () => { c.beginPath(); c.moveTo(w / 2, 10); c.lineTo(w - 10, 78); c.lineTo(w * .7, 78); c.lineTo(w * .7, h - 10); c.lineTo(w * .3, h - 10); c.lineTo(w * .3, 78); c.lineTo(10, 78); c.closePath(); };
        path(); c.fillStyle = '#2fd24a'; c.fill(); c.strokeStyle = '#ffffff'; c.lineWidth = 8; c.stroke();
      });
      const m = new THREE.Mesh(mergeGeometries(arrows), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
      m.renderOrder = 1; city.add(m);
      arrows.forEach(g => g.dispose());
    }
  }

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
