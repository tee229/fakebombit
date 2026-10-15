import type { ActorState, Direction, MovementRules, Position, SemanticMap } from './index.js';

export const vectors: Record<Direction, Position> = { up: { x: 0, y: -1 }, right: { x: 1, y: 0 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

type CollisionMap = Pick<SemanticMap, 'width' | 'height'> & { readonly blockers: readonly Position[] };

export function overlapsCell(position: Position, cell: Position, radius: number): boolean {
  return position.x + radius > cell.x && position.x - radius < cell.x + 1
    && position.y + radius > cell.y && position.y - radius < cell.y + 1;
}

export function pathTouchesCell(path: readonly Position[], cell: Position, radius: number): boolean {
  for (let index = 1; index < path.length; index++) {
    const start = path[index - 1]!;
    const end = path[index]!;
    if (Math.max(start.x, end.x) + radius > cell.x && Math.min(start.x, end.x) - radius < cell.x + 1
      && Math.max(start.y, end.y) + radius > cell.y && Math.min(start.y, end.y) - radius < cell.y + 1) return true;
  }
  return path.length === 1 && overlapsCell(path[0]!, cell, radius);
}

function moveAxis(position: Position, direction: Direction, distance: number, map: CollisionMap, radius: number): Position {
  const vector = vectors[direction];
  const axis = vector.x === 0 ? 'y' : 'x';
  const across = axis === 'x' ? 'y' : 'x';
  const sign = vector[axis];
  const start = position[axis];
  let end = Math.max(0.5, Math.min((axis === 'x' ? map.width : map.height) - 0.5, start + sign * distance));
  for (const wall of map.blockers) {
    if (position[across] + radius <= wall[across] || position[across] - radius >= wall[across] + 1) continue;
    // Stop at the preceding cell center. A newly blocking bomb may find an
    // actor already past that center; block re-entry without pushing it back.
    if (sign > 0 && start <= wall[axis] - radius) end = Math.min(end, Math.max(start, wall[axis] - 0.5));
    if (sign < 0 && start >= wall[axis] + 1 + radius) end = Math.max(end, Math.min(start, wall[axis] + 1.5));
  }
  return { ...position, [axis]: end };
}

interface MovementOutcome { position: Position; heading: Direction | null; path: readonly Position[] }

export function moveActor(actor: ActorState, wanted: Direction, rules: MovementRules, map: CollisionMap): MovementOutcome {
  const distance = rules.speed / rules.tickRate;
  const alignmentAxis = vectors[wanted].x === 0 ? 'x' : 'y';
  if (actor.heading && vectors[actor.heading][alignmentAxis] === 0) {
    const position = moveAxis(actor.position, wanted, distance, map, rules.radius);
    return { position, heading: wanted, path: [actor.position, position] };
  }
  const nearest = Math.floor(actor.position[alignmentAxis]) + 0.5;
  const snapDistance = Math.abs(nearest - actor.position[alignmentAxis]);
  const snapped = { ...actor.position, [alignmentAxis]: nearest };
  const snapDirection = alignmentAxis === 'x' ? (nearest >= actor.position.x ? 'right' : 'left') : (nearest >= actor.position.y ? 'down' : 'up');
  const snapEnd = moveAxis(actor.position, snapDirection, snapDistance, map, rules.radius);
  if (snapDistance <= rules.turnTolerance + 1e-10 && Math.abs(snapEnd[alignmentAxis] - nearest) <= 1e-10 && (!actor.heading || canTurn(snapped, wanted, map, rules.radius))) {
    const position = moveAxis(snapped, wanted, distance, map, rules.radius);
    return { position, heading: wanted, path: [actor.position, snapped, position] };
  }
  // Releasing between centers loses the heading. Walk to the nearest open
  // intersection before a perpendicular restart instead of leaving the rail.
  const heading = actor.heading ?? (canTurn(snapped, wanted, map, rules.radius) ? snapDirection : null);
  const sign = heading ? vectors[heading][alignmentAxis] : 0;
  let center = sign < 0 ? Math.floor(actor.position[alignmentAxis] - 0.5 + 1e-10) + 0.5 : Math.ceil(actor.position[alignmentAxis] - 0.5 - 1e-10) + 0.5;
  const limit = alignmentAxis === 'x' ? map.width : map.height;
  while (center > 0 && center < limit) {
    const travel = Math.abs(center - actor.position[alignmentAxis]);
    if (travel > distance + 1e-10 || (!heading && travel > 1e-10)) break;
    const aligned = { ...actor.position, [alignmentAxis]: center };
    const reached = heading ? moveAxis(actor.position, heading, travel, map, rules.radius) : actor.position;
    if (Math.abs(reached[alignmentAxis] - center) > 1e-10) break;
    if (canTurn(aligned, wanted, map, rules.radius)) {
      const position = moveAxis(aligned, wanted, Math.max(0, distance - travel), map, rules.radius);
      return { position, heading: wanted, path: [actor.position, aligned, position] };
    }
    if (!heading) break;
    center += sign;
  }
  const position = heading ? moveAxis(actor.position, heading, distance, map, rules.radius) : actor.position;
  return { position, heading, path: [actor.position, position] };
}

function canTurn(position: Position, direction: Direction, map: CollisionMap, radius: number): boolean {
  const vector = vectors[direction];
  const x = Math.floor(position.x) + vector.x;
  const y = Math.floor(position.y) + vector.y;
  return x >= 0 && x < map.width && y >= 0 && y < map.height
    && !map.blockers.some(wall => wall.x === x && wall.y === y)
    && !map.blockers.some(wall => position.x + radius > wall.x && position.x - radius < wall.x + 1 && position.y + radius > wall.y && position.y - radius < wall.y + 1);
}

