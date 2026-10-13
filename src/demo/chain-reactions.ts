import assert from 'node:assert/strict';
import { createMatch, type GameplayEvent, type GameplayIntent, type MatchConfig, type WorldState } from '../match/index.js';

const base: MatchConfig = {
  seed: 'chain-example',
  map: { width: 9, height: 7, ground: Array.from({ length: 63 }, () => 'floor'), blockers: [], spawns: [] },
  actors: [],
  rules: { tickRate: 10, speed: 20, bombFuseSeconds: 0.3, fireDurationSeconds: 0.1, blastRange: 1 },
};

function run(label: string, config: MatchConfig, steps: readonly (readonly GameplayIntent[])[]) {
  const match = createMatch(config);
  const retry = createMatch(match.readWorld().initialization);
  const worlds: WorldState[] = [];
  const events: (readonly GameplayEvent[])[] = [];
  for (const intents of steps) {
    const current = match.advanceTick(intents);
    assert.deepEqual(retry.advanceTick([...intents].reverse()), current);
    assert.deepEqual(retry.readWorld(), match.readWorld());
    current.forEach((event, order) => { assert.equal(event.order, order); assert.equal(event.tick, match.readWorld().tick); });
    events.push(current);
    worlds.push(match.readWorld());
    console.log(`${label}: tick=${match.readWorld().tick}, events=${current.map(event => event.type).join(',') || '(none)'}`);
  }
  return { worlds, events };
}

const cycle = run('Chain cycle', {
  ...base,
  map: { ...base.map, spawns: [{ id: 'a', x: 2, y: 2 }, { id: 'b', x: 3, y: 2 }, { id: 'c', x: 3, y: 3 }, { id: 'd', x: 2, y: 3 }] },
  actors: ['a', 'b', 'c', 'd'].map(id => ({ id, type: 'actor', spawnId: id })),
  rules: { ...base.rules, bombFuseSeconds: 0.5 },
}, [
  [{ actorId: 'a', move: 'left', bomb: true }], [{ actorId: 'b', move: 'up', bomb: true }],
  [{ actorId: 'c', move: 'right', bomb: true }], [{ actorId: 'd', move: 'down', bomb: true }], [], [], [], [],
]);
assert.deepEqual(cycle.events[4]!.filter(event => event.type === 'bomb-exploded').map(event => event.bombId), ['bomb-1', 'bomb-2', 'bomb-3', 'bomb-4']);
assert.equal(cycle.worlds[4]!.bombs.length, 0);
assert.equal(cycle.events.slice(5).flat().length, 0);

const walls = run('Wall snapshot: D -> A -> B; C waits for a later tick', {
  ...base,
  map: { ...base.map, blockers: [{ id: 'crate', type: 'breakable-wall', x: 3, y: 3 }], spawns: [
    { id: 'a', x: 2, y: 2 }, { id: 'b', x: 2, y: 3 }, { id: 'c', x: 4, y: 3 }, { id: 'd', x: 3, y: 2 },
  ] },
  actors: ['a', 'b', 'c', 'd'].map(id => ({ id, type: 'actor', spawnId: id })),
  rules: { ...base.rules, bombFuseSeconds: 0.4, blastRange: 2 },
}, [
  [{ actorId: 'd', move: 'up', bomb: true }],
  [{ actorId: 'd', move: 'left' }, { actorId: 'a', move: 'left', bomb: true }, { actorId: 'b', move: 'down', bomb: true }],
  [{ actorId: 'a', move: 'up' }, { actorId: 'b', move: 'left' }, { actorId: 'c', move: 'right', bomb: true }],
  [{ actorId: 'c', move: 'up' }], [], [],
]);
assert.deepEqual(walls.worlds[3]!.bombs.map(bomb => bomb.id), ['bomb-4']);
assert.equal(walls.worlds[3]!.blockers.length, 0);
assert.equal(walls.worlds[3]!.initialMap.blockers.length, 1);
assert.ok(!walls.worlds[3]!.hazards.find(fire => fire.bombId === 'bomb-3')!.cells.some(cell => cell.x === 4 && cell.y === 3));
assert.ok(walls.worlds[5]!.hazards[0]!.cells.some(cell => cell.x === 2 && cell.y === 3));

const shared: MatchConfig = {
  ...base,
  map: { ...base.map, spawns: [{ id: 'shared', x: 2, y: 3 }] },
  actors: [{ id: 'a', type: 'actor', spawnId: 'shared' }, { id: 'b', type: 'actor', spawnId: 'shared' }],
};
const permissions = run('Conflict: winner capacity and shared leave permission', shared, [
  [{ actorId: 'a', move: null, bomb: true }, { actorId: 'b', move: null, bomb: true }],
  [{ actorId: 'a', move: 'left' }, { actorId: 'b', move: 'right' }],
  [{ actorId: 'a', move: 'up', bomb: true }, { actorId: 'b', move: 'down', bomb: true }],
]);
const first = permissions.worlds[0]!.bombs[0]!;
assert.deepEqual(first.exitActorIds, ['a', 'b']);
assert.deepEqual(permissions.worlds[1]!.bombs[0]!.exitActorIds, []);
assert.deepEqual(permissions.events[2]!.filter(event => event.type === 'bomb-placed').map(event => event.actorId), [first.ownerId === 'a' ? 'b' : 'a']);

const rounds: (readonly GameplayIntent[])[] = [];
for (let round = 0; round < 4; round++) rounds.push(
  [{ actorId: 'a', move: 'left', bomb: true }, { actorId: 'b', move: 'right', bomb: true }], [],
  [{ actorId: 'a', move: 'right' }, { actorId: 'b', move: 'left' }],
);
const contests = run('Repeat conflicts', { ...shared, rules: { ...base.rules, bombFuseSeconds: 0.1 } }, rounds);
const winners = contests.events.flat().filter(event => event.type === 'bomb-placed').map(event => event.actorId);
assert.deepEqual([...new Set(winners)].sort(), ['a', 'b']);
console.log(`Seeded winners: ${winners.join(',')}`);
console.log('Chain cycles, phase-start walls, later cleared paths, winner capacity, leave permission, input-order independence and per-tick reproduction verified.');
