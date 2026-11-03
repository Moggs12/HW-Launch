import * as THREE from 'three';
import { CARS } from '../content/cars';
import type { LevelDef } from '../content/level';
import { SPECIALS } from '../content/specials';
import { MAX_LEVEL, UPGRADES } from '../content/upgrades';
import type { Platform } from '../platform/platform';
import { AIM, canLaunch, pullFromDrag } from '../rules/aim';
import { buyUpgrade, recordRun, runReward, unlockNext } from '../rules/economy';
import { PHYSICS, makeShot, stepShot } from '../rules/physics';
import { Run, STEP, buildWorld, type World } from '../rules/run';
import { freshSave, writeSave, type SaveData } from '../rules/save';
import { ChaseCamera } from './camera';
import { V3 } from './cars/kit';
import { buildCar, type CarModel } from './cars/models';
import { fitUpgrades } from './cars/upgradeParts';
import { Catapult } from './catapult';
import { buildCity, type CityView } from './city';
import { Effects } from './effects';
import { buildRamp } from './ramp';
import { Post } from './post';
import { createStage, followWithSun, type Stage3D } from './scene';
import { Screens } from './screens';
import { Sound } from './sound';
import { SpeedLines } from './speedLines';
import { canvasTex, setMaxAnisotropy } from './textures';

/* Glue: input -> rules -> 3D + screens + sound. Owns the home / aim / pull / fly / result loop. */
type State = 'home' | 'aim' | 'pulling' | 'flying' | 'result';

const PREDICT_DOTS = 36;
const END_PAUSE = { crash: .9, stop: .6 };
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class Game {
  private st: Stage3D;
  private cam: ChaseCamera;
  private world: World;
  private city: CityView;
  private catapult: Catapult;
  private fx: Effects;
  private screens: Screens;
  private sound = new Sound();
  private lines: SpeedLines;
  private dots: THREE.InstancedMesh;
  private post: Post;
  private blob: THREE.Mesh;          // soft round shadow under the car, so you can judge its height
  private clock = new THREE.Clock();

  private state: State = 'home';
  private carIdx = 0;
  private car!: CarModel;
  private carRear = 2.2;
  private pull = { power: 0, heading: 0 };
  private drag: { x: number; y: number; id: number } | null = null;
  private run: Run | null = null;
  private inp = { boost: false };
  private acc = 0;
  private endT = 0;
  private susp = { y: 0, v: 0 };   // body bounce on the wheels

  constructor(private stage: HTMLElement, canvas: HTMLCanvasElement, speedCanvas: HTMLCanvasElement,
              level: LevelDef, private save: SaveData, private platform: Platform) {
    this.st = createStage(canvas);
    setMaxAnisotropy(this.st.renderer.capabilities.getMaxAnisotropy());
    this.post = new Post(this.st.renderer, this.st.scene, this.st.camera);
    this.world = buildWorld(level);
    this.cam = new ChaseCamera(this.st.camera, this.world.ramp.startZ);
    this.city = buildCity(this.st.scene, this.world);
    buildRamp(this.st.scene, this.world.ramp, level.ramp);
    this.catapult = new Catapult(this.st.scene, this.world.ramp.startZ);
    this.fx = new Effects(this.st.scene);
    this.lines = new SpeedLines(speedCanvas);
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(.14, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9 }), PREDICT_DOTS);
    this.dots.count = 0; this.st.scene.add(this.dots);
    const blobTex = canvasTex(64, 64, (c, w) => {
      const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, 'rgba(10,15,40,.9)'); g.addColorStop(.55, 'rgba(10,15,40,.45)'); g.addColorStop(1, 'rgba(10,15,40,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, w);
    });
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 4.6), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: .5 }));
    this.blob.renderOrder = 1; this.st.scene.add(this.blob);
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = this;

    this.screens = new Screens({
      refresh: () => this.refreshAll(),
      buy: key => {
        if (!buyUpgrade(this.save, this.carIdx, key)) return;
        this.persist(); fitUpgrades(this.car, this.save.levels[this.carIdx], CARS[this.carIdx].accent); this.refreshAll();
        this.screens.flashUpgrade(key); this.sound.chime(); this.buzz('light');
      },
      pickCar: i => { this.save.car = i; this.persist(); this.loadCar(i); this.refreshAll(); this.buzz('light'); },
      unlock: () => {
        if (!unlockNext(this.save)) return;
        this.persist(); this.loadCar(this.save.car); this.refreshAll();
        this.fx.spawn('star', V3(0, 2, this.world.ramp.startZ), 30);
        this.screens.celebrate(); this.sound.fanfare(); this.buzz('heavy');
      },
      testCoins: () => { this.save.coins += 1000; this.persist(); this.refreshAll(); },
      testMax: () => {
        for (const u of UPGRADES) this.save.levels[this.carIdx][u.key] = MAX_LEVEL;
        this.persist(); fitUpgrades(this.car, this.save.levels[this.carIdx], CARS[this.carIdx].accent); this.refreshAll();
      },
      testReset: () => { this.save = freshSave(); this.persist(); this.loadCar(0); this.refreshAll(); },
    }, {
      start: () => { this.sound.unlock(); this.sound.setMuted(this.screens.muted); this.buzz('medium'); this.state = 'aim'; this.resetShot(); },
      muted: m => this.sound.setMuted(m),
    });

    this.screens.sfx = k => { if (k === 'tick') this.sound.tick(); else if (k === 'coin') this.sound.coin(); else this.sound.pop(); };
    this.bindInput(canvas);
    new ResizeObserver(() => this.resize()).observe(stage); this.resize();
    this.loadCar(this.screens.testMode ? save.car : Math.min(save.car, save.unlocked - 1));
    this.state = 'home';
    this.screens.showHome(this.carIdx);
    this.screens.doneLoading();
    this.frame();
  }

  private persist() { writeSave(this.platform.storage, this.save); }
  private buzz(kind: 'light' | 'medium' | 'heavy') { if (!this.screens.muted) this.platform.haptic(kind); }
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
    if (this.state !== 'home') this.state = 'aim';
    this.run = null; this.pull = { power: 0, heading: 0 }; this.inp.boost = false;
    this.car.group.position.set(0, 0, this.world.ramp.startZ); this.car.group.rotation.set(0, 0, 0);
    this.susp = { y: 0, v: 0 }; this.car.body.position.y = 0;
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
    const s = makeShot(car, this.save.levels[this.carIdx], SPECIALS[car.special].effect, this.pull.power, this.pull.heading,
      this.world.ramp, this.pull.power * AIM.pullBack);
    const m = new THREE.Matrix4(); let k = 0, n = 0;
    for (let i = 0; i < 600 && k < PREDICT_DOTS; i++) {
      stepShot(s, 1 / 60, null);
      if (s.mode === 'ramp') continue;
      if (s.mode !== 'air') break;
      if (n++ % 5 === 0) { m.makeTranslation(s.x, s.y + .6, s.z); this.dots.setMatrixAt(k++, m); }
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
      const before = this.pull.power;
      this.pull = pullFromDrag(e.clientX - this.drag.x, e.clientY - this.drag.y, this.stage.clientWidth, this.stage.clientHeight);
      const back = this.pull.power * AIM.pullBack;
      this.car.group.position.set(Math.sin(this.pull.heading) * back, 0, this.world.ramp.startZ + Math.cos(this.pull.heading) * back);
      this.car.group.rotation.y = this.pull.heading;
      this.updateCatapult(); this.predict();
      this.screens.power(this.pull.power);
      if (Math.floor(before * 4) !== Math.floor(this.pull.power * 4) && this.pull.power > before) this.buzz('light');
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

    // a soft pop on every button press (the flight buttons make their own noises)
    document.addEventListener('pointerdown', e => {
      const b = (e.target as Element).closest('button');
      if (b && !b.disabled && b.id !== 'boostBtn' && b.id !== 'specialBtn') this.sound.pop();
    });
    document.getElementById('garageBtn')!.addEventListener('click', () => { if (this.state === 'aim') this.screens.openGarage(this.save, this.carIdx); });
    document.getElementById('againBtn')!.addEventListener('click', () => this.resetShot());
    document.getElementById('resGarage')!.addEventListener('click', () => { this.resetShot(); this.screens.openGarage(this.save, this.carIdx); });
  }

  private special() {
    if (this.run && this.run.useSpecial()) { this.screens.specialUsed(); this.sound.powerUp(); this.buzz('medium'); }
  }

  private launch() {
    const p = this.car.group.position;
    this.run = new Run(this.world, this.carIdx, this.save.levels[this.carIdx], this.pull.power, this.pull.heading, this.pull.power * AIM.pullBack);
    this.state = 'flying'; this.dots.count = 0; this.acc = 0; this.endT = 0;
    this.updateCatapult();
    this.screens.flying(this.carIdx, this.save.levels[this.carIdx].boost > 0);
    this.fx.spawn('dust', V3(p.x, .3, p.z + 1.5), 8);
    this.sound.twang(); this.buzz('medium');
  }

  private finishRun() {
    const run = this.run!;
    this.state = 'result';
    const before = this.save.coins;
    const r = recordRun(this.save, this.carIdx, -run.shot.z, run.coinsGrabbed);
    this.persist();
    this.screens.result(r, run.crashed, run.coinsGrabbed, before);
    this.screens.hud(this.save, this.carIdx);
    this.sound.tada();
  }

  /* ---------- per-frame ---------- */
  private stepFlight(dt: number, now: number) {
    const run = this.run!, s = run.shot, fx = this.fx;
    this.acc += dt;
    while (this.acc >= STEP) { this.acc -= STEP; run.step(this.inp); }

    for (const ev of run.takeEvents()) {
      if (ev.type === 'shot') {
        if (ev.ev === 'takeoff') { this.cam.kick(8); this.sound.whoosh(); this.buzz('light'); fx.spawn('dust', V3(s.x, this.world.ramp.height, 0), 6); }
        if (ev.ev === 'bounce' || ev.ev === 'land') {
          const hit = Math.min(1, s.impact / 25);
          fx.spawn('dust', V3(s.x, .2, s.z), 5 + Math.round(hit * 10));
          fx.shake = Math.max(fx.shake, Math.min(.5, s.impact * .02));
          this.susp.v -= 2 + s.impact * .25;
          this.sound.thud(hit); this.buzz(hit > .5 ? 'medium' : 'light');
        }
        if (ev.ev === 'armed') fx.spawn('star', V3(s.x, s.y + 1.2, s.z), 10);
        if (ev.ev === 'swerve') fx.spawn('star', V3(s.x, s.y + .8, s.z + 1.5), 8);
      } else if (ev.type === 'zap') fx.lightning(ev.part, s.x);
      else if (ev.type === 'smash') {
        this.city.obstacles[ev.item].visible = false;
        fx.burst(this.world.parts.find(p => p.item === ev.item)!);
        fx.shake = ev.cause === 'zap' ? .7 : .5;
        if (ev.cause === 'zap') this.sound.zap(); else this.sound.smash();
        this.buzz('medium');
      } else if (ev.type === 'crash') {
        fx.spawn('star', V3(s.x, s.y + 1, s.z - 1.5), 18);
        fx.spawn('chunk', V3(s.x, s.y + .8, s.z - 1), 10);
        fx.shake = .6;
        this.susp.v -= 6;
        this.sound.crash(); this.buzz('heavy');
      } else if (ev.type === 'coin') {
        const c = this.city.coins[ev.index]; c.visible = false;
        fx.spawn('star', c.position.clone(), 5);
        this.sound.coin();
      }
    }

    const g = this.car.group;
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = s.heading;
    g.rotation.x = s.mode === 'ramp' ? s.pitch
      : s.mode === 'air' ? Math.max(-.35, Math.min(.3, s.vy * .018)) : g.rotation.x * .8;
    if (run.crashed) g.rotation.z = Math.sin(now * 30) * .05 * Math.max(0, fx.shake);
    const sp = s.mode === 'ramp' ? s.rampV : Math.hypot(s.vx, s.vz);
    this.car.wheels.forEach(w => { w.spin.rotation.x -= sp * dt / w.r; });
    const rocketBurnOnly = !!this.car.mainFlame && s.burn > 0 && !this.inp.boost;
    this.car.boostFlames.forEach(f => { f.visible = s.boosting && !rocketBurnOnly; f.scale.set(1, 1, .8 + Math.random() * .5); });
    this.car.burnFlames.forEach(f => { f.visible = s.burn > 0; f.scale.set(1, 1, .8 + Math.random() * .6); });
    if (this.car.mainFlame) {
      const big = s.burn > 0 ? 2.2 : (s.mode === 'air' ? 1.2 : .7);
      this.car.mainFlame.scale.set(1 + (big - 1) * .3, 1 + (big - 1) * .3, big * (.85 + Math.random() * .3));
    }

    const boostLv = this.save.levels[this.carIdx].boost;
    this.screens.flight(-s.z, runReward(0, run.coinsGrabbed).coinCoins, boostLv ? Math.max(0, s.fuel / (PHYSICS.boostFuelPerLevel * boostLv)) : 0);
    if (run.finished) {
      if (!this.endT) this.endT = now;
      if (now - this.endT > (run.crashed ? END_PAUSE.crash : END_PAUSE.stop)) { this.endT = 0; this.finishRun(); }
    }
    this.updateCatapult();
  }

  /* springy body on the wheels: kicked by landings, settles by itself */
  private stepSuspension(dt: number) {
    const k = 260, damp = 14;
    this.susp.v += (-k * this.susp.y - damp * this.susp.v) * dt;
    this.susp.y = Math.max(-.35, Math.min(.25, this.susp.y + this.susp.v * dt));
    this.car.body.position.y = this.susp.y;
  }

  /* engine, wind and boost hum follow what the car is doing */
  private stepSound() {
    const s = this.run?.shot;
    if (this.state === 'pulling') this.sound.setEngine(this.pull.power * .7);
    else if (this.state === 'flying' && s && s.mode === 'ramp') this.sound.setEngine(.5 + .5 * s.rampV / s.launchSpeed);
    else if (this.state === 'flying' && s && s.mode === 'roll') this.sound.setEngine(.25 * clamp01(Math.hypot(s.vx, s.vz) / 20));
    else this.sound.setEngine(0);
    const flyingNow = this.state === 'flying' && !!s && s.mode === 'air';
    this.sound.setWind(flyingNow ? clamp01(Math.hypot(s!.vx, s!.vy, s!.vz) / 50) : 0);
    this.sound.setBoost(this.state === 'flying' && !!s?.boosting);
    this.sound.setMusic(this.state === 'flying' ? .35 : this.state === 'home' ? 1 : .7);
  }

  /* round shadow on the ground (or the ramp) under the car; fades and spreads as it climbs */
  private placeBlob() {
    const p = this.car.group.position, s = this.run?.shot;
    const onRamp = !!s && s.mode === 'ramp' && this.state === 'flying';
    const ground = onRamp ? s!.y : 0, h = Math.max(0, p.y - ground);
    this.blob.position.set(p.x, ground + .05, p.z);
    this.blob.rotation.set(-Math.PI / 2 + (onRamp ? s!.pitch : 0), this.car.group.rotation.y, 0, 'YXZ');
    this.blob.scale.setScalar(1 + h * .05);
    (this.blob.material as THREE.MeshBasicMaterial).opacity = .5 * Math.max(0, 1 - h / 35);
  }

  private frame = () => {
    const raw = this.clock.getDelta(), dt = Math.min(raw, .05), now = this.clock.elapsedTime;
    if (this.state === 'flying' && this.run) this.stepFlight(dt, now);
    else if (this.car.mainFlame) this.car.mainFlame.scale.set(.75, .75, .6 + Math.random() * .15);
    this.stepSuspension(dt);
    this.stepSound();
    this.city.coins.forEach((c, i) => { if (c.visible) c.rotation.y = now * 2.4 + i * .3; });
    this.city.updateCoins();
    this.fx.tick(dt);
    const s = this.run?.shot;
    const flying = (this.state === 'flying' || this.state === 'result') && !!s;
    const speed = s ? (s.mode === 'ramp' ? s.rampV : Math.hypot(s.vx, s.vz)) : 0;
    this.cam.update(dt, flying, this.car.group.position, s?.heading ?? 0, speed, this.fx.shake);
    this.lines.draw(dt, this.state === 'flying' && s && s.mode !== 'stop' && s.mode !== 'crash' ? clamp01((speed - 12) / 40) : 0);
    this.placeBlob();
    followWithSun(this.st, this.car.group.position);
    this.post.render(raw);
    requestAnimationFrame(this.frame);
  };

  private resize() {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    this.post.resize(w, h);
    this.cam.resize(w, h);
    this.lines.resize(w, h);
  }
}
