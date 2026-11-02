/* Wind streaks rushing out from the middle of the screen; stronger the faster you go. */
interface Streak { a: number; r: number; len: number; w: number }
const N = 46;

export class SpeedLines {
  private ctx: CanvasRenderingContext2D;
  private streaks: Streak[] = [];
  private level = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    for (let i = 0; i < N; i++) this.streaks.push(this.fresh(Math.random()));
  }

  private fresh(r = 0): Streak {
    return { a: Math.random() * Math.PI * 2, r: .25 + r * .75, len: .08 + Math.random() * .14, w: 1 + Math.random() * 2.5 };
  }

  resize(w: number, h: number) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
  }

  /* strength 0..1 */
  draw(dt: number, strength: number) {
    this.level += (strength - this.level) * Math.min(1, dt * 5);
    const { ctx, canvas } = this, W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (this.level < .02) return;
    const cx = W / 2, cy = H * .42, R = Math.hypot(W, H) * .6, dpr = W / canvas.clientWidth || 1;
    ctx.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const s = this.streaks[i];
      s.r += dt * (1.2 + this.level * 2.4);
      if (s.r > 1.1) this.streaks[i] = this.fresh();
      const r0 = s.r * R, r1 = (s.r + s.len) * R, c = Math.cos(s.a), sn = Math.sin(s.a);
      ctx.strokeStyle = `rgba(255,255,255,${(.55 * this.level * Math.min(1, (s.r - .25) * 3)).toFixed(3)})`;
      ctx.lineWidth = s.w * dpr;
      ctx.beginPath(); ctx.moveTo(cx + c * r0, cy + sn * r0); ctx.lineTo(cx + c * r1, cy + sn * r1); ctx.stroke();
    }
  }
}
