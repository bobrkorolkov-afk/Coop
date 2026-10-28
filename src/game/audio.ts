// ============ БЭДТРИП — синтезированный звук (WebAudio, без ассетов) ============

export class GameAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfxGain: GainNode | null = null;
  musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private step = 0;
  private started = false;
  sfxVolume = 0.7;
  musicVolume = 0.35;

  init() {
    if (this.started) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.master);
      this.started = true;
    } catch { /* аудио недоступно — играем молча */ }
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setSfxVolume(v: number) {
    this.sfxVolume = v;
    if (this.sfxGain) this.sfxGain.gain.value = v;
  }

  setMusicVolume(v: number) {
    this.musicVolume = v;
    if (this.musicGain) this.musicGain.gain.value = v;
  }

  // ——— Примитивы ———
  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, filterFreq = 1200, sweepTo?: number) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, t);
    if (sweepTo !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.sfxGain);
    src.start(t);
  }

  // ——— Игровые события ———
  shoot(heavy = false) {
    if (heavy) {
      this.noise(0.16, 0.5, 900, 220);
      this.tone(140, 0.12, 'square', 0.16, 60);
    } else {
      this.noise(0.07, 0.32, 1800, 700);
      this.tone(320, 0.05, 'square', 0.1, 120);
    }
  }

  hit() { this.tone(880, 0.05, 'triangle', 0.22, 1320); }
  crit() { this.tone(660, 0.09, 'sawtooth', 0.2, 1760); this.noise(0.08, 0.18, 2400); }
  kill() {
    this.tone(220, 0.28, 'sawtooth', 0.24, 880);
    this.noise(0.22, 0.22, 1400, 300);
  }
  death() { this.tone(180, 0.5, 'sawtooth', 0.3, 40); this.noise(0.4, 0.26, 800, 100); }
  jump() { this.tone(300, 0.09, 'triangle', 0.14, 520); }
  land() { this.noise(0.08, 0.16, 300); }
  slide() { this.noise(0.35, 0.2, 900, 200); }
  reload() { this.tone(520, 0.05, 'square', 0.12, 380); setTimeout(() => this.tone(640, 0.06, 'square', 0.12), 120); }
  empty() { this.tone(210, 0.05, 'square', 0.1); }
  card() { this.tone(523, 0.1, 'triangle', 0.2); setTimeout(() => this.tone(784, 0.14, 'triangle', 0.2), 90); }
  ability() { this.tone(240, 0.22, 'sawtooth', 0.18, 720); this.noise(0.18, 0.14, 1000); }
  ult() {
    this.tone(110, 0.7, 'sawtooth', 0.3, 440);
    this.noise(0.6, 0.24, 600, 2400);
    setTimeout(() => this.tone(220, 0.5, 'square', 0.2, 880), 150);
  }
  chih() { this.noise(0.22, 0.34, 500, 180); this.tone(180, 0.18, 'triangle', 0.2, 60); }
  roundWin() {
    const seq = [523, 659, 784, 1046];
    seq.forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.24), i * 130));
  }
  roundLose() {
    const seq = [392, 330, 262, 196];
    seq.forEach((f, i) => setTimeout(() => this.tone(f, 0.26, 'sawtooth', 0.2), i * 160));
  }
  hurt() { this.tone(160, 0.12, 'sawtooth', 0.2, 90); this.noise(0.1, 0.16, 500); }

  // ——— Музыка: кислотный брейкбит ———
  startMusic() {
    this.init();
    if (!this.ctx || this.musicTimer !== null) return;
    const bpm = 150;
    const beat = 60 / bpm / 2; // 8-е
    this.step = 0;
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || !this.musicGain) return;
      const t = this.ctx.currentTime;
      const s = this.step % 32;

      // kick
      if (s % 4 === 0 || s === 14 || s === 30) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.11);
        g.gain.setValueAtTime(0.55, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
        osc.connect(g).connect(this.musicGain!);
        osc.start(t); osc.stop(t + 0.15);
      }
      // hats
      if (s % 2 === 1) {
        const len = Math.floor(this.ctx.sampleRate * 0.03);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 7000;
        const g = this.ctx.createGain();
        g.gain.value = s % 4 === 3 ? 0.12 : 0.07;
        src.connect(hp).connect(g).connect(this.musicGain!);
        src.start(t);
      }
      // acid bassline
      const bassNotes = [55, 55, 82.4, 55, 73.4, 55, 82.4, 98];
      if (s % 4 === 2) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(300 + (s % 8) * 120, t);
        osc.type = 'sawtooth';
        osc.frequency.value = bassNotes[(s / 4) % 8];
        g.gain.setValueAtTime(0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + beat * 1.7);
        osc.connect(f).connect(g).connect(this.musicGain!);
        osc.start(t); osc.stop(t + beat * 2);
      }
      // snare
      if (s % 8 === 4) {
        const len = Math.floor(this.ctx.sampleRate * 0.1);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const g = this.ctx.createGain();
        g.gain.value = 0.18;
        src.connect(g).connect(this.musicGain!);
        src.start(t);
      }
      this.step++;
    }, beat * 1000);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  // Временный кастомный звук (для карт)
  boom() {
    this.tone(80, 0.5, 'sawtooth', 0.32, 30);
    this.noise(0.5, 0.3, 400, 80);
  }
}
