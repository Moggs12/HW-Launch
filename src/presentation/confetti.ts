/* A burst of paper confetti over everything, for new bests and unlocks. Runs only while pieces are falling. */
interface Piece { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; col: string; life: number }
const COLS = ['#e8231c', '#ff7a1a', '#ffd21f', '#1440c4', '#ffffff', '#3ad16b'];

export class Confetti {
  private ctx: CanvasRenderingContext2D;
  private pieces: Piece[] = [];
  private running = false;
  private last = 0;

  constructor(private canvas: HTMLCanvasElement) { this.ctx = canvas.getContext('2d')!; }

  burst(n = 140) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const dpr = Math.min(devicePixelRatio || 1, 2), W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;   // two cannons from the bottom corners
      this.pieces.push({
        x: side > 0 ? W * .05 : W * .95, y: H * .95,
        vx: side * (250 + Math.random() * 450) * (W / 800 + .4), vy: -(700 + Math.random() * 600) * (H / 700 + .2),
        r: Math.random() * 6, vr: (Math.random() - .5) * 14, w: 7 + Math.random() * 7, h: 4 + Math.random() * 5,
        col: COLS[i % COLS.length], life: 0,
      });
    }
    if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame(this.tick); }
  }

  private tick = (t: number) => {
    const dt = Math.min(.05, (t - this.last) / 1000); this.last = t;
    const { ctx } = this, W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    ctx.clearRect(0, 0, W, H);
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.life += dt; p.vy += 1100 * dt; p.vx *= 1 - 1.6 * dt; p.vy *= 1 - 1.2 * dt; p.vy = Math.min(p.vy, 260);
      p.x += p.vx * dt + Math.sin(p.life * 6 + p.r) * 30 * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      if (p.y > H + 20 || p.life > 6) { this.pieces.splice(i, 1); continue; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(1, Math.cos(p.life * 9 + p.r));
      ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (this.pieces.length) requestAnimationFrame(this.tick);
    else { this.running = false; ctx.clearRect(0, 0, W, H); }
  };
}
