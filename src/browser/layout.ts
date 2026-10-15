export const arenaLayout = {
  width: 1024, height: 576,
  board: { x: 242, y: 84, width: 540, height: 450, cell: 60 },
  joystick: { x: 118, y: 370, radius: 86 },
  bomb: { x: 900, y: 370, radius: 72 },
  pause: { x: 916, y: 50, width: 152, height: 80 },
  retry: { x: 900, y: 514, width: 160, height: 80 },
  newMatch: { x: 900, y: 220, width: 160, height: 64 },
  resume: { x: 512, y: 356, width: 268, height: 88 },
} as const;
