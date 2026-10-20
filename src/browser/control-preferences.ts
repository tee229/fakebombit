export type JoystickMode = 'fixed' | 'floating';
export type MarginName = 'joystickLeft' | 'joystickBottom' | 'bombRight' | 'bombBottom';
export interface ControlPreferences {
  readonly mode: JoystickMode;
  readonly joystickLeft: number | null;
  readonly joystickBottom: number | null;
  readonly bombRight: number | null;
  readonly bombBottom: number | null;
}
const defaults: ControlPreferences = { mode: 'fixed', joystickLeft: null, joystickBottom: null, bombRight: null, bombBottom: null };
const key = 'fakebombit-controls-v1';
const marginNames: readonly MarginName[] = ['joystickLeft', 'joystickBottom', 'bombRight', 'bombBottom'];
let preferences = { ...defaults }, revision = 0;
try {
  const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
  if (saved && typeof saved === 'object') {
    if ('mode' in saved && saved.mode === 'floating') preferences.mode = 'floating';
    for (const name of marginNames) {
      const value = Reflect.get(saved, name);
      if (typeof value === 'number' && Number.isFinite(value)) preferences[name] = Math.round(Math.max(0, Math.min(240, value)));
    }
  }
} catch { /* Existing appearance/audio settings remain independent of new control fields. */ }
export const readControlPreferences = (): Readonly<ControlPreferences> => preferences;
export const controlRevision = () => revision;
export function updateControlPreferences(patch: Partial<ControlPreferences>): void {
  const next = { ...preferences };
  if (patch.mode === 'fixed' || patch.mode === 'floating') next.mode = patch.mode;
  for (const name of marginNames) {
    const value = patch[name];
    if (value === null || typeof value === 'number' && Number.isFinite(value)) next[name] = value === null ? null : Math.round(Math.max(0, Math.min(240, value)));
  }
  preferences = next; revision++;
  try { localStorage.setItem(key, JSON.stringify(preferences)); } catch { /* Changes still work for this visit. */ }
}
export const resetControlPreferences = () => updateControlPreferences(defaults);
