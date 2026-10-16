import type { ThemePackage, VisualDefinition } from './index.js';

const visual = (frames: readonly number[], framesPerSecond = 0): VisualDefinition => ({ resource: 'atlas', frames, framesPerSecond, loop: frames.length > 1,
  facing: 'none', referenceSize: { width: 64, height: 64 }, anchor: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 0 } });
function theme(id: string, label: string): ThemePackage {
  return { format: 'builtin-theme-v1', id, label,
    resources: [
      { id: 'atlas', url: `./themes/${id}-atlas.svg`, width: 512, height: 192, frameWidth: 64, frameHeight: 64, required: true },
      { id: 'accent', url: `./themes/${id}-accent.svg`, width: 64, height: 64, frameWidth: 64, frameHeight: 64, required: false },
    ],
    slots: { 'terrain.floor': visual([0]), 'terrain.solid': visual([1]), 'terrain.breakable': visual([2]),
      'bomb.idle': visual([3, 4, 5, 6], 6), 'hazard.fire': visual([7, 8, 9, 10], 8),
      'item.capacity': visual([11]), 'item.range': visual([12]), 'item.speed': visual([13]),
      'actor.player': visual([14]), 'actor.opponent': visual([15]), 'spawn.marker': visual([16]),
      'decoration.accent': { ...visual([0]), resource: 'accent' },
    },
  };
}
export const builtinThemes = [theme('candy', '糖果乐园'), theme('factory', '玩具工厂')] as const;
