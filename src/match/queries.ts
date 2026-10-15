import type { ActorState, Direction, WorldState } from './index.js';
import type { DangerForecast } from './forecast.js';
import { moveActor, overlapsCell, pathTouchesCell } from './motion.js';

/** Passage, movement and damage for one candidate step, using the authoritative motion rules. */
export function projectStep(world: WorldState, forecast: DangerForecast, actor: ActorState, direction: Direction | null,
  tick: number, exitBombIds: readonly string[]) {
  const phase = forecast.changes.findLast(change => change.tick <= tick)!;
  const rules = world.initialization.rules;
  const moved = direction === null ? { position: actor.position, heading: null, path: [actor.position] }
    : moveActor(actor, direction, { ...rules, speed: actor.abilities.speed }, { ...world.initialMap,
      blockers: [...phase.blockers, ...phase.bombs.filter(bomb => !exitBombIds.includes(bomb.id))] });
  const safe = !forecast.windows.some(interval =>
    (interval.startTick <= tick && interval.endTick > tick && interval.cells.some(cell => pathTouchesCell(moved.path, cell, rules.radius)))
    || (interval.startTick <= tick + 1 && interval.endTick > tick + 1 && interval.cells.some(cell => overlapsCell(moved.position, cell, rules.radius))));
  return { actor: { ...actor, position: moved.position, previousPosition: actor.position, heading: moved.heading }, safe,
    exitBombIds: exitBombIds.filter(id => phase.bombs.some(bomb => bomb.id === id && overlapsCell(moved.position, bomb, rules.radius))) };
}

export function safeToWait(world: WorldState, forecast: DangerForecast, actor: ActorState, tick: number): boolean {
  return !forecast.windows.some(interval => interval.endTick > tick
    && interval.cells.some(cell => overlapsCell(actor.position, cell, world.initialization.rules.radius)));
}
