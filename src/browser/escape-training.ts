import { createMatch, type Blocker, type Match, type InitializationRecord } from '../match/index.js';

/** Known bombs are staggered so the first explosion must ignite the later one. */
export function createEscapeTrainingMatch(initialization?: InitializationRecord): Match {
  const blockers: Blocker[] = [];
  for (let y = 0; y < 7; y++) for (let x = 0; x < 9; x++) {
    if (x === 0 || x === 8 || y === 0 || y === 6) blockers.push({ id: `wall-${x}-${y}`, type: 'solid-wall', x, y });
  }
  const match = createMatch(initialization ?? { seed: 'escape-training-v1', playerId: 'player', rules: { blastRange: 2 },
    map: { width: 9, height: 7, ground: Array.from({ length: 63 }, () => 'floor'), blockers,
      spawns: [{ id: 'player', x: 1, y: 1 }, { id: 'ai', x: 4, y: 3 }, { id: 'bomber', x: 3, y: 3 }] },
    actors: [{ id: 'player', type: 'actor', spawnId: 'player' }, { id: 'enemy', type: 'actor', spawnId: 'ai', ai: {} },
      { id: 'bomber-1', type: 'actor', spawnId: 'bomber' }, { id: 'bomber-2', type: 'actor', spawnId: 'ai' }],
  });
  for (let step = 0; step < 16; step++) match.advanceTick([
    { actorId: 'bomber-1', move: 'left', bomb: step === 0 },
    { actorId: 'bomber-2', move: 'right', bomb: step === 15 },
  ]);
  return match;
}
