import type { SkinClip, SkinPackage, SkinAction } from './index.js';

function skin(id: string, label: string): SkinPackage {
  const clip = (start: number, count: number, fps: number, loop: boolean, flipX = false): SkinClip => ({
    resource: `skin:${id}`, frames: Array.from({ length: count }, (_, index) => start + index), framesPerSecond: fps, loop, flipX,
    facing: 'none', referenceSize: { width: 64, height: 64 }, anchor: { x: 0.5, y: 0.8125 }, offset: { x: 0, y: 16 },
  });
  const directions = (action: SkinAction) => {
    const timing: Record<SkinAction, readonly [number, number, number]> = { idle: [0, 4, 4], move: [4, 6, 12], eliminated: [10, 6, 12] };
    const [start, count, fps] = timing[action];
    return { down: clip(start, count, fps, action !== 'eliminated'), right: clip(16 + start, count, fps, action !== 'eliminated'),
      up: clip(32 + start, count, fps, action !== 'eliminated'), left: clip(16 + start, count, fps, action !== 'eliminated', true) };
  };
  return { format: 'builtin-skin-v1', id, label,
    resources: [{ id: `skin:${id}`, url: `./skins/${id}-atlas.svg`, width: 512, height: 384, frameWidth: 64, frameHeight: 64, required: true }],
    animations: { idle: directions('idle'), move: directions('move'), eliminated: directions('eliminated') },
  };
}

export const builtinSkins = [skin('mint', '薄荷兔'), skin('coral', '珊瑚机甲')] as const;
