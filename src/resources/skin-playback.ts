import type { WorldState } from '../match/index.js';
import { resolveSkinAnimation, type ReadyTheme, type SkinAction, type SkinDirection } from './index.js';

interface Pose { action: SkinAction; direction: SkinDirection; since: number }

/** A match-owned presentation clock. It survives board reconstruction and never advances gameplay. */
export function createSkinPlayback<T>(theme: ReadyTheme<T>) {
  const poses = new Map<string, Pose>();
  let timeMs = 0, lastTick = -1;
  let terminalTimeMs: number | undefined;
  return {
    present(world: WorldState, deltaMs: number, paused = false) {
      if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError('Presentation delta must be finite and nonnegative');
      if (!paused) timeMs += deltaMs;
      if (world.result && terminalTimeMs === undefined) terminalTimeMs = timeMs;
      const result = [];
      for (const actor of world.actors) {
        const previous = poses.get(actor.id);
        const moving = actor.position.x !== actor.previousPosition.x || actor.position.y !== actor.previousPosition.y;
        const action: SkinAction = !actor.alive ? 'eliminated' : moving ? 'move' : 'idle';
        const direction = actor.alive && moving && actor.heading ? actor.heading : previous?.direction ?? 'down';
        let pose = previous;
        if (!pose || (world.tick !== lastTick && (action !== pose.action || direction !== pose.direction))) {
          pose = { action, direction, since: !previous && !actor.alive ? -Infinity : timeMs };
          poses.set(actor.id, pose);
        }
        const ageSeconds = ((actor.alive ? terminalTimeMs ?? timeMs : timeMs) - pose.since) / 1000;
        if (!Number.isFinite(ageSeconds)) continue;
        const visual = resolveSkinAnimation(theme, pose.action, pose.direction, ageSeconds);
        if (visual && !(pose.action === 'eliminated' && visual.finished)) result.push({ id: actor.id, action: pose.action, direction: pose.direction, ageSeconds, visual });
      }
      lastTick = world.tick;
      return result;
    },
  };
}
export type SkinPlayback<T> = ReturnType<typeof createSkinPlayback<T>>;
export type ActorPose<T> = ReturnType<SkinPlayback<T>['present']>[number];
