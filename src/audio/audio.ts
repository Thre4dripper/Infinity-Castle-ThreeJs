/**
 * Zero-asset WebAudio synthesis:
 *  - biwa plucks (offline Karplus–Strong render) + taiko boom on castle beats
 *  - filtered-noise wind, modulated by airspeed
 *  - wing-flap whooshes
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private plucks: AudioBuffer[] = [];
  muted = false;

  /** Must be called from a user gesture. */
  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);

    // shared noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;

    // wind loop
    const src = ctx.createBufferSource();
    src.buffer = nb;
    src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 220;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();

    // biwa plucks — hirajōshi-ish scale
    for (const f of [146.83, 174.61, 196.0, 220.0, 293.66]) {
      this.plucks.push(this.renderPluck(ctx, f));
    }
    void ctx.resume();
  }

  private renderPluck(ctx: AudioContext, freq: number): AudioBuffer {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 1.7);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const period = Math.round(sr / freq);
    for (let i = 0; i < period; i++) d[i] = Math.random() * 2 - 1;
    for (let i = period + 1; i < len; i++) {
      d[i] = 0.996 * 0.5 * (d[i - period] + d[i - period - 1]);
    }
    // overall envelope + slight body resonance flavour
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      d[i] *= Math.exp(-t * 1.15) * (1 + 0.12 * Math.sin(t * 37));
    }
    return buf;
  }

  private playPluck(when: number, rate: number, gain: number): void {
    if (!this.ctx || !this.master || this.plucks.length === 0) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.plucks[Math.floor(Math.random() * this.plucks.length)];
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.master);
    src.start(when);
  }

  /** Castle reconfiguration beat: distant boom now, plucks when the wave front arrives. */
  beat(delay: number, strength: number): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;

    // taiko-ish boom at wave start (distant)
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(58, t0);
    osc.frequency.exponentialRampToValueAtTime(30, t0 + 0.9);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.001, t0);
    og.gain.exponentialRampToValueAtTime(0.30 * (0.5 + strength * 0.5), t0 + 0.04);
    og.gain.exponentialRampToValueAtTime(0.001, t0 + 1.1);
    osc.connect(og).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 1.2);

    // biwa phrase as the front passes the player
    const tw = t0 + Math.max(delay, 0.05);
    const notes = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      this.playPluck(tw + i * (0.12 + Math.random() * 0.14), 0.85 + Math.random() * 0.5, 0.34 - i * 0.07);
    }
  }

  flap(): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const offset = Math.random() * 1.5;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.1;
    f.frequency.setValueAtTime(750, t0);
    f.frequency.exponentialRampToValueAtTime(170, t0 + 0.24);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t0);
    g.gain.exponentialRampToValueAtTime(0.13, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.26);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, offset, 0.3);
  }

  /** Per-frame wind modulation. */
  wind(speed: number): void {
    if (!this.ctx || !this.windGain || !this.windFilter) return;
    const t = this.ctx.currentTime;
    const target = Math.min(0.015 + (speed / 30) * 0.13, 0.15);
    this.windGain.gain.setTargetAtTime(target, t, 0.18);
    this.windFilter.frequency.setTargetAtTime(170 + speed * 24, t, 0.2);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.1);
    }
  }
}
