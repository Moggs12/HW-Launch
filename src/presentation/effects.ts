import * as THREE from 'three';
import type { Part } from '../rules/collisions';
import { V3 } from './cars/kit';
import { stretch } from './catapult';

/* Puffs, stars, sparks, building chunks and the lightning bolt. Purely visual.
   Every mesh and material is pooled: nothing is created or disposed per launch,
   so many launches in a row never grow memory. */
export type ParticleKind = 'dust' | 'star' | 'spark' | 'chunk';

interface Particle { mesh: THREE.Mesh; mat: THREE.Material & { opacity: number }; v: THREE.Vector3; life: number; max: number; kind: ParticleKind; grow: number }

const STAR_COLS = [0xffd21f, 0xffffff, 0xff7a1a];
const CHUNK_COLS = [0xff8a65, 0xffc94d, 0x7fc8f8];
const MAX_LIVE = 260;            // hard cap so a pile-up of events can't flood the scene
const BOLT_SEGS = 9;

export class Effects {
  private live: Particle[] = [];
  private free: Record<ParticleKind, Particle[]> = { dust: [], star: [], spark: [], chunk: [] };
  private puffGeo = new THREE.SphereGeometry(1, 12, 8);
  private starGeo = new THREE.OctahedronGeometry(.25);
  private boltGeo = new THREE.CylinderGeometry(.35, .35, 1, 6);
  private boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xcfeaff).multiplyScalar(10), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  private boltG = new THREE.Group();
  private boltT = -1;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpC = new THREE.Vector3();
  shake = 0;

  constructor(private scene: THREE.Scene) {
    for (let i = 0; i < BOLT_SEGS; i++) {
      const seg = new THREE.Mesh(this.boltGeo, this.boltMat);
      this.boltG.add(seg);
    }
    this.boltG.visible = false;
    scene.add(this.boltG);
  }

  private make(kind: ParticleKind): Particle {
    const mat = kind === 'dust' ? new THREE.MeshLambertMaterial({ color: 0xe8e2d4, transparent: true, opacity: .8, depthWrite: false })
      : kind === 'star' ? new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })
      : kind === 'spark' ? new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fd8ff).multiplyScalar(8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
      : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .7, transparent: true });
    const mesh = new THREE.Mesh(kind === 'dust' ? this.puffGeo : this.starGeo, mat);
    mesh.visible = false;
    this.scene.add(mesh);
    return { mesh, mat, v: new THREE.Vector3(), life: 0, max: 1, kind, grow: 0 };
  }

  spawn(kind: ParticleKind, pos: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) {
      if (this.live.length >= MAX_LIVE) this.release(0);
      const p = this.free[kind].pop() ?? this.make(kind), m = p.mesh;
      if (kind === 'star') (p.mat as THREE.MeshBasicMaterial).color.setHex(STAR_COLS[i % 3]);
      else if (kind === 'chunk') (p.mat as THREE.MeshStandardMaterial).color.setHex(CHUNK_COLS[i % 3]);
      const a = Math.random() * Math.PI * 2, up = kind === 'dust' ? .5 + Math.random() : 3 + Math.random() * 5;
      const sp = kind === 'dust' ? 2 + Math.random() * 2 : 4 + Math.random() * 6;
      m.position.copy(pos);
      m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      m.scale.setScalar(kind === 'dust' ? .4 + Math.random() * .4 : 1);
      m.visible = true;
      p.v.set(Math.cos(a) * sp, up, Math.sin(a) * sp);
      p.life = 0; p.max = kind === 'dust' ? 1.0 : 1.2;
      p.grow = m.scale.x;
      p.mat.opacity = kind === 'dust' ? .8 : 1;
      this.live.push(p);
    }
  }

  private release(i: number) {
    const p = this.live[i];
    p.mesh.visible = false;
    this.free[p.kind].push(p);
    const last = this.live.pop()!;
    if (i < this.live.length) this.live[i] = last;
  }

  /* Debris flying out of a smashed obstacle. */
  burst(part: Part) {
    if (!part) return;
    const cx = (part.x0 + part.x1) / 2, cy = Math.min(part.h, 8) * .5, cz = -(part.z0 + part.z1) / 2;
    for (let i = 0; i < 3; i++) this.spawn('chunk', this.tmpC.set(cx + (i - 1) * 4, cy + i, cz), 12);
  }

  /* A jagged bolt from the sky onto the target. */
  lightning(target: Part, carX: number) {
    const tx = target.kind === 'bld' ? Math.max(target.x0 + 1, Math.min(target.x1 - 1, carX)) : (target.x0 + target.x1) / 2;
    const top = V3(tx + 6, 70, -target.z0 - 8), end = V3(tx, target.h, -target.z0);
    const prev = this.tmpA.copy(top), p = this.tmpB;
    for (let i = 1; i <= BOLT_SEGS; i++) {
      p.copy(top).lerp(end, i / BOLT_SEGS);
      if (i < BOLT_SEGS) { p.x += (Math.random() - .5) * 5; p.z += (Math.random() - .5) * 3; }
      stretch(this.boltG.children[i - 1], prev, p); prev.copy(p);
    }
    this.boltG.visible = true; this.boltT = 0; this.boltMat.opacity = 1;
    this.spawn('spark', end, 30);
  }

  tick(dt: number) {
    const fade = Math.exp(-1.6 * dt);
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i], m = p.mesh; p.life += dt;
      if (p.life > p.max) { this.release(i); continue; }
      if (p.kind !== 'dust') { p.v.y -= 14 * dt; m.rotation.x += dt * 6; m.rotation.y += dt * 5; }
      else { p.v.multiplyScalar(fade); p.grow *= 1 + dt * 1.6; m.scale.setScalar(p.grow); }
      m.position.addScaledVector(p.v, dt);
      if (m.position.y < .05 && p.kind !== 'dust') { m.position.y = .05; p.v.y *= -.35; p.v.x *= .7; p.v.z *= .7; }
      const t = p.life / p.max;
      p.mat.opacity = (p.kind === 'dust' ? .8 : 1) * (1 - t * t);
    }
    if (this.boltT >= 0) {
      this.boltT += dt;
      this.boltMat.opacity = Math.max(0, 1 - this.boltT / .6) * (Math.random() < .5 ? 1 : .5);
      if (this.boltT > .6) { this.boltG.visible = false; this.boltT = -1; }
    }
    this.shake = Math.max(0, this.shake - dt);
  }

  /* hide everything at once, e.g. when a new launch is set up */
  clear() {
    for (let i = this.live.length - 1; i >= 0; i--) this.release(i);
    this.boltG.visible = false; this.boltT = -1; this.shake = 0;
  }
}
