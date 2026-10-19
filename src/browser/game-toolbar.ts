import { appearance, toggleAppearance } from './appearance.js';
import { cycleParticles, cycleVolume, feedbackLabels } from './feedback-settings.js';

const paths = {
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m9 5 10 7-10 7Z"/>',
  fullscreen: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
  restore: '<path d="M4 9h5V4m6 0v5h5M9 20v-5H4m16 0h-5v5"/>',
  settings: '<path d="m9 3-1 3-3 1-2 4 2 2v4l4 2 3-1 3 1 4-2v-4l2-2-2-4-3-1-1-3Z"/><circle cx="12" cy="11" r="3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  moon: '<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
} as const;
type Icon = keyof typeof paths;
const icon = (name: Icon) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
type Commands = { pause(): void; resume(): void; fullscreen(): void; switchView(): void; menu(): void; focusCanvas(): void };

/** Accessible chrome owns its DOM, focus and modal input boundary. */
export class GameToolbar {
  private readonly root = document.createElement('div');
  private readonly dialog = document.createElement('dialog');
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly volume = document.createElement('button');
  private readonly particles = document.createElement('button');
  private playing = false;
  private stateKey = '';

  constructor(private readonly commands: Commands) {
    this.root.className = 'game-toolbar'; this.root.setAttribute('role', 'group'); this.root.setAttribute('aria-label', '游戏工具');
    const actions = [() => { if (this.playing) commands.pause(); else commands.resume(); }, () => commands.fullscreen(),
      () => this.open(), () => toggleAppearance(), () => commands.switchView()];
    for (const action of actions) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-button';
      button.addEventListener('click', event => { action(); if (event.detail > 0 && !this.dialog.open) commands.focusCanvas(); });
      this.buttons.push(button); this.root.append(button);
    }
    this.dialog.className = 'game-settings'; this.dialog.setAttribute('aria-labelledby', 'settings-title');
    this.dialog.innerHTML = `<header><h2 id="settings-title">设置</h2><button type="button" class="icon-button" aria-label="关闭设置">${icon('close')}</button></header><p>调整声音和画面反馈，对局已暂停。</p><div class="settings-options"></div><footer><button type="button" class="settings-menu">返回菜单</button><button type="button" class="settings-done">完成</button></footer>`;
    this.volume.type = this.particles.type = 'button';
    this.volume.addEventListener('click', () => { cycleVolume(); this.refresh(); });
    this.particles.addEventListener('click', () => { cycleParticles(); this.refresh(); });
    this.dialog.querySelector('.settings-options')!.append(this.volume, this.particles);
    this.dialog.querySelector('header button')!.addEventListener('click', () => this.close());
    this.dialog.querySelector('.settings-done')!.addEventListener('click', () => this.close());
    this.dialog.querySelector('.settings-menu')!.addEventListener('click', () => { this.close(); commands.menu(); });
    this.dialog.addEventListener('keydown', event => { event.stopPropagation(); });
    this.dialog.addEventListener('keyup', event => { event.stopPropagation(); });
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.dialog.addEventListener('close', () => commands.focusCanvas());
    for (const event of ['keydown', 'keyup']) this.root.addEventListener(event, event => event.stopPropagation());
    document.getElementById('game')!.append(this.root, this.dialog); this.refresh();
    this.present('menu', 'normal', false);
  }

  isOpen(): boolean { return this.dialog.open; }
  private refresh(): void { const labels = feedbackLabels(); this.volume.textContent = labels.volume; this.particles.textContent = labels.particles; }
  private open(): void { this.commands.pause(); this.refresh(); this.dialog.showModal(); }
  private close(): void { this.dialog.close(); }
  present(phase: string, view: string, blocked: boolean): void {
    this.playing = phase === 'playing';
    const key = `${phase}:${view}:${blocked}:${appearance().mode}:${Boolean(document.fullscreenElement)}`;
    if (key === this.stateKey) return; this.stateKey = key;
    const run = ['playing', 'paused', 'ended'].includes(phase);
    this.root.hidden = !run || blocked;
    if (!run && this.dialog.open) this.close();
    const full = Boolean(document.fullscreenElement), light = appearance().mode === 'light', entities = view === 'entities';
    const items: [Icon, string][] = [[this.playing ? 'pause' : 'play', this.playing ? '暂停游戏' : '继续游戏'],
      [full ? 'restore' : 'fullscreen', full ? '退出全屏' : '进入全屏'], ['settings', '打开设置'],
      [light ? 'moon' : 'sun', light ? '切换为暗色主题' : '切换为亮色主题'], ['layers', entities ? '切换为正常画面' : '切换为实体层']];
    items.forEach(([name, label], index) => { const button = this.buttons[index]!;
      button.innerHTML = icon(name); button.setAttribute('aria-label', label); button.title = label;
    });
    this.buttons[0]!.disabled = phase === 'ended';
    this.buttons[1]!.setAttribute('aria-pressed', String(full));
    this.buttons[3]!.setAttribute('aria-pressed', String(light));
    this.buttons[4]!.setAttribute('aria-pressed', String(entities));
  }
  destroy(): void { this.dialog.remove(); this.root.remove(); }
}
