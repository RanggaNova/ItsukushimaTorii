// Procedural Web Audio Soundscape:
// Calm sea waves + misty wind + Gagaku/supernatural portal harmonics + vortex suction + dimensional click pulse.

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private seaFilter: BiquadFilterNode | null = null;
  private seaGain: GainNode | null = null;
  private suctionFilter: BiquadFilterNode | null = null;
  private suctionGain: GainNode | null = null;
  private portalDroneGain: GainNode | null = null;
  private subOscGain: GainNode | null = null;
  private droneOscs: OscillatorNode[] = [];

  public enabled = false;
  private initialized = false;

  private createPinkNoiseBuffer(ctx: AudioContext, seconds = 6): AudioBuffer {
    const bufferSize = ctx.sampleRate * seconds;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.035;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  public toggle(): boolean {
    if (!this.initialized) {
      this.init();
    }
    if (!this.ctx || !this.masterGain) return false;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.enabled = !this.enabled;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(this.enabled ? 0.55 : 0.0, now, 0.45);
    return this.enabled;
  }

  private init() {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(ctx.destination);
    this.masterGain = master;

    const noiseBuf = this.createPinkNoiseBuffer(ctx, 8);

    // 1. Calm Sea Waves Layer (Pink noise -> Lowpass modulated by slow ocean swell LFO)
    const seaSrc = ctx.createBufferSource();
    seaSrc.buffer = noiseBuf;
    seaSrc.loop = true;

    const seaFilter = ctx.createBiquadFilter();
    seaFilter.type = 'lowpass';
    seaFilter.frequency.value = 260;
    seaFilter.Q.value = 0.8;
    this.seaFilter = seaFilter;

    const seaLfo = ctx.createOscillator();
    seaLfo.type = 'sine';
    seaLfo.frequency.value = 0.11; // ~9-second calm ocean wave cycle
    const seaLfoDepth = ctx.createGain();
    seaLfoDepth.gain.value = 130;
    seaLfo.connect(seaLfoDepth);
    seaLfoDepth.connect(seaFilter.frequency);

    const seaGain = ctx.createGain();
    seaGain.gain.value = 0.42;
    this.seaGain = seaGain;

    seaSrc.connect(seaFilter);
    seaFilter.connect(seaGain);
    seaGain.connect(master);
    seaSrc.start();
    seaLfo.start();

    // 2. Mist Vortex Suction Layer (Bandpass noise sweeping as portal pulls mist inward)
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuf;
    windSrc.loop = true;
    windSrc.playbackRate.value = 0.85;

    const suctionFilter = ctx.createBiquadFilter();
    suctionFilter.type = 'bandpass';
    suctionFilter.frequency.value = 340;
    suctionFilter.Q.value = 3.2;
    this.suctionFilter = suctionFilter;

    const suctionGain = ctx.createGain();
    suctionGain.gain.value = 0.02;
    this.suctionGain = suctionGain;

    windSrc.connect(suctionFilter);
    suctionFilter.connect(suctionGain);
    suctionGain.connect(master);
    windSrc.start();

    // 3. Supernatural Portal Drone (Ethereal Japanese Sho-inspired harmonic cluster + sub-bass)
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.0;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 620;
    droneGain.connect(droneFilter);
    droneFilter.connect(master);
    this.portalDroneGain = droneGain;

    // D2 (73.42Hz), A2 (110Hz), E3 (164.81Hz), F3 (174.61Hz - mysterious Phrygian/In-sen interval)
    const freqs = [73.42, 110.0, 164.81, 174.61, 220.5];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx < 2 ? 'sine' : 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = idx < 2 ? 0.14 : 0.045;
      osc.connect(g);
      g.connect(droneGain);
      osc.start();
      this.droneOscs.push(osc);
    });

    // Deep dimensional sub-bass (36.71 Hz = D1)
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.value = 36.71;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.0;
    subOsc.connect(subGain);
    subGain.connect(master);
    subOsc.start();
    this.subOscGain = subGain;

    this.initialized = true;
  }

  public update(portalProgress: number, gateHover: number, cursorWaterSpeed: number) {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Modulate sea shimmer subtly with cursor water movement
    if (this.seaFilter && this.seaGain) {
      const rippleBoost = Math.min(180, cursorWaterSpeed * 45);
      this.seaFilter.frequency.setTargetAtTime(240 + rippleBoost - portalProgress * 90, now, 0.15);
      this.seaGain.gain.setTargetAtTime(0.42 - portalProgress * 0.14, now, 0.2);
    }

    // Mist suction sound rises as mist spirals into the portal
    if (this.suctionFilter && this.suctionGain) {
      const suctionAmt = Math.pow(portalProgress, 1.3);
      this.suctionGain.gain.setTargetAtTime(0.025 + suctionAmt * 0.34 + gateHover * 0.015, now, 0.15);
      this.suctionFilter.frequency.setTargetAtTime(260 + suctionAmt * 420, now, 0.15);
    }

    // Supernatural harmonic drone awakens from Stage 2 -> Stage 5
    if (this.portalDroneGain && this.subOscGain) {
      const droneAmt = Math.max(0, (portalProgress - 0.15) / 0.85);
      this.portalDroneGain.gain.setTargetAtTime(Math.pow(droneAmt, 1.6) * 0.55, now, 0.18);
      this.subOscGain.gain.setTargetAtTime(Math.pow(portalProgress, 2.0) * 0.40, now, 0.18);
    }
  }

  public triggerDimensionalPulse() {
    if (!this.initialized || !this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Deep resonant dimensional impact pulse when clicking open portal
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(92, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 1.6);

    g.gain.setValueAtTime(0.48, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 1.85);
  }

  public triggerSeasonChime(season: 'haru' | 'natsu' | 'aki' | 'fuyu') {
    if (!this.initialized || !this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Japanese Hirajōshi pentatonic koto/bell intervals per season
    const notesBySeason: Record<string, [number, number]> = {
      haru: [587.33, 880.0],  // D5 -> A5 (bright spring sakura)
      natsu: [523.25, 783.99], // C5 -> G5 (clear summer sea)
      aki: [440.0, 622.25],    // A4 -> Eb5 (wistful autumn dusk)
      fuyu: [392.0, 587.33],   // G4 -> D5 (crystalline winter)
    };
    const pair = notesBySeason[season] || [587.33, 880.0];

    pair.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const t0 = now + idx * 0.14;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0);

      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(0.11, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0005, t0 + 2.1);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t0);
      osc.stop(t0 + 2.2);
    });
  }

  public triggerLanternBell(isWish = false) {
    if (!this.initialized || !this.enabled || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Warm Shinto Rin singing-bowl / Suzu chime
    const partials = isWish ? [587.33, 880.0, 1174.66] : [523.25, 1046.5];
    partials.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const t0 = now + idx * (isWish ? 0.11 : 0.04);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0);

      const peak = (isWish ? 0.14 : 0.09) / (idx + 1);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(peak, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0004, t0 + (isWish ? 3.2 : 2.2));

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t0);
      osc.stop(t0 + 3.3);
    });
  }
}

export const soundEngine = new SoundEngine();
