import assert from 'node:assert/strict';
import { createMatch, MatchError, type GameplayIntent, type MatchConfig, type MatchErrorCode, type Blocker } from '../match/index.js';

const width = 7;
const height = 5;
const blockers: Blocker[] = [];
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (x === 0 || x === width - 1 || y === 0 || y === height - 1) blockers.push({ id: `border-${x}-${y}`, type: 'solid-wall', x, y });
  }
}
blockers.push({ id: 'inside-corner', type: 'solid-wall', x: 1, y: 2 }, { id: 'breakable', type: 'breakable-wall', x: 2, y: 2 });
const config: MatchConfig = {
  seed: 'fixed-movement-demo',
  map: { width, height, ground: Array.from({ length: width * height }, () => 'floor'), blockers, spawns: [{ id: 'start', x: 1, y: 1 }, { id: 'waiting', x: 3, y: 1 }] },
  actors: [{ id: 'player', type: 'actor', spawnId: 'start' }, { id: 'other', type: 'actor', spawnId: 'waiting' }],
};
const match = createMatch(config);
const retry = createMatch(match.readWorld().initialization);
console.log('Fixed semantic map (# solid wall, + breakable wall):');
for (let y = 0; y < height; y++) {
  console.log(Array.from({ length: width }, (_, x) => {
    const wall = blockers.find(wall => wall.x === x && wall.y === y);
    return wall ? wall.type === 'solid-wall' ? '#' : '+' : '.';
  }).join(''));
}
console.log('Initialization:', JSON.stringify(match.readWorld().initialization));
function run(label: string, count: number, move: GameplayIntent['move'] | undefined): void {
  for (let step = 0; step < count; step++) {
    const intents = move === undefined ? [] : [{ actorId: 'player', move }];
    assert.deepEqual(match.advanceTick(intents), []);
    retry.advanceTick(intents);
    assert.deepEqual(retry.readWorld(), match.readWorld());
  }
  const world = match.readWorld();
  console.log(`${label}: tick=${world.tick}, player=${JSON.stringify(world.actors[0]?.position)}`);
}
run('Approach corner, passing through the other actor', 34, 'right');
run('Request down before the corner', 1, 'down');
run('Buffered request reaches the corner', 4, undefined);
run('Travel down the open corridor', 39, 'down');
run('Turn left below the obstacles', 40, 'left');
run('Release movement', 1, null);
const final = match.readWorld().actors[0]!.position;
assert.ok(Math.abs(final.x - 1.5) < 1e-9 && Math.abs(final.y - 3.5) < 1e-9);
assert.equal(Reflect.set(match.readWorld().initialization.rules, 'speed', 99), false);

function failure(code: MatchErrorCode, create: () => unknown): void {
  assert.throws(create, error => error instanceof MatchError && error.code === code);
  console.log(`Expected creation failure: ${code}`);
}
failure('invalid-config', () => createMatch({ ...config, rules: { tickRate: 0 } }));
const unknownMap = { ...config.map, blockers: [{ id: 'unsupported', type: 'solid-wall' as const, x: 4, y: 2 }] };
Reflect.set(unknownMap.blockers[0]!, 'type', 'portal');
failure('unknown-entity-type', () => createMatch({ ...config, map: unknownMap }));
failure('invalid-map', () => createMatch({ ...config, map: { ...config.map, width: 0 } }));
console.log('Reproduction verified after every tick; immutable initialization and final route verified.');
