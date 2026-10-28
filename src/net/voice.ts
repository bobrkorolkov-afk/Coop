// ============ Голос: «голос = газ» + войс-чат ============
// Микрофон → AnalyserNode → ускорение. WebRTC-звонки обрабатывает online.ts.

import { TUNE } from '../game/constants';

export class VoiceChat {
  stream: MediaStream | null = null;
  analyser: AnalyserNode | null = null;
  private ctx: AudioContext | null = null;
  private buf: Uint8Array | null = null;
  volume = 0;          // 0..1 сырая громкость
  smoothed = 0;        // сглаженная
  boost = 0;           // 0..0.35 множитель скорости
  micScale = 0.8;      // чувствительность из настроек
  enabled = false;
  error = '';

  async init(): Promise<boolean> {
    if (this.enabled) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      });
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.6;
      src.connect(this.analyser);
      this.buf = new Uint8Array(this.analyser.fftSize);
      this.enabled = true;
      this.error = '';
      return true;
    } catch (e: any) {
      this.error = e?.message ?? 'нет доступа к микрофону';
      this.enabled = false;
      return false;
    }
  }

  update(dt: number) {
    if (!this.enabled || !this.analyser || !this.buf) {
      this.boost = 0;
      this.volume = 0;
      return;
    }
    this.analyser.getByteTimeDomainData(this.buf as any);
    // RMS
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const v = (this.buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.buf.length);
    this.volume = Math.min(1, rms * 4.2 * (0.4 + this.micScale));

    // сглаживание
    const k = this.volume > this.smoothed ? Math.min(1, dt * 14) : Math.min(1, dt * 3.5);
    this.smoothed += (this.volume - this.smoothed) * k;

    // маппинг: тишина 0, шёпот 0.1, разговор 0.25, ор 0.35
    const v = this.smoothed;
    if (v < 0.045) this.boost = 0;
    else if (v < 0.16) this.boost = TUNE.voiceWhisper * (v / 0.16);
    else if (v < 0.38) this.boost = TUNE.voiceTalk * ((v - 0.16) / 0.22) + TUNE.voiceWhisper * (1 - (v - 0.16) / 0.22) * 0.2;
    else this.boost = Math.min(TUNE.voiceShout, TUNE.voiceTalk + (v - 0.38) * 0.6);
    this.boost *= this.micScale;
    this.boost = Math.min(TUNE.voiceShout, this.boost);
  }

  get hasSignal(): boolean {
    return this.smoothed > 0.035;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyser = null;
    this.enabled = false;
    this.boost = 0;
  }
}
