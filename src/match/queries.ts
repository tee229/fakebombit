import type { ActorState, Direction, InitializationRecord, Position, SemanticMap, WorldState } from './index.js';
import type { DangerForecast } from './forecast.js';
import { moveActor, moveAxis, overlapsCell, pathTouchesCell, vectors } from './motion.js';

export type QueryWorld = Pick<WorldState, 'tick' | 'initialMap' | 'blockers' | 'bombs' | 'hazards' | 'result'>
  & { readonly initialization: Pick<InitializationRecord, 'rules'> };

export function adjacentPassage(map: SemanticMap, cell: Position, direction: Direction, radius: number): Position | null {
  const vector = vectors[direction];
  const target = { x: cell.x + vector.x, y: cell.y + vector.y };
  const moved = moveAxis({ x: cell.x + 0.5, y: cell.y + 0.5 }, direction, 1, map, radius);
  return moved.x === target.x + 0.5 && moved.y === target.y + 0.5 ? target : null;
}

/** Passage, movement and damage for one candidate step, using the authoritative motion rules. */
export function projectStep(world: QueryWorld, forecast: DangerForecast, actor: ActorState, direction: Direction | null,
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

export function safeToWait(world: QueryWorld, forecast: DangerForecast, actor: ActorState, tick: number): boolean {
  return !forecast.windows.some(interval => interval.endTick > tick
    && interval.cells.some(cell => overlapsCell(actor.position, cell, world.initialization.rules.radius)));
}
