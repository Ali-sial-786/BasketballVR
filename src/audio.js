// Original synthesised sounds, unlocked only by a user gesture.
export class Audio {
  constructor() { this.ctx = null; this.enabled = true; this.lastBounce = -1; }
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
  }
  setEnabled(on) { this.enabled = on; if (this.master) this.master.gain.setTargetAtTime(on ? 0.78 : 0, this.ctx.currentTime, 0.05); }
  tone(freq, duration, gain = 0.1, type = 'sine', delay = 0, end = freq) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + duration);
    g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + duration + 0.02);
  }
  hiss(duration, freq, gain = 0.1, delay = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay, n = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    n.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.7;
    g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(gain, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    n.connect(f).connect(g).connect(this.master); n.start(t, Math.random()); n.stop(t + duration);
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
      case 'rim': this.tone(580, 0.16, 0.12, 'triangle', 0, 430); this.hiss(0.06, 1800, 0.08); break;
      case 'board': this.tone(210, 0.13, 0.12, 'triangle'); break;
      case 'move': this.hiss(0.15, 2600, 0.08); this.tone(1600, 0.06, 0.035, 'sine', 0, 2400); break;
      case 'pass': this.hiss(0.13, 800, 0.07); break;
      case 'block': case 'steal': this.hiss(0.09, 600, 0.2); this.tone(150, 0.07, 0.16, 'triangle'); break;
      case 'catch': this.hiss(0.06, 450, 0.1); break;
      case 'score': this.hiss(0.36, 3600, 0.19); this.hiss(1.3, 1200, 0.12, 0.12);
        if (event.green) { this.tone(659, 0.16, 0.09); this.tone(988, 0.25, 0.08, 'sine', 0.09); }
        else this.tone(440, 0.16, 0.05); break;
      case 'buzzer': this.tone(115, 0.55, 0.12, 'sawtooth'); break;
      case 'whistle': this.tone(2400, 0.14, 0.06, 'sine'); break;
      case 'ui': this.tone(740, 0.05, 0.045); break;
    }
  }
}
