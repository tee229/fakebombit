import { controlRevision, readControlPreferences, type MarginName } from './control-preferences.js';

export const controlGeometry = {
  defaults: { joystickLeft: 12, joystickBottom: 8, bombRight: 12, bombBottom: 8 },
  actual: { joystickLeft: 12, joystickBottom: 8, bombRight: 12, bombBottom: 8 },
  maximum: { joystickLeft: 24, joystickBottom: 150, bombRight: 24, bombBottom: 150 },
  floatingArea: { left: 0, top: 100, right: 152, bottom: 360 },
};
export const arenaLayout = {
  width: 1024, height: 576,
  cssScale: 1, compact: false, active: true, revision: 0,
  board: { x: 242, y: 84, width: 540, height: 450, cell: 60 },
  actorCards: { left: 16, right: 802, top: 96, rightTop: 96, width: 206, height: 88, gap: 8 },
  joystick: { x: 118, y: 370, radius: 86 },
  bomb: { x: 900, y: 370, radius: 72 },
  menu: { x: 970, y: 44, width: 92, height: 72 },
  retry: { x: 900, y: 514, width: 160, height: 80 },
  newMatch: { x: 118, y: 514, width: 184, height: 64 },
  resume: { x: 512, y: 356, width: 268, height: 88 },
  volume: { x: 386, y: 446, width: 230, height: 58 },
  particles: { x: 638, y: 446, width: 230, height: 58 },
  report: { x: 512, y: 510 },
  title: { x: 24, y: 18 }, timer: { x: 688, y: 43 }, progress: { x: 386, y: 22 },
  pauseTitle: { x: 512, y: 254 }, pauseMessage: { x: 512, y: 298 },
};

let previous = '';

/** Presentation coordinates only. Keep a uniform scale, and spend wide-screen
 * space on the thumb zones instead of putting the entire 16:9 screen in a box. */
export function updateArenaLayout(viewportWidth: number, viewportHeight: number, active = true): boolean {
  if (!(viewportWidth > 0 && viewportHeight > 0)) return false;
  const key = `${viewportWidth}:${viewportHeight}:${active}:${controlRevision()}`;
  if (key === previous) return false;
  previous = key;
  const s = Math.min(viewportWidth / 1024, viewportHeight / 576);
  const width = viewportWidth / s, height = viewportHeight / s;
  const compact = viewportWidth > viewportHeight && viewportHeight < 500;
  Object.assign(arenaLayout, { width, height, cssScale: s, compact, active, revision: arenaLayout.revision + 1 });
  const point = (target: { x: number; y: number }, x: number, y: number) => Object.assign(target, { x, y });
  const rectangle = (target: { x: number; y: number; width: number; height: number }, x: number, y: number, w: number, h: number) => Object.assign(target, { x, y, width: w, height: h });
  if (compact) {
    const wing = Math.max(152, Math.min(232, (viewportWidth - (viewportHeight - 16) * 17 / 15) / 2));
    // Short screens use an asymmetric side rail. Taller, narrow screens can fit
    // the original board below the toolbar without sacrificing its cell size.
    const belowToolbar = viewportWidth - 2 * wing <= (viewportHeight - 60) * 17 / 15;
    const rightWing = belowToolbar ? wing : 232;
    const leftWing = belowToolbar ? wing : Math.max(152, Math.min(wing, viewportWidth - rightWing - (viewportHeight - 16) * 17 / 15));
    Object.assign(arenaLayout.board, { x: leftWing / s, y: (belowToolbar ? 52 : 8) / s,
      width: (viewportWidth - leftWing - rightWing) / s, height: (viewportHeight - (belowToolbar ? 60 : 16)) / s });
    Object.assign(arenaLayout.actorCards, { left: 12 / s, right: (viewportWidth - rightWing + 12) / s,
      top: 32 / s, rightTop: 50 / s, width: (Math.min(leftWing, rightWing) - 24) / s, height: (viewportHeight >= 320 ? 44 : 28) / s, gap: 4 / s });
    Object.assign(arenaLayout.joystick, { x: 76 / s, y: (viewportHeight - 72) / s, radius: 64 / s });
    Object.assign(arenaLayout.bomb, { x: (viewportWidth - 76) / s, y: (viewportHeight - 72) / s, radius: 64 / s });
    rectangle(arenaLayout.menu, (viewportWidth - rightWing / 2) / s, (viewportHeight - 78) / s, 96 / s, 44 / s);
    rectangle(arenaLayout.retry, (viewportWidth - rightWing / 2) / s, (viewportHeight - 26) / s, 96 / s, 44 / s);
    rectangle(arenaLayout.newMatch, wing / 2 / s, (viewportHeight - 26) / s, 96 / s, 44 / s);
    point(arenaLayout.report, wing / 2 / s, (viewportHeight - 130) / s);
    const center = width / 2, buttonWidth = Math.min(224 / s, arenaLayout.board.width - 16 / s);
    rectangle(arenaLayout.resume, center, 109 / s, buttonWidth, 44 / s);
    rectangle(arenaLayout.volume, center, 161 / s, buttonWidth, 44 / s);
    rectangle(arenaLayout.particles, center, 213 / s, buttonWidth, 44 / s);
    point(arenaLayout.pauseTitle, center, 32 / s); point(arenaLayout.pauseMessage, center, 58 / s);
    point(arenaLayout.title, 12 / s, 5 / s); point(arenaLayout.timer, (wing - 62) / s, 6 / s);
    point(arenaLayout.progress, (wing - 88) / s, 128 / s);
  } else {
    Object.assign(arenaLayout.board, { x: (width - 540) / 2, y: 84, width: 540, height: height - 126 });
    Object.assign(arenaLayout.actorCards, { left: 16, right: width - 222, top: 96, rightTop: 96, width: 206, height: 88, gap: 8 });
    Object.assign(arenaLayout.joystick, { x: 118, y: height - 206, radius: 86 });
    Object.assign(arenaLayout.bomb, { x: width - 124, y: height - 206, radius: 72 });
    rectangle(arenaLayout.menu, width - 124, height - 154, 160, 64);
    rectangle(arenaLayout.retry, width - 124, height - 62, 160, 80); rectangle(arenaLayout.newMatch, 118, height - 62, 184, 64);
    rectangle(arenaLayout.resume, width / 2, height / 2 + 68, 268, 88);
    rectangle(arenaLayout.volume, width / 2 - 126, height / 2 + 158, 230, 58);
    rectangle(arenaLayout.particles, width / 2 + 126, height / 2 + 158, 230, 58);
    point(arenaLayout.report, width / 2, height / 2 + 222);
    point(arenaLayout.title, 24, 18); point(arenaLayout.timer, arenaLayout.board.x + 446, 43);
    point(arenaLayout.progress, arenaLayout.board.x + 144, 22);
    point(arenaLayout.pauseTitle, width / 2, height / 2 - 34); point(arenaLayout.pauseMessage, width / 2, height / 2 + 10);
  }
  const p = readControlPreferences();
  const cards = arenaLayout.actorCards;
  const place = (control: 'joystick' | 'bomb', side: 'joystickLeft' | 'bombRight', bottom: 'joystickBottom' | 'bombBottom') => {
    const shape = arenaLayout[control], radius = shape.radius * s;
    const sideWidth = control === 'joystick' ? arenaLayout.board.x * s : viewportWidth - (arenaLayout.board.x + arenaLayout.board.width) * s;
    const cardTop = control === 'joystick' ? cards.top : cards.rightTop;
    const top = Math.min((cardTop + cards.height * 2 + cards.gap) * s + 1, viewportHeight - radius * 2);
    const defaultSide = (control === 'joystick' ? shape.x : width - shape.x) * s - radius;
    const defaultBottom = viewportHeight - shape.y * s - radius;
    controlGeometry.defaults[side] = Math.round(defaultSide); controlGeometry.defaults[bottom] = Math.round(defaultBottom);
    controlGeometry.maximum[side] = Math.max(0, Math.floor(sideWidth - radius * 2 - 4));
    controlGeometry.maximum[bottom] = Math.max(0, Math.floor(viewportHeight - top - radius * 2));
    const margin = (name: MarginName) => Math.max(0, Math.min(controlGeometry.maximum[name], p[name] ?? controlGeometry.defaults[name]));
    controlGeometry.actual[side] = margin(side); controlGeometry.actual[bottom] = margin(bottom);
    shape.x = (control === 'joystick' ? margin(side) + radius : viewportWidth - margin(side) - radius) / s;
    shape.y = (viewportHeight - margin(bottom) - radius) / s;
    if (control === 'joystick') Object.assign(controlGeometry.floatingArea, { left: 0, top: top / s, right: (sideWidth - 4) / s, bottom: height });
  };
  place('joystick', 'joystickLeft', 'joystickBottom'); place('bomb', 'bombRight', 'bombBottom');
  return true;
}
