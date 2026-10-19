export const arenaLayout = {
  width: 1024, height: 576,
  cssScale: 1, compact: false, active: true, revision: 0,
  board: { x: 242, y: 84, width: 540, height: 450, cell: 60 },
  actorCards: { left: 16, right: 802, top: 96, rightTop: 96, width: 206, height: 88, gap: 8 },
  joystick: { x: 118, y: 370, radius: 86 },
  bomb: { x: 900, y: 370, radius: 72 },
  pause: { x: 860, y: 44, width: 104, height: 72 },
  menu: { x: 970, y: 44, width: 92, height: 72 },
  retry: { x: 900, y: 514, width: 160, height: 80 },
  newMatch: { x: 118, y: 514, width: 184, height: 64 },
  resume: { x: 512, y: 356, width: 268, height: 88 },
  volume: { x: 386, y: 446, width: 230, height: 58 },
  particles: { x: 638, y: 446, width: 230, height: 58 },
  fullscreen: { x: 0, y: 0, width: 44, height: 44 },
  switchView: { x: 300, y: 34, width: 108, height: 64 },
  report: { x: 512, y: 510 },
  title: { x: 24, y: 18 }, timer: { x: 688, y: 43 }, progress: { x: 386, y: 22 },
  pauseTitle: { x: 512, y: 254 }, pauseMessage: { x: 512, y: 298 },
};

let previous = '';

/** Presentation coordinates only. Keep a uniform scale, and spend wide-screen
 * space on the thumb zones instead of putting the entire 16:9 screen in a box. */
export function updateArenaLayout(viewportWidth: number, viewportHeight: number, active = true): boolean {
  if (!(viewportWidth > 0 && viewportHeight > 0)) return false;
  const key = `${viewportWidth}:${viewportHeight}:${active}`;
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
    Object.assign(arenaLayout.board, { x: wing / s, y: 8 / s, width: (viewportWidth - wing * 2) / s, height: (viewportHeight - 16) / s });
    Object.assign(arenaLayout.actorCards, { left: 12 / s, right: (viewportWidth - wing + 12) / s,
      top: 32 / s, rightTop: 8 / s, width: (wing - 24) / s, height: 36 / s, gap: 4 / s });
    Object.assign(arenaLayout.joystick, { x: 76 / s, y: (viewportHeight - 72) / s, radius: 64 / s });
    Object.assign(arenaLayout.bomb, { x: (viewportWidth - 76) / s, y: (viewportHeight - 72) / s, radius: 64 / s });
    rectangle(arenaLayout.pause, (viewportWidth - wing + 32) / s, 110 / s, 48 / s, 44 / s);
    rectangle(arenaLayout.fullscreen, (viewportWidth - (active ? wing - 36 : wing / 2)) / s,
      (active ? 162 : viewportHeight - 130) / s, 56 / s, 44 / s);
    rectangle(arenaLayout.menu, (viewportWidth - wing / 2) / s, (viewportHeight - 78) / s, 96 / s, 44 / s);
    rectangle(arenaLayout.retry, (viewportWidth - wing / 2) / s, (viewportHeight - 26) / s, 96 / s, 44 / s);
    rectangle(arenaLayout.newMatch, wing / 2 / s, (viewportHeight - 26) / s, 96 / s, 44 / s);
    rectangle(arenaLayout.switchView, wing / 2 / s, (viewportHeight - 78) / s, 112 / s, 44 / s);
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
    rectangle(arenaLayout.pause, width - 164, 44, 104, 72); rectangle(arenaLayout.menu, width - 54, 44, 92, 72);
    rectangle(arenaLayout.retry, width - 124, height - 62, 160, 80); rectangle(arenaLayout.newMatch, 118, height - 62, 184, 64);
    rectangle(arenaLayout.resume, width / 2, height / 2 + 68, 268, 88);
    rectangle(arenaLayout.volume, width / 2 - 126, height / 2 + 158, 230, 58);
    rectangle(arenaLayout.particles, width / 2 + 126, height / 2 + 158, 230, 58);
    rectangle(arenaLayout.switchView, arenaLayout.board.x + 58, 34, 108, 64);
    point(arenaLayout.report, width / 2, height / 2 + 222);
    point(arenaLayout.title, 24, 18); point(arenaLayout.timer, arenaLayout.board.x + 446, 43);
    point(arenaLayout.progress, arenaLayout.board.x + 144, 22);
    point(arenaLayout.pauseTitle, width / 2, height / 2 - 34); point(arenaLayout.pauseMessage, width / 2, height / 2 + 10);
  }
  return true;
}
