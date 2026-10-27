import { createPerformanceRecord, type PerformanceSample } from '../diagnostics/performance-record.js';
import type { GameFlowState, GameRun } from '../game-flow/index.js';
import { readFeedbackSettings } from './feedback-settings.js';
import './acceptance.css';
import { arenaLayout } from './layout.js';
import { fullscreenState } from './fullscreen.js';

const checks = [
  ['touch', '双指移动与放弹可同时操作'], ['turn', '转弯、拖出和触摸取消没有卡住或误操作'],
  ['layout', '横屏、缩放和系统手势区不挡操作，危险与通路可辨'], ['battle', '完成正式对局、结果、重试与新开'],
  ['background', '后台至少30秒，返回手动继续，无自走、误放弹或补后台时间'],
  ['visual', '两主题、两皮肤均清楚，道具增益可辨'], ['audio', '音效正常，暂停/切视图/重试不补播历史'],
] as const;
type RunRecord = { id: number; metadata: Record<string, unknown> & { eligibleSetup: boolean }; metrics: ReturnType<typeof createPerformanceRecord>; ended: boolean };

/** Opt-in local acceptance aid. Exports observations; it cannot change gameplay settings or rules. */
export class AcceptancePanel {
  private readonly root = document.createElement('section');
  private readonly openButton = document.createElement('button');
  private readonly abort = new AbortController();
  private readonly runs: RunRecord[] = [];
  private current: RunRecord | undefined;
  private creationMs = 0;
  private readonly errors: string[] = [];
  private readonly captureInput = new URLSearchParams(location.search).get('touchTrace') === '1';
  private readonly inputTrace: Record<string, unknown>[] = [];
  private lastInput = '';
  private lastMoveAt = 0;
  private readonly status: HTMLElement;
  private readonly report: HTMLTextAreaElement;
  constructor(private readonly canvas: HTMLCanvasElement) {
    this.root.className = 'acceptance-panel'; this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true'); this.root.setAttribute('aria-labelledby', 'acceptance-title');
    this.root.innerHTML = `<h1 id="acceptance-title">手机浏览器验收</h1>
      <p>正式地图 17×15 · 1 对 3。每局至少连续游玩60秒，目标60 FPS，平均≥55、P95帧间隔≤33 ms、无超过200 ms的卡顿。暂停和恢复首帧不计入。</p>
      <div class="acceptance-fields">
      <label>手机型号<input id="acceptance-device" value="OPPO Find X8" maxlength="100"></label>
      <label>系统版本<input id="acceptance-os" value="Android 17" maxlength="100"></label>
      <label>本次浏览器<select id="acceptance-browser"><option>Edge</option><option>Chrome</option><option>DuckDuckGo</option><option>Safari</option><option>桌面预检（非真机）</option></select></label>
      <label>浏览器版本（报告另附UA）<input id="acceptance-version" maxlength="100" placeholder="可从浏览器关于页面填写"></label></div>
      <p>返回游戏后选外观并开始；对局中不显示统计遮挡地图。暂停或结果页可再次打开报告。重试保留本次记录，最多保留最近12局。</p>
      <div class="acceptance-actions"><button id="acceptance-close" type="button">返回游戏并记录</button><button id="acceptance-download" type="button">下载报告 JSON</button></div>
      <p id="acceptance-status" role="status"></p>
      <fieldset><legend>在这台设备、本次浏览器上亲自完成后勾选</legend>${checks.map(([id, label]) => `<label><input type="checkbox" name="${id}">${label}</label>`).join('')}</fieldset>
      <label>问题或美术改进记录<textarea id="acceptance-notes" rows="2" maxlength="4000" placeholder="例如：右侧按钮靠近系统手势区；没有问题也可写明"></textarea></label>
      <details><summary>查看当前原始报告</summary><textarea id="acceptance-report" rows="8" readonly aria-label="当前验收报告JSON"></textarea></details>
      <p>统计只保留在当前页面，需下载并发回报告；刷新会清空。性能判定不代替上面的真实操作检查。桌面预检不能代替手机结果。</p>`;
    this.openButton.type = 'button'; this.openButton.textContent = '验收报告'; this.openButton.className = 'acceptance-open'; this.openButton.hidden = true;
    document.body.append(this.root, this.openButton);
    this.status = this.root.querySelector<HTMLElement>('#acceptance-status')!;
    this.report = this.root.querySelector<HTMLTextAreaElement>('#acceptance-report')!;
    const signal = this.abort.signal;
    this.root.addEventListener('keydown', event => event.stopPropagation(), { signal });
    window.addEventListener('keydown', event => {
      const inside = event.target instanceof Node && this.root.contains(event.target);
      if (this.isOpen() && !inside) event.stopImmediatePropagation();
    }, { capture: true, signal });
    this.root.querySelector('#acceptance-close')!.addEventListener('click', () => { this.root.hidden = true; canvas.focus({ preventScroll: true }); }, { signal });
    this.openButton.addEventListener('click', () => { this.root.hidden = false; this.refresh(); this.root.querySelector<HTMLInputElement>('input')!.focus(); }, { signal });
    this.root.querySelector('#acceptance-download')!.addEventListener('click', () => this.download(), { signal });
    this.root.addEventListener('change', () => this.refresh(), { signal });
    window.addEventListener('error', event => { if (this.errors.length < 20) this.errors.push(event.message); }, { signal });
    window.addEventListener('unhandledrejection', event => { if (this.errors.length < 20) this.errors.push(String(event.reason)); }, { signal });
    if (this.captureInput) {
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture']) {
        document.addEventListener(type, event => {
          if (!(event instanceof PointerEvent) || !(event.target instanceof Element)) return;
          const control = event.target.closest('.touch-button');
          if (event.target !== canvas && !control) return;
          if (type === 'pointermove') {
            if (performance.now() - this.lastMoveAt < 100) return;
            this.lastMoveAt = performance.now();
          }
          this.traceInput(type, { pointerId: event.pointerId, pointerType: event.pointerType,
            target: control?.classList.contains('bomb-control') ? 'bomb' : control ? 'joystick' : 'canvas',
            x: event.clientX, y: event.clientY, captured: canvas.hasPointerCapture(event.pointerId) });
        }, { capture: true, signal });
      }
      for (const type of ['resize', 'blur', 'pagehide']) window.addEventListener(type, () => this.traceInput(type), { signal });
      document.addEventListener('visibilitychange', () => this.traceInput('visibilitychange', { visibility: document.visibilityState }), { signal });
    }
    this.refresh();
  }
  recordCreation(durationMs: number): void { this.creationMs = durationMs; }
  beginRun(run: GameRun<HTMLImageElement>, arena: string): void {
    const world = run.frame.world, url = new URL(location.href);
    this.current = { id: run.id, ended: false, metrics: createPerformanceRecord(), metadata: {
      seed: world.initialization.seed, width: world.initialMap.width, height: world.initialMap.height,
      aiCount: world.actors.filter(actor => actor.ai).length, arena, theme: run.theme.id, skin: run.theme.package.skin?.id,
      eligibleSetup: arena === 'generated' && world.initialMap.width === 17 && world.initialMap.height === 15
        && world.actors.filter(actor => actor.ai).length === 3 && !this.captureInput && !['arena', 'ai', 'seconds', 'fps', 'resourceError', 'loadDelay'].some(name => url.searchParams.has(name))
        && world.initialization.rules.matchDurationSeconds === 120,
      creationMs: this.creationMs, initialization: world.initialization, settingsAtStart: readFeedbackSettings(),
    } };
    this.runs.push(this.current); if (this.runs.length > 12) this.runs.shift();
  }
  endRun(id: number): void { if (this.current?.id === id) { this.current.ended = true; this.interrupt(); this.current = undefined; } }
  interrupt(): void {
    this.current?.metrics.sample({ tick: 0, active: false, intervalMs: 0, logicMs: 0, presentationMs: 0, steps: 0, droppedTimeMs: 0,
      counters: { particles: 0, sounds: 0, textures: 0, objects: 0, bombs: 0, hazardCells: 0, aiSearchStates: 0 } });
  }
  isOpen(): boolean { return !this.root.hidden; }
  focus(): void { this.root.querySelector<HTMLInputElement>('input')!.focus(); }
  frame(state: GameFlowState<HTMLImageElement>, sample: PerformanceSample): void {
    if (this.captureInput) {
      const input = `${state.run?.id}:${state.phase}:${this.canvas.dataset.joystick}:${this.canvas.dataset.joystickCenter}`;
      if (input !== this.lastInput) { this.lastInput = input; this.traceInput('input-state', { runId: state.run?.id }); }
    }
    this.current?.metrics.sample(sample);
    if (this.current && (!sample.active || (state.run?.frame.world.tick ?? 0) % 60 === 0)) this.canvas.dataset.acceptanceMetrics = JSON.stringify(this.current.metrics.read());
    this.openButton.hidden = this.isOpen() || !['menu', 'paused', 'result'].includes(state.phase);
    if (!this.openButton.hidden) {
      const bounds = this.canvas.getBoundingClientRect(), menu = state.phase === 'menu';
      this.openButton.style.transform = menu ? 'none' : '';
      this.openButton.style.left = `${menu ? bounds.left + 12 : bounds.left + bounds.width * arenaLayout.report.x / arenaLayout.width}px`;
      this.openButton.style.top = `${menu ? bounds.bottom - this.openButton.offsetHeight - 12 : bounds.top + bounds.height * arenaLayout.report.y / arenaLayout.height}px`;
    }
  }
  private value(selector: string): string { return this.root.querySelector<HTMLInputElement>(selector)!.value.trim(); }
  private traceInput(type: string, fields: Record<string, unknown> = {}): void {
    this.inputTrace.push({ atMs: Math.round(performance.now()), type, ...fields, phase: this.canvas.dataset.phase,
      direction: this.canvas.dataset.joystick, center: this.canvas.dataset.joystickCenter,
      mode: this.canvas.dataset.controlMode, layoutRevision: this.canvas.dataset.layoutRevision,
      viewport: [innerWidth, innerHeight] });
    if (this.inputTrace.length > 200) this.inputTrace.shift();
  }
  private snapshot() {
    const resources = performance.getEntriesByType('resource').flatMap(entry => {
      if (!(entry instanceof PerformanceResourceTiming)) return [];
      const url = new URL(entry.name); if (url.origin !== location.origin) return [];
      return [{ path: url.pathname, durationMs: entry.duration, transferBytes: entry.transferSize, decodedBytes: entry.decodedBodySize }];
    });
    return { format: 'fakebombit-browser-acceptance-v1', acceptanceStatus: 'awaiting-human-review', recordedAt: new Date().toISOString(),
      device: { model: this.value('#acceptance-device'), os: this.value('#acceptance-os'), browser: this.value('#acceptance-browser'),
        version: this.value('#acceptance-version'), userAgent: navigator.userAgent, screen: [screen.width, screen.height],
        viewport: [innerWidth, innerHeight], pixelRatio: devicePixelRatio, maxTouchPoints: navigator.maxTouchPoints },
      presentationLayout: JSON.parse(this.canvas.dataset.viewportLayout ?? 'null'),
      fullscreen: fullscreenState(),
      criteria: { continuousMs: 60000, segmentSelection: 'longest-continuous', minimumAverageFps: 55, maximumP95FrameMs: 33, maximumFrameMs: 200, p95ResolutionMs: .1 },
      manualChecks: Object.fromEntries(checks.map(([id]) => [id, this.root.querySelector<HTMLInputElement>(`input[name="${id}"]`)!.checked])),
      notes: this.value('#acceptance-notes'), errors: [...this.errors], resources,
      inputTrace: this.captureInput ? { limit: 200, moveThrottleMs: 100, events: [...this.inputTrace] } : undefined,
      runs: this.runs.map(run => ({ id: run.id, ended: run.ended, ...run.metadata, performance: run.metrics.read() })),
      limitation: 'Update-loop intervals and CPU durations; not GPU or input-to-photon timings. Performance pass alone is not device acceptance.',
    };
  }
  private refresh(): void {
    const run = this.runs.at(-1), latest = run?.metrics.read();
    const qualification = latest?.qualification;
    this.status.textContent = latest && qualification ? `${run?.metadata.eligibleSetup ? '最近一局' : '非正式配置，仅诊断'}：最长连续片段 ${(qualification.foregroundMs / 1000).toFixed(1)}秒；平均 ${qualification.averageFps?.toFixed(1) ?? '—'} FPS；P95 ${qualification.p95FrameMs?.toFixed(1) ?? '—'} ms；${({ insufficient: '时长不足，继续测量', pass: '性能样本达标，仍需真机检查', fail: '存在性能问题，请发回报告' })[latest.verdict]}` : '尚无对局记录。先返回游戏，选择外观并开始正式对局。';
    if (this.captureInput) this.status.textContent = `触控诊断已启用：复现后立即暂停并下载报告；此模式不作性能验收。${this.status.textContent}`;
    this.report.value = JSON.stringify(this.snapshot(), null, 2);
    this.root.querySelector<HTMLButtonElement>('#acceptance-download')!.disabled = this.runs.length === 0;
  }
  private download(): void {
    this.refresh();
    const link = document.createElement('a'), url = URL.createObjectURL(new Blob([this.report.value], { type: 'application/json' }));
    link.href = url; link.download = 'fakebombit-device-acceptance.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  dispose(): void { this.abort.abort(); this.root.remove(); this.openButton.remove(); }
}
