import { createGameFlow, type GameFlow, type GameRun } from '../game-flow/index.js';
import { createMatch } from '../match/index.js';
import { builtinThemes } from '../resources/builtin-themes.js';
import { builtinSkins } from '../resources/builtin-skins.js';
import { withSkin } from '../resources/index.js';
import { createPerformanceRecord } from '../diagnostics/performance-record.js';
import type { FeedbackEffect } from '../presentation/feedback.js';
import { Images } from './assets.js';
import { NativeAudio } from './audio.js';
import { MatchBoard } from './board.js';
import { Preferences, type Settings } from './preferences.js';
import { contains, inCircle, layoutFor, readViewport, type Circle } from './layout.js';
import { NativeUI, type Widget } from './ui.js';

type TouchEvent = WechatMinigame.OnTouchStartListenerResult;
type Gesture = { kind: 'joystick' | 'bomb' | 'button' | 'slider' | 'scroll'; startX: number; startY: number; x: number; y: number; widget: string; dragged: boolean };
type Metrics = ReturnType<typeof createPerformanceRecord>;
function frozenCopy<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(item => frozenCopy(item))) as T;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, frozenCopy(item)]))) as T;
}

/** WeChat composition root. It supplies intents and reads immutable frames, never implements rules. */
class WechatGame {
  private readonly images;
  private readonly preferences;
  private readonly audio;
  private readonly flow: GameFlow<WechatMinigame.Image>;
  private readonly ui: NativeUI;
  private readonly canvas;
  private readonly context: CanvasRenderingContext2D;
  private viewport;
  private layout;
  private live: { id: number; board: MatchBoard } | null = null;
  private readonly gestures = new Map<number, Gesture>();
  private readonly keys = new Set<string>();
  private floatingCenter: Circle | null = null;
  private seedSequence = 0;
  private seed = '';
  private visible = true;
  private audioInterrupted = false;
  private awaitingInteraction = false;
  private settingsOpen = false;
  private entities = false;
  private booting = true;
  private bootError = '';
  private lastTime: number | null = null;
  private lastPhase = '';
  private lastVolume = -1;
  private frameHandle: number | null = null;
  private readonly errors: string[] = [];
  private readonly clock: () => number;
  private readonly measuring: boolean;
  private notice = '';
  private noticeUntil = 0;
  private readonly records: { id: number; seed: string; initialization: GameRun<WechatMinigame.Image>['frame']['world']['initialization']; theme: string; skin: string; settings: Readonly<Settings>; metrics: Metrics }[] = [];
  constructor(private readonly host: WechatMinigame.Wx) {
    this.viewport = readViewport(host);
    this.preferences = new Preferences(host); this.layout = layoutFor(this.viewport, this.preferences.read().controls);
    this.images = new Images(host); this.audio = new NativeAudio(host);
    const timer = host.getPerformance(); this.clock = () => timer.now();
    const query = host.getLaunchOptionsSync().query ?? {};
    this.measuring = query.acceptance === '1';
    this.seed = typeof query.seed === 'string' && query.seed.length <= 200 ? query.seed : this.freshSeed();
    this.canvas = host.createCanvas();
    this.context = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    if (!this.context) throw new Error('小游戏无法创建2D画布');
    this.flow = createGameFlow({
      resources: this.images.preparation(), selection: withSkin(builtinThemes[0], builtinSkins[0]),
      makeMatch: (_theme, initialization) => createMatch(initialization ?? { seed: this.seed, generator: {}, playerId: 'player',
        actors: ['player', 'target-1', 'target-2', 'target-3'].map(id => ({ id, type: 'actor' as const, spawnId: id, ...(id === 'player' ? {} : { ai: { mode: 'normal' as const } }) })),
      }),
      freshMatch: () => { this.seed = this.freshSeed(); }, mountRun: run => this.mount(run),
    });
    this.ui = new NativeUI(this.images, {
      start: () => { this.clearInput(); void this.flow.start(); }, retry: () => { this.closeSettings(); this.clearInput(); void this.flow.retry(); },
      newMatch: () => { this.closeSettings(); this.clearInput(); this.flow.newMatch(); }, menu: () => { this.closeSettings(); this.clearInput(); this.flow.returnToMenu(); },
      resume: () => this.resume(),
      selectTheme: index => { this.flow.select(withSkin(builtinThemes[index]!, this.flow.read().selection.skin ?? builtinSkins[0])); },
      selectSkin: index => { this.flow.select(withSkin(builtinThemes.find(t => t.id === this.flow.read().selection.id) ?? builtinThemes[0], builtinSkins[index]!)); },
      settings: () => { this.pause(); this.settingsOpen = true; }, closeSettings: () => this.closeSettings(),
      appearance: () => this.update({ appearance: this.preferences.read().appearance === 'dark' ? 'light' : 'dark' }),
      entities: () => { this.entities = !this.entities; this.audio.stopEffects(); },
      updateSettings: (patch, controls) => this.update(patch, controls), resetControls: () => { this.preferences.resetControls(); this.relayout(); },
      report: () => this.report(), retryBoot: () => { void this.boot(); },
    });
    this.resize();
    host.onTouchStart(this.touchStart); host.onTouchMove(this.touchMove); host.onTouchEnd(this.touchEnd); host.onTouchCancel(this.touchCancel);
    host.onHide(this.hide); host.onShow(this.show); host.onWindowResize(this.resize);
    host.onAudioInterruptionBegin(this.interrupted); host.onAudioInterruptionEnd(this.interruptionEnded);
    host.onKeyDown(this.keyDown); host.onKeyUp(this.keyUp);
    host.onError(message => this.recordError(String(message)));
    host.onUnhandledRejection(event => this.recordError(String(event.reason)));
    try { host.setPreferredFramesPerSecond(60); } catch { /* The host may choose its own supported render rate. */ }
    GameGlobal.fakebombit = Object.freeze({ read: () => this.snapshot() });
    void this.boot(); this.schedule();
  }
  private freshSeed(): string { return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0x100000000).toString(36)}-${++this.seedSequence}`; }
  private async boot(): Promise<void> {
    this.booting = true; this.bootError = '';
    try { await this.images.prepareMenu(); this.booting = false; console.info('[FBI_WECHAT_READY]', JSON.stringify({ format: 'wechat-v1', sdk: this.host.getAppBaseInfo().SDKVersion, app: 'Fake Bomb It', images: this.images.count })); }
    catch (error) { this.booting = false; this.bootError = error instanceof Error ? error.message : String(error); this.recordError(this.bootError); }
  }
  private mount(run: GameRun<WechatMinigame.Image>) {
    this.clearInput(); this.entities = false;
    this.lastTime = null;
    this.audio.begin(run.theme.id);
    const board = new MatchBoard(this.host, run.frame.world, run.theme);
    this.live = { id: run.id, board };
    if (this.measuring) {
      this.records.push({ id: run.id, seed: run.frame.world.initialization.seed, initialization: run.frame.world.initialization,
        theme: run.theme.id, skin: run.theme.package.skin?.id ?? '', settings: this.preferences.read(), metrics: createPerformanceRecord() });
      if (this.records.length > 12) this.records.shift();
    }
    return { pause: () => this.audio.stopEffects(), resume: () => { this.lastTime = null; },
      dispose: () => { board.dispose(); this.audio.endRun(); this.clearInput(); this.live = null; },
    };
  }
  private recordError(message: string): void { if (this.errors.length < 24) this.errors.push(message); console.error('[FBI_WECHAT_ERROR]', message); }
  private relayout(): void { this.releaseGameplay(); this.layout = layoutFor(this.viewport, this.preferences.read().controls); }
  private resize = (): void => {
    if (this.flow?.read().phase === 'playing') this.pause();
    this.clearInput(); this.viewport = readViewport(this.host); this.layout = layoutFor(this.viewport, this.preferences.read().controls);
    this.canvas.width = Math.round(this.viewport.width * this.viewport.pixelRatio); this.canvas.height = Math.round(this.viewport.height * this.viewport.pixelRatio);
    this.lastTime = null;
  };
  private schedule(): void { if (this.visible && this.frameHandle === null) this.frameHandle = requestAnimationFrame(this.frame); }
  private frame = (timestamp: number): void => {
    this.frameHandle = null;
    if (!this.visible) return;
    const delta = this.lastTime === null ? 0 : Math.max(0, timestamp - this.lastTime); this.lastTime = timestamp;
    const measuring = this.measuring && this.flow.read().phase === 'playing' && !this.settingsOpen;
    const began = this.measuring ? this.clock() : 0;
    const state = this.flow.advanceFrame(delta), logicDone = this.measuring ? this.clock() : 0;
    const settings = this.preferences.read();
    this.context.setTransform(this.viewport.pixelRatio, 0, 0, this.viewport.pixelRatio, 0, 0);
    this.ui.drawBackground(this.context, this.viewport, settings.appearance, !state.run);
    let particles = 0;
    let effects: readonly FeedbackEffect[] = [];
    if (this.live && state.run) {
      const paused = state.phase === 'paused';
      const feedback = this.live.board.present(state.run.frame, Math.min(100, delta), paused, this.entities, settings);
      if (paused || this.entities || this.lastVolume !== settings.volume) this.audio.stopEffects();
      this.lastVolume = settings.volume;
      this.audio.play(feedback.sounds);
      particles = feedback.effects.reduce((sum, effect) => sum + effect.particles, 0);
      effects = feedback.effects;
      this.live.board.draw(this.context, state.run.frame, this.layout, settings, this.entities);
    }
    if (this.notice && this.clock() >= this.noticeUntil) this.notice = '';
    this.ui.render(this.context, { state, settings, layout: this.layout, viewport: this.viewport,
      settingsOpen: this.settingsOpen, booting: this.booting, bootError: this.bootError, notice: this.notice, entities: this.entities, effects,
      reportAvailable: this.measuring, touch: state.run?.input.readTouch() ?? { joystickActive: false, knob: { x: 0, y: 0 }, bombHeld: false }, floatingCenter: this.floatingCenter,
    });
    this.audio.sync(this.visible && !this.audioInterrupted && !this.awaitingInteraction && state.phase !== 'paused' && (!this.settingsOpen || !state.run), settings.musicVolume);
    if (this.measuring && state.run) {
      const record = this.records.find(record => record.id === state.run!.id);
      const world = state.run.frame.world, audio = this.audio.read();
      record?.metrics.sample({ tick: world.tick, active: measuring && state.phase === 'playing', intervalMs: delta,
        logicMs: logicDone - began, presentationMs: this.clock() - logicDone, steps: state.run.frame.steps, droppedTimeMs: state.run.frame.droppedTimeMs,
        counters: { particles, sounds: audio.playingEffects, textures: this.images.count, objects: world.actors.length + world.blockers.length + world.bombs.length + world.items.length,
          bombs: world.bombs.length, hazardCells: world.hazards.reduce((sum, h) => sum + h.cells.length, 0), aiSearchStates: Math.max(0, ...world.actors.map(a => a.ai?.searchedStates ?? 0)) },
      });
    }
    const phase = `${state.phase}:${state.run?.id ?? 0}:${this.settingsOpen}`;
    if (phase !== this.lastPhase) { this.lastPhase = phase; console.info('[FBI_WECHAT_PHASE]', JSON.stringify({ phase: state.phase, runId: state.run?.id ?? null, tick: state.run?.frame.world.tick ?? 0, settingsOpen: this.settingsOpen, seed: state.run?.frame.world.initialization.seed ?? this.seed })); }
    this.schedule();
  };
  private releaseGameplay(): void {
    this.flow?.read().run?.input.clear(); this.floatingCenter = null;
    for (const [id, gesture] of this.gestures) if (gesture.kind === 'joystick' || gesture.kind === 'bomb') this.gestures.delete(id);
  }
  private clearInput(): void { this.releaseGameplay(); this.gestures.clear(); this.keys.clear(); if (this.ui) this.ui.pressed = ''; }
  private pause(): void { this.clearInput(); this.flow.pause(); this.audio.stopEffects(); }
  private resume(): void { if (this.visible && !this.settingsOpen) { this.clearInput(); this.flow.resume(); this.lastTime = null; } }
  private closeSettings(): void { this.settingsOpen = false; this.clearInput(); }
  private update(patch: Partial<Omit<Settings, 'controls'>>, controls?: Partial<Settings['controls']>): void {
    this.preferences.update(patch, controls); if (controls) this.relayout();
    if (patch.volume !== undefined) this.audio.stopEffects();
  }
  private interruptMetrics(): void {
    this.records.at(-1)?.metrics.sample({ tick: this.flow.read().run?.frame.world.tick ?? 0, active: false, intervalMs: 0, logicMs: 0, presentationMs: 0, steps: 0, droppedTimeMs: 0,
      counters: { particles: 0, sounds: 0, textures: this.images.count, objects: 0, bombs: 0, hazardCells: 0, aiSearchStates: 0 } });
  }
  private hide = (): void => {
    this.visible = false; this.awaitingInteraction = true; this.clearInput(); this.flow.pause('background'); this.audio.stopEffects(); this.audio.sync(false, this.preferences.read().musicVolume); this.interruptMetrics(); this.lastTime = null;
    if (this.frameHandle !== null) { cancelAnimationFrame(this.frameHandle); this.frameHandle = null; }
  };
  private show = (): void => { this.visible = true; this.clearInput(); this.lastTime = null; this.schedule(); };
  private interrupted = (): void => { this.audioInterrupted = true; this.awaitingInteraction = true; this.clearInput(); this.flow.pause('background'); this.audio.stopEffects(); this.audio.sync(false, this.preferences.read().musicVolume); this.interruptMetrics(); this.lastTime = null; };
  private interruptionEnded = (): void => { this.audioInterrupted = false; /* A new user action is still required. */ };
  private touchStart = (event: TouchEvent): void => {
    if (!this.visible) return;
    if (!this.audioInterrupted) this.awaitingInteraction = false;
    this.audio.unlock();
    for (const touch of event.changedTouches) {
      const { identifier: id, clientX: x, clientY: y } = touch;
      if (this.gestures.has(id)) continue;
      const widget = this.ui.hit(x, y);
      if (widget) {
        this.ui.pressed = widget.id;
        this.gestures.set(id, { kind: widget.slide ? 'slider' : 'button', startX: x, startY: y, x, y, widget: widget.id, dragged: false });
      } else if (this.settingsOpen) {
        if (this.ui.scrollRegion && contains(this.ui.scrollRegion, x, y)) this.gestures.set(id, { kind: 'scroll', startX: x, startY: y, x, y, widget: '', dragged: false });
      } else if (this.flow.read().phase === 'playing' && this.flow.read().run) {
        const input = this.flow.read().run!.input, l = this.layout;
        if (inCircle(l.bomb, x, y) && input.pointerDown(id, 'bomb')) this.gestures.set(id, { kind: 'bomb', startX: x, startY: y, x, y, widget: '', dragged: false });
        else {
          const floating = this.preferences.read().controls.mode === 'floating';
          if ((floating ? contains(l.floating, x, y) : inCircle(l.joystick, x, y))) {
            const origin = floating ? { x, y } : l.joystick;
            if (input.pointerDown(id, 'joystick', { x: (x - origin.x) / l.joystick.radius, y: (y - origin.y) / l.joystick.radius })) {
              const radius = l.joystick.radius;
              if (floating) this.floatingCenter = { x: Math.max(l.floating.x + radius, Math.min(l.floating.x + l.floating.width - radius, x)), y: Math.max(l.floating.y + radius, Math.min(l.floating.y + l.floating.height - radius, y)), radius };
              this.gestures.set(id, { kind: 'joystick', startX: origin.x, startY: origin.y, x, y, widget: '', dragged: false });
            }
          }
        }
      }
    }
  };
  private slide(widget: Widget, x: number): void { if (widget.slide && widget.track) widget.slide(Math.max(0, Math.min(1, (x - widget.track.x) / widget.track.width))); }
  private touchMove = (event: TouchEvent): void => {
    for (const touch of event.changedTouches) {
      const g = this.gestures.get(touch.identifier); if (!g) continue;
      const x = touch.clientX, y = touch.clientY;
      if (g.kind === 'button' && this.settingsOpen && this.ui.scrollRegion && contains(this.ui.scrollRegion, g.startX, g.startY)
        && Math.abs(y - g.startY) > 8 && Math.abs(y - g.startY) > Math.abs(x - g.startX)) { g.kind = 'scroll'; this.ui.pressed = ''; }
      if (g.kind === 'joystick') this.flow.read().run?.input.pointerMove(touch.identifier, { x: (x - g.startX) / this.layout.joystick.radius, y: (y - g.startY) / this.layout.joystick.radius });
      else if (g.kind === 'slider') {
        const dx = Math.abs(x - g.startX), dy = Math.abs(y - g.startY);
        if (!g.dragged && dy > 8 && dy > dx) g.kind = 'scroll';
        else if (g.dragged || dx > 6) { g.dragged = true; const widget = this.ui.widgets.find(w => w.id === g.widget); if (widget && !widget.disabled) this.slide(widget, x); }
      }
      if (g.kind === 'scroll') this.ui.scroll = Math.max(0, Math.min(this.ui.scrollMax, this.ui.scroll + g.y - y));
      if (g.kind === 'button' && Math.hypot(x - g.startX, y - g.startY) > 12) { g.dragged = true; this.ui.pressed = ''; }
      g.x = x; g.y = y;
    }
  };
  private touchEnd = (event: TouchEvent): void => {
    for (const touch of event.changedTouches) {
      const g = this.gestures.get(touch.identifier); if (!g) continue;
      this.gestures.delete(touch.identifier); this.ui.pressed = '';
      if (g.kind === 'joystick' || g.kind === 'bomb') {
        this.flow.read().run?.input.pointerUp(touch.identifier); if (g.kind === 'joystick') this.floatingCenter = null;
      } else if (g.kind === 'button' && !g.dragged) { const widget = this.ui.hit(touch.clientX, touch.clientY); if (widget?.id === g.widget) widget.action?.(); }
      else if (g.kind === 'slider' && !g.dragged) { const widget = this.ui.hit(touch.clientX, touch.clientY); if (widget?.id === g.widget) this.slide(widget, touch.clientX); }
    }
  };
  private touchCancel = (): void => { this.clearInput(); };
  private keyDown = (event: WechatMinigame.OnKeyDownListenerResult): void => {
    if (!this.audioInterrupted) this.awaitingInteraction = false;
    this.audio.unlock(); const repeated = this.keys.has(event.code); this.keys.add(event.code);
    if (repeated) return;
    if (this.settingsOpen) { if (event.code === 'Escape') this.closeSettings(); return; }
    const phase = this.flow.read().phase;
    if (phase === 'menu') {
      if (event.code === 'Enter') void this.flow.start();
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') this.flow.select(withSkin(builtinThemes.find(t => t.id !== this.flow.read().selection.id)!, this.flow.read().selection.skin ?? builtinSkins[0]));
      if (event.code === 'ArrowUp' || event.code === 'ArrowDown') this.flow.select(withSkin(builtinThemes.find(t => t.id === this.flow.read().selection.id)!, builtinSkins.find(s => s.id !== this.flow.read().selection.skin?.id)!));
    } else if (phase === 'preparing' && event.code === 'Escape') this.flow.returnToMenu();
    else if (phase === 'failed' && event.code === 'Enter') void this.flow.retry();
    else if (this.flow.read().run) {
      if (event.code === 'KeyP' || event.code === 'Escape') { if (phase === 'playing') this.pause(); else if (phase === 'paused') this.resume(); }
      else if (event.code === 'Enter' && phase === 'paused') this.resume();
      else if (event.code === 'KeyR') { this.clearInput(); void this.flow.retry(); }
      else if (event.code === 'KeyN') { this.clearInput(); this.flow.newMatch(); }
      else if (event.code === 'KeyM') { this.clearInput(); this.flow.returnToMenu(); }
      else if (event.code === 'KeyV') { this.entities = !this.entities; this.audio.stopEffects(); }
      else if (phase === 'playing') this.flow.read().run!.input.keyDown(event.code, repeated);
    }
  };
  private keyUp = (event: WechatMinigame.OnKeyDownListenerResult): void => { this.keys.delete(event.code); this.flow.read().run?.input.keyUp(event.code); };
  private report(): void {
    this.pause();
    const report = { format: 'fakebombit-wechat-acceptance-v1', acceptanceStatus: 'awaiting-human-review', recordedAt: new Date().toISOString(),
      device: { ...this.host.getDeviceInfo(), ...this.host.getWindowInfo(), SDKVersion: this.host.getAppBaseInfo().SDKVersion },
      runs: this.records.map(record => ({ id: record.id, seed: record.seed, initialization: record.initialization, theme: record.theme, skin: record.skin, settings: record.settings, performance: record.metrics.read() })), audio: this.audio.read(), errors: this.errors,
    };
    this.host.setClipboardData({ data: JSON.stringify(report, null, 2), success: () => { this.notice = '验收报告已复制，可粘贴发送'; this.noticeUntil = this.clock() + 3500; }, fail: () => { this.notice = '复制失败，请重新操作'; this.noticeUntil = this.clock() + 3500; } });
  }
  snapshot() {
    const state = this.flow.read(), world = state.run?.frame.world;
    return Object.freeze({ format: 'fakebombit-wechat-runtime-v1', phase: state.phase, runId: state.run?.id ?? null, theme: state.selection.id, skin: state.selection.skin?.id ?? null,
      tick: world?.tick ?? 0, seed: world?.initialization.seed ?? this.seed, world: world ?? null, settings: this.preferences.read(), settingsOpen: this.settingsOpen, visible: this.visible,
      entities: this.entities, booting: this.booting, bootError: this.bootError, pauseReason: state.run?.frame.pauseReason ?? null,
      touch: state.run?.input.readTouch() ?? null, floatingCenter: this.floatingCenter ? Object.freeze({ ...this.floatingCenter }) : null,
      viewport: frozenCopy(this.viewport), layout: frozenCopy(this.layout), audio: this.audio.read(), images: this.images.count,
      widgets: Object.freeze(this.ui.widgets.map(w => Object.freeze({ id: w.id, rect: Object.freeze({ ...w.rect }), disabled: w.disabled }))),
      performance: this.measuring ? this.records.at(-1)?.metrics.read() ?? null : null, errors: Object.freeze([...this.errors]),
    });
  }
}

new WechatGame(wx);
