import * as THREE from 'three';
import { CARS } from '../content/cars';
import type { LevelDef } from '../content/level';
import { SPECIALS } from '../content/specials';
import { MAX_LEVEL, UPGRADES } from '../content/upgrades';
import { AIM, canLaunch, pullFromDrag } from '../rules/aim';
import { buyUpgrade, recordRun, runReward, unlockNext } from '../rules/economy';
import { PHYSICS, makeShot, stepShot } from '../rules/physics';
import { Run, STEP, buildWorld, type World } from '../rules/run';
import { freshSave, writeSave, type SaveData, type Storage } from '../rules/save';
import { ChaseCamera } from './camera';
import { V3 } from './cars/kit';
import { buildCar, type CarModel } from './cars/models';
import { fitUpgrades } from './cars/upgradeParts';
import { Catapult } from './catapult';
import { buildCity, type CityView } from './city';
import { Effects } from './effects';
import { createStage, followWithSun, type Stage3D } from './scene';
import { Screens } from './screens';
import { setMaxAnisotropy } from './textures';

/* Glue: input -> rules -> 3D + screens. Owns the aim / pull / fly / result loop. */
type State = 'aim' | 'pulling' | 'flying' | 'result';

const PREDICT_DOTS = 36;
const END_PAUSE = { crash: .9, stop: .6 };

export class Game {
  private st: Stage3D;
  private cam: ChaseCamera;
  private world: World;
  private city: CityView;
  private catapult: Catapult;
  private fx: Effects;
  private screens: Screens;
  private dots: THREE.InstancedMesh;
  private clock = new THREE.Clock();

  private state: State = 'aim';
  private carIdx = 0;
  private car!: CarModel;
  private carRear = 2.2;
  private pull = { power: 0, heading: 0 };
  private drag: { x: number; y: number; id: number } | null = null;
  private run: Run | null = null;
  private inp = { boost: false };
  private acc = 0;
  private endT = 0;

  constructor(private stage: HTMLElement, canvas: HTMLCanvasElement, level: LevelDef,
              private save: SaveData, private store: Storage) {
    this.st = createStage(canvas);
    setMaxAnisotropy(this.st.renderer.capabilities.getMaxAnisotropy());
    this.cam = new ChaseCamera(this.st.camera);
    this.world = buildWorld(level);
    this.city = buildCity(this.st.scene, this.world);
    this.catapult = new Catapult(this.st.scene);
    this.fx = new Effects(this.st.scene);
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(.14, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9 }), PREDICT_DOTS);
    this.dots.count = 0; this.st.scene.add(this.dots);

    this.screens = new Screens({
      buy: key => {
        if (!buyUpgrade(this.save, this.carIdx, key)) return;
        this.persist(); fitUpgrades(this.car, this.save.levels[this.carIdx], CARS[this.carIdx].accent); this.refreshAll();
      },
      pickCar: i => { this.save.car = i; this.persist(); this.loadCar(i); this.refreshAll(); },
      unlock: () => {
        if (!unlockNext(this.save)) return;
        this.persist(); this.loadCar(this.save.car); this.refreshAll();
        this.fx.spawn('star', V3(0, 2, 0), 30);
      },
      testCoins: () => { this.save.coins += 1000; this.persist(); this.refreshAll(); },
      testMax: () => {
        for (const u of UPGRADES) this.save.levels[this.carIdx][u.key] = MAX_LEVEL;
        this.persist(); fitUpgrades(this.car, this.save.levels[this.carIdx], CARS[this.carIdx].accent); this.refreshAll();
      },
      testReset: () => { this.save = freshSave(); this.persist(); this.loadCar(0); this.refreshAll(); },
    });

    this.bindInput(canvas);
    new ResizeObserver(() => this.resize()).observe(stage); this.resize();
    this.loadCar(Math.min(save.car, save.unlocked - 1));
    this.screens.doneLoading();
    this.frame();
  }

  private persist() { writeSave(this.store, this.save); }
  private refreshAll() {
    this.screens.hud(this.save, this.carIdx);
    if (this.screens.garageOpen) this.screens.renderGarage(this.save, this.carIdx);
  }

  private loadCar(i: number) {
    if (this.car) this.st.scene.remove(this.car.group);
    this.carIdx = i;
    this.car = buildCar(CARS[i].model);
    this.st.scene.add(this.car.group);
    fitUpgrades(this.car, this.save.levels[i], CARS[i].accent);
    this.car.group.updateMatrixWorld(true);
    this.carRear = new THREE.Box3().setFromObject(this.car.group).max.z;
    this.resetShot();
    this.screens.hud(this.save, i);
  }

  private resetShot() {
    this.state = 'aim'; this.run = null; this.pull = { power: 0, heading: 0 }; this.inp.boost = false;
    this.car.group.position.set(0, 0, 0); this.car.group.rotation.set(0, 0, 0);
    this.city.obstacles.forEach(o => { o.visible = true; });
    this.city.coins.forEach(c => { c.visible = true; });
    this.dots.count = 0;
    this.car.boostFlames.forEach(f => { f.visible = false; });
    this.car.burnFlames.forEach(f => { f.visible = false; });
    this.updateCatapult();
    this.screens.aiming();
    this.cam.snap();
  }

  private updateCatapult() {
    const launched = this.state === 'flying' || this.state === 'result';
    this.catapult.update(this.car.group.position, this.car.group.rotation.y, this.carRear, launched);
  }

  /* dotted arc showing where a launch would go (ignores obstacles) */
  private predict() {
    const car = CARS[this.carIdx];
    const s = makeShot(car, this.save.levels[this.carIdx], SPECIALS[car.special].effect, this.pull.power, this.pull.heading);
    const m = new THREE.Matrix4(); let k = 0;
    for (let i = 0; i < 360 && k < PREDICT_DOTS; i++) {
      stepShot(s, 1 / 60, null);
      if (i % 5 === 0) { m.makeTranslation(s.x, s.y + .6, s.z); this.dots.setMatrixAt(k++, m); }
      if (s.mode !== 'air') break;
    }
    this.dots.count = k; this.dots.instanceMatrix.needsUpdate = true;
  }

  /* ---------- input ---------- */
  private bindInput(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', e => {
      if (this.state !== 'aim' || this.screens.garageOpen) return;
      this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; canvas.setPointerCapture(e.pointerId);
      this.state = 'pulling'; this.screens.pulling();
    });
    canvas.addEventListener('pointermove', e => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      this.pull = pullFromDrag(e.clientX - this.drag.x, e.clientY - this.drag.y, this.stage.clientWidth, this.stage.clientHeight);
      const back = this.pull.power * AIM.pullBack;
      this.car.group.position.set(Math.sin(this.pull.heading) * back, 0, Math.cos(this.pull.heading) * back);
      this.car.group.rotation.y = this.pull.heading;
      this.updateCatapult(); this.predict();
      this.screens.power(this.pull.power);
    });
    const release = () => {
      if (!this.drag) return;
      this.drag = null;
      if (!canLaunch(this.pull.power)) { this.resetShot(); return; }
      this.launch();
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    const boost = document.getElementById('boostBtn')!;
    const on = (e: PointerEvent) => { e.preventDefault(); boost.setPointerCapture?.(e.pointerId); this.inp.boost = true; boost.classList.add('down'); };
    const off = () => { this.inp.boost = false; boost.classList.remove('down'); };
    boost.addEventListener('pointerdown', on);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) boost.addEventListener(ev, off);
    document.getElementById('specialBtn')!.addEventListener('click', () => this.special());
    addEventListener('keydown', e => {
      if (this.state !== 'flying') return;
      if (e.code === 'Space') { this.inp.boost = true; e.preventDefault(); }
      if (e.code === 'KeyS') this.special();
    });
    addEventListener('keyup', e => { if (e.code === 'Space') this.inp.boost = false; });

    document.getElementById('garageBtn')!.addEventListener('click', () => { if (this.state === 'aim') this.screens.openGarage(this.save, this.carIdx); });
    document.getElementById('againBtn')!.addEventListener('click', () => this.resetShot());
    document.getElementById('resGarage')!.addEventListener('click', () => { this.resetShot(); this.screens.openGarage(this.save, this.carIdx); });
  }

  private special() {
    if (this.run && this.run.useSpecial()) this.screens.specialUsed();
  }

  private launch() {
    const p = this.car.group.position;
    this.run = new Run(this.world, this.carIdx, this.save.levels[this.carIdx], this.pull.power, this.pull.heading, p.x, p.z);
    this.state = 'flying'; this.dots.count = 0; this.acc = 0; this.endT = 0;
    this.updateCatapult();
    this.screens.flying(this.carIdx, this.save.levels[this.carIdx].boost > 0);
    this.fx.spawn('dust', V3(p.x, .3, p.z + 1.5), 8);
  }

  private finishRun() {
    const run = this.run!;
    this.state = 'result';
    const r = recordRun(this.save, this.carIdx, -run.shot.z, run.coinsGrabbed);
    this.persist();
    this.screens.result(r, run.crashed, run.coinsGrabbed);
    this.screens.hud(this.save, this.carIdx);
  }

  /* ---------- per-frame ---------- */
  private stepFlight(dt: number, now: number) {
    const run = this.run!, s = run.shot, fx = this.fx;
    this.acc += dt;
    while (this.acc >= STEP) { this.acc -= STEP; run.step(this.inp); }

    for (const ev of run.takeEvents()) {
      if (ev.type === 'shot') {
        if (ev.ev === 'bounce' || ev.ev === 'land') fx.spawn('dust', V3(s.x, .2, s.z), 7);
        if (ev.ev === 'armed') fx.spawn('star', V3(s.x, s.y + 1.2, s.z), 10);
        if (ev.ev === 'swerve') fx.spawn('star', V3(s.x, s.y + .8, s.z + 1.5), 8);
      } else if (ev.type === 'zap') fx.lightning(ev.part, s.x);
      else if (ev.type === 'smash') {
        this.city.obstacles[ev.item].visible = false;
        fx.burst(this.world.parts.find(p => p.item === ev.item)!);
        fx.shake = ev.cause === 'zap' ? .7 : .5;
      } else if (ev.type === 'crash') {
        fx.spawn('star', V3(s.x, s.y + 1, s.z - 1.5), 18); fx.shake = .6;
      } else if (ev.type === 'coin') {
        const c = this.city.coins[ev.index]; c.visible = false;
        fx.spawn('star', c.position.clone(), 5);
      }
    }

    const g = this.car.group;
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = s.heading;
    g.rotation.x = s.mode === 'air' ? Math.max(-.35, Math.min(.3, s.vy * .018)) : g.rotation.x * .8;
    if (run.crashed) g.rotation.z = Math.sin(now * 30) * .05 * Math.max(0, fx.shake);
    const sp = Math.hypot(s.vx, s.vz);
    this.car.wheels.forEach(w => { w.spin.rotation.x -= sp * dt / w.r; });
    const rocketBurnOnly = !!this.car.mainFlame && s.burn > 0 && !this.inp.boost;
    this.car.boostFlames.forEach(f => { f.visible = s.boosting && !rocketBurnOnly; f.scale.set(1, 1, .8 + Math.random() * .5); });
    this.car.burnFlames.forEach(f => { f.visible = s.burn > 0; f.scale.set(1, 1, .8 + Math.random() * .6); });
    if (this.car.mainFlame) {
      const big = s.burn > 0 ? 2.2 : (s.mode === 'air' ? 1.2 : .7);
      this.car.mainFlame.scale.set(1 + (big - 1) * .3, 1 + (big - 1) * .3, big * (.85 + Math.random() * .3));
    }

    const boostLv = this.save.levels[this.carIdx].boost;
    this.screens.flight(-s.z, runReward(0, run.coinsGrabbed).coinCoins,boostLv ? Math.max(0, s.fuel / (PHYSICS.boostFuelPerLevel * boostLv)) : 0);
    if (run.finished) {
      if (!this.endT) this.endT = now;
      if (now - this.endT > (run.crashed ? END_PAUSE.crash : END_PAUSE.stop)) { this.endT = 0; this.finishRun(); }
    }
    this.updateCatapult();
  }

  private frame = () => {
    const dt = Math.min(this.clock.getDelta(), .05), now = this.clock.elapsedTime;
    if (this.state === 'flying' && this.run) this.stepFlight(dt, now);
    else if (this.car.mainFlame) this.car.mainFlame.scale.set(.75, .75, .6 + Math.random() * .15);
    this.city.coins.forEach((c, i) => { if (c.visible) c.rotation.y = now * 2.4 + i * .3; });
    this.fx.tick(dt);
    const s = this.run?.shot;
    const flying = (this.state === 'flying' || this.state === 'result') && !!s;
    this.cam.update(dt, flying, this.car.group.position, s?.heading ?? 0, s ? Math.hypot(s.vx, s.vz) : 0, this.fx.shake);
    followWithSun(this.st, this.car.group.position);
    this.st.renderer.render(this.st.scene, this.st.camera);
    requestAnimationFrame(this.frame);
  };

  private resize() {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    this.st.renderer.setSize(w, h, false);
    this.cam.resize(w, h);
  }
}
