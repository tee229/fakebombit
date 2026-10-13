import { expect, test } from 'vitest';
import { createKeyboardInput } from '../src/input/keyboard.js';

test('held keyboard direction produces sustained cardinal intents and release stops movement', () => {
  const input = createKeyboardInput();
  expect(input.keyDown('KeyD')).toBe(true);
  expect(input.consumeIntent('player')).toEqual({ actorId: 'player', move: 'right', bomb: false });
  expect(input.consumeIntent('player')).toEqual({ actorId: 'player', move: 'right', bomb: false });
  expect(input.keyUp('KeyD')).toBe(true);
  expect(input.consumeIntent('player')).toEqual({ actorId: 'player', move: null, bomb: false });
});

test('space is one action per press, repeats do not enqueue bombs, and release re-arms it', () => {
  const input = createKeyboardInput();
  expect(input.keyDown('Space')).toBe(true);
  input.keyDown('Space');
  expect(input.consumeIntent('player').bomb).toBe(true);
  input.keyDown('Space');
  expect(input.consumeIntent('player').bomb).toBe(false);
  input.keyUp('Space');
  input.keyDown('Space');
  expect(input.consumeIntent('player').bomb).toBe(true);
});

test('last pressed direction wins, repeating an older key cannot steal priority, and release restores a held direction', () => {
  const input = createKeyboardInput();
  input.keyDown('KeyW'); input.keyDown('KeyD'); input.keyDown('KeyW');
  expect(input.consumeIntent('player').move).toBe('right');
  input.keyUp('KeyD');
  expect(input.consumeIntent('player').move).toBe('up');
  input.keyDown('ArrowUp'); input.keyUp('KeyW');
  expect(input.consumeIntent('player').move).toBe('up');
  input.keyUp('ArrowUp');
  expect(input.consumeIntent('player').move).toBeNull();
});

test('clearing input drops pending actions and repeats after clear cannot restart movement or bombing', () => {
  const input = createKeyboardInput();
  input.keyDown('KeyD'); input.keyDown('Space'); input.clear();
  input.keyDown('KeyD', true); input.keyDown('Space', true);
  expect(input.consumeIntent('player')).toEqual({ actorId: 'player', move: null, bomb: false });
  expect(input.keyDown('KeyQ')).toBe(false);
  expect(input.keyUp('KeyQ')).toBe(false);
  input.keyDown('Space');
  expect(input.consumeIntent('player').bomb).toBe(true);
});
