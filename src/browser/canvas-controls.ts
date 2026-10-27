import type Phaser from 'phaser';
import type { PlayerInput, TouchState } from '../input/player.js';
import type { GameFrame } from '../game-flow/session.js';
import type { Position } from '../match/index.js';
import { arenaLayout as layout, controlGeometry } from './layout.js';
import { controlRevision, readControlPreferences } from './control-preferences.js';
import { icon } from './ui-icons.js';
import { resultLabels } from './result-labels.js';

type Control = 'joystick' | 'bomb';
type PointerEventName = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'lostpointercapture';
type Commands = { resume(): void; retry(): void; newMatch(): void; menu(): void; settings(): void };

/** One geometry drives drawing, hit testing and normalized input. The world receives intents only. */
export class CanvasControls {
  private readonly root = document.createElement('div');
  private readonly overlay = document.createElement('section');
  private readonly joystick: HTMLButtonElement;
  private readonly bomb: HTMLButtonElement;
  private readonly knob: HTMLElement;
  private readonly pointers = new Map<number, Control>();
  private phase: GameFrame['phase'] = 'playing';
  private readonly canvas: HTMLCanvasElement;
  private readonly listeners: [PointerEventName, (event: PointerEvent) => void][];
  private revision = '';
  private center: Position | null = null;
  private pressOrigin: Position | null = null;
  private overlayState = '';

  constructor(scene: Phaser.Scene, private readonly input: PlayerInput, commands: Commands) {
    this.canvas = scene.game.canvas;
    this.root.className = 'touch-controls';
    this.root.innerHTML = `<button type="button" class="joystick touch-button" aria-label="四向移动摇杆"><span class="joy-up">${icon('up')}</span><span class="joy-right">${icon('right')}</span><span class="joy-down">${icon('down')}</span><span class="joy-left">${icon('left')}</span><span class="joystick-knob"></span></button><button type="button" class="bomb-control touch-button" aria-label="放弹">${icon('bomb')}<span>放弹</span></button>`;
    this.joystick = this.root.querySelector('.joystick')!; this.bomb = this.root.querySelector('.bomb-control')!; this.knob = this.root.querySelector('.joystick-knob')!;
    this.overlay.className = 'match-overlay'; this.overlay.hidden = true;
    this.overlay.innerHTML = `<div class="match-overlay-card"><p class="overlay-eyebrow">FAKE BOMB IT</p><h1></h1><p class="overlay-message"></p><button type="button" class="primary-button overlay-resume">${icon('play')}继续游戏</button><div class="overlay-actions"><button type="button" class="secondary-button overlay-retry">${icon('retry')}重试本局</button><button type="button" class="secondary-button overlay-new">新开一局</button></div><div class="overlay-footer"><button type="button" class="text-button overlay-menu">${icon('home')}返回菜单</button><button type="button" class="text-button overlay-settings">${icon('settings')}设置</button></div></div>`;
    this.overlay.querySelector('.overlay-resume')!.addEventListener('click', commands.resume);
    this.overlay.querySelector('.overlay-retry')!.addEventListener('click', commands.retry);
    this.overlay.querySelector('.overlay-new')!.addEventListener('click', commands.newMatch);
    this.overlay.querySelector('.overlay-menu')!.addEventListener('click', commands.menu);
    this.overlay.querySelector('.overlay-settings')!.addEventListener('click', commands.settings);
    document.getElementById('game')!.append(this.root, this.overlay);
    this.listeners = [['pointerdown', event => this.down(event)], ['pointermove', event => this.move(event)],
      ['pointerup', event => this.up(event)], ['pointercancel', event => this.cancel(event)], ['lostpointercapture', event => this.cancel(event)]];
    // WebKit can deliver move/up to the original button despite canvas capture.
    // Both surfaces must finish the owning pointer before capture loss arrives.
    for (const [name, listener] of this.listeners) { this.canvas.addEventListener(name, listener); this.root.addEventListener(name, listener); }
    this.bomb.addEventListener('keydown', event => {
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      event.preventDefault(); event.stopPropagation(); if (!event.repeat && this.phase === 'playing') this.input.pointerDown(-1, 'bomb');
    });
    this.bomb.addEventListener('keyup', event => {
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      event.preventDefault(); event.stopPropagation(); this.input.pointerUp(-1);
    });
    this.bomb.addEventListener('blur', () => this.input.pointerUp(-1));
    // Focused menu buttons keep their native Enter/Space activation, never fire gameplay shortcuts.
    for (const name of ['keydown','keyup']) this.overlay.addEventListener(name, event => event.stopPropagation());
  }
  present(frame: Pick<GameFrame, 'phase' | 'pauseReason' | 'world'>, touch: TouchState): void {
    const revision = `${layout.revision}:${controlRevision()}`;
    if (revision !== this.revision || frame.phase !== this.phase) { this.clear(); this.revision = revision; }
    this.phase = frame.phase;
    const active = frame.phase === 'playing', floating = readControlPreferences().mode === 'floating';
    this.root.hidden = !active;
    this.joystick.hidden = floating && !touch.joystickActive;
    const place = (button: HTMLElement, control: { x: number; y: number; radius: number }) => {
      const s = layout.cssScale;
      Object.assign(button.style, { left: `${(control.x - control.radius) * s}px`, top: `${(control.y - control.radius) * s}px`, width: `${control.radius * 2 * s}px`, height: `${control.radius * 2 * s}px` });
    };
    const center = this.center ?? layout.joystick; place(this.joystick, { ...layout.joystick, ...center }); place(this.bomb, layout.bomb);
    this.joystick.classList.toggle('held', touch.joystickActive); this.bomb.classList.toggle('held', touch.bombHeld);
    this.knob.style.transform = `translate(${touch.knob.x * 100}%, ${touch.knob.y * 100}%)`;
    this.overlay.hidden = active;
    const state = `${frame.phase}:${frame.pauseReason}:${frame.world.result?.outcome}`;
    if (!active && state !== this.overlayState) {
      this.overlayState = state;
      const ended = frame.phase === 'ended';
      this.overlay.querySelector('h1')!.textContent = ended ? resultLabels[frame.world.result!.outcome] : '稍作休息';
      this.overlay.querySelector('.overlay-message')!.textContent = ended ? '再来一局，炸出新路线。' : frame.pauseReason === 'background' ? '离开页面后已暂停。准备好后手动继续。' : '对局已暂停，准备好后继续。';
      this.overlay.querySelector<HTMLButtonElement>('.overlay-resume')!.hidden = ended;
    }
    this.canvas.dataset.controlMode = readControlPreferences().mode;
    this.canvas.dataset.joystickCenter = this.center ? JSON.stringify(this.center) : '';
    this.canvas.dataset.controlMargins = JSON.stringify(controlGeometry.actual);
  }
  clear(): void {
    this.input.clear(); this.center = null; this.pressOrigin = null;
    const ids = [...this.pointers.keys()]; this.pointers.clear();
    for (const id of ids) if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  }
  destroy(): void {
    for (const [name, listener] of this.listeners) { this.canvas.removeEventListener(name, listener); this.root.removeEventListener(name, listener); }
    this.clear(); this.root.remove(); this.overlay.remove();
  }
  private position(event: PointerEvent): Position {
    const bounds = this.canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * layout.width / bounds.width, y: (event.clientY - bounds.top) * layout.height / bounds.height };
  }
  private offset(point: Position): Position { const center = this.pressOrigin ?? layout.joystick;
    return { x: (point.x - center.x) / layout.joystick.radius, y: (point.y - center.y) / layout.joystick.radius };
  }
  private inside(control: Control, point: Position): boolean { const shape = layout[control]; return Math.hypot(point.x - shape.x, point.y - shape.y) <= shape.radius; }
  private down(event: PointerEvent): void {
    if (this.phase !== 'playing' || event.button !== 0 || this.pointers.has(event.pointerId)) return;
    const point = this.position(event), floating = readControlPreferences().mode === 'floating', area = controlGeometry.floatingArea;
    let control: Control | undefined;
    if (this.inside('bomb', point)) control = 'bomb';
    else if (!floating && this.inside('joystick', point)) control = 'joystick';
    else if (floating && point.x >= area.left && point.x <= area.right && point.y >= area.top && point.y <= area.bottom) control = 'joystick';
    if (!control) return;
    if (control === 'joystick' && floating) {
      if (this.input.readTouch().joystickActive) return;
      const r = layout.joystick.radius;
      this.center = { x: Math.max(area.left + r, Math.min(area.right - r, point.x)), y: Math.max(area.top + r, Math.min(area.bottom - r, point.y)) };
      this.pressOrigin = point;
    }
    // A floating press is neutral even if its center was moved inward from an edge.
    if (!this.input.pointerDown(event.pointerId, control, control === 'joystick' && floating ? { x: 0, y: 0 } : this.offset(point))) return;
    this.pointers.set(event.pointerId, control); this.canvas.setPointerCapture(event.pointerId); event.preventDefault();
  }
  private move(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) return;
    if (this.pointers.get(event.pointerId) === 'joystick') this.input.pointerMove(event.pointerId, this.offset(this.position(event)));
    event.preventDefault();
  }
  private up(event: PointerEvent): void {
    const control = this.pointers.get(event.pointerId); if (!control) return;
    this.pointers.delete(event.pointerId); this.input.pointerUp(event.pointerId); if (control === 'joystick') { this.center = null; this.pressOrigin = null; }
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId); event.preventDefault();
  }
  private cancel(event: PointerEvent): void { if (this.pointers.has(event.pointerId)) this.clear(); }
}
