import type { GameFlowState } from '../game-flow/index.js';
import type { FeedbackEffect } from '../presentation/feedback.js';
import { builtinThemes } from '../resources/builtin-themes.js';
import { builtinSkins } from '../resources/builtin-skins.js';
import type { Settings, Margin } from './preferences.js';
import { Images, drawImage, type IconName } from './assets.js';
import { actorColors, actorName } from './board.js';
import { contains, type Layout, type Rect, type Circle, type Viewport } from './layout.js';

export const palettes = {
  dark: { background: '#142a43', surface: '#1c3f57', selected: '#24596c', border: '#588198', ink: '#f3fbf7', muted: '#b4d0db', accent: '#ffd45e', pressedAccent: '#e5be50', buttonInk: '#243543', warning: '#ffb09c' },
  light: { background: '#f8f4e9', surface: '#fffcf4', selected: '#d0f4e8', border: '#b6b9a6', ink: '#103d4a', muted: '#49636b', accent: '#187e69', pressedAccent: '#126655', buttonInk: '#ffffff', warning: '#9b3e20' },
};
export interface Widget { id: string; rect: Rect; disabled: boolean; action?: () => void; slide?: (fraction: number) => void; track?: Rect }
export interface Actions {
  start(): void; retry(): void; newMatch(): void; menu(): void; pause(): void; resume(): void;
  selectTheme(index: number): void; selectSkin(index: number): void;
  settings(): void; closeSettings(): void; appearance(): void; entities(): void;
  updateSettings(patch: Partial<Omit<Settings, 'controls'>>, controls?: Partial<Settings['controls']>): void;
  resetControls(): void; report(): void; retryBoot(): void;
}
export interface Model {
  state: GameFlowState<WechatMinigame.Image>; settings: Readonly<Settings>; layout: Layout; viewport: Viewport;
  settingsOpen: boolean; booting: boolean; bootError: string; notice: string; entities: boolean; reportAvailable: boolean;
  touch: { joystickActive: boolean; knob: { x: number; y: number }; bombHeld: boolean }; floatingCenter: Circle | null;
  effects: readonly FeedbackEffect[];
}
export class NativeUI {
  widgets: Widget[] = [];
  pressed = '';
  tab: 'controls' | 'audio' | 'effects' = 'controls';
  scroll = 0;
  scrollMax = 0;
  scrollRegion: Rect | null = null;
  private model!: Model;
  private context!: CanvasRenderingContext2D;
  constructor(private readonly images: Images, private readonly actions: Actions) {}
  hit(x: number, y: number): Widget | undefined { return this.widgets.findLast(widget => !widget.disabled && contains(widget.rect, x, y)); }
  private get colors() { return palettes[this.model.settings.appearance]; }
  text(text: string, x: number, y: number, size = 16, color = this.colors.ink, align: CanvasTextAlign = 'left', bold = false, maxWidth?: number): void {
    const c = this.context; c.fillStyle = color; c.font = `${bold ? 'bold ' : ''}${size}px "Microsoft YaHei", sans-serif`; c.textAlign = align; c.textBaseline = 'middle';
    if (maxWidth === undefined) c.fillText(text, x, y); else c.fillText(text, x, y, maxWidth);
  }
  private panel(rect: Rect, fill = this.colors.surface, stroke = this.colors.border, radius = 18): void {
    const c = this.context, r = Math.min(radius, rect.width / 2, rect.height / 2), { x, y, width: w, height: h } = rect;
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath(); c.fillStyle = fill; c.fill(); c.strokeStyle = stroke; c.lineWidth = 1.5; c.stroke();
  }
  private image(path: string, rect: Rect, opacity = 1): void {
    const image = this.images.get(path); if (!image) return;
    const scale = Math.min(rect.width / image.width, rect.height / image.height), width = image.width * scale, height = image.height * scale;
    this.context.save(); this.context.globalAlpha = opacity; drawImage(this.context, image, rect.x + (rect.width - width) / 2, rect.y + (rect.height - height) / 2, width, height); this.context.restore();
  }
  private icon(name: IconName, rect: Rect): void { this.image(`icons/${name}-${this.model.settings.appearance}.png`, rect); }
  private button(id: string, label: string, rect: Rect, action: () => void, primary = false, icon?: IconName, disabled = false, selected = false): void {
    const c = this.colors;
    this.context.save(); this.context.globalAlpha = disabled ? .42 : 1;
    this.panel(rect, primary ? this.pressed === id ? c.pressedAccent : c.accent : this.pressed === id || selected ? c.selected : c.surface, primary ? c.accent : selected ? c.accent : c.border, rect.height / 2);
    const center = rect.x + rect.width / 2;
    if (icon) this.icon(icon, { x: label ? rect.x + 14 : center - 12, y: rect.y + rect.height / 2 - 12, width: 24, height: 24 });
    if (label) this.text(label, center + (icon ? 10 : 0), rect.y + rect.height / 2, rect.height >= 56 ? 21 : 15, primary ? c.buttonInk : c.ink, 'center', true, rect.width - (icon ? 46 : 16));
    this.context.restore(); this.widgets.push({ id, rect, action, disabled });
  }
  private scrim(): void { const c = this.context; c.fillStyle = 'rgba(7,20,32,.78)'; c.fillRect(0, 0, this.model.viewport.width, this.model.viewport.height); }
  render(context: CanvasRenderingContext2D, model: Model): void {
    this.context = context; this.model = model; this.widgets = []; this.scrollRegion = null;
    if (model.booting || model.bootError) this.preparing(model.bootError || '正在准备界面资源', true);
    else if (!model.state.run) {
      if (model.state.phase === 'menu') this.menu();
      else this.preparing(model.state.error?.message || '', false);
    } else this.hud();
    if (model.settingsOpen) this.settings();
    if (model.notice) {
      const s = model.layout.safe;
      this.panel({ x: s.x + (s.width - Math.min(520, s.width - 32)) / 2, y: s.y + s.height - 48, width: Math.min(520, s.width - 32), height: 40 });
      this.text(model.notice, s.x + s.width / 2, s.y + s.height - 28, 13, this.colors.ink, 'center', false, s.width - 60);
    }
  }
  drawBackground(context: CanvasRenderingContext2D, viewport: Viewport, mode: Settings['appearance'], menu: boolean): void {
    context.fillStyle = palettes[mode].background; context.fillRect(0, 0, viewport.width, viewport.height);
    const image = this.images.get(`ui/menu-${mode}.jpg`);
    if (image) { const scale = Math.max(viewport.width / image.width, viewport.height / image.height); context.save(); context.globalAlpha = menu ? 1 : .18;
      drawImage(context, image, (viewport.width - image.width * scale) / 2, (viewport.height - image.height * scale) / 2, image.width * scale, image.height * scale); context.restore(); }
  }
  private menu(): void {
    const { safe: s, portrait } = this.model.layout, state = this.model.state;
    const buttonY = s.y + 8;
    this.button('menu-settings', '', { x: s.x + 8, y: buttonY, width: 48, height: 48 }, this.actions.settings, false, 'settings');
    this.button('appearance', '', { x: s.x + 64, y: buttonY, width: 48, height: 48 }, this.actions.appearance, false, this.model.settings.appearance === 'dark' ? 'sun' : 'moon');
    const logoHeight = Math.min(92, s.height * .21), logoWidth = Math.min(400, s.width * .48);
    this.image('ui/wordmark.png', { x: s.x + (s.width - logoWidth) / 2, y: s.y + 4, width: logoWidth, height: logoHeight });
    const stageY = s.y + logoHeight + 10, stageHeight = Math.min(218, s.height - logoHeight - 100);
    const sideWidth = Math.min(225, s.width * (portrait ? .29 : .25)), sideHeight = Math.max(100, stageHeight * .86);
    const sides = [s.x + 12, s.x + s.width - sideWidth - 12];
    builtinThemes.forEach((theme, index) => {
      const rect = { x: sides[index]!, y: stageY + (stageHeight - sideHeight) / 2, width: sideWidth, height: sideHeight };
      this.panel(rect, this.colors.surface, state.selection.id === theme.id ? this.colors.accent : this.colors.border, 22);
      this.image(`themes/${theme.id}${this.model.settings.appearance === 'dark' ? '-dark' : ''}-preview.png`, { x: rect.x + 6, y: rect.y + 6, width: rect.width - 12, height: rect.height - 44 });
      this.text(theme.label, rect.x + rect.width / 2, rect.y + rect.height - 22, 17, this.colors.ink, 'center', true);
      this.widgets.push({ id: `theme-${theme.id}`, rect, disabled: false, action: () => this.actions.selectTheme(index) });
    });
    const centerWidth = s.width - sideWidth * 2 - 56, skinWidth = centerWidth / 2;
    builtinSkins.forEach((skin, index) => {
      const rect = { x: s.x + sideWidth + 28 + index * skinWidth, y: stageY, width: skinWidth, height: stageHeight };
      this.image(`skins/${skin.id}-preview.png`, { x: rect.x + 6, y: rect.y, width: rect.width - 12, height: rect.height - 50 });
      this.button(`skin-${skin.id}`, skin.label, { x: rect.x + 2, y: rect.y + rect.height - 48, width: rect.width - 4, height: 48 }, () => this.actions.selectSkin(index), false, undefined, false, state.selection.skin?.id === skin.id);
      this.widgets.push({ id: `portrait-${skin.id}`, rect: { ...rect, height: rect.height - 48 }, disabled: false, action: () => this.actions.selectSkin(index) });
    });
    const width = Math.min(330, s.width * .48), y = s.y + s.height - 78;
    this.button('start', '开始游戏', { x: s.x + (s.width - width) / 2, y, width, height: 56 }, this.actions.start, true);
    this.text('选择主题和角色 · 1 对 3 炸弹竞技', s.x + s.width / 2, s.y + s.height - 10, 12, this.colors.ink, 'center', true);
  }
  private preparing(error: string, boot: boolean): void {
    const s = this.model.layout.safe, width = Math.min(560, s.width - 32), height = Math.min(250, s.height - 20), x = s.x + (s.width - width) / 2, y = s.y + (s.height - height) / 2;
    const failed = boot ? Boolean(this.model.bootError) : this.model.state.phase === 'failed';
    this.panel({ x, y, width, height });
    this.text(failed ? '资源准备失败' : '正在准备游戏', x + width / 2, y + 36, 23, this.colors.ink, 'center', true);
    this.text(failed ? error.slice(0, 60) : '准备好明暗外观与角色后，再开始计时', x + width / 2, y + 82, 14, failed ? this.colors.warning : this.colors.muted, 'center', false, width - 32);
    if (failed) this.button('prepare-retry', '重新准备', { x: x + width / 2 - 158, y: y + height - 68, width: 150, height: 48 }, boot ? this.actions.retryBoot : this.actions.retry, true);
    if (!boot) this.button('prepare-cancel', failed ? '返回菜单' : '取消准备', { x: x + width / 2 + (failed ? 8 : -75), y: y + height - 68, width: 150, height: 48 }, this.actions.menu);
  }
  private hud(): void {
    const m = this.model, run = m.state.run!, world = run.frame.world, l = m.layout, c = this.colors;
    const remaining = Math.max(0, Math.ceil((world.initialization.rules.matchDurationSeconds * world.initialization.rules.tickRate - world.tick) / world.initialization.rules.tickRate));
    this.text(m.state.selection.label, l.safe.x + 10, l.safe.y + 18, 16, c.ink, 'left', true);
    this.text(`${remaining}s`, l.board.x + l.board.width / 2, Math.max(l.safe.y + 14, l.board.y - 10), 16, c.ink, 'center', true);
    for (const [index, actor] of world.actors.entries()) {
      const left = index < 2, position = index % 2;
      const rect = { x: left ? l.cardLeft : l.cardRight, y: l.cardY + position * (l.cardHeight + 6), width: l.cardWidth, height: l.cardHeight };
      this.context.save(); this.context.globalAlpha = actor.alive ? 1 : .55;
      this.panel(rect, c.surface, actorColors[index]!, 12);
      this.image(`skins/${m.state.selection.skin?.id ?? 'mint'}-preview.png`, { x: rect.x + 5, y: rect.y + 5, width: Math.max(14, rect.height - 10), height: Math.max(14, rect.height - 10) });
      const labelX = rect.x + Math.max(24, rect.height);
      const gain = m.effects.findLast(effect => effect.kind === 'pickup' && effect.actorId === actor.id)?.label;
      const status = actor.alive ? gain : '淘汰';
      this.text(`${actorName(world, actor)}${status ? ` · ${status}` : ''}`, labelX, rect.y + rect.height * .28, 13, c.ink, 'left', true, rect.width - (labelX - rect.x) - 6);
      const bombs = world.bombs.filter(b => b.ownerId === actor.id).length;
      this.text(`弹 ${bombs}/${actor.abilities.bombCapacity}  距 ${actor.abilities.blastRange}  速 ${Number(actor.abilities.speed.toFixed(1))}`, labelX, rect.y + rect.height * .72, 11, c.muted, 'left', false, rect.width - (labelX - rect.x) - 6);
      this.context.restore();
    }
    if (m.state.phase === 'playing') {
      const entries: [string, IconName, () => void][] = [['pause', 'pause', this.actions.pause], ['settings', 'settings', this.actions.settings], ['appearance', m.settings.appearance === 'dark' ? 'sun' : 'moon', this.actions.appearance], ['entities', 'layers', this.actions.entities]];
      entries.forEach(([id, icon, action], index) => this.button(id, '', { x: l.toolbarX + index * 48, y: l.toolbarY, width: 44, height: 44 }, action, false, icon, false, id === 'entities' && m.entities));
      this.controls();
    }
    this.text(`种子 ${world.initialization.seed}`, l.safe.x + l.safe.width / 2, l.safe.y + l.safe.height - 7, 10, c.muted, 'center', false, Math.max(160, l.board.width));
    if (m.state.phase === 'paused' || m.state.phase === 'result') this.pause();
  }
  private controls(): void {
    const m = this.model, l = m.layout, ctx = this.context;
    const center = m.settings.controls.mode === 'floating' ? m.floatingCenter : l.joystick;
    if (center) {
      ctx.save(); ctx.globalAlpha = .85; ctx.fillStyle = this.colors.surface; ctx.strokeStyle = this.colors.border; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(center.x, center.y, center.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (const [icon, dx, dy] of [['up', 0, -.65], ['down', 0, .65], ['left', -.65, 0], ['right', .65, 0]] as const) this.icon(icon, { x: center.x + dx * center.radius - 10, y: center.y + dy * center.radius - 10, width: 20, height: 20 });
      ctx.fillStyle = this.colors.selected; ctx.beginPath(); ctx.arc(center.x + m.touch.knob.x * center.radius * .44, center.y + m.touch.knob.y * center.radius * .44, center.radius * .38, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    } else this.text('左侧拖动移动', l.floating.x + l.floating.width / 2, l.bomb.y, 13, this.colors.muted, 'center');
    ctx.save(); ctx.fillStyle = m.touch.bombHeld ? this.colors.selected : this.colors.surface; ctx.strokeStyle = this.colors.accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(l.bomb.x, l.bomb.y, l.bomb.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    this.icon('bomb', { x: l.bomb.x - 23, y: l.bomb.y - 32, width: 46, height: 46 });
    this.text('放弹', l.bomb.x, l.bomb.y + 27, 16, this.colors.ink, 'center', true); ctx.restore();
  }
  private pause(): void {
    this.widgets = []; this.scrim();
    const m = this.model, s = m.layout.safe, result = m.state.run!.frame.world.result;
    const width = Math.min(430, s.width - 32), x = s.x + (s.width - width) / 2;
    const height = Math.min(334, s.height - 16), y = s.y + (s.height - height) / 2;
    this.panel({ x, y, width, height });
    const title = result ? ({ won: '你赢了', lost: '被炸中了', draw: '时间到' }[result.outcome]) : '已暂停';
    this.text(title, x + width / 2, y + 28, 26, this.colors.ink, 'center', true);
    const mainOffset = Math.min(77, height - 176);
    if (mainOffset >= 68) this.text(result ? '重试本局保留地图，新开一局选择新种子' : '继续游戏后再开始计时', x + width / 2, y + 57, 13, this.colors.muted, 'center', false, width - 24);
    const mainY = y + mainOffset, gap = 8, buttonH = 48;
    this.button(result ? 'retry-main' : 'resume', result ? '重试本局' : '继续游戏', { x: x + 24, y: mainY, width: width - 48, height: buttonH }, result ? this.actions.retry : this.actions.resume, true);
    this.button('retry', '重试', { x: x + 24, y: mainY + buttonH + gap, width: (width - 56) / 2, height: buttonH }, this.actions.retry, false, 'retry');
    this.button('new-match', '新开一局', { x: x + 32 + (width - 56) / 2, y: mainY + buttonH + gap, width: (width - 56) / 2, height: buttonH }, this.actions.newMatch);
    this.button('back-menu', '返回菜单', { x: x + 24, y: mainY + (buttonH + gap) * 2, width: (width - 56) / 2, height: buttonH }, this.actions.menu, false, 'home');
    this.button('pause-settings', '设置', { x: x + 32 + (width - 56) / 2, y: mainY + (buttonH + gap) * 2, width: (width - 56) / 2, height: buttonH }, this.actions.settings, false, 'settings');
    if (m.reportAvailable && height >= 310) this.button('report', '复制验收报告', { x: x + 24, y: y + height - 55, width: width - 48, height: 44 }, this.actions.report);
  }
  private settings(): void {
    this.widgets = []; this.scrim();
    const m = this.model, s = m.layout.safe, x = s.x + 8, y = s.y + 8, width = s.width - 16, height = s.height - 16;
    this.panel({ x, y, width, height }, this.colors.background, this.colors.border, 24);
    this.text('设置', x + 22, y + 28, 23, this.colors.ink, 'left', true);
    // Keep the fixed footer action clear of WeChat's capsule and game shortcut.
    this.button('close-settings', '完成', { x: x + width - 112, y: y + height - 56, width: 96, height: 44 }, this.actions.closeSettings, true);
    const categoryWidth = width < 580 ? 84 : 112;
    const tabs = [['controls', '操作'], ['audio', '音量'], ['effects', '特效']] as const;
    tabs.forEach(([tab, label], index) => this.button(`tab-${tab}`, label, { x: x + 12, y: y + 64 + index * 56, width: categoryWidth - 8, height: 48 }, () => { this.tab = tab; this.scroll = 0; }, false, undefined, false, this.tab === tab));
    const previewWidth = width >= 650 ? Math.min(250, width * .32) : 0;
    const content = { x: x + categoryWidth + 20, y: y + 64, width: width - categoryWidth - previewWidth - 44, height: height - 126 };
    this.scrollRegion = content;
    const rowHeight = 56;
    const total = this.tab === 'controls' ? rowHeight * 5 + 12 : this.tab === 'audio' ? rowHeight * 2 + 36 : rowHeight * 3;
    this.scrollMax = Math.max(0, total - content.height); this.scroll = Math.min(this.scrollMax, Math.max(0, this.scroll));
    this.context.save(); this.context.beginPath(); this.context.rect(content.x, content.y, content.width, content.height); this.context.clip();
    const fieldsStart = this.widgets.length;
    const top = content.y - this.scroll;
    if (this.tab === 'controls') {
      const half = (content.width - 8) / 2;
      this.button('fixed', '固定摇杆', { x: content.x, y: top, width: half, height: 48 }, () => this.actions.updateSettings({}, { mode: 'fixed' }), false, undefined, false, m.settings.controls.mode === 'fixed');
      this.button('floating', '浮动摇杆', { x: content.x + half + 8, y: top, width: half, height: 48 }, () => this.actions.updateSettings({}, { mode: 'floating' }), false, undefined, false, m.settings.controls.mode === 'floating');
      const fields: [Margin, string][] = [['joystickLeft', '摇杆距左'], ['joystickBottom', '摇杆距底'], ['bombRight', '放弹距右'], ['bombBottom', '放弹距底']];
      fields.forEach(([key, label], index) => {
        const value = m.settings.controls[key] ?? (key.endsWith('Bottom') ? 8 : 12);
        const disabled = m.settings.controls.mode === 'floating' && key.startsWith('joystick');
        this.slider(key, label, `${value}px`, value / 240, { x: content.x, y: top + (index + 1) * rowHeight, width: content.width, height: 52 }, f => this.actions.updateSettings({}, { [key]: Math.round(f * 240) }), disabled);
      });
    } else if (this.tab === 'audio') {
      this.slider('music-volume', '背景音乐', `${Math.round(m.settings.musicVolume * 100)}%`, m.settings.musicVolume, { x: content.x, y: top, width: content.width, height: 52 }, f => this.actions.updateSettings({ musicVolume: f }));
      this.slider('sound-volume', '音效', `${Math.round(m.settings.volume * 100)}%`, m.settings.volume, { x: content.x, y: top + rowHeight, width: content.width, height: 52 }, f => this.actions.updateSettings({ volume: f }));
      this.text('0% 为静音，两种音量独立保存', content.x, top + rowHeight * 2 + 18, 12, this.colors.muted, 'left', false, content.width);
    } else {
      this.button('appearance-settings', m.settings.appearance === 'dark' ? '明暗外观：暗色' : '明暗外观：亮色', { x: content.x, y: top, width: content.width, height: 48 }, this.actions.appearance);
      this.button('particles', `粒子：${m.settings.particleBudget === 96 ? '丰富' : m.settings.particleBudget === 32 ? '精简' : '关闭'}`, { x: content.x, y: top + rowHeight, width: content.width, height: 48 }, () => this.actions.updateSettings({ particleBudget: m.settings.particleBudget === 96 ? 32 : m.settings.particleBudget === 32 ? 0 : 96 }));
      this.button('reduced-motion', `减少动态效果：${m.settings.reducedMotion ? '开' : '关'}`, { x: content.x, y: top + rowHeight * 2, width: content.width, height: 48 }, () => this.actions.updateSettings({ reducedMotion: !m.settings.reducedMotion }));
    }
    this.context.restore();
    // Keep cropped rows out of hit testing, including partially visible slider hit areas.
    this.widgets = this.widgets.map((widget, index) => {
      if (index < fieldsStart) return widget;
      const top = Math.max(widget.rect.y, content.y), bottom = Math.min(widget.rect.y + widget.rect.height, content.y + content.height);
      return { ...widget, rect: { ...widget.rect, y: top, height: Math.max(0, bottom - top) }, disabled: widget.disabled || bottom - top < Math.min(44, widget.rect.height) };
    });
    if (this.scrollMax > 0) this.text('上下滑动查看更多', content.x + content.width / 2, y + height - 67, 11, this.colors.muted, 'center');
    if (previewWidth) {
      const preview = { x: x + width - previewWidth - 12, y: y + 78, width: previewWidth - 12, height: Math.min(145, content.height - 12) };
      this.panel(preview, this.colors.selected, this.colors.border, 12);
      const scale = (preview.width - 20) / m.viewport.width;
      const safeX = preview.x + 10, safeY = preview.y + 20;
      this.context.strokeStyle = this.colors.border; this.context.strokeRect(safeX + s.x * scale, safeY + s.y * scale, s.width * scale, s.height * scale);
      for (const circle of [m.layout.joystick, m.layout.bomb]) { this.context.fillStyle = this.colors.accent; this.context.beginPath(); this.context.arc(safeX + circle.x * scale, safeY + circle.y * scale, circle.radius * scale, 0, Math.PI * 2); this.context.fill(); }
      this.text('屏幕安全区 · 实际位置', preview.x + preview.width / 2, preview.y + preview.height - 12, 11, this.colors.ink, 'center');
      this.text('边距从控件外缘量起', preview.x, preview.y + preview.height + 24, 12, this.colors.muted);
      if (m.settings.controls.mode === 'floating') this.text('浮动模式保留固定位置', preview.x, preview.y + preview.height + 45, 12, this.colors.muted);
    }
    this.button('reset-controls', '恢复操作默认值', { x: x + categoryWidth + 20, y: y + height - 56, width: Math.min(200, content.width), height: 44 }, this.actions.resetControls);
  }
  private slider(id: string, label: string, value: string, fraction: number, rect: Rect, slide: (fraction: number) => void, disabled = false): void {
    const ctx = this.context;
    ctx.save(); ctx.globalAlpha = disabled ? .4 : 1;
    this.text(label, rect.x, rect.y + 10, 13, this.colors.ink, 'left', true);
    this.text(disabled ? '浮动时停用' : value, rect.x + rect.width, rect.y + 10, 12, this.colors.muted, 'right');
    const track = { x: rect.x + 12, y: rect.y + 38, width: rect.width - 24, height: 4 };
    ctx.fillStyle = this.colors.border; ctx.fillRect(track.x, track.y, track.width, 4);
    ctx.fillStyle = this.colors.accent; ctx.fillRect(track.x, track.y, track.width * fraction, 4);
    ctx.beginPath(); ctx.arc(track.x + fraction * track.width, track.y + 2, 9, 0, Math.PI * 2); ctx.fill();
    ctx.restore(); this.widgets.push({ id, rect, disabled, slide, track });
  }
}
