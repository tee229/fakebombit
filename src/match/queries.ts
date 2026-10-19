import type { ActorState, Direction, InitializationRecord, Position, SemanticMap, WorldState } from './index.js';
import type { DangerForecast } from './forecast.js';
import { indexCollisionMap, moveActor, moveAxis, overlapsCell, pathTouchesCell, vectors } from './motion.js';

export type QueryWorld = Pick<WorldState, 'tick' | 'initialMap' | 'blockers' | 'bombs' | 'hazards' | 'result'>
  & { readonly initialization: Pick<InitializationRecord, 'rules'> };

export function adjacentPassage(map: SemanticMap, cell: Position, direction: Direction, radius: number): Position | null {
  const vector = vectors[direction];
  const target = { x: cell.x + vector.x, y: cell.y + vector.y };
  const moved = moveAxis({ x: cell.x + 0.5, y: cell.y + 0.5 }, direction, 1, map, radius);
  return moved.x === target.x + 0.5 && moved.y === target.y + 0.5 ? target : null;
}

/** One search owns derived movement facts; safety reuse never crosses a damage boundary. */
export function createStepProjector(world: QueryWorld, forecast: DangerForecast) {
  const movement = new Map<string, ReturnType<typeof moveActor> & { exitBombIds: readonly string[]; stateKey: string; safety: Map<number, boolean> }>();
  const maps = new Map<string, { id: number; map: Parameters<typeof moveActor>[3] }>();
  const permissionKeys = new WeakMap<readonly string[], string>();
  // An edge checks its path at tick and its endpoint at tick + 1. Both sides
  // of every start/end boundary must therefore split the safety cache.
  const damagePhases = [...new Set([world.tick, ...forecast.windows.flatMap(interval =>
    [interval.startTick - 1, interval.startTick, interval.endTick - 1, interval.endTick].filter(tick => tick > world.tick))])]
    .sort((a, b) => a - b).map(tick => ({ tick,
      pathCells: forecast.windows.filter(interval => interval.startTick <= tick && interval.endTick > tick).flatMap(interval => interval.cells),
      endCells: forecast.windows.filter(interval => interval.startTick <= tick + 1 && interval.endTick > tick + 1).flatMap(interval => interval.cells) }));
  return (actor: ActorState, direction: Direction | null, tick: number, exitBombIds: readonly string[]) => {
    const phase = forecast.changes.findLast(change => change.tick <= tick)!;
    const rules = world.initialization.rules;
    let permissionKey = permissionKeys.get(exitBombIds);
    if (permissionKey === undefined) { permissionKey = JSON.stringify(exitBombIds); permissionKeys.set(exitBombIds, permissionKey); }
    const mapKey = `${phase.tick}:${permissionKey}`;
    let entry = maps.get(mapKey);
    if (!entry) {
      entry = { id: maps.size, map: indexCollisionMap({ ...world.initialMap, blockers: [...phase.blockers, ...phase.bombs.filter(bomb => !exitBombIds.includes(bomb.id))] }) };
      maps.set(mapKey, entry);
    }
    const key = `${entry.id}:${actor.position.x}:${actor.position.y}:${actor.heading}:${actor.abilities.speed}:${direction}`;
    let moved = movement.get(key);
    if (!moved) {
      const outcome = direction === null ? { position: actor.position, heading: null, path: [actor.position] }
        : moveActor(actor, direction, { ...rules, speed: actor.abilities.speed }, entry.map);
      const remaining = exitBombIds.filter(id => phase.bombs.some(bomb => bomb.id === id && overlapsCell(outcome.position, bomb, rules.radius)));
      moved = { ...outcome, exitBombIds: remaining, safety: new Map(),
        stateKey: `${outcome.position.x.toFixed(9)},${outcome.position.y.toFixed(9)}:${outcome.heading}:${remaining.join(',')}` };
      if (movement.size < 8192) movement.set(key, moved);
    }
    const damagePhase = damagePhases.findLastIndex(phase => phase.tick <= tick);
    let safe = moved.safety.get(damagePhase);
    if (safe === undefined) {
      const damage = damagePhases[damagePhase]!;
      safe = !damage.pathCells.some(cell => pathTouchesCell(moved.path, cell, rules.radius))
        && !damage.endCells.some(cell => overlapsCell(moved.position, cell, rules.radius));
      moved.safety.set(damagePhase, safe);
    }
    return { actor: { ...actor, position: moved.position, previousPosition: actor.position, heading: moved.heading }, safe,
      exitBombIds: moved.exitBombIds, stateKey: moved.stateKey };
  };
}

export function safeToWait(world: QueryWorld, forecast: DangerForecast, actor: ActorState, tick: number): boolean {
  return !forecast.windows.some(interval => interval.endTick > tick
    && interval.cells.some(cell => overlapsCell(actor.position, cell, world.initialization.rules.radius)));
}
