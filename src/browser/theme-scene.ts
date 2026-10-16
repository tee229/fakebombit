import Phaser from 'phaser';
import { withSkin, type SkinPackage, type ThemePackage } from '../resources/index.js';
import { builtinThemes } from '../resources/builtin-themes.js';
import { builtinSkins } from '../resources/builtin-skins.js';
import type { GameFlow, GameFlowState } from '../game-flow/index.js';
import { diagnosticPackage } from './app-resources.js';

const font = '"Segoe UI", "Microsoft YaHei", sans-serif';

export function preloadMenu(scene: Phaser.Scene): void {
  for (const theme of builtinThemes) if (!scene.textures.exists(`preview:${theme.id}`)) scene.load.image(`preview:${theme.id}`, `./themes/${theme.id}-preview.svg`);
  for (const skin of builtinSkins) if (!scene.textures.exists(`skin-preview:${skin.id}`)) scene.load.image(`skin-preview:${skin.id}`, `./skins/${skin.id}-preview.svg`);
}

/** Canvas menu adapter. Business state and late-loading decisions belong to GameFlow. */
export class ThemeMenu {
  private content: Phaser.GameObjects.Container | undefined;
  private rendered = '';
  private note = '';
  private readonly keyDown: (event: KeyboardEvent) => void;
  constructor(private readonly scene: Phaser.Scene, private readonly flow: GameFlow<HTMLImageElement>) {
    this.keyDown = event => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      const phase = flow.read().phase;
      if (phase === 'preparing' && event.code === 'Escape') { event.preventDefault(); this.cancel(); }
      else if (phase === 'menu' || phase === 'failed') {
        if (event.code === 'Enter') { event.preventDefault(); void (phase === 'failed' ? flow.retry() : flow.start()); }
        else if (phase === 'menu' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
          event.preventDefault();
          if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') this.choose(builtinThemes.find(theme => theme.id !== this.theme().id)!, this.skin());
          else this.choose(this.theme(), builtinSkins.find(skin => skin.id !== this.skin().id)!);
        } else if (phase === 'menu' && event.code === 'KeyN') { event.preventDefault(); flow.newMatch(); this.note = '已选择新种子，可开始新对局。'; }
        else if (phase === 'failed' && event.code === 'Escape') { event.preventDefault(); flow.returnToMenu(); }
      }
    };
    window.addEventListener('keydown', this.keyDown);
  }
  private theme(): ThemePackage { return builtinThemes.find(theme => theme.id === this.flow.read().selection.id) ?? builtinThemes[0]!; }
  private skin(): SkinPackage { return builtinSkins.find(skin => skin.id === this.flow.read().selection.skin?.id) ?? builtinSkins[0]!; }
  private choose(theme: ThemePackage, skin: SkinPackage): void { this.note = ''; this.flow.select(diagnosticPackage(withSkin(theme, skin))); }
  private cancel(): void { this.note = '准备已取消，可重新选择。'; this.flow.returnToMenu(); }
  private text(x: number, y: number, value: string, size: number, color = '#eaf3ed'): Phaser.GameObjects.Text {
    const text = this.scene.add.text(x, y, value, { fontFamily: font, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5);
    this.content!.add(text); return text;
  }
  private button(x: number, y: number, width: number, label: string, action: () => void): void {
    const shape = this.scene.add.rectangle(x, y, width, 58, 0x83dfb6).setStrokeStyle(2, 0xa2edce).setInteractive({ useHandCursor: true });
    shape.on('pointerup', action); this.content!.add(shape); this.text(x, y, label, 22, '#102b2c');
  }
  hide(): void { this.content?.destroy(true); this.content = undefined; this.rendered = ''; this.note = ''; }
  present(state: GameFlowState<HTMLImageElement>): void {
    if (state.run || state.phase === 'disposed') { if (this.content) this.hide(); return; }
    const key = JSON.stringify([state.phase, state.selection.id, state.selection.skin?.id, state.error?.message, state.preparationId, this.note]);
    if (key === this.rendered) return;
    this.content?.destroy(true); this.content = this.scene.add.container(); this.rendered = key;
    const canvas = this.scene.game.canvas;
    for (const name of Object.keys(canvas.dataset)) delete canvas.dataset[name];
    canvas.dataset.phase = state.phase === 'menu' ? 'selecting' : state.phase;
    canvas.dataset.theme = state.selection.id; canvas.dataset.skin = state.selection.skin?.id ?? '';
    if (state.phase === 'preparing') {
      canvas.dataset.preparation = String(state.preparationId);
      this.text(512, 205, `正在准备${this.theme().label} · ${this.skin().label}`, 30);
      this.text(512, 276, '完成后才会开始计时，可随时取消。', 22, '#b8d1c6');
      this.button(512, 380, 260, '取消准备 · Esc', () => this.cancel());
      this.status('正在准备资源，Escape 或取消按钮返回菜单；对局尚未创建。');
    } else if (state.phase === 'failed') {
      canvas.dataset.error = state.error?.message ?? '';
      this.text(512, 180, '无法开始本局', 34);
      this.text(512, 245, '资源或初始配置校验失败，对局没有开始。', 22, '#b8d1c6');
      this.text(512, 295, state.error?.message ?? '', 17, '#ffaf8c').setWordWrapWidth(860);
      this.button(355, 405, 250, '重试准备 · Enter', () => { void this.flow.retry(); });
      this.button(669, 405, 250, '返回菜单 · Esc', () => { this.flow.returnToMenu(); });
      this.status(`无法开始本局：${state.error?.message ?? ''}。可重试或返回菜单。`);
    } else this.showSelection();
    canvas.setAttribute('aria-label', state.phase === 'menu' ? '左右选地图主题，上下选角色皮肤，Enter 开始' : state.phase === 'preparing' ? '正在准备资源，Escape 取消' : '准备失败，Enter 重试，Escape 返回菜单');
  }
  private showSelection(): void {
    this.text(512, 35, 'Fake Bomb It', 32); this.text(512, 75, '选择地图主题和角色皮肤', 23, '#b8d1c6');
    builtinThemes.forEach((theme, index) => {
      const x = index === 0 ? 290 : 734, selected = theme.id === this.theme().id;
      const panel = this.scene.add.rectangle(x, 214, 396, 236, selected ? 0x24483f : 0x173737).setStrokeStyle(selected ? 3 : 1, selected ? 0x83dfb6 : 0x496562).setInteractive({ useHandCursor: true });
      panel.on('pointerup', () => this.choose(theme, this.skin())); this.content!.add(panel);
      if (this.scene.textures.exists(`preview:${theme.id}`)) this.content!.add(this.scene.add.image(x, 183, `preview:${theme.id}`).setDisplaySize(240, 144));
      this.text(x, 280, `${selected ? '● ' : ''}${theme.label}`, 24);
      this.text(x, 314, index === 0 ? '奶油墙 · 威化障碍 · 巧克力炸弹' : '积木墙 · 纸箱障碍 · 金属炸弹', 17, '#b8d1c6');
    });
    this.text(512, 353, '角色皮肤 · ↑ ↓ 切换', 18, '#b8d1c6');
    builtinSkins.forEach((skin, index) => {
      const x = index === 0 ? 330 : 694, selected = skin.id === this.skin().id;
      const panel = this.scene.add.rectangle(x, 416, 320, 88, selected ? 0x24483f : 0x173737).setStrokeStyle(selected ? 3 : 1, selected ? 0x83dfb6 : 0x496562).setInteractive({ useHandCursor: true });
      panel.on('pointerup', () => this.choose(this.theme(), skin)); this.content!.add(panel);
      if (this.scene.textures.exists(`skin-preview:${skin.id}`)) this.content!.add(this.scene.add.image(x - 96, 410, `skin-preview:${skin.id}`).setDisplaySize(78, 78));
      this.text(x + 36, 401, skin.label, 24); this.text(x + 36, 431, selected ? '已选择' : '点击选用', 17, selected ? '#83dfb6' : '#b8d1c6');
    });
    this.button(512, 501, 360, `开始 · ${this.skin().label}`, () => { void this.flow.start(); });
    this.text(512, 552, this.note || '← → 选主题 · ↑ ↓ 选皮肤 · Enter 开始', 17, '#b8d1c6');
    this.status(`${this.note} 当前主题：${this.theme().label}，皮肤：${this.skin().label}。左右选主题，上下选皮肤，Enter 或点击开始。`);
  }
  private status(message: string): void { const status = document.getElementById('game-status'); if (status) status.textContent = message; }
  destroy(): void { this.hide(); window.removeEventListener('keydown', this.keyDown); }
}
