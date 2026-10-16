import Phaser from 'phaser';
import { createResourcePreparation, type ReadyTheme, type ThemePackage } from '../resources/index.js';

// Application lifetime images and textures survive run disposal and menu returns.
export const resources = createResourcePreparation<HTMLImageElement>(resource => new Promise((resolve, reject) => {
  const image = new Image();
  const timeout = window.setTimeout(() => { image.src = ''; reject(new Error(`${resource.id}: 加载超时`)); }, 10000);
  image.onload = () => {
    window.clearTimeout(timeout);
    const delay = Math.min(5000, Math.max(0, Number(new URLSearchParams(location.search).get('loadDelay')) || 0));
    window.setTimeout(() => resolve({ value: image, width: image.naturalWidth, height: image.naturalHeight }), delay);
  };
  image.onerror = () => { window.clearTimeout(timeout); reject(new Error(`${resource.id}: 无法加载 ${resource.url}`)); };
  image.src = resource.url;
}));

export function installTextures(scene: Phaser.Scene, theme: ReadyTheme<HTMLImageElement>): void {
  for (const resource of theme.package.resources) {
    const image = theme.images[resource.id];
    if (image && !scene.textures.exists(image.key) && !scene.textures.addSpriteSheet(image.key, image.value, { frameWidth: resource.frameWidth, frameHeight: resource.frameHeight })) throw new Error(`${resource.id}: 无法创建纹理`);
  }
}

export function diagnosticPackage(theme: ThemePackage): ThemePackage {
  const mode = new URLSearchParams(location.search).get('resourceError');
  if (mode !== 'required' && mode !== 'optional' && mode !== 'skin') return theme;
  const resources = theme.resources.map(resource => (mode === 'skin' ? resource.id.startsWith('skin:') : resource.required === (mode === 'required'))
    ? { ...resource, url: `./themes/missing-${resource.id}.svg` } : resource);
  return { ...theme, resources,
    ...(theme.skin ? { skin: { ...theme.skin, resources: theme.skin.resources.map(resource => resources.find(image => image.id === resource.id)!) } } : {}),
  };
}
