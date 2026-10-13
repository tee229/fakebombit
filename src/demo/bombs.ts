import assert from 'node:assert/strict';
import { createMatch, type GameplayIntent, type MatchConfig } from '../match/index.js';

const config: MatchConfig = {
  seed: 'basic-bombs-demo', playerId: 'player',
  map: {
    width: 7, height: 5, ground: Array.from({ length: 35 }, () => 'floor'),
    blockers: [], spawns: [{ id: 'start', x: 1, y: 1 }, { id: 'opponent', x: 3, y: 1 }],
  },
  actors: [{ id: 'player', type: 'actor', spawnId: 'start' }, { id: 'enemy', type: 'actor', spawnId: 'opponent' }],
  rules: { tickRate: 10, speed: 10, bombFuseSeconds: 0.3, fireDurationSeconds: 0.2, matchDurationSeconds: 0.3 },
};

function play(label: string, source: MatchConfig, steps: readonly (readonly GameplayIntent[])[]) {
  const match = createMatch(source);
  const retry = createMatch(match.readWorld().initialization);
  for (const intents of steps) {
    const events = match.advanceTick(intents);
    assert.deepEqual(retry.advanceTick(intents), events);
    assert.deepEqual(retry.readWorld(), match.readWorld());
    for (const [order, event] of events.entries()) {
      assert.equal(event.tick, match.readWorld().tick);
      assert.equal(event.order, order);
    }
    console.log(`${label}: tick=${match.readWorld().tick}, events=${events.map(event => event.type).join(',') || '(none)'}`);
  }
  return match;
}

const win = play('Win: leave the blast cross, destroy a blocker, eliminate the opponent', {
  ...config, rules: { ...config.rules, blastRange: 2 },
  map: { ...config.map, blockers: [{ id: 'crate', type: 'breakable-wall', x: 1, y: 3 }] },
}, [[{ actorId: 'player', move: 'down', bomb: true }], [{ actorId: 'player', move: 'right' }], []]);
assert.deepEqual(win.readWorld().result, { outcome: 'won', tick: 3 });
assert.equal(win.readWorld().blockers.length, 0);
assert.equal(win.readWorld().initialMap.blockers.length, 1);

const loss = play('Loss: player death takes priority over the timeout', config, [[{ actorId: 'player', move: null, bomb: true }], [], []]);
assert.deepEqual(loss.readWorld().result, { outcome: 'lost', tick: 3 });

const draw = play('Draw: both actors survive until the timeout', config, [[], [], []]);
assert.deepEqual(draw.readWorld().result, { outcome: 'draw', tick: 3 });

const leave = play('Leave: exit a bomb, fail to re-enter, then retreat safely', {
  ...config,
  map: { ...config.map, spawns: [config.map.spawns[0]!, { id: 'opponent', x: 5, y: 3 }] },
  rules: { ...config.rules, bombFuseSeconds: 0.5, matchDurationSeconds: 2 },
}, [[{ actorId: 'player', move: 'right', bomb: true }], [{ actorId: 'player', move: 'left' }]]);
assert.equal(leave.readWorld().actors[0]!.position.x, 2.3);
assert.deepEqual(leave.readWorld().bombs[0]!.exitActorIds, []);
leave.advanceTick([{ actorId: 'player', move: 'right' }]);
leave.advanceTick([{ actorId: 'player', move: 'right' }]);
leave.advanceTick();
assert.equal(leave.readWorld().actors[0]!.alive, true);
assert.equal(leave.readWorld().bombs.length, 0);

for (const match of [win, loss, draw]) {
  const final = match.readWorld();
  assert.deepEqual(match.advanceTick([{ actorId: 'player', move: 'right', bomb: true }]), []);
  assert.deepEqual(match.readWorld(), final);
}
console.log('Win, loss, draw, leave permission, event order, per-tick reproduction, and terminal freeze verified.');
