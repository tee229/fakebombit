import { expect, test } from 'vitest';
import { createMatch, type MatchConfig } from '../src/match/index.js';

const config: MatchConfig = {
  seed: 'basic-bomb-example',
  map: {
    width: 7, height: 5,
    ground: Array.from({ length: 35 }, () => 'floor'),
    blockers: [],
    spawns: [{ id: 'start', x: 1, y: 1 }, { id: 'opponent', x: 5, y: 3 }],
  },
  actors: [
    { id: 'player', type: 'actor', spawnId: 'start' },
    { id: 'enemy', type: 'actor', spawnId: 'opponent' },
  ],
};

test('places a bomb at the tick-start cell before movement and reports an ordered placement event', () => {
  const match = createMatch({ ...config, rules: { speed: 60 } });
  const events = match.advanceTick([{ actorId: 'player', move: 'right', bomb: true }]);
  expect(match.readWorld()).toMatchObject({
    tick: 1,
    actors: [{ id: 'player', position: { x: 2.5, y: 1.5 } }, { id: 'enemy' }],
    bombs: [{ type: 'bomb', ownerId: 'player', x: 1, y: 1 }],
  });
  expect(events).toEqual([{ type: 'bomb-placed', tick: 1, order: 0, bombId: 'bomb-1', actorId: 'player', cell: { x: 1, y: 1 } }]);
});

test('checks active bomb capacity and permits at most one bomb per cell', () => {
  const match = createMatch({ ...config, rules: { speed: 60, bombCapacity: 2 } });
  match.advanceTick([{ actorId: 'player', move: null, bomb: true }]);
  expect(match.advanceTick([{ actorId: 'player', move: 'right', bomb: true }])).toEqual([]);
  expect(match.advanceTick([{ actorId: 'player', move: 'right', bomb: true }])).toHaveLength(1);
  expect(match.advanceTick([{ actorId: 'player', move: null, bomb: true }])).toEqual([]);
  expect(match.readWorld().bombs.map(bomb => ({ x: bomb.x, y: bomb.y }))).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }]);
});

test('lets every actor overlapping a new bomb leave, then blocks them and outsiders from entering it', () => {
  const match = createMatch({
    ...config,
    map: { ...config.map, spawns: [...config.map.spawns, { id: 'outside', x: 3, y: 1 }] },
    actors: [config.actors[0]!, { id: 'enemy', type: 'actor', spawnId: 'start' }, { id: 'outsider', type: 'actor', spawnId: 'outside' }],
    rules: { speed: 60 },
  });
  match.advanceTick([
    { actorId: 'player', move: 'right', bomb: true },
    { actorId: 'enemy', move: 'left' },
  ]);
  expect(match.readWorld().actors.map(actor => actor.position.x)).toEqual([2.5, 0.5, 3.5]);
  match.advanceTick([
    { actorId: 'player', move: 'left' },
    { actorId: 'enemy', move: 'right' },
    { actorId: 'outsider', move: 'left' },
  ]);
  expect(match.readWorld().actors.map(actor => actor.position.x)).toEqual([2.3, 0.7, 2.5]);
  match.advanceTick([{ actorId: 'outsider', move: 'left' }]);
  expect(match.readWorld().actors[2]?.position.x).toBe(2.3);
  expect(match.readWorld().bombs[0]?.exitActorIds).toEqual([]);
});

test('rejects malformed bomb input atomically and rejects invalid capacity configuration', () => {
  const match = createMatch(config);
  const intent = { actorId: 'player', move: null, bomb: true };
  Reflect.set(intent, 'bomb', 'yes');
  const before = match.readWorld();
  expect(() => match.advanceTick([intent])).toThrowError(expect.objectContaining({ code: 'invalid-intent' }));
  expect(match.readWorld()).toEqual(before);
  for (const bombCapacity of [0, -1, 1.5, Infinity]) {
    expect(() => createMatch({ ...config, rules: { bombCapacity } })).toThrowError(expect.objectContaining({ code: 'invalid-config' }));
  }
});

test('does not choose an arbitrary winner for simultaneous same-cell requests before the arbitration task', () => {
  const match = createMatch({ ...config, actors: [config.actors[0]!, { ...config.actors[1]!, spawnId: 'start' }] });
  expect(match.advanceTick([
    { actorId: 'enemy', move: null, bomb: true },
    { actorId: 'player', move: null, bomb: true },
  ])).toEqual([]);
  expect(match.readWorld().bombs).toEqual([]);
});
