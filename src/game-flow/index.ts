import { createPlayerInput, type PlayerInput } from '../input/player.js';
import type { InitializationRecord, Match } from '../match/index.js';
import { createResourcePreparation, type ReadyTheme, type ResourceError, type ThemePackage } from '../resources/index.js';
import { createGameSession, type GameFrame, type GameSession, type PauseReason } from './session.js';

export interface GameRun<T> {
  readonly id: number; readonly theme: ReadyTheme<T>; readonly input: PlayerInput; readonly frame: GameFrame;
}
export interface RunPresentation { dispose(): void; pause(): void; resume(): void }
export interface GameFlowState<T> {
  readonly phase: 'menu' | 'preparing' | 'playing' | 'paused' | 'result' | 'failed' | 'disposed';
  readonly selection: ThemePackage; readonly run: GameRun<T> | null;
  readonly preparationId: number | null; readonly error: ResourceError | null;
}
interface FlowOptions<T> {
  readonly selection: ThemePackage;
  readonly resources: ReturnType<typeof createResourcePreparation<T>>;
  readonly makeMatch: (theme: ReadyTheme<T>, initialization?: InitializationRecord) => Match;
  readonly freshMatch: () => void;
  readonly mountRun: (run: GameRun<T>) => RunPresentation;
}

/** Owns business transitions; an engine mounts and releases presentation, never decides the result. */
export function createGameFlow<T>(options: FlowOptions<T>) {
  let phase: GameFlowState<T>['phase'] = 'menu';
  let selection = options.selection;
  let active: { run: GameRun<T>; session: GameSession; presentation: RunPresentation } | null = null;
  let error: ResourceError | null = null, preparationId: number | null = null;
  let generation = 0, runSequence = 0;
  let retryInitialization: InitializationRecord | undefined;
  let cancel: (() => void) | undefined;
  let pauseOnReady = false;
  const read = (): GameFlowState<T> => Object.freeze({ phase, selection, run: active?.run ?? null, preparationId, error });
  const leave = () => {
    generation++; cancel?.(); cancel = undefined; preparationId = null; error = null;
    if (active) { const previous = active; active = null; previous.run.input.clear(); previous.presentation.dispose(); }
  };
  const begin = (initialization?: InitializationRecord) => {
    if (phase === 'disposed') return Promise.resolve(read());
    leave(); phase = 'preparing'; pauseOnReady = false; retryInitialization = initialization; const identity = generation;
    const task = options.resources.start(selection, theme => {
      const input = createPlayerInput();
      const session = createGameSession(options.makeMatch(theme, initialization), input);
      if (pauseOnReady) session.pause('background');
      const run = Object.freeze({ id: ++runSequence, theme, input, frame: session.advanceFrame(0) });
      const presentation = options.mountRun(run);
      active = { run, session, presentation }; retryInitialization = run.frame.world.initialization;
      phase = run.frame.phase === 'ended' ? 'result' : run.frame.phase;
      if (pauseOnReady) presentation.pause();
      return run.id;
    });
    cancel = task.cancel; preparationId = task.id;
    return task.completion.then(result => {
      if (identity !== generation) return read();
      cancel = undefined; preparationId = null;
      if (result.status === 'failed') { phase = 'failed'; error = result.error; }
      return read();
    });
  };
  return {
    read,
    select(source: ThemePackage) {
      if (phase !== 'menu' && phase !== 'failed') return false;
      selection = source; phase = 'menu'; error = null; return true;
    },
    start() { return begin(); },
    retry() { return begin(retryInitialization); },
    pause(reason: PauseReason = 'manual') {
      if (phase === 'preparing' && reason === 'background') { pauseOnReady = true; return true; }
      if (!active || phase === 'result') return false;
      const changed = active.session.pause(reason);
      active.run = Object.freeze({ ...active.run, frame: active.session.advanceFrame(0) });
      phase = 'paused'; if (changed) active.presentation.pause(); return changed;
    },
    resume() {
      if (!active || !active.session.resume()) return false;
      active.run = Object.freeze({ ...active.run, frame: Object.freeze({ ...active.run.frame, phase: 'playing', pauseReason: null }) });
      phase = 'playing'; active.presentation.resume(); return true;
    },
    advanceFrame(deltaMs: number) {
      if (active) {
        const frame = active.session.advanceFrame(deltaMs);
        active.run = Object.freeze({ ...active.run, frame });
        phase = frame.phase === 'ended' ? 'result' : frame.phase;
      }
      return read();
    },
    returnToMenu() { if (phase !== 'disposed') { leave(); retryInitialization = undefined; phase = 'menu'; } return read(); },
    newMatch() { if (phase !== 'disposed') { leave(); retryInitialization = undefined; options.freshMatch(); phase = 'menu'; } return read(); },
    dispose() { if (phase !== 'disposed') { leave(); phase = 'disposed'; } return read(); },
  };
}
export type GameFlow<T> = ReturnType<typeof createGameFlow<T>>;
