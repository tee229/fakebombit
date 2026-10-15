import Phaser from 'phaser';
import { createMatch, MatchError, type InitializationRecord, type Match } from '../match/index.js';
import { createPlayerInput, type PlayerInput } from '../input/player.js';
import { createGameSession, type GameSession, type PauseReason, type GameFrame } from '../game-flow/session.js';
import { EntitiesView } from './entities-view.js';
import { trainingMatchConfig } from './training-map.js';
import { resultLabels } from './result-labels.js';
import { CanvasControls } from './canvas-controls.js';
import { arenaLayout } from './layout.js';
import { createItemTrainingMatch } from './item-training.js';
import { createEscapeTrainingMatch } from './escape-training.js';
import { createNormalTrainingMatch } from './normal-training.js';
import './style.css';

// This is the only composition root: input -> game flow -> readonly state/events -> Phaser view.
class TrainingScene extends Phaser.Scene {
  private session: GameSession | undefined;
  private view: EntitiesView | undefined;
  private lastResult = '';
  private inputState: PlayerInput | undefined;
  private controls: CanvasControls | undefined;
  private phase: GameFrame['phase'] = 'playing';
  private initialization: InitializationRecord | undefined;
  constructor() { super('training'); }

  create(): void {
    const url = new URL(window.location.href);
    const requestedArena = url.searchParams.get('arena');
    const arena = requestedArena === 'items' || requestedArena === 'escape' || requestedArena === 'training' || requestedArena === 'normal' ? requestedArena : 'generated';
    const canvas = this.game.canvas;
    for (const key of Object.keys(canvas.dataset)) delete canvas.dataset[key];
    let match: Match | undefined;
    let failure: unknown;
    try {
      if (arena === 'generated') {
        const seed = url.searchParams.get('seed') ?? freshSeed();
        url.searchParams.set('seed', seed); window.history.replaceState(null, '', url);
        const requestedCount = Number(url.searchParams.get('ai'));
        const aiCount = [1, 2, 3].includes(requestedCount) ? requestedCount : 3;
        const requestedSeconds = Number(url.searchParams.get('seconds'));
        const matchDurationSeconds = Number.isInteger(requestedSeconds) && requestedSeconds >= 1 && requestedSeconds <= 120 ? requestedSeconds : 120;
        const actors = ['player', 'target-1', 'target-2', 'target-3'].slice(0, aiCount + 1).map(id => ({ id, type: 'actor' as const, spawnId: id, ...(id === 'player' ? {} : { ai: { mode: 'normal' as const } }) }));
        match = createMatch(this.initialization ?? { seed, generator: {}, playerId: 'player', actors, rules: { matchDurationSeconds } });
        this.initialization = match.readWorld().initialization;
      } else match = arena === 'items' ? createItemTrainingMatch() : arena === 'escape' ? createEscapeTrainingMatch() : arena === 'normal' ? createNormalTrainingMatch() : createMatch(trainingMatchConfig);
    } catch (error) {
      if (!(error instanceof MatchError)) throw error;
      failure = error;
      this.phase = 'ended'; canvas.dataset.phase = 'failed'; canvas.dataset.error = error.message;
      const style = { fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif', color: '#eaf3ed' };
      this.add.text(512, 205, '无法开始本局', { ...style, fontSize: '32px' }).setOrigin(0.5);
      this.add.text(512, 275, error.code === 'generation-failed' ? '初始逃生验证未通过，生成尝试已结束。' : '种子或配置无效。', { ...style, fontSize: '20px' }).setOrigin(0.5);
      this.add.text(512, 330, '点击新开一局换图，或重试当前种子。', { ...style, fontSize: '20px' }).setOrigin(0.5);
    }
    const input = createPlayerInput();
    this.inputState = input;
    this.session = match ? createGameSession(match, input) : undefined;
    const view = match ? new EntitiesView(this, match.readWorld(), arena) : undefined;
    this.view = view;
    this.lastResult = '';
    this.phase = match ? 'playing' : 'ended';
    this.controls = new CanvasControls(this, input, {
      pause: () => this.pause('manual'), resume: () => this.resume(), retry: () => this.scene.restart(),
      newMatch: () => this.newMatch(),
    });
    this.controls.present(this.session?.advanceFrame(0) ?? { phase: 'ended', pauseReason: null }, input.readTouch());
    if (match) {
      const world = match.readWorld();
      canvas.dataset.seed = world.initialization.seed;
      canvas.dataset.map = JSON.stringify(world.initialMap.blockers);
      canvas.dataset.mapWidth = String(world.initialMap.width); canvas.dataset.mapHeight = String(world.initialMap.height);
      canvas.dataset.generationSource = world.initialization.generation?.source ?? 'fixed';
      canvas.dataset.generationAttempts = String(world.initialization.generation?.attempts.length ?? 0);
      canvas.dataset.aiCount = String(world.actors.filter(actor => actor.ai).length);
    }
    const keyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'KeyN') {
        event.preventDefault();
        if (!event.repeat) this.newMatch();
      } else if (event.code === 'KeyR') {
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
      input.clear(); view?.destroy();
      this.controls = undefined; this.inputState = undefined;
      this.session = undefined; this.view = undefined;
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    this.game.canvas.tabIndex = 0;
    this.game.canvas.setAttribute('role', 'application');
    const arenaLabels = { generated: `种子地图：1 名玩家对 ${canvas.dataset.aiCount ?? 3} 名正常 AI，R 重试，N 新开一局`, normal: '正常 AI 练习场：原地放弹封住出口，再左移下行躲开爆炸，R 重试', training: '实体训练场：玩家、墙、障碍、三类道具，一个逃生 AI 及两个静止目标', items: '道具练习场：上行后向右依次拾取距离、容量、速度道具；三个静止目标', escape: '逃生练习场：观察 AI 从两颗已知炸弹的连锁范围逃生，R 重放' };
    this.game.canvas.setAttribute('aria-label', `${arenaLabels[arena]}。种子：${canvas.dataset.seed ?? url.searchParams.get('seed') ?? ''}`);
    this.game.canvas.setAttribute('aria-describedby', 'instructions');
    this.game.canvas.focus({ preventScroll: true });
    const status = document.getElementById('game-status');
    if (status) status.textContent = failure ? `无法开始本局：${canvas.dataset.error}。按 N 新开一局，R 重试。` : '本局已开始。左侧摇杆移动，右侧放弹；WASD、空格、R 重试、N 新开一局和 P 暂停。完整种子显示在页面地址中。';
    if (document.visibilityState === 'hidden') background();
  }

  private newMatch(): void {
    const url = new URL(window.location.href);
    url.searchParams.set('seed', freshSeed(url.searchParams.get('seed')));
    url.searchParams.delete('arena');
    window.history.replaceState(null, '', url);
    this.initialization = undefined;
    this.scene.restart();
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
    canvas.dataset.items = String(frame.world.items.length);
    canvas.dataset.capacity = String(player.abilities.bombCapacity);
    canvas.dataset.range = String(player.abilities.blastRange);
    canvas.dataset.speed = String(player.abilities.speed);
    canvas.dataset.result = frame.world.result?.outcome ?? 'playing';
    canvas.dataset.phase = frame.phase;
    canvas.dataset.pauseReason = frame.pauseReason ?? '';
    canvas.dataset.joystick = touch.direction ?? '';
    const enemy = frame.world.actors.find(actor => actor.ai);
    canvas.dataset.aiX = enemy?.position.x.toFixed(3) ?? '';
    canvas.dataset.aiY = enemy?.position.y.toFixed(3) ?? '';
    canvas.dataset.aiStatus = enemy?.ai?.status ?? '';
    canvas.dataset.aiAlive = String(enemy?.alive ?? false);
    canvas.dataset.opponents = JSON.stringify(frame.world.actors.filter(actor => actor.id !== player.id).map(actor => ({ id: actor.id, alive: actor.alive, position: actor.position, abilities: actor.abilities, ai: actor.ai })));
    if (frame.events.some(event => event.type === 'item-collected' && event.actorId === player.id)) {
      const status = document.getElementById('game-status');
      if (status) status.textContent = `已拾取道具。容量 ${player.abilities.bombCapacity}，距离 ${player.abilities.blastRange} 格，速度 ${player.abilities.speed} 格每秒。`;
    }
    const result = frame.world.result?.outcome ?? '';
    if (result && result !== this.lastResult) {
      this.lastResult = result;
      const status = document.getElementById('game-status');
      if (status) status.textContent = `${resultLabels[result]}。按 R 重试本局，按 N 新开一局，也可点击右侧对应按钮。`;
    }
  }
}

function freshSeed(previous: string | null = null): string {
  const seed = [...crypto.getRandomValues(new Uint32Array(2))].map(value => value.toString(36)).join('-');
  return seed === previous ? `${seed}-n` : seed;
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
