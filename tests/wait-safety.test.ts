import { expect, test } from 'vitest';
import { createMatch } from '../src/match/index.js';
import { forecastDanger } from '../src/match/forecast.js';
import { createWaitChecker } from '../src/match/queries.js';

const world = createMatch({ seed: 'waiting-safety', map: { width: 5, height: 5,
  ground: Array.from({ length: 25 }, () => 'floor'), blockers: [], spawns: [{ id: 'start', x: 0, y: 0 }] },
  actors: [{ id: 'actor', type: 'actor', spawnId: 'start' }] }).readWorld();

test('waiting includes future fire across a quiet gap and becomes safe at the last exclusive expiry', () => {
  const canWait = createWaitChecker(world, { ...forecastDanger(world), windows: [
    { bombId: 'first', startTick: 3, endTick: 5, cells: [{ x: 2, y: 3 }] },
    { bombId: 'later', startTick: 7, endTick: 9, cells: [{ x: 2, y: 3 }] },
    { bombId: 'elsewhere', startTick: 10, endTick: 20, cells: [{ x: 4, y: 4 }] },
  ] });
  for (const tick of [0, 3, 5, 7, 8]) expect(canWait({ x: 2.5, y: 3.5 }, tick)).toBe(false);
  expect(canWait({ x: 2.5, y: 3.5 }, 9)).toBe(true);
  expect(canWait({ x: 0.5, y: 0.5 }, 0)).toBe(true);
  // Revisited earlier times must not inherit a later query's safe result.
  expect(canWait({ x: 2.5, y: 3.5 }, 4)).toBe(false);
});

test('waiting preserves strict footprint boundaries, exact coordinates and query ownership', () => {
  const position = { x: 1.7, y: 3.5 };
  const forecast = { ...forecastDanger(world), windows: [
    { bombId: 'fire', startTick: 2, endTick: 8, cells: [{ x: 2, y: 3 }] },
  ] };
  const canWait = createWaitChecker(world, forecast);
  expect(canWait(position, 0)).toBe(true);
  expect(canWait({ x: position.x + 1e-10, y: position.y }, 0)).toBe(false);
  expect(createWaitChecker(world, forecastDanger(world))({ x: 2.5, y: 3.5 }, 0)).toBe(true);
  expect(canWait({ x: 2.5, y: 3.5 }, 0)).toBe(false);
});
