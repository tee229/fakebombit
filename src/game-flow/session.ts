import type { KeyboardInput } from '../input/keyboard.js';
import type { GameplayEvent, Match, WorldState } from '../match/index.js';

export interface GameFrame {
  readonly world: WorldState;
  readonly alpha: number;
  readonly events: readonly GameplayEvent[];
  readonly steps: number;
  readonly droppedTimeMs: number;
}
export interface GameSession { advanceFrame(deltaMs: number): GameFrame }
const maxStepsPerFrame = 5;

export function createGameSession(match: Match, input: KeyboardInput): GameSession {
  let world = match.readWorld();
  const playerId = world.initialization.playerId;
  if (playerId === undefined) throw new Error('A browser game session requires a configured playerId');
  const stepMs = 1000 / world.initialization.rules.tickRate;
  let accumulatedMs = 0;
  return {
    advanceFrame(deltaMs) {
      if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError('Frame delta must be finite and nonnegative');
      if (world.result) return Object.freeze({ world, alpha: 1, events: Object.freeze([]), steps: 0, droppedTimeMs: 0 });
      accumulatedMs += deltaMs;
      const events: GameplayEvent[] = [];
      let steps = 0;
      while (accumulatedMs / stepMs + 1e-9 >= 1 && !world.result && steps < maxStepsPerFrame) {
        events.push(...match.advanceTick([input.consumeIntent(playerId)]));
        world = match.readWorld();
        accumulatedMs = Math.max(0, accumulatedMs - stepMs);
        steps += 1;
      }
      let droppedTimeMs = 0;
      if (world.result) {
        accumulatedMs = 0;
        input.clear();
      } else if (accumulatedMs / stepMs + 1e-9 >= 1) {
        let remainder = accumulatedMs % stepMs;
        if (remainder / stepMs > 1 - 1e-9) remainder = 0;
        droppedTimeMs = accumulatedMs - remainder;
        accumulatedMs = remainder;
      }
      return Object.freeze({ world, alpha: world.result ? 1 : accumulatedMs / stepMs, events: Object.freeze(events), steps, droppedTimeMs });
    },
  };
}
