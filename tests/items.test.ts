import { expect, test } from 'vitest';
import { createMatch, MatchError, type MatchConfig, type GameplayIntent } from '../src/match/index.js';

const config: MatchConfig = {
  seed: 'item-example',
  map: { width: 7, height: 5, ground: Array.from({ length: 35 }, () => 'floor'),
    blockers: [{ id: 'crate', type: 'breakable-wall', x: 2, y: 1 }],
    spawns: [{ id: 'start', x: 1, y: 1 }],
  },
  actors: [{ id: 'player', type: 'actor', spawnId: 'start' }],
  rules: { tickRate: 1, speed: 1, bombFuseSeconds: 2, fireDurationSeconds: 1, itemDropChance: 1 },
};

test('protects a new drop from its explosion and activates on the step after the cell fire disappears', () => {
  const match = createMatch(config);
  match.advanceTick([{ actorId: 'player', move: 'down', bomb: true }]);
  const events = match.advanceTick([{ actorId: 'player', move: 'right' }]);
  expect(events).toContainEqual(expect.objectContaining({ type: 'item-spawned', cell: { x: 2, y: 1 } }));
  expect(match.readWorld().items).toHaveLength(1);
  expect(match.readWorld().items[0]).toMatchObject({ x: 2, y: 1, active: false, spawnedAtTick: 2 });
  match.advanceTick([{ actorId: 'player', move: null }]);
  expect(match.readWorld().hazards).toEqual([]);
  expect(match.readWorld().items[0]?.active).toBe(false);
  match.advanceTick();
  expect(match.readWorld().items[0]?.active).toBe(true);
});

function collect(seed: string) {
  const match = createMatch({ ...config, seed });
  match.advanceTick([{ actorId: 'player', move: 'down', bomb: true }]);
  match.advanceTick([{ actorId: 'player', move: 'right' }]);
  match.advanceTick([{ actorId: 'player', move: null }]);
  match.advanceTick([{ actorId: 'player', move: 'up' }]);
  return match;
}

test('capacity pickup permits a second live bomb instead of rejecting it', () => {
  const match = collect('item-0');
  match.advanceTick([{ actorId: 'player', move: 'left', bomb: true }]);
  const events = match.advanceTick([{ actorId: 'player', move: 'down', bomb: true }]);
  expect(events).toContainEqual(expect.objectContaining({ type: 'bomb-placed', bombId: 'bomb-3' }));
  expect(events).toContainEqual(expect.objectContaining({ type: 'bomb-exploded', bombId: 'bomb-3' }));
});

test('range pickup extends subsequent explosions by one cell', () => {
  const match = collect('item-1');
  match.advanceTick([{ actorId: 'player', move: 'left', bomb: true }]);
  match.advanceTick([{ actorId: 'player', move: 'down' }]);
  expect(match.readWorld().hazards[0]?.cells).toContainEqual({ x: 4, y: 1 });
  expect(match.readWorld().hazards[0]?.cells).not.toContainEqual({ x: 5, y: 1 });
});

test('speed pickup increases distance in the following step, without adding distance in the pickup step', () => {
  const match = collect('item-3');
  expect(match.readWorld().actors[0]?.position).toEqual({ x: 2.5, y: 1.5 });
  match.advanceTick([{ actorId: 'player', move: 'right' }]);
  expect(match.readWorld().actors[0]?.position).toEqual({ x: 4, y: 1.5 });
});

test('simultaneous pickup has one reproducible winner independent of actor and intent order', () => {
  const winners = new Set<string>();
  for (let n = 0; n < 24; n++) {
    const actors = [...config.actors, { id: 'other', type: 'actor' as const, spawnId: 'start' }];
    const forward = createMatch({ ...config, seed: `contest-${n}`, actors });
    const reverse = createMatch({ ...config, seed: `contest-${n}`, actors: [...actors].reverse() });
    for (const move of ['down', 'right', null, 'up'] as const) {
      const intents = actors.map(actor => ({ actorId: actor.id, move, bomb: actor.id === 'player' && move === 'down' }));
      const events = forward.advanceTick(intents);
      expect(reverse.advanceTick([...intents].reverse())).toEqual(events);
      for (const event of events) if (event.type === 'item-collected') winners.add(event.actorId);
    }
    expect(forward.readWorld().items).toEqual([]);
    expect(forward.readWorld().actors.filter(actor => actor.abilities.speed > 1 || actor.abilities.bombCapacity > 1 || actor.abilities.blastRange > 1)).toHaveLength(1);
  }
  expect(winners).toEqual(new Set(['player', 'other']));
});

test('a new explosion destroys an active item before pickup', () => {
  const match = createMatch(config);
  match.advanceTick([{ actorId: 'player', move: 'down', bomb: true }]);
  match.advanceTick([{ actorId: 'player', move: 'right' }]);
  match.advanceTick([{ actorId: 'player', move: null }]);
  match.advanceTick([{ actorId: 'player', move: 'right', bomb: true }]);
  const events = match.advanceTick([{ actorId: 'player', move: 'up' }]);
  expect(events).toContainEqual(expect.objectContaining({ type: 'item-destroyed', itemId: 'item-1' }));
  expect(events.some(event => event.type === 'item-collected')).toBe(false);
  expect(match.readWorld().items).toEqual([]);
});

test('overlapping later fire keeps a pending drop protected until every flame has expired', () => {
  const match = createMatch({ ...config, map: { ...config.map, spawns: [...config.map.spawns, { id: 'other-start', x: 3, y: 1 }] },
    actors: [...config.actors, { id: 'other', type: 'actor', spawnId: 'other-start' }],
  });
  match.advanceTick([{ actorId: 'player', move: 'down', bomb: true }]);
  match.advanceTick([{ actorId: 'player', move: 'right' }, { actorId: 'other', move: 'up', bomb: true }]);
  match.advanceTick([{ actorId: 'player', move: null }]);
  expect(match.readWorld().items[0]?.active).toBe(false);
  expect(match.readWorld().hazards).toHaveLength(1);
  match.advanceTick();
  expect(match.readWorld().items[0]?.active).toBe(false);
  expect(match.readWorld().hazards).toEqual([]);
  match.advanceTick();
  expect(match.readWorld().items[0]?.active).toBe(true);
});

test('death from swept tick-start fire prevents pickup at an otherwise safe final cell in the same step', () => {
  const match = createMatch({ ...config, rules: { ...config.rules, speed: 2, blastRange: 2 },
    map: { ...config.map, spawns: [{ id: 'start', x: 0, y: 1 }, { id: 'other-start', x: 3, y: 2 }] },
    actors: [...config.actors, { id: 'other', type: 'actor', spawnId: 'other-start' }],
  });
  match.advanceTick([{ actorId: 'player', move: 'down', bomb: true }]);
  match.advanceTick([{ actorId: 'player', move: 'right' }, { actorId: 'other', move: 'right', bomb: true }]);
  match.advanceTick([{ actorId: 'player', move: null }]);
  const events = match.advanceTick([{ actorId: 'player', move: 'up' }]);
  expect(match.readWorld().actors[0]).toMatchObject({ alive: false, position: { x: 2.5, y: 1.5 } });
  expect(match.readWorld().items[0]).toMatchObject({ active: true, x: 2, y: 1 });
  expect(events).toContainEqual(expect.objectContaining({ type: 'actor-eliminated', actorId: 'player' }));
  expect(events.some(event => event.type === 'item-collected')).toBe(false);
  expect(match.advanceTick([{ actorId: 'player', move: null }])).toEqual([]);
});

test('bomb placement uses pre-pickup range, while the next bomb uses the upgraded range even in a chain', () => {
  const match = createMatch({ ...config, seed: 'item-1', rules: { ...config.rules, bombCapacity: 2 } });
  match.advanceTick([{ actorId: 'player', move: 'down', bomb: true }]);
  match.advanceTick([{ actorId: 'player', move: 'right' }]);
  match.advanceTick([{ actorId: 'player', move: null }]);
  match.advanceTick([{ actorId: 'player', move: 'up', bomb: true }]);
  expect(match.readWorld().bombs[0]).toMatchObject({ id: 'bomb-2', blastRange: 1 });
  match.advanceTick([{ actorId: 'player', move: 'left', bomb: true }]);
  const hazards = match.readWorld().hazards;
  expect(hazards.find(hazard => hazard.bombId === 'bomb-2')?.cells).not.toContainEqual({ x: 4, y: 2 });
  expect(hazards.find(hazard => hazard.bombId === 'bomb-3')?.cells).toContainEqual({ x: 4, y: 1 });
});

test.each([
  ['item-0', { bombCapacity: 4, blastRange: 1, speed: 1 }],
  ['item-1', { bombCapacity: 1, blastRange: 6, speed: 1 }],
  ['item-3', { bombCapacity: 1, blastRange: 1, speed: 5 }],
] as const)('configurable large gains stop at the default caps for %s', (seed, abilities) => {
  const match = createMatch({ ...config, seed, rules: { ...config.rules, capacityGain: 10, rangeGain: 10, speedGain: 10 } });
  for (const move of ['down', 'right', null, 'up'] as const) match.advanceTick([{ actorId: 'player', move, bomb: move === 'down' }]);
  expect(match.readWorld().actors[0]?.abilities).toEqual(abilities);
});

test.each(['item-0', 'item-1', 'item-3'])('pickup at configured caps still consumes one instance without reducing abilities (%s)', seed => {
  const match = createMatch({ ...config, seed, rules: { ...config.rules, maxBombCapacity: 1, maxBlastRange: 1, maxSpeed: 1 } });
  let events;
  for (const move of ['down', 'right', null, 'up'] as const) events = match.advanceTick([{ actorId: 'player', move, bomb: move === 'down' }]);
  expect(events).toContainEqual(expect.objectContaining({ type: 'item-collected' }));
  expect(match.readWorld().actors[0]?.abilities).toEqual({ bombCapacity: 1, blastRange: 1, speed: 1 });
  expect(match.readWorld().items).toEqual([]);
});

test.each([
  { itemDropChance: -0.1 }, { itemDropChance: 1.1 }, { itemDropChance: NaN },
  { capacityGain: 0 }, { rangeGain: 1.5 }, { speedGain: Infinity },
  { maxBombCapacity: 0 }, { maxBlastRange: 0 }, { maxSpeed: 0.5 },
])('rejects invalid item tuning atomically: %j', rules => {
  expect(() => createMatch({ ...config, rules: { ...config.rules, ...rules } })).toThrow(MatchError);
});

test('drop and pickup streams reproduce through initialization and remain independent of placement conflicts and reads', () => {
  const kinds = new Set<string>();
  const winners = new Set<string>();
  let emptyDrops = 0;
  for (let n = 0; n < 64; n++) {
    const setup: MatchConfig = { ...config, seed: `streams-${n}`, rules: { ...config.rules, itemDropChance: 0.5 },
      map: { ...config.map, spawns: [...config.map.spawns, { id: 'remote', x: 6, y: 4 }] },
      actors: [...config.actors, { id: 'other', type: 'actor', spawnId: 'start' },
        { id: 'remote-a', type: 'actor', spawnId: 'remote' }, { id: 'remote-b', type: 'actor', spawnId: 'remote' }],
    };
    const match = createMatch(setup);
    const replay = createMatch(match.readWorld().initialization);
    const extraConflicts = createMatch(setup);
    for (const move of ['down', 'right', null, 'up'] as const) {
      const intents: GameplayIntent[] = [{ actorId: 'player', move, bomb: move === 'down' }, { actorId: 'other', move }];
      const events = match.advanceTick(intents);
      for (let read = 0; read < 5; read++) replay.readWorld();
      expect(replay.advanceTick(intents)).toEqual(events);
      expect(replay.readWorld()).toEqual(match.readWorld());
      const noisy = extraConflicts.advanceTick([...intents,
        { actorId: 'remote-a', move: null, bomb: move === 'down' }, { actorId: 'remote-b', move: null, bomb: move === 'down' }]);
      const itemFacts = (list: typeof events) => list.filter(event => event.type.startsWith('item-')).map(({ order: _order, ...event }) => event);
      expect(itemFacts(noisy)).toEqual(itemFacts(events));
      for (const event of events) {
        if (event.type === 'item-spawned') kinds.add(event.kind);
        if (event.type === 'item-collected') winners.add(event.actorId);
      }
    }
    if (match.readWorld().actors.every(actor => actor.abilities.speed === 1 && actor.abilities.bombCapacity === 1 && actor.abilities.blastRange === 1)) emptyDrops++;
  }
  expect(kinds).toEqual(new Set(['item.capacity', 'item.range', 'item.speed']));
  expect(winners).toEqual(new Set(['player', 'other']));
  expect(emptyDrops).toBeGreaterThan(0);
  expect(emptyDrops).toBeLessThan(64);
});

test('zero probability yields no drop, while multiple guaranteed drops are stable under blocker reordering', () => {
  const zero = createMatch({ ...config, rules: { ...config.rules, itemDropChance: 0 } });
  zero.advanceTick([{ actorId: 'player', move: 'down', bomb: true }]);
  expect(zero.advanceTick([{ actorId: 'player', move: 'right' }]).some(event => event.type === 'item-spawned')).toBe(false);
  expect(zero.readWorld().items).toEqual([]);
  const blockers = [...config.map.blockers, { id: 'south', type: 'breakable-wall' as const, x: 1, y: 2 }];
  const match = createMatch({ ...config, map: { ...config.map, blockers } });
  const reordered = createMatch({ ...config, map: { ...config.map, blockers: [...blockers].reverse() } });
  match.advanceTick([{ actorId: 'player', move: null, bomb: true }]);
  reordered.advanceTick([{ actorId: 'player', move: null, bomb: true }]);
  expect(reordered.advanceTick()).toEqual(match.advanceTick());
  expect(reordered.readWorld().items).toEqual(match.readWorld().items);
  expect(match.readWorld().items).toHaveLength(2);
});

test('item and ability snapshots stay frozen and retain their earlier facts after pickup', () => {
  const match = createMatch({ ...config, seed: 'item-0' });
  const initial = match.readWorld();
  match.advanceTick([{ actorId: 'player', move: 'down', bomb: true }]);
  const events = match.advanceTick([{ actorId: 'player', move: 'right' }]);
  const before = match.readWorld();
  expect(Object.isFrozen(before.items[0])).toBe(true);
  expect(Object.isFrozen(initial.actors[0]?.abilities)).toBe(true);
  expect(Object.isFrozen(events.find(event => event.type === 'item-spawned')?.cell)).toBe(true);
  match.advanceTick([{ actorId: 'player', move: null }]);
  const collected = match.advanceTick([{ actorId: 'player', move: 'up' }]);
  expect(Object.isFrozen(collected.find(event => event.type === 'item-collected')?.abilities)).toBe(true);
  expect(initial.actors[0]?.abilities.bombCapacity).toBe(1);
  expect(before.items[0]?.active).toBe(false);
  expect(match.readWorld().actors[0]?.abilities.bombCapacity).toBe(2);
});

test.each(['maxBombCapacity', 'maxBlastRange', 'maxSpeed'])('explicit undefined is invalid rather than an omitted cap: %s', key => {
  const rules = { ...config.rules };
  Reflect.set(rules, key, undefined);
  expect(() => createMatch({ ...config, rules })).toThrow(MatchError);
});

test('an invalid intent cannot activate a pending item or change any world facts', () => {
  const match = createMatch(config);
  match.advanceTick([{ actorId: 'player', move: 'down', bomb: true }]);
  match.advanceTick([{ actorId: 'player', move: 'right' }]);
  match.advanceTick([{ actorId: 'player', move: null }]);
  const before = match.readWorld();
  expect(() => match.advanceTick([{ actorId: 'missing', move: null }])).toThrow(MatchError);
  expect(match.readWorld()).toEqual(before);
  expect(before.items[0]?.active).toBe(false);
  match.advanceTick();
  expect(match.readWorld().items[0]?.active).toBe(true);
});

test.each([
  ['item-0', 'item.capacity', { bombCapacity: 2, blastRange: 1, speed: 1 }],
  ['item-1', 'item.range', { bombCapacity: 1, blastRange: 2, speed: 1 }],
  ['item-3', 'item.speed', { bombCapacity: 1, blastRange: 1, speed: 1.5 }],
] as const)('collects %s once, after movement, and exposes the upgraded abilities', (seed, kind, abilities) => {
  const match = createMatch({ ...config, seed });
  match.advanceTick([{ actorId: 'player', move: 'down', bomb: true }]);
  match.advanceTick([{ actorId: 'player', move: 'right' }]);
  match.advanceTick([{ actorId: 'player', move: null }]);
  expect(match.readWorld().actors[0]?.abilities).toEqual({ bombCapacity: 1, blastRange: 1, speed: 1 });
  const events = match.advanceTick([{ actorId: 'player', move: 'up' }]);
  expect(events).toContainEqual(expect.objectContaining({ type: 'item-collected', itemId: 'item-1', kind, actorId: 'player', abilities }));
  expect(match.readWorld().actors[0]?.abilities).toEqual(abilities);
  expect(match.readWorld().items).toEqual([]);
  expect(match.advanceTick()).toEqual([]);
  expect(match.readWorld().actors[0]?.abilities).toEqual(abilities);
});
