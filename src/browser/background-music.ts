import { readFeedbackSettings } from './feedback-settings.js';

/** One application-owned streaming track, independent of run-owned event sounds. */
export class BackgroundMusic {
  private readonly audio = document.createElement('audio');
  private readonly abort = new AbortController();
  private activated = false;
  private allowed = false;
  private pending = false;
  private blocked = false;
  private disposed = false;

  constructor() {
    this.audio.src = './audio/fbi-bgm.mp3'; this.audio.loop = true; this.audio.preload = 'metadata';
    this.audio.hidden = true; this.audio.dataset.backgroundMusic = 'true';
    this.audio.volume = readFeedbackSettings().musicVolume;
    const { signal } = this.abort;
    const activate = () => { this.activated = true; this.blocked = false; this.refreshVolume(); };
    // Capture sees gestures inside the modal, whose keyboard events stop bubbling.
    window.addEventListener('pointerdown', activate, { capture: true, signal });
    window.addEventListener('keydown', activate, { capture: true, signal });
    for (const event of ['playing', 'pause', 'timeupdate', 'loadedmetadata', 'volumechange', 'error']) this.audio.addEventListener(event, () => this.record(), { signal });
    document.getElementById('game')!.append(this.audio); this.record();
  }

  present(allowed: boolean): void {
    if (this.disposed) return;
    if (allowed && !this.allowed) this.blocked = false;
    this.allowed = allowed; this.refreshVolume();
  }

  refreshVolume(): void {
    if (this.disposed) return;
    const volume = readFeedbackSettings().musicVolume;
    if (this.audio.volume !== volume) this.audio.volume = volume;
    if (!this.shouldPlay()) {
      if (!this.audio.paused) this.audio.pause();
    } else if (this.audio.paused && !this.pending && !this.blocked) {
      this.pending = true;
      void this.audio.play().catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) this.blocked = true;
      }).finally(() => {
        this.pending = false;
        if (this.disposed || !this.shouldPlay()) this.audio.pause();
        if (!this.disposed) this.record();
      });
    }
    this.record();
  }

  private shouldPlay(): boolean { return this.allowed && this.activated && this.audio.volume > 0; }
  private record(): void {
    this.audio.dataset.state = this.audio.error ? 'error' : this.blocked ? 'blocked' : this.audio.paused ? 'paused' : 'playing';
    this.audio.dataset.volume = String(this.audio.volume);
    this.audio.dataset.position = this.audio.currentTime.toFixed(3);
    this.audio.dataset.duration = Number.isFinite(this.audio.duration) ? this.audio.duration.toFixed(3) : '';
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.abort.abort(); this.audio.pause();
    this.audio.removeAttribute('src'); this.audio.load(); this.audio.remove();
  }
}
