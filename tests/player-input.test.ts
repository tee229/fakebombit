import { expect, test } from 'vitest';
import { createPlayerInput } from '../src/input/player.js';

test('two fingers can hold a cardinal joystick direction and press one bomb action without interrupting movement', () => {
  const input = createPlayerInput();
  expect(input.pointerDown(11, 'joystick', { x: 0.8, y: 0.1 })).toBe(true);
  expect(input.pointerDown(22, 'bomb')).toBe(true);
  expect(input.consumeIntent('player')).toEqual({ actorId: 'player', move: 'right', bomb: true });
  expect(input.consumeIntent('player')).toEqual({ actorId: 'player', move: 'right', bomb: false });
  input.pointerUp(22);
  expect(input.consumeIntent('player').move).toBe('right');
  input.pointerUp(11);
  expect(input.consumeIntent('player')).toEqual({ actorId: 'player', move: null, bomb: false });
});

test('configured dead zone stops movement and a direction threshold prevents diagonal jitter from stealing the held direction', () => {
  const input = createPlayerInput({ deadZone: 0.25, directionThreshold: 1.3 });
  input.pointerDown(11, 'joystick', { x: 0.1, y: 0.1 });
  expect(input.consumeIntent('player').move).toBeNull();
  input.pointerMove(11, { x: 0.5, y: 0.1 });
  expect(input.consumeIntent('player').move).toBe('right');
  input.pointerMove(11, { x: 0.5, y: 0.55 });
  expect(input.consumeIntent('player').move).toBe('right');
  input.pointerMove(11, { x: 0.1, y: 0.8 });
  expect(input.consumeIntent('player').move).toBe('down');
  input.pointerMove(11, { x: 0.1, y: 0.1 });
  expect(input.consumeIntent('player').move).toBeNull();
});

test('cancelling either active touch clears both fingers, keyboard holds and an unconsumed bomb, and ignores stale pointer events', () => {
  const input = createPlayerInput();
  input.keyDown('KeyD'); input.keyDown('Space');
  input.pointerDown(11, 'joystick', { x: 0, y: -0.8 });
  input.pointerDown(22, 'bomb');
  expect(input.pointerCancel(22)).toBe(true);
  expect(input.pointerMove(11, { x: 0.8, y: 0 })).toBe(false);
  expect(input.pointerDown(33, 'joystick', { x: 0, y: 0 })).toBe(true);
  expect(input.consumeIntent('player')).toEqual({ actorId: 'player', move: null, bomb: false });
  input.pointerMove(33, { x: -0.8, y: 0 });
  expect(input.pointerCancel(11)).toBe(false);
  expect(input.consumeIntent('player').move).toBe('left');
});
