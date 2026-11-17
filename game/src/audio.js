// audio.js — all sound is synthesized live with WebAudio: no audio files,
// no network. Engine hum, siren, gunshots, pickup chimes and a bassline loop.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.musicTimer = null;
    this.musicStep = 0;
    this.started = false;
  }

  // Must be called from a user gesture (start button) so the context is allowed.
  init() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);
    // Engine: two detuned sawtooths through a lowpass, pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineOsc2 = this.ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 82.5;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    engineOsc2.start();
    this.engineOsc2 = engineOsc2;
    // Siren: a triangle that alternates between two notes.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0.0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.started = true;
    this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  setEngine(speedNorm, driving) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + 0.06 * speedNorm : 0.0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    const f = 55 + speedNorm * 140;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.05);
    this.engineOsc2.frequency.setTargetAtTime(f * 1.5, t, 0.05);
  }

  setSiren(on) {
    if (!this.started) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0.0, this.ctx.currentTime, 0.1);
  }

  update(dt, wanted) {
    if (!this.started) return;
    if (wanted > 0) {
      this.sirenTimer += dt;
      const hi = Math.floor(this.sirenTimer * 2.2) % 2 === 0;
      this.sirenOsc.frequency.setTargetAtTime(hi ? 880 : 660, this.ctx.currentTime, 0.03);
    }
  }

  blip(freq, dur, type, vol) {
    if (!this.started || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noiseBurst(dur, vol, lowpass) {
    if (!this.started || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass || 3000;
    const g = this.ctx.createGain();
    g.gain.value = vol || 0.4;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
  }

  gunshot() {
    this.noiseBurst(0.14, 0.5, 2400);
    this.blip(110, 0.1, 'square', 0.18);
  }

  pickup() {
    this.blip(660, 0.12, 'sine', 0.3);
    setTimeout(() => this.blip(990, 0.18, 'sine', 0.3), 90);
  }

  cash() {
    this.blip(880, 0.1, 'triangle', 0.3);
    setTimeout(() => this.blip(1174, 0.12, 'triangle', 0.3), 80);
    setTimeout(() => this.blip(1568, 0.22, 'triangle', 0.3), 170);
  }

  crash() {
    this.noiseBurst(0.3, 0.5, 900);
    this.blip(70, 0.25, 'sine', 0.35);
  }

  phone() {
    this.blip(1200, 0.09, 'sine', 0.22);
    setTimeout(() => this.blip(1500, 0.09, 'sine', 0.22), 130);
  }

  // A lazy sunset-drive bassline: root notes cycle Am – F – C – G,
  // a soft square bass plus a high sparkle note every other step.
  startMusic() {
    if (this.musicTimer) return;
    const roots = [55, 43.65, 65.41, 49];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const bar = Math.floor(this.musicStep / 8) % 4;
      const step = this.musicStep % 8;
      const root = roots[bar];
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = root * (step % 4 === 0 ? 1 : step % 4 === 2 ? 1.5 : 1);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      o.connect(g);
      g.connect(this.musicGain);
      o.start(t);
      o.stop(t + 0.45);
      if (step === 4) {
        const o2 = this.ctx.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = root * 8;
        const g2 = this.ctx.createGain();
        g2.gain.setValueAtTime(0.0001, t);
        g2.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o2.connect(g2);
        g2.connect(this.musicGain);
        o2.start(t);
        o2.stop(t + 0.55);
      }
      this.musicStep++;
    }, 240);
  }
}
