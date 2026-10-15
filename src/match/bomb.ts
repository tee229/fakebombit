import type { ActorState, BombState, MatchRules } from './index.js';

export function makeBomb(id: string, actor: ActorState, tick: number, rules: MatchRules, exitActorIds: readonly string[]): BombState {
  return { id, type: 'bomb', ownerId: actor.id, x: Math.floor(actor.position.x), y: Math.floor(actor.position.y), exitActorIds,
    blastRange: actor.abilities.blastRange, placedAtTick: tick, detonateAtTick: tick + Math.ceil(rules.bombFuseSeconds * rules.tickRate) };
}
