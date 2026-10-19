const palettes = {
  dark: { background: 0x102b2c, surface: 0x173737, selected: 0x24483f, border: 0x79958c, ink: 0xeaf3ed, muted: 0xb8d1c6, accent: 0x83dfb6, warning: 0xffaf8c, buttonInk: 0x102b2c },
  light: { background: 0xeef3eb, surface: 0xffffff, selected: 0xd6e9dc, border: 0x59766a, ink: 0x163c35, muted: 0x466458, accent: 0x176b4d, warning: 0x9b3e20, buttonInk: 0xffffff },
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
