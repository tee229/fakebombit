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

test('rounds seconds upward and exposes fire only on its half-open logical-tick interval', () => {
  const match = createMatch({ ...config, rules: { tickRate: 10, speed: 10, bombFuseSeconds: 0.21, fireDurationSeconds: 0.11 } });
  match.advanceTick([{ actorId: 'player', move: 'right', bomb: true }]);
  expect(match.readWorld().bombs[0]).toMatchObject({ placedAtTick: 0, detonateAtTick: 3 });
  expect(match.readWorld().hazards).toEqual([]);
  match.advanceTick([{ actorId: 'player', move: 'right' }]);
  expect(match.readWorld().bombs).toHaveLength(1);
  const events = match.advanceTick();
  expect(events[0]).toMatchObject({ type: 'bomb-exploded', tick: 3, order: 0, bombId: 'bomb-1' });
  expect(match.readWorld()).toMatchObject({ bombs: [], hazards: [{ type: 'hazard.fire', createdAtTick: 3, expiresAtTick: 5 }] });
  match.advanceTick();
  expect(match.readWorld().hazards).toHaveLength(1);
  match.advanceTick();
  expect(match.readWorld().hazards).toEqual([]);
});

test('propagates cardinal fire, stops at solid walls, and destroys a breakable blocker without passing through it', () => {
  const source: MatchConfig = {
    ...config,
    map: { ...config.map, spawns: [{ id: 'start', x: 3, y: 2 }, config.map.spawns[1]!], blockers: [
      { id: 'above', type: 'solid-wall', x: 3, y: 1 },
      { id: 'breakable', type: 'breakable-wall', x: 4, y: 2 },
      { id: 'left', type: 'solid-wall', x: 1, y: 2 },
    ] },
    rules: { tickRate: 10, bombFuseSeconds: 0.1, blastRange: 3 },
  };
  const match = createMatch(source);
  const initial = match.readWorld();
  const events = match.advanceTick([{ actorId: 'player', move: null, bomb: true }]);
  expect(match.readWorld().hazards[0]?.cells).toEqual([{ x: 3, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 3 }, { x: 3, y: 4 }, { x: 2, y: 2 }]);
  expect(match.readWorld().blockers.map(wall => wall.id)).toEqual(['above', 'left']);
  expect(initial.blockers).toHaveLength(3);
  expect(match.readWorld().initialMap.blockers).toHaveLength(3);
  expect(events.slice(0, 3)).toMatchObject([
    { type: 'bomb-placed', tick: 1, order: 0 },
    { type: 'bomb-exploded', tick: 1, order: 1 },
    { type: 'blocker-destroyed', tick: 1, order: 2, blockerId: 'breakable' },
  ]);
});

test('eliminates an actor once at the explosion phase and ignores its later valid gameplay actions', () => {
  const match = createMatch({ ...config, rules: { tickRate: 10, bombFuseSeconds: 0.1 } });
  const events = match.advanceTick([{ actorId: 'player', move: null, bomb: true }]);
  expect(match.readWorld().actors.map(actor => actor.alive)).toEqual([false, true]);
  expect(events.at(-1)).toEqual({ type: 'actor-eliminated', tick: 1, order: 2, actorId: 'player', hazardId: 'fire-1' });
  expect(match.advanceTick([{ actorId: 'player', move: 'right', bomb: true }])).toEqual([]);
  expect(match.readWorld().actors[0]).toMatchObject({ alive: false, heading: null, position: { x: 1.5, y: 1.5 } });
  expect(match.readWorld().bombs).toEqual([]);
});

test.each([0.1, 0.2])('damages a swept crossing of existing fire even with a safe endpoint and fire duration %s', fireDurationSeconds => {
  const match = createMatch({
    ...config,
    map: { ...config.map, spawns: [{ id: 'start', x: 0, y: 2 }, { id: 'opponent', x: 3, y: 2 }] },
    rules: { tickRate: 10, speed: 50, bombFuseSeconds: 0.1, fireDurationSeconds },
  });
  match.advanceTick([{ actorId: 'enemy', move: null, bomb: true }]);
  const events = match.advanceTick([{ actorId: 'player', move: 'right' }]);
  expect(match.readWorld().actors[0]).toMatchObject({ position: { x: 5.5, y: 2.5 }, alive: false });
  expect(events).toEqual([{ type: 'actor-eliminated', tick: 2, order: 0, actorId: 'player', hazardId: 'fire-1' }]);
});

test.each([false, true])('player death wins over simultaneous timeout and opponent elimination (shared spawn: %s)', sharedSpawn => {
  const match = createMatch({
    ...config, playerId: 'player',
    actors: sharedSpawn ? [config.actors[0]!, { ...config.actors[1]!, spawnId: 'start' }] : config.actors,
    rules: { tickRate: 10, bombFuseSeconds: 0.1, matchDurationSeconds: 0.1 },
  });
  const events = match.advanceTick([{ actorId: 'player', move: null, bomb: true }]);
  expect(match.readWorld().result).toEqual({ outcome: 'lost', tick: 1 });
  expect(events.at(-1)).toMatchObject({ type: 'match-ended', tick: 1, result: { outcome: 'lost', tick: 1 } });
  const final = match.readWorld();
  expect(match.advanceTick([{ actorId: 'enemy', move: 'left', bomb: true }])).toEqual([]);
  expect(match.readWorld()).toEqual(final);
});

test('victory takes precedence over timeout when the player survives the last opponent elimination', () => {
  const match = createMatch({ ...config, playerId: 'player', rules: { tickRate: 10, bombFuseSeconds: 0.1, matchDurationSeconds: 0.1 } });
  const events = match.advanceTick([{ actorId: 'enemy', move: null, bomb: true }]);
  expect(match.readWorld()).toMatchObject({ result: { outcome: 'won', tick: 1 }, actors: [{ alive: true }, { alive: false }] });
  expect(events.map(event => event.type)).toEqual(['bomb-placed', 'bomb-exploded', 'actor-eliminated', 'match-ended']);
  expect(events.map(event => event.order)).toEqual([0, 1, 2, 3]);
});

test('draw occurs at the rounded timeout boundary and freezes all later rule updates', () => {
  const match = createMatch({ ...config, playerId: 'player', rules: { tickRate: 10, matchDurationSeconds: 0.21 } });
  match.advanceTick();
  match.advanceTick();
  expect(match.readWorld().result).toBeNull();
  expect(match.advanceTick()).toEqual([{ type: 'match-ended', tick: 3, order: 0, result: { outcome: 'draw', tick: 3 } }]);
  const final = match.readWorld();
  expect(match.advanceTick([{ actorId: 'player', move: 'right', bomb: true }])).toEqual([]);
  expect(match.readWorld()).toEqual(final);
});

test('crossing a future explosion before it starts is safe when the moved endpoint is outside the blast', () => {
  const match = createMatch({
    ...config,
    map: { ...config.map, spawns: [{ id: 'start', x: 0, y: 2 }, { id: 'opponent', x: 3, y: 2 }] },
    rules: { tickRate: 10, speed: 50, bombFuseSeconds: 0.1 },
  });
  // The bomb would block a straight crossing, so its owner has the leave permission.
  const events = match.advanceTick([{ actorId: 'enemy', move: 'right', bomb: true }]);
  expect(match.readWorld().actors[1]).toMatchObject({ alive: true, position: { x: 6.7, y: 2.5 } });
  expect(events.map(event => event.type)).toEqual(['bomb-placed', 'bomb-exploded']);
});

test('crossing former fire after its expiration is safe', () => {
  const match = createMatch({
    ...config,
    map: { ...config.map, spawns: [{ id: 'start', x: 0, y: 2 }, { id: 'opponent', x: 3, y: 2 }] },
    rules: { tickRate: 10, speed: 50, bombFuseSeconds: 0.1, fireDurationSeconds: 0.1 },
  });
  match.advanceTick([{ actorId: 'enemy', move: null, bomb: true }]);
  match.advanceTick();
  expect(match.readWorld().hazards).toEqual([]);
  expect(match.advanceTick([{ actorId: 'player', move: 'right' }])).toEqual([]);
  expect(match.readWorld().actors[0]).toMatchObject({ alive: true, position: { x: 5.5, y: 2.5 } });
});

test('expired bombs release capacity while placement still precedes explosions in the current tick', () => {
  const match = createMatch({ ...config, rules: { tickRate: 10, speed: 20, bombFuseSeconds: 0.1 } });
  match.advanceTick([{ actorId: 'player', move: 'right', bomb: true }]);
  const events = match.advanceTick([{ actorId: 'player', move: 'down', bomb: true }]);
  expect(events.map(event => event.type)).toEqual(['bomb-placed', 'bomb-exploded']);
  expect(events[0]).toMatchObject({ bombId: 'bomb-2' });
  expect(match.readWorld().actors[0]?.alive).toBe(true);
});

test('destruction updates later collision without changing the initial semantic map', () => {
  const match = createMatch({
    ...config,
    map: { ...config.map, spawns: [config.map.spawns[0]!, { id: 'opponent', x: 3, y: 1 }], blockers: [{ id: 'gate', type: 'breakable-wall', x: 2, y: 1 }] },
    rules: { tickRate: 10, speed: 10, bombFuseSeconds: 0.1, fireDurationSeconds: 0.1 },
  });
  match.advanceTick([{ actorId: 'player', move: null, bomb: true }]);
  match.advanceTick();
  match.advanceTick([{ actorId: 'enemy', move: 'left' }]);
  expect(match.readWorld().actors[1]).toMatchObject({ alive: true, position: { x: 2.5, y: 1.5 } });
  expect(match.readWorld().blockers).toEqual([]);
  expect(match.readWorld().initialMap.blockers).toHaveLength(1);
});

test('uses the actual corner path instead of a diagonal chord or the rectangle surrounding a turn', () => {
  const match = createMatch({
    ...config,
    map: {
      width: 12, height: 7, ground: Array.from({ length: 84 }, () => 'floor'),
      blockers: [7, 8, 9].map(x => ({ id: `corner-${x}`, type: 'solid-wall', x, y: 2 })),
      spawns: [{ id: 'start', x: 1, y: 1 }, { id: 'opponent', x: 8, y: 3 }],
    },
    rules: { tickRate: 10, speed: 60, bombFuseSeconds: 0.1, fireDurationSeconds: 1, turnTolerance: 0 },
  });
  match.advanceTick([{ actorId: 'player', move: 'right' }, { actorId: 'enemy', move: null, bomb: true }]);
  match.advanceTick([{ actorId: 'player', move: 'down' }]);
  expect(match.readWorld().actors[0]).toMatchObject({ alive: true, position: { x: 10.5, y: 4.5 } });
});

test('recreates frozen bomb, fire, destruction, elimination and result events from the initialization record', () => {
  const source: MatchConfig = {
    ...config, playerId: 'player',
    rules: { tickRate: 10, speed: 10, bombFuseSeconds: 0.3, fireDurationSeconds: 0.2, matchDurationSeconds: 0.5 },
    map: { ...config.map, blockers: [{ id: 'crate', type: 'breakable-wall', x: 1, y: 2 }] },
  };
  const match = createMatch(source);
  const before = match.readWorld();
  const retry = createMatch(before.initialization);
  const path = [
    [{ actorId: 'player', move: 'right' as const, bomb: true }],
    [{ actorId: 'player', move: 'right' as const }],
    [], [], [],
  ];
  for (const intents of path) {
    const events = match.advanceTick(intents);
    expect(retry.advanceTick(intents)).toEqual(events);
    expect(retry.readWorld()).toEqual(match.readWorld());
    if (events[0]) expect(Reflect.set(events[0], 'order', 100)).toBe(false);
  }
  expect(before).toMatchObject({ tick: 0, blockers: [{ id: 'crate' }], bombs: [], hazards: [], result: null });
  expect(match.readWorld()).toMatchObject({ result: { outcome: 'draw', tick: 5 }, blockers: [] });
  expect(Reflect.set(match.readWorld().initialization.rules, 'bombFuseSeconds', 99)).toBe(false);
});

test.each(['bombFuseSeconds', 'fireDurationSeconds', 'matchDurationSeconds'] as const)('rejects invalid %s with an explicit configuration error', key => {
  for (const value of [0, -1, NaN, Infinity, Number.MAX_VALUE, '3', 3n, Symbol('duration')]) {
    const source = { ...config, rules: { [key]: 3 } };
    Reflect.set(source.rules, key, value);
    expect(() => createMatch(source)).toThrowError(expect.objectContaining({ code: 'invalid-config' }));
  }
});

test('rejects invalid player identities and blast ranges before creating a match', () => {
  for (const playerId of ['', 'missing']) {
    expect(() => createMatch({ ...config, playerId })).toThrowError(expect.objectContaining({ code: 'invalid-config' }));
  }
  for (const blastRange of [0, -1, 0.5, Infinity]) {
    expect(() => createMatch({ ...config, rules: { blastRange } })).toThrowError(expect.objectContaining({ code: 'invalid-config' }));
  }
});

test('rejects initialization from the earlier placement-only implementation version', () => {
  const record = structuredClone(createMatch(config).readWorld().initialization);
  Reflect.set(record.versions, 'match', 'basic-bombs-v1');
  expect(() => createMatch(record)).toThrowError(expect.objectContaining({ code: 'invalid-config' }));
});
