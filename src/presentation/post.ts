import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* The finishing look: glow on bright things (flames, coins, lamps, lightning). The vignette is a
   CSS overlay (free). Watches the frame rate and steps quality down on slower phones.

   Tiers: 3 glow at up to 2x, 2 glow at 1.5x, 1 no glow at 1.5x, 0 no glow at 1x. */

const PIXEL_RATIO = [1, 1.5, 1.5, 2];
const SLOW_FRAME = 1 / 45;        // average frame time above this steps quality down

export class Post {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  tier = matchMedia('(pointer: coarse)').matches ? 2 : 3;   // phones start one step down
  private w = 1; private h = 1;
  private frames: number[] = [];
  private settle = 3;              // seconds to wait before judging the frame rate

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.Camera) {
    // no multisampling: on the HDR buffer it nearly halves the frame rate, and phone screens are dense enough without it
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .5, .4, 4.5);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.apply();
  }

  private apply() {
    const pr = Math.min(window.devicePixelRatio || 1, PIXEL_RATIO[this.tier]);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.w, this.h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(this.w, this.h);
    this.bloom.enabled = this.tier >= 2;
    // bloom works at a third of the size: still a soft glow, and much cheaper
    this.bloom.resolution.set(this.w * pr / 3, this.h * pr / 3);
  }

  resize(w: number, h: number) { this.w = w; this.h = h; this.apply(); }

  render(dt: number) {
    this.watch(dt);
    if (this.tier <= 1) this.renderer.render(this.scene, this.camera);
    else this.composer.render(dt);
  }

  /* Step down (never back up, to avoid flicker) if frames are consistently slow.
     dt is the raw frame gap: very long gaps mean the page was in the background, so they don't count. */
  private watch(dt: number) {
    if (document.visibilityState !== 'visible' || dt > .2) return;
    if (this.settle > 0) { this.settle -= dt; return; }
    this.frames.push(dt);
    if (this.frames.length < 90) return;
    const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
    this.frames.length = 0;
    if (avg > SLOW_FRAME && this.tier > 0) {
      this.tier--; this.apply(); this.settle = 2;
    }
  }
}
