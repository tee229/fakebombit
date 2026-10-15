import Phaser from 'phaser';
import type { PlayerInput, TouchState } from '../input/player.js';
import type { GameFrame } from '../game-flow/session.js';
import type { Position } from '../match/index.js';
import { arenaLayout as layout } from './layout.js';

type Control = 'joystick' | 'bomb' | 'pause' | 'resume' | 'retry' | 'newMatch';
type PointerEventName = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'lostpointercapture';
type Commands = { pause(): void; resume(): void; retry(): void; newMatch(): void };
const ink = 0xeaf3ed, accent = 0x83dfb6, surface = 0x173737;

/** Canvas presentation and native pointer capture; gameplay receives only intents. */
export class CanvasControls {
  private readonly root: Phaser.GameObjects.Container;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly pauseLabel: Phaser.GameObjects.Text;
  private readonly pauseMessage: Phaser.GameObjects.Text;
  private readonly pauseLabels: Phaser.GameObjects.Text[];
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
    label(layout.joystick.x, 500, '拖动移动');
    label(layout.bomb.x, layout.bomb.y + 28, '放弹');
    this.pauseLabel = label(layout.pause.x, layout.pause.y, '暂停');
    label(layout.retry.x, layout.retry.y, '重试');
    label(layout.newMatch.x, layout.newMatch.y, '新开一局', 22);
    const pauseTitle = label(512, 254, '已暂停', 36);
    this.pauseMessage = label(512, 298, '点击继续，重新操作', 22);
    const resumeLabel = label(layout.resume.x, layout.resume.y, '继续游戏', 28).setColor('#102b2c');
    this.pauseLabels = [pauseTitle, this.pauseMessage, resumeLabel];
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
    const g = this.graphics.clear();
    const active = this.phase === 'playing';
    g.fillStyle(surface).fillCircle(layout.joystick.x, layout.joystick.y, layout.joystick.radius);
    g.lineStyle(3, active && touch.joystickActive ? accent : 0x79958c).strokeCircle(layout.joystick.x, layout.joystick.y, layout.joystick.radius);
    // Four authored cardinal chevrons, with a knob that stays inside the base.
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const x = layout.joystick.x + dx! * 63, y = layout.joystick.y + dy! * 63;
      g.lineStyle(3, ink).lineBetween(x - dy! * 8 - dx! * 6, y + dx! * 8 - dy! * 6, x + dx! * 6, y + dy! * 6)
        .lineBetween(x + dx! * 6, y + dy! * 6, x + dy! * 8 - dx! * 6, y - dx! * 8 - dy! * 6);
    }
    g.fillStyle(active ? accent : 0x496562).fillCircle(layout.joystick.x + touch.knob.x * 56, layout.joystick.y + touch.knob.y * 56, 26);
    g.fillStyle(active && touch.bombHeld ? 0x496562 : surface).fillCircle(layout.bomb.x, layout.bomb.y, layout.bomb.radius);
    g.lineStyle(3, active ? 0xf1ca7c : 0x79958c).strokeCircle(layout.bomb.x, layout.bomb.y, layout.bomb.radius);
    g.lineStyle(3, ink).strokeCircle(layout.bomb.x, layout.bomb.y - 17, 18)
      .lineBetween(layout.bomb.x + 8, layout.bomb.y - 33, layout.bomb.x + 16, layout.bomb.y - 43);
    for (const button of [layout.pause, layout.retry, layout.newMatch]) {
      g.fillStyle(surface).fillRoundedRect(button.x - button.width / 2, button.y - button.height / 2, button.width, button.height, 8);
      g.lineStyle(2, 0x79958c).strokeRoundedRect(button.x - button.width / 2, button.y - button.height / 2, button.width, button.height, 8);
    }
    this.pauseLabel.setAlpha(active ? 1 : 0.45);
    for (const item of this.pauseLabels) item.setVisible(this.phase === 'paused');
    if (this.phase === 'paused') {
      g.fillStyle(0x102b2c, 0.96).fillRect(layout.board.x, layout.board.y, layout.board.width, layout.board.height);
      const button = layout.resume;
      g.fillStyle(accent).fillRoundedRect(button.x - button.width / 2, button.y - button.height / 2, button.width, button.height, 8);
      this.pauseMessage.setText(frame.pauseReason === 'background' ? '离开页面已暂停，返回后手动继续' : '点击继续，重新操作');
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
    const available: Control[] = this.phase === 'paused' ? ['resume', 'retry', 'newMatch'] : this.phase === 'ended' ? ['retry', 'newMatch'] : ['pause', 'retry', 'newMatch', 'joystick', 'bomb'];
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
    if (control !== 'joystick' && control !== 'bomb' && this.inside(control, this.position(event))) this.commands[control]();
  }
  private cancel(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) return;
    this.clear();
  }
}
