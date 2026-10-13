import { expect, test } from 'vitest';
import { createMatch, type Blocker } from '../src/match/index.js';

const map = {
  width: 5, height: 3,
  ground: Array.from({ length: 15 }, () => 'floor' as const),
  blockers: [] as Blocker[],
  spawns: [{ id: 'start', x: 1, y: 1 }],
};
const config = { seed: 'movement-example', map, actors: [{ id: 'player', type: 'actor' as const, spawnId: 'start' }] };

test('creates the fixed semantic map and advances a continuous cardinal move by one logical tick', () => {
  const match = createMatch(config);
  expect(match.readWorld().actors[0]?.position).toEqual({ x: 1.5, y: 1.5 });
  expect(match.advanceTick([{ actorId: 'player', move: 'right' }])).toEqual([]);
  expect(match.readWorld()).toMatchObject({ tick: 1, actors: [{ id: 'player', position: { x: 1.55, y: 1.5 }, previousPosition: { x: 1.5, y: 1.5 } }] });
});

test.each(['solid-wall', 'breakable-wall'] as const)('continuous movement stops at a %s without tunneling', type => {
  const match = createMatch({ ...config, map: { ...map, width: 7, ground: Array.from({ length: 21 }, () => 'floor' as const), blockers: [{ id: 'obstacle', type, x: 3, y: 1 }] }, rules: { speed: 120 } });
  match.advanceTick([{ actorId: 'player', move: 'right' }]);
  expect(match.readWorld().actors[0]?.position).toEqual({ x: 2.7, y: 1.5 });
  match.advanceTick([{ actorId: 'player', move: 'right' }]);
  expect(match.readWorld().actors[0]?.position).toEqual({ x: 2.7, y: 1.5 });
});

test('actors pass through each other and map edges stop all four cardinal directions', () => {
  const match = createMatch({ ...config, actors: [...config.actors, { id: 'other', type: 'actor', spawnId: 'start' }], rules: { speed: 60 } });
  match.advanceTick([{ actorId: 'player', move: 'right' }, { actorId: 'other', move: 'left' }]);
  expect(match.readWorld().actors.map(actor => actor.position)).toEqual([{ x: 2.5, y: 1.5 }, { x: 0.5, y: 1.5 }]);
  for (const direction of ['up', 'right', 'down', 'left'] as const) {
    const edge = createMatch({ ...config, rules: { speed: 600 } });
    edge.advanceTick([{ actorId: 'player', move: direction }]);
    expect(edge.readWorld().actors[0]?.position).toEqual({
      up: { x: 1.5, y: 0.3 }, right: { x: 4.7, y: 1.5 }, down: { x: 1.5, y: 2.7 }, left: { x: 0.3, y: 1.5 },
    }[direction]);
  }
});

test('freezes initialization and detached world snapshots without freezing caller data', () => {
  const source = structuredClone(config);
  const match = createMatch(source);
  const before = match.readWorld();
  expect(Reflect.set(before.actors[0]!.position, 'x', 99)).toBe(false);
  source.map.spawns[0]!.x = 3;
  source.map.blockers.push({ id: 'late-wall', type: 'solid-wall', x: 2, y: 1 });
  match.advanceTick([{ actorId: 'player', move: 'right' }]);
  expect(before.actors[0]?.position).toEqual({ x: 1.5, y: 1.5 });
  expect(match.readWorld()).toMatchObject({ initialMap: { spawns: [{ x: 1 }], blockers: [] }, actors: [{ position: { x: 1.55, y: 1.5 } }] });
});


const cornerMap = {
  width: 5, height: 5,
  ground: Array.from({ length: 25 }, () => 'floor' as const),
  blockers: [{ id: 'inside-corner', type: 'solid-wall' as const, x: 1, y: 2 }],
  spawns: [{ id: 'start', x: 1, y: 1 }],
};

test('buffers an early turn until the open corner and consumes leftover tick travel in the new direction', () => {
  const match = createMatch({ ...config, map: cornerMap, rules: { tickRate: 10, speed: 3, turnBufferTicks: 3, turnTolerance: 0 } });
  match.advanceTick([{ actorId: 'player', move: 'right' }]);
  match.advanceTick([{ actorId: 'player', move: 'right' }]);
  match.advanceTick([{ actorId: 'player', move: 'down' }]);
  expect(match.readWorld().actors[0]?.position.x).toBeCloseTo(2.4);
  expect(match.readWorld().actors[0]?.position.y).toBe(1.5);
  match.advanceTick();
  expect(match.readWorld().actors[0]?.position.x).toBe(2.5);
  expect(match.readWorld().actors[0]?.position.y).toBeCloseTo(1.7);
  expect(match.readWorld().actors[0]?.heading).toBe('down');
});

test('position tolerance snaps a near-center turn while a smaller tolerance waits for the center', () => {
  for (const [tolerance, expectedY] of [[0.12, 1.8], [0.05, 1.7]] as const) {
    const match = createMatch({ ...config, map: cornerMap, rules: { tickRate: 10, speed: 3, turnTolerance: tolerance } });
    for (let tick = 0; tick < 3; tick++) match.advanceTick([{ actorId: 'player', move: 'right' }]);
    match.advanceTick([{ actorId: 'player', move: 'down' }]);
    expect(match.readWorld().actors[0]?.position.x).toBe(2.5);
    expect(match.readWorld().actors[0]?.position.y).toBeCloseTo(expectedY);
  }
});

test('expires an early turn after its configured tick window and lets explicit release cancel it', () => {
  const expired = createMatch({ ...config, map: cornerMap, rules: { tickRate: 10, speed: 3, turnBufferTicks: 0, turnTolerance: 0 } });
  expired.advanceTick([{ actorId: 'player', move: 'right' }]);
  expired.advanceTick([{ actorId: 'player', move: 'right' }]);
  expired.advanceTick([{ actorId: 'player', move: 'down' }]);
  expired.advanceTick();
  expect(expired.readWorld().actors[0]?.position).toEqual({ x: 2.4, y: 1.5 });
  const cancelled = createMatch({ ...config, map: cornerMap, rules: { tickRate: 10, speed: 3, turnBufferTicks: 8, turnTolerance: 0 } });
  cancelled.advanceTick([{ actorId: 'player', move: 'right' }]);
  cancelled.advanceTick([{ actorId: 'player', move: 'down' }]);
  cancelled.advanceTick([{ actorId: 'player', move: null }]);
  cancelled.advanceTick();
  expect(cancelled.readWorld().actors[0]?.position).toEqual({ x: 2.1, y: 1.5 });
});

test('rejects invalid configuration with an explicit category', () => {
  expect(() => createMatch({ ...config, rules: { tickRate: 0 } })).toThrowError(expect.objectContaining({ code: 'invalid-config' }));
});

test.each([
  { speed: 0 }, { speed: Number.NaN }, { speed: Number.POSITIVE_INFINITY },
  { radius: 0 }, { radius: 0.5 }, { turnTolerance: -0.1 }, { turnTolerance: 0.5 },
  { turnBufferTicks: -1 }, { turnBufferTicks: 1.5 }, { tickRate: 1.5 },
])('rejects movement rules outside the documented ranges: %j', rules => {
  expect(() => createMatch({ ...config, rules })).toThrowError(expect.objectContaining({ code: 'invalid-config' }));
});

test('rejects malformed configuration and unsupported rule keys rather than relying on TypeScript callers', () => {
  const unexpectedRule = { ...config, rules: { speed: 3 } };
  Reflect.set(unexpectedRule.rules, 'gravity', 9);
  const malformed = structuredClone(config);
  Reflect.set(malformed, 'actors', null);
  for (const source of [{ ...config, seed: '' }, unexpectedRule, malformed]) {
    expect(() => createMatch(source)).toThrowError(expect.objectContaining({ code: 'invalid-config' }));
  }
});

test('rejects unknown entity types in both initial blockers and actor configuration', () => {
  const unknownWall = { ...config, map: { ...map, blockers: [{ id: 'mystery', type: 'solid-wall' as const, x: 3, y: 1 }] } };
  Reflect.set(unknownWall.map.blockers[0]!, 'type', 'portal');
  const unknownActor = structuredClone(config);
  Reflect.set(unknownActor.actors[0]!, 'type', 'ghost');
  for (const source of [unknownWall, unknownActor]) {
    expect(() => createMatch(source)).toThrowError(expect.objectContaining({ code: 'unknown-entity-type' }));
  }
});


test.each([
  ['zero map width', (source: typeof config) => { source.map.width = 0; }],
  ['wrong ground length', (source: typeof config) => { source.map.ground.pop(); }],
  ['unknown ground', (source: typeof config) => { Reflect.set(source.map.ground, '0', 'water'); }],
  ['fractional blocker cell', (source: typeof config) => { source.map.blockers.push({ id: 'wall', type: 'solid-wall', x: 2.1, y: 1 }); }],
  ['outside blocker', (source: typeof config) => { source.map.blockers.push({ id: 'wall', type: 'solid-wall', x: 5, y: 1 }); }],
  ['overlapping blockers', (source: typeof config) => { source.map.blockers.push({ id: 'one', type: 'solid-wall', x: 3, y: 1 }, { id: 'two', type: 'breakable-wall', x: 3, y: 1 }); }],
  ['duplicate blocker identity', (source: typeof config) => { source.map.blockers.push({ id: 'same', type: 'solid-wall', x: 3, y: 1 }, { id: 'same', type: 'breakable-wall', x: 4, y: 1 }); }],
  ['blocked spawn', (source: typeof config) => { source.map.blockers.push({ id: 'wall', type: 'solid-wall', x: 1, y: 1 }); }],
  ['missing spawn', (source: typeof config) => { source.map.spawns.length = 0; }],
  ['outside spawn', (source: typeof config) => { source.map.spawns[0]!.x = -1; }],
  ['duplicate spawn identity', (source: typeof config) => { source.map.spawns.push({ id: 'start', x: 2, y: 1 }); }],
  ['malformed map', (source: typeof config) => { Reflect.set(source, 'map', null); }],
  ['malformed blocker', (source: typeof config) => { Reflect.set(source.map.blockers, '0', null); }],
])('rejects invalid initial semantic map: %s', (_name, change) => {
  const source = structuredClone(config);
  change(source);
  expect(() => createMatch(source)).toThrowError(expect.objectContaining({ code: 'invalid-map' }));
});

test('rejects malformed and duplicate actor identities before creating a world', () => {
  const malformed = structuredClone(config);
  Reflect.set(malformed.actors, '0', null);
  const duplicate = { ...config, actors: [...config.actors, ...config.actors] };
  const collision = { ...config, map: { ...map, blockers: [{ id: 'player', type: 'solid-wall' as const, x: 3, y: 1 }] } };
  for (const source of [malformed, duplicate, collision]) {
    expect(() => createMatch(source)).toThrowError(expect.objectContaining({ code: 'invalid-config' }));
  }
});

test('rejects invalid intents atomically without advancing the logical tick or moving valid actors', () => {
  const match = createMatch(config);
  const badDirection = { actorId: 'player', move: 'right' as const };
  Reflect.set(badDirection, 'move', 'diagonal');
  for (const intents of [
    [{ actorId: 'missing', move: 'right' as const }],
    [{ actorId: 'player', move: 'right' as const }, { actorId: 'player', move: 'left' as const }],
    [badDirection],
  ]) {
    expect(() => match.advanceTick(intents)).toThrowError(expect.objectContaining({ code: 'invalid-intent' }));
    expect(match.readWorld()).toMatchObject({ tick: 0, actors: [{ position: { x: 1.5, y: 1.5 } }] });
  }
});

test('recreates the same world after every tick from the frozen initialization record', () => {
  const source = { ...config, map: cornerMap, rules: { tickRate: 10, speed: 3, turnTolerance: 0, turnBufferTicks: 3 } };
  const first = createMatch(source);
  const record = first.readWorld().initialization;
  expect(record).toMatchObject({ seed: 'movement-example', rules: { tickRate: 10, speed: 3 }, versions: { match: 'chain-bombs-v1', map: 'fixed-map-v1', generator: 'none', ai: 'none' }, actors: config.actors });
  const retry = createMatch(record);
  source.rules.speed = 99;
  const path = ['right', 'right', 'down', undefined, 'down', 'down', 'left', null] as const;
  for (const move of path) {
    const intents = move === undefined ? [] : [{ actorId: 'player', move }];
    first.advanceTick(intents);
    retry.advanceTick(intents);
    expect(retry.readWorld()).toEqual(first.readWorld());
  }
  expect(record.rules.speed).toBe(3);
});

test('rejects a recorded initialization that requires another implementation version', () => {
  const record = structuredClone(createMatch(config).readWorld().initialization);
  Reflect.set(record.versions, 'match', 'future-movement');
  expect(() => createMatch(record)).toThrowError(expect.objectContaining({ code: 'invalid-config' }));
});

test('begins moving toward an adjacent wall and stops at collision contact rather than the cell center', () => {
  const match = createMatch({ ...config, map: { ...map, blockers: [{ id: 'nearby', type: 'solid-wall', x: 2, y: 1 }] } });
  for (let tick = 0; tick < 10; tick++) match.advanceTick([{ actorId: 'player', move: 'right' }]);
  expect(match.readWorld().actors[0]?.position).toEqual({ x: 1.7, y: 1.5 });
});

test('rejects a length-correct sparse ground layer instead of accepting missing floor cells', () => {
  const source = structuredClone(config);
  source.map.ground = new Array<'floor'>(15);
  expect(() => createMatch(source)).toThrowError(expect.objectContaining({ code: 'invalid-map' }));
});

test('does not retain or freeze caller annotations outside the semantic actor contract', () => {
  const note = { text: 'caller annotation' };
  const actor = { ...config.actors[0]!, note };
  const match = createMatch({ ...config, actors: [actor] });
  expect(Object.isFrozen(note)).toBe(false);
  note.text = 'edited outside the match';
  expect(match.readWorld().initialization.actors[0]).toEqual({ id: 'player', type: 'actor', spawnId: 'start' });
});
