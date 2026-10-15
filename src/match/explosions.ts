import type { Blocker, BombState, FireState, Position, SemanticMap } from './index.js';

const vectors: readonly Position[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

/** One authoritative explosion phase. Every ray sees the same phase-start blockers. */
export function calculateExplosions(tick: number, map: Pick<SemanticMap, 'width' | 'height'>,
  blockers: readonly Blocker[], bombs: readonly BombState[], tickStartFire: readonly Pick<FireState, 'cells'>[]) {
  const burning = new Set(bombs.filter(bomb => tickStartFire.some(hazard => hazard.cells.some(cell => cell.x === bomb.x && cell.y === bomb.y))).map(bomb => bomb.id));
  const scheduled = new Set(bombs.filter(bomb => bomb.detonateAtTick <= tick || burning.has(bomb.id)).map(bomb => bomb.id));
  const exploded = new Map<string, Position[]>();
  const destroyed = new Set<string>();
  while (scheduled.size > 0) {
    const bombId = [...scheduled].sort()[0]!;
    scheduled.delete(bombId);
    if (exploded.has(bombId)) continue;
    const bomb = bombs.find(bomb => bomb.id === bombId)!;
    const cells: Position[] = [{ x: bomb.x, y: bomb.y }];
    for (const vector of vectors) {
      for (let distance = 1; distance <= bomb.blastRange; distance++) {
        const cell = { x: bomb.x + vector.x * distance, y: bomb.y + vector.y * distance };
        if (cell.x < 0 || cell.x >= map.width || cell.y < 0 || cell.y >= map.height) break;
        const wall = blockers.find(wall => wall.x === cell.x && wall.y === cell.y);
        if (wall?.type === 'solid-wall') break;
        cells.push(cell);
        if (wall) { destroyed.add(wall.id); break; }
      }
    }
    exploded.set(bomb.id, cells);
    for (const other of bombs) {
      if (!exploded.has(other.id) && cells.some(cell => cell.x === other.x && cell.y === other.y)) scheduled.add(other.id);
    }
  }
  return { exploded, destroyed };
}
