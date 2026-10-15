import { expect, test } from 'vitest';
import { createMatch } from '../src/match/index.js';

const config = { seed: 'generated-example', generator: {},
  actors: ['player', 'target-1', 'target-2', 'target-3'].map(id => ({ id, type: 'actor' as const, spawnId: id })),
};

test('creates a seeded semantic arena at the original-game reference scale with four safe corner markers', () => {
  const match = createMatch(config);
  const world = match.readWorld();
  expect(world.initialMap).toMatchObject({ width: 17, height: 15, spawns: [
    { id: 'player', x: 1, y: 1 }, { id: 'target-1', x: 15, y: 1 },
    { id: 'target-2', x: 15, y: 13 }, { id: 'target-3', x: 1, y: 13 },
  ] });
  expect(world.initialMap.ground).toHaveLength(255);
  expect(world.bombs).toEqual([]);
  expect(world.hazards).toEqual([]);
  expect(world.tick).toBe(0);
});

test('replays the complete initialization including attempts and rejects a changed recorded layout', () => {
  const world = createMatch({ ...config, generator: { maxAttempts: 1, blockerChance: 0 } }).readWorld();
  expect(createMatch(JSON.parse(JSON.stringify(world.initialization))).readWorld()).toEqual(world);
  const changed = { ...world.initialization, map: { ...world.initialMap, blockers: world.initialMap.blockers.filter(wall => wall.type === 'solid-wall') } };
  expect(() => createMatch(changed)).toThrow(/record/i);
  const changedReport = { ...world.initialization, generation: { ...world.initialization.generation!, source: 'random' as const } };
  expect(() => createMatch(changedReport)).toThrow(/record/i);
  expect(Object.isFrozen(world.initialization.generation?.spawns[0]?.escape)).toBe(true);
});

test.each([0, 2])('exhausts exactly %s random attempts before validating the resource-bearing base layout', maxAttempts => {
  const world = createMatch({ ...config, generator: { maxAttempts, blockerChance: 0 } }).readWorld();
  expect(world.initialization.generation).toMatchObject({ source: 'fallback', config: { maxAttempts }, attempts: [
    ...Array.from({ length: maxAttempts }, () => ({ source: 'random', failures: expect.arrayContaining(['player:nearby-resources']) })),
    { source: 'fallback', failures: [] },
  ] });
  expect(world.initialization.generation?.spawns.every(proof => proof.nearbyCrates > 0 && proof.escape.length > 0)).toBe(true);
});

test('impossible bomb timing also fails the base layout and returns bounded, reproducible reasons', () => {
  const source = { ...config, generator: { maxAttempts: 2 }, rules: { bombFuseSeconds: 1 / 60, speed: 0.1 } };
  const fail = () => { try { createMatch(source); } catch (error) { return error; } throw new Error('Expected generation failure'); };
  const failure = fail();
  expect(failure).toMatchObject({ code: 'generation-failed', attempts: expect.any(Array) });
  expect(failure).toHaveProperty('attempts.length', 3);
  expect(fail()).toMatchObject(failure!);
});

test('each spawn has measured starting space and an escape witness that survives real bomb stepping', () => {
  const world = createMatch(config).readWorld();
  const generation = world.initialization.generation!;
  expect(generation.spawns).toHaveLength(4);
  for (const proof of generation.spawns) {
    expect(proof.openDirections).toBeGreaterThanOrEqual(2);
    expect(proof.reachableCells).toBeGreaterThanOrEqual(5);
    expect(proof.nearbyCrates).toBeGreaterThanOrEqual(1);
    expect(proof.escape.length).toBeGreaterThan(0);
    const probe = createMatch({ seed: config.seed, map: world.initialMap, rules: world.initialization.rules,
      actors: [{ id: proof.spawnId, type: 'actor', spawnId: proof.spawnId }] });
    for (const [step, move] of proof.escape.entries()) probe.advanceTick([{ actorId: proof.spawnId, move, bomb: step === 0 }]);
    while (probe.readWorld().tick <= 211) probe.advanceTick([{ actorId: proof.spawnId, move: null }]);
    expect(probe.readWorld().actors[0]?.alive).toBe(true);
  }
  expect(new Set(generation.spawns.map(proof => proof.nearbyCrates)).size).toBe(1);
});

test('varied seeds produce symmetric arenas and connected corner markers after clearing crates', () => {
  const layouts = new Set<string>();
  for (let index = 0; index < 12; index++) {
    const world = createMatch({ ...config, seed: `fairness-${index}` }).readWorld();
    const map = world.initialMap;
    const cells = new Map(map.blockers.map(wall => [`${wall.x},${wall.y}`, wall.type]));
    layouts.add(JSON.stringify(map.blockers));
    for (const wall of map.blockers) {
      expect(cells.get(`${map.width - 1 - wall.x},${wall.y}`)).toBe(wall.type);
      expect(cells.get(`${wall.x},${map.height - 1 - wall.y}`)).toBe(wall.type);
    }
    const reached = new Set(['1,1']);
    const queue = [{ x: 1, y: 1 }];
    for (let cursor = 0; cursor < queue.length; cursor++) for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const point = { x: queue[cursor]!.x + dx!, y: queue[cursor]!.y + dy! };
      const key = `${point.x},${point.y}`;
      if (point.x < 0 || point.y < 0 || point.x >= map.width || point.y >= map.height || cells.get(key) === 'solid-wall' || reached.has(key)) continue;
      reached.add(key); queue.push(point);
    }
    for (const spawn of map.spawns) expect(reached.has(`${spawn.x},${spawn.y}`)).toBe(true);
    expect(world.initialization.generation?.spawns.every(proof => proof.openDirections >= 2 && proof.reachableCells >= 5 && proof.nearbyCrates >= 1 && proof.escape.length > 0)).toBe(true);
    expect(new Set(world.initialization.generation?.spawns.map(proof => proof.nearbyCrates)).size).toBe(1);
  }
  expect(layouts.size).toBeGreaterThan(1);
}, 20000);

test('seeded generation and subsequent events reproduce independently of presentation reads', () => {
  const source = { ...config, generator: { width: 9, height: 7 }, playerId: 'player' };
  const first = createMatch(source);
  const replay = createMatch(first.readWorld().initialization);
  const second = createMatch(source);
  for (let tick = 0; tick < 215; tick++) {
    first.readWorld(); first.readWorld();
    const intents = [{ actorId: 'player', move: null, bomb: tick === 0 }];
    expect(first.advanceTick(intents)).toEqual(replay.advanceTick(intents));
    second.advanceTick(intents);
    expect(first.readWorld()).toEqual(replay.readWorld());
    expect(first.readWorld()).toEqual(second.readWorld());
  }
  // A legal initial escape does not prevent a player from choosing to stay in their own blast.
  expect(first.readWorld().result?.outcome).toBe('lost');
});

test.each([{ maxSearchStates: 1 }, { searchHorizonSeconds: 0.01 }])('reports an unconfirmed escape instead of accepting the fallback: %j', limits => {
  expect(() => createMatch({ ...config, generator: { ...limits, maxAttempts: 0 } }))
    .toThrowError(expect.objectContaining({ code: 'generation-failed', attempts: [expect.objectContaining({ source: 'fallback', failures: expect.arrayContaining([expect.stringMatching(/player:(budget-exhausted|no-route)/)]) })] }));
});

test.each([{ width: 8 }, { height: 27 }, { blockerChance: NaN }, { maxAttempts: -1 }, { maxSearchStates: 0 }, { searchHorizonSeconds: Infinity }])('rejects invalid generator settings: %j', generator => {
  expect(() => createMatch({ ...config, generator })).toThrowError(expect.objectContaining({ code: 'invalid-config' }));
});
