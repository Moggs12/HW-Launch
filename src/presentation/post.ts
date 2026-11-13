import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* The finishing look: glow on bright things (flames, coins, lamps, lightning). The vignette is a
   CSS overlay (free). Watches the frame rate and steps quality down on slower phones.

   Tiers: 3 glow at up to 2x, 2 glow at 1.5x, 1 no glow at 1.5x, 0 no glow at 1x. */

const PIXEL_RATIO = [1, 1.5, 1.5, 2];
// most device pixels drawn per frame at each tier: keeps big screens (iPad, 4K laptops) from
// drawing several million HDR pixels; phones sit well under these so they look the same
const MAX_PIXELS = [1.5e6, 2.4e6, 2.4e6, 4e6];
const SLOW_FRAME = 1 / 45;        // typical frame time above this steps quality down
// tier 1 -> 0 (blurry 1x) only when clearly below 30 fps: iOS Low Power Mode caps the frame rate
// at 30, which should cost the glow (saves battery) but not the sharpness
const VERY_SLOW_FRAME = 1 / 27;
const WINDOW = 90;                // frames per judgement
const STRIKES = 2;                // slow windows in a row before stepping down

export class Post {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  tier = matchMedia('(pointer: coarse)').matches ? 2 : 3;   // phones start one step down
  private w = 1; private h = 1;
  private applied = '';
  private frames: number[] = [];
  private strikes = 0;
  private settle = 3;              // seconds to wait before judging the frame rate
  private lost = false;
  private maxTier = 3;             // lowered on a low battery

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.Camera) {
    // no multisampling: on the HDR buffer it nearly halves the frame rate, and phone screens are dense enough without it
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .5, .4, 4.5);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.apply();

    // GPU reset (iOS does this under memory pressure or after long backgrounding). three.js
    // rebuilds its GL state on restore; here we just stop drawing meanwhile and re-judge afterwards.
    const cv = renderer.domElement;
    cv.addEventListener('webglcontextlost', () => { this.lost = true; this.reset(3); });
    cv.addEventListener('webglcontextrestored', () => { this.lost = false; this.applied = ''; this.apply(); this.reset(3); });
    document.addEventListener('visibilitychange', () => this.reset(1));
    this.watchBattery();
  }

  private apply() {
    const dpr = window.devicePixelRatio || 1;
    let pr = Math.min(dpr, PIXEL_RATIO[this.tier]);
    const css = this.w * this.h;
    if (css * pr * pr > MAX_PIXELS[this.tier]) pr = Math.max(1, Math.sqrt(MAX_PIXELS[this.tier] / css));
    const key = `${this.w}x${this.h}@${pr}/${this.tier}`;
    if (key === this.applied) return;          // ResizeObserver can fire with no real change: skip reallocating
    this.applied = key;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.w, this.h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(this.w, this.h);    // also sizes the bloom (its own buffers run at half size)
    this.bloom.enabled = this.tier >= 2;
  }

  resize(w: number, h: number) {
    // a hidden or mid-rotation stage can report 0: keep the last real size rather than allocate empty buffers
    if (w < 1 || h < 1) return;
    this.w = Math.round(w); this.h = Math.round(h); this.apply();
    this.reset(1);                              // orientation change / reflow hitch shouldn't count against the phone
  }

  render(dt: number) {
    if (this.lost) return;
    this.watch(dt);
    if (this.tier <= 1) this.renderer.render(this.scene, this.camera);
    else this.composer.render(dt);
  }

  private reset(settle: number) {
    this.frames.length = 0; this.strikes = 0;
    this.settle = Math.max(this.settle, settle);
  }

  private setTier(t: number) {
    t = Math.max(0, Math.min(this.maxTier, t));
    if (t === this.tier) return;
    this.tier = t; this.apply(); this.reset(2);
  }

  /* Step down (never back up, so it can't flicker between tiers) if frames are consistently slow.
     dt is the raw frame gap: very long gaps mean the page was in the background, so they don't count.
     The slowest tenth of each window is dropped (shader compiles, GC, a big explosion) and it takes
     two slow windows in a row, so one-off hitches never cost quality. */
  private watch(dt: number) {
    if (document.visibilityState !== 'visible' || dt > .2 || dt <= 0) return;
    if (this.settle > 0) { this.settle -= dt; return; }
    this.frames.push(dt);
    if (this.frames.length < WINDOW) return;
    const sorted = this.frames.sort((a, b) => a - b), keep = Math.floor(sorted.length * .9);
    let sum = 0; for (let i = 0; i < keep; i++) sum += sorted[i];
    const avg = sum / keep;
    this.frames.length = 0;
    const limit = this.tier === 1 ? VERY_SLOW_FRAME : SLOW_FRAME;
    if (this.tier > 0 && avg > limit) {
      if (++this.strikes >= STRIKES) this.setTier(this.tier - 1);
    } else this.strikes = 0;
  }

  /* Battery-friendly path: on a low, discharging battery drop the glow (where the browser says;
     iPhone Safari doesn't expose the battery, but its Low Power Mode 30 fps cap is caught above). */
  private watchBattery() {
    type Battery = EventTarget & { level: number; charging: boolean };
    const nav = navigator as Navigator & { getBattery?: () => Promise<Battery> };
    if (!nav.getBattery) return;
    nav.getBattery().then(b => {
      const check = () => {
        this.maxTier = !b.charging && b.level <= .2 ? 1 : 3;
        if (this.tier > this.maxTier) this.setTier(this.maxTier);
      };
      check();
      b.addEventListener('levelchange', check); b.addEventListener('chargingchange', check);
    }).catch(() => { /* not allowed here: ignore */ });
  }
}
