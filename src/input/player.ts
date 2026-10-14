import { createKeyboardInput, type KeyboardInput } from './keyboard.js';
import type { Direction, Position } from '../match/index.js';

export interface PlayerInput extends KeyboardInput {
  pointerDown(id: number, control: 'joystick' | 'bomb', offset?: Position): boolean;
  pointerMove(id: number, offset: Position): boolean;
  pointerUp(id: number): boolean;
  pointerCancel(id: number): boolean;
  readTouch(): TouchState;
}
export interface TouchState {
  readonly joystickActive: boolean;
  readonly knob: Position;
  readonly direction: Direction | null;
  readonly bombHeld: boolean;
}
export interface JoystickConfig { readonly deadZone: number; readonly directionThreshold: number }

/** Pointer offsets are normalized to the joystick radius by the browser adapter. */
export function createPlayerInput(config: Partial<JoystickConfig> = {}): PlayerInput {
  const settings = { deadZone: 0.2, directionThreshold: 1.25, ...config };
  if (!Number.isFinite(settings.deadZone) || settings.deadZone < 0 || settings.deadZone >= 1
    || !Number.isFinite(settings.directionThreshold) || settings.directionThreshold < 1) {
    throw new RangeError('Joystick deadZone must be in [0, 1) and directionThreshold must be finite and at least 1');
  }
  const keyboard = createKeyboardInput();
  let joystick: number | null = null;
  let bombPointer: number | null = null;
  let direction: Direction | null = null;
  let knob: Position = { x: 0, y: 0 };
  let bombPending = false;
  const move = (offset: Position) => {
    const scale = Math.max(1, Math.hypot(offset.x, offset.y));
    knob = { x: offset.x / scale, y: offset.y / scale };
    if (Math.hypot(offset.x, offset.y) <= settings.deadZone) { direction = null; return; }
    const horizontal = Math.abs(offset.x);
    const vertical = Math.abs(offset.y);
    const previousHorizontal = direction === 'left' || direction === 'right';
    const onHorizontal = direction === null ? horizontal >= vertical
      : previousHorizontal ? vertical <= horizontal * settings.directionThreshold
      : horizontal > vertical * settings.directionThreshold;
    direction = onHorizontal ? offset.x >= 0 ? 'right' : 'left' : offset.y >= 0 ? 'down' : 'up';
  };
  const clear = () => {
    keyboard.clear(); joystick = null; bombPointer = null; direction = null; bombPending = false; knob = { x: 0, y: 0 };
  };
  const validOffset = (offset: Position) => Number.isFinite(offset.x) && Number.isFinite(offset.y);
  return {
    keyDown: keyboard.keyDown,
    keyUp: keyboard.keyUp,
    pointerDown(id, control, offset = { x: 0, y: 0 }) {
      if (!validOffset(offset)) return false;
      if (id === joystick || id === bombPointer) return false;
      if (control === 'joystick') {
        if (joystick !== null) return false;
        joystick = id;
        move(offset);
      } else {
        if (bombPointer !== null) return false;
        bombPointer = id;
        bombPending = true;
      }
      return true;
    },
    pointerMove(id, offset) {
      if (id !== joystick || !validOffset(offset)) return false;
      move(offset);
      return true;
    },
    pointerUp(id) {
      if (id === joystick) { joystick = null; direction = null; knob = { x: 0, y: 0 }; return true; }
      if (id === bombPointer) { bombPointer = null; return true; }
      return false;
    },
    pointerCancel(id) {
      if (id !== joystick && id !== bombPointer) return false;
      clear();
      return true;
    },
    readTouch() {
      return Object.freeze({ joystickActive: joystick !== null, knob: Object.freeze({ ...knob }), direction, bombHeld: bombPointer !== null });
    },
    consumeIntent(actorId) {
      const held = keyboard.consumeIntent(actorId);
      const intent = { actorId, move: joystick === null ? held.move : direction, bomb: held.bomb || bombPending };
      bombPending = false;
      return intent;
    },
    clear,
  };
}
