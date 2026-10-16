import { createMatch, type InitializationRecord, type Match } from '../match/index.js';
import { trainingMatchConfig } from './training-map.js';
import { createItemTrainingMatch } from './item-training.js';
import { createEscapeTrainingMatch } from './escape-training.js';
import { createNormalTrainingMatch } from './normal-training.js';

export type Arena = 'generated' | 'items' | 'escape' | 'training' | 'normal';
export function freshSeed(previous: string | null = null): string {
  const seed = [...crypto.getRandomValues(new Uint32Array(2))].map(value => value.toString(36)).join('-');
  return seed === previous ? `${seed}-n` : seed;
}
export function freshMatch(): void {
  const url = new URL(location.href);
  url.searchParams.set('seed', freshSeed(url.searchParams.get('seed'))); url.searchParams.delete('arena');
  history.replaceState(null, '', url);
}
export function makeMatch(initialization?: InitializationRecord): { match: Match; arena: Arena } {
  const url = new URL(location.href), requested = url.searchParams.get('arena');
  const arena = requested === 'items' || requested === 'escape' || requested === 'training' || requested === 'normal' ? requested : 'generated';
  if (arena !== 'generated') return { arena, match: arena === 'items' ? createItemTrainingMatch(initialization) : arena === 'escape' ? createEscapeTrainingMatch(initialization)
    : arena === 'normal' ? createNormalTrainingMatch(initialization) : createMatch(initialization ?? trainingMatchConfig) };
  const seed = initialization?.seed ?? url.searchParams.get('seed') ?? freshSeed(); url.searchParams.set('seed', seed); history.replaceState(null, '', url);
  const count = Number(url.searchParams.get('ai')), seconds = Number(url.searchParams.get('seconds'));
  const actors = ['player', 'target-1', 'target-2', 'target-3'].slice(0, ([1, 2, 3].includes(count) ? count : 3) + 1)
    .map(id => ({ id, type: 'actor' as const, spawnId: id, ...(id === 'player' ? {} : { ai: { mode: 'normal' as const } }) }));
  return { arena, match: createMatch(initialization ?? { seed, generator: {}, playerId: 'player', actors,
    rules: { matchDurationSeconds: Number.isInteger(seconds) && seconds >= 1 && seconds <= 120 ? seconds : 120 } }) };
}
