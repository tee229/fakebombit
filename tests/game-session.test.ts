import { expect, test } from 'vitest';
import { createGameSession } from '../src/game-flow/session.js';
import { createKeyboardInput } from '../src/input/keyboard.js';
import { createPlayerInput } from '../src/input/player.js';
import { createMatch, type MatchConfig } from '../src/match/index.js';

const config: MatchConfig = {
  seed: 'browser-flow', playerId: 'player',
  map: { width: 12, height: 7, ground: Array.from({ length: 84 }, () => 'floor'), blockers: [], spawns: [{ id: 'start', x: 1, y: 1 }, { id: 'other', x: 10, y: 5 }] },
  actors: [{ id: 'player', type: 'actor', spawnId: 'start' }, { id: 'other', type: 'actor', spawnId: 'other' }],
};

test('background pause freezes the entire match, clears held and pending input, and manual resume discards the background frame', () => {
  const input = createKeyboardInput();
  const session = createGameSession(createMatch(config), input);
  input.keyDown('KeyD'); input.keyDown('Space');
  const before = session.advanceFrame(20);
  input.keyUp('Space'); input.keyDown('Space');
  session.pause('background');
  const paused = session.advanceFrame(60_000);
  expect(paused.phase).toBe('paused');
  expect(paused.world).toEqual(before.world);
  expect(paused.events).toEqual([]);
  expect(paused.steps).toBe(0);
  session.resume();
  const firstResume = session.advanceFrame(60_000);
  expect(firstResume.world).toEqual(before.world);
  expect(firstResume.alpha).toBe(1);
  const resumed = session.advanceFrame(20);
  expect(resumed.phase).toBe('playing');
  expect(resumed.world.tick).toBe(before.world.tick + 1);
  expect(resumed.world.actors[0]?.position).toEqual(before.world.actors[0]?.position);
  expect(resumed.events).toEqual([]);
});

test.each([30, 60, 120])('touch movement and a quick bomb tap are independent of %s FPS and catch-up steps', fps => {
  const input = createPlayerInput();
  const session = createGameSession(createMatch(config), input);
  input.pointerDown(11, 'joystick', { x: 0.8, y: 0.1 });
  input.pointerDown(22, 'bomb'); input.pointerUp(22);
  expect(session.advanceFrame(0).events).toEqual([]);
  let placements = 0;
  for (let frame = 0; frame < fps; frame++) placements += session.advanceFrame(1000 / fps).events.filter(event => event.type === 'bomb-placed').length;
  const end = session.advanceFrame(0);
  expect(end.world.tick).toBe(60);
  expect(end.world.actors[0]?.position.x).toBeCloseTo(4.5);
  expect(end.world.bombs[0]?.detonateAtTick).toBe(180);
  expect(placements).toBe(1);
});

test('manual pause discards fractional time and ignores touches queued while paused until fresh input after resume', () => {
  const input = createPlayerInput();
  const session = createGameSession(createMatch(config), input);
  session.advanceFrame(15);
  expect(session.pause()).toBe(true);
  input.pointerDown(11, 'joystick', { x: 0.8, y: 0 }); input.pointerDown(22, 'bomb');
  expect(session.pause()).toBe(false);
  expect(session.advanceFrame(1000).pauseReason).toBe('manual');
  expect(session.resume()).toBe(true);
  expect(session.resume()).toBe(false);
  expect(session.advanceFrame(1000).steps).toBe(0);
  expect(session.advanceFrame(10).steps).toBe(0);
  const next = session.advanceFrame(10);
  expect(next.steps).toBe(1);
  expect(next.events).toEqual([]);
  expect(next.world.actors[0]?.position).toEqual({ x: 1.5, y: 1.5 });
  input.pointerDown(33, 'joystick', { x: 0.8, y: 0 });
  expect(session.advanceFrame(20).world.actors[0]?.position.x).toBeCloseTo(1.55);
});

test('a frame advances complete logical steps with held input and preserves consecutive logical positions', () => {
  const input = createKeyboardInput();
  const session = createGameSession(createMatch(config), input);
  input.keyDown('KeyD');
  const frame = session.advanceFrame(50);
  expect(frame.steps).toBe(3);
  expect(frame.world.tick).toBe(3);
  expect(frame.world.actors[0]?.position.x).toBeCloseTo(1.65);
  expect(frame.world.actors[0]?.previousPosition.x).toBeCloseTo(1.6);
  expect(frame.alpha).toBeCloseTo(0);
});

test('a long foreground stall runs at most five steps and discards the whole-step backlog', () => {
  const input = createKeyboardInput();
  const session = createGameSession(createMatch(config), input);
  input.keyDown('KeyD');
  const frame = session.advanceFrame(1000);
  expect(frame.steps).toBe(5);
  expect(frame.world.tick).toBe(5);
  expect(frame.world.actors[0]?.position.x).toBeCloseTo(1.75);
  expect(frame.droppedTimeMs).toBeCloseTo(916.6666666667);
  expect(frame.alpha).toBeCloseTo(0);
  expect(session.advanceFrame(0).steps).toBe(0);
});

test('frames without a complete step preserve a bomb press and catch-up consumes it exactly once', () => {
  const input = createKeyboardInput();
  const session = createGameSession(createMatch({ ...config, rules: { bombCapacity: 5 } }), input);
  input.keyDown('KeyD'); input.keyDown('Space');
  const waiting = session.advanceFrame(5);
  expect(waiting).toMatchObject({ steps: 0, events: [] });
  const frame = session.advanceFrame(65);
  expect(frame.steps).toBe(4);
  expect(frame.events.filter(event => event.type === 'bomb-placed')).toHaveLength(1);
  expect(frame.world.bombs).toHaveLength(1);
  expect(frame.world.bombs[0]).toMatchObject({ x: 1, y: 1, placedAtTick: 0 });
  expect(session.advanceFrame(0).events).toEqual([]);
  expect(session.advanceFrame(20).events).toEqual([]);
});

test.each([30, 60, 120])('rendering at %s FPS produces the same logical speed, time and bomb deadline', fps => {
  const input = createKeyboardInput();
  const session = createGameSession(createMatch(config), input);
  input.keyDown('KeyD'); input.keyDown('Space');
  for (let frame = 0; frame < fps; frame++) session.advanceFrame(1000 / fps);
  const end = session.advanceFrame(0);
  expect(end.world.tick).toBe(60);
  expect(end.world.actors[0]?.position.x).toBeCloseTo(4.5);
  expect(end.world.bombs[0]?.detonateAtTick).toBe(180);
  expect(end.alpha).toBeCloseTo(0);
});

test('substep interpolation progress changes without modifying logical positions or earlier snapshots', () => {
  const input = createKeyboardInput();
  const session = createGameSession(createMatch(config), input);
  input.keyDown('KeyD');
  const first = session.advanceFrame(20);
  const next = session.advanceFrame(5);
  expect(first.alpha).toBeCloseTo(0.2);
  expect(next.alpha).toBeCloseTo(0.5);
  expect(next.world).toEqual(first.world);
  expect(first.world.actors[0]).toMatchObject({ position: { x: 1.55, y: 1.5 }, previousPosition: { x: 1.5, y: 1.5 } });
  expect(Reflect.set(next.world.actors[0]!.position, 'x', 99)).toBe(false);
  expect(Reflect.set(next, 'alpha', 99)).toBe(false);
});

test('a terminal match stops stepping and future frames cannot re-deliver ending events', () => {
  const input = createKeyboardInput();
  const session = createGameSession(createMatch({ ...config, rules: { matchDurationSeconds: 1 / 60 } }), input);
  input.keyDown('KeyD');
  const end = session.advanceFrame(50);
  expect(end.steps).toBe(1);
  expect(end.alpha).toBe(1);
  expect(end.events.map(event => event.type)).toEqual(['match-ended']);
  expect(end.phase).toBe('ended');
  expect(session.pause()).toBe(false);
  expect(session.resume()).toBe(false);
  const after = session.advanceFrame(1000);
  expect(after.steps).toBe(0);
  expect(after.alpha).toBe(1);
  expect(after.events).toEqual([]);
  expect(after.world).toEqual(end.world);
});

test('invalid frame time is rejected without consuming input or changing the world', () => {
  const input = createKeyboardInput();
  const session = createGameSession(createMatch(config), input);
  input.keyDown('Space');
  const before = session.advanceFrame(0);
  for (const delta of [-1, NaN, Infinity]) expect(() => session.advanceFrame(delta)).toThrow(RangeError);
  expect(session.advanceFrame(0).world).toEqual(before.world);
  expect(session.advanceFrame(20).events.filter(event => event.type === 'bomb-placed')).toHaveLength(1);
});

test('catch-up retains fractional time for the next interpolation frame', () => {
  const session = createGameSession(createMatch(config), createKeyboardInput());
  const frame = session.advanceFrame(1005);
  expect(frame.steps).toBe(5);
  expect(frame.alpha).toBeCloseTo(0.3);
  expect(session.advanceFrame(10).steps).toBe(0);
  expect(session.advanceFrame(2).steps).toBe(1);
});
