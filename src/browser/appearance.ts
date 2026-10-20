const palettes = {
  dark: { background: 0x142a43, surface: 0x1c3f57, selected: 0x24596c, border: 0x588198, ink: 0xf3fbf7, muted: 0xb4d0db, accent: 0xffd45e, warning: 0xffb09c, buttonInk: 0x243543 },
  light: { background: 0xf8f4e9, surface: 0xfffcf4, selected: 0xd0f4e8, border: 0xc6c8b6, ink: 0x103d4a, muted: 0x49636b, accent: 0x1f947c, warning: 0x9b3e20, buttonInk: 0xffffff },
};
let mode: keyof typeof palettes = 'dark';
try { if (localStorage.getItem('fakebombit-appearance') === 'light') mode = 'light'; } catch { /* Storage may be disabled. */ }
export const appearance = () => ({ mode, ...palettes[mode] });
export const hex = (value: number) => `#${value.toString(16).padStart(6, '0')}`;
function apply(): void {
  document.documentElement.dataset.appearance = mode;
  for (const [name, value] of Object.entries(palettes[mode])) document.documentElement.style.setProperty(`--ui-${name}`, hex(value));
}
export function toggleAppearance(): void {
  mode = mode === 'dark' ? 'light' : 'dark'; apply();
  try { localStorage.setItem('fakebombit-appearance', mode); } catch { /* The setting still works for this visit. */ }
}
apply();
