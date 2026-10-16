export const arenaLayout = {
  width: 1024, height: 576,
  board: { x: 242, y: 84, width: 540, height: 450, cell: 60 },
  actorCards: { left: 16, right: 802, top: 96, width: 206, height: 88, gap: 8 },
  joystick: { x: 118, y: 370, radius: 86 },
  bomb: { x: 900, y: 370, radius: 72 },
  pause: { x: 860, y: 44, width: 104, height: 72 },
  menu: { x: 970, y: 44, width: 92, height: 72 },
  retry: { x: 900, y: 514, width: 160, height: 80 },
  newMatch: { x: 118, y: 514, width: 184, height: 64 },
  resume: { x: 512, y: 356, width: 268, height: 88 },
} as const;
