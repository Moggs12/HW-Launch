/* Wind streaks rushing out from the middle of the screen; stronger the faster you go.
   No per-frame allocation: streaks are recycled in place and alpha goes through globalAlpha. */
interface Streak { a: number; r: number; len: number; w: number }
const N = 46;

export class SpeedLines {
  private ctx: CanvasRenderingContext2D;
  private streaks: Streak[] = [];
  private level = 0;
  private dpr = 1;
  private dirty = true;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    for (let i = 0; i < N; i++) { const s = { a: 0, r: 0, len: 0, w: 0 }; this.recycle(s, Math.random()); this.streaks.push(s); }
  }

  private recycle(s: Streak, r = 0) {
    s.a = Math.random() * Math.PI * 2; s.r = .25 + r * .75; s.len = .08 + Math.random() * .14; s.w = 1 + Math.random() * 2.5;
  }

  resize(w: number, h: number) {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(w * this.dpr)); this.canvas.height = Math.max(1, Math.round(h * this.dpr));
    this.dirty = true;   // resizing wipes the canvas; redraw from scratch
  }

  /* strength 0..1 */
  draw(dt: number, strength: number) {
    this.level += (strength - this.level) * (1 - Math.exp(-5 * dt));
    const { ctx, canvas } = this, W = canvas.width, H = canvas.height;
    if (this.level < .02) {
      if (this.dirty) { ctx.clearRect(0, 0, W, H); this.dirty = false; }
      return;
    }
    ctx.clearRect(0, 0, W, H); this.dirty = true;
    const lv = this.level, cx = W / 2, cy = H * .42, R = Math.hypot(W, H) * .6, stretchLen = .6 + lv * .8;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#fff';
    for (let i = 0; i < N; i++) {
      const s = this.streaks[i];
      s.r += dt * (1.2 + lv * 2.4);
      if (s.r > 1.1) this.recycle(s);
      const r0 = s.r * R, r1 = (s.r + s.len * stretchLen) * R, c = Math.cos(s.a), sn = Math.sin(s.a);
      const alpha = .55 * lv * Math.min(1, (s.r - .25) * 3);
      if (alpha <= .004) continue;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = s.w * this.dpr;
      ctx.beginPath(); ctx.moveTo(cx + c * r0, cy + sn * r0); ctx.lineTo(cx + c * r1, cy + sn * r1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
