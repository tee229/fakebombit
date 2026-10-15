import type { ActorState, Direction, GameplayIntent, WorldState } from './index.js';
import { forecastDanger } from './forecast.js';
import { projectStep, safeToWait } from './queries.js';

export interface EscapeAiConfig {
  readonly reactionSeconds: number;
  readonly decisionIntervalSeconds: number;
  readonly maxSearchStates: number;
  readonly searchHorizonSeconds: number;
}
export const aiDefaults: EscapeAiConfig = { reactionSeconds: 0.2, decisionIntervalSeconds: 0.1, maxSearchStates: 6000, searchHorizonSeconds: 6 };
export interface EscapeAiState {
  readonly status: 'observing' | 'safe' | 'escaping' | 'no-route' | 'budget-exhausted' | 'eliminated';
  readonly decisionTick: number | null;
  readonly searchedStates: number;
  readonly remainingSteps: number;
}

function findEscape(world: WorldState, actor: ActorState, config: EscapeAiConfig) {
  const forecast = forecastDanger(world);
  type Node = { actor: ActorState; tick: number; exitBombIds: readonly string[]; parent: number; move: Direction | null };
  const queue: Node[] = [{ actor, tick: world.tick, exitBombIds: world.bombs.filter(bomb => bomb.exitActorIds.includes(actor.id)).map(bomb => bomb.id), parent: -1, move: null }];
  const seen = new Set<string>();
  const horizon = world.tick + Math.ceil(config.searchHorizonSeconds * world.initialization.rules.tickRate);
  let exhausted = false;
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head]!;
    if (safeToWait(world, forecast, node.actor, node.tick)) {
      const plan: (Direction | null)[] = [];
      let cursor = head;
      while (queue[cursor]!.parent >= 0) { plan.push(queue[cursor]!.move); cursor = queue[cursor]!.parent; }
      return { plan: plan.reverse(), status: plan.length ? 'escaping' as const : 'safe' as const, searchedStates: head + 1 };
    }
    if (node.tick >= horizon) continue;
    for (const direction of ['up', 'right', 'down', 'left', null] as const) {
      const next = projectStep(world, forecast, node.actor, direction, node.tick, node.exitBombIds);
      if (!next.safe) continue;
      const key = `${node.tick + 1}:${next.actor.position.x.toFixed(9)},${next.actor.position.y.toFixed(9)}:${next.actor.heading}:${next.exitBombIds.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (queue.length >= config.maxSearchStates) { exhausted = true; continue; }
      queue.push({ ...next, tick: node.tick + 1, parent: head, move: direction });
    }
  }
  return { plan: [], status: exhausted ? 'budget-exhausted' as const : 'no-route' as const, searchedStates: queue.length };
}

export function createEscapeController(config: EscapeAiConfig) {
  let known = '';
  let reactAt = 0;
  let nextDecision = 0;
  let plan: (Direction | null)[] = [];
  let state: EscapeAiState = { status: 'observing', decisionTick: null, searchedStates: 0, remainingSteps: 0 };
  return {
    advance(world: WorldState, actor: ActorState): GameplayIntent {
      const signature = JSON.stringify([world.bombs.map(bomb => [bomb.id, bomb.detonateAtTick, bomb.blastRange]), world.hazards.map(hazard => hazard.id), world.blockers.map(wall => wall.id), actor.abilities]);
      if (signature !== known) {
        known = signature;
        reactAt = world.tick + Math.ceil(config.reactionSeconds * world.initialization.rules.tickRate);
        plan = [];
        state = { ...state, status: 'observing', remainingSteps: 0 };
      }
      if (world.tick >= nextDecision && world.tick >= reactAt) {
        const search = findEscape(world, actor, config);
        plan = search.plan;
        state = { status: search.status, decisionTick: world.tick, searchedStates: search.searchedStates, remainingSteps: plan.length };
        nextDecision = world.tick + Math.ceil(config.decisionIntervalSeconds * world.initialization.rules.tickRate);
      }
      const move = plan.shift() ?? null;
      state = { ...state, remainingSteps: plan.length };
      return { actorId: actor.id, move };
    },
    readState(alive: boolean): EscapeAiState { return alive ? state : { ...state, status: 'eliminated', remainingSteps: 0 }; },
  };
}
