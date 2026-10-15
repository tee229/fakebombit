import type { ActorState, Position, WorldState } from './index.js';
import type { NormalAiConfig } from './normal-ai.js';
import { adjacentPassage } from './queries.js';

export interface AiGoal { readonly kind: 'collect' | 'break' | 'threat'; readonly id: string; readonly cell: Position }

export function chooseGoal(world: WorldState, actor: ActorState, config: NormalAiConfig, draw: (size: number) => number, previous: AiGoal | null): AiGoal | null {
  const start = { x: Math.floor(actor.position.x), y: Math.floor(actor.position.y) };
  const map = { ...world.initialMap, blockers: [...world.blockers, ...world.bombs.map(bomb => ({ ...bomb, type: 'solid-wall' as const }))] };
  const distances = new Map([[`${start.x},${start.y}`, 0]]);
  const queue = [start];
  for (let index = 0; index < queue.length; index++) for (const direction of ['up', 'right', 'down', 'left'] as const) {
    const cell = adjacentPassage(map, queue[index]!, direction, world.initialization.rules.radius);
    if (!cell || distances.has(`${cell.x},${cell.y}`)) continue;
    distances.set(`${cell.x},${cell.y}`, distances.get(`${queue[index]!.x},${queue[index]!.y}`)! + 1); queue.push(cell);
  }
  const goals: AiGoal[] = world.items.filter(item => item.active && config.pickupWeight > 0).map(item => ({ kind: 'collect', id: item.id, cell: { x: item.x, y: item.y } }));
  if (config.crateWeight > 0) for (const wall of world.blockers) if (wall.type === 'breakable-wall') {
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) goals.push({ kind: 'break', id: wall.id, cell: { x: wall.x + dx!, y: wall.y + dy! } });
  }
  if (config.threatWeight > 0) for (const other of world.actors) if (other.alive && other.id !== actor.id) {
    goals.push({ kind: 'threat', id: other.id, cell: { x: Math.floor(other.position.x), y: Math.floor(other.position.y) } });
  }
  let bestScore = -Infinity;
  let candidates: AiGoal[] = [];
  for (const goal of goals.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : a.cell.y - b.cell.y || a.cell.x - b.cell.x)) {
    const distance = distances.get(`${goal.cell.x},${goal.cell.y}`);
    if (distance === undefined) continue;
    const weight = { collect: config.pickupWeight, break: config.crateWeight, threat: config.threatWeight }[goal.kind];
    const score = weight / (distance + 1);
    if (score > bestScore) { bestScore = score; candidates = [goal]; }
    else if (score === bestScore) candidates.push(goal);
  }
  return candidates.find(goal => previous?.kind === goal.kind && previous.id === goal.id && previous.cell.x === goal.cell.x && previous.cell.y === goal.cell.y)
    ?? (candidates.length ? candidates[candidates.length === 1 ? 0 : draw(candidates.length)]! : null);
}
