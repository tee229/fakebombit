import Phaser from 'phaser';
import { createMatch } from '../match/index.js';
import { createPlayerInput, type PlayerInput } from '../input/player.js';
import { createGameSession, type GameSession, type PauseReason, type GameFrame } from '../game-flow/session.js';
import { EntitiesView } from './entities-view.js';
import { trainingMatchConfig } from './training-map.js';
import { resultLabels } from './result-labels.js';
import { CanvasControls } from './canvas-controls.js';
import { arenaLayout } from './layout.js';
import './style.css';

// This is the only composition root: input -> game flow -> readonly state/events -> Phaser view.
class TrainingScene extends Phaser.Scene {
  private session: GameSession | undefined;
  private view: EntitiesView | undefined;
  private lastResult = '';
  private inputState: PlayerInput | undefined;
  private controls: CanvasControls | undefined;
  private phase: GameFrame['phase'] = 'playing';
  constructor() { super('training'); }

  create(): void {
    const match = createMatch(trainingMatchConfig);
    const input = createPlayerInput();
    this.inputState = input;
    this.session = createGameSession(match, input);
    const view = new EntitiesView(this, match.readWorld());
    this.view = view;
    this.lastResult = '';
    this.phase = 'playing';
    this.controls = new CanvasControls(this, input, {
      pause: () => this.pause('manual'), resume: () => this.resume(), retry: () => this.scene.restart(),
    });
    this.controls.present(this.session.advanceFrame(0), input.readTouch());
    const keyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'KeyR') {
        event.preventDefault();
        if (!event.repeat) this.scene.restart();
      } else if (event.code === 'Escape' || event.code === 'KeyP' || (event.code === 'Enter' && this.phase === 'paused')) {
        event.preventDefault();
        if (!event.repeat) { if (this.phase === 'paused') this.resume(); else this.pause('manual'); }
      } else if (this.phase === 'playing' && input.keyDown(event.code, event.repeat)) event.preventDefault();
    };
    const keyUp = (event: KeyboardEvent) => { if (input.keyUp(event.code)) event.preventDefault(); };
    const background = () => this.pause('background');
    const visibility = () => { if (document.visibilityState === 'hidden') background(); };
    const clearInput = () => this.controls?.clear();
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', background);
    window.addEventListener('pagehide', background);
    window.addEventListener('resize', clearInput);
    document.addEventListener('visibilitychange', visibility);
    let disposed = false;
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', background);
      window.removeEventListener('pagehide', background);
      window.removeEventListener('resize', clearInput);
      document.removeEventListener('visibilitychange', visibility);
      this.controls?.destroy(); this.sound.stopAll();
      input.clear(); view.destroy();
      this.controls = undefined; this.inputState = undefined;
      this.session = undefined; this.view = undefined;
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    this.game.canvas.tabIndex = 0;
    this.game.canvas.setAttribute('role', 'application');
    this.game.canvas.setAttribute('aria-label', '实体训练场：玩家、固定墙、可破坏障碍及三个静止目标');
    this.game.canvas.setAttribute('aria-describedby', 'instructions');
    this.game.canvas.focus({ preventScroll: true });
    const status = document.getElementById('game-status');
    if (status) status.textContent = '训练已开始。左侧摇杆移动，右侧放弹；支持 WASD、空格、R 重试和 P 暂停。';
    if (document.visibilityState === 'hidden') background();
  }

  private pause(reason: PauseReason): void {
    if (!this.session || this.phase === 'ended') return;
    if (this.session.pause(reason)) this.sound.pauseAll();
    this.phase = 'paused';
    this.game.canvas.dataset.phase = 'paused';
    this.game.canvas.dataset.pauseReason = reason;
    this.game.canvas.dataset.joystick = '';
    this.controls?.clear();
    if (this.inputState) this.controls?.present(this.session.advanceFrame(0), this.inputState.readTouch());
    const status = document.getElementById('game-status');
    if (status) status.textContent = '对局已暂停。返回页面后，点击画布内继续游戏或按 Enter 手动继续。';
  }

  private resume(): void {
    if (document.visibilityState === 'hidden' || !document.hasFocus() || !this.session) return;
    if (this.session.resume()) { this.phase = 'playing'; this.sound.resumeAll(); }
    const status = document.getElementById('game-status');
    if (status && this.phase === 'playing') status.textContent = '已继续。重新操作摇杆或方向键移动。';
  }

  update(): void {
    if (!this.session || !this.view || !this.inputState) return;
    const frame = this.session.advanceFrame(this.game.loop.rawDelta);
    this.view.present(frame.world, frame.alpha, frame.events);
    this.phase = frame.phase;
    const touch = this.inputState.readTouch();
    this.controls?.present(frame, touch);
    // DOM observability for the canvas surface; these values never feed back into gameplay.
    const canvas = this.game.canvas;
    const player = frame.world.actors.find(actor => actor.id === frame.world.initialization.playerId)!;
    canvas.dataset.tick = String(frame.world.tick);
    canvas.dataset.playerX = player.position.x.toFixed(3);
    canvas.dataset.playerY = player.position.y.toFixed(3);
    canvas.dataset.bombs = String(frame.world.bombs.length);
    canvas.dataset.hazards = String(frame.world.hazards.length);
    canvas.dataset.result = frame.world.result?.outcome ?? 'playing';
    canvas.dataset.phase = frame.phase;
    canvas.dataset.pauseReason = frame.pauseReason ?? '';
    canvas.dataset.joystick = touch.direction ?? '';
    const result = frame.world.result?.outcome ?? '';
    if (result && result !== this.lastResult) {
      this.lastResult = result;
      const status = document.getElementById('game-status');
      if (status) status.textContent = `${resultLabels[result]}。按 R 重试本局。`;
    }
  }
}

const fpsParameter = new URLSearchParams(window.location.search).get('fps');
const requestedFps = Number(fpsParameter);
const renderFps = [30, 60, 120].includes(requestedFps) ? requestedFps : 60;
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#102b2c',
  width: arenaLayout.width, height: arenaLayout.height,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  fps: { target: renderFps, forceSetTimeOut: fpsParameter !== null, smoothStep: false },
  scene: TrainingScene,
  audio: { noAudio: true },
});

if (import.meta.hot) import.meta.hot.dispose(() => game.destroy(true));
