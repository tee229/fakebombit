import type { SoundCue } from '../presentation/feedback.js';

type AudioHost = Pick<WechatMinigame.Wx, 'createInnerAudioContext'>;
export class NativeAudio {
  private music: WechatMinigame.InnerAudioContext | undefined;
  private effects: { audio: WechatMinigame.InnerAudioContext; busy: boolean }[] = [];
  private unlocked = false;
  private desired = false;
  private musicPlaying = false;
  private theme = 'candy';
  private failures = 0;
  constructor(private readonly host: AudioHost) {
    try {
      const audio = host.createInnerAudioContext();
      audio.src = 'audio/fbi-bgm.mp3'; audio.loop = true; audio.volume = .35;
      audio.onPlay(() => { this.musicPlaying = true; });
      audio.onPause(() => { this.musicPlaying = false; });
      audio.onStop(() => { this.musicPlaying = false; });
      audio.onError(() => { this.musicPlaying = false; this.failures++; });
      this.music = audio;
    } catch { this.failures++; }
  }
  unlock(): void { this.unlocked = true; }
  sync(active: boolean, volume: number): void {
    const desired = this.unlocked && active && volume > 0;
    try {
      if (this.music) this.music.volume = volume;
      if (desired !== this.desired) { if (desired) this.music?.play(); else this.music?.pause(); }
    } catch { this.failures++; }
    this.desired = desired;
  }
  begin(theme: string): void { this.endRun(); this.theme = theme; }
  play(cues: readonly SoundCue[]): void {
    if (!this.unlocked) return;
    for (const cue of cues.slice(0, 6)) {
      try {
        let slot = this.effects.find(value => !value.busy);
        if (!slot && this.effects.length < 6) {
          const audio = this.host.createInnerAudioContext({ useWebAudioImplement: true });
          slot = { audio, busy: false }; const owned = slot;
          audio.onEnded(() => { owned.busy = false; });
          audio.onError(() => { owned.busy = false; this.failures++; });
          this.effects.push(slot);
        }
        if (!slot) continue;
        const file = cue.kind === 'explosion' ? 'explosion' : cue.kind === 'elimination' ? 'elimination' : cue.kind === 'pickup' ? 'pickup' : 'break';
        slot.audio.src = `audio/${this.theme}-${file}.wav`; slot.audio.volume = cue.volume;
        slot.busy = true; slot.audio.play();
      } catch { this.failures++; }
    }
  }
  stopEffects(): void { for (const slot of this.effects) { try { slot.audio.stop(); } catch { /* Optional audio must not affect gameplay. */ } slot.busy = false; } }
  endRun(): void { this.stopEffects(); for (const slot of this.effects) { try { slot.audio.destroy(); } catch { /* Already released by the host. */ } } this.effects = []; }
  read() { return Object.freeze({ musicInstances: this.music ? 1 : 0, musicPlaying: this.musicPlaying, effectInstances: this.effects.length, playingEffects: this.effects.filter(x => x.busy).length, failures: this.failures }); }
  dispose(): void { this.endRun(); this.music?.destroy(); this.music = undefined; }
}
