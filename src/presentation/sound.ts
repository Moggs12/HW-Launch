/* All the game sounds and the music, made on the fly with Web Audio (no sound files to load).
   Browsers only allow sound after a tap, so unlock() is called from the Start button.
   Signal path: sounds -> fx bus (+ a little room reverb) -> master (compressor) -> speakers;
   music -> music bus -> master. */
type Ctx = AudioContext;

const BPM = 118, EIGHTH = 60 / BPM / 2;
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
// 8-bar loop: C G Am F | C G F G. Chord roots (MIDI, bass octave) and a bouncy tune (eighth notes, 0 = rest).
const ROOTS = [36, 43, 45, 41, 36, 43, 41, 43];
const CHORDS = [[60, 64, 67], [59, 62, 67], [60, 64, 69], [60, 65, 69], [60, 64, 67], [59, 62, 67], [60, 65, 69], [59, 62, 67]];
const TUNE = [
  76, 0, 79, 0, 81, 79, 76, 0,
  74, 0, 79, 0, 83, 0, 81, 79,
  72, 0, 76, 0, 81, 0, 79, 76,
  77, 0, 81, 0, 84, 0, 81, 0,
  79, 76, 79, 84, 0, 83, 81, 79,
  83, 0, 86, 0, 83, 81, 79, 0,
  81, 0, 84, 0, 81, 79, 77, 0,
  79, 0, 81, 83, 86, 0, 0, 0,
];

export class Sound {
  private ctx: Ctx | null = null;
  private master!: GainNode;
  private fx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; sub: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private boost: { gain: GainNode } | null = null;
  private step = 0;
  private nextNote = 0;
  muted = false;

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = .004; comp.release.value = .2;
      comp.connect(ctx.destination);
      this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : .8; this.master.connect(comp);
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      // a small bright room so things don't sound dry and cheap
      const verb = ctx.createConvolver(), wet = ctx.createGain();
      verb.buffer = this.impulse(1.4); wet.gain.value = .22;
      verb.connect(wet); wet.connect(this.master);
      this.fx = ctx.createGain(); this.fx.connect(this.master); this.fx.connect(verb);
      this.music = ctx.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
      const musicVerb = ctx.createGain(); musicVerb.gain.value = .5; this.music.connect(musicVerb); musicVerb.connect(verb);
      this.startLoops();
      this.nextNote = ctx.currentTime + .1;
      setInterval(() => this.schedule(), 25);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') ctx.suspend().catch(() => {});
        else ctx.resume().catch(() => {});
      });
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  private impulse(secs: number) {
    const ctx = this.ctx!, n = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    return b;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : .8, this.ctx.currentTime, .05);
  }

  /* music volume 0..1 (louder on the home screen, tucked under the action while flying) */
  setMusic(level: number) {
    if (this.ctx) this.music.gain.setTargetAtTime(level * .5, this.ctx.currentTime, .4);
  }

  private startLoops() {
    const ctx = this.ctx!;
    // engine: two detuned buzzy oscillators plus a sub, through a low-pass
    const osc = ctx.createOscillator(), osc2 = ctx.createOscillator(), sub = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    osc.type = 'sawtooth'; osc2.type = 'square'; sub.type = 'sine';
    osc.frequency.value = 50; osc2.frequency.value = 50.7; sub.frequency.value = 25;
    filter.type = 'lowpass'; filter.frequency.value = 500; filter.Q.value = 3; gain.gain.value = 0;
    osc.connect(filter); osc2.connect(filter); sub.connect(filter); filter.connect(gain); gain.connect(this.fx);
    osc.start(); osc2.start(); sub.start();
    this.engine = { osc, osc2, sub, filter, gain };
    this.wind = this.noiseLoop('bandpass', 700, .8);
    const b = this.noiseLoop('highpass', 1800, .3);
    this.boost = { gain: b.gain };
  }

  private noiseLoop(type: BiquadFilterType, freq: number, q: number) {
    const ctx = this.ctx!, src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    src.buffer = this.noise; src.loop = true;
    filter.type = type; filter.frequency.value = freq; filter.Q.value = q; gain.gain.value = 0;
    src.connect(filter); filter.connect(gain); gain.connect(this.fx); src.start();
    return { gain, filter };
  }

  /* ---------- music: scheduled a little ahead so timing stays tight ---------- */
  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.nextNote < ctx.currentTime - .2) this.nextNote = ctx.currentTime + .05;   // came back from a pause
    while (this.nextNote < ctx.currentTime + .15) {
      this.playStep(this.step, this.nextNote);
      this.nextNote += EIGHTH; this.step = (this.step + 1) % TUNE.length;
    }
  }

  private playStep(i: number, t: number) {
    const bar = Math.floor(i / 8), e = i % 8, out = this.music;
    const root = ROOTS[bar];
    // bass: root on the beat, octave bounce on the off-beat of 2 and 4
    if (e % 4 === 0) this.note(midi(root), t, EIGHTH * 1.6, 'triangle', .5, out);
    if (e === 3 || e === 7) this.note(midi(root + 12), t, EIGHTH * .8, 'triangle', .3, out);
    // chord stabs on the off-beats
    if (e % 2 === 1) for (const n of CHORDS[bar]) this.note(midi(n), t, EIGHTH * .7, 'square', .035, out, 1800);
    // tune
    const m = TUNE[i];
    if (m) { this.note(midi(m), t, EIGHTH * 1.5, 'triangle', .2, out); this.note(midi(m + 12), t, EIGHTH, 'sine', .05, out); }
    // drums: kick on 1 and 3, clap on 2 and 4, soft hats on every eighth
    if (e === 0 || e === 4) this.kick(t, out);
    if (e === 2 || e === 6) this.hit(t, .09, .22, 'bandpass', 1600, out);
    this.hit(t, .03, e % 2 ? .05 : .03, 'highpass', 7000, out);
  }

  private note(f: number, t: number, dur: number, type: OscillatorType, vol: number, out: AudioNode, lp?: number) {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); fl.connect(g); } else o.connect(g);
    g.connect(out); o.start(t); o.stop(t + dur + .02);
  }
  private kick(t: number, out: AudioNode) {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .12);
    g.gain.setValueAtTime(.6, t); g.gain.exponentialRampToValueAtTime(.001, t + .22);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + .25);
  }
  private hit(t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, out: AudioNode) {
    const ctx = this.ctx!, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    src.connect(f); f.connect(g); g.connect(out); src.start(t, Math.random()); src.stop(t + dur + .02);
  }

  /* ---------- continuous effects ---------- */
  /* level 0..1: idle rumble up to a scream */
  setEngine(level: number) {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime, e = this.engine, f = 45 + level * 170;
    e.osc.frequency.setTargetAtTime(f, t, .05); e.osc2.frequency.setTargetAtTime(f * 1.012, t, .05); e.sub.frequency.setTargetAtTime(f / 2, t, .05);
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

  /* ---------- one-shots ---------- */
  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(this.fx); o.start(t); o.stop(t + dur + .02);
  }

  private burst(dur: number, vol: number, type: BiquadFilterType, from: number, to: number, when = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + when, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise; f.type = type; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.fx); src.start(t, Math.random()); src.stop(t + dur + .02);
  }

  /* metal ring: a few out-of-tune partials that die away */
  private clank(vol: number, when = 0) { [523, 1347, 2113, 3170].forEach((f, i) => this.tone(f * (.97 + Math.random() * .06), .5 - i * .08, 'sine', vol / (i + 1), when)); }

  twang() { this.tone(180, .35, 'triangle', .3, 0, 60); this.tone(90, .3, 'sine', .3, 0, 50); this.burst(.15, .25, 'lowpass', 2000, 300); }
  whoosh() { this.burst(.8, .55, 'bandpass', 250, 2600); this.burst(.5, .2, 'highpass', 3000, 6000, .05); }
  coin() { this.tone(1976, .1, 'square', .05); this.tone(1976, .12, 'sine', .15); this.tone(2637, .35, 'sine', .16, .07); this.tone(2637, .25, 'square', .03, .07); }
  tick() { this.tone(2200, .025, 'square', .035); }
  pop() { this.tone(500, .09, 'sine', .25, 0, 1100); }
  thud(strength = .5) { this.tone(110, .25, 'sine', .3 + strength * .4, 0, 40); this.burst(.14, .2 * strength, 'lowpass', 900, 150); }
  crash() {
    this.burst(.8, .7, 'lowpass', 3000, 180); this.tone(85, .5, 'sine', .55, 0, 32);
    this.burst(.35, .3, 'highpass', 4000, 1500, .05); this.clank(.18, .02); this.clank(.1, .15);
  }
  smash() { this.burst(.7, .6, 'lowpass', 2500, 220); this.tone(70, .45, 'sine', .5, 0, 30); for (let i = 0; i < 5; i++) this.burst(.12, .15, 'bandpass', 1500 + Math.random() * 2000, 600, .08 + i * .07); }
  zap() { this.burst(.5, .55, 'highpass', 6000, 1500); this.tone(1200, .3, 'sawtooth', .12, 0, 80); this.tone(60, .6, 'sine', .4, .05, 30); }
  powerUp() { this.tone(400, .25, 'square', .08, 0, 1200); this.tone(600, .25, 'triangle', .15, .05, 1800); }
  chime() { this.tone(880, .2, 'triangle', .22); this.tone(1320, .35, 'triangle', .2, .08); this.tone(1760, .4, 'sine', .1, .16); }
  tada() { [523, 659, 784, 1047].forEach((f, i) => { this.tone(f, .35, 'triangle', .2, i * .09); this.tone(f * 2, .2, 'sine', .05, i * .09); }); }
  fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => { this.tone(f, .4, 'square', .08, i * .12); this.tone(f, .45, 'triangle', .18, i * .12); }); }
}
