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

/** One search owns cached movement facts; time-dependent damage is still checked on every edge. */
export function createStepProjector(world: QueryWorld, forecast: DangerForecast) {
  const movement = new Map<string, ReturnType<typeof moveActor>>();
  const maps = new Map<string, { id: number; map: Parameters<typeof moveActor>[3] }>();
  return (actor: ActorState, direction: Direction | null, tick: number, exitBombIds: readonly string[]) => {
    const phase = forecast.changes.findLast(change => change.tick <= tick)!;
    const rules = world.initialization.rules;
    const mapKey = JSON.stringify([phase.tick, exitBombIds]);
    let entry = maps.get(mapKey);
    if (!entry) {
      entry = { id: maps.size, map: { ...world.initialMap, blockers: [...phase.blockers, ...phase.bombs.filter(bomb => !exitBombIds.includes(bomb.id))] } };
      maps.set(mapKey, entry);
    }
    const key = `${entry.id}:${actor.position.x}:${actor.position.y}:${actor.heading}:${actor.abilities.speed}:${direction}`;
    let moved = movement.get(key);
    if (!moved) {
      moved = direction === null ? { position: actor.position, heading: null, path: [actor.position] }
        : moveActor(actor, direction, { ...rules, speed: actor.abilities.speed }, entry.map);
      if (movement.size < 8192) movement.set(key, moved);
    }
    const safe = !forecast.windows.some(interval =>
      (interval.startTick <= tick && interval.endTick > tick && interval.cells.some(cell => pathTouchesCell(moved.path, cell, rules.radius)))
      || (interval.startTick <= tick + 1 && interval.endTick > tick + 1 && interval.cells.some(cell => overlapsCell(moved.position, cell, rules.radius))));
    return { actor: { ...actor, position: moved.position, previousPosition: actor.position, heading: moved.heading }, safe,
      exitBombIds: exitBombIds.filter(id => phase.bombs.some(bomb => bomb.id === id && overlapsCell(moved.position, bomb, rules.radius))) };
  };
}

export function safeToWait(world: QueryWorld, forecast: DangerForecast, actor: ActorState, tick: number): boolean {
  return !forecast.windows.some(interval => interval.endTick > tick
    && interval.cells.some(cell => overlapsCell(actor.position, cell, world.initialization.rules.radius)));
}
