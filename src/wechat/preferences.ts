import type { AppearanceMode } from '../resources/index.js';

export type Margin = 'joystickLeft' | 'joystickBottom' | 'bombRight' | 'bombBottom';
export const margins: readonly Margin[] = ['joystickLeft', 'joystickBottom', 'bombRight', 'bombBottom'];
export interface Controls { mode: 'fixed' | 'floating'; joystickLeft: number | null; joystickBottom: number | null; bombRight: number | null; bombBottom: number | null }
export interface Settings { appearance: AppearanceMode; volume: number; musicVolume: number; particleBudget: number; reducedMotion: boolean; controls: Controls }
const defaultControls = (): Controls => ({ mode: 'fixed', joystickLeft: null, joystickBottom: null, bombRight: null, bombBottom: null });
type Storage = Pick<WechatMinigame.Wx, 'getStorageSync' | 'setStorageSync'>;
const clamp = (v: number, max = 1) => Math.max(0, Math.min(max, v));
export class Preferences {
  private value: Settings = { appearance: 'dark', volume: .45, musicVolume: .35, particleBudget: 96, reducedMotion: false, controls: defaultControls() };
  constructor(private readonly storage: Storage) {
    const read = (key: string): unknown => { try { const v: unknown = storage.getStorageSync(key); return typeof v === 'string' && v.startsWith('{') ? JSON.parse(v) : v; } catch { return null; } };
    const appearance = read('fakebombit-appearance');
    if (appearance === 'light') this.value.appearance = appearance;
    const audio = read('fakebombit-feedback-v1');
    if (audio && typeof audio === 'object') {
      for (const key of ['volume', 'musicVolume'] as const) { const v: unknown = Reflect.get(audio, key); if (typeof v === 'number' && Number.isFinite(v)) this.value[key] = clamp(v); }
      const budget: unknown = Reflect.get(audio, 'particleBudget'); if (typeof budget === 'number' && [0, 32, 96].includes(budget)) this.value.particleBudget = budget;
      this.value.reducedMotion = Reflect.get(audio, 'reducedMotion') === true;
    }
    const controls = read('fakebombit-controls-v1');
    if (controls && typeof controls === 'object') {
      if (Reflect.get(controls, 'mode') === 'floating') this.value.controls.mode = 'floating';
      for (const key of margins) { const v: unknown = Reflect.get(controls, key); if (typeof v === 'number' && Number.isFinite(v)) this.value.controls[key] = Math.round(clamp(v, 240)); }
    }
  }
  read(): Readonly<Settings> { return Object.freeze({ ...this.value, controls: Object.freeze({ ...this.value.controls }) }); }
  update(patch: Partial<Omit<Settings, 'controls'>>, controls?: Partial<Controls>): void {
    const next = { ...this.value, controls: { ...this.value.controls } };
    if (patch.appearance === 'light' || patch.appearance === 'dark') next.appearance = patch.appearance;
    if (typeof patch.reducedMotion === 'boolean') next.reducedMotion = patch.reducedMotion;
    for (const key of ['volume', 'musicVolume'] as const) { const v = patch[key]; if (typeof v === 'number' && Number.isFinite(v)) next[key] = clamp(v); }
    if (patch.particleBudget !== undefined && [0, 32, 96].includes(patch.particleBudget)) next.particleBudget = patch.particleBudget;
    if (controls?.mode === 'fixed' || controls?.mode === 'floating') next.controls.mode = controls.mode;
    for (const key of margins) { const v = controls?.[key]; if (v === null || typeof v === 'number' && Number.isFinite(v)) next.controls[key] = v === null ? null : Math.round(clamp(v, 240)); }
    this.value = next;
    try {
      this.storage.setStorageSync('fakebombit-appearance', next.appearance);
      this.storage.setStorageSync('fakebombit-controls-v1', next.controls);
      this.storage.setStorageSync('fakebombit-feedback-v1', { volume: next.volume, musicVolume: next.musicVolume, particleBudget: next.particleBudget, reducedMotion: next.reducedMotion });
    } catch { /* Preferences remain usable for this run if native storage is unavailable. */ }
  }
  resetControls(): void { this.update({}, defaultControls()); }
}
