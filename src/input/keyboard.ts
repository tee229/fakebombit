import type { Direction, GameplayIntent } from '../match/index.js';

export interface KeyboardInput {
  keyDown(code: string, repeat?: boolean): boolean;
  keyUp(code: string): boolean;
  consumeIntent(actorId: string): GameplayIntent;
  clear(): void;
}

export function createKeyboardInput(): KeyboardInput {
  const directions: Record<string, Direction> = {
    KeyW: 'up', ArrowUp: 'up', KeyD: 'right', ArrowRight: 'right',
    KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left',
  };
  const held = new Map<string, Direction>();
  let spaceHeld = false;
  let bombPending = false;
  return {
    keyDown(code, repeat = false) {
      if (repeat) return code === 'Space' || Object.hasOwn(directions, code);
      if (code === 'Space') {
        if (!spaceHeld) bombPending = true;
        spaceHeld = true;
        return true;
      }
      if (!Object.hasOwn(directions, code)) return false;
      if (!held.has(code)) held.set(code, directions[code]!);
      return true;
    },
    keyUp(code) {
      if (code === 'Space') { spaceHeld = false; return true; }
      if (!Object.hasOwn(directions, code)) return false;
      held.delete(code);
      return true;
    },
    consumeIntent(actorId) {
      const intent = { actorId, move: [...held.values()].at(-1) ?? null, bomb: bombPending };
      bombPending = false;
      return intent;
    },
    clear() { held.clear(); spaceHeld = false; bombPending = false; },
  };
}
