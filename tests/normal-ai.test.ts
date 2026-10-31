import { expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { createMatch, type GameplayEvent, type MatchConfig } from '../src/match/index.js';

const config: MatchConfig = { seed: 'normal-ai-example',
  map: { width: 9, height: 7, ground: Array.from({ length: 63 }, () => 'floor'),
    blockers: [{ id: 'crate', type: 'breakable-wall', x: 5, y: 3 }],
    spawns: [{ id: 'player', x: 0, y: 0 }, { id: 'enemy', x: 4, y: 3 }] },
  actors: [{ id: 'player', type: 'actor', spawnId: 'player' }, { id: 'enemy', type: 'actor', spawnId: 'enemy', ai: { mode: 'normal' } }],
  rules: { tickRate: 10, speed: 3, bombFuseSeconds: 1, fireDurationSeconds: 0.2 },
};

test('phone performance seed retains every world and event through bounded searches and the final result', () => {
  const match = createMatch({ seed: 'mvwjl64d-10z4216-1', generator: {}, playerId: 'player',
    actors: ['player', 'target-1', 'target-2', 'target-3'].map(id => ({ id, type: 'actor' as const, spawnId: id,
      ...(id === 'player' ? {} : { ai: { mode: 'normal' as const } }) })) });
  const hash = createHash('sha256');
  while (match.readWorld().tick < 4500 && !match.readWorld().result) {
    const events = match.advanceTick([]); hash.update(JSON.stringify([match.readWorld(), events]));
  }
  expect(match.readWorld().tick).toBe(4463);
  expect(hash.digest('hex')).toBe('c9044f7f02225f4352479c50d1f69f9a5891721a89addbaa703ac0f34c5d34e7');
}, 15000);

test('a normal AI bombs a nearby crate only after confirming an escape and survives its fire', () => {
  const match = createMatch(config);
  const events: GameplayEvent[] = [];
  for (let tick = 0; tick < 16; tick++) events.push(...match.advanceTick());
  expect(events).toContainEqual(expect.objectContaining({ type: 'bomb-placed', actorId: 'enemy' }));
  expect(events).toContainEqual(expect.objectContaining({ type: 'blocker-destroyed', blockerId: 'crate' }));
  expect(match.readWorld().actors.find(actor => actor.id === 'enemy')?.alive).toBe(true);
  expect(match.readWorld().hazards).toEqual([]);
});

test('a normal AI refuses a useful bomb if every exit is blocked or its proof budget is exhausted', () => {
  for (const limited of [false, true]) {
    const match = createMatch({ ...config,
      map: { ...config.map, blockers: [...config.map.blockers, ...[[4, 2], [4, 4], [3, 3]].map(([x, y], index) => ({ id: `wall-${index}`, type: 'solid-wall' as const, x: x!, y: y! }))] },
      actors: [config.actors[0]!, { ...config.actors[1]!, ai: { mode: 'normal', ...(limited ? { maxSearchStates: 1 } : {}) } }],
    });
    const events: GameplayEvent[] = [];
    for (let tick = 0; tick < 30; tick++) events.push(...match.advanceTick());
    expect(events.filter(event => event.type === 'bomb-placed')).toEqual([]);
    expect(match.readWorld().actors.find(actor => actor.id === 'enemy')?.alive).toBe(true);
  }
});

test('a normal AI navigates around a solid wall to reach and destroy a distant crate', () => {
  const match = createMatch({ ...config, map: { ...config.map,
    spawns: [{ id: 'player', x: 0, y: 0 }, { id: 'enemy', x: 1, y: 3 }],
    blockers: [{ id: 'crate', type: 'breakable-wall', x: 5, y: 3 }, { id: 'wall', type: 'solid-wall', x: 3, y: 3 }],
  } });
  const events: GameplayEvent[] = [];
  for (let tick = 0; tick < 80; tick++) events.push(...match.advanceTick());
  expect(events).toContainEqual(expect.objectContaining({ type: 'blocker-destroyed', blockerId: 'crate' }));
  expect(match.readWorld().actors.find(actor => actor.id === 'enemy')?.alive).toBe(true);
});

test('a normal AI waits for a real drop to activate, then navigates to collect its ability', () => {
  const match = createMatch({ ...config, rules: { ...config.rules, itemDropChance: 1 } });
  const events: GameplayEvent[] = [];
  for (let tick = 0; tick < 50; tick++) events.push(...match.advanceTick());
  expect(events).toContainEqual(expect.objectContaining({ type: 'item-collected', actorId: 'enemy' }));
  expect(match.readWorld().items).toEqual([]);
  const abilities = match.readWorld().actors.find(actor => actor.id === 'enemy')!.abilities;
  expect(abilities.bombCapacity > 1 || abilities.blastRange > 1 || abilities.speed > 3).toBe(true);
});

test('a goal already queued at the state limit is reached before reporting no route', () => {
  const match = createMatch({ ...config, rules: { ...config.rules, speed: 10 },
    map: { ...config.map, blockers: [{ id: 'crate', type: 'breakable-wall', x: 6, y: 3 }] },
    actors: [config.actors[0]!, { ...config.actors[1]!, ai: { mode: 'normal', reactionSeconds: 0, maxSearchStates: 3 } }],
  });
  match.advanceTick();
  expect(match.readWorld().actors[1]).toMatchObject({ position: { x: 5.5, y: 3.5 }, ai: { status: 'breaking', searchedStates: 3 } });
});

test('a normal AI approaches an opponent, threatens it with a real bomb and survives its own attack', () => {
  const match = createMatch({ ...config, map: { ...config.map, blockers: [], spawns: [{ id: 'player', x: 6, y: 3 }, { id: 'enemy', x: 4, y: 3 }] } });
  const events: GameplayEvent[] = [];
  for (let tick = 0; tick < 40; tick++) events.push(...match.advanceTick());
  expect(events).toContainEqual(expect.objectContaining({ type: 'bomb-placed', actorId: 'enemy' }));
  expect(match.readWorld().actors.find(actor => actor.id === 'player')?.alive).toBe(false);
  expect(match.readWorld().actors.find(actor => actor.id === 'enemy')?.alive).toBe(true);
});

test('normal AI survives its verified bomb at the default 60 Hz movement and timing', () => {
  const match = createMatch({ ...config, rules: {} });
  const events: GameplayEvent[] = [];
  for (let tick = 0; tick < 240; tick++) events.push(...match.advanceTick());
  expect(events).toContainEqual(expect.objectContaining({ type: 'blocker-destroyed', blockerId: 'crate' }));
  expect(match.readWorld().actors.find(actor => actor.id === 'enemy')?.alive).toBe(true);
});

test('three normal AIs replay every event and world from frozen initialization and per-actor seeds', () => {
  const actors = ['player', 'target-1', 'target-2', 'target-3'].map(id => ({ id, type: 'actor' as const, spawnId: id, ...(id === 'player' ? {} : { ai: { mode: 'normal' as const } }) }));
  const source = { seed: 'normal-three-replay', generator: { width: 9, height: 7 }, actors, playerId: 'player', rules: { matchDurationSeconds: 8 } };
  const first = createMatch(source);
  const record = first.readWorld().initialization;
  const replay = createMatch(JSON.parse(JSON.stringify(record)));
  const reordered = createMatch({ ...record, actors: [...record.actors].reverse() });
  expect(record.versions).toMatchObject({ match: 'normal-battle-v1', ai: 'normal-ai-v1' });
  expect(record.actors[1]?.ai).toMatchObject({ mode: 'normal', reactionSeconds: 0.2, decisionIntervalSeconds: 0.1, maxSearchStates: 6000, searchHorizonSeconds: 6, pickupWeight: 3, crateWeight: 2, threatWeight: 1 });
  expect(Object.isFrozen(record.actors[1]?.ai)).toBe(true);
  const counts = { placements: 0, destroyed: 0 };
  for (let tick = 0; tick < 500; tick++) {
    const intents = [{ actorId: 'player', move: null, bomb: false }];
    const events = first.advanceTick(intents);
    counts.placements += events.filter(event => event.type === 'bomb-placed').length;
    counts.destroyed += events.filter(event => event.type === 'blocker-destroyed').length;
    expect(replay.advanceTick(intents)).toEqual(events);
    expect(reordered.advanceTick(intents)).toEqual(events);
    expect(replay.readWorld()).toEqual(first.readWorld());
    for (const actor of first.readWorld().actors) expect(reordered.readWorld().actors.find(other => other.id === actor.id)).toEqual(actor);
  }
  expect(counts.placements).toBeGreaterThan(0);
  expect(counts.destroyed).toBeGreaterThan(0);
  expect(first.readWorld().result).not.toBeNull();
}, 20000);

test('a simultaneous foreign bomb cancels the expected self-placement route and requires fresh observation', () => {
  const match = createMatch({ ...config, map: { ...config.map, spawns: [{ id: 'player', x: 4, y: 2 }, { id: 'enemy', x: 4, y: 3 }] } });
  match.advanceTick(); match.advanceTick();
  const placed = match.advanceTick([{ actorId: 'player', move: null, bomb: true }]);
  expect(placed.filter(event => event.type === 'bomb-placed')).toHaveLength(2);
  const stopped = match.readWorld().actors[1]!.position;
  match.advanceTick(); match.advanceTick();
  expect(match.readWorld().actors[1]).toMatchObject({ position: stopped, ai: { status: 'observing', remainingSteps: 0 } });
});

test('normal AIs use ordinary seeded same-cell arbitration and shared bomb leave permissions', () => {
  const winners = new Set<string>();
  for (let index = 0; index < 10; index++) {
    const match = createMatch({ ...config, seed: `normal-conflict-${index}`, actors: [
      { id: 'enemy-a', type: 'actor', spawnId: 'enemy', ai: { mode: 'normal' } },
      { id: 'enemy-b', type: 'actor', spawnId: 'enemy', ai: { mode: 'normal' } },
    ] });
    match.advanceTick(); match.advanceTick();
    const events = match.advanceTick();
    const placements = events.filter(event => event.type === 'bomb-placed');
    expect(placements).toHaveLength(1);
    winners.add(placements[0]!.actorId);
    expect(match.readWorld().bombs[0]?.exitActorIds).toEqual(['enemy-a', 'enemy-b']);
    for (let tick = 0; tick < 14; tick++) match.advanceTick();
    expect(match.readWorld().actors.every(actor => actor.alive)).toBe(true);
  }
  expect(winners).toEqual(new Set(['enemy-a', 'enemy-b']));
});

test('normal AI preferences are frozen and disabling all goals leaves a safe actor idle', () => {
  const settings = { mode: 'normal' as const, pickupWeight: 0, crateWeight: 0, threatWeight: 0 };
  const match = createMatch({ ...config, actors: [config.actors[0]!, { ...config.actors[1]!, ai: settings }] });
  settings.crateWeight = 100;
  for (let tick = 0; tick < 30; tick++) expect(match.advanceTick()).toEqual([]);
  expect(match.readWorld().actors[1]?.position).toEqual({ x: 4.5, y: 3.5 });
  expect(match.readWorld().initialization.actors[1]?.ai).toMatchObject({ pickupWeight: 0, crateWeight: 0, threatWeight: 0 });
  expect(Object.isFrozen(match.readWorld().initialization.actors[1]?.ai)).toBe(true);
});

test.each([{ pickupWeight: -1 }, { crateWeight: NaN }, { threatWeight: Infinity }, { maxSearchStates: 0 }, { searchHorizonSeconds: 0 }])('rejects invalid normal AI settings: %j', settings => {
  expect(() => createMatch({ ...config, actors: [config.actors[0]!, { ...config.actors[1]!, ai: { mode: 'normal', ...settings } }] }))
    .toThrowError(expect.objectContaining({ code: 'invalid-config' }));
});

test('an open escape that cannot be proved within one search state never authorizes a bomb', () => {
  const match = createMatch({ ...config, actors: [config.actors[0]!, { ...config.actors[1]!, ai: { mode: 'normal', maxSearchStates: 1 } }] });
  for (let tick = 0; tick < 20; tick++) expect(match.advanceTick()).toEqual([]);
  expect(match.readWorld().actors[1]).toMatchObject({ position: { x: 4.5, y: 3.5 }, alive: true, ai: { status: 'budget-exhausted', searchedStates: 1 } });
});
