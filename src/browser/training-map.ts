import type { Blocker, MatchConfig } from '../match/index.js';

const width = 9;
const height = 7;
const blockers: Blocker[] = [];
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (x === 0 || x === width - 1 || y === 0 || y === height - 1 || (x % 2 === 0 && y % 2 === 0)) {
      blockers.push({ id: `wall-${x}-${y}`, type: 'solid-wall', x, y });
    }
  }
}
for (const [x, y] of [[5, 1], [3, 3], [5, 3], [7, 3], [3, 5], [5, 5]] as const) {
  blockers.push({ id: `crate-${x}-${y}`, type: 'breakable-wall', x, y });
}

export const trainingMatchConfig: MatchConfig = {
  seed: 'entities-training-v1', playerId: 'player',
  map: { width, height, ground: Array.from({ length: width * height }, () => 'floor'), blockers, spawns: [
    { id: 'player', x: 1, y: 1 }, { id: 'target-1', x: 7, y: 1 }, { id: 'target-2', x: 7, y: 5 }, { id: 'target-3', x: 1, y: 5 },
  ] },
  actors: ['player', 'target-1', 'target-2', 'target-3'].map(id => ({ id, type: 'actor', spawnId: id })),
};
