import Phaser from 'phaser';
import { createMatch } from '../match/index.js';
import { createKeyboardInput } from '../input/keyboard.js';
import { createGameSession, type GameSession } from '../game-flow/session.js';
import { EntitiesView } from './entities-view.js';
import { trainingMatchConfig } from './training-map.js';
import './style.css';

// This is the only composition root: input -> game flow -> readonly state/events -> Phaser view.
class TrainingScene extends Phaser.Scene {
  private session: GameSession | undefined;
  private view: EntitiesView | undefined;
  private lastResult = '';
  constructor() { super('training'); }

  create(): void {
    const match = createMatch(trainingMatchConfig);
    const input = createKeyboardInput();
    this.session = createGameSession(match, input);
    const view = new EntitiesView(this, match.readWorld());
    this.view = view;
    this.lastResult = '';
    const keyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'KeyR') {
        event.preventDefault();
        if (!event.repeat) this.scene.restart();
      } else if (input.keyDown(event.code, event.repeat)) event.preventDefault();
    };
    const keyUp = (event: KeyboardEvent) => { if (input.keyUp(event.code)) event.preventDefault(); };
    const clearInput = () => input.clear();
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', clearInput);
    let disposed = false;
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', clearInput);
      input.clear(); view.destroy();
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
    if (status) status.textContent = '训练已开始。使用 WASD 或方向键移动，空格放弹，R 重试。';
  }

  update(): void {
    if (!this.session || !this.view) return;
    const frame = this.session.advanceFrame(this.game.loop.rawDelta);
    this.view.present(frame.world, frame.alpha, frame.events);
    // DOM observability for the canvas surface; these values never feed back into gameplay.
    const canvas = this.game.canvas;
    const player = frame.world.actors.find(actor => actor.id === frame.world.initialization.playerId)!;
    canvas.dataset.tick = String(frame.world.tick);
    canvas.dataset.playerX = player.position.x.toFixed(3);
    canvas.dataset.playerY = player.position.y.toFixed(3);
    canvas.dataset.bombs = String(frame.world.bombs.length);
    canvas.dataset.hazards = String(frame.world.hazards.length);
    canvas.dataset.result = frame.world.result?.outcome ?? 'playing';
    const result = frame.world.result?.outcome ?? '';
    if (result && result !== this.lastResult) {
      this.lastResult = result;
      const status = document.getElementById('game-status');
      if (status) status.textContent = `${{ won: '练习完成', lost: '被炸中了', draw: '时间到' }[result]}。按 R 重试本局。`;
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
  width: 1024, height: 720,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  fps: { target: renderFps, forceSetTimeOut: fpsParameter !== null, smoothStep: false },
  scene: TrainingScene,
  audio: { noAudio: true },
});

if (import.meta.hot) import.meta.hot.dispose(() => game.destroy(true));
