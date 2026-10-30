import { createResourcePreparation } from '../resources/index.js';

export const iconNames = ['pause', 'play', 'settings', 'sun', 'moon', 'layers', 'close', 'bomb', 'up', 'down', 'left', 'right', 'retry', 'home'] as const;
export type IconName = typeof iconNames[number];
export class Images {
  private readonly pending = new Map<string, Promise<WechatMinigame.Image>>();
  private readonly ready = new Map<string, WechatMinigame.Image>();
  constructor(private readonly host: Pick<WechatMinigame.Wx, 'createImage'>) {}
  load(path: string): Promise<WechatMinigame.Image> {
    const url = path.replace(/^\.\//, '').replace(/\.svg$/, '.png');
    const cached = this.pending.get(url);
    if (cached) return cached;
    const promise = new Promise<WechatMinigame.Image>((resolve, reject) => {
      const image = this.host.createImage();
      const timer = setTimeout(() => { image.onload = () => {}; image.onerror = () => {}; reject(new Error(`资源加载超时：${url}`)); }, 12000);
      image.onload = () => { clearTimeout(timer); this.ready.set(url, image); resolve(image); };
      image.onerror = () => { clearTimeout(timer); reject(new Error(`无法加载资源：${url}`)); };
      image.src = url;
    }).catch((error: unknown) => { this.pending.delete(url); throw error; });
    this.pending.set(url, promise);
    return promise;
  }
  get(path: string): WechatMinigame.Image | undefined { return this.ready.get(path); }
  get count(): number { return this.ready.size; }
  async prepareMenu(): Promise<void> {
    await Promise.all(['ui/menu-dark.jpg', 'ui/menu-light.jpg', 'ui/wordmark.png', 'skins/mint-preview.png', 'skins/coral-preview.png',
      ...['candy', 'factory'].flatMap(id => [`themes/${id}-preview.png`, `themes/${id}-dark-preview.png`]),
      ...iconNames.flatMap(icon => ['dark', 'light'].map(mode => `icons/${icon}-${mode}.png`)),
    ].map(path => this.load(path)));
  }
  preparation() {
    return createResourcePreparation<WechatMinigame.Image>(async resource => {
      const value = await this.load(resource.url);
      return { value, width: value.width, height: value.height };
    });
  }
}
/** The platform's Image has the same drawImage surface; the assertion is type-only. */
export function drawImage(context: CanvasRenderingContext2D, image: WechatMinigame.Image | WechatMinigame.Canvas, ...coordinates: [number, number, number, number] | [number, number, number, number, number, number, number, number]): void {
  const source = image as unknown as CanvasImageSource;
  if (coordinates.length === 4) context.drawImage(source, ...coordinates);
  else context.drawImage(source, ...coordinates);
}
