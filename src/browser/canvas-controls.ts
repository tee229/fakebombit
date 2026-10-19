import Phaser from 'phaser';
import type { PlayerInput, TouchState } from '../input/player.js';
import type { GameFrame } from '../game-flow/session.js';
import type { Position } from '../match/index.js';
import { arenaLayout as layout } from './layout.js';
import { appearance, hex } from './appearance.js';
import { feedbackLabels, cycleVolume, cycleParticles } from './feedback-settings.js';

type Control = 'joystick' | 'bomb' | 'resume' | 'retry' | 'newMatch' | 'menu' | 'volume' | 'particles';
type PointerEventName = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'lostpointercapture';
type Commands = { resume(): void; retry(): void; newMatch(): void; menu(): void; };

/** Canvas presentation and native pointer capture; gameplay receives only intents. */
export class CanvasControls {
  private readonly root: Phaser.GameObjects.Container;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly pauseMessage: Phaser.GameObjects.Text;
  private readonly pauseLabels: Phaser.GameObjects.Text[];
  private readonly volumeLabel: Phaser.GameObjects.Text;
  private readonly particlesLabel: Phaser.GameObjects.Text;
  private readonly pauseTitle: Phaser.GameObjects.Text;
  private readonly controlLabels = new Map<Exclude<Control, 'joystick'>, Phaser.GameObjects.Text>();
  private revision = -1;
  private appearanceMode = '';
  private readonly pointers = new Map<number, Control>();
  private phase: GameFrame['phase'] = 'playing';
  private readonly canvas: HTMLCanvasElement;
  private readonly listeners: [PointerEventName, (event: PointerEvent) => void][];

  constructor(scene: Phaser.Scene, private readonly input: PlayerInput, private readonly commands: Commands) {
    this.canvas = scene.game.canvas;
    this.root = scene.add.container().setDepth(10);
    this.graphics = scene.add.graphics(); this.root.add(this.graphics);
    const label = (x: number, y: number, text: string, size = 24) => {
      const item = scene.add.text(x, y, text, { fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif', fontSize: `${size}px`, color: '#eaf3ed' }).setOrigin(0.5);
      this.root.add(item); return item;
    };
    const controlLabel = (control: Exclude<Control, 'joystick'>, text: string, size = 24) => {
      const item = label(layout[control].x, layout[control].y, text, size); this.controlLabels.set(control, item); return item;
    };
    controlLabel('bomb', '放弹');
    controlLabel('menu', '返回菜单', 18); controlLabel('retry', '重试'); controlLabel('newMatch', '新开一局', 22);
    this.pauseTitle = label(512, 254, '已暂停', 36);
    this.pauseMessage = label(512, 298, '点击继续，重新操作', 22);
    const resumeLabel = controlLabel('resume', '继续游戏', 28).setColor('#102b2c');
    this.pauseLabels = [this.pauseTitle, this.pauseMessage, resumeLabel];
    this.volumeLabel = controlLabel('volume', '', 20);
    this.particlesLabel = controlLabel('particles', '', 20);
    this.pauseLabels.push(this.volumeLabel, this.particlesLabel);
    this.listeners = [
      ['pointerdown', event => this.down(event)],
      ['pointermove', event => this.move(event)],
      ['pointerup', event => this.up(event)],
      ['pointercancel', event => this.cancel(event)],
      ['lostpointercapture', event => this.cancel(event)],
    ];
    for (const [name, listener] of this.listeners) this.canvas.addEventListener(name, listener);
  }

  present(frame: Pick<GameFrame, 'phase' | 'pauseReason'>, touch: TouchState): void {
    this.phase = frame.phase;
    if (this.revision !== layout.revision) {
      this.revision = layout.revision;
      for (const [control, text] of this.controlLabels) {
        const shape = layout[control];
        text.setPosition(shape.x, shape.y + (control === 'bomb' ? layout.bomb.radius * .4 : 0))
          .setFontSize(layout.compact ? (control === 'bomb' ? 16 : 14) / layout.cssScale : control === 'resume' ? 28 : control === 'menu' ? 18 : 22);
      }
      this.controlLabels.get('menu')!.setText(layout.compact ? '菜单' : '返回菜单');
      this.pauseTitle.setPosition(layout.pauseTitle.x, layout.pauseTitle.y).setFontSize(layout.compact ? 20 / layout.cssScale : 36);
      this.pauseMessage.setPosition(layout.pauseMessage.x, layout.pauseMessage.y).setFontSize(layout.compact ? 12 / layout.cssScale : 22)
        .setWordWrapWidth(layout.board.width - 16 / layout.cssScale);
    }
    const palette = appearance(), { ink, accent, surface } = palette;
    if (this.appearanceMode !== palette.mode) {
      this.appearanceMode = palette.mode;
      for (const [control, text] of this.controlLabels) text.setColor(hex(control === 'resume' ? palette.buttonInk : ink));
      this.pauseTitle.setColor(hex(ink)); this.pauseMessage.setColor(hex(palette.muted));
    }
    const g = this.graphics.clear();
    const active = this.phase === 'playing';
    this.controlLabels.get('bomb')!.setVisible(active);
    const buttons = active ? [] : [layout.menu, layout.retry, layout.newMatch];
    for (const control of ['menu', 'retry', 'newMatch'] as const) this.controlLabels.get(control)!.setVisible(!active);
    if (active) {
    g.fillStyle(surface).fillCircle(layout.joystick.x, layout.joystick.y, layout.joystick.radius);
    g.lineStyle(3, active && touch.joystickActive ? accent : 0x79958c).strokeCircle(layout.joystick.x, layout.joystick.y, layout.joystick.radius);
    // Four authored cardinal chevrons, with a knob that stays inside the base.
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const unit = layout.joystick.radius / 86;
      const x = layout.joystick.x + dx! * 63 * unit, y = layout.joystick.y + dy! * 63 * unit;
      g.lineStyle(3 * unit, ink).lineBetween(x - (dy! * 8 + dx! * 6) * unit, y + (dx! * 8 - dy! * 6) * unit, x + dx! * 6 * unit, y + dy! * 6 * unit)
        .lineBetween(x + dx! * 6 * unit, y + dy! * 6 * unit, x + (dy! * 8 - dx! * 6) * unit, y - (dx! * 8 + dy! * 6) * unit);
    }
    g.fillStyle(active ? accent : 0x496562).fillCircle(layout.joystick.x + touch.knob.x * layout.joystick.radius * .65, layout.joystick.y + touch.knob.y * layout.joystick.radius * .65, layout.joystick.radius * .30);
    g.fillStyle(active && touch.bombHeld ? 0x496562 : surface).fillCircle(layout.bomb.x, layout.bomb.y, layout.bomb.radius);
    g.lineStyle(3, palette.mode === 'light' ? 0x8c5e12 : 0xf1ca7c).strokeCircle(layout.bomb.x, layout.bomb.y, layout.bomb.radius);
    const unit = layout.bomb.radius / 72;
    g.lineStyle(3 * unit, ink).strokeCircle(layout.bomb.x, layout.bomb.y - 17 * unit, 18 * unit)
      .lineBetween(layout.bomb.x + 8 * unit, layout.bomb.y - 33 * unit, layout.bomb.x + 16 * unit, layout.bomb.y - 43 * unit);
    }
    for (const button of buttons) {
      g.fillStyle(surface).fillRoundedRect(button.x - button.width / 2, button.y - button.height / 2, button.width, button.height, 8);
      g.lineStyle(2, 0x79958c).strokeRoundedRect(button.x - button.width / 2, button.y - button.height / 2, button.width, button.height, 8);
    }
    for (const item of this.pauseLabels) item.setVisible(this.phase === 'paused');
    if (this.phase === 'paused') {
      g.fillStyle(palette.background, 0.96).fillRect(layout.board.x, layout.board.y, layout.board.width, layout.board.height);
      const button = layout.resume;
      g.fillStyle(accent).fillRoundedRect(button.x - button.width / 2, button.y - button.height / 2, button.width, button.height, 8);
      this.pauseMessage.setText(frame.pauseReason === 'background' ? '离开页面已暂停，返回后手动继续' : '点击继续，重新操作');
      const labels = feedbackLabels(); this.volumeLabel.setText(labels.volume); this.particlesLabel.setText(labels.particles);
      for (const control of [layout.volume, layout.particles]) {
        g.fillStyle(surface).fillRoundedRect(control.x - control.width / 2, control.y - control.height / 2, control.width, control.height, 6);
        g.lineStyle(2, 0x79958c).strokeRoundedRect(control.x - control.width / 2, control.y - control.height / 2, control.width, control.height, 6);
      }
    }
  }

  clear(): void {
    this.input.clear();
    const ids = [...this.pointers.keys()]; this.pointers.clear();
    for (const id of ids) if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  }

  destroy(): void {
    for (const [name, listener] of this.listeners) this.canvas.removeEventListener(name, listener);
    this.clear(); this.root.destroy(true);
  }

  private position(event: PointerEvent): Position {
    const bounds = this.canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * layout.width / bounds.width, y: (event.clientY - bounds.top) * layout.height / bounds.height };
  }
  private offset(point: Position): Position {
    return { x: (point.x - layout.joystick.x) / layout.joystick.radius, y: (point.y - layout.joystick.y) / layout.joystick.radius };
  }
  private inside(control: Control, point: Position): boolean {
    const shape = layout[control];
    if ('radius' in shape) return Math.hypot(point.x - shape.x, point.y - shape.y) <= shape.radius;
    return Math.abs(point.x - shape.x) <= shape.width / 2 && Math.abs(point.y - shape.y) <= shape.height / 2;
  }
  private down(event: PointerEvent): void {
    if (event.button !== 0 || this.pointers.has(event.pointerId)) return;
    const point = this.position(event);
    const available: Control[] = this.phase === 'paused' ? ['resume', 'retry', 'newMatch', 'menu', 'volume', 'particles']
      : this.phase === 'ended' ? ['retry', 'newMatch', 'menu'] : ['joystick', 'bomb'];
    const control = available.find(item => this.inside(item, point));
    if (!control) return;
    if ((control === 'joystick' || control === 'bomb') && !this.input.pointerDown(event.pointerId, control, this.offset(point))) return;
    this.pointers.set(event.pointerId, control);
    this.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  private move(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) return;
    if (this.pointers.get(event.pointerId) === 'joystick') this.input.pointerMove(event.pointerId, this.offset(this.position(event)));
    event.preventDefault();
  }
  private up(event: PointerEvent): void {
    const control = this.pointers.get(event.pointerId);
    if (!control) return;
    this.pointers.delete(event.pointerId);
    this.input.pointerUp(event.pointerId);
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    event.preventDefault();
    if (!this.inside(control, this.position(event))) return;
    if (control === 'volume') cycleVolume();
    else if (control === 'particles') cycleParticles();
    else if (control !== 'joystick' && control !== 'bomb') this.commands[control]();
  }
  private cancel(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) return;
    this.clear();
  }
}
