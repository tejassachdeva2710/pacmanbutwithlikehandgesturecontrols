import type { GameEvent } from "./engine";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private wakaFlip = false;
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private disposed = false;

  ensure() {
    if (typeof window === "undefined" || this.disposed) return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.42;
        this.master.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
        this.master = null;
        return null;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.42, this.ctx.currentTime, 0.02);
    }
  }

  private blip(freq: number, dur = 0.09, type: OscillatorType = "square", vol = 0.3, slide?: number) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, slide), ctx.currentTime + dur);
    }
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  private noise(dur = 0.25, vol = 0.25) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const size = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }

  play(event: GameEvent) {
    switch (event) {
      case "chomp":
        this.wakaFlip = !this.wakaFlip;
        this.blip(this.wakaFlip ? 460 : 300, 0.055, "square", 0.12, this.wakaFlip ? 330 : 210);
        break;
      case "power":
        this.blip(180, 0.26, "sawtooth", 0.26, 760);
        this.blip(90, 0.32, "triangle", 0.2, 380);
        break;
      case "ghost":
        this.blip(280, 0.16, "square", 0.25, 1180);
        this.blip(620, 0.2, "sine", 0.16, 1500);
        break;
      case "death":
        this.noise(0.5, 0.35);
        this.blip(420, 0.9, "sawtooth", 0.3, 48);
        this.blip(210, 1.1, "square", 0.16, 32);
        break;
      case "level":
        [523, 659, 784, 1047].forEach((f, i) =>
          setTimeout(() => this.blip(f, 0.18, "triangle", 0.22), i * 110)
        );
        break;
      case "start":
        [392, 523, 659, 880].forEach((f, i) =>
          setTimeout(() => this.blip(f, 0.14, "square", 0.16), i * 85)
        );
        break;
      case "extra":
        [880, 1174].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, "sine", 0.24), i * 130));
        break;
      default:
        break;
    }
  }

  startSiren() {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master || this.sirenOsc) return;
    this.sirenOsc = ctx.createOscillator();
    this.sirenGain = ctx.createGain();
    this.sirenOsc.type = "sawtooth";
    this.sirenOsc.frequency.value = 58;
    this.sirenGain.gain.value = 0.0001;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
    this.sirenGain.gain.setTargetAtTime(0.055, ctx.currentTime, 0.5);
  }

  setDanger(danger: number, active: boolean) {
    if (!this.ctx || !this.sirenOsc || !this.sirenGain) return;
    const target = active ? 0.02 + danger * 0.09 : 0.0001;
    this.sirenGain.gain.setTargetAtTime(this.muted ? 0 : target, this.ctx.currentTime, 0.3);
    this.sirenOsc.frequency.setTargetAtTime(52 + danger * 48, this.ctx.currentTime, 0.4);
  }

  heartbeat(intensity: number) {
    if (this.muted || intensity < 0.15) return;
    this.blip(52, 0.16, "sine", 0.3 * intensity, 38);
    setTimeout(() => this.blip(44, 0.2, "sine", 0.22 * intensity, 30), 155);
  }

  dispose() {
    this.disposed = true;
    try {
      this.sirenOsc?.stop();
    } catch {
      /* already stopped */
    }
    this.sirenOsc = null;
    this.sirenGain = null;
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }
}
