import { strict as assert } from 'node:assert';
import { createEscapeTrainingMatch } from '../browser/escape-training.js';
import { forecastDanger } from '../match/forecast.js';

const match = createEscapeTrainingMatch();
const replay = createEscapeTrainingMatch();
const initial = match.readWorld();
const forecast = forecastDanger(initial);
assert.deepEqual(initial.bombs.map(bomb => bomb.detonateAtTick), [180, 195]);
assert.deepEqual(forecast.explosions.map(explosion => explosion.tick), [180, 180]);
const actual = [];
for (let step = 0; step < 220; step++) {
  const events = match.advanceTick();
  assert.deepEqual(replay.advanceTick(), events);
  assert.deepEqual(replay.readWorld(), match.readWorld());
  actual.push(...events.filter(event => event.type === 'bomb-exploded'));
}
assert.deepEqual(actual.map(({ bombId, tick, cells }) => ({ bombId, tick, cells })), forecast.explosions.map(({ bombId, tick, cells }) => ({ bombId, tick, cells })));
const enemy = match.readWorld().actors.find(actor => actor.id === 'enemy')!;
assert(enemy.alive);
assert.notDeepEqual(enemy.position, initial.actors.find(actor => actor.id === 'enemy')!.position);
console.log('已知炸弹到期：180 / 195；预测与真实连锁均在第 180 步。');
console.log('AI 逃生：', initial.actors.find(actor => actor.id === 'enemy')!.position, '→', enemy.position, '；存活，状态', enemy.ai!.status);
console.log('220 步状态与事件重放一致；AI 未主动放弹。');
