import type { Controls, Margin } from './preferences.js';
export interface Rect { x: number; y: number; width: number; height: number }
export interface Circle { x: number; y: number; radius: number }
export interface Viewport { width: number; height: number; pixelRatio: number; safe: Rect; capsule: Rect | null }
export interface Layout {
  safe: Rect; board: Rect & { cell: number }; wing: number; portrait: boolean;
  joystick: Circle; bomb: Circle; floating: Rect; cardLeft: number; cardRight: number; cardY: number; cardWidth: number; cardHeight: number;
  actual: Record<Margin, number>; maximum: Record<Margin, number>; toolbarY: number; toolbarX: number;
}
export function readViewport(host: Pick<WechatMinigame.Wx, 'getWindowInfo' | 'getMenuButtonBoundingClientRect'>): Viewport {
  const v = host.getWindowInfo(), safe = v.safeArea;
  let capsule: Rect | null = null;
  try { const r = host.getMenuButtonBoundingClientRect(); if (r.width > 0) capsule = { x: r.left, y: r.top, width: r.width, height: r.height }; } catch { /* A simulator may not expose capsule bounds. */ }
  return { width: v.windowWidth, height: v.windowHeight, pixelRatio: Math.min(3, Math.max(1, v.pixelRatio)),
    safe: { x: Math.max(0, safe.left), y: Math.max(0, safe.top), width: Math.min(v.windowWidth, safe.right) - Math.max(0, safe.left), height: Math.min(v.windowHeight, safe.bottom) - Math.max(0, safe.top) }, capsule };
}
export function layoutFor(viewport: Viewport, preferences: Controls): Layout {
  const s = viewport.safe, portrait = s.width < s.height;
  const top = s.y + 8;
  const usableHeight = s.height - 32;
  const wing = portrait ? 0 : Math.max(140, Math.min(210, (s.width - usableHeight * 17 / 15) / 2));
  const cell = Math.max(1, Math.min((s.width - wing * 2 - 16) / 17, (portrait ? s.height * .54 : usableHeight) / 15));
  const board = { x: s.x + (s.width - cell * 17) / 2, y: portrait ? s.y + 106 : s.y + (s.height - cell * 15) / 2, width: cell * 17, height: cell * 15, cell };
  const toolbarY = Math.max(top, viewport.capsule && viewport.capsule.y < top + 48 ? viewport.capsule.y + viewport.capsule.height + 8 : top);
  const cardHeight = s.height < 280 ? 24 : s.height < 340 ? 30 : 44;
  const cardY = Math.max(top + 44, toolbarY + 52);
  const cardWidth = portrait ? (s.width - 32) / 2 : Math.min(board.x - s.x - 20, s.x + s.width - board.x - board.width - 20);
  const cardLeft = s.x + 8, cardRight = s.x + s.width - cardWidth - 8;
  const controlTop = portrait ? board.y + board.height + 16 : cardY + cardHeight * 2 + 12;
  const radius = Math.max(24, Math.min(64, s.width / 5, (s.y + s.height - controlTop - 8) / 2));
  const maxSide = Math.max(0, (portrait ? s.width / 2 : Math.min(board.x - s.x, s.x + s.width - board.x - board.width)) - radius * 2 - 4);
  const maxBottom = Math.max(0, s.y + s.height - controlTop - radius * 2);
  const maximum = { joystickLeft: Math.floor(maxSide), joystickBottom: Math.floor(maxBottom), bombRight: Math.floor(maxSide), bombBottom: Math.floor(maxBottom) };
  const actual = Object.fromEntries(Object.entries(maximum).map(([name, max]) => [name, Math.max(0, Math.min(max, preferences[name as Margin] ?? (name.endsWith('Bottom') ? 8 : 12)))])) as Record<Margin, number>;
  const joystick = { x: s.x + radius + actual.joystickLeft, y: s.y + s.height - radius - actual.joystickBottom, radius };
  const bomb = { x: s.x + s.width - radius - actual.bombRight, y: s.y + s.height - radius - actual.bombBottom, radius };
  return { safe: s, board, wing, portrait, joystick, bomb, floating: { x: s.x, y: controlTop, width: portrait ? s.width / 2 - 8 : board.x - s.x - 8, height: Math.max(0, s.y + s.height - controlTop) },
    cardLeft, cardRight, cardY, cardWidth, cardHeight, actual, maximum, toolbarY, toolbarX: s.x + s.width - 8 - 4 * 48 };
}
export const contains = (rect: Rect, x: number, y: number): boolean => x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height;
export const inCircle = (circle: Circle, x: number, y: number): boolean => Math.hypot(x - circle.x, y - circle.y) <= circle.radius;
