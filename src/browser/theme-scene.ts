import Phaser from 'phaser';
import { createResourcePreparation, withSkin, type SkinPackage, type ThemePackage, type ReadyTheme } from '../resources/index.js';
import { builtinThemes } from '../resources/builtin-themes.js';
import { builtinSkins } from '../resources/builtin-skins.js';
import { createMatch, type InitializationRecord, type Match } from '../match/index.js';
import { trainingMatchConfig } from './training-map.js';
import { createItemTrainingMatch } from './item-training.js';
import { createEscapeTrainingMatch } from './escape-training.js';
import { createNormalTrainingMatch } from './normal-training.js';

export type Arena = 'generated' | 'items' | 'escape' | 'training' | 'normal';
export interface PreparedMatch { readonly theme: ReadyTheme<HTMLImageElement>; readonly match: Match; readonly arena: Arena }
interface Selection { readonly themeId?: string; readonly skinId?: string; readonly initialization?: InitializationRecord; readonly autoStart?: boolean }
const font = '"Segoe UI", "Microsoft YaHei", sans-serif';

// Application lifetime cache, shared by retries and scene instances. Cancelled IO may warm it.
const resources = createResourcePreparation<HTMLImageElement>(resource => new Promise((resolve, reject) => {
  const image = new Image();
  const timeout = window.setTimeout(() => { image.src = ''; reject(new Error(`${resource.id}: 加载超时`)); }, 10000);
  image.onload = () => {
    window.clearTimeout(timeout);
    const delay = Math.min(5000, Math.max(0, Number(new URLSearchParams(location.search).get('loadDelay')) || 0));
    window.setTimeout(() => resolve({ value: image, width: image.naturalWidth, height: image.naturalHeight }), delay);
  };
  image.onerror = () => { window.clearTimeout(timeout); reject(new Error(`${resource.id}: 无法加载 ${resource.url}`)); };
  image.src = resource.url;
}));

export class ThemeScene extends Phaser.Scene {
  private selection: Selection = {};
  private chosen: ThemePackage = builtinThemes[0]!;
  private chosenSkin: SkinPackage = builtinSkins[0]!;
  private cancelPreparation: (() => void) | undefined;
  private alive = false;
  private preparing = false;
  private content: Phaser.GameObjects.Container | undefined;
  constructor() { super('themes'); }
  init(selection: Selection): void {
    this.selection = selection; this.chosen = builtinThemes.find(theme => theme.id === selection.themeId) ?? builtinThemes[0]!;
    this.chosenSkin = builtinSkins.find(skin => skin.id === selection.skinId) ?? builtinSkins[0]!;
  }
  preload(): void {
    for (const theme of builtinThemes) if (!this.textures.exists(`preview:${theme.id}`)) this.load.image(`preview:${theme.id}`, `./themes/${theme.id}-preview.svg`);
    for (const skin of builtinSkins) if (!this.textures.exists(`skin-preview:${skin.id}`)) this.load.image(`skin-preview:${skin.id}`, `./skins/${skin.id}-preview.svg`);
  }
  create(): void {
    this.alive = true; this.preparing = false;
    const canvas = this.game.canvas;
    for (const key of Object.keys(canvas.dataset)) delete canvas.dataset[key];
    canvas.tabIndex = 0; canvas.setAttribute('role', 'application'); canvas.setAttribute('aria-label', '左右选地图主题，上下选角色皮肤，Enter 开始，Escape 取消准备');
    const keyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.code === 'Escape' && this.preparing) { event.preventDefault(); this.cancel(); }
      else if (!this.preparing && (event.code === 'ArrowLeft' || event.code === 'ArrowRight')) { event.preventDefault(); this.chosen = builtinThemes.find(theme => theme.id !== this.chosen.id)!; this.showSelection(); }
      else if (!this.preparing && (event.code === 'ArrowUp' || event.code === 'ArrowDown')) { event.preventDefault(); this.chosenSkin = builtinSkins.find(skin => skin.id !== this.chosenSkin.id)!; this.showSelection(); }
      else if (event.code === 'Enter' && !this.preparing) { event.preventDefault(); this.prepare(); }
    };
    window.addEventListener('keydown', keyDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.alive = false; this.cancelPreparation?.(); window.removeEventListener('keydown', keyDown); this.content = undefined; });
    this.showSelection();
    canvas.focus({ preventScroll: true });
    if (this.selection.autoStart) this.prepare();
  }
  private text(x: number, y: number, text: string, size: number, color = '#eaf3ed'): Phaser.GameObjects.Text {
    const item = this.add.text(x, y, text, { fontFamily: font, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5);
    this.content!.add(item); return item;
  }
  private button(x: number, y: number, width: number, label: string, action: () => void): void {
    const shape = this.add.rectangle(x, y, width, 58, 0x83dfb6).setStrokeStyle(2, 0xa2edce).setInteractive({ useHandCursor: true });
    shape.on('pointerup', action); this.content!.add(shape); this.text(x, y, label, 22, '#102b2c');
  }
  private clear(phase: string): void {
    this.content?.destroy(true); this.content = this.add.container();
    delete this.game.canvas.dataset.error; delete this.game.canvas.dataset.preparation;
    this.game.canvas.dataset.phase = phase; this.game.canvas.dataset.theme = this.chosen.id; this.game.canvas.dataset.skin = this.chosenSkin.id;
  }
  private showSelection(note = ''): void {
    this.clear('selecting');
    this.text(512, 35, 'Fake Bomb It', 32);
    this.text(512, 75, '选择地图主题和角色皮肤', 23, '#b8d1c6');
    builtinThemes.forEach((theme, index) => {
      const x = index === 0 ? 290 : 734;
      const selected = theme.id === this.chosen.id;
      const panel = this.add.rectangle(x, 214, 396, 236, selected ? 0x24483f : 0x173737).setStrokeStyle(selected ? 3 : 1, selected ? 0x83dfb6 : 0x496562).setInteractive({ useHandCursor: true });
      panel.on('pointerup', () => { this.chosen = theme; this.showSelection(); }); this.content!.add(panel);
      if (this.textures.exists(`preview:${theme.id}`)) this.content!.add(this.add.image(x, 183, `preview:${theme.id}`).setDisplaySize(240, 144));
      this.text(x, 280, `${selected ? '● ' : ''}${theme.label}`, 24);
      this.text(x, 314, index === 0 ? '奶油墙 · 威化障碍 · 巧克力炸弹' : '积木墙 · 纸箱障碍 · 金属炸弹', 17, '#b8d1c6');
    });
    this.text(512, 353, '角色皮肤 · ↑ ↓ 切换', 18, '#b8d1c6');
    builtinSkins.forEach((skin, index) => {
      const x = index === 0 ? 330 : 694, selected = skin.id === this.chosenSkin.id;
      const panel = this.add.rectangle(x, 416, 320, 88, selected ? 0x24483f : 0x173737).setStrokeStyle(selected ? 3 : 1, selected ? 0x83dfb6 : 0x496562).setInteractive({ useHandCursor: true });
      panel.on('pointerup', () => { this.chosenSkin = skin; this.showSelection(); }); this.content!.add(panel);
      if (this.textures.exists(`skin-preview:${skin.id}`)) this.content!.add(this.add.image(x - 96, 410, `skin-preview:${skin.id}`).setDisplaySize(78, 78));
      this.text(x + 36, 401, skin.label, 24);
      this.text(x + 36, 431, selected ? '已选择' : '点击选用', 17, selected ? '#83dfb6' : '#b8d1c6');
    });
    this.button(512, 501, 360, `开始 · ${this.chosenSkin.label}`, () => this.prepare());
    this.text(512, 552, note || '← → 选主题 · ↑ ↓ 选皮肤 · Enter 开始', 17, '#b8d1c6');
    this.status(`${note ? `${note} ` : ''}当前主题：${this.chosen.label}，皮肤：${this.chosenSkin.label}。左右选主题，上下选皮肤，Enter 或点击开始。`);
  }
  private cancel(): void {
    this.cancelPreparation?.(); this.cancelPreparation = undefined; this.preparing = false;
    this.showSelection('准备已取消，可重新选择主题。');
  }
  private prepare(): void {
    if (this.preparing) return;
    this.preparing = true; this.clear('preparing');
    this.text(512, 205, `正在准备${this.chosen.label} · ${this.chosenSkin.label}`, 30);
    this.text(512, 276, '校验并加载画面资源，完成后才会开始计时。', 22, '#b8d1c6');
    this.button(512, 380, 260, '取消准备 · Esc', () => this.cancel());
    this.status('正在准备资源，可以取消；对局尚未创建。');
    const source = diagnosticPackage(withSkin(this.chosen, this.chosenSkin));
    const task = resources.start(source, theme => {
      for (const resource of theme.package.resources) {
        const image = theme.images[resource.id];
        if (image && !this.textures.exists(image.key) && !this.textures.addSpriteSheet(image.key, image.value, { frameWidth: resource.frameWidth, frameHeight: resource.frameHeight })) throw new Error(`${resource.id}: 无法创建纹理`);
      }
      return { theme, ...makeMatch(this.selection.initialization) };
    });
    this.cancelPreparation = task.cancel;
    this.game.canvas.dataset.preparation = String(task.id);
    void task.completion.then(result => {
      if (!this.alive || this.cancelPreparation !== task.cancel || result.status === 'cancelled') return;
      this.cancelPreparation = undefined; this.preparing = false;
      if (result.status === 'ready') { this.scene.start('training', result.value); return; }
      this.clear('failed'); this.game.canvas.dataset.error = result.error.message;
      this.text(512, 180, '无法开始本局', 34);
      this.text(512, 245, '资源或初始配置校验失败，对局没有开始。', 22, '#b8d1c6');
      this.text(512, 295, result.error.message, 17, '#ffaf8c').setWordWrapWidth(860);
      this.button(355, 405, 250, '重试准备', () => this.prepare());
      this.button(669, 405, 250, '返回选主题', () => this.showSelection());
      this.status(`无法开始本局：${result.error.message}。可重试或返回选主题。`);
    });
  }
  private status(message: string): void { const status = document.getElementById('game-status'); if (status) status.textContent = message; }
}

function diagnosticPackage(theme: ThemePackage): ThemePackage {
  const mode = new URLSearchParams(location.search).get('resourceError');
  if (mode !== 'required' && mode !== 'optional' && mode !== 'skin') return theme;
  const resources = theme.resources.map(resource => (mode === 'skin' ? resource.id.startsWith('skin:') : resource.required === (mode === 'required'))
    ? { ...resource, url: `./themes/missing-${resource.id}.svg` } : resource);
  return { ...theme, resources,
    ...(theme.skin ? { skin: { ...theme.skin, resources: theme.skin.resources.map(resource => resources.find(image => image.id === resource.id)!) } } : {}),
  };
}

export function freshSeed(previous: string | null = null): string {
  const seed = [...crypto.getRandomValues(new Uint32Array(2))].map(value => value.toString(36)).join('-');
  return seed === previous ? `${seed}-n` : seed;
}
function makeMatch(initialization?: InitializationRecord): { match: Match; arena: Arena } {
  const url = new URL(location.href), requested = url.searchParams.get('arena');
  const arena = requested === 'items' || requested === 'escape' || requested === 'training' || requested === 'normal' ? requested : 'generated';
  if (arena !== 'generated') return { arena, match: arena === 'items' ? createItemTrainingMatch() : arena === 'escape' ? createEscapeTrainingMatch() : arena === 'normal' ? createNormalTrainingMatch() : createMatch(trainingMatchConfig) };
  const seed = url.searchParams.get('seed') ?? freshSeed(); url.searchParams.set('seed', seed); history.replaceState(null, '', url);
  const count = Number(url.searchParams.get('ai')), seconds = Number(url.searchParams.get('seconds'));
  const actors = ['player', 'target-1', 'target-2', 'target-3'].slice(0, ([1, 2, 3].includes(count) ? count : 3) + 1)
    .map(id => ({ id, type: 'actor' as const, spawnId: id, ...(id === 'player' ? {} : { ai: { mode: 'normal' as const } }) }));
  return { arena, match: createMatch(initialization ?? { seed, generator: {}, playerId: 'player', actors,
    rules: { matchDurationSeconds: Number.isInteger(seconds) && seconds >= 1 && seconds <= 120 ? seconds : 120 } }) };
}
