import { expect, test } from 'vitest';
import { createMatch, type MatchConfig } from '../src/match/index.js';

const config: MatchConfig = {
  seed: 'chain-example',
  map: {
    width: 9, height: 7, ground: Array.from({ length: 63 }, () => 'floor'), blockers: [],
    spawns: [{ id: 'a', x: 2, y: 3 }, { id: 'b', x: 3, y: 3 }],
  },
  actors: [{ id: 'a', type: 'actor', spawnId: 'a' }, { id: 'b', type: 'actor', spawnId: 'b' }],
  rules: { tickRate: 10, speed: 20, bombFuseSeconds: 0.3, fireDurationSeconds: 0.1, blastRange: 1 },
};

test('fire immediately detonates a later bomb in the same explosion phase', () => {
  const match = createMatch(config);
  match.advanceTick([{ actorId: 'a', move: 'up', bomb: true }]);
  match.advanceTick([{ actorId: 'b', move: 'down', bomb: true }]);
  expect(match.readWorld().bombs.map(bomb => bomb.detonateAtTick)).toEqual([3, 4]);
  const events = match.advanceTick();
  expect(events.filter(event => event.type === 'bomb-exploded').map(event => event.bombId)).toEqual(['bomb-1', 'bomb-2']);
  expect(match.readWorld().bombs).toEqual([]);
  expect(match.readWorld().hazards.map(fire => fire.createdAtTick)).toEqual([3, 3]);
  expect(match.advanceTick().filter(event => event.type === 'bomb-exploded')).toEqual([]);
});

test('same-cell arbitration consumes capacity only for the winner and gives all overlapping actors leave permission', () => {
  const shared: MatchConfig = { ...config, actors: [config.actors[0]!, { ...config.actors[1]!, spawnId: 'a' }] };
  const match = createMatch(shared);
  const events = match.advanceTick([{ actorId: 'a', move: null, bomb: true }, { actorId: 'b', move: null, bomb: true }]);
  expect(events).toHaveLength(1);
  const bomb = match.readWorld().bombs[0]!;
  expect(bomb).toMatchObject({ x: 2, y: 3, exitActorIds: ['a', 'b'] });
  match.advanceTick([{ actorId: 'a', move: 'left' }, { actorId: 'b', move: 'right' }]);
  const loser = bomb.ownerId === 'a' ? 'b' : 'a';
  const next = match.advanceTick([{ actorId: 'a', move: 'up', bomb: true }, { actorId: 'b', move: 'down', bomb: true }]);
  expect(next.filter(event => event.type === 'bomb-placed').map(event => event.actorId)).toEqual([loser]);
  expect(match.readWorld().actors.every(actor => actor.alive)).toBe(true);
});

test('a chain cycle and multiple paths to the same bomb explode each bomb exactly once', () => {
  const source: MatchConfig = {
    ...config,
    map: { ...config.map, spawns: [
      { id: 'a', x: 2, y: 2 }, { id: 'b', x: 3, y: 2 }, { id: 'c', x: 3, y: 3 }, { id: 'd', x: 2, y: 3 },
    ] },
    actors: ['a', 'b', 'c', 'd'].map(id => ({ id, type: 'actor', spawnId: id })),
    rules: { ...config.rules, bombFuseSeconds: 0.5 },
  };
  const match = createMatch(source);
  for (const [actorId, move] of [['a', 'left'], ['b', 'up'], ['c', 'right'], ['d', 'down']] as const) {
    match.advanceTick([{ actorId, move, bomb: true }]);
  }
  const events = match.advanceTick();
  expect(events.map(event => event.type)).toEqual(Array(4).fill('bomb-exploded'));
  expect(events.filter(event => event.type === 'bomb-exploded').map(event => event.bombId)).toEqual(['bomb-1', 'bomb-2', 'bomb-3', 'bomb-4']);
  expect(match.readWorld()).toMatchObject({ bombs: [], actors: [{ alive: true }, { alive: true }, { alive: true }, { alive: true }] });
  expect(match.readWorld().hazards).toHaveLength(4);
  for (let step = 0; step < 3; step++) expect(match.advanceTick()).toEqual([]);
});

test('later chains still see a wall destroyed by this phase, but a later tick uses the cleared corridor', () => {
  // D -> A -> B; D destroys the crate. B must still stop at it before reaching C.
  const source: MatchConfig = {
    ...config,
    map: { ...config.map, blockers: [{ id: 'crate', type: 'breakable-wall', x: 3, y: 3 }], spawns: [
      { id: 'a', x: 2, y: 2 }, { id: 'b', x: 2, y: 3 }, { id: 'c', x: 4, y: 3 }, { id: 'd', x: 3, y: 2 },
    ] },
    actors: ['a', 'b', 'c', 'd'].map(id => ({ id, type: 'actor', spawnId: id })),
    rules: { ...config.rules, bombFuseSeconds: 0.4, blastRange: 2 },
  };
  const match = createMatch(source);
  const initial = match.readWorld();
  match.advanceTick([{ actorId: 'd', move: 'up', bomb: true }]);
  match.advanceTick([{ actorId: 'd', move: 'left' }, { actorId: 'a', move: 'left', bomb: true }, { actorId: 'b', move: 'down', bomb: true }]);
  match.advanceTick([{ actorId: 'a', move: 'up' }, { actorId: 'b', move: 'left' }, { actorId: 'c', move: 'right', bomb: true }]);
  const events = match.advanceTick([{ actorId: 'c', move: 'up' }]);
  expect(events.filter(event => event.type === 'bomb-exploded').map(event => event.bombId)).toEqual(['bomb-1', 'bomb-2', 'bomb-3']);
  expect(events.filter(event => event.type === 'blocker-destroyed')).toHaveLength(1);
  expect(match.readWorld().blockers).toEqual([]);
  expect(match.readWorld().bombs.map(bomb => bomb.id)).toEqual(['bomb-4']);
  expect(match.readWorld().hazards.find(fire => fire.bombId === 'bomb-3')?.cells).toContainEqual({ x: 3, y: 3 });
  expect(match.readWorld().hazards.find(fire => fire.bombId === 'bomb-3')?.cells).not.toContainEqual({ x: 4, y: 3 });
  expect(initial.blockers).toHaveLength(1);
  expect(match.advanceTick()).toEqual([]);
  const later = match.advanceTick();
  expect(later.filter(event => event.type === 'bomb-exploded').map(event => event.bombId)).toEqual(['bomb-4']);
  expect(match.readWorld().hazards[0]?.cells).toContainEqual({ x: 2, y: 3 });
});

test('reversing intents and actor traversal preserves conflict winners and all ordered events', () => {
  const source: MatchConfig = {
    ...config, actors: [config.actors[0]!, { ...config.actors[1]!, spawnId: 'a' }],
    rules: { ...config.rules, bombFuseSeconds: 0.1 },
  };
  const original = createMatch(source);
  const reversed = createMatch({ ...source, actors: [...source.actors].reverse(), map: { ...source.map, spawns: [...source.map.spawns].reverse() } });
  const intents = [{ actorId: 'a', move: null, bomb: true }, { actorId: 'b', move: null, bomb: true }];
  const events = original.advanceTick(intents);
  expect(reversed.advanceTick([...intents].reverse())).toEqual(events);
  expect(events.filter(event => event.type === 'actor-eliminated').map(event => event.actorId)).toEqual(['a', 'b']);
  expect(reversed.readWorld().bombs).toEqual(original.readWorld().bombs);
  expect(reversed.readWorld().hazards).toEqual(original.readWorld().hazards);
});

test('repeated same-cell conflicts use the evolving stream rather than permanent actor priority', () => {
  const match = createMatch({
    ...config, actors: [config.actors[0]!, { ...config.actors[1]!, spawnId: 'a' }],
    rules: { ...config.rules, bombFuseSeconds: 0.1 },
  });
  const winners = new Set<string>();
  for (let round = 0; round < 4; round++) {
    const events = match.advanceTick([{ actorId: 'a', move: 'left', bomb: true }, { actorId: 'b', move: 'right', bomb: true }]);
    const placed = events.find(event => event.type === 'bomb-placed')!;
    winners.add(placed.actorId);
    expect(events.filter(event => event.type === 'bomb-exploded')).toHaveLength(1);
    expect(match.readWorld().actors.every(actor => actor.alive)).toBe(true);
    match.advanceTick();
    match.advanceTick([{ actorId: 'a', move: 'right' }, { actorId: 'b', move: 'left' }]);
  }
  expect([...winners].sort()).toEqual(['a', 'b']);
});

test('seeded winners reproduce after each tick and input permutations do not change the stream', () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 16; seed++) {
    const match = createMatch({ ...config, seed: `conflict-${seed}`, actors: [config.actors[0]!, { ...config.actors[1]!, spawnId: 'a' }] });
    const retry = createMatch(match.readWorld().initialization);
    const actions = [
      [{ actorId: 'a', move: null, bomb: true }, { actorId: 'b', move: null, bomb: true }],
      [{ actorId: 'a', move: 'left' as const }, { actorId: 'b', move: 'right' as const }],
      [], [],
    ];
    for (const intents of actions) {
      const events = match.advanceTick(intents);
      expect(retry.advanceTick([...intents].reverse())).toEqual(events);
      expect(retry.readWorld()).toEqual(match.readWorld());
      const placed = events.find(event => event.type === 'bomb-placed');
      if (placed) seen.add(placed.actorId);
    }
  }
  expect([...seen].sort()).toEqual(['a', 'b']);
});

test('solo placements, invalid intents and state reads do not consume the conflict random stream', () => {
  const source: MatchConfig = {
    ...config, actors: [config.actors[0]!, { ...config.actors[1]!, spawnId: 'a' }],
    rules: { ...config.rules, bombFuseSeconds: 0.1 },
  };
  const baseline = createMatch(source);
  const extra = createMatch({
    ...source,
    map: { ...source.map, spawns: [...source.map.spawns, { id: 'solo', x: 6, y: 0 }] },
    actors: [...source.actors, { id: 'solo', type: 'actor', spawnId: 'solo' }],
  });
  expect(() => extra.advanceTick([{ actorId: 'unknown', move: null, bomb: true }])).toThrowError(expect.objectContaining({ code: 'invalid-intent' }));
  for (let count = 0; count < 5; count++) extra.readWorld();
  for (let round = 0; round < 4; round++) {
    const intents = [{ actorId: 'a', move: 'left' as const, bomb: true }, { actorId: 'b', move: 'right' as const, bomb: true }];
    const normal = baseline.advanceTick(intents).find(event => event.type === 'bomb-placed')!;
    const extraIntents = round === 0 ? [...intents, { actorId: 'solo', move: 'left' as const, bomb: true }] : intents;
    const other = extra.advanceTick(extraIntents).filter(event => event.type === 'bomb-placed').find(event => event.actorId !== 'solo')!;
    expect(other.actorId).toBe(normal.actorId);
    baseline.advanceTick(); extra.advanceTick();
    const regroup = [{ actorId: 'a', move: 'right' as const }, { actorId: 'b', move: 'left' as const }];
    baseline.advanceTick(regroup); extra.advanceTick(regroup);
  }
});

test('capacity and occupied-cell failures do not consume the random stream before a later contest', () => {
  const source: MatchConfig = { ...config, actors: [config.actors[0]!, { ...config.actors[1]!, spawnId: 'a' }] };
  const baseline = createMatch(source);
  const rejected = createMatch(source);
  const request = [{ actorId: 'a', move: null, bomb: true }, { actorId: 'b', move: null, bomb: true }];
  expect(rejected.advanceTick(request)).toEqual(baseline.advanceTick(request));
  const leave = [{ actorId: 'a', move: 'left' as const }, { actorId: 'b', move: 'right' as const }];
  expect(rejected.advanceTick(leave.map(intent => ({ ...intent, bomb: true })))).toEqual([]);
  expect(baseline.advanceTick(leave)).toEqual([]);
  for (let step = 0; step < 2; step++) expect(rejected.advanceTick()).toEqual(baseline.advanceTick());
  const regroup = [{ actorId: 'a', move: 'right' as const }, { actorId: 'b', move: 'left' as const }];
  expect(rejected.advanceTick(regroup)).toEqual(baseline.advanceTick(regroup));
  expect(rejected.advanceTick(request)).toEqual(baseline.advanceTick(request));
  expect(rejected.readWorld()).toEqual(baseline.readWorld());
});

test('two recurring conflict cells do not lock either cell to the same actor through low random bits', () => {
  const source: MatchConfig = {
    ...config,
    map: { ...config.map, width: 12, ground: Array.from({ length: 84 }, () => 'floor'), spawns: [{ id: 'west', x: 2, y: 3 }, { id: 'east', x: 8, y: 3 }] },
    actors: [
      { id: 'a', type: 'actor', spawnId: 'west' }, { id: 'b', type: 'actor', spawnId: 'west' },
      { id: 'c', type: 'actor', spawnId: 'east' }, { id: 'd', type: 'actor', spawnId: 'east' },
    ],
    rules: { ...config.rules, bombFuseSeconds: 0.1 },
  };
  const match = createMatch(source);
  const winners = new Set<string>();
  for (let round = 0; round < 16; round++) {
    const events = match.advanceTick([
      { actorId: 'a', move: 'left', bomb: true }, { actorId: 'b', move: 'right', bomb: true },
      { actorId: 'c', move: 'left', bomb: true }, { actorId: 'd', move: 'right', bomb: true },
    ]);
    for (const event of events.filter(event => event.type === 'bomb-placed')) winners.add(event.actorId);
    expect(match.readWorld().actors.every(actor => actor.alive)).toBe(true);
    match.advanceTick();
    match.advanceTick([
      { actorId: 'a', move: 'right' }, { actorId: 'b', move: 'left' },
      { actorId: 'c', move: 'right' }, { actorId: 'd', move: 'left' },
    ]);
  }
  expect([...winners].sort()).toEqual(['a', 'b', 'c', 'd']);
});

test('two simultaneously due bombs can reach a third bomb without duplicate explosions or hazards', () => {
  const match = createMatch({
    ...config,
    map: { ...config.map, spawns: [{ id: 'a', x: 2, y: 3 }, { id: 'b', x: 4, y: 3 }, { id: 'c', x: 3, y: 3 }] },
    actors: ['a', 'b', 'c'].map(id => ({ id, type: 'actor', spawnId: id })),
  });
  match.advanceTick([{ actorId: 'b', move: 'down', bomb: true }, { actorId: 'a', move: 'up', bomb: true }]);
  match.advanceTick([{ actorId: 'c', move: 'up', bomb: true }]);
  const events = match.advanceTick();
  expect(events.filter(event => event.type === 'bomb-exploded').map(event => event.bombId)).toEqual(['bomb-1', 'bomb-2', 'bomb-3']);
  expect(events.map(event => event.order)).toEqual([0, 1, 2]);
  expect(match.readWorld().hazards).toHaveLength(3);
  expect(match.readWorld().bombs).toEqual([]);
  expect(match.advanceTick()).toEqual([]);
});

test('three-player same-cell arbitration chooses one eligible actor and grants leave permission to non-requesters too', () => {
  const match = createMatch({
    ...config,
    actors: ['a', 'b', 'c', 'spectator'].map(id => ({ id, type: 'actor', spawnId: 'a' })),
  });
  const events = match.advanceTick([
    { actorId: 'c', move: null, bomb: true }, { actorId: 'b', move: null, bomb: true }, { actorId: 'a', move: null, bomb: true },
  ]);
  expect(events).toHaveLength(1);
  const bomb = match.readWorld().bombs[0]!;
  expect(['a', 'b', 'c']).toContain(bomb.ownerId);
  expect(bomb.exitActorIds).toEqual(['a', 'b', 'c', 'spectator']);
  match.advanceTick([{ actorId: 'spectator', move: 'left' }]);
  expect(match.readWorld().actors[3]?.position.x).toBe(0.5);
  expect(match.readWorld().bombs[0]?.exitActorIds).not.toContain('spectator');
});

test('rejects initialization recorded before chain and arbitration semantics were implemented', () => {
  const record = structuredClone(createMatch(config).readWorld().initialization);
  Reflect.set(record.versions, 'match', 'basic-bombs-v2');
  expect(() => createMatch(record)).toThrowError(expect.objectContaining({ code: 'invalid-config' }));
});

test('simultaneous roots and chained destruction stay identical when map objects, actors, and intents are reversed', () => {
  const source: MatchConfig = {
    ...config,
    map: { ...config.map, blockers: [{ id: 'crate', type: 'breakable-wall', x: 3, y: 2 }, { id: 'solid', type: 'solid-wall', x: 3, y: 4 }], spawns: [
      { id: 'a', x: 2, y: 3 }, { id: 'b', x: 4, y: 3 }, { id: 'c', x: 3, y: 3 },
    ] },
    actors: ['a', 'b', 'c'].map(id => ({ id, type: 'actor', spawnId: id })),
  };
  const normal = createMatch(source);
  const reversed = createMatch({ ...source, actors: [...source.actors].reverse(), map: { ...source.map, spawns: [...source.map.spawns].reverse(), blockers: [...source.map.blockers].reverse() } });
  const steps = [
    [{ actorId: 'a', move: 'up' as const, bomb: true }, { actorId: 'b', move: 'down' as const, bomb: true }],
    [{ actorId: 'c', move: 'up' as const, bomb: true }], [], [],
  ];
  for (const intents of steps) {
    const events = normal.advanceTick(intents);
    expect(reversed.advanceTick([...intents].reverse())).toEqual(events);
    expect(reversed.readWorld().bombs).toEqual(normal.readWorld().bombs);
    expect(reversed.readWorld().hazards).toEqual(normal.readWorld().hazards);
    expect(reversed.readWorld().actors.map(actor => [actor.id, actor.alive, actor.position]).sort()).toEqual(normal.readWorld().actors.map(actor => [actor.id, actor.alive, actor.position]).sort());
  }
  expect(normal.readWorld().blockers.map(wall => wall.id)).toEqual(['solid']);
  expect(reversed.readWorld().blockers.map(wall => wall.id)).toEqual(['solid']);
});
