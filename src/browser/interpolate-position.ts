import type { ActorState, Position } from '../match/index.js';

/** Follow the cardinal corner path so presentation stays on cell center lines. */
export function interpolatePosition(actor: ActorState, alpha: number): Position {
  const from = actor.previousPosition;
  const to = actor.position;
  const horizontal = actor.heading === 'left' || actor.heading === 'right';
  const corner = horizontal ? { x: from.x, y: to.y } : { x: to.x, y: from.y };
  const first = Math.abs(corner.x - from.x) + Math.abs(corner.y - from.y);
  const second = Math.abs(to.x - corner.x) + Math.abs(to.y - corner.y);
  const travel = Math.max(0, Math.min(1, alpha)) * (first + second);
  const start = travel < first ? from : corner;
  const end = travel < first ? corner : to;
  const length = travel < first ? first : second;
  const blend = length === 0 ? 1 : (travel < first ? travel : travel - first) / length;
  return { x: start.x + (end.x - start.x) * blend, y: start.y + (end.y - start.y) * blend };
}
