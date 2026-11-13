import * as THREE from 'three';
import type { RampDef } from '../content/level';
import { THEME } from '../content/theme';
import { rampPoint, rampProfile, type RampGeo } from '../rules/ramp';
import { MAT, orient, paint, rbox, slab, tube, V3, type Cmd, type P3 } from './cars/kit';
import { canvasTex } from './textures';

/* The big launch ramp: a red curved kicker with yellow rails, chevrons and a chequered lip. */
const hex = (css: string) => parseInt(css.slice(1), 16);

export function buildRamp(scene: THREE.Scene, g: RampGeo, def: RampDef) {
  const grp = new THREE.Group(); scene.add(grp);
  const W = def.width, prof = rampProfile(g, 28);

  // solid wedge: top surface, straight down at the lip, back along the ground
  const cmds: Cmd[] = [['m', prof[0].z, -.02]];
  for (const p of prof) cmds.push(['l', p.z, p.y]);
  cmds.push(['l', 0, -.02], ['l', prof[0].z, -.02]);
  // the profile faces (the ramp's sides) get a blue steel lattice, the top a deep glossy red
  const wedge = slab(grp, cmds, W, .04, paint(0xd0120b, { clearcoat: .5, roughness: .4 }));
  const lattice = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#0a1c5c'; c.fillRect(0, 0, w, h);
    c.lineCap = 'round';
    const beam = (x0: number, y0: number, x1: number, y1: number, wd: number) => {
      c.strokeStyle = '#0c2f9e'; c.lineWidth = wd + 8; c.beginPath(); c.moveTo(x0, y0 + 4); c.lineTo(x1, y1 + 4); c.stroke();
      c.strokeStyle = '#2a6bff'; c.lineWidth = wd; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 4; c.beginPath(); c.moveTo(x0, y0 - wd / 3); c.lineTo(x1, y1 - wd / 3); c.stroke();
    };
    beam(10, 10, w - 10, h - 10, 20); beam(w - 10, 10, 10, h - 10, 20);
    beam(0, 12, w, 12, 26); beam(0, h - 12, w, h - 12, 26); beam(12, 0, 12, h, 26); beam(w - 12, 0, w - 12, h, 26);
    c.fillStyle = '#ffd21f';
    for (const [x, y] of [[12, 12], [w - 12, 12], [12, h - 12], [w - 12, h - 12], [w / 2, h / 2]]) { c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill(); }
  }, true);
  lattice.repeat.set(1 / 2.4, 1 / 2.4);
  const inner = wedge.children[0] as THREE.Mesh;
  inner.material = [new THREE.MeshStandardMaterial({ map: lattice, roughness: .45, metalness: .3 }), inner.material as THREE.Material];

  // a darker driving lane down the middle
  const lane: Cmd[] = [['m', prof[0].z, .01]];
  for (const p of prof) lane.push(['l', p.z, p.y + .03]);
  for (let i = prof.length - 1; i >= 0; i--) lane.push(['l', prof[i].z, Math.max(.01, prof[i].y - .2)]);
  slab(grp, lane, 3.2, 0, paint(0x9e0d08, { clearcoat: .4, roughness: .5 }));

  // side rails following the curve, on little posts
  const railMat = paint(hex(THEME.colors.sun));
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - .15);
    tube(grp, prof.map(p => [x, p.y + .45, p.z] as P3), .14, railMat);
    for (let i = 0; i < prof.length; i += 4) {
      const p = prof[i];
      rbox(grp, .08, .45, .08, .02, MAT.chrome(), x, p.y + .22, p.z);
    }
  }

  // chevrons on the run-up pointing at the lip
  for (let i = 0; i < 3; i++) {
    const s = g.run * (.15 + i * .25), p = rampPoint(g, s);
    const ch = slab(grp, [['m', 0, 0], ['l', .6, .5], ['l', 0, 1.0], ['l', -.3, 1.0], ['l', .3, .5], ['l', -.3, 0], ['l', 0, 0]], .03, 0, railMat, 0, p.y + .03, p.z);
    orient(ch, V3(0, 0, -1), V3(1, 0, 0), V3(0, 1, 0)); ch.scale.setScalar(1.3);
  }

  // chequered strip on the lip
  const chk = canvasTex(256, 32, (c, w, h) => {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#ffffff' : '#11131a'; c.fillRect(i * w / 16, j * h / 2, w / 16, h / 2); }
  });
  const lip = new THREE.Mesh(new THREE.BoxGeometry(W, .05, .7), new THREE.MeshStandardMaterial({ map: chk, roughness: .6 }));
  const lp = rampPoint(g, g.length - .35);
  lip.position.set(0, lp.y + .04, lp.z); lip.rotation.x = lp.pitch; grp.add(lip);

  // blue trim along the bottom edges
  for (const s of [-1, 1]) rbox(grp, .12, .3, g.startZ, .04, paint(hex(THEME.colors.blue)), s * (W / 2 + .02), .15, g.startZ / 2);

  grp.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return grp;
}
