import { expect, test } from 'vitest';
import { createMatch, type Direction } from '../src/match/index.js';
import { interpolatePosition } from '../src/browser/interpolate-position.js';

test.each([
  { approach: 'right', turn: 'down', x: 1, y: 1 },
  { approach: 'down', turn: 'right', x: 1, y: 1 },
  { approach: 'left', turn: 'up', x: 3, y: 3 },
  { approach: 'up', turn: 'left', x: 3, y: 3 },
] satisfies { approach: Direction; turn: Direction; x: number; y: number }[])('renders a $approach-to-$turn corner along center lines without modifying the logical world', ({ approach, turn, x, y }) => {
  const match = createMatch({
    seed: 'center-line-corner', rules: { tickRate: 10, speed: 3, turnTolerance: 0 },
    map: { width: 5, height: 5, ground: Array.from({ length: 25 }, () => 'floor'), blockers: [], spawns: [{ id: 'start', x, y }] },
    actors: [{ id: 'player', type: 'actor', spawnId: 'start' }],
  });
  for (let tick = 0; tick < 3; tick++) match.advanceTick([{ actorId: 'player', move: approach }]);
  match.advanceTick([{ actorId: 'player', move: turn }]);
  const world = match.readWorld();
  const actor = world.actors[0]!;
  expect(actor.position.x).not.toBe(actor.previousPosition.x);
  expect(actor.position.y).not.toBe(actor.previousPosition.y);
  expect(interpolatePosition(actor, 0)).toEqual(actor.previousPosition);
  expect(interpolatePosition(actor, 1)).toEqual(actor.position);
  for (const alpha of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const position = interpolatePosition(actor, alpha);
    const onColumn = Math.abs(position.x - (Math.floor(position.x) + 0.5)) < 1e-10;
    const onRow = Math.abs(position.y - (Math.floor(position.y) + 0.5)) < 1e-10;
    expect(onColumn || onRow).toBe(true);
  }
  expect(match.readWorld()).toEqual(world);
});
