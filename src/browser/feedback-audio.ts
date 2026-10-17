import Phaser from 'phaser';
import type { FeedbackKind, SoundCue } from '../presentation/feedback.js';

const kinds: readonly FeedbackKind[] = ['explosion', 'break', 'pickup', 'elimination'];
const keyFor = (theme: string, kind: FeedbackKind) => `feedback:${theme}:${kind}`;
export function preloadFeedbackAudio(scene: Phaser.Scene): void {
  for (const theme of ['candy', 'factory']) for (const kind of kinds) {
    const key = keyFor(theme, kind);
    if (!scene.cache.audio.exists(key)) scene.load.audio(key, `./audio/${theme}-${kind}.wav`);
  }
}

/** At most eight run-owned voices. Locked/missing audio is skipped, never queued for later. */
export class FeedbackAudio {
  private readonly voices = new Set<Phaser.Sound.BaseSound>();
  private played = 0;
  private disposed = false;
  constructor(private readonly scene: Phaser.Scene, private readonly theme: string) {}
  play(cues: readonly SoundCue[]): void {
    if (this.disposed || this.scene.sound.locked) return;
    for (const cue of cues) {
      const key = keyFor(this.theme, cue.kind);
      if (!this.scene.cache.audio.exists(key) || cue.volume <= 0) continue;
      if (this.voices.size >= 8) { const oldest = this.voices.values().next().value!; this.voices.delete(oldest); oldest.destroy(); }
      const sound = this.scene.sound.add(key);
      this.voices.add(sound);
      sound.once(Phaser.Sound.Events.COMPLETE, () => { this.voices.delete(sound); sound.destroy(); });
      if (sound.play({ volume: cue.volume })) this.played++;
      else { this.voices.delete(sound); sound.destroy(); }
    }
  }
  stop(): void { for (const voice of this.voices) voice.destroy(); this.voices.clear(); }
  dispose(): void { this.stop(); this.disposed = true; }
  read() { return { played: this.played, voices: this.voices.size, locked: this.scene.sound.locked,
    available: kinds.every(kind => this.scene.cache.audio.exists(keyFor(this.theme, kind))) }; }
}
