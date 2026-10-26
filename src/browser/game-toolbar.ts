import { appearance, toggleAppearance } from './appearance.js';
import { readFeedbackSettings, setVolume, setParticleBudget } from './feedback-settings.js';
import type { GameFlowState } from '../game-flow/index.js';
import { icon, type Icon } from './ui-icons.js';
import { arenaLayout, controlGeometry } from './layout.js';
import { controlMarginLimit, controlRevision, readControlPreferences, resetControlPreferences, updateControlPreferences, type MarginName } from './control-preferences.js';

type Commands = { pause(): void; resume(): void; fullscreen(): void; switchView(): void; menu(): void; focusCanvas(): void; controlsChanged(): void };
const margins: readonly [MarginName, string][] = [['joystickLeft', '摇杆距左'], ['joystickBottom', '摇杆距底'], ['bombRight', '放弹距右'], ['bombBottom', '放弹距底']];

/** Accessible toolbar and modal own focus; closing settings always leaves manual pause. */
export class GameToolbar {
  private readonly root = document.createElement('div');
  private readonly dialog = document.createElement('dialog');
  private readonly buttons: HTMLButtonElement[] = [];
  private playing = false;
  private phase: GameFlowState<unknown>['phase'] = 'menu';
  private stateKey = '';
  private previewKey = '';
  constructor(private readonly commands: Commands) {
    this.root.className = 'game-toolbar'; this.root.setAttribute('role', 'group'); this.root.setAttribute('aria-label', '游戏工具');
    const actions = [() => { if (this.playing) commands.pause(); else commands.resume(); }, () => commands.fullscreen(),
      () => this.openSettings(), () => toggleAppearance(), () => commands.switchView()];
    for (const action of actions) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-button';
      button.addEventListener('click', event => { action(); if (event.detail > 0 && !this.dialog.open) commands.focusCanvas(); });
      this.buttons.push(button); this.root.append(button);
    }
    this.dialog.className = 'game-settings'; this.dialog.setAttribute('aria-labelledby', 'settings-title');
    this.dialog.innerHTML = `<header><h2 id="settings-title">${icon('settings')}设置</h2><button type="button" class="icon-button settings-close" aria-label="关闭设置">${icon('close')}</button></header>
      <div class="settings-body"><nav class="settings-tabs" role="tablist" aria-label="设置分类">${([['controls','gamepad','操作'],['audio','volume','音量'],['effects','sparkles','特效']] as const).map(([id,glyph,label]) => `<button type="button" role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${id === 'controls'}" data-tab="${id}">${icon(glyph)}${label}</button>`).join('')}</nav>
      <section id="panel-controls" role="tabpanel" aria-labelledby="tab-controls" class="control-panel"><div class="control-fields"><fieldset class="joystick-modes"><legend>摇杆模式</legend><label><input type="radio" name="joystick-mode" value="fixed"><span>固定摇杆</span></label><label><input type="radio" name="joystick-mode" value="floating"><span>浮动摇杆</span></label></fieldset>
        <div class="margin-fields">${margins.map(([name,label]) => `<label class="margin-row" data-margin="${name}"><span>${label}</span><input type="range" min="0" max="${controlMarginLimit}" step="1" aria-label="${label}"><output></output></label>`).join('')}</div><p class="control-explanation"></p></div>
      <section class="position-preview" aria-label="整个横屏安全区的位置预览"><h3>位置预览</h3><div class="preview-viewport"><div class="preview-map"></div><div class="preview-control preview-joystick">${icon('gamepad')}</div><div class="preview-control preview-bomb">${icon('bomb')}</div><span class="preview-edge preview-left"></span><span class="preview-edge preview-right"></span><span class="preview-edge preview-bottom-left"></span><span class="preview-edge preview-bottom-right"></span></div><p>控件外缘到屏幕安全区边缘</p></section></section>
      <section id="panel-audio" role="tabpanel" aria-labelledby="tab-audio" class="feedback-panel" hidden><h3>游戏音量</h3><p>调整放弹、爆炸与拾取声音</p><label class="volume-row"><input type="range" min="0" max="100" step="1" aria-label="游戏音量"><output></output></label></section>
      <section id="panel-effects" role="tabpanel" aria-labelledby="tab-effects" class="feedback-panel" hidden><h3>粒子效果</h3><p>减少粒子不改变火焰与危险范围</p><div class="particle-options">${[[96,'丰富'],[32,'精简'],[0,'关闭']].map(([value,label]) => `<button type="button" class="secondary-button" data-particles="${value}">${label}</button>`).join('')}</div><p class="motion-note"></p></section></div>
      <footer><button type="button" class="secondary-button reset-controls">恢复操作默认值</button><button type="button" class="secondary-button settings-menu">返回菜单</button><button type="button" class="primary-button settings-done">完成</button></footer>`;
    for (const tab of this.dialog.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
      tab.addEventListener('click', () => this.selectTab(tab.dataset.tab!));
      tab.addEventListener('keydown', event => {
        if (!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const tabs = [...this.dialog.querySelectorAll<HTMLButtonElement>('[data-tab]')], index = tabs.indexOf(tab);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (['ArrowDown','ArrowRight'].includes(event.key) ? 1 : tabs.length - 1)) % tabs.length;
        this.selectTab(tabs[next]!.dataset.tab!); tabs[next]!.focus();
      });
    }
    for (const radio of this.dialog.querySelectorAll<HTMLInputElement>('[name="joystick-mode"]')) radio.addEventListener('change', () => {
      updateControlPreferences({ mode: radio.value === 'floating' ? 'floating' : 'fixed' }); this.controlsChanged();
    });
    for (const [name] of margins) this.dialog.querySelector<HTMLInputElement>(`[data-margin="${name}"] input`)!.addEventListener('input', event => {
      updateControlPreferences({ [name]: Number((event.target as HTMLInputElement).value) }); this.controlsChanged();
    });
    this.dialog.querySelector('.reset-controls')!.addEventListener('click', () => { resetControlPreferences(); this.controlsChanged(); });
    this.dialog.querySelector('.volume-row input')!.addEventListener('input', event => { setVolume(Number((event.target as HTMLInputElement).value) / 100); this.refresh(); });
    for (const button of this.dialog.querySelectorAll<HTMLButtonElement>('[data-particles]')) button.addEventListener('click', () => { setParticleBudget(Number(button.dataset.particles)); this.refresh(); });
    this.dialog.querySelector('.settings-close')!.addEventListener('click', () => this.close());
    this.dialog.querySelector('.settings-done')!.addEventListener('click', () => this.close());
    this.dialog.querySelector('.settings-menu')!.addEventListener('click', () => { this.close(); commands.menu(); });
    this.dialog.addEventListener('keydown', event => event.stopPropagation());
    this.dialog.addEventListener('keyup', event => event.stopPropagation());
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.dialog.addEventListener('close', () => commands.focusCanvas());
    for (const event of ['keydown', 'keyup']) this.root.addEventListener(event, event => event.stopPropagation());
    document.getElementById('game')!.append(this.root, this.dialog); this.selectTab('controls');
  }
  isOpen(): boolean { return this.dialog.open; }
  openSettings(): void {
    if (this.dialog.open || !['menu','playing','paused','result'].includes(this.phase)) return;
    this.commands.pause(); this.commands.controlsChanged(); this.previewKey = ''; this.refresh(); this.dialog.showModal();
  }
  private controlsChanged(): void { this.commands.controlsChanged(); this.previewKey = ''; this.refresh(); }
  private close(): void { this.dialog.close(); }
  private selectTab(id: string): void {
    for (const tab of this.dialog.querySelectorAll<HTMLButtonElement>('[data-tab]')) { const selected = tab.dataset.tab === id; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; }
    for (const panel of this.dialog.querySelectorAll<HTMLElement>('[role="tabpanel"]')) panel.hidden = panel.id !== `panel-${id}`;
  }
  private refresh(): void {
    const p = readControlPreferences(), feedback = readFeedbackSettings(), floating = p.mode === 'floating';
    for (const radio of this.dialog.querySelectorAll<HTMLInputElement>('[name="joystick-mode"]')) radio.checked = radio.value === p.mode;
    let constrained = false;
    for (const [name] of margins) {
      const row = this.dialog.querySelector<HTMLElement>(`[data-margin="${name}"]`)!, input = row.querySelector('input')!;
      const desired = p[name] ?? controlGeometry.defaults[name], actual = controlGeometry.actual[name];
      input.max = String(Math.min(controlMarginLimit, controlGeometry.maximum[name])); input.value = String(Math.min(desired, Number(input.max)));
      input.disabled = floating && name.startsWith('joystick'); row.classList.toggle('disabled', input.disabled);
      row.querySelector('output')!.textContent = `${desired} px`; input.setAttribute('aria-valuetext', `${desired}像素${desired !== actual ? `，本屏实际${actual}像素` : ''}`);
      if (!input.disabled && Math.abs(desired - actual) > 1) constrained = true;
    }
    this.dialog.querySelector('.control-explanation')!.textContent = floating ? '左侧操作区按下定位，拖动后移动；固定位置已保留。' : constrained ? '本屏已约束实际位置；更大屏幕会恢复偏好。' : '四项独立调整，位置实时预览。';
    const volume = this.dialog.querySelector<HTMLInputElement>('.volume-row input')!; volume.value = String(Math.round(feedback.volume * 100));
    this.dialog.querySelector('.volume-row output')!.textContent = `${Math.round(feedback.volume * 100)}%`;
    for (const button of this.dialog.querySelectorAll<HTMLButtonElement>('[data-particles]')) button.setAttribute('aria-pressed', String(Number(button.dataset.particles) === feedback.particleBudget));
    this.dialog.querySelector('.motion-note')!.textContent = feedback.reducedMotion ? '已遵循系统减少动态效果偏好。' : '';
    this.dialog.querySelector<HTMLButtonElement>('.settings-menu')!.hidden = this.phase === 'menu';
    this.preview();
  }
  private preview(): void {
    const l = arenaLayout, viewport = this.dialog.querySelector<HTMLElement>('.preview-viewport')!, p = readControlPreferences();
    viewport.style.aspectRatio = `${l.width} / ${l.height}`;
    const place = (selector: string, x: number, y: number, w: number, h: number) => {
      const item = viewport.querySelector<HTMLElement>(selector)!;
      Object.assign(item.style, { left: `${x / l.width * 100}%`, top: `${y / l.height * 100}%`, width: `${w / l.width * 100}%`, height: `${h / l.height * 100}%` });
    };
    place('.preview-map', l.board.x, l.board.y, l.board.width, l.board.height);
    for (const [control, selector] of [['joystick','.preview-joystick'],['bomb','.preview-bomb']] as const) {
      const c = l[control]; place(selector, c.x - c.radius, c.y - c.radius, c.radius * 2, c.radius * 2);
    }
    viewport.querySelector<HTMLElement>('.preview-joystick')!.classList.toggle('floating', p.mode === 'floating');
    viewport.querySelector('.preview-left')!.textContent = p.mode === 'floating' ? '按下定位' : `${Math.round(controlGeometry.actual.joystickLeft)} px`;
    viewport.querySelector('.preview-right')!.textContent = `${Math.round(controlGeometry.actual.bombRight)} px`;
    viewport.querySelector('.preview-bottom-left')!.textContent = p.mode === 'floating' ? '' : `${Math.round(controlGeometry.actual.joystickBottom)} px`;
    viewport.querySelector('.preview-bottom-right')!.textContent = `${Math.round(controlGeometry.actual.bombBottom)} px`;
  }
  present(phase: GameFlowState<unknown>['phase'], view: string, blocked: boolean): void {
    this.phase = phase; this.playing = phase === 'playing';
    if (this.dialog.open) {
      if (blocked || !['menu','paused','result'].includes(phase)) this.close();
      else { const key = `${arenaLayout.revision}:${controlRevision()}:${appearance().mode}`; if (key !== this.previewKey) { this.previewKey = key; this.refresh(); } }
    }
    const key = `${phase}:${view}:${blocked}:${appearance().mode}:${Boolean(document.fullscreenElement)}`;
    if (key === this.stateKey) return; this.stateKey = key;
    this.root.hidden = !['playing','paused','result'].includes(phase) || blocked;
    const full = Boolean(document.fullscreenElement), light = appearance().mode === 'light', entities = view === 'entities';
    const items: [Icon, string][] = [[this.playing ? 'pause' : 'play', this.playing ? '暂停游戏' : '继续游戏'],
      [full ? 'restore' : 'fullscreen', full ? '退出全屏' : '进入全屏'], ['settings', '打开设置'],
      [light ? 'sun' : 'moon', light ? '切换为暗色主题' : '切换为亮色主题'], ['layers', entities ? '切换为正常画面' : '切换为实体层']];
    items.forEach(([name, label], index) => { const button = this.buttons[index]!; button.innerHTML = icon(name); button.setAttribute('aria-label', label); button.title = label; });
    this.buttons[0]!.disabled = phase === 'result'; this.buttons[1]!.setAttribute('aria-pressed', String(full));
    this.buttons[3]!.setAttribute('aria-pressed', String(light)); this.buttons[4]!.setAttribute('aria-pressed', String(entities));
  }
  destroy(): void { this.dialog.remove(); this.root.remove(); }
}
