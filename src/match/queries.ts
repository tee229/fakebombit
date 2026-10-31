import type { ActorState, Direction, InitializationRecord, Position, WorldState } from './index.js';
import type { DangerForecast } from './forecast.js';
import { indexCollisionMap, moveActor, moveAxis, overlapsCell, pathTouchesCell, vectors } from './motion.js';

export type QueryWorld = Pick<WorldState, 'tick' | 'initialMap' | 'blockers' | 'bombs' | 'hazards' | 'result'>
  & { readonly initialization: Pick<InitializationRecord, 'rules'> };

export function adjacentPassage(map: Parameters<typeof moveAxis>[3], cell: Position, direction: Direction, radius: number): Position | null {
  const vector = vectors[direction];
  const target = { x: cell.x + vector.x, y: cell.y + vector.y };
  const moved = moveAxis({ x: cell.x + 0.5, y: cell.y + 0.5 }, direction, 1, map, radius);
  return moved.x === target.x + 0.5 && moved.y === target.y + 0.5 ? target : null;
}

/** One search owns derived movement facts; safety reuse never crosses a damage boundary. */
export function createStepProjector(world: QueryWorld, forecast: DangerForecast) {
  type CachedMove = ReturnType<typeof moveActor> & { exitBombIds: readonly string[]; stateKey: string; safety: Map<number, boolean> };
  type Positions = Map<number, Map<number, Map<string, CachedMove>>>;
  let movementCount = 0;
  const maps = new Map<string, { map: Parameters<typeof moveActor>[3]; movement: Positions }>();
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
      entry = { map: indexCollisionMap({ ...world.initialMap, blockers: [...phase.blockers, ...phase.bombs.filter(bomb => !exitBombIds.includes(bomb.id))] }), movement: new Map() };
      maps.set(mapKey, entry);
    }
    // Numeric position keys retain exact coordinates without repeatedly formatting long floating values.
    const key = `${actor.heading}:${actor.abilities.speed}:${direction}`;
    let moved = entry.movement.get(actor.position.x)?.get(actor.position.y)?.get(key);
    if (!moved) {
      const outcome = direction === null ? { position: actor.position, heading: null, path: [actor.position] }
        : moveActor(actor, direction, { ...rules, speed: actor.abilities.speed }, entry.map);
      const remaining = exitBombIds.filter(id => phase.bombs.some(bomb => bomb.id === id && overlapsCell(outcome.position, bomb, rules.radius)));
      moved = { ...outcome, exitBombIds: remaining, safety: new Map(),
        stateKey: `${outcome.position.x.toFixed(9)},${outcome.position.y.toFixed(9)}:${outcome.heading}:${remaining.join(',')}` };
      if (movementCount < 8192) {
        let column = entry.movement.get(actor.position.x);
        if (!column) { column = new Map(); entry.movement.set(actor.position.x, column); }
        let states = column.get(actor.position.y);
        if (!states) { states = new Map(); column.set(actor.position.y, states); }
        states.set(key, moved); movementCount++;
      }
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
