import { expect, test } from 'vitest';
import { createMatch, type MatchConfig } from '../src/match/index.js';
import { forecastDanger } from '../src/match/forecast.js';

const config: MatchConfig = {
  seed: 'danger-example',
  map: { width: 9, height: 7, ground: Array.from({ length: 63 }, () => 'floor'), blockers: [],
    spawns: [{ id: 'start', x: 2, y: 3 }, { id: 'other', x: 3, y: 3 }] },
  actors: [{ id: 'a', type: 'actor', spawnId: 'start' }, { id: 'b', type: 'actor', spawnId: 'other' }],
  rules: { tickRate: 10, speed: 20, bombFuseSeconds: 0.3, fireDurationSeconds: 0.2, blastRange: 1 },
};

test('read-only forecast reports the real chain cells and exclusive fire interval without advancing the match', () => {
  const match = createMatch(config);
  match.advanceTick([{ actorId: 'a', move: 'up', bomb: true }]);
  match.advanceTick([{ actorId: 'b', move: 'down', bomb: true }]);
  const before = match.readWorld();
  const forecast = forecastDanger(before);
  expect(match.readWorld()).toEqual(before);
  expect(forecast.explosions.map(explosion => [explosion.bombId, explosion.tick, explosion.expiresAtTick])).toEqual([
    ['bomb-1', 3, 5], ['bomb-2', 3, 5],
  ]);
  expect(forecast.explosions[0]?.cells).toEqual([{ x: 2, y: 3 }, { x: 2, y: 2 }, { x: 3, y: 3 }, { x: 2, y: 4 }, { x: 1, y: 3 }]);
  const actual = match.advanceTick().filter(event => event.type === 'bomb-exploded');
  expect(actual.map(event => ({ bombId: event.bombId, cells: event.cells }))).toEqual(forecast.explosions.map(({ bombId, cells }) => ({ bombId, cells })));
  expect(match.readWorld().hazards.map(hazard => hazard.expiresAtTick)).toEqual([5, 5]);
  match.advanceTick();
  expect(match.readWorld().hazards).toHaveLength(2);
  match.advanceTick();
  expect(match.readWorld().hazards).toEqual([]);
  expect(Object.isFrozen(forecast.explosions[0]?.cells)).toBe(true);
});

test('already active fire retains its original interval and no future explosion is invented', () => {
  const match = createMatch(config);
  match.advanceTick([{ actorId: 'a', move: 'up', bomb: true }]);
  match.advanceTick(); match.advanceTick();
  const world = match.readWorld();
  const forecast = forecastDanger(world);
  expect(forecast.explosions).toEqual([]);
  expect(forecast.windows).toEqual([{ bombId: 'bomb-1', startTick: 3, endTick: 5, cells: world.hazards[0]!.cells }]);
  expect(forecast.untilTick).toBe(5);
});

test('a terminal match has no future projection because its rule clock cannot advance', () => {
  const match = createMatch({ ...config, playerId: 'a', rules: { ...config.rules, bombFuseSeconds: 10, matchDurationSeconds: 0.2 } });
  match.advanceTick([{ actorId: 'a', move: 'up', bomb: true }]);
  match.advanceTick();
  expect(match.readWorld().result?.outcome).toBe('draw');
  const forecast = forecastDanger(match.readWorld());
  expect(forecast.explosions).toEqual([]);
  expect(forecast.untilTick).toBe(2);
});

test('forecast uses phase-start blockers for a chain, then cleared blockers for later explosions', () => {
  const match = createMatch({ ...config,
    map: { ...config.map, blockers: [{ id: 'crate', type: 'breakable-wall', x: 3, y: 3 }], spawns: [
      { id: 'a', x: 2, y: 2 }, { id: 'b', x: 2, y: 3 }, { id: 'c', x: 4, y: 3 }, { id: 'd', x: 3, y: 2 },
    ] }, actors: ['a', 'b', 'c', 'd'].map(id => ({ id, type: 'actor', spawnId: id })),
    rules: { ...config.rules, bombFuseSeconds: 0.4, blastRange: 2 },
  });
  match.advanceTick([{ actorId: 'd', move: 'up', bomb: true }]);
  match.advanceTick([{ actorId: 'd', move: 'left' }, { actorId: 'a', move: 'left', bomb: true }, { actorId: 'b', move: 'down', bomb: true }]);
  match.advanceTick([{ actorId: 'a', move: 'up' }, { actorId: 'b', move: 'left' }, { actorId: 'c', move: 'right', bomb: true }]);
  const forecast = forecastDanger(match.readWorld());
  expect(forecast.explosions.map(({ bombId, tick }) => [bombId, tick])).toEqual([['bomb-1', 4], ['bomb-2', 4], ['bomb-3', 4], ['bomb-4', 6]]);
  expect(forecast.explosions.find(explosion => explosion.bombId === 'bomb-3')?.cells).not.toContainEqual({ x: 4, y: 3 });
  expect(forecast.explosions.find(explosion => explosion.bombId === 'bomb-4')?.cells).toContainEqual({ x: 2, y: 3 });
  const before = match.readWorld();
  const actual = [];
  while (match.readWorld().tick < forecast.untilTick) actual.push(...match.advanceTick().filter(event => event.type === 'bomb-exploded'));
  expect(actual.map(({ bombId, tick, cells }) => ({ bombId, tick, cells }))).toEqual(forecast.explosions.map(({ bombId, tick, cells }) => ({ bombId, tick, cells })));
  expect(before.blockers).toHaveLength(1);
});

test('extra predictions consume no drop randomness and cannot change future gameplay', () => {
  const source: MatchConfig = { ...config, map: { ...config.map, blockers: [{ id: 'crate', type: 'breakable-wall', x: 3, y: 3 }],
    spawns: [{ id: 'start', x: 2, y: 3 }, { id: 'other', x: 7, y: 5 }] }, rules: { ...config.rules, itemDropChance: 1 } };
  const match = createMatch(source);
  const replay = createMatch(match.readWorld().initialization);
  for (let tick = 0; tick < 8; tick++) {
    for (let query = 0; query < 5; query++) forecastDanger(replay.readWorld());
    const intents = [{ actorId: 'a', move: tick === 0 ? 'up' as const : null, bomb: tick === 0 }];
    expect(replay.advanceTick(intents)).toEqual(match.advanceTick(intents));
    expect(replay.readWorld()).toEqual(match.readWorld());
  }
  expect(match.readWorld().items).toHaveLength(1);
});
