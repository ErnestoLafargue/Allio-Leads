interface AudioSettings {
  enabled: boolean;
  volume: number;
  zoneStart: boolean;
  zoneWarning: boolean;
  zoneEnding: boolean;
  endOfDay: boolean;
}

class AudioManager {
  private audioContext: AudioContext | null = null;
  private settings: AudioSettings;

  constructor() {
    this.settings = this.loadSettings();
    this.initializeAudioContext();
    this.unlockOnFirstInteraction();
  }

  /**
   * Browsere starter lyd i "pause", indtil brugeren har klikket eller trykket på en tast på siden.
   * Vi låser lyden op ved første klik, så de automatiske zonelyde kan spille senere.
   */
  private unlockOnFirstInteraction(): void {
    const unlock = () => {
      if (this.audioContext?.state === 'suspended') void this.audioContext.resume();
      if (this.audioContext?.state === 'running') {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  /** Om browseren tillader lyd lige nu (false indtil man har klikket på siden). */
  isUnlocked(): boolean {
    return this.audioContext?.state === 'running';
  }

  private loadSettings(): AudioSettings {
    const saved = localStorage.getItem('audioSettings');
    return saved ? JSON.parse(saved) : {
      enabled: true,
      volume: 0.5,
      zoneStart: true,
      zoneWarning: true,
      zoneEnding: true,
      endOfDay: true
    };
  }

  private saveSettings(): void {
    localStorage.setItem('audioSettings', JSON.stringify(this.settings));
  }

  private async initializeAudioContext(): Promise<void> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (error) {
      console.warn('Audio context not supported:', error);
    }
  }

  private async createTone(frequency: number, duration: number, type: OscillatorType = 'sine', envelope: 'smooth' | 'sharp' | 'fade' = 'smooth'): Promise<void> {
    if (!this.audioContext || !this.settings.enabled) return;

    // Resume context if suspended (required for user gesture)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    oscillator.type = type;

    // Different envelope shapes for variety
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    
    switch (envelope) {
      case 'sharp':
        gainNode.gain.linearRampToValueAtTime(this.settings.volume * 0.4, this.audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
        break;
      case 'fade':
        gainNode.gain.linearRampToValueAtTime(this.settings.volume * 0.2, this.audioContext.currentTime + 0.1);
        gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + duration);
        break;
      default: // smooth
        gainNode.gain.linearRampToValueAtTime(this.settings.volume * 0.3, this.audioContext.currentTime + 0.05);
        gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + duration);
    }

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  private async createSweep(startFreq: number, endFreq: number, duration: number, type: OscillatorType = 'sine'): Promise<void> {
    if (!this.audioContext || !this.settings.enabled) return;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFreq, this.audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(endFreq, this.audioContext.currentTime + duration);

    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(this.settings.volume * 0.3, this.audioContext.currentTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + duration);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  private async playSequence(notes: Array<{freq: number, duration: number, type?: OscillatorType, envelope?: 'smooth' | 'sharp' | 'fade'}>, gap = 0.05): Promise<void> {
    let currentTime = 0;
    for (const note of notes) {
      setTimeout(() => {
        this.createTone(note.freq, note.duration, note.type || 'sine', note.envelope || 'smooth');
      }, currentTime * 1000);
      currentTime += note.duration + gap;
    }
  }

  async playZoneStart(): Promise<void> {
    if (!this.settings.zoneStart) return;
    // Bright, energetic ascending melody with triangle wave
    await this.playSequence([
      { freq: 523, duration: 0.15, type: 'triangle', envelope: 'sharp' }, // C5
      { freq: 659, duration: 0.15, type: 'triangle', envelope: 'sharp' }, // E5  
      { freq: 784, duration: 0.25, type: 'triangle', envelope: 'smooth' }, // G5
      { freq: 1047, duration: 0.4, type: 'sine', envelope: 'fade' }        // C6
    ], 0.02);
  }

  async playZoneWarning(): Promise<void> {
    if (!this.settings.zoneWarning) return;
    // Gentle bell-like reminder with frequency sweep
    await this.createSweep(880, 440, 0.6, 'sine');
    setTimeout(() => this.createSweep(880, 440, 0.6, 'sine'), 200);
  }

  async playZoneEnding(): Promise<void> {
    if (!this.settings.zoneEnding) return;
    // Urgent staccato pattern with square wave
    await this.playSequence([
      { freq: 698, duration: 0.1, type: 'square', envelope: 'sharp' },
      { freq: 698, duration: 0.1, type: 'square', envelope: 'sharp' },
      { freq: 830, duration: 0.15, type: 'square', envelope: 'sharp' },
      { freq: 830, duration: 0.15, type: 'square', envelope: 'sharp' },
      { freq: 987, duration: 0.3, type: 'sawtooth', envelope: 'fade' }
    ], 0.1);
  }

  async playEndOfDay(): Promise<void> {
    if (!this.settings.endOfDay) return;
    // Triumphant major chord progression
    await this.playSequence([
      { freq: 523, duration: 0.4, type: 'sine', envelope: 'smooth' },    // C
      { freq: 659, duration: 0.4, type: 'sine', envelope: 'smooth' },    // E
      { freq: 784, duration: 0.4, type: 'sine', envelope: 'smooth' },    // G
      { freq: 1047, duration: 0.8, type: 'triangle', envelope: 'fade' }   // C (octave)
    ], 0.1);
  }

  async playSpillover(): Promise<void> {
    if (!this.settings.zoneWarning) return;
    // Distinctive wobbling tone with sawtooth wave
    await this.createSweep(300, 600, 0.3, 'sawtooth');
    setTimeout(() => this.createSweep(600, 300, 0.3, 'sawtooth'), 100);
    setTimeout(() => this.createSweep(300, 600, 0.3, 'sawtooth'), 200);
  }

  setEnabled(enabled: boolean): void {
    this.settings.enabled = enabled;
    this.saveSettings();
  }

  setVolume(volume: number): void {
    this.settings.volume = Math.max(0, Math.min(1, volume));
    this.saveSettings();
  }

  setSoundType(type: keyof Omit<AudioSettings, 'enabled' | 'volume'>, enabled: boolean): void {
    this.settings[type] = enabled;
    this.saveSettings();
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  // Test method for settings
  async testSound(type: 'zoneStart' | 'zoneWarning' | 'zoneEnding' | 'endOfDay' | 'spillover'): Promise<void> {
    const originalSetting = this.settings[type === 'spillover' ? 'zoneWarning' : type];
    this.settings[type === 'spillover' ? 'zoneWarning' : type] = true;
    
    switch (type) {
      case 'zoneStart':
        await this.playZoneStart();
        break;
      case 'zoneWarning':
        await this.playZoneWarning();
        break;
      case 'zoneEnding':
        await this.playZoneEnding();
        break;
      case 'endOfDay':
        await this.playEndOfDay();
        break;
      case 'spillover':
        await this.playSpillover();
        break;
    }
    
    this.settings[type === 'spillover' ? 'zoneWarning' : type] = originalSetting;
  }
}

export const audioManager = new AudioManager();