import { expect, test } from 'vitest';
import { createMatch, type MatchConfig, type GameplayEvent } from '../src/match/index.js';
import { createFeedback } from '../src/presentation/feedback.js';

const config: MatchConfig = { seed: 'feedback', playerId: 'player',
  map: { width: 7, height: 5, ground: Array.from({ length: 35 }, () => 'floor'),
    blockers: [{ id: 'crate', type: 'breakable-wall', x: 3, y: 1 }],
    spawns: [{ id: 'player', x: 1, y: 1 }, { id: 'other', x: 5, y: 3 }] },
  actors: [{ id: 'player', type: 'actor', spawnId: 'player' }, { id: 'other', type: 'actor', spawnId: 'other' }],
  rules: { bombFuseSeconds: .1, fireDurationSeconds: .2, blastRange: 2 },
};
function explode() {
  const match = createMatch(config), initial = match.readWorld();
  const events: GameplayEvent[] = [];
  events.push(...match.advanceTick([{ actorId: 'player', move: null, bomb: true }]));
  while (!match.readWorld().result) events.push(...match.advanceTick([]));
  return { match, initial, events };
}

test('ordered gameplay events produce feedback once, even when a frame or view is presented again', () => {
  const { initial, match, events } = explode();
  const feedback = createFeedback(initial);
  const first = feedback.present(match.readWorld(), events, 0);
  expect(first.events).toEqual(events);
  expect(first.sounds.map(sound => sound.kind)).toContain('explosion');
  expect(first.effects.map(effect => effect.kind)).toContain('elimination');
  const repeated = feedback.present(match.readWorld(), events, 0);
  expect(repeated.events).toEqual([]);
  expect(repeated.sounds).toEqual([]);
  expect(repeated.effects).toEqual(first.effects);
});

test('danger follows only real hazard cells while terminal effects age on a separately paused presentation clock', () => {
  const { initial, match, events } = explode(), world = match.readWorld();
  const feedback = createFeedback(initial);
  const first = feedback.present(world, events, 0);
  expect(first.danger.map(cell => cell.position)).toEqual(world.hazards.flatMap(hazard => hazard.cells));
  const frozen = feedback.present(world, [], 2000, { paused: true });
  expect(frozen.effects).toEqual(first.effects);
  const aged = feedback.present(world, [], 200);
  expect(aged.effects[0]?.ageMs).toBe(200);
  expect(aged.danger).toEqual(first.danger);
  // A rule snapshot without hazards must never retain fire through a presentation timer.
  const clear = feedback.present({ ...world, hazards: [] }, [], 300);
  expect(clear.danger).toEqual([]); expect(clear.effects).toEqual([]);
  expect(match.readWorld()).toEqual(world);
});

test('destruction uses original blocker position and pickups identify the actual gain in the actor card', () => {
  const { initial, match, events } = explode(), feedback = createFeedback(initial);
  const destruction = feedback.present(match.readWorld(), events, 0).effects.find(effect => effect.kind === 'break');
  expect(destruction?.position).toEqual({ x: 3.5, y: 1.5 });
  const pickup: GameplayEvent = { type: 'item-collected', tick: 7, order: 0, itemId: 'pickup', kind: 'item.speed', actorId: 'other',
    abilities: { bombCapacity: 1, blastRange: 2, speed: 3.5 } };
  const frame = feedback.present(match.readWorld(), [pickup], 0);
  expect(frame.effects.find(effect => effect.kind === 'pickup')).toMatchObject({ actorId: 'other', label: '速度 ↑ 3.5' });
  expect(frame.sounds.map(sound => sound.kind)).toEqual(['pickup']);
});

test('volume and particle budgets bound presentation without losing danger, gains or event history', () => {
  const { initial, match, events } = explode(), feedback = createFeedback(initial, { volume: .2, particleBudget: 5 });
  const first = feedback.present(match.readWorld(), events, 0);
  expect(first.sounds.every(sound => sound.volume === .2)).toBe(true);
  expect(first.effects.reduce((sum, effect) => sum + effect.particles, 0)).toBe(5);
  feedback.configure({ volume: 0, particleBudget: 0 });
  const silent = feedback.present(match.readWorld(), events, 0);
  expect(silent.sounds).toEqual([]); expect(silent.effects.every(effect => effect.particles === 0)).toBe(true);
  expect(silent.danger.length).toBeGreaterThan(0);
  expect(() => feedback.configure({ volume: 2 })).toThrow(RangeError);
  expect(() => feedback.configure({ particleBudget: -1 })).toThrow(RangeError);
});

test('entities mode and paused frames consume history silently, and disposing cannot revive effects', () => {
  const { initial, match, events } = explode(), feedback = createFeedback(initial);
  const hidden = feedback.present(match.readWorld(), events, 0, { visible: false });
  expect(hidden.sounds).toEqual([]); expect(hidden.effects).toEqual([]);
  const restored = feedback.present(match.readWorld(), events, 0);
  expect(restored.sounds).toEqual([]); expect(restored.effects).toEqual([]);
  const pickup: GameplayEvent = { type: 'item-collected', tick: 9, order: 0, itemId: 'pickup', kind: 'item.range', actorId: 'other', abilities: { bombCapacity: 1, blastRange: 3, speed: 3 } };
  expect(feedback.present(match.readWorld(), [pickup], 0, { paused: true }).sounds).toEqual([]);
  expect(feedback.present(match.readWorld(), [pickup], 0).sounds).toEqual([]);
  feedback.dispose();
  expect(feedback.present(match.readWorld(), events, 0)).toMatchObject({ events: [], effects: [], sounds: [], danger: [] });
  const retry = createFeedback(initial);
  expect(retry.present(match.readWorld(), events, 0).sounds.length).toBeGreaterThan(0);
});

test('a dense chain has bounded effect and sound work, and reduced motion retains essential danger', () => {
  const { initial, match } = explode(), world = match.readWorld();
  const events: GameplayEvent[] = Array.from({ length: 100 }, (_, order) => ({ type: 'bomb-exploded', tick: 6, order,
    bombId: `bomb-${order}`, hazardId: `fire-${order}`, cells: [{ x: 1, y: 1 }] }));
  const feedback = createFeedback(initial);
  const first = feedback.present(world, events, 0);
  expect(first.effects.length).toBeLessThanOrEqual(32);
  expect(first.sounds.length).toBeLessThanOrEqual(6);
  expect(first.effects.reduce((sum, effect) => sum + effect.particles, 0)).toBeLessThanOrEqual(96);
  feedback.configure({ reducedMotion: true });
  const reduced = feedback.present(world, [], 100);
  expect(reduced.effects.every(effect => effect.particles === 0)).toBe(true);
  expect(reduced.danger).toEqual(first.danger);
  expect(feedback.present(world, [], 1000).effects).toEqual([]);
});

test('real fire expiry removes directional danger immediately, independently of remaining debris', () => {
  const match = createMatch({ ...config, rules: { ...config.rules, speed: 60 } }), feedback = createFeedback(match.readWorld());
  for (let tick = 0; tick < 6; tick++) {
    const events = match.advanceTick([{ actorId: 'player', move: 'down', bomb: tick === 0 }]);
    feedback.present(match.readWorld(), events, 0);
  }
  const fire = feedback.present(match.readWorld(), [], 0);
  expect(fire.danger.find(cell => cell.position.x === 1 && cell.position.y === 1)?.connections).toEqual(['up', 'right', 'down', 'left']);
  while (match.readWorld().tick < 18) { const events = match.advanceTick([]); feedback.present(match.readWorld(), events, 0); }
  const clear = feedback.present(match.readWorld(), [], 0);
  expect(clear.danger).toEqual([]);
  expect(clear.effects.some(effect => effect.kind === 'break')).toBe(true);
});

test('sound and particle settings leave identical input worlds, gameplay events and random drops', () => {
  const left = createMatch(config), right = createMatch(config);
  const loud = createFeedback(left.readWorld(), { volume: 1, particleBudget: 256 });
  const quiet = createFeedback(right.readWorld(), { volume: 0, particleBudget: 0, reducedMotion: true });
  for (let tick = 0; tick < 35; tick++) {
    const intents = [{ actorId: 'player', move: null, bomb: tick === 0 }];
    const events = left.advanceTick(intents), replay = right.advanceTick(intents);
    const loudFrame = loud.present(left.readWorld(), events, 16), quietFrame = quiet.present(right.readWorld(), replay, 100);
    expect(quietFrame.sounds).toEqual([]); expect(quietFrame.danger).toEqual(loudFrame.danger);
    expect(events).toEqual(replay); expect(left.readWorld()).toEqual(right.readWorld());
  }
});
