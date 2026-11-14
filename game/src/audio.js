// Synthesized sound, no audio files: every effect is built from oscillators and
// filtered noise through one WebAudio graph. The context is created on the first
// user gesture (browsers block audio before that) and stays suspended in shot mode.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let rainGain = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function noise(dur, filterType, freq, gain, when = 0) {
    if (!ctx || muted) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const amp = ctx.createGain();
    const t = ctx.currentTime + when;
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(amp).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, type, gain, slideTo = 0, when = 0) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    const t = ctx.currentTime + when;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Weapon voices: each gun has its own crack, body and tail.
  const VOICES = {
    sidearm: { noiseFreq: 2400, noiseGain: 0.5, noiseDur: 0.09, thump: 190, thumpDur: 0.08, thumpGain: 0.35 },
    smg: { noiseFreq: 3200, noiseGain: 0.34, noiseDur: 0.06, thump: 240, thumpDur: 0.05, thumpGain: 0.22 },
    rifle: { noiseFreq: 1800, noiseGain: 0.6, noiseDur: 0.12, thump: 140, thumpDur: 0.11, thumpGain: 0.45 },
    dmr: { noiseFreq: 1200, noiseGain: 0.75, noiseDur: 0.2, thump: 95, thumpDur: 0.18, thumpGain: 0.55 },
  };

  return {
    unlock() { ensure(); },
    setMuted(value) { muted = value; },
    startRain() {
      if (!ensure() || rainGain) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      rainGain = ctx.createGain();
      rainGain.gain.value = 0.045;
      src.connect(filter).connect(rainGain).connect(master);
      src.start();
      // A slow swell so the rain breathes instead of sitting flat.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.015;
      lfo.connect(lfoGain).connect(rainGain.gain);
      lfo.start();
    },
    shot(weaponId, distant = false) {
      if (!ensure()) return;
      const v = VOICES[weaponId] || VOICES.rifle;
      const scale = distant ? 0.35 : 1;
      noise(v.noiseDur, 'bandpass', v.noiseFreq, v.noiseGain * scale);
      tone(v.thump, v.thumpDur, 'sine', v.thumpGain * scale, v.thump * 0.45);
    },
    dryFire() { if (ensure()) tone(1400, 0.04, 'square', 0.12); },
    reload() {
      if (!ensure()) return;
      tone(900, 0.05, 'square', 0.1);
      tone(620, 0.05, 'square', 0.1, 0, 0.18);
      tone(1100, 0.06, 'square', 0.14, 0, 0.55);
    },
    hit(kill) {
      if (!ensure()) return;
      tone(kill ? 1560 : 1180, 0.07, 'sine', 0.25);
      if (kill) tone(2093, 0.12, 'sine', 0.22, 0, 0.07);
    },
    hurt() { if (ensure()) { tone(110, 0.16, 'sine', 0.4, 60); noise(0.12, 'lowpass', 500, 0.25); } },
    step() { if (ensure()) noise(0.04, 'lowpass', 700, 0.05); },
    buy() {
      if (!ensure()) return;
      tone(1318, 0.09, 'sine', 0.2);
      tone(1760, 0.14, 'sine', 0.2, 0, 0.09);
    },
    denied() { if (ensure()) tone(220, 0.12, 'square', 0.15, 160); },
    pickup() { if (ensure()) { tone(880, 0.08, 'sine', 0.2); tone(1174, 0.1, 'sine', 0.2, 0, 0.08); } },
    uplinkTick() { if (ensure()) tone(1568, 0.06, 'sine', 0.18); },
    uplinkDone() {
      if (!ensure()) return;
      [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.16, 'sine', 0.2, 0, i * 0.09));
    },
    flash() { if (ensure()) tone(2400, 0.5, 'sine', 0.12, 1800); },
    smoke() { if (ensure()) noise(0.7, 'lowpass', 600, 0.2); },
    surge() {
      if (!ensure()) return;
      tone(196, 0.5, 'sawtooth', 0.16, 392);
      tone(294, 0.5, 'sawtooth', 0.12, 587, 0.1);
    },
    roundStart() {
      if (!ensure()) return;
      tone(523, 0.12, 'triangle', 0.2);
      tone(784, 0.18, 'triangle', 0.2, 0, 0.12);
    },
    roundWin() {
      if (!ensure()) return;
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, 0, i * 0.11));
    },
    roundLose() {
      if (!ensure()) return;
      [392, 330, 262, 196].forEach((f, i) => tone(f, 0.26, 'triangle', 0.2, 0, i * 0.13));
    },
  };
}
