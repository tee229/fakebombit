import type { ActorState, Direction, Position, WorldState } from './index.js';
import { forecastDanger } from './forecast.js';
import { createStepProjector, safeToWait } from './queries.js';
import type { EscapeAiConfig } from './escape-ai.js';

/** Bounded goal-directed search; every edge is a real logical movement step. */
export function findRoute(world: WorldState, actor: ActorState, goal: Position | null, config: Pick<EscapeAiConfig, 'maxSearchStates' | 'searchHorizonSeconds'>) {
  const forecast = forecastDanger(world);
  const projectStep = createStepProjector(world, forecast);
  type Node = { actor: ActorState; tick: number; exitBombIds: readonly string[]; parent: number; move: Direction | null };
  const nodes: Node[] = [{ actor, tick: world.tick, exitBombIds: world.bombs.filter(bomb => bomb.exitActorIds.includes(actor.id)).map(bomb => bomb.id), parent: -1, move: null }];
  const targets: Position[] = goal ? [{ x: goal.x + 0.5, y: goal.y + 0.5 }] : [];
  if (!goal) for (let y = 0; y < world.initialMap.height; y++) for (let x = 0; x < world.initialMap.width; x++) {
    const position = { x: x + 0.5, y: y + 0.5 };
    if (!world.blockers.some(wall => wall.type === 'solid-wall' && wall.x === x && wall.y === y)
      && safeToWait(world, forecast, { ...actor, position }, world.tick)) targets.push(position);
  }
  const estimates = new Map<number, Map<number, number>>();
  const estimate = (position: Position): number => {
    if (!targets.length) return 0;
    if (targets.length === 1) return Math.abs(position.x - targets[0]!.x) + Math.abs(position.y - targets[0]!.y);
    let column = estimates.get(position.x);
    const cached = column?.get(position.y); if (cached !== undefined) return cached;
    let distance = Infinity;
    for (const target of targets) distance = Math.min(distance, Math.abs(position.x - target.x) + Math.abs(position.y - target.y));
    if (!column) { column = new Map(); estimates.set(position.x, column); }
    column.set(position.y, distance);
    return distance;
  };
  const frontier = [{ index: 0, rank: estimate(actor.position) * world.initialization.rules.tickRate / actor.abilities.speed }];
  const seen = new Set<string>();
  const horizon = world.tick + Math.ceil(config.searchHorizonSeconds * world.initialization.rules.tickRate);
  let best = 0;
  let exhausted = false;
  const finish = (index: number, reached: boolean) => {
    const plan: (Direction | null)[] = [];
    while (nodes[index]!.parent >= 0) { plan.push(nodes[index]!.move); index = nodes[index]!.parent; }
    return { plan: plan.reverse(), searchedStates: nodes.length, reached, exhausted };
  };
  while (frontier.length) {
    const index = frontier.shift()!.index;
    const node = nodes[index]!;
    if (safeToWait(world, forecast, node.actor, node.tick)) {
      if (!goal || (Math.floor(node.actor.position.x) === goal.x && Math.floor(node.actor.position.y) === goal.y)) return finish(index, true);
      if (estimate(node.actor.position) < estimate(nodes[best]!.actor.position)) best = index;
    }
    // Once a new state was rejected, the queue cannot grow again. Still visit
    // queued nodes above so their goal/best-route checks retain the same order.
    if (node.tick >= horizon || exhausted) continue;
    for (const direction of ['up', 'right', 'down', 'left', null] as const) {
      if (direction === null && forecast.windows.length === 0) continue;
      const next = projectStep(node.actor, direction, node.tick, node.exitBombIds);
      if (!next.safe || (direction !== null && next.actor.position.x === node.actor.position.x && next.actor.position.y === node.actor.position.y)) continue;
      const key = `${node.tick + 1}:${next.stateKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (nodes.length >= config.maxSearchStates) { exhausted = true; break; }
      const nextIndex = nodes.length;
      nodes.push({ ...next, tick: node.tick + 1, parent: index, move: direction });
      const rank = node.tick + 1 - world.tick + estimate(next.actor.position) * world.initialization.rules.tickRate / actor.abilities.speed;
      let low = 0, high = frontier.length;
      while (low < high) { const middle = Math.floor((low + high) / 2); if (frontier[middle]!.rank <= rank) low = middle + 1; else high = middle; }
      frontier.splice(low, 0, { index: nextIndex, rank });
    }
  }
  return finish(best, false);
}
