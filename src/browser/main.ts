import Phaser from 'phaser';
import { createGameFlow, type GameFlow, type GameRun, type RunPresentation } from '../game-flow/index.js';
import { withSkin } from '../resources/index.js';
import { builtinThemes } from '../resources/builtin-themes.js';
import { builtinSkins } from '../resources/builtin-skins.js';
import { resources, installTextures, diagnosticPackage } from './app-resources.js';
import { makeMatch, freshMatch, type Arena } from './match-setup.js';
import { MatchView } from './match-view.js';
import { ThemeMenu, preloadMenu } from './theme-scene.js';
import { resultLabels } from './result-labels.js';
import { CanvasControls } from './canvas-controls.js';
import { arenaLayout, updateArenaLayout } from './layout.js';
import { preloadFeedbackAudio } from './feedback-audio.js';
import { AcceptancePanel } from './acceptance-panel.js';
import { GameToolbar } from './game-toolbar.js';
import { appearance, hex } from './appearance.js';
import './style.css';

// Single composition root. Phaser is a host for a business flow that also runs without the engine.
class GameScene extends Phaser.Scene {
  private flow: GameFlow<HTMLImageElement> | undefined;
  private menu: ThemeMenu | undefined;
  private acceptance: AcceptancePanel | undefined;
  private toolbar: GameToolbar | undefined;
  private appearanceMode = '';
  private arena: Arena = 'generated';
  private live: { id: number; view: MatchView; controls: CanvasControls; listenerCount: () => number; lastResult: string } | undefined;
  constructor() { super('game'); }
  preload(): void { preloadMenu(this); preloadFeedbackAudio(this); }
  create(): void {
    if (new URLSearchParams(location.search).get('acceptance') === '1') this.acceptance = new AcceptancePanel(this.game.canvas);
    this.flow = createGameFlow({ resources, selection: diagnosticPackage(withSkin(builtinThemes[0]!, builtinSkins[0]!)),
      makeMatch: (theme, initialization) => { const started = this.acceptance ? performance.now() : 0;
        installTextures(this, theme); const setup = makeMatch(initialization); this.arena = setup.arena;
        if (this.acceptance) this.acceptance.recordCreation(performance.now() - started); return setup.match; },
      freshMatch, mountRun: run => this.mountRun(run),
    });
    this.menu = new ThemeMenu(this, this.flow);
    this.toolbar = new GameToolbar({ pause: () => { this.flow?.pause(); }, resume: () => this.resume(),
      fullscreen: () => this.fullscreen(), switchView: () => this.live?.view.toggleMode(),
      menu: () => { this.flow?.returnToMenu(); }, focusCanvas: () => this.game.canvas.focus({ preventScroll: true }) });
    const canvas = this.game.canvas;
    canvas.tabIndex = 0; canvas.setAttribute('role', 'application'); canvas.setAttribute('aria-describedby', 'instructions'); canvas.focus({ preventScroll: true });
    const background = () => { this.acceptance?.interrupt(); this.flow?.pause('background'); };
    const visibility = () => { if (document.visibilityState === 'hidden') background(); };
    const resize = () => {
      const bounds = document.getElementById('game')!.getBoundingClientRect();
      viewportWidth = bounds.width; viewportHeight = bounds.height;
      if (updateArenaLayout(viewportWidth, viewportHeight, this.flow?.read().phase === 'playing')) {
        this.live?.controls.clear();
        this.scale.getParentBounds(); this.scale.setGameSize(arenaLayout.width, arenaLayout.height);
      }
    };
    const viewportObserver = new ResizeObserver(resize); viewportObserver.observe(document.getElementById('game')!);
    window.addEventListener('blur', background); window.addEventListener('pagehide', background);
    window.addEventListener('resize', resize); document.addEventListener('visibilitychange', visibility);
    let disposed = false;
    const cleanup = () => {
      if (disposed) return; disposed = true;
      this.flow?.dispose(); this.menu?.destroy(); this.flow = undefined; this.menu = undefined;
      this.acceptance?.dispose(); this.acceptance = undefined;
      this.toolbar?.destroy(); this.toolbar = undefined;
      window.removeEventListener('blur', background); window.removeEventListener('pagehide', background);
      window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility);
      viewportObserver.disconnect();
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup); this.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup); this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    this.menu.present(this.flow.read());
    this.acceptance?.focus();
  }

  private mountRun(run: GameRun<HTMLImageElement>): RunPresentation {
    const flow = this.flow!, input = run.input, theme = run.theme;
    this.menu?.hide();
    const canvas = this.game.canvas;
    for (const name of Object.keys(canvas.dataset)) delete canvas.dataset[name];
    const extras = this.add.container();
    let view: MatchView | undefined, controls: CanvasControls | undefined, disposed = false;
    const detach: (() => void)[] = [];
    const dispose = () => {
      if (disposed) return; disposed = true;
      for (const remove of detach.splice(0)) remove();
      controls?.destroy(); view?.destroy(); extras.destroy(true); this.sound.stopAll();
      this.acceptance?.endRun(run.id);
      if (this.live?.id === run.id) this.live = undefined;
    };
    try {
      view = new MatchView(this, run.frame.world, theme, this.arena);
      controls = new CanvasControls(this, input, {
        resume: () => this.resume(), retry: () => { void flow.retry(); },
        newMatch: () => { flow.newMatch(); }, menu: () => { flow.returnToMenu(); },
      });
      controls.present(run.frame, input.readTouch());
      const switchView = () => { view?.toggleMode(); };
      if (theme.diagnostics.length) extras.add(this.add.text(820, 281, '装饰缺失，已省略', { fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif', fontSize: '14px', color: '#ffaf8c' }));
      const keyDown = (event: KeyboardEvent) => {
        if (event.ctrlKey || event.metaKey || event.altKey || this.toolbar?.isOpen() || flow.read().run?.id !== run.id) return;
        const phase = flow.read().phase;
        if (event.code === 'KeyM') { event.preventDefault(); if (!event.repeat) flow.returnToMenu(); }
        else if (event.code === 'KeyN') { event.preventDefault(); if (!event.repeat) flow.newMatch(); }
        else if (event.code === 'KeyR') { event.preventDefault(); if (!event.repeat) void flow.retry(); }
        else if (event.code === 'KeyV') { event.preventDefault(); if (!event.repeat) switchView(); }
        else if (event.code === 'KeyF') { event.preventDefault(); if (!event.repeat) this.fullscreen(); }
        else if (event.code === 'Escape' || event.code === 'KeyP' || (event.code === 'Enter' && phase === 'paused')) {
          event.preventDefault(); if (!event.repeat) { if (phase === 'paused') this.resume(); else flow.pause(); }
        } else if (phase === 'playing' && input.keyDown(event.code, event.repeat)) event.preventDefault();
      };
      const keyUp = (event: KeyboardEvent) => { if (input.keyUp(event.code)) event.preventDefault(); };
      window.addEventListener('keydown', keyDown); detach.push(() => window.removeEventListener('keydown', keyDown));
      window.addEventListener('keyup', keyUp); detach.push(() => window.removeEventListener('keyup', keyUp));
      this.live = { id: run.id, view, controls, listenerCount: () => detach.length, lastResult: '' };
      const world = run.frame.world;
      canvas.dataset.seed = world.initialization.seed; canvas.dataset.map = JSON.stringify(world.initialMap.blockers);
      canvas.dataset.mapWidth = String(world.initialMap.width); canvas.dataset.mapHeight = String(world.initialMap.height);
      canvas.dataset.generationSource = world.initialization.generation?.source ?? 'fixed';
      canvas.dataset.generationAttempts = String(world.initialization.generation?.attempts.length ?? 0);
      canvas.dataset.aiCount = String(world.actors.filter(actor => actor.ai).length);
      canvas.dataset.diagnostics = JSON.stringify(theme.diagnostics);
      const labels = { generated: `种子地图：1 名玩家对 ${world.actors.length - 1} 名正常 AI`, normal: '正常 AI 练习场', training: '实体训练场', items: '道具练习场', escape: '逃生练习场' };
      canvas.setAttribute('aria-label', `${labels[this.arena]}。种子：${world.initialization.seed}。R 重试，N 新开，M 返回菜单。`);
      this.status('本局已开始。摇杆或方向键移动，空格放弹；P 暂停，R 重试，N 新开，M 返回菜单。');
      this.acceptance?.beginRun(run, this.arena);
      return { dispose,
        pause: () => { controls?.clear(); view?.stopAudio(); this.sound.pauseAll(); this.status('对局已暂停。可调音量和粒子，点击继续游戏或按 Enter 手动继续，也可返回菜单。'); },
        resume: () => { controls?.clear(); this.sound.resumeAll(); this.status('已继续。重新操作摇杆或方向键移动。'); },
      };
    } catch (error) { dispose(); throw error; }
  }

  private resume(): void { if (document.visibilityState !== 'hidden' && document.hasFocus()) this.flow?.resume(); }
  private fullscreen(): void {
    if (!document.documentElement.requestFullscreen || !document.exitFullscreen) {
      this.status('当前浏览器无法进入全屏，可收起地址栏后继续横屏游玩。'); return;
    }
    const action = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    void action.catch(() => this.status('当前浏览器无法进入全屏，可收起地址栏后继续横屏游玩。'));
  }
  private status(message: string): void { const status = document.getElementById('game-status'); if (status) status.textContent = message; }
  update(): void {
    if (!this.flow) return;
    const measuredAt = this.acceptance ? performance.now() : 0;
    const measuringPlay = Boolean(this.acceptance && this.flow.read().phase === 'playing' && document.visibilityState === 'visible' && document.hasFocus() && !this.acceptance.isOpen());
    if (document.visibilityState === 'hidden') this.flow.pause('background');
    const state = this.flow.advanceFrame(this.game.loop.rawDelta);
    const logicDoneAt = this.acceptance ? performance.now() : 0;
    updateArenaLayout(viewportWidth, viewportHeight, state.phase === 'playing');
    this.menu?.present(state);
    if (this.appearanceMode !== appearance().mode) {
      this.appearanceMode = appearance().mode; this.cameras.main.setBackgroundColor(hex(appearance().background));
    }
    this.toolbar?.present(state.phase, this.game.canvas.dataset.view ?? 'normal', this.acceptance?.isOpen() ?? false);
    const { run } = state;
    if (run && this.live) {
      const { frame } = run, world = frame.world;
      const animationPaused = frame.phase === 'paused' || document.visibilityState === 'hidden' || !document.hasFocus();
      this.live.view.present(world, frame.alpha, frame.events, Math.min(100, this.game.loop.rawDelta), animationPaused);
      const touch = run.input.readTouch(); this.live.controls.present(frame, touch);
      const canvas = this.game.canvas, player = world.actors.find(actor => actor.id === world.initialization.playerId)!;
      canvas.dataset.tick = String(world.tick); canvas.dataset.playerX = player.position.x.toFixed(3); canvas.dataset.playerY = player.position.y.toFixed(3);
      canvas.dataset.bombs = String(world.bombs.length); canvas.dataset.hazards = String(world.hazards.length); canvas.dataset.items = String(world.items.length);
      canvas.dataset.capacity = String(player.abilities.bombCapacity); canvas.dataset.range = String(player.abilities.blastRange); canvas.dataset.speed = String(player.abilities.speed);
      canvas.dataset.result = world.result?.outcome ?? 'playing'; canvas.dataset.phase = frame.phase;
      canvas.dataset.pauseReason = frame.pauseReason ?? ''; canvas.dataset.joystick = touch.direction ?? '';
      const enemy = world.actors.find(actor => actor.ai);
      canvas.dataset.aiX = enemy?.position.x.toFixed(3) ?? ''; canvas.dataset.aiY = enemy?.position.y.toFixed(3) ?? '';
      canvas.dataset.aiStatus = enemy?.ai?.status ?? ''; canvas.dataset.aiAlive = String(enemy?.alive ?? false);
      canvas.dataset.opponents = JSON.stringify(world.actors.filter(actor => actor.id !== player.id).map(actor => ({ id: actor.id, alive: actor.alive, position: actor.position, abilities: actor.abilities, ai: actor.ai })));
      if (frame.events.some(event => event.type === 'item-collected' && event.actorId === player.id)) this.status(`已拾取道具。容量 ${player.abilities.bombCapacity}，距离 ${player.abilities.blastRange}，速度 ${player.abilities.speed}。`);
      const result = world.result?.outcome ?? '';
      if (result && result !== this.live.lastResult) { this.live.lastResult = result; this.status(`${resultLabels[result]}。R 重试，N 新开，M 返回菜单，也可点击画布按钮。`); }
    }
    // Read-only lifecycle diagnostics, derived from currently owned engine objects/listeners.
    const canvas = this.game.canvas;
    if (canvas.dataset.layoutRevision !== String(arenaLayout.revision)) {
      canvas.dataset.layoutRevision = String(arenaLayout.revision);
      const s = arenaLayout.cssScale;
      const circle = (shape: { x: number; y: number; radius: number }) => ({ x: shape.x * s, y: shape.y * s, radius: shape.radius * s });
      canvas.dataset.viewportLayout = JSON.stringify({ width: viewportWidth, height: viewportHeight, compact: arenaLayout.compact,
        joystick: circle(arenaLayout.joystick), bomb: circle(arenaLayout.bomb) });
    }
    canvas.dataset.flowPhase = state.phase; canvas.dataset.runId = String(run?.id ?? '');
    canvas.dataset.runListeners = String(this.live?.listenerCount() ?? 0);
    canvas.dataset.sceneObjects = String(this.children.list.length); canvas.dataset.textures = String(this.textures.getTextureKeys().length);
    canvas.dataset.soundInstances = String(this.sound.getAll('').length);
    if (this.acceptance) {
      const world = run?.frame.world;
      const countObjects = (objects: readonly Phaser.GameObjects.GameObject[]): number => objects.reduce((sum, object) => sum + 1 + (object instanceof Phaser.GameObjects.Container ? countObjects(object.list) : 0), 0);
      this.acceptance.frame(state, { tick: world?.tick ?? 0, active: measuringPlay, intervalMs: this.game.loop.rawDelta,
        logicMs: logicDoneAt - measuredAt, presentationMs: performance.now() - logicDoneAt,
        steps: run?.frame.steps ?? 0, droppedTimeMs: run?.frame.droppedTimeMs ?? 0,
        counters: { particles: Number(canvas.dataset.feedbackParticles ?? 0), sounds: this.sound.getAll('').length,
          textures: this.textures.getTextureKeys().length, objects: countObjects(this.children.list), bombs: world?.bombs.length ?? 0,
          hazardCells: world?.hazards.reduce((sum, hazard) => sum + hazard.cells.length, 0) ?? 0,
          aiSearchStates: Math.max(0, ...world?.actors.map(actor => actor.ai?.searchedStates ?? 0) ?? []) } });
    }
  }
}

const fpsParameter = new URLSearchParams(window.location.search).get('fps');
const requestedFps = Number(fpsParameter);
const renderFps = [30, 60, 120].includes(requestedFps) ? requestedFps : 60;
const initialViewport = document.getElementById('game')!.getBoundingClientRect();
let viewportWidth = initialViewport.width, viewportHeight = initialViewport.height;
updateArenaLayout(viewportWidth, viewportHeight);
const game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', backgroundColor: '#102b2c', width: arenaLayout.width, height: arenaLayout.height,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  fps: { target: renderFps, forceSetTimeOut: fpsParameter !== null, smoothStep: false }, scene: [GameScene],
});
if (import.meta.hot) import.meta.hot.dispose(() => game.destroy(true));
