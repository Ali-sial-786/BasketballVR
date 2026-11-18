// Original synthesised sounds, unlocked only by a user gesture.
export class Audio {
  constructor() { this.ctx = null; this.enabled = true; this.lastBounce = -1; this.lastRim = -1; this.crowd = 0; }
  init() {
    try {
      if (this.ctx) { this.ctx.resume().catch(() => {}); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.setup(new AC());
    } catch {}
  }
  setup(context) {
    this.ctx = context; this.master = context.createGain(); this.master.gain.value = this.enabled ? 0.78 : 0;
    const limiter = context.createDynamicsCompressor(); limiter.threshold.value = -9; limiter.knee.value = 9; limiter.ratio.value = 5; limiter.connect(context.destination);
    this.master.connect(limiter);
    // Short, filtered early reflections give the hardwood court an enclosed
    // room sound without washing out a release or a defender's steal.
    for (const [seconds, level] of [[0.065, 0.16], [0.113, 0.10], [0.187, 0.055]]) {
      const delay = context.createDelay(0.3), filter = context.createBiquadFilter(), gain = context.createGain();
      delay.delayTime.value = seconds; filter.type = 'lowpass'; filter.frequency.value = 2400; gain.gain.value = level;
      this.master.connect(delay).connect(filter).connect(gain).connect(limiter);
    }
    this.noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // The building itself: a low crowd murmur that swells after a big play.
    try {
      const source = context.createBufferSource(), band = context.createBiquadFilter(), low = context.createBiquadFilter();
      source.buffer = this.noise; source.loop = true; band.type = 'bandpass'; band.frequency.value = 520; band.Q.value = 0.5;
      low.type = 'lowpass'; low.frequency.value = 1500;
      this.ambience = context.createGain(); this.ambience.gain.value = 0; this.ambienceTone = band;
      source.connect(band).connect(low).connect(this.ambience).connect(this.master); source.start();
    } catch { this.ambience = null; }
  }
  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.setTargetAtTime(on ? 0.78 : 0, this.ctx.currentTime, 0.05); }
  // Called every frame: the murmur follows the game and decays on its own.
  update(engine, active) {
    if (!this.ctx || !this.ambience) return;
    this.crowd = Math.max(0, this.crowd - 0.012);
    const live = active && engine.phase === 'playing';
    this.ambience.gain.setTargetAtTime(live ? 0.035 + this.crowd * 0.16 : 0, this.ctx.currentTime, this.crowd > 0.5 ? 0.08 : 0.5);
    this.ambienceTone.frequency.setTargetAtTime(520 + this.crowd * 520, this.ctx.currentTime, 0.2);
  }
  tone(freq, duration, gain = 0.1, type = 'sine', delay = 0, end = freq) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + duration);
    g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + duration + 0.02);
  }
  hiss(duration, freq, gain = 0.1, delay = 0, end = freq, q = 0.7) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay, n = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    n.buffer = this.noise; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (end !== freq) f.frequency.exponentialRampToValueAtTime(Math.max(40, end), t + duration);
    g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(gain, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    n.connect(f).connect(g).connect(this.master); n.start(t, Math.random()); n.stop(t + duration);
  }
  // Rubber on hardwood: a short chirp that scoops down and back up.
  squeak(strength = 0.6, delay = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain(), base = 2100 + Math.random() * 900;
    o.type = 'sine'; o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 0.82, t + 0.03); o.frequency.linearRampToValueAtTime(base * 1.12, t + 0.085);
    g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.018 + 0.03 * strength, t + 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.12);
  }
  play(event) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (event.type) {
      case 'bounce': {
        if (t - this.lastBounce < 0.085) return;
        this.lastBounce = t;
        const impact = Math.min(1, Math.max(0.12, (event.speed ?? 3) / 6));
        this.tone(112 + 40 * impact, 0.075 + 0.045 * impact, 0.06 + 0.13 * impact, 'sine', 0, 51);
        this.hiss(0.045, 380 + 150 * impact, 0.025 + 0.11 * impact);
        break;
      }
      case 'rim': {
        if (t - this.lastRim < 0.05) return;
        this.lastRim = t;
        const hit = Math.min(1, (event.speed ?? 2) / 5);
        // Steel ring: two inharmonic partials and the rattle of the bracket.
        this.tone(520, 0.2 + hit * 0.14, 0.05 + hit * 0.09, 'triangle', 0, 495); this.tone(1337, 0.12, 0.02 + hit * 0.04, 'sine', 0, 1290);
        this.hiss(0.07, 1900, 0.03 + hit * 0.07); break;
      }
      case 'board': {
        const hit = Math.min(1, (event.speed ?? 2) / 5);
        this.tone(168, 0.14, 0.07 + hit * 0.1, 'triangle', 0, 120); this.hiss(0.1, 820, 0.03 + hit * 0.05); break;
      }
      // A clean make is all net: a bright rip that falls in pitch. A ball that
      // rattled in first drags through more softly.
      case 'net': this.hiss(event.clean ? 0.34 : 0.26, event.clean ? 5200 : 3600, event.clean ? 0.2 : 0.12, 0, 1700, 1.1); this.hiss(0.16, 7000, event.clean ? 0.07 : 0.03, 0.03, 3000, 2); break;
      case 'shot': this.hiss(0.06, 2800, 0.035, 0, 1800); break;
      case 'pump': this.hiss(0.08, 1500, 0.03); break;
      case 'move': this.squeak(0.8); this.hiss(0.13, 2200, 0.05, 0, 900); if (event.broke) this.squeak(1, 0.12); break;
      case 'squeak': this.squeak(event.strength ?? 0.5); break;
      case 'jump': this.squeak(0.35); break;
      case 'land': this.tone(82, 0.08, 0.05 + Math.min(0.09, (event.speed ?? 2) * 0.02), 'sine', 0, 48); break;
      case 'bump': this.tone(95, 0.09, 0.09, 'sine', 0, 55); this.hiss(0.06, 300, 0.05); break;
      case 'pass': this.hiss(0.12, event.kind === 'lob' ? 600 : 950, 0.07, 0, 500); break;
      case 'block': this.hiss(0.08, 700, 0.24); this.tone(140, 0.08, 0.18, 'triangle', 0, 80); this.crowd = Math.max(this.crowd, event.swat ? 0.9 : 0.5); break;
      case 'steal': case 'poke': this.hiss(0.07, 900, 0.18); this.tone(170, 0.06, 0.12, 'triangle', 0, 110); this.crowd = Math.max(this.crowd, 0.55); break;
      case 'reach': this.hiss(0.07, 1300, 0.035); break;
      case 'catch': this.hiss(0.05, 520, 0.11); this.tone(150, 0.04, 0.05, 'sine', 0, 100); break;
      case 'score':
        this.crowd = Math.max(this.crowd, event.dunk ? 1 : event.value === 3 || event.green ? 0.95 : 0.75);
        if (event.dunk) { this.tone(70, 0.28, 0.2, 'sine', 0, 42); this.hiss(0.2, 420, 0.16); }
        if (event.green || event.clean) { this.tone(659, 0.16, 0.07); this.tone(988, 0.25, 0.06, 'sine', 0.09); }
        else this.tone(440, 0.16, 0.04); break;
      case 'tick': this.tone(1320, 0.07, 0.05, 'square'); break;
      case 'buzzer': this.tone(115, 0.7, 0.13, 'sawtooth'); this.tone(173, 0.7, 0.06, 'sawtooth'); break;
      case 'whistle': this.tone(2750, 0.22, 0.05, 'sine', 0, 2650); this.tone(2380, 0.22, 0.04, 'sine', 0, 2460); this.hiss(0.2, 2600, 0.03); break;
      case 'finish': this.crowd = 1; break;
      case 'ui': this.tone(740, 0.05, 0.045); break;
    }
  }
}
