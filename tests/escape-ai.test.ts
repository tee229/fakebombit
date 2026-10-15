import { expect, test } from 'vitest';
import { createMatch, type MatchConfig } from '../src/match/index.js';

const config: MatchConfig = { seed: 'escape-example',
  map: { width: 9, height: 7, ground: Array.from({ length: 63 }, () => 'floor'), blockers: [],
    spawns: [{ id: 'player', x: 3, y: 3 }, { id: 'enemy', x: 4, y: 3 }] },
  actors: [{ id: 'player', type: 'actor', spawnId: 'player' }, { id: 'enemy', type: 'actor', spawnId: 'enemy', ai: {} }],
  rules: { tickRate: 10, speed: 3, bombFuseSeconds: 1, blastRange: 2, fireDurationSeconds: 0.2 },
};

test('an internal AI respects reaction delay and escapes known fire using ordinary movement', () => {
  const match = createMatch(config);
  const start = match.readWorld().actors[1]!.position;
  match.advanceTick([{ actorId: 'player', move: 'left', bomb: true }]);
  match.advanceTick([{ actorId: 'player', move: 'left' }]);
  match.advanceTick([{ actorId: 'player', move: 'left' }]);
  expect(match.readWorld().actors[1]?.position).toEqual(start);
  match.advanceTick([{ actorId: 'player', move: 'up' }]);
  expect(match.readWorld().actors[1]?.position).not.toEqual(start);
  // Allow the configured observation delay after the fire disappears as well.
  for (let step = 0; step < 11; step++) match.advanceTick();
  expect(match.readWorld().actors[1]).toMatchObject({ alive: true, ai: { status: 'safe' } });
  expect(match.readWorld().actors[1]?.abilities.speed).toBe(3);
  expect(match.readWorld().bombs).toEqual([]);
  expect(match.readWorld().hazards).toEqual([]);
});

test('default 60 Hz reaction and bounded planning can escape without changing movement speed', () => {
  const match = createMatch({ ...config, rules: { blastRange: 2 } });
  match.advanceTick([{ actorId: 'player', move: null, bomb: true }]);
  for (let step = 0; step < 230; step++) {
    match.advanceTick();
    expect(match.readWorld().actors[1]?.ai?.searchedStates).toBeLessThanOrEqual(6000);
  }
  expect(match.readWorld().actors[1]).toMatchObject({ alive: true, ai: { status: 'safe' }, abilities: { speed: 3 } });
});

test.each([false, true])('no confirmed route causes a conservative stop and no bombing (budget exhausted: %s)', limited => {
  const match = createMatch({ ...config,
    actors: [config.actors[0]!, { ...config.actors[1]!, ai: limited ? { maxSearchStates: 1 } : {} }],
    map: { ...config.map, blockers: [[4, 2], [5, 3], [4, 4]].map(([x, y], i) => ({ id: `wall-${i}`, type: 'solid-wall', x: x!, y: y! })) },
  });
  const start = match.readWorld().actors[1]!.position;
  match.advanceTick([{ actorId: 'player', move: null, bomb: true }]);
  for (let i = 0; i < 3; i++) match.advanceTick();
  expect(match.readWorld().actors[1]).toMatchObject({ position: start, ai: { status: limited ? 'budget-exhausted' : 'no-route' } });
  expect(match.readWorld().bombs.every(bomb => bomb.ownerId === 'player')).toBe(true);
  for (let i = 0; i < 7; i++) match.advanceTick();
  expect(match.readWorld().actors[1]).toMatchObject({ alive: false, ai: { status: 'eliminated' } });
});

test('external intents cannot override an AI or mutate controller state on rejection', () => {
  const match = createMatch(config);
  const before = match.readWorld();
  expect(() => match.advanceTick([{ actorId: 'enemy', move: 'right', bomb: true }])).toThrowError(expect.objectContaining({ code: 'invalid-intent' }));
  expect(match.readWorld()).toEqual(before);
});

test('AI waits through the fire expiration boundary, then exits an overlapping bomb before its explosion', () => {
  const match = createMatch({ ...config,
    map: { ...config.map, spawns: [{ id: 'player', x: 3, y: 3 }, { id: 'enemy', x: 1, y: 3 }],
      blockers: [{ id: 'crate', type: 'breakable-wall', x: 2, y: 3 },
        ...[[0, 3], [1, 2], [1, 4]].map(([x, y], i) => ({ id: `wall-${i}`, type: 'solid-wall' as const, x: x!, y: y! }))] },
    actors: [config.actors[0]!, { ...config.actors[1]!, ai: { reactionSeconds: 0 } }, { id: 'bomber', type: 'actor', spawnId: 'enemy' }],
    rules: { tickRate: 10, speed: 20, bombFuseSeconds: 0.3, fireDurationSeconds: 0.3, blastRange: 1 },
  });
  match.advanceTick([{ actorId: 'player', move: 'up', bomb: true }]);
  for (let i = 0; i < 3; i++) match.advanceTick();
  match.advanceTick([{ actorId: 'bomber', move: null, bomb: true }]);
  expect(match.readWorld().bombs[0]?.exitActorIds).toContain('enemy');
  match.advanceTick();
  expect(match.readWorld().actors[1]).toMatchObject({ alive: true, position: { x: 1.5, y: 3.5 }, ai: { status: 'escaping' } });
  expect(match.readWorld().hazards).toEqual([]);
  match.advanceTick();
  expect(match.readWorld().actors[1]).toMatchObject({ alive: true, position: { x: 3.5, y: 3.5 } });
  expect(match.readWorld().hazards[0]?.createdAtTick).toBe(7);
});

test('configured decision cadence limits replanning even when the bomb is already known', () => {
  const match = createMatch({ ...config, actors: [config.actors[0]!, { ...config.actors[1]!, ai: { reactionSeconds: 0, decisionIntervalSeconds: 0.5 } }] });
  match.advanceTick([{ actorId: 'player', move: null, bomb: true }]);
  for (let i = 0; i < 4; i++) match.advanceTick();
  expect(match.readWorld().actors[1]).toMatchObject({ position: { x: 4.5, y: 3.5 }, ai: { decisionTick: 0 } });
  match.advanceTick();
  expect(match.readWorld().actors[1]?.position).not.toEqual({ x: 4.5, y: 3.5 });
  expect(match.readWorld().actors[1]?.ai?.decisionTick).toBe(5);
});

test('new bomb information discards a stale route and respects reaction delay before planning again', () => {
  const match = createMatch({ ...config, rules: { ...config.rules, bombCapacity: 2 } });
  match.advanceTick([{ actorId: 'player', move: 'left', bomb: true }]);
  match.advanceTick([{ actorId: 'player', move: 'left' }]);
  match.advanceTick([{ actorId: 'player', move: 'left' }]);
  match.advanceTick([{ actorId: 'player', move: 'up', bomb: true }]);
  const position = match.readWorld().actors[1]!.position;
  match.advanceTick(); match.advanceTick();
  expect(match.readWorld().actors[1]).toMatchObject({ position, ai: { status: 'observing', remainingSteps: 0 } });
  match.advanceTick();
  expect(match.readWorld().actors[1]?.position).not.toEqual(position);
});

test('AI observes tick-start facts rather than this step’s new player actions', () => {
  const source = { ...config, actors: [config.actors[0]!, { ...config.actors[1]!, ai: { reactionSeconds: 0 } }], rules: { ...config.rules, bombCapacity: 2 } };
  const left = createMatch(source), right = createMatch(source);
  const initial = [{ actorId: 'player', move: 'left' as const, bomb: true }];
  left.advanceTick(initial); right.advanceTick(initial);
  left.advanceTick([{ actorId: 'player', move: 'left' }]); right.advanceTick([{ actorId: 'player', move: 'left' }]);
  left.advanceTick([{ actorId: 'player', move: 'left', bomb: true }]);
  right.advanceTick([{ actorId: 'player', move: 'right' }]);
  expect(left.readWorld().actors[1]).toEqual(right.readWorld().actors[1]);
  expect(left.readWorld().bombs).toHaveLength(2);
  expect(right.readWorld().bombs).toHaveLength(1);
});

test('AI initialization, frozen diagnostics and gameplay reproduce under reordered actors and external inputs', () => {
  const original = createMatch(config);
  const record = original.readWorld().initialization;
  const replay = createMatch({ ...record, actors: [...record.actors].reverse() });
  expect(record.actors[1]?.ai).toEqual({ reactionSeconds: 0.2, decisionIntervalSeconds: 0.1, maxSearchStates: 6000, searchHorizonSeconds: 6 });
  for (let tick = 0; tick < 15; tick++) {
    const intents = [{ actorId: 'player', move: tick < 3 ? 'left' as const : null, bomb: tick === 0 }];
    expect(replay.advanceTick([...intents].reverse())).toEqual(original.advanceTick(intents));
    expect(replay.readWorld().actors.find(actor => actor.id === 'enemy')).toEqual(original.readWorld().actors[1]);
    expect(Object.isFrozen(original.readWorld().actors[1]?.ai)).toBe(true);
  }
});

test.each([{ reactionSeconds: -1 }, { decisionIntervalSeconds: 0 }, { maxSearchStates: 0 }, { maxSearchStates: 1.5 }, { searchHorizonSeconds: Infinity }, { reactionSeconds: NaN }])('rejects invalid AI settings: %j', ai => {
  expect(() => createMatch({ ...config, actors: [config.actors[0]!, { ...config.actors[1]!, ai }] })).toThrowError(expect.objectContaining({ code: 'invalid-config' }));
});

test.each([true, false])('escape planning preserves bomb leave permission without granting it to outsiders (overlap: %s)', overlap => {
  const match = createMatch({ ...config,
    map: { ...config.map, spawns: [{ id: 'player', x: overlap ? 1 : 2, y: 3 }, { id: 'enemy', x: 1, y: 3 }],
      blockers: [[0, 3], [1, 2], [1, 4]].map(([x, y], i) => ({ id: `wall-${i}`, type: 'solid-wall', x: x!, y: y! })) },
    actors: [config.actors[0]!, { ...config.actors[1]!, ai: { reactionSeconds: 0 } }],
    rules: { tickRate: 10, speed: 20, bombFuseSeconds: 0.3, fireDurationSeconds: 0.2, blastRange: 1 },
  });
  match.advanceTick([{ actorId: 'player', move: null, bomb: true }]);
  match.advanceTick();
  if (!overlap) expect(match.readWorld().actors[1]).toMatchObject({ position: { x: 1.5, y: 3.5 }, ai: { status: 'no-route' } });
  for (let i = 0; i < 4; i++) match.advanceTick();
  expect(match.readWorld().actors[1]?.alive).toBe(overlap);
});

test.each([0.1, 3])('route feasibility uses the configured movement speed (%s cells/second)', speed => {
  const match = createMatch({ ...config, rules: { ...config.rules, speed }, actors: [config.actors[0]!, { ...config.actors[1]!, ai: { reactionSeconds: 0 } }] });
  match.advanceTick([{ actorId: 'player', move: null, bomb: true }]);
  for (let i = 0; i < 12; i++) match.advanceTick();
  expect(match.readWorld().actors[1]?.alive).toBe(speed === 3);
});
