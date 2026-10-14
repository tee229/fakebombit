import { strict as assert } from 'node:assert';
import { createMatch, type MatchConfig } from '../match/index.js';

const config: MatchConfig = { seed: 'item-0',
  map: { width: 7, height: 5, ground: Array.from({ length: 35 }, () => 'floor'),
    blockers: [{ id: 'crate', type: 'breakable-wall', x: 2, y: 1 }], spawns: [{ id: 'start', x: 1, y: 1 }] },
  actors: [{ id: 'player', type: 'actor', spawnId: 'start' }],
  rules: { tickRate: 1, speed: 1, bombFuseSeconds: 2, fireDurationSeconds: 1, itemDropChance: 1 },
};
for (const seed of ['item-0', 'item-1', 'item-3']) {
  const match = createMatch({ ...config, seed });
  const retry = createMatch(match.readWorld().initialization);
  const before = match.readWorld().actors[0]!.abilities;
  for (const move of ['down', 'right', null, 'up'] as const) {
    const intents = [{ actorId: 'player', move, bomb: move === 'down' }];
    assert.deepEqual(retry.advanceTick(intents), match.advanceTick(intents));
    assert.deepEqual(retry.readWorld(), match.readWorld());
  }
  const after = match.readWorld().actors[0]!.abilities;
  if (seed === 'item-0') {
    match.advanceTick([{ actorId: 'player', move: 'left', bomb: true }]);
    assert(match.advanceTick([{ actorId: 'player', move: 'down', bomb: true }]).some(event => event.type === 'bomb-placed'));
    console.log('容量：', before.bombCapacity, '→', after.bombCapacity, '；第二颗炸弹放置成功。');
  } else if (seed === 'item-1') {
    match.advanceTick([{ actorId: 'player', move: 'left', bomb: true }]);
    match.advanceTick([{ actorId: 'player', move: 'down' }]);
    assert(match.readWorld().hazards[0]!.cells.some(cell => cell.x === 4 && cell.y === 1));
    console.log('距离：', before.blastRange, '→', after.blastRange, '；火焰延伸到两格外。');
  } else {
    const start = match.readWorld().actors[0]!.position.x;
    match.advanceTick([{ actorId: 'player', move: 'right' }]);
    assert.equal(match.readWorld().actors[0]!.position.x - start, 1.5);
    console.log('速度：', before.speed, '→', after.speed, '；下一步移动 1.5 格。');
  }
}
console.log('三种道具均由实际爆炸掉落、拾取并改变能力，初始化重放一致。');
