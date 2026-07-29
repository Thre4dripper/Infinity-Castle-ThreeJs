/**
 * Audio: the attached Infinity Castle theme loops on a music bus, the attached
 * entrance sting plays as you take wing, and everything else is zero-asset
 * WebAudio synthesis on an sfx bus:
 *  - a CONSTANT construction soundscape while the world generates — a bed of
 *    groaning timber and settling stone whose level follows the build rate,
 *    plus a dense stream of clacks, sliding shoji and hammering
 *  - biwa plucks + taiko boom on castle reconfiguration beats
 *  - filtered-noise wind, wing flaps, collision knocks
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private musicEl: HTMLAudioElement | null = null;
  private enterBuf: AudioBuffer | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private plucks: AudioBuffer[] = [];
  private sfxVol = 0.9;
  private musicVol = 0.65;
  // construction bed gains, driven every frame by the build rate
  private bedRumble: GainNode | null = null;
  private bedCreak: GainNode | null = null;
  private bedAir: GainNode | null = null;
  private nextShot = 0;
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
    this.master.gain.value = this.muted ? 0 : 1;
    // a gentle compressor glues sfx to the mastered theme and stops clipping
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 18;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    this.master.connect(comp).connect(ctx.destination);
    // two buses so the player can mix the theme against the foley
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVol * this.sfxVol * 1.5;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicVol * this.musicVol * 0.75;
    this.music.connect(this.master);

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
    src.connect(this.windFilter).connect(this.windGain).connect(this.sfx);
    src.start();

    // biwa plucks — hirajōshi-ish scale
    for (const f of [146.83, 174.61, 196.0, 220.0, 293.66]) {
      this.plucks.push(this.renderPluck(ctx, f));
    }

    // the attached castle-entrance sting (relative path — survives subpath
    // deployments like GitHub Pages)
    void fetch('enter.mp3')
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => { this.enterBuf = buf; })
      .catch(() => { /* file missing — enter silently */ });

    // ---- the construction bed: three always-running loops, gain-driven ----
    // low timber rumble
    {
      const src = ctx.createBufferSource();
      src.buffer = nb;
      src.loop = true;
      src.playbackRate.value = 0.32;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 230;
      this.bedRumble = ctx.createGain();
      this.bedRumble.gain.value = 0;
      src.connect(f).connect(this.bedRumble).connect(this.sfx);
      src.start();
    }
    // groaning beams — a slow-wobbling resonance
    {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 61;
      const lfoF = ctx.createOscillator();
      lfoF.frequency.value = 0.13;
      const lfoFG = ctx.createGain();
      lfoFG.gain.value = 9;
      lfoF.connect(lfoFG).connect(osc.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 330;
      f.Q.value = 7;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.61;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 130;
      lfo.connect(lfoG).connect(f.frequency);
      this.bedCreak = ctx.createGain();
      this.bedCreak.gain.value = 0;
      osc.connect(f).connect(this.bedCreak).connect(this.sfx);
      osc.start();
      lfo.start();
      lfoF.start();
    }
    // dust and grit sifting between the boards
    {
      const src = ctx.createBufferSource();
      src.buffer = nb;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2600;
      f.Q.value = 0.8;
      this.bedAir = ctx.createGain();
      this.bedAir.gain.value = 0;
      src.connect(f).connect(this.bedAir).connect(this.sfx);
      src.start();
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
    if (!this.ctx || !this.sfx || this.plucks.length === 0) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.plucks[Math.floor(Math.random() * this.plucks.length)];
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.sfx);
    src.start(when);
  }

  /** Loop the attached theme forever on the music bus. */
  startMusic(url: string): void {
    if (!this.ctx || !this.music) return;
    if (this.musicEl) {
      void this.musicEl.play().catch(() => { /* still blocked */ });
      return;
    }
    const el = new Audio(url);
    el.loop = true;
    el.preload = 'auto';
    this.musicEl = el;
    const node = this.ctx.createMediaElementSource(el);
    node.connect(this.music);
    void el.play().catch(() => { /* file missing — the castle stays quiet */ });
  }

  /** The attached entrance sting — the castle swallowing you. */
  enterSound(): void {
    const play = () => {
      if (!this.ctx || !this.sfx || !this.enterBuf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.enterBuf;
      const g = this.ctx.createGain();
      g.gain.value = 0.95;
      src.connect(g).connect(this.sfx);
      src.start();
    };
    if (this.enterBuf) play();
    else window.setTimeout(play, 350); // decode may still be in flight
  }

  /**
   * THE WORLD IS ALWAYS BUILDING — and it should always be heard.
   * Call every frame with the smoothed build rate (cells/second). The bed
   * loops swell with the rate, and discrete carpentry — clacks, sliding
   * shoji, hammering, settling stone — streams as fast as the castle grows.
   */
  construction(rate: number): void {
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime;
    const level = Math.min(rate / 6, 1);
    this.bedRumble?.gain.setTargetAtTime(level * 0.42, t, 0.25);
    this.bedCreak?.gain.setTargetAtTime(Math.min(rate / 9, 1) * 0.13, t, 0.4);
    this.bedAir?.gain.setTargetAtTime(level * 0.055, t, 0.3);

    // one-shot carpentry, denser the faster the world grows
    if (rate < 0.15 || t < this.nextShot) return;
    this.nextShot = t + Math.min(Math.max(0.7 / (0.4 + rate * 0.35), 0.06), 1.0)
      * (0.75 + Math.random() * 0.5);
    this.carpentry(0.35 + level * 0.65);
  }

  /** One randomized construction hit. */
  private carpentry(intensity: number): void {
    if (!this.ctx || !this.sfx || !this.noiseBuf) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const amp = 0.3 + intensity * 0.5;
    const pan = ctx.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 1.4;
    pan.connect(this.sfx);
    const r = Math.random();

    if (r < 0.3) {
      // timbers knocking into place — hard double clack
      const knocks = Math.random() < 0.55 ? 2 : 1;
      for (let i = 0; i < knocks; i++) {
        const at = t0 + i * (0.08 + Math.random() * 0.06);
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 650 + Math.random() * 1100;
        f.Q.value = 8;
        const g = ctx.createGain();
        g.gain.setValueAtTime(amp * (1 - i * 0.3), at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
        src.connect(f).connect(g).connect(pan);
        src.start(at, Math.random(), 0.13);
      }
      // wooden body resonance under the knock
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(190 + Math.random() * 90, t0);
      osc.frequency.exponentialRampToValueAtTime(95, t0 + 0.16);
      const og = ctx.createGain();
      og.gain.setValueAtTime(amp * 0.5, t0);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      osc.connect(og).connect(pan);
      osc.start(t0);
      osc.stop(t0 + 0.25);
    } else if (r < 0.48) {
      // rapid hammering — a carpenter somewhere in the ward
      const taps = 3 + Math.floor(Math.random() * 3);
      const gap = 0.07 + Math.random() * 0.035;
      const fq = 900 + Math.random() * 700;
      for (let i = 0; i < taps; i++) {
        const at = t0 + i * gap;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = fq * (1 + (Math.random() - 0.5) * 0.1);
        f.Q.value = 11;
        const g = ctx.createGain();
        g.gain.setValueAtTime(amp * 0.8 * (1 - i / (taps + 2)), at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
        src.connect(f).connect(g).connect(pan);
        src.start(at, Math.random(), 0.08);
      }
    } else if (r < 0.68) {
      // shoji sliding shut — a soft shhh ending in a frame thunk
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 2.2;
      f.frequency.setValueAtTime(380 + Math.random() * 220, t0);
      f.frequency.exponentialRampToValueAtTime(1150, t0 + 0.24);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(amp * 0.8, t0 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      src.connect(f).connect(g).connect(pan);
      src.start(t0, Math.random(), 0.32);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, t0 + 0.24);
      osc.frequency.exponentialRampToValueAtTime(68, t0 + 0.37);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t0 + 0.24);
      og.gain.exponentialRampToValueAtTime(amp, t0 + 0.26);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.44);
      osc.connect(og).connect(pan);
      osc.start(t0 + 0.24);
      osc.stop(t0 + 0.5);
    } else if (r < 0.86) {
      // old beam groaning as it takes the weight
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const base = 78 + Math.random() * 46;
      osc.frequency.setValueAtTime(base, t0);
      osc.frequency.linearRampToValueAtTime(base * (0.8 + Math.random() * 0.12), t0 + 0.42);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 290 + Math.random() * 190;
      f.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(amp * 0.55, t0 + 0.1);
      g.gain.setValueAtTime(amp * 0.45, t0 + 0.28);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      osc.connect(f).connect(g).connect(pan);
      osc.start(t0);
      osc.stop(t0 + 0.55);
    } else {
      // masonry dropping into place — grit plus a sub thump
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.playbackRate.value = 0.45;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 190;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(amp * 1.15, t0 + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      src.connect(f).connect(g).connect(pan);
      src.start(t0, Math.random(), 0.6);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(56, t0);
      osc.frequency.exponentialRampToValueAtTime(33, t0 + 0.35);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t0);
      og.gain.exponentialRampToValueAtTime(amp * 0.7, t0 + 0.04);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
      osc.connect(og).connect(pan);
      osc.start(t0);
      osc.stop(t0 + 0.5);
    }
  }

  setSfxVolume(v: number): void {
    this.sfxVol = v;
    if (this.sfx && this.ctx) {
      this.sfx.gain.setTargetAtTime(v * v * 1.5, this.ctx.currentTime, 0.08);
    }
  }

  setMusicVolume(v: number): void {
    this.musicVol = v;
    if (this.music && this.ctx) {
      this.music.gain.setTargetAtTime(v * v * 0.75, this.ctx.currentTime, 0.08);
    }
  }

  /** Castle reconfiguration beat: distant boom now, plucks when the wave front arrives. */
  beat(delay: number, strength: number): void {
    if (!this.ctx || !this.sfx) return;
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
    osc.connect(og).connect(this.sfx);
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
    if (!this.ctx || !this.sfx || !this.noiseBuf) return;
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
    src.connect(f).connect(g).connect(this.sfx);
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

  /** Clipping the architecture: a wooden knock plus a low body thud. */
  impact(strength: number): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime;
    const amp = Math.min(0.05 + strength * 0.01, 0.22);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t0);
    osc.frequency.exponentialRampToValueAtTime(60, t0 + 0.18);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.exponentialRampToValueAtTime(amp, t0 + 0.008);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    osc.connect(og).connect(this.sfx!);
    osc.start(t0);
    osc.stop(t0 + 0.35);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900 + Math.random() * 500;
    f.Q.value = 4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(amp * 0.6, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    src.connect(f).connect(g).connect(this.sfx!);
    src.start(t0, Math.random(), 0.2);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.1);
    }
  }
}
