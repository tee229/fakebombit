import { createMatch, type Blocker, type Match, type InitializationRecord } from '../match/index.js';

/** Prepare real drops through gameplay, then hand the same match to the normal controls/view. */
export function createItemTrainingMatch(initialization?: InitializationRecord): Match {
  const blockers: Blocker[] = [];
  for (let y = 0; y < 7; y++) for (let x = 0; x < 9; x++) {
    if (x === 0 || x === 8 || y === 0 || y === 6) blockers.push({ id: `wall-${x}-${y}`, type: 'solid-wall', x, y });
  }
  for (const x of [3, 5, 7]) blockers.push({ id: `crate-${x}`, type: 'breakable-wall', x, y: 1 });
  const match = createMatch(initialization ?? { seed: 'items-training-25', playerId: 'player',
    map: { width: 9, height: 7, ground: Array.from({ length: 63 }, () => 'floor'), blockers,
      spawns: [{ id: 'player', x: 1, y: 3 }, ...[2, 4, 6].map(x => ({ id: `target-${x}`, x, y: 1 }))] },
    actors: ['player', 'target-2', 'target-4', 'target-6'].map(id => ({ id, type: 'actor', spawnId: id })),
  });
  for (let step = 0; step < 211; step++) match.advanceTick([2, 4, 6].map(x => ({ actorId: `target-${x}`, move: step < 40 ? 'down' : null, bomb: step === 0 })));
  return match;
}
