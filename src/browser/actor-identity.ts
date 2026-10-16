import type { ActorState, WorldState } from '../match/index.js';

const accents = [0x83dfb6, 0xf1ca7c, 0xffaf8c, 0x91c8ed] as const;

/** One cosmetic identity shared by the side card and the actor's ground marker. */
export function actorIdentity(world: WorldState, actor: ActorState) {
  const player = actor.id === world.initialization.playerId;
  const opponent = world.initialization.actors.filter(actor => actor.id !== world.initialization.playerId).findIndex(initial => initial.id === actor.id) + 1;
  return { name: player ? '玩家' : `${actor.ai ? 'AI' : '目标'} ${opponent}`,
    color: accents[player ? 0 : opponent] ?? accents[1], player };
}
