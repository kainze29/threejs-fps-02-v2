// NEON TIDE sound: every effect synthesized with WebAudio, no audio files.
// Fresh code written for threejs-fps-02.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.rainNodes = null;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      this.ctx = null;
    }
    return this.ctx;
  }

  _noise(dur, filterFreq, gain, type = 'lowpass') {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  _tone(freq, dur, type, gain, slideTo) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  shot(kind) {
    if (this.muted) return;
    switch (kind) {
      case 'pistol':
        this._noise(0.09, 2400, 0.5);
        this._tone(190, 0.08, 'square', 0.22, 70);
        break;
      case 'smg':
        this._noise(0.06, 3200, 0.38);
        this._tone(260, 0.05, 'square', 0.16, 110);
        break;
      case 'ar':
        this._noise(0.13, 1800, 0.55);
        this._tone(150, 0.11, 'sawtooth', 0.24, 55);
        break;
      case 'dmr':
        this._noise(0.28, 1100, 0.7);
        this._tone(110, 0.22, 'sawtooth', 0.3, 40);
        this._tone(1400, 0.06, 'sine', 0.1, 300);
        break;
      default:
        this._noise(0.1, 2000, 0.4);
    }
  }

  botShot(dist) {
    if (this.muted) return;
    const g = Math.max(0.08, 0.4 - dist * 0.008);
    this._noise(0.09, 1500, g);
    this._tone(130, 0.07, 'square', g * 0.5, 60);
  }

  reload() {
    if (this.muted) return;
    this._tone(520, 0.05, 'square', 0.12);
    setTimeout(() => this._tone(340, 0.05, 'square', 0.12), 180);
    setTimeout(() => this._tone(680, 0.06, 'square', 0.14), 380);
  }

  dryClick() {
    this._tone(900, 0.03, 'square', 0.08);
  }

  hit() {
    this._tone(1250, 0.06, 'sine', 0.22, 900);
  }

  kill() {
    this._tone(880, 0.08, 'sine', 0.25, 880);
    setTimeout(() => this._tone(1320, 0.12, 'sine', 0.25, 1320), 80);
  }

  hurt() {
    this._noise(0.15, 500, 0.4);
    this._tone(90, 0.16, 'sine', 0.3, 55);
  }

  buy() {
    this._tone(990, 0.07, 'sine', 0.2);
    setTimeout(() => this._tone(1480, 0.1, 'sine', 0.2), 70);
  }

  deny() {
    this._tone(220, 0.12, 'square', 0.14, 160);
  }

  uplinkTick() {
    this._tone(1560, 0.05, 'sine', 0.16);
  }

  uplinkDone() {
    [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => this._tone(f, 0.14, 'sine', 0.22), i * 90));
  }

  win() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 'triangle', 0.24), i * 120));
  }

  lose() {
    [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this._tone(f, 0.26, 'triangle', 0.22), i * 130));
  }

  surge() {
    this._tone(180, 0.9, 'sine', 0.25, 720);
    this._noise(0.8, 900, 0.12, 'bandpass');
  }

  deploy() {
    this._tone(440, 0.08, 'sine', 0.18);
    setTimeout(() => this._tone(660, 0.1, 'sine', 0.18), 90);
  }

  startRain() {
    if (!this.ensure() || this.rainNodes) return;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      const g = this.ctx.createGain();
      g.gain.value = 0.045;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.13;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.015;
      lfo.connect(lfoGain).connect(g.gain);
      src.connect(f).connect(g).connect(this.master);
      src.start();
      lfo.start();
      this.rainNodes = { src, lfo };
    } catch (e) { /* rain is ambience, never fatal */ }
  }
}
