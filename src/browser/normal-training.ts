import { createMatch, type Blocker, type Match } from '../match/index.js';

/** A shared dead end makes the effect of sealing an opponent's escape visible. */
export function createNormalTrainingMatch(): Match {
  const blockers: Blocker[] = [];
  for (let y = 0; y < 7; y++) for (let x = 0; x < 9; x++) {
    if (x === 0 || x === 8 || y === 0 || y === 6 || (x % 2 === 0 && y % 2 === 0)) blockers.push({ id: `wall-${x}-${y}`, type: 'solid-wall', x, y });
  }
  blockers.push({ id: 'exit-crate', type: 'breakable-wall', x: 7, y: 2 });
  return createMatch({ seed: 'normal-training-v1', playerId: 'player',
    map: { width: 9, height: 7, ground: Array.from({ length: 63 }, () => 'floor'), blockers,
      spawns: [{ id: 'player', x: 6, y: 1 }, { id: 'opponents', x: 7, y: 1 }] },
    actors: [{ id: 'player', type: 'actor', spawnId: 'player' }, ...['target-1', 'target-2', 'target-3'].map(id => ({ id, type: 'actor' as const, spawnId: 'opponents', ai: { mode: 'normal' as const } }))],
  });
}
