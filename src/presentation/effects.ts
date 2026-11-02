import * as THREE from 'three';
import type { Part } from '../rules/collisions';
import { V3 } from './cars/kit';
import { stretch } from './catapult';

/* Puffs, stars, sparks, building chunks and the lightning bolt. Purely visual. */
export type ParticleKind = 'dust' | 'star' | 'spark' | 'chunk';

interface Particle { mesh: THREE.Mesh; v: THREE.Vector3; life: number; max: number; kind: ParticleKind }

export class Effects {
  private parts: Particle[] = [];
  private puffGeo = new THREE.SphereGeometry(1, 12, 8);
  private starGeo = new THREE.OctahedronGeometry(.25);
  private boltMat = new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  private bolt: { g: THREE.Group; t: number } | null = null;
  shake = 0;

  constructor(private scene: THREE.Scene) {}

  spawn(kind: ParticleKind, pos: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) {
      const mat = kind === 'dust' ? new THREE.MeshLambertMaterial({ color: 0xe8e2d4, transparent: true, opacity: .8, depthWrite: false })
        : kind === 'star' ? new THREE.MeshBasicMaterial({ color: [0xffd21f, 0xffffff, 0xff7a1a][i % 3], transparent: true })
        : kind === 'spark' ? new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
        : new THREE.MeshStandardMaterial({ color: [0xff8a65, 0xffc94d, 0x7fc8f8][i % 3], roughness: .7, transparent: true });
      const m = new THREE.Mesh(kind === 'dust' ? this.puffGeo : this.starGeo, mat); m.position.copy(pos);
      const a = Math.random() * Math.PI * 2, up = kind === 'dust' ? .5 + Math.random() : 3 + Math.random() * 5;
      const sp = kind === 'dust' ? 2 + Math.random() * 2 : 4 + Math.random() * 6;
      if (kind === 'dust') m.scale.setScalar(.4 + Math.random() * .4);
      this.scene.add(m);
      this.parts.push({ mesh: m, v: V3(Math.cos(a) * sp, up, Math.sin(a) * sp), life: 0, max: kind === 'dust' ? 1.0 : 1.2, kind });
    }
  }

  /* Debris flying out of a smashed obstacle. */
  burst(part: Part) {
    const c = V3((part.x0 + part.x1) / 2, Math.min(part.h, 8) * .5, -(part.z0 + part.z1) / 2);
    for (let i = 0; i < 3; i++) this.spawn('chunk', V3(c.x + (i - 1) * 4, c.y + i, c.z), 12);
  }

  /* A jagged bolt from the sky onto the target. */
  lightning(target: Part, carX: number) {
    const tx = target.kind === 'bld' ? Math.max(target.x0 + 1, Math.min(target.x1 - 1, carX)) : (target.x0 + target.x1) / 2;
    const top = V3(tx + 6, 70, -target.z0 - 8), end = V3(tx, target.h, -target.z0);
    const g = new THREE.Group();
    let prev = top.clone();
    for (let i = 1; i <= 9; i++) {
      const p = top.clone().lerp(end, i / 9);
      if (i < 9) { p.x += (Math.random() - .5) * 5; p.z += (Math.random() - .5) * 3; }
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 1, 6), this.boltMat); stretch(seg, prev, p); g.add(seg); prev = p;
    }
    this.scene.add(g); this.bolt = { g, t: 0 };
    this.spawn('spark', end, 30);
  }

  tick(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i], m = p.mesh; p.life += dt;
      if (p.kind !== 'dust') p.v.y -= 14 * dt;
      m.position.addScaledVector(p.v, dt);
      if (p.kind === 'dust') m.scale.multiplyScalar(1 + dt * 1.6);
      else { m.rotation.x += dt * 6; m.rotation.y += dt * 5; }
      const mat = m.material as THREE.Material;
      mat.opacity = Math.max(0, 1 - p.life / p.max);
      if (p.life > p.max) { this.scene.remove(m); mat.dispose(); this.parts.splice(i, 1); }
    }
    if (this.bolt) {
      this.bolt.t += dt;
      this.boltMat.opacity = Math.max(0, 1 - this.bolt.t / .6) * (Math.random() < .5 ? 1 : .5);
      if (this.bolt.t > .6) {
        this.scene.remove(this.bolt.g);
        this.bolt.g.traverse(o => (o as THREE.Mesh).geometry?.dispose());
        this.bolt = null;
      }
    }
    this.shake = Math.max(0, this.shake - dt);
  }
}
