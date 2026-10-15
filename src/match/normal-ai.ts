import type { ActorState, GameplayIntent, WorldState } from './index.js';
import { aiDefaults, type EscapeAiConfig, type EscapeAiState } from './escape-ai.js';
import { makeBomb } from './bomb.js';
import { calculateExplosions } from './explosions.js';
import { overlapsCell } from './motion.js';
import { findRoute } from './ai-navigation.js';
import { chooseGoal, type AiGoal } from './ai-goals.js';

export interface NormalAiConfig extends EscapeAiConfig { readonly mode: 'normal'; readonly pickupWeight: number; readonly crateWeight: number; readonly threatWeight: number }
export const normalAiDefaults: NormalAiConfig = { ...aiDefaults, mode: 'normal', pickupWeight: 3, crateWeight: 2, threatWeight: 1 };
export interface NormalAiState extends Omit<EscapeAiState, 'status'> {
  readonly status: EscapeAiState['status'] | 'collecting' | 'breaking' | 'threatening';
  readonly goal: AiGoal | null;
}

export function createNormalController(config: NormalAiConfig, draw: (size: number) => number) {
  let known = '';
  let reactAt = 0;
  let nextDecision = 0;
  let plan: (GameplayIntent['move'])[] = [];
  let expectedPlacement: string | null = null;
  let goal: AiGoal | null = null;
  let state: NormalAiState = { status: 'observing', decisionTick: null, searchedStates: 0, remainingSteps: 0, goal: null };
  return {
    advance(world: WorldState, actor: ActorState): GameplayIntent {
      const signature = dangerSignature(world, actor);
      if (signature !== known) {
        known = signature;
        if (signature !== expectedPlacement) {
          reactAt = world.tick + Math.ceil(config.reactionSeconds * world.initialization.rules.tickRate);
          plan = []; state = { ...state, status: 'observing', remainingSteps: 0, goal: null };
        }
      }
      expectedPlacement = null;
      let bomb = false;
      if (world.tick >= nextDecision && world.tick >= reactAt) {
        const escape = searchEscape(world, actor, config);
        plan = escape.plan;
        state = { status: escape.status, decisionTick: world.tick, searchedStates: escape.searchedStates, remainingSteps: plan.length, goal: null };
        if (escape.status === 'safe' && world.bombs.filter(placed => placed.ownerId === actor.id).length < actor.abilities.bombCapacity
          && !world.bombs.some(placed => placed.x === Math.floor(actor.position.x) && placed.y === Math.floor(actor.position.y))) {
          const rules = world.initialization.rules;
          const candidate = makeBomb(`candidate:${actor.id}`, actor, world.tick, rules, world.actors.filter(other => other.alive && overlapsCell(other.position, { x: Math.floor(actor.position.x), y: Math.floor(actor.position.y) }, rules.radius)).map(other => other.id));
          const blast = calculateExplosions(candidate.detonateAtTick, world.initialMap, world.blockers, [candidate], []);
          goal = chooseGoal(world, actor, config, draw, goal);
          const usefulBomb = goal?.kind === 'break' ? blast.destroyed.has(goal.id) : goal?.kind === 'threat'
            && world.actors.some(other => other.id === goal!.id && other.alive && blast.exploded.get(candidate.id)!.some(cell => overlapsCell(other.position, cell, rules.radius)));
          if (usefulBomb) {
            const search = searchEscape({ ...world, bombs: [...world.bombs, candidate] }, actor, config);
            state = { ...state, status: search.status, searchedStates: search.searchedStates };
            if (search.status === 'escaping') {
              bomb = true; expectedPlacement = dangerSignature({ ...world, bombs: [...world.bombs, candidate] }, actor); plan = search.plan;
              state = { ...state, status: 'escaping' };
            }
          }
          if (!bomb && goal && !usefulBomb) {
            const route = findRoute(world, actor, goal.cell, config);
            plan = route.plan;
            state = { ...state, searchedStates: route.searchedStates, goal,
              status: plan.length ? { collect: 'collecting' as const, break: 'breaking' as const, threat: 'threatening' as const }[goal.kind] : route.exhausted ? 'budget-exhausted' : 'no-route' };
          }
        }
        nextDecision = world.tick + Math.ceil(config.decisionIntervalSeconds * world.initialization.rules.tickRate);
      }
      const move = plan.shift() ?? null;
      state = { ...state, remainingSteps: plan.length };
      return { actorId: actor.id, move, ...(bomb ? { bomb: true } : {}) };
    },
    readState(alive: boolean): NormalAiState { return alive ? state : { ...state, status: 'eliminated', remainingSteps: 0, goal: null }; },
  };
}

function searchEscape(world: WorldState, actor: ActorState, config: NormalAiConfig) {
  const route = findRoute(world, actor, null, config);
  const status = route.reached ? (route.plan.length ? 'escaping' as const : 'safe' as const) : route.exhausted ? 'budget-exhausted' as const : 'no-route' as const;
  return { ...route, status };
}

function dangerSignature(world: WorldState, actor: ActorState): string {
  const bombs = world.bombs.map(bomb => [bomb.ownerId, bomb.x, bomb.y, bomb.placedAtTick, bomb.detonateAtTick, bomb.blastRange]).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
  return JSON.stringify([bombs, world.hazards.map(hazard => hazard.id).sort(), world.blockers.map(wall => wall.id).sort(), actor.abilities]);
}
