import Phaser from 'phaser';
import { withSkin, type SkinPackage, type ThemePackage } from '../resources/index.js';
import { builtinThemes } from '../resources/builtin-themes.js';
import { builtinSkins } from '../resources/builtin-skins.js';
import type { GameFlow, GameFlowState } from '../game-flow/index.js';
import { diagnosticPackage } from './app-resources.js';
import { appearance, toggleAppearance } from './appearance.js';
import { icon } from './ui-icons.js';

export function preloadMenu(scene: Phaser.Scene): void {
  for (const skin of builtinSkins) if (!scene.textures.exists(`skin-preview:${skin.id}`)) scene.load.image(`skin-preview:${skin.id}`, `./skins/${skin.id}-preview.svg`);
}

/** Real menu controls overlay the engine; resource and match ownership stays in GameFlow. */
export class ThemeMenu {
  private readonly root = document.createElement('section');
  private rendered = '';
  private note = '';
  private readonly keyDown: (event: KeyboardEvent) => void;
  constructor(private readonly scene: Phaser.Scene, private readonly flow: GameFlow<HTMLImageElement>, openSettings: () => void) {
    this.root.className = 'theme-menu'; this.root.setAttribute('aria-label', '选择地图和角色');
    this.root.innerHTML = `<div class="menu-corner menu-corner-left"><button type="button" class="icon-button menu-settings" aria-label="打开设置">${icon('settings')}</button></div>
      <button type="button" class="icon-button menu-appearance menu-corner" aria-label="切换明暗"></button>
      <div class="selection-screen"><img class="menu-wordmark" src="./ui/wordmark.png" alt="Fake Bomb It" draggable="false">
        <div class="menu-stage"><button type="button" class="theme-option" data-theme="candy"><img alt="" draggable="false"><strong>糖果乐园</strong></button>
          <div class="skin-stage" role="group" aria-label="角色皮肤">${builtinSkins.map(skin => `<button type="button" class="skin-option" data-skin="${skin.id}"><img src="./skins/${skin.id}-preview.svg" alt="" draggable="false"><span>${skin.label}</span></button>`).join('')}</div>
          <button type="button" class="theme-option" data-theme="factory"><img alt="" draggable="false"><strong>玩具工厂</strong></button></div>
        <button type="button" class="primary-button start-game">${icon('play')}<span>开始游戏</span></button>
        <p class="menu-hint">左右选主题 · 上下选皮肤 · Enter 开始</p></div>
      <section class="preparation-screen" hidden aria-live="polite"><h1></h1><p class="preparation-description"></p><p class="preparation-error"></p><div class="preparation-actions"><button type="button" class="primary-button prepare-retry">重试准备</button><button type="button" class="secondary-button prepare-cancel">返回菜单</button></div></section>`;
    this.root.querySelector('.menu-settings')!.addEventListener('click', openSettings);
    this.root.querySelector('.menu-appearance')!.addEventListener('click', toggleAppearance);
    this.root.querySelector('.start-game')!.addEventListener('click', () => { void flow.start(); });
    this.root.querySelector('.prepare-retry')!.addEventListener('click', () => { void flow.retry(); });
    this.root.querySelector('.prepare-cancel')!.addEventListener('click', () => this.cancel());
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-theme]')) button.addEventListener('click', () => this.choose(builtinThemes.find(t => t.id === button.dataset.theme)!, this.skin()));
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-skin]')) button.addEventListener('click', () => this.choose(this.theme(), builtinSkins.find(s => s.id === button.dataset.skin)!));
    document.getElementById('game')!.append(this.root);
    this.keyDown = event => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || (event.target instanceof Element && event.target.closest('button,input,dialog'))) return;
      const phase = flow.read().phase;
      if (phase === 'preparing' && event.code === 'Escape') { event.preventDefault(); this.cancel(); }
      else if (phase === 'menu' || phase === 'failed') {
        if (event.code === 'Enter') { event.preventDefault(); void (phase === 'failed' ? flow.retry() : flow.start()); }
        else if (phase === 'menu' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
          event.preventDefault();
          if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') this.choose(builtinThemes.find(theme => theme.id !== this.theme().id)!, this.skin());
          else this.choose(this.theme(), builtinSkins.find(skin => skin.id !== this.skin().id)!);
        } else if (phase === 'menu' && event.code === 'KeyN') { event.preventDefault(); flow.newMatch(); this.note = '已选择新种子'; }
        else if (phase === 'failed' && event.code === 'Escape') { event.preventDefault(); flow.returnToMenu(); }
      }
    };
    window.addEventListener('keydown', this.keyDown);
  }
  private theme(): ThemePackage { return builtinThemes.find(theme => theme.id === this.flow.read().selection.id) ?? builtinThemes[0]!; }
  private skin(): SkinPackage { return builtinSkins.find(skin => skin.id === this.flow.read().selection.skin?.id) ?? builtinSkins[0]!; }
  private choose(theme: ThemePackage, skin: SkinPackage): void { this.note = ''; this.flow.select(diagnosticPackage(withSkin(theme, skin))); }
  private cancel(): void { this.note = '准备已取消，可重新选择'; this.flow.returnToMenu(); }
  hide(): void { this.root.hidden = true; this.rendered = ''; this.note = ''; }
  present(state: GameFlowState<HTMLImageElement>): void {
    if (state.run || state.phase === 'disposed') { this.hide(); return; }
    this.root.hidden = false;
    const key = JSON.stringify([state.phase, state.selection.id, state.selection.skin?.id, state.error?.message, state.preparationId, this.note, appearance().mode]);
    if (key === this.rendered) return; this.rendered = key;
    const canvas = this.scene.game.canvas;
    canvas.dataset.phase = state.phase === 'menu' ? 'selecting' : state.phase;
    canvas.dataset.theme = state.selection.id; canvas.dataset.skin = state.selection.skin?.id ?? '';
    const selecting = state.phase === 'menu';
    this.root.querySelector<HTMLElement>('.selection-screen')!.hidden = !selecting;
    this.root.querySelector<HTMLElement>('.preparation-screen')!.hidden = selecting;
    this.root.querySelector<HTMLButtonElement>('.menu-settings')!.disabled = !selecting;
    const light = appearance().mode === 'light', toggle = this.root.querySelector<HTMLButtonElement>('.menu-appearance')!;
    toggle.innerHTML = icon(light ? 'sun' : 'moon'); toggle.setAttribute('aria-label', light ? '切换为暗色主题' : '切换为亮色主题');
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-theme]')) {
      button.setAttribute('aria-pressed', String(button.dataset.theme === this.theme().id));
      button.querySelector('img')!.src = `./themes/${button.dataset.theme}${light ? '' : '-dark'}-preview.svg`;
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-skin]')) button.setAttribute('aria-pressed', String(button.dataset.skin === this.skin().id));
    this.root.querySelector('.menu-hint')!.textContent = this.note || '左右选主题 · 上下选皮肤 · Enter 开始';
    const failed = state.phase === 'failed';
    this.root.querySelector('.preparation-screen h1')!.textContent = failed ? '无法开始本局' : `正在准备${this.theme().label}`;
    this.root.querySelector('.preparation-description')!.textContent = failed ? '资源准备失败，对局尚未开始。' : '正在准备明暗外观与角色，完成后开始计时。';
    this.root.querySelector('.preparation-error')!.textContent = state.error?.message ?? '';
    this.root.querySelector<HTMLButtonElement>('.prepare-retry')!.hidden = !failed;
    this.root.querySelector('.prepare-cancel')!.textContent = failed ? '返回菜单' : '取消准备';
    canvas.dataset.preparation = String(state.preparationId ?? ''); canvas.dataset.error = state.error?.message ?? '';
    const message = selecting ? `当前主题：${this.theme().label}，角色：${this.skin().label}。左右选主题，上下选皮肤，Enter开始。` : failed ? `准备失败：${state.error?.message ?? ''}` : '正在准备资源，Escape取消。';
    canvas.setAttribute('aria-label', message);
    const status = document.getElementById('game-status'); if (status) status.textContent = message;
  }
  destroy(): void { this.root.remove(); window.removeEventListener('keydown', this.keyDown); }
}
