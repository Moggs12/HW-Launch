/* All the game sounds, made on the fly with Web Audio (no sound files to load).
   Browsers only allow sound after a tap, so unlock() is called from the Start button. */
type Ctx = AudioContext;

export class Sound {
  private ctx: Ctx | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private boost: { gain: GainNode } | null = null;
  muted = false;

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : .7; this.master.connect(ctx.destination);
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.startLoops();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : .7, this.ctx.currentTime, .05);
  }

  private startLoops() {
    const ctx = this.ctx!;
    // engine: two detuned buzzy oscillators through a low-pass
    const osc = ctx.createOscillator(), osc2 = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    osc.type = 'sawtooth'; osc2.type = 'square'; osc.frequency.value = 50; osc2.frequency.value = 50.7;
    filter.type = 'lowpass'; filter.frequency.value = 500; gain.gain.value = 0;
    osc.connect(filter); osc2.connect(filter); filter.connect(gain); gain.connect(this.master);
    osc.start(); osc2.start();
    this.engine = { osc, osc2, filter, gain };
    // wind: looping noise through a band-pass
    this.wind = this.noiseLoop('bandpass', 700, .8);
    // boost: brighter hiss
    const b = this.noiseLoop('highpass', 1800, .3);
    this.boost = { gain: b.gain };
  }

  private noiseLoop(type: BiquadFilterType, freq: number, q: number) {
    const ctx = this.ctx!, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    src.buffer = this.noise; src.loop = true;
    filter.type = type; filter.frequency.value = freq; filter.Q.value = q; gain.gain.value = 0;
    src.connect(filter); filter.connect(gain); gain.connect(this.master); src.start();
    return { gain, filter };
  }

  /* level 0..1: idle rumble up to a scream */
  setEngine(level: number) {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime, e = this.engine, f = 45 + level * 170;
    e.osc.frequency.setTargetAtTime(f, t, .05); e.osc2.frequency.setTargetAtTime(f * 1.012, t, .05);
    e.filter.frequency.setTargetAtTime(350 + level * 1800, t, .05);
    e.gain.gain.setTargetAtTime(level > 0 ? .05 + level * .1 : 0, t, .08);
  }

  /* speed 0..1 */
  setWind(level: number) {
    if (!this.ctx || !this.wind) return;
    const t = this.ctx.currentTime;
    this.wind.gain.gain.setTargetAtTime(level * .35, t, .1);
    this.wind.filter.frequency.setTargetAtTime(400 + level * 1400, t, .1);
  }

  setBoost(on: boolean) {
    if (!this.ctx || !this.boost) return;
    this.boost.gain.gain.setTargetAtTime(on ? .22 : 0, this.ctx.currentTime, .04);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + .02);
  }

  private burst(dur: number, vol: number, type: BiquadFilterType, from: number, to: number, when = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + when, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise; f.type = type; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t, Math.random()); src.stop(t + dur + .02);
  }

  twang() { this.tone(180, .35, 'triangle', .3, 0, 60); this.burst(.15, .25, 'lowpass', 2000, 300); }
  whoosh() { this.burst(.7, .5, 'bandpass', 300, 2400); }
  coin() { this.tone(1320, .12, 'square', .08); this.tone(1980, .25, 'square', .07, .07); }
  thud(strength = .5) { this.tone(110, .25, 'sine', .25 + strength * .35, 0, 45); this.burst(.12, .15 * strength, 'lowpass', 800, 150); }
  crash() { this.burst(.7, .7, 'lowpass', 3000, 200); this.tone(90, .5, 'sine', .5, 0, 35); this.burst(.35, .3, 'highpass', 4000, 1500, .05); }
  smash() { this.burst(.6, .6, 'lowpass', 2500, 250); this.tone(70, .4, 'sine', .45, 0, 30); }
  zap() { this.burst(.4, .5, 'highpass', 6000, 1500); this.tone(1200, .3, 'sawtooth', .15, 0, 80); }
  powerUp() { this.tone(400, .25, 'square', .1, 0, 1200); }
  chime() { this.tone(880, .15, 'triangle', .2); this.tone(1320, .3, 'triangle', .2, .08); }
  tada() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .3, 'triangle', .18, i * .09)); }
  fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, .35, 'square', .1, i * .12)); }
}
