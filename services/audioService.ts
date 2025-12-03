
// Ein einfacher Synthesizer für Soundeffekte und Musik ohne externe Dateien
export class AudioService {
  private ctx: AudioContext | null = null;
  private musicOscillators: OscillatorNode[] = [];
  private musicGain: GainNode | null = null;
  private isMuted: boolean = false;
  private isMusicPlaying: boolean = false;

  constructor() {
    // Context erst bei Interaktion initialisieren
  }

  private init() {
    if (!this.ctx) {
      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public startMusic() {
    this.init();
    if (this.isMusicPlaying || !this.ctx) return;

    this.isMusicPlaying = true;
    this.playThemeLoop();
  }

  public stopMusic() {
    this.isMusicPlaying = false;
    this.musicOscillators.forEach(osc => {
      try { osc.stop(); } catch(e){}
    });
    this.musicOscillators = [];
  }

  private playThemeLoop() {
    if (!this.ctx || !this.isMusicPlaying) return;

    // Einfache Melodie: C E G A G E C
    // BPM: 120 -> 1 Beat = 0.5s
    const t = this.ctx.currentTime;
    const notes = [
      { f: 261.63, d: 0.2, t: 0 },   // C4
      { f: 329.63, d: 0.2, t: 0.25 }, // E4
      { f: 392.00, d: 0.2, t: 0.5 },  // G4
      { f: 440.00, d: 0.4, t: 0.75 }, // A4
      { f: 392.00, d: 0.2, t: 1.25 }, // G4
      { f: 329.63, d: 0.2, t: 1.5 },  // E4
      { f: 261.63, d: 0.8, t: 1.75 }, // C4
      { f: 0, d: 0.5, t: 2.75 }       // Pause
    ];

    const loopLength = 3.0;

    // Master Gain für Musik
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.1;
    this.musicGain.connect(this.ctx.destination);

    notes.forEach(n => {
      if (n.f === 0) return;
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = n.f;
      
      const env = this.ctx!.createGain();
      env.gain.setValueAtTime(0, t + n.t);
      env.gain.linearRampToValueAtTime(0.1, t + n.t + 0.05);
      env.gain.exponentialRampToValueAtTime(0.001, t + n.t + n.d);
      
      osc.connect(env);
      env.connect(this.musicGain!);
      
      osc.start(t + n.t);
      osc.stop(t + n.t + n.d + 0.1);
      this.musicOscillators.push(osc);
    });

    // Loop
    setTimeout(() => {
      if (this.isMusicPlaying) this.playThemeLoop();
    }, loopLength * 1000);
  }

  public playJump() {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.3);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(t + 0.3);
  }

  public playSlide() {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.4);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.4);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(t + 0.4);
  }

  public playCoin() {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    
    // High ping
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.setValueAtTime(1800, t + 0.1);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(t + 0.3);
  }

  public playCrash() {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    
    // Noise approximation via creating random buffer or simple low freq messy wave
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(50, t);
    osc.frequency.linearRampToValueAtTime(20, t + 0.5);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(t + 0.5);
  }

  public playWhine() {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    // Dog whine simulation: Sine wave with vibrato falling in pitch
    const osc = this.ctx.createOscillator();
    const vibrato = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const vibratoGain = this.ctx.createGain();

    osc.type = 'sine';
    vibrato.type = 'sine';
    vibrato.frequency.value = 8; // Tremolo speed

    // Pitch drop: High whine to lower
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.6);

    // Vibrato depth
    vibratoGain.gain.value = 20; 
    
    // Connect vibrato to frequency of main osc
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);

    // Envelope
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    vibrato.start(t);
    osc.stop(t + 0.8);
    vibrato.stop(t + 0.8);
  }
}

export const audioManager = new AudioService();
